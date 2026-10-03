# 미래보기 진입 버튼 정리 및 코드 삭제 위험 점검

2026-10-03, PR #144 반영 버전을 기준으로 점검했다. 이번 변경은 `WorkspacesPage.jsx`의 구버전 진입 버튼 3개 제거뿐이며, 아래 코드 삭제·라우트 전환·DB 정리는 실행하지 않았다.

## 남기는 진입점

- 워크스페이스 상단 ‘미래보기 실험실’ → `/futures-lab`.
- 프로젝트 A-3의 아이디어 탐색 → `/futures-lab?project=...`. 같은 기능의 프로젝트 연결 진입점이므로 유지.
- 실험실 내부의 ‘미래 보기’와 프로젝트 생성/기존 프로젝트 반영 동작을 유지.
- 제거한 메뉴: `/futures2`의 ‘미래보기(타임스톤)’, `/futures`의 ‘미래 보기’, `/future-map`의 ‘미래 지도’.

## 삭제 위험

| 대상 | 현재 확인한 연결 | 삭제 시 영향 / 선행 조건 |
| --- | --- | --- |
| `server/routes/futures2.js`, `server/services/futures2Generator.js` | `FuturesLabPage.jsx`가 `/api/futures2/catalog`, `/bridges`, 생성 API를 직접 호출 | **높음.** 이름은 2이지만 현재 버전의 실제 서버이다. 삭제 대상에서 제외하거나 현재 기능용으로 먼저 분리해야 한다. 인증·입력 검증·큐·캐시·rate limit도 함께 보존해야 한다. |
| `client/src/lib/futures2.js` | 실험실과 `futuresProjectHandoff.js`의 URL/성취기준 선택 로직 | **높음.** 성취기준 해석과 A-3 연결이 끊어진다. 공용 모듈로 분리 후 모든 참조를 바꿔야 한다. |
| `futures2Scene.js`, `timeStone2Visuals.js`, `futures2GraphLayout.js`, `futures2Practice.js` | 실험실이 색상 함수·과목 묶음·예제 해석을 가져온다. `futuresLabScene.js`/`futuresLabLayout.js`도 graph layout에 의존 | **높음.** 구버전 연출 전체가 필요하다는 뜻은 아니지만 파일 통째 삭제는 불가. 실제 사용하는 함수와 전이 의존성을 먼저 분리해야 한다. |
| `client/src/components/futures/KeywordGraph.jsx`, `lib/futures/{nebulaLayout,measureText,copy}.js` | 실험실의 첫 연결 지도가 직접 사용 | **높음.** 현재 채택한 원형 과목·키워드 연결 그래프가 사라지거나 빌드가 실패한다. `futures/` 폴더 전체를 삭제하면 안 된다. |
| `client/src/pages/futures.css`, `futures2.css` | 실험실 페이지에서 직접 import | **높음.** 기능은 열려도 배치·색상·선택 UI가 깨질 수 있다. 스타일 추출 후 화면 비교와 모바일 확인이 필요하다. |
| `scenario_cache` 테이블 | 세 미래 생성기 외에 `server/routes/standards.js`도 사용 | **높음.** 테이블 삭제/전체 비우기는 현재 실험실과 일반 성취기준 시나리오 캐시까지 영향을 준다. 구버전 캐시 정리도 키 접두·실사용 확인이 별도로 필요하다. 이번에는 조회/삭제하지 않았다. |
| `cw_design_basket`, `cw_design_basket_meta`, `cw_project_*_suggestion` | 실험실, 다른 아이디어 화면, 프로젝트 생성 화면에서 공유 | **높음.** 예전 기능의 흔적으로 오인해 제거하면 신규 프로젝트로 성취기준·주제 전달이 끊긴다. |
| `FuturesPage.jsx`, `Futures2Page.jsx`, `FutureMapPage.jsx` 자체와 App 라우트 | `App.jsx` lazy import/라우트가 남아 있으며 기존 공유 링크로 직접 접근 가능 | **중간.** 파일만 삭제하면 빌드가 실패한다. 향후 라우트 처리 방침과 `codes`/`model` 쿼리 보존을 결정해야 한다. 현재는 URL 호환성을 유지한다. |
| `/api/futures`, `/api/future-map`의 라우트·생성기, futureMap 전용 UI | 현재 코드상 실험실은 직접 사용하지 않음 | **상대적으로 낮음.** 그렇더라도 이전 주소를 연 사용자·열려 있는 이전 번들의 호출이 있을 수 있다. 사용량/운영 로그는 이번 정적 점검에서 확인하지 않았다. 서버 등록·전용 limiter·테스트 참조까지 한 묶음으로 검토해야 한다. |

## 프로젝트·시뮬레이션·보고서와의 관계

버튼 변경은 `A3ExplorationEntry`, `futuresProjectHandoff`, 프로젝트 생성, 단계 건너뛰기, 시뮬레이션 및 보고서 코드를 변경하지 않는다. 향후 공유 모듈 삭제/이동 시에는 실험실에서 새 프로젝트 생성, 기존 프로젝트 A-3 반영, A-4 이동, 이어서 시뮬레이션, 보고서의 원본 보존을 다시 검증해야 한다.

## 향후 삭제한다면 권장 순서 — 미실행

1. 현재 실험실이 쓰는 API·순수 함수·그래프·스타일을 명확한 공용 영역으로 분리하고 현재 동작을 검증한다.
2. 예전 URL의 처리 방침을 정하고 공유 링크의 선택 상태를 보존한다.
3. 구버전 페이지 전용 코드만 제거한다. 참조 검색·빌드·UI 확인을 수행한다.
4. 구버전 API 사용 여부와 열린 이전 클라이언트를 고려한 뒤 API/전용 limiter를 별도 변경으로 제거한다.
5. 캐시나 데이터 정리는 코드 삭제와 분리한다. 공용 테이블/프로젝트 결과를 일괄 삭제하지 않는다.

## 이번 검증

전체 서버·클라이언트 회귀 테스트와 프로덕션 빌드로 기존 실험실/A-3/시뮬레이션/보고서 흐름을 확인한다. 자동 테스트의 AI·DB는 모의 구현이다. 버튼 정리는 데이터 저장/API를 변경하지 않으므로 실제 AI 생성이나 DB 쓰기를 재실행하지 않는다.
