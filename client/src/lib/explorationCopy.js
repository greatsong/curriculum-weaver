/**
 * 수업 아이디어 탐색 화면 문구 — 사용자에게 보이는 새 문구를 이 파일 하나에 모은다.
 * (나중에 윤문을 이 파일에만 적용하기 위함. 코드에서 문구를 직접 쓰지 않는다.)
 *
 * 규칙: 합쇼체, 대시 연결 금지, 은유·과장 금지, 절차는 표시 코드(A-3)로만 부른다.
 * 함수로 된 항목은 값이 끼어드는 문장이다. 문장 자체는 그대로 고쳐도 된다.
 * 여러 화면이 함께 쓰는 이름(기능 이름·상태 7종·주요 버튼)은 lib/uiCopy.js에 있다.
 */
import { UI_COPY } from './uiCopy'

const N = UI_COPY.names

export const EXPLORE_COPY = {
  common: {
    title: N.explore,
    destinationLabel: '보낼 곳',
    change: '바꾸기',
    newProject: '새 프로젝트',
    projectAtA3: (title, a3) => `${title} · ${a3}`,
    loadingProject: '프로젝트 확인 중',
    unknownProject: '진행 중인 프로젝트',
    savedBasket: (n) => `담은 성취기준 ${n}개`,
    myWorkspaces: '내 워크스페이스',
    logout: '로그아웃',
    retry: '다시 시도',
    close: '닫기',
    cancel: '취소',
  },

  // 탐색 화면 머리 줄의 안내 문장 (상태 이름은 UI_COPY.status)
  status: {
    exploringNote: '탐색만으로는 어느 프로젝트에도 저장되지 않습니다.',
    loadFailedNote: '프로젝트 정보를 확인하지 못했습니다. 탐색은 계속할 수 있습니다.',
    readOnlyNote: '이 프로젝트는 읽기 전용입니다.',
  },

  // 홈
  home: {
    exploreLink: N.explore,
    continueTitle: '이어서 하기',
    continueHint: '최근에 연 프로젝트',
    currentProcedure: '현재 절차',
    openProject: '프로젝트 열기',
    exploreWithProject: '이 프로젝트로 아이디어 탐색',
    checkFailed: '프로젝트 정보를 확인하지 못했습니다.',
    checking: '프로젝트 정보를 확인하는 중입니다.',
    roles: { owner: '소유자', host: '호스트', admin: '관리자', member: '멤버', viewer: '열람' },
    cardTitle: N.explore,
    cardBody: '교과 사이의 연결을 살펴보며 수업에 사용할 성취기준을 고르고 담습니다. 담은 성취기준으로 새 프로젝트를 만들 수 있습니다.',
    cardNote: '프로젝트를 만들기 전까지 어디에도 저장되지 않습니다.',
    steps: ['성취기준 고르기', '성취기준 담기', '새 프로젝트 만들기'],
    stepsLabel: '탐색 순서',
    newChoiceTitle: '새 수업 아이디어 찾기',
    newChoiceBody: '결과로 새 프로젝트를 만듭니다.',
    projectChoiceTitle: '진행 중인 프로젝트에 더하기',
    projectChoiceBody: '그 프로젝트에 맞는 성취기준 연결을 찾습니다.',
    directLabel: '바로 열기',
    directMap: N.map,
    directMapTitle: `${N.map} (${N.mapDesc})`,
    directGuide: '사용 안내',
    basketBanner: (n) => `담아 온 성취기준 ${n}개가 있습니다. 아직 프로젝트에 저장되지 않았습니다. 워크스페이스를 고르고 새 프로젝트 만들기를 마쳐야 저장됩니다.`,
  },

  // 탐색 시작 화면 (/explore)
  hub: {
    title: N.explore,
    intro: '교과 사이의 연결을 살펴보고 수업에 사용할 성취기준을 담습니다.',
    destinationLegend: '탐색 결과를 넣을 곳',
    projectOption: '진행 중인 프로젝트',
    projectOptionBody: '이 프로젝트에 맞는 성취기준을 찾습니다. 프로젝트에 추가할 때는 프로젝트 화면의 성취기준 메뉴를 사용합니다.',
    projectSelectLabel: '프로젝트',
    projectListLoading: '프로젝트 목록을 불러오는 중입니다.',
    projectListFailed: '프로젝트 목록을 불러오지 못했습니다.',
    projectListEmpty: '보낼 수 있는 프로젝트가 없습니다. 워크스페이스에서 프로젝트를 먼저 만듭니다.',
    projectSelectPlaceholder: '프로젝트를 고릅니다',
    teamProcedure: (code) => `팀의 현재 절차는 ${code}입니다. 탐색해도 현재 절차는 바뀌지 않습니다.`,
    teamProcedureUnknown: '탐색해도 팀의 현재 절차는 바뀌지 않습니다.',
    newOption: '새 프로젝트',
    newOptionBody: '결과로 새 프로젝트를 만듭니다. 만들기를 마쳐야 저장됩니다.',
    step1Title: '성취기준 고르기',
    step1Body: '가지고 있는 것에 맞춰 시작합니다.',
    step1Footer: `${N.series}는 ${N.connect} 화면 위쪽 보기 전환에서 고릅니다.`,
    entries: {
      theme: { when: '주제가 있을 때', name: N.theme, body: '기후변화 같은 주제 하나로 여러 교과의 성취기준을 찾습니다.' },
      pair: { when: '함께할 과목이 정해졌을 때', name: N.pair, body: '두 과목의 성취기준이 어떻게 연결되는지 봅니다.' },
      neighbor: { when: '사용할 성취기준이 있을 때', name: N.neighbor, body: '그 성취기준과 연결된 다른 교과의 성취기준을 찾습니다.' },
      map: { when: '아직 정하지 않았을 때', name: N.map, body: `교과 사이의 연결 전체를 ${N.mapDesc}로 둘러봅니다.` },
    },
    basketTitle: (n) => `담은 성취기준 ${n}개`,
    basketFromDest: (title) => `${title} 프로젝트에서 사용할 성취기준입니다.`,
    basketForNew: '새 프로젝트에 사용할 성취기준입니다.',
    basketEmpty: '아직 담은 성취기준이 없습니다. 위의 화면에서 담으면 여기에 표시됩니다.',
    basketClear: '비우기',
    basketClearConfirm: '모두 비울까요?',
  },

  // 성취기준 연결 찾기·전체 지도의 담기 줄
  graph: {
    startProject: '이 조합으로 프로젝트 시작',
    basketCount: (n) => `담은 성취기준 ${n}`,
    openInNeighbor: `${N.neighbor}로 보기`,
  },

  // 프로젝트 화면 안내 줄
  strip: {
    regionLabel: '탐색 초안 반영 상태',
    beforeA3Title: 'A-3에서 검토할 탐색 초안 1건',
    beforeA3Body: '팀이 A-3로 이동하면 대화 입력창에 넣을 수 있습니다. 탐색 때문에 현재 절차를 옮기지 않습니다.',
    arrivedTitle: '탐색 초안 1건 도착',
    arrivedBody: '입력창에 넣은 뒤 보내면 AI가 기존 분석과 비교합니다. 보내기 전에는 팀원에게 보이지 않습니다.',
    insert: '대화 입력창에 넣기',
    reinsert: '초안 다시 넣기',
    inserted: '대화 입력창에 넣었습니다. 내용을 확인하고 보냅니다.',
    readOnlyInsert: '읽기 전용 프로젝트라 대화에 넣을 수 없습니다.',
    sentTitle: '탐색 초안',
    sentBody: '초안에서 나온 AI 제안을 수락하면 보드에 저장됩니다.',
    sentWaiting: 'AI 제안을 기다립니다. 제안이 오지 않으면 대화에서 다시 요청합니다.',
    reviewingBody: '보드에 AI 제안이 있습니다. 수락, 편집, 거부 중 하나를 고릅니다.',
    reflectedTitle: '보드에 반영됨',
    rejectedTitle: '반영하지 않음',
    rejectedBody: '제안을 거부했습니다. 초안은 다시 넣을 수 있습니다.',
    unconfirmedTitle: '저장 확인 필요',
    unconfirmedBody: '수락한 제안이 저장되었는지 확인하지 못했습니다. 보드를 다시 불러와 확인합니다.',
    recheck: '다시 확인',
    rechecking: '확인 중',
    recheckNotFound: '보드에서 이번 수락의 저장 기록을 찾지 못했습니다. 대화에서 제안을 다시 받아 수락합니다.',
    recheckFailed: '보드를 불러오지 못했습니다. 잠시 뒤 다시 확인합니다.',
    view: '초안 보기',
    hide: '초안 접기',
    discard: '버리기',
    discardConfirm: '초안을 버릴까요?',
    dismiss: '안내 닫기',
    stepsLabel: '반영 단계',
    steps: { sent: '대화에 보냄', reviewing: '제안 검토 중', reflected: '보드에 반영' },
    savedAt: (time) => time,
    suggestionTag: '탐색 초안에서',
  },

  // 홈 카드의 초안 한 줄 (상태 이름은 UI_COPY.status)
  homeDraftLine: {
    arrived: 'A-3에서 검토할 탐색 초안 1건이 있습니다.',
    sent: '탐색 초안을 A-3 대화에 보냈습니다.',
    reflected: '탐색 초안의 제안이 보드에 반영되었습니다.',
    rejected: '탐색 초안의 제안을 반영하지 않았습니다.',
    unconfirmed: '탐색 초안 제안의 저장 확인이 필요합니다.',
  },

  // 프로젝트 만들기 창 (워크스페이스 화면)
  createModal: {
    basketLine: (n) => `담아 온 성취기준 ${n}개를 이 프로젝트에 함께 저장합니다. 만들기를 마쳐야 저장됩니다.`,
  },

  // 프로젝트 화면 헤더
  projectHeader: {
    explore: '아이디어 탐색',
    exploreTitle: '이 프로젝트로 수업 아이디어 탐색',
  },

  // 인계 초안의 첫 줄 — 예전 미래보기가 만든 초안을 대화에서 알아보는 표식(lib/explorationDraft.js의 HANDOFF_HEADER)
  handoff: {
    header: '[A-3 성취기준 분석 · 연결 아이디어 탐색 결과]',
  },
}

/** 프로젝트 역할 코드 → 화면 표기 */
export function roleLabel(role) {
  return EXPLORE_COPY.home.roles[role] || ''
}
