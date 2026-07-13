# 성취기준 정본 감사 — 교차검증 후 보정 결과 (baseline @88e3fd1, READ-ONLY)

총 레코드: 4,856 / 중복 code: 0 / content 필드 품질 플래그: **0 (전량 ok)**

## explanation 필드 오염 — 보정 distinct 총계 = 531
(선행조사 526 + 독립 스캐너 신규검출 5, 5건 모두 육안 검증 genuine)

| 복원클래스 | 건수 | 근거 |
|---|---|---|
| auto_deterministic (안전 컷 프리픽스 생존) | 339 | hard_bleed/cut_ok 206 + guidance_only/cut_ok 133. bleed-cut-preview.json에 kept_tail/removed_head 결정적 경계 존재 |
| ├─ 그중 application_notes로 이관 가능 | 145 | guidance_only 146중 145가 appnotes 비어있음 — (나)적용시고려사항 블록은 폐기 아니라 application_notes로 복원 |
| needs_ministry_original (본문 유실) | 173 | content_lost: 사회 145 헤더스텁("성취기준 해설"만) + 복합유실 28(컷 후 잔존 0) |
| needs_ministry_original (PUA 수식글리프) | 7 | 고급대수/고급미적분/이산수학/전문수학/경제수학. U+E000–U+F8FF HWP 수식폰트 글리프인덱스 — 결정적 디코드 불가, 원문/교사확정 필요 |
| investigate_further (컷 미산출) | 14+5 | guidance_only/no_cut 13 + hard_bleed/no_cut 1 + 신규 5 |

- PUA 7건 중 [12경수02-06]은 신규검출 5건과 중복(bleed+PUA 동시)
- 신규 5: [9기가03-03](다음코드침범) [12사감02-03][12연감02-07][12영제02-01](문두결손) [12경수02-06](PUA)

## 기타 구조 소견
- domain 필드: 4,856/4,856 전량 빈값 — 스키마상 죽은 필드 (데이터 손실 아님)
- explanation 빈값 1,527 (31.4%) / application_notes 빈값 2,801 (57.7%) — 상당수 원본부재(정상), content_lost 스텁과는 별개
- keywords: 24,239토큰, 비배열·코드침입·과장토큰 0 (건전)
- content 필드 PUA: 0

## 근본원인
parse-xlsx-to-standards.mjs가 explanation 셀 추출 시 경계탐지 부재 →
(a) 다음 성취기준 code 마커까지 오버런(hard_bleed),
(b) (나)적용시고려사항 블록 흡수(guidance_only, 본래 application_notes 소속),
(c) 페이지 푸터 혼입.
사회과 145는 explanation 본문 자체가 파싱 단계에서 탈락, "성취기준 해설" 헤더스텁만 잔존.
HWP 수식은 폰트 미임베드로 PUA 코드포인트만 생존(7건).
**품질게이트(classifyStandardQuality)는 content만 검사** → content는 2026-07-11 복원+게이트로 청정(0),
explanation은 게이트 미적용이라 531건 존치. PUA_RE 자체는 BMP(E000-F8FF) 커버 정상(리터럴 사용).
