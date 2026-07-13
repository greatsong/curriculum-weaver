# 누락 성취기준 복원 + 통합 — 완료 현황 (2026-07-13)

브랜치: `fix/standards-full-reconciliation` (origin/main 3c26135 기반 워크트리, 로컬만)

## 완료 (로컬)

| 단계 | 결과 |
|---|---|
| 정본 전수 원문 대조 (content) | 4,856 검증, 실오류 3 복원, 공백중복 2 제거 → **4,854** |
| ① 사회 선택과목 복원 | +195 (지리·역사·경제·정치 등 15과목) |
| ② 제2외국어·한문·예체능 복원 | +616 (제2외국어 32·한문 3·체육 5·음악 3·미술 3과목) |
| **정본 합계** | **5,665** (원문 정확일치, 중복 0, 필드 청정) |
| 임베딩 | 811건 생성 (text-embedding-3-small, 캐시 5,667) |
| 크로스교과 링크 판정 | 후보 2,809쌍(신규코드 한정, MIN_COS 0.55) → **채택 2,025** (published≥0.8 **524** / candidate 1,501) |

- 링크는 융합주제·수업아이디어 포함. 지리·기후·경제·역사·예체능 잘 연결(159개 신규코드 published 커버). 제2외국어·한문은 희소=타 교과와 의미 접점 적어 억지 연결 배제(과밀 방지).
- ③ 전문교과(492)는 **성능 이슈로 사용자 제외**.

## 배포 필요 (프로덕션 영향 — 승인 대상)

1. **standards.js 병합** (PR) → Railway 백엔드 자동 재배포 → 새 과목이 검색·그래프 노드로 등장(지리 문제 즉시 해소)
2. **Supabase `curriculum_links` 적재**: 2,025 candidate 삽입 → promote로 524 published (신규 교차교과 연결 라이브)
3. **graph3dLayout.json 재계산**(배포 후 라이브 /graph 대상) → 커밋·재배포 → 3D 성운에 새 노드 배치
4. 임베딩 캐시(로컬 dev 산출물, 143MB, 미배포)

## 별도 트랙 (오염 복원 — 사용자가 "분리" 선택, 미착수/부분)

- Round 1 content 3건·중복 2건 = **이미 위 standards.js에 포함**
- explanation 앞절단 **85건**(영어·예술계열) = 미적용 (원문 복원 준비됨)
- 수입 유령 링크 Supabase remap = 스크립트 준비됨(`remap-ghost-links.mjs`)

## 산출 스크립트 (scripts/reconcile/)
build-groundtruth·compare-content·compare-expl·build-subject-map·compose-records·apply-restore·gen-embeddings-new / results/new-links.jsonl
