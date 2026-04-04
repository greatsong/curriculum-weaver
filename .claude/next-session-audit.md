# 다음 세션 프롬프트: 데모 시스템 안정성 강화

## 배경
데모(시뮬레이션) 시스템이 인메모리 → Supabase DB 저장으로 리팩토링 완료됨.
현재 교사 페르소나 채팅 생성, 읽기 전용 모드까지 구현됨.
그러나 보안/안정성 감사에서 P0~P2 항목이 발견됨.

## 현재 상태 (이미 완료된 것)
- `server/routes/demo.js`: requireAuth, 2분할 AI 생성, 교사 페르소나(성격 트레이트), 대화 연속성, createMessage 저장
- `client/src/pages/ProjectPage.jsx`: isSimulation 판별 (status + title), 읽기 전용 배너
- `client/src/components/ChatPanel.jsx`: readOnly prop → 입력 비활성화
- `client/src/components/ProcedureCanvas.jsx`: readOnly prop → 편집/AI요청 버튼 숨김
- `status: 'simulation'`이 프로젝트 생성 시 설정됨

## P0 — 반드시 해결

### 1. 워크스페이스 멤버십 검증
**파일**: `server/routes/demo.js` (line 173 부근)
**문제**: requireAuth만 확인하고 workspaceId에 대한 멤버십 확인 없음
**해결**: createProject 전에 workspace_members 테이블에서 userId + workspaceId 조회
```javascript
// demo.js의 POST /generate 핸들러 시작 부분에 추가
const { getWorkspaceMember } = await import('../lib/supabaseService.js')
const member = await getWorkspaceMember(workspaceId, userId)
if (!member) {
  return res.status(403).json({ error: '해당 워크스페이스의 멤버가 아닙니다.' })
}
```
**주의**: supabaseService.js에 getWorkspaceMember 함수가 있는지 확인 필요. 없으면 추가.

### 2. 프로젝트 선생성 → 실패 시 고아 프로젝트
**파일**: `server/routes/demo.js` (line 202)
**문제**: AI 생성 전에 프로젝트를 만들므로, 실패 시 빈 프로젝트가 남음
**선택지**:
- (A) 프로젝트를 `status: 'generating'`으로 생성 → AI 완료 후 `'simulation'`으로 업데이트. 실패 시 `'failed'`로 표시
- (B) AI 완료 후에만 프로젝트 생성 (채팅 저장이 projectId에 의존하므로 임시 저장 필요)
- **권장: (A)** — 코드 변경이 적고, 부분 생성된 프로젝트도 사용자에게 보여줄 수 있음
```javascript
// 생성 시
const project = await createProject(workspaceId, { ..., status: 'generating' })

// 성공 시
await updateProjectStatus(projectId, 'simulation')

// 실패 시 (catch 블록)
await updateProjectStatus(projectId, 'failed')
```

### 3. 최소 저장 검증
**파일**: `server/routes/demo.js` (line 397 부근)
**문제**: totalSaved가 0이어도 complete 이벤트 발송
**해결**:
```javascript
const totalSaved = phase1Saved + phase2Saved
const MIN_BOARDS = 5 // 최소 5개는 저장되어야 정상 완료
if (totalSaved < MIN_BOARDS) {
  await updateProjectStatus(projectId, 'failed')
  sendEvent({ type: 'partial_failure', projectId, workspaceId, savedBoards: totalSaved, totalProcedures: ALL_CODES.length })
} else {
  await updateProjectStatus(projectId, 'simulation')
  sendEvent({ type: 'complete', projectId, workspaceId, savedBoards: totalSaved, totalProcedures: ALL_CODES.length })
}
```

## P1 — 가능하면 해결

### 4. 진행률을 저장 성공 기준으로 보강
**파일**: `server/routes/demo.js`, `client/src/components/DemoMode.jsx`
- 서버: 각 upsertDesign 성공 시 `{ type: 'saved', code, index }` 이벤트 추가
- 클라이언트: saved 이벤트 수로 실제 진행률 표시 (현재 progress 이벤트와 병행)

### 5. 취소/disconnect 처리
**파일**: `server/routes/demo.js`, `client/src/components/DemoMode.jsx`
- 서버: `res.on('close', () => { aborted = true })` + AI 스트림 abort
- 클라이언트: 취소 버튼 + unmount 시 AbortController.abort()

### 6. 프론트 복구 경로
**파일**: `client/src/components/DemoMode.jsx`
- `started` 이벤트에서 projectId를 저장해두고, error/partial_failure 시 "부분 생성된 프로젝트로 이동" 버튼 제공

### 7. projects 테이블 status 컬럼 확인
**파일**: `supabase/migrations/` 확인 필요
- `status` 컬럼이 'active', 'simulation', 'generating', 'failed' 등 지원하는지 확인
- 없으면 마이그레이션 추가: `ALTER TABLE projects ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`
- ProjectPage에서 `status === 'failed'`인 프로젝트에 대한 UI 처리

## P2 — 여유 있을 때

### 8. 메타데이터 저장
- createProject에 grade, subjects 필드 추가
- DemoMode 완료 후 검색/필터에 활용 가능

### 9. 초기 스냅샷
- upsertDesign 후 createVersion으로 v1 스냅샷 생성

### 10. 입력 길이 제한
- topic: 100자, description: 500자 제한
- 서버에서도 검증

## 작업 순서 권장
1. P0 #1 (멤버십 검증) — 가장 빠르게 적용 가능
2. P0 #3 (최소 저장 검증) — complete 이벤트 조건 추가
3. P1 #7 (status 컬럼 확인) — P0 #2 전제조건
4. P0 #2 (generating → simulation/failed 상태 전환)
5. P1 #5 (취소/disconnect)
6. P1 #4, #6 (진행률 + 복구 경로)
7. P2 항목들

## 참고 파일
- `server/routes/demo.js` — 메인 변경 대상
- `server/lib/supabaseService.js` — getWorkspaceMember, updateProjectStatus 함수 필요
- `client/src/components/DemoMode.jsx` — 프론트 복구/취소 UI
- `client/src/pages/ProjectPage.jsx` — status별 UI 분기 (generating, failed 상태)
- `supabase/migrations/` — status 컬럼 마이그레이션
