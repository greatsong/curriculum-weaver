#!/usr/bin/env python3
"""
고등학교 공통과목 성취기준 추출 스크립트

기존 parse-curriculum-pdf.py는 [12물리01-01] 형식(2세그먼트)만 처리하여
[10통과1-01-01] 형식(3세그먼트) 공통과목 코드를 놓쳤습니다.

이 스크립트는 10-prefix 3세그먼트 코드를 추출합니다.

사용법:
  python3 scripts/extract-common-subjects.py

출력: server/data/standards_common.js (fusion-planner 호환 ES6 모듈)
"""

import re
import json
import sys
import os
from collections import Counter

import pdfplumber

# ─── 3세그먼트 코드 패턴 ───
# [10통과1-01-01], [12체육1-01-02] 등
# 가운뎃점 유니코드 변형 대응: · (U+00B7), ⋅ (U+22C5), ∙ (U+2219)
CODE_PATTERN_3SEG = re.compile(r'\[(\d{2}[가-힣·⋅∙]+\d+-\d{2}-\d{2})\]')

# ─── 공통과목 매핑 ───
COMMON_SUBJECT_MAP = {
    # 과학 (10-prefix)
    '통과1': {'subject': '통합과학1', 'subject_group': '과학', 'curriculum_category': '공통'},
    '통과2': {'subject': '통합과학2', 'subject_group': '과학', 'curriculum_category': '공통'},
    '과탐1': {'subject': '과학탐구실험1', 'subject_group': '과학', 'curriculum_category': '공통'},
    '과탐2': {'subject': '과학탐구실험2', 'subject_group': '과학', 'curriculum_category': '공통'},
    '과탐': {'subject': '과학탐구실험', 'subject_group': '과학', 'curriculum_category': '공통'},
    # 사회 (10-prefix)
    '통사1': {'subject': '통합사회1', 'subject_group': '사회', 'curriculum_category': '공통'},
    '통사2': {'subject': '통합사회2', 'subject_group': '사회', 'curriculum_category': '공통'},
    '한사1': {'subject': '한국사1', 'subject_group': '사회', 'curriculum_category': '공통'},
    '한사2': {'subject': '한국사2', 'subject_group': '사회', 'curriculum_category': '공통'},
    # 국어 (10-prefix)
    '공국1': {'subject': '공통국어1', 'subject_group': '국어', 'curriculum_category': '공통'},
    '공국2': {'subject': '공통국어2', 'subject_group': '국어', 'curriculum_category': '공통'},
    # 수학 (10-prefix)
    '공수1': {'subject': '공통수학1', 'subject_group': '수학', 'curriculum_category': '공통'},
    '공수2': {'subject': '공통수학2', 'subject_group': '수학', 'curriculum_category': '공통'},
    '기수1': {'subject': '기본수학1', 'subject_group': '수학', 'curriculum_category': '공통'},
    '기수2': {'subject': '기본수학2', 'subject_group': '수학', 'curriculum_category': '공통'},
    # 영어 (10-prefix)
    '공영1': {'subject': '공통영어1', 'subject_group': '영어', 'curriculum_category': '공통'},
    '공영2': {'subject': '공통영어2', 'subject_group': '영어', 'curriculum_category': '공통'},
    '기영1': {'subject': '기본영어1', 'subject_group': '영어', 'curriculum_category': '공통'},
    '기영2': {'subject': '기본영어2', 'subject_group': '영어', 'curriculum_category': '공통'},
    # 체육 (12-prefix 3세그먼트)
    '체육1': {'subject': '체육1', 'subject_group': '체육', 'curriculum_category': '공통'},
    '체육2': {'subject': '체육2', 'subject_group': '체육', 'curriculum_category': '공통'},
    '스생1': {'subject': '스포츠 생활1', 'subject_group': '체육', 'curriculum_category': '일반선택'},
    '스생2': {'subject': '스포츠 생활2', 'subject_group': '체육', 'curriculum_category': '일반선택'},
}

