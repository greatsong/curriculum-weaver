# reference/01 — AI 공동설계자 (aiAgent.js)

파일: `server/services/aiAgent.js` (1,235줄)

## buildSystemPrompt 구조 (646~1027행)
동적으로 `parts[]`를 조립 후 `replaceInternalProcedureCodes(parts.join('\n\n'))`로 최종 스크럽(1026행 — 어휘 격리 최종 관문). 섹션 순서:

| # | 행 | 섹션 | 시연 모드 관점 |
|---|----|------|------|
| 0 | 664 | 프롬프트 인젝션 방어 | 재사용 |
| 0-B | 673 | 업로드 자료 환각 방지 | 재사용 |
| 1 | 695 | 역할 정의 + 대화 스타일("동료 설계 파트너", "결정은 교사가") | **재해석 대상** — 채점관/스파링 톤은 여기 교체 |
| 1-B | 709 | AI 역할 톤 (프리셋 4종 → PROMPT_TONE_INSTRUCTIONS) | 프리셋에 "채점관/시연코치" 추가 지점 |
| 2 | 722 | 현재 절차 정보 (`PROCEDURE_GUIDE[procedure]`) | 절차 트랙 의존 |
| 2-B | 758 | 생략된 절차 안내 (skippedCodes) | 스킵 시스템 |
| 3 | 771 | 현재 스텝 목록 (`PROCEDURE_STEPS[procedure]`) | 절차 트랙 의존 |
| 4 | 777 | 액션 타입별 대화 프로토콜 (guide/generate/check/record 등 8종) | 재사용 가능 |
| 4-B | 785 | 확정 제약 존중 | 재사용 |
| 5 | 793 | 절차 진행 규칙 + `<procedure_advance>` XML (다음 절차 = getNextActiveProcedure) | 절차 트랙 의존 |
| 6 | 820 | 보드 스키마 + `<ai_suggestion>` XML (`getBoardSchemaForPrompt`) | 보드 스키마 의존 |
| 7 | 846 | 정합성 점검 컨텍스트 + `<coherence_check>` XML (`getCoherenceTargets`) | **핵심 재사용** — 목표-활동-평가 정합성 |
| 8 | 858 | 총괄 원리 5종 (협력UP GENERAL_PRINCIPLES) | **재해석/제거** — 협력 전제 |
| 9 | 864 | 공통 운영 규칙 (COMMON_RULES) | 재사용 |
| 10 | 871 | 세션 정보 | 재사용 |
| 11 | 878 | 학습자 맥락 (prep 보드) | 재사용 |
| 12 | 893 | 팀 비전 (T-1-1 보드, 모든 절차 참조) | 팀 전제 |
| 12-B | 904 | 이전 절차 진행 요약 | 절차 트랙 의존 |
| 13 | 927 | 선택 성취기준 + 융합 가드(단일교과면 "다른 교과 추가" 안내, 950행) | **재해석** — 시연은 단일교과가 정상 → 융합가드 반드시 우회 |
| 13-B | 969 | 검증된 교과 연결 링크 컨텍스트 | 융합 전제 |
| 14 | 981 | 현재 절차 보드 내용 | 보드 의존 |
| 15 | 989 | 업로드 자료 컨텍스트 (intent 기반) | **재사용** — 교과서/지도서 분석 |
| 16 | 1015 | 최근 첨부 이력 | 재사용 |

## 핵심 판단
- **프롬프트 빌더 분기 비용**: buildSystemPrompt는 `procedure` 코드에 강하게 의존 (2·3·5·6·7·12-B 섹션이 PROCEDURES/PROCEDURE_STEPS/BOARD_TYPES/getCoherenceTargets를 조회). 시연 모드가 **기존 절차 코드를 재사용**하면 이 빌더를 거의 그대로 쓸 수 있음. **신규 절차 코드**를 도입하면 procedureGuide.js·procedureSteps.js·boardSchemas.js·BOARD_TYPES에 대응 엔트리를 전부 추가해야 함(안 하면 해당 섹션이 조용히 빠짐).
- **가장 저렴한 분기점**: (a) 섹션 1(역할 정의)·1-B(톤 프리셋)에 시연 모드 톤 주입, (b) 섹션 8(총괄 원리)·12(팀 비전)·13-B(융합 링크)를 `mode==='demo'`일 때 스킵, (c) 섹션 13 융합 가드(950행)를 시연 모드에서 비활성. → `buildSystemPrompt`에 `mode`/`isDemo` 플래그 1개 추가로 조건 분기하는 것이 신규 트랙보다 훨씬 싸다.
- **모델**: MODEL_MAP fast=claude-sonnet-5, precise=claude-opus-4-8 (44행). 스트리밍 max_tokens=12000(본대화)/1200(인트로).
- **AI 큐**: p-queue concurrency 12, timeout 180s.

## 진입 인트로 (buildProcedureIntroResponse, 1040행)
- **정적 설계**: PROCEDURE_GUIDE 기반으로 시스템/유저 프롬프트를 조립하지만 **톤 프리셋(aiRole) 미반영** — 인트로는 톤 주입 경로가 없음(메모리 ai_role_presets_audit.md와 일치). 시연 모드 톤을 인트로에도 태우려면 이 함수도 수정 필요.

## 재사용 헬퍼 (시연 모드에서 유용)
- `buildMaterialsContext` (399행): intent 기반 자료 컨텍스트 — 교과서·지도서 단원 분석에 그대로 사용 가능.
- `buildCoherenceContext` (209행): 이전 절차 확정 데이터와 정합성 점검 → 목표-활동-평가 정합성 점검의 뼈대.
- `buildLinkContextText` (72행): 융합 전용 — 시연 모드에서는 제외.
