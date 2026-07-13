# 성취기준 정본 데이터 무결성 — 종합감사 결과 & 작업계획

> 2026-07-13 · 대상 `server/data/standards.js` (4,856 code) · 베이스라인 origin/main @88e3fd1
> 감사 방식: 8차원 병렬 에이전트 감사 → 교차검증 → 합성. **모든 수치 로컬 실측 검증 완료.**
> 성격: READ-ONLY 감사. 어떤 수정도 아직 없음.

## 감사 실행 노트 (투명성)
8개 감사 에이전트가 **일시적 API 연결 오류로 전부 실패**, 합성 에이전트 1개만 완주했습니다. 다만 합성 에이전트가 원자료 파일을 직접 읽어 독립 재감사했고, 그 핵심 수치를 제가 전건 재실측해 **정확히 일치**함을 확인했습니다(아래). 8차원 적대적 교차검증까지 원하면 워크플로우 재개(캐시 활용)로 재실행 가능합니다.

## 실측 검증된 핵심 수치
| 항목 | 값 | 상태 |
|---|---|---|
| 총 code / 중복 | 4,856 / **0** | ✅ |
| **content 필드 오염** | **0 (완전 청정)** | ✅ 2026-07-11 복원+게이트 실효 |
| content PUA | 0 | ✅ |
| **explanation 오염(distinct)** | **526~531** | ⚠️ 문제 집중 |
| explanation PUA 잔존 | 7 | ⚠️ |
| keywords 빈배열/불량 | 0 | ✅ 건전 |
| domain 필드 | 4,856 전량 빈값(100%) | ℹ️ 죽은 스키마 |
| explanation 빈값 | 1,527 (31.4%) | ℹ️ 대부분 정상(원본부재) |
| application_notes 빈값 | 2,801 (57.7%) | ℹ️ |

---

## 종합 문제지도 (심각도순)

| ID | 문제 | 심각도 | 건수 | 복원 클래스 |
|----|------|:---:|:---:|------|
| **P1** | explanation 필드 오염 총계 | high | 526~531 | 하위 P2~P7로 분해 |
| **P2** | 결정적 컷으로 자동복원 가능 bleed | high | **339** | 🟢 auto_deterministic |
| **P3** | (나) 고려사항 블록 application_notes 오배치 | high | **145** | 🟡 source_recoverable |
| **P4** | 사회과 explanation 본문 유실(헤더스텁) | high | **145** | 🔴 needs_ministry_original |
| **P5** | 복합 유실(컷 후 잔존 0) | medium | **28** | 🔴 needs_ministry_original |
| **P6** | HWP 수식글리프 PUA 잔존 | medium | **7** | 🔴 교사확정 필요 |
| **P7** | 컷 미산출 잔여 bleed | medium | 19 | ⚪ 개별 확인 |
| **P8** | 품질게이트 explanation 미검사(구조적 사각지대) | medium | — | 코드 수정 |
| **P9** | domain 필드 전량 빈값(죽은 스키마) | low | 4,856 | ⚪ 무조치 |
| **P10** | explanation/appnotes 대량 빈값 중 유실분 미식별 | low | — | ⚪ 조사 |

- 🟢 auto: 339 · 🟡 소스복원: 145 · 🔴 원문/교사확정: 180(사회 145+복합 28+PUA 7)

## 근본원인
1. **파서 경계탐지 부재**: `scripts/parse-xlsx-to-standards.mjs`가 `성취기준 상세` 시트의 explanation 셀을 추출할 때 성취기준 경계를 몰라 텍스트가 셀 밖으로 오버런 → (a) 다음 code 마커까지 흡수(hard_bleed), (b) 별도 컬럼인 (나)적용시고려사항 흡수(guidance), (c) 페이지 푸터 혼입.
2. **사회과 소스 공백**: 사회 종합분석표 xlsx는 **모든 버전이 플레이스홀더**("성취기준 해설" 라벨만) → 145건 본문이 애초에 파이프라인에 없었음. content만 다른 경로로 채워짐.
3. **품질게이트 사각지대**: `classifyStandardQuality(content)`가 content만 검사 → explanation/application_notes는 무검증 통과. content는 청정 유지된 반면 explanation 오염이 무방비 존치.
4. **원본 소스 생존**: 파서 소스 폴더(`종합분석표_최종/`)가 `~/Downloads/outputs/`에 살아있음. **해설·(나)가 원래 별도 컬럼** → 후처리 절단보다 **xlsx 컬럼 재대조가 근본적 복원**.

---

