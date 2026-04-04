# Socket.IO 실시간 협업 구현 프롬프트

아래 프롬프트를 새 Claude Code 세션에 붙여넣으세요.

---

## 프롬프트

```
커리큘럼 위버(curriculum-weaver) 프로젝트에 Socket.IO 기반 실시간 협업 기능을 구현해주세요.

## 프로젝트 개요

교사들이 협력적으로 융합 수업을 설계하는 플랫폼입니다.
- 모노레포: client(React 19 + Vite 7) / server(Express 5) / shared
- 서버 포트 4007, 클라이언트 포트 4006
- 현재 인메모리 저장소(Map 기반)로 동작 중
- 배포: Vercel(프론트) + Railway(백엔드)

## 현재 상태

실시간 협업이 전혀 없습니다:
- chatStore.js: subscribe/unsubscribe가 no-op
- stageStore.js: subscribeBoardUpdates/unsubscribeBoardUpdates가 no-op
- MemberList.jsx: 더미 "교 1"만 표시
- 여러 브라우저에서 같은 세션에 들어가도 서로의 변경이 보이지 않음

## 구현할 기능

### 1. 서버: Socket.IO 설정 (`server/index.js`)

- `socket.io` 패키지 설치 (서버)
- Express app에 http.createServer로 감싸서 Socket.IO 연결
- CORS 설정은 기존 Express CORS와 동일하게 (Vercel 프리뷰 포함)
- 세션별 룸 관리: `socket.join(sessionId)`

```javascript
// 핵심 이벤트 구조
io.on('connection', (socket) => {
  // 세션 입장
  socket.on('join_session', ({ sessionId, user }) => {
    socket.join(sessionId)
    socket.to(sessionId).emit('member_joined', user)
    // 현재 접속자 목록 전송
  })

  // 세션 퇴장
  socket.on('leave_session', ({ sessionId }) => {
    socket.leave(sessionId)
    socket.to(sessionId).emit('member_left', user)
  })

  // 새 채팅 메시지 알림 (교사 메시지)
  socket.on('new_message', ({ sessionId, message }) => {
    socket.to(sessionId).emit('message_added', message)
  })

  // AI 응답 완료 알림
  socket.on('ai_response_done', ({ sessionId, message }) => {
    socket.to(sessionId).emit('message_added', message)
  })

  // 보드 업데이트 알림
  socket.on('board_updated', ({ sessionId, board }) => {
    socket.to(sessionId).emit('board_changed', board)
  })

  // 단계 변경 알림
  socket.on('stage_changed', ({ sessionId, stage }) => {
    socket.to(sessionId).emit('stage_updated', stage)
  })

  // disconnect 처리
})
```

### 2. 클라이언트: Socket.IO 클라이언트 (`client/src/lib/socket.js` 신규)

- `socket.io-client` 패키지 설치 (클라이언트)
- 싱글톤 소켓 인스턴스 생성
- API_BASE(VITE_API_URL)로 연결

```javascript
import { io } from 'socket.io-client'

const API_BASE = import.meta.env.VITE_API_URL || ''

export const socket = io(API_BASE, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
})

export function joinSession(sessionId, user) {
  if (!socket.connected) socket.connect()
  socket.emit('join_session', { sessionId, user })
}

export function leaveSession(sessionId) {
  socket.emit('leave_session', { sessionId })
}
```

### 3. SessionPage.jsx 수정

- 세션 입장 시 `joinSession(sessionId, user)` 호출
- 언마운트 시 `leaveSession(sessionId)` 호출
- Socket 이벤트 리스너 등록:
  - `message_added` → chatStore의 messages에 추가
  - `board_changed` → stageStore의 boards 업데이트
  - `stage_updated` → sessionStore의 currentSession.current_stage 업데이트
  - `member_joined` / `member_left` → 접속자 상태 업데이트

### 4. chatStore.js 수정

- `sendMessage` 완료 후 소켓으로 `new_message` emit (교사 메시지)
- AI 응답 `onDone` 후 소켓으로 `ai_response_done` emit
- `subscribe`를 소켓 이벤트 리스너 등록으로 교체
- `unsubscribe`를 소켓 리스너 해제로 교체

### 5. stageStore.js 수정

- `applyBoardSuggestion` / `updateBoard` 후 소켓으로 `board_updated` emit
- `subscribeBoardUpdates`를 소켓 `board_changed` 리스너로 교체

### 6. sessionStore.js 수정

- `updateStage` 후 소켓으로 `stage_changed` emit

### 7. MemberList.jsx 수정

- 접속자 상태를 useSessionStore 또는 별도 소켓 상태에서 가져옴
- 실제 접속 중인 사용자 아바타/이름 표시
- 현재 테스트 모드이므로 사용자 이름은 `교사 ${socket.id.slice(0,4)}` 같은 간단한 형태로

### 8. Vite 프록시 설정 (`client/vite.config.js`)

- 기존 `/api` 프록시에 WebSocket 지원 추가:
```javascript
proxy: {
  '/api': {
    target: 'http://localhost:4007',
    changeOrigin: true,
  },
  '/socket.io': {
    target: 'http://localhost:4007',
    ws: true,
  },
},
```

## 주의사항

1. 기존 AI SSE 스트리밍(`apiStreamPost`)은 그대로 유지. Socket.IO는 다른 사용자에게 "결과 알림"만 담당.
2. 보드 업데이트 시 version 충돌은 고려하지 않아도 됨 (나중에 처리).
3. 인증이 없으므로(테스트 모드) 사용자 식별은 socket.id + 임의 닉네임으로.
4. 서버의 `app.listen(PORT)` → `server.listen(PORT)`으로 변경 필요 (http.createServer).
5. Railway 배포에서 WebSocket이 자동 지원되므로 별도 설정 불필요.
6. Dashboard의 "테스트 모드" 텍스트는 유지.

## 테스트 방법

1. `npm run dev`로 로컬 실행
2. 브라우저 2개로 같은 세션에 입장
3. 한쪽에서 채팅 → 다른 쪽에서 메시지 즉시 표시 확인
4. 한쪽에서 보드 반영 → 다른 쪽에서 보드 갱신 확인
5. 한쪽에서 단계 변경 → 다른 쪽에서 단계 이동 확인
6. 접속자 목록에 2명 표시 확인
7. 한쪽 브라우저 닫기 → 접속자 목록에서 제거 확인

## 수정 파일 요약

| 작업 | 파일 |
|------|------|
| INSTALL | `socket.io` (server), `socket.io-client` (client) |
| EDIT | `server/index.js` (http.createServer + Socket.IO) |
| CREATE | `client/src/lib/socket.js` (소켓 싱글톤) |
| EDIT | `client/vite.config.js` (WebSocket 프록시) |
| EDIT | `client/src/pages/SessionPage.jsx` (join/leave + 이벤트 리스너) |
| EDIT | `client/src/stores/chatStore.js` (소켓 emit + subscribe) |
| EDIT | `client/src/stores/stageStore.js` (소켓 emit + subscribe) |
| EDIT | `client/src/stores/sessionStore.js` (소켓 emit) |
| EDIT | `client/src/components/MemberList.jsx` (실제 접속자 표시) |

빌드 확인 후 커밋, `--force` 옵션으로 Vercel 배포해주세요. (`npx vercel --prod --force`)
```