# ─── 영역(area) 이름 매핑 ───
# 키: (과목약칭, 영역번호), 값: 영역명
# 2022 개정 교육과정 PDF에서 추출한 공식 영역명
AREA_MAP = {
    # 과학탐구실험
    ('과탐1', '01'): '과학의 본성과 역사 속의 과학 탐구',
    ('과탐1', '02'): '과학 탐구의 과정과 절차',
    ('과탐2', '01'): '생활 속의 과학 탐구',
    ('과탐2', '02'): '미래 사회와 첨단 과학 탐구',
    # 통합과학
    ('통과1', '01'): '과학의 기초',
    ('통과1', '02'): '물질과 규칙성',
    ('통과1', '03'): '시스템과 상호작용',
    ('통과2', '01'): '변화와 다양성',
    ('통과2', '02'): '환경과 에너지',
    ('통과2', '03'): '과학과 미래 사회',
    # 통합사회
    ('통사1', '01'): '통합적 관점',
    ('통사1', '02'): '인간, 사회, 환경과 행복',
    ('통사1', '03'): '자연환경과 인간',
    ('통사1', '04'): '문화와 다양성',
    ('통사1', '05'): '생활공간과 사회',
    ('통사2', '01'): '인권보장과 헌법',
    ('통사2', '02'): '사회정의와 불평등',
    ('통사2', '03'): '시장경제와 지속가능발전',
    ('통사2', '04'): '세계화와 평화',
    ('통사2', '05'): '미래와 지속가능한 삶',
    # 한국사
    ('한사1', '01'): '근대 이전 한국사의 이해',
    ('한사1', '02'): '근대 이전 한국사의 탐구',
    ('한사1', '03'): '근대 국가 수립의 노력',
    ('한사2', '01'): '일제 식민 통치와 민족운동',
    ('한사2', '02'): '대한민국의 발전',
    ('한사2', '03'): '오늘날의 대한민국',
    # 공통국어
    ('공국1', '01'): '듣기·말하기',
    ('공국1', '02'): '읽기',
    ('공국1', '03'): '쓰기',
    ('공국1', '04'): '문법',
    ('공국1', '05'): '문학',
    ('공국1', '06'): '매체',
    ('공국2', '01'): '듣기·말하기',
    ('공국2', '02'): '읽기',
    ('공국2', '03'): '쓰기',
    ('공국2', '04'): '문법',
    ('공국2', '05'): '문학',
    ('공국2', '06'): '매체',
    # 공통수학
    ('공수1', '01'): '다항식',
    ('공수1', '02'): '방정식과 부등식',
    ('공수1', '03'): '경우의 수',
    ('공수1', '04'): '행렬',
    ('공수2', '01'): '도형의 방정식',
    ('공수2', '02'): '집합과 명제',
    ('공수2', '03'): '함수와 그래프',
    # 기본수학
    ('기수1', '01'): '다항식',
    ('기수1', '02'): '방정식과 부등식',
    ('기수1', '03'): '경우의 수',
    ('기수1', '04'): '행렬',
    ('기수2', '01'): '도형의 방정식',
    ('기수2', '02'): '집합과 명제',
    ('기수2', '03'): '함수와 그래프',
    # 공통영어
    ('공영1', '01'): '이해',
    ('공영1', '02'): '표현',
    ('공영2', '01'): '이해',
    ('공영2', '02'): '표현',
    # 기본영어
    ('기영1', '01'): '이해',
    ('기영1', '02'): '표현',
    ('기영2', '01'): '이해',
    ('기영2', '02'): '표현',
    # 체육
    ('체육1', '01'): '건강 관리',
    ('체육1', '02'): '전략형 스포츠',
    ('체육1', '03'): '생태형 스포츠',
    ('체육2', '01'): '체력 증진',
    ('체육2', '02'): '기술형 스포츠',
    ('체육2', '03'): '표현 활동',
    # 스포츠 생활
    ('스생1', '01'): '영역형 스포츠',
    ('스생1', '02'): '생활·자연환경형 스포츠',
    ('스생2', '01'): '네트형 스포츠',
    ('스생2', '02'): '필드형 스포츠',
}