## ✅ 진행 상태 (2026-07-13) — explanation bleed 526 → 1
- **자동복원 334건**(컷 115 + (나)→application_notes 이관 219): `clean-explanation-bleed.mjs`.
- **원문복원 192건**: 교육부 고시 원문(별책 JSON `~/Downloads/outputs/2022_개정_교육과정_별책N.json`)에서 코드별 해설 추출 → 해설복원 **157**(출처 별책 명기) + 빈값정리 **35**(원문에도 해설 없음, 선별적 해설이라 정상). `extract-haeseol-from-byeolchaek.mjs` + `restore-haeseol-from-original.mjs`.
- **교사 트랙 1건**: [12경수02-06] — 원문 PDF에도 수식 PUA gap, 교사 확정 필요.
- **검증**: `content`·`keywords` md5 불변(5b82d2f0…), 4,856 불변, diff는 explanation/appnotes만(content·code 0줄). 품질게이트 explanation bleed **1**(교사건)로 통과. 백업 `backup_20260713_{explbleed,haeseol}/`.
- **Step 6 완료**: 품질게이트 explanation/application_notes 확장(재발방지 baseline).
- **남은 것**: (나) 적용시고려사항 원문복원(사회 145 appnotes 빈값정리만 됨) · 산업수요전문 교수학습 유입 bleed(별개 클래스) · 파서 경계로직 내장 · 임베딩/링크 재정합 · PR.

## 작업계획 (실행순서 · dry-run·비파괴·검증게이트)

| # | 단계 | 대상 | 방법 | 검증 | 위험 | 선행 |
|---|------|------|------|------|:---:|------|
| 1 | 베이스라인 고정·스캔 재현 | 4,856 전건 | @88e3fd1에서 스캐너 재실행, 산출물 대조. 무쓰기 | distinct·content 0·중복 0 재현 | low | 완료 |
| 2 | 결정적 컷 자동복원 **dry-run** | P2 339 | cut-preview 경계로 explanation 프리픽스 보존 미리보기 | 339 전건 kept 비지 않음·종결부호·잔재 제거 | low | 1 |
| 3 | (나) 블록 **이관** dry-run | P3 145 | (나) 텍스트를 application_notes로 이동 + explanation 컷 | 145 appnotes 신규 채움·explanation 유효 | med | 2 |
| 4 | 자동복원 **적용**(백업+비파괴) | 339+145 | 백업 후 code 매칭 in-place. content 불변 | 재스캔 bleed 339→0·신규0·4,856 불변·게이트 PASS | med | 3 + **사용자 승인** |
| 5 | 원문복원 리서치 큐 | P4 145+P5 28+P6 7=180 | 교육부 고시 원문/HWP 대조 목록. PUA는 교사확정. 출처 명기 | 각 건 출처 기재·미확정 보류 | high | 4 + **외부소스** |
| 6 | 품질게이트 explanation 확장 | standardsQuality.js | classify를 explanation/appnotes에도 적용, bleed4+PUA 게이트 편입 | 잔여 flagged=원문보류분과 일치 | low | 4 |
| 7 | 시스템 재정합 | 변경 code | 임베딩 캐시 갱신·연루 링크 재판정·Supabase 비파괴 upsert | verify-supabase PASS·그래프 bumpVersion | med | 4,5 |
| 8 | 게이트 통과·PR | 전체 | 게이트 통과 후 단일 PR, CLAUDE.md·MEMORY 갱신 | 게이트 PASS·회귀테스트 | low | 6,7 |

## ⚠️ 새 증거로 재검토가 필요한 이전 결정
초기에 "(나) 블록 146건 = **explanation에서 제거만**"으로 결정하셨으나, 감사에서 밝혀진 새 사실:
- (나)는 **교육부 고시 원문 실재 내용**이고 원본 xlsx에 **별도 컬럼**으로 존재
- 정위치인 **application_notes가 146건 중 145건 비어있음**
→ **제거(정보 폐기)보다 application_notes로 이관(정보 보존+설계 부합)이 우월**합니다. 작업계획은 이관(P3)으로 반영했습니다.

## 미결 질문 (사용자 결정 필요)
1. **(나) 처리 재확정**: 제거 → **이관**으로 변경할지 (권장: 이관)
2. **원문복원 180건 범위**: 이번 PR에 포함 vs 자동복원(339+145)만 먼저 PR하고 원문복원은 별도 트랙
3. **PUA 7건**: 담당 교사 확정본 확보 가능 여부(없으면 ◇ 마스킹 보류)
4. **파서 수정**: 이번엔 in-place 후처리만 vs 파서에 경계로직 내장해 재파싱 정본화
5. **domain 죽은 필드**: 제거 vs 유지
