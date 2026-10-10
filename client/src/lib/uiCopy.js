/**
 * 공용 문구 — 여러 화면이 함께 쓰는 이름(기능 이름·상태·주요 버튼). 화면별 문구는 explorationCopy.js 등에 둔다.
 * 윤문은 이 파일과 화면별 문구 파일에만 적용한다.
 * 규칙: 합쇼체, 대시 연결 금지, 은유·과장 금지.
 */

export const UI_COPY = {
  // 기능 이름 — 홈·안내서·탐색 화면이 같은 이름을 쓴다
  names: {
    explore: '수업 아이디어 탐색',
    connect: '성취기준 연결 찾기',
    theme: '주제로 찾기',
    pair: '두 과목으로 찾기',
    neighbor: '성취기준에서 찾기',
    series: '학년 간 연결 보기',
    map: '교육과정 성운',
    mapDesc: '3D 전체 지도',
  },

  // 상단 헤더의 주 입구 두 개 — 홈·탐색 화면 머리 줄에 나란히 놓인다(MainNav)
  nav: {
    explore: '아이디어 탐색',
    map: '교육과정 성운',
  },

  // 주요 버튼 이름
  actions: {
    open: '열기',
    close: '닫기',
    cancel: '취소',
    retry: '다시 시도',
    recheck: '다시 확인',
    change: '바꾸기',
    discard: '버리기',
  },

  /**
   * 반영 상태 사전 — 설계안의 상태 7종(exploring~unconfirmed)과 보조 상태.
   * label: 화면 표시, meaning: 뜻(안내·도움말에 사용), tone: StatusChip 색, icon: StatusChip 아이콘
   */
  status: {
    exploring: { label: '탐색 중 · 저장 전', meaning: '성취기준을 담거나 아이디어를 보는 중입니다. 어느 프로젝트에도 저장되지 않았습니다.', tone: 'neutral', icon: 'dot' },
    arrived: { label: '초안 도착', meaning: '보낸 초안이 내 브라우저에 있습니다. 팀원에게는 아직 보이지 않습니다.', tone: 'info', icon: 'inbox' },
    sent: { label: '대화에 보냄', meaning: '초안을 A-3 대화에 보냈습니다. AI 제안을 기다립니다.', tone: 'outline', icon: 'send' },
    reviewing: { label: '제안 검토 중', meaning: '보드에 AI 제안이 있습니다. 팀이 수락, 편집, 거부 중 하나를 고릅니다.', tone: 'review', icon: 'dot' },
    reflected: { label: '보드에 반영됨', meaning: '제안을 수락했고 저장 응답을 받았습니다.', tone: 'success', icon: 'check' },
    rejected: { label: '반영하지 않음', meaning: '팀이 제안을 거부했습니다. 초안은 다시 보낼 수 있습니다.', tone: 'muted', icon: 'x' },
    unconfirmed: { label: '저장 확인 필요', meaning: '저장 응답을 받지 못했습니다. 결과를 알 수 없으므로 성공으로도 실패로도 표시하지 않습니다.', tone: 'warning', icon: 'alert' },
    // 보조 상태 (탐색 화면 머리 줄)
    loading: { label: '프로젝트 확인 중', meaning: '보낼 곳 프로젝트 정보를 불러오는 중입니다.', tone: 'neutral', icon: 'dot' },
    loadFailed: { label: '프로젝트 확인 실패', meaning: '보낼 곳 프로젝트 정보를 확인하지 못했습니다.', tone: 'warning', icon: 'alert' },
    readOnly: { label: '읽기 전용', meaning: '이 프로젝트는 읽기 전용입니다.', tone: 'warning', icon: 'lock' },
    blocked: { label: '탐색 제한', meaning: '이 프로젝트는 지금 탐색 결과를 받을 수 없습니다.', tone: 'warning', icon: 'lock' },
  },
}

/** 상태 키 → 표시 이름 (사전에 없으면 빈 문자열) */
export function statusLabel(key) {
  return UI_COPY.status[key]?.label || ''
}