# ─── PDF 소스 ───
PDF_SOURCES = [
    {'path': os.path.expanduser('~/Downloads/[별책9] 과학과 교육과정 (1).pdf'), 'family': '과학'},
    {'path': os.path.expanduser('~/Downloads/[별책7] 사회과 교육과정 (3).pdf'), 'family': '사회'},
    {'path': os.path.expanduser('~/Downloads/[별책5] 국어과 교육과정.pdf'), 'family': '국어'},
    {'path': os.path.expanduser('~/Downloads/[별책8] 수학과 교육과정.pdf'), 'family': '수학'},
    {'path': os.path.expanduser('~/Downloads/[별책14] 영어과 교육과정.pdf'), 'family': '영어'},
    {'path': os.path.expanduser('~/Downloads/[별책11] 체육과 교육과정.pdf'), 'family': '체육'},
]

# ─── 조사 제거 ───
SUFFIX_PATTERNS = [
    '에서는', '으로서', '으로써', '에서의', '로부터', '이라는', '에게서',
    '만으로', '과의', '와의',
    '으로', '에서', '에게', '까지', '부터', '에는', '에도', '으며',
    '하고', '하며', '하여', '해서', '에의', '와는', '과는',
    '이며', '이고', '이나', '라는', '라고',
    '한다', '된다', '있다', '없다', '않다',
    '하기', '하는', '되는', '있는', '없는',
    '은', '는', '이', '가', '을', '를', '에', '서', '의', '로',
    '와', '과', '도', '만', '며', '고', '나',
]

STOP_WORDS = {
    '할', '수', '있다', '한다', '등', '및', '또는', '그리고', '이를', '것을',
    '통해', '위한', '대한', '대해', '관한', '바탕', '위해', '가지', '대하여',
    '있는', '하는', '되는', '것이', '하여', '하고', '한다', '된다', '이다',
    '따른', '위하여', '이상', '이하', '대하', '같은', '다른', '다양한',
    '중심', '중심으로', '바탕으로', '활용', '이해', '분석', '설명',
    '비교', '탐색', '탐구', '인식', '판단', '평가', '공유',
    '실천', '설계', '구성', '구현', '작성', '수행', '적용',
    '해결', '발견', '수집', '관리', '해석', '구별', '구분',
    '개념', '특성', '특징', '종류', '방법', '방안', '과정',
    '사례', '문제', '상황', '결과', '영향', '변화', '가치',
    '필요성', '중요성', '역할',
}


def strip_particles(word, max_rounds=3):
    """단어에서 조사와 어미를 반복 제거합니다."""
    for _ in range(max_rounds):
        changed = False
        for suffix in SUFFIX_PATTERNS:
            if word.endswith(suffix) and len(word) > len(suffix) + 1:
                word = word[:-len(suffix)]
                changed = True
                break
        if not changed:
            break
    return word


def extract_keywords(content, n=5):
    text = re.sub(r'[.,;:!?""\'\'()[\]⋅·\-•\n\r]', ' ', content)
    text = re.sub(r'\s+', ' ', text).strip()
    words = text.split()
    result = []
    seen = set()
    for w in words:
        w = strip_particles(w)
        if len(w) >= 2 and w not in STOP_WORDS and w not in seen:
            if re.match(r'^[가-힣a-zA-Z0-9]+$', w):
                result.append(w)
                seen.add(w)
        if len(result) >= n:
            break
    return result


def parse_code_parts(code):
    """3-segment 코드에서 (과목약칭, 영역번호)를 추출합니다.

    예: '10통과1-01-02' → ('통과1', '01')
        '12체육1-02-03' → ('체육1', '02')
    선행 0 제거: '10과탐02-01-01' → ('과탐2', '01')
    """
    m = re.match(r'^(\d{2})([가-힣·⋅∙]+\d+)-(\d{2})-\d{2}$', code)
    if not m:
        return None, None
    subj_key = m.group(2)
    area_num = m.group(3)
    # 선행 0 정규화: 과탐02 → 과탐2
    subj_key = re.sub(r'(\D)0+(\d)', r'\1\2', subj_key)
    return subj_key, area_num


