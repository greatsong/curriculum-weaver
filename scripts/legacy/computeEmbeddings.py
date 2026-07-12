"""
교육과정 성취기준 임베딩 사전 계산
- 한국어 특화 sentence-transformers 모델 사용
- UMAP 3D 차원축소 (sparse 분포 — 그래프 시각화 최적화)
- 내용 기반 유사도로 배치 (교과명 제거)
- 결과를 embeddings-cache.json으로 저장
"""

import json
import numpy as np
from sentence_transformers import SentenceTransformer
from umap import UMAP
import os

# 경로 설정
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STANDARDS_FILE = os.path.join(BASE_DIR, 'server', 'data', 'standards.js')
SOCIAL_FILE = os.path.join(BASE_DIR, 'server', 'data', 'standards_social.js')
CACHE_FILE = os.path.join(BASE_DIR, 'server', 'data', 'embeddings-cache.json')

def load_standards_from_js(filepath):
    """JS 파일에서 성취기준 배열 추출"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # export const XXX = [...] 패턴에서 JSON 배열 추출
    start = content.index('[')
    end = content.rindex(']') + 1
    json_str = content[start:end]
    return json.loads(json_str)

def main():
    print("1. 성취기준 데이터 로드...")
    # Node.js에서 사전 추출한 JSON 사용
    json_path = '/tmp/all_standards.json'
    if not os.path.exists(json_path):
        print(f"   ❌ {json_path} 없음. 먼저 node /tmp/export_standards_json.mjs 실행")
        return
    with open(json_path, 'r', encoding='utf-8') as f:
        merged = json.load(f)

    print(f"   총 {len(merged)}개 성취기준")

    # 교과군별 통계
    groups = {}
    for s in merged:
        sg = s.get('subject_group', s.get('subject', ''))
        groups[sg] = groups.get(sg, 0) + 1
    for sg, cnt in sorted(groups.items(), key=lambda x: -x[1]):
        print(f"   {sg}: {cnt}개")

    print("\n2. 임베딩 텍스트 준비...")
    # 각 성취기준의 임베딩 입력 텍스트: 교과+영역+내용+키워드
    texts = []
    codes = []
    for s in merged:
        subject = s.get('subject', '')
        area = s.get('area', '')
        content = s.get('content', '').replace('\n', ' ')
        keywords = ' '.join(s.get('keywords', []))
        domain = s.get('domain', '')

        # 내용 중심으로 배치 (교과명 제거 → 교과 간 유사 개념이 가까이 위치)
        text = f"{area} {domain} {content} {keywords}"
        texts.append(text)
        codes.append(s['code'])

    print(f"   텍스트 샘플: {texts[0][:100]}...")

    print("\n3. Sentence-Transformers 임베딩 계산...")
    # 다국어 모델 (한국어 우수)
    model = SentenceTransformer('intfloat/multilingual-e5-base')

    # e5 모델은 "query: " 또는 "passage: " prefix 필요
    prefixed_texts = [f"passage: {t}" for t in texts]

    embeddings = model.encode(
        prefixed_texts,
        show_progress_bar=True,
        batch_size=64,
        normalize_embeddings=True
    )

    print(f"   임베딩 차원: {embeddings.shape}")

    print("\n4. UMAP 3D 차원축소 (sparse 모드)...")
    # 그래프 시각화용 sparse 분포 설정
    # - min_dist 높음 → 노드 간 최소 거리 크게 유지 (밀집 방지)
    # - spread 높음 → 전체적으로 넓게 분포
    # - n_neighbors 낮음 → 로컬 구조 세밀하게 보존
    reducer = UMAP(
        n_components=3,
        n_neighbors=10,          # 적은 이웃 → 세밀한 로컬 구조
        min_dist=2.5,            # 높은 최소 거리 → sparse 분포
        spread=6.0,              # 넓은 스프레드 → 전체적으로 퍼짐
        metric='cosine',         # 코사인 유사도 사용
        random_state=42,
        n_epochs=500,            # 충분한 반복
    )

    coords_3d = reducer.fit_transform(embeddings)

    print(f"   3D 좌표 범위: X[{coords_3d[:,0].min():.2f}, {coords_3d[:,0].max():.2f}] "
          f"Y[{coords_3d[:,1].min():.2f}, {coords_3d[:,1].max():.2f}] "
          f"Z[{coords_3d[:,2].min():.2f}, {coords_3d[:,2].max():.2f}]")

    # 5. 교과군별 분리도 측정
    print("\n5. 교과군별 분리도 검증...")
    subject_groups = [s.get('subject_group', s.get('subject', '')) for s in merged]
    unique_groups = list(set(subject_groups))

    group_centroids = {}
    for sg in unique_groups:
        indices = [i for i, g in enumerate(subject_groups) if g == sg]
        centroid = coords_3d[indices].mean(axis=0)
        spread = coords_3d[indices].std(axis=0).mean()
        group_centroids[sg] = (centroid, spread, len(indices))

    # 교과군 간 평균 거리
    dists = []
    for i, sg1 in enumerate(unique_groups):
        for sg2 in unique_groups[i+1:]:
            c1, _, _ = group_centroids[sg1]
            c2, _, _ = group_centroids[sg2]
            dist = np.linalg.norm(c1 - c2)
            dists.append(dist)

    avg_inter_dist = np.mean(dists) if dists else 0
    avg_intra_spread = np.mean([s for _, s, _ in group_centroids.values()])
    separation_ratio = avg_inter_dist / (avg_intra_spread + 1e-6)

    print(f"   교과군 간 평균 거리: {avg_inter_dist:.2f}")
    print(f"   교과군 내 평균 분산: {avg_intra_spread:.2f}")
    print(f"   분리비: {separation_ratio:.2f} (높을수록 잘 분리됨)")

    # 6. 좌표 정규화 (-200 ~ 200 범위, 넓게)
    print("\n6. 좌표 정규화...")
    scale = 200
    mins = coords_3d.min(axis=0)
    maxs = coords_3d.max(axis=0)
    ranges = maxs - mins
    ranges[ranges == 0] = 1

    normalized = ((coords_3d - mins) / ranges - 0.5) * 2 * scale

    # 7. 캐시 파일 저장
    print("\n7. 캐시 파일 저장...")
    hash_str = ','.join(sorted(codes))
    coords_dict = {}
    for i, code in enumerate(codes):
        coords_dict[code] = {
            'x': round(float(normalized[i, 0]), 2),
            'y': round(float(normalized[i, 1]), 2),
            'z': round(float(normalized[i, 2]), 2),
        }

    cache_data = {
        'hash': hash_str,
        'coords': coords_dict,
        'meta': {
            'model': 'intfloat/multilingual-e5-base',
            'method': 'UMAP(n_neighbors=10, min_dist=2.5, spread=6.0, sparse)',
            'n_standards': len(codes),
            'separation_ratio': round(separation_ratio, 2),
        }
    }

    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache_data, f, ensure_ascii=False)

    file_size = os.path.getsize(CACHE_FILE)
    print(f"   저장: {CACHE_FILE}")
    print(f"   크기: {file_size / 1024:.0f}KB")
    print(f"\n✅ 완료! {len(codes)}개 성취기준의 3D 좌표 사전 계산됨")
    print(f"   모델: multilingual-e5-base (한국어 다국어)")
    print(f"   분리비: {separation_ratio:.2f}")

if __name__ == '__main__':
    main()