def parse_3seg_code(code):
    """3-segment 코드(10-prefix 또는 12-prefix)를 분석하여 과목 메타데이터를 반환"""
    # 10-prefix: [10통과1-01-01], 12-prefix: [12체육1-01-01]
    m = re.match(r'^(\d{2})([가-힣·]+\d+)', code)
    if not m:
        m = re.match(r'^(\d{2})([가-힣·]+)', code)
    if not m:
        return None

    prefix = m.group(1)
    subj_key = m.group(2)

    # 긴 키부터 매칭
    for key in sorted(COMMON_SUBJECT_MAP.keys(), key=len, reverse=True):
        if subj_key.startswith(key):
            meta = COMMON_SUBJECT_MAP[key].copy()
            # 10-prefix는 고공통, 12-prefix는 매핑에 따름
            if prefix == '10':
                meta['grade_group'] = '고공통'
            else:
                meta['grade_group'] = '고선택' if meta['curriculum_category'] != '공통' else '고공통'
            return meta

    return None


def clean_pdf_text(text):
    """PDF 추출 텍스트에서 아티팩트를 제거합니다."""
    text = re.sub(r'---\s*PAGE\s*\d+\s*---[^\n]*', '', text)
    text = re.sub(
        r'^\s*\d{1,3}\s+(?:공통 교육과정|선택 중심 교육과정[^\n]*|[가-힣]+과 교육과정)\s*$',
        '', text, flags=re.MULTILINE
    )
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text


def extract_application_notes_by_code_tracking(full_text):
    """코드 추적 방식으로 영역별 application_notes를 추출합니다.

    텍스트를 순차적으로 읽으면서:
    1. 성취기준 코드([10XX-NN-MM])가 나타나면 현재 과목/영역을 갱신
    2. "(나) 성취기준 적용 시 고려 사항" 헤더를 만나면
       다음 영역/섹션 시작까지의 텍스트를 해당 (과목, 영역)의 notes로 수집

    반환: dict[(subj_key, area_num)] → notes_text
    """
    # "(나) 성취기준 적용 시 고려 사항" 헤더 패턴
    notes_header_pat = re.compile(
        r'(?:㈏|\(나\))\s*성취기준\s*적용\s*시\s*고려\s*사항'
    )
    # 영역/섹션 경계 패턴 (다음 영역, 다음 해설, 다음 적용사항, 과목 헤더 등)
    section_boundary_pat = re.compile(
        r'(?:^\s*\(\d+\)\s+[가-힣])'       # (N) 영역이름
        r'|(?:(?:㈎|\(가\))\s*성취기준\s*해설)'  # (가) 성취기준 해설
        r'|(?:(?:㈏|\(나\))\s*성취기준\s*적용\s*시\s*고려\s*사항)',  # 다음 (나)
        re.MULTILINE
    )

    notes_map = {}  # (subj_key, area_num) → notes_text

    # 모든 notes 헤더 위치 찾기
    notes_headers = list(notes_header_pat.finditer(full_text))
    if not notes_headers:
        return notes_map

    for nh_idx, nh_match in enumerate(notes_headers):
        nh_pos = nh_match.start()

        # 이 notes 헤더 앞에 나타난 마지막 성취기준 코드로 과목/영역 판별
        # 헤더 앞 텍스트에서 모든 코드를 찾고 마지막 것을 사용
        text_before = full_text[:nh_pos]
        codes_before = list(CODE_PATTERN_3SEG.finditer(text_before))
        if not codes_before:
            continue

        last_code = codes_before[-1].group(1)
        subj_key, area_num = parse_code_parts(last_code)
        if not subj_key:
            continue

        # notes 본문: 헤더 끝 ~ 다음 섹션 경계까지
        notes_start = nh_match.end()

        # 다음 섹션 경계 찾기 (notes 헤더 이후)
        remaining = full_text[notes_start:]
        boundary = section_boundary_pat.search(remaining)
        if boundary:
            notes_end = notes_start + boundary.start()
        else:
            # 경계가 없으면 다음 notes 헤더까지, 또는 끝까지
            if nh_idx + 1 < len(notes_headers):
                notes_end = notes_headers[nh_idx + 1].start()
            else:
                notes_end = min(notes_start + 5000, len(full_text))

        notes_text = full_text[notes_start:notes_end].strip()
        # 성취기준 코드 참조 제거 (본문에 [10XX-NN-MM] 형태로 인용된 것)
        notes_text = re.sub(r'\[\d{2}[가-힣·⋅∙]+\d+-\d{2}-\d{2}\]', '', notes_text)
        # 줄바꿈/다중공백 정리
        notes_text = re.sub(r'\s+', ' ', notes_text).strip()

        # 선행 불릿 기호 제거 (• ◦ ∙ ⋅ · -)
        notes_text = re.sub(r'^[•◦∙⋅·\-]\s*', '', notes_text)

        if notes_text and len(notes_text) > 20:
            key = (subj_key, area_num)
            # 더 긴 텍스트 우선 (같은 영역이 여러 번 나타날 경우)
            if key not in notes_map or len(notes_text) > len(notes_map[key]):
                notes_map[key] = notes_text

    return notes_map


def extract_from_pdf(pdf_path, family):
    """PDF에서 3-segment 공통과목 성취기준을 추출"""
    print(f'\n📄 {family}: {os.path.basename(pdf_path)}')

    with pdfplumber.open(pdf_path) as pdf:
        full_text = ''
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                full_text += text + '\n'
    full_text = clean_pdf_text(full_text)

    print(f'  텍스트: {len(full_text):,}자')

    # 모든 3-segment 코드 위치 찾기
    matches = list(CODE_PATTERN_3SEG.finditer(full_text))
    print(f'  3-segment 코드 발견: {len(matches)}개')

    standards = {}
    explanations = {}

    # ─── 코드 추적 방식으로 영역별 application_notes 추출 ───
    area_notes = extract_application_notes_by_code_tracking(full_text)
    print(f'  영역별 적용사항: {len(area_notes)}개')

    # 섹션 헤더 위치 사전 추적 (해설/적용사항 영역 판별용)
    explanation_headers = sorted([m.start() for m in re.finditer(
        r'(?:㈎|\(가\))?\s*성취기준\s*해설', full_text
    )])
    notes_headers = sorted([m.start() for m in re.finditer(
        r'(?:㈏|\(나\))?\s*성취기준\s*적용\s*시\s*고려\s*사항', full_text
    )])
    area_headers = sorted([m.start() for m in re.finditer(
        r'^\s*\(\d+\)\s+[가-힣]', full_text, re.MULTILINE
    )])

    # 모든 섹션 헤더를 통합 정렬
    all_section_headers = sorted(
        [(pos, 'explanation') for pos in explanation_headers] +
        [(pos, 'notes') for pos in notes_headers] +
        [(pos, 'content') for pos in area_headers]
    )
    section_ranges = []
    for idx, (pos, typ) in enumerate(all_section_headers):
        end = all_section_headers[idx + 1][0] if idx + 1 < len(all_section_headers) else len(full_text)
        section_ranges.append((pos, end, typ))

    def find_section(pos):
        for s_start, s_end, s_type in section_ranges:
            if s_start <= pos < s_end:
                return s_type
        return 'content'

    for i, m in enumerate(matches):
        code = m.group(1)
        full_code = m.group(0)
        start = m.start()

        # 다음 코드까지의 텍스트 (마지막 코드는 최대 5000자까지 허용)
        if i + 1 < len(matches):
            next_start = matches[i + 1].start()
        else:
            next_start = min(start + 5000, len(full_text))
        text_after = full_text[start + len(full_code):next_start].strip()

        # 섹션 판별 (사전 추적된 헤더 위치 기반)
        section = find_section(start)
        is_explanation = section == 'explanation'
        is_notes = section == 'notes'

        # 본문 추출 — 다음 코드, 섹션 경계, 탐구 활동까지
        content = re.split(
            r'\n{2,}|\[\d{2}[가-힣·⋅∙]+\d+-\d{2}-\d{2}\]|<탐구\s*활동>|[㈎㈏]|'
            r'\(가\)\s*성취기준|\(나\)\s*성취기준|성취기준\s*해설|성취기준\s*적용\s*시',
            text_after
        )[0].strip()
        # 코드 형태 문자열 제거 (범위 표기 등)
        content = re.sub(r'\[\d{2}[가-힣·]+\d+-\d{2}-\d{2}\]', '', content).strip()
        # 줄바꿈을 공백으로
        content = re.sub(r'\s+', ' ', content).strip()

        if is_explanation and content and len(content) > 10:
            if code not in explanations or len(content) > len(explanations[code]):
                explanations[code] = content
        elif not is_notes and content and len(content) > 5:
            # notes 섹션의 코드는 본문이 아니므로 무시 (notes는 area_notes에서 처리)
            # 더 긴 content를 우선 (요약 표의 짧은 설명보다 상세 본문 우선)
            if code not in standards or len(content) > len(standards[code]):
                standards[code] = content

    # 결과 빌드
    results = []
    for code, content in sorted(standards.items()):
        meta = parse_3seg_code(code)
        if not meta:
            print(f'  ⚠️ 매핑 실패: [{code}]')
            continue

        # 코드에서 과목약칭, 영역번호 추출하여 area와 notes 조회
        subj_key, area_num = parse_code_parts(code)
        area_name = AREA_MAP.get((subj_key, area_num), '') if subj_key else ''
        notes_text = area_notes.get((subj_key, area_num), '') if subj_key else ''

        results.append({
            'code': f'[{code}]',
            'subject_group': meta['subject_group'],
            'subject': meta['subject'],
            'grade_group': meta.get('grade_group', '고공통'),
            'school_level': '고등학교',
            'curriculum_category': meta['curriculum_category'],
            'area': area_name,
            'domain': '',
            'content': content,
            'keywords': extract_keywords(content),
            'explanation': explanations.get(code, ''),
            'application_notes': notes_text,
        })

    # 통계
    by_subject = Counter(s['subject'] for s in results)
    empty_areas = sum(1 for s in results if not s['area'])
    empty_notes = sum(1 for s in results if not s['application_notes'])
    print(f'  추출 완료: {len(results)}개')
    for subj, count in sorted(by_subject.items()):
        print(f'    {subj}: {count}개')
    if empty_areas:
        print(f'  ⚠️ area 빈칸: {empty_areas}개')
    if empty_notes:
        print(f'  ⚠️ application_notes 빈칸: {empty_notes}개')

    return results


def main():
    all_standards = []

    for source in PDF_SOURCES:
        if not os.path.exists(source['path']):
            print(f'⚠️ 파일 없음: {source["path"]}')
            continue
        standards = extract_from_pdf(source['path'], source['family'])
        all_standards.extend(standards)

    print(f'\n{"=" * 50}')
    print(f'📊 전체 결과: {len(all_standards)}개 공통과목 성취기준')

    by_group = Counter(s['subject_group'] for s in all_standards)
    by_subject = Counter(s['subject'] for s in all_standards)
    print(f'\n교과군별:')
    for g, c in sorted(by_group.items()):
        print(f'  {g}: {c}개')
    print(f'\n과목별:')
    for s, c in sorted(by_subject.items()):
        print(f'  {s}: {c}개')

    # JS 모듈 출력 (fusion-planner 호환)
    output_path = os.path.join(os.path.dirname(__file__), '..', 'server', 'data', 'standards_common.js') if '--fusion' in sys.argv else 'common_standards.js'

    # fusion-planner 경로로 직접 출력
    fusion_path = os.path.expanduser('~/greatsong-project/fusion-planner/server/data/standards_common.js')
    os.makedirs(os.path.dirname(fusion_path), exist_ok=True)

    with open(fusion_path, 'w', encoding='utf-8') as f:
        f.write('/**\n')
        f.write(f' * 고등학교 공통과목 성취기준 데이터 (자동 생성)\n')
        f.write(f' * 총 {len(all_standards)}개 성취기준\n')
        f.write(f' * 과목: {", ".join(sorted(by_subject.keys()))}\n')
        f.write(f' * 생성 스크립트: scripts/extract-common-subjects.py\n')
        f.write(' */\n\n')
        f.write('export const COMMON_STANDARDS = ')
        f.write(json.dumps(all_standards, ensure_ascii=False, indent=2))
        f.write('\n')

    print(f'\n✅ 출력 완료: {fusion_path}')

    # JSON 출력도 (curriculum-weaver용)
    json_path = os.path.join(os.path.dirname(__file__), 'common_standards.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump({'standards': all_standards, 'links': []}, f, ensure_ascii=False, indent=2)
    print(f'✅ JSON 출력: {json_path}')


if __name__ == '__main__':
    main()
