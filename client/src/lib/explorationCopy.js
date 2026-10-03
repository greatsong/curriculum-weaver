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
    exploringNote: '보내기 전까지 어느 프로젝트에도 저장되지 않습니다.',
    loadFailedNote: '프로젝트 정보를 확인하지 못했습니다. 탐색은 계속할 수 있지만 보내기 전에 다시 확인합니다.',
    readOnlyNote: '비교용으로 초안을 복사할 수 있습니다.',
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
    cardBody: '성취기준을 고르고, 고른 성취기준으로 만들 수 있는 수업 아이디어를 비교합니다. 결과는 새 프로젝트나 진행 중인 프로젝트로 보낼 수 있습니다.',
    cardNote: '보내기 전까지 어느 프로젝트에도 저장되지 않습니다.',
    steps: ['성취기준 고르기', '수업 아이디어 비교', '프로젝트로 보내기'],
    stepsLabel: '탐색 순서',
    newChoiceTitle: '새 수업 아이디어 찾기',
    newChoiceBody: '결과로 새 프로젝트를 만듭니다.',
    projectChoiceTitle: '진행 중인 프로젝트에 더하기',
    projectChoiceBody: '결과를 그 프로젝트의 A-3 대화에서 검토합니다.',
    directLabel: '바로 열기',
    directMap: N.map,
    directMapTitle: `${N.map} (${N.mapDesc})`,
    directFutures: N.futures,
    directGuide: '사용 안내',
    basketBanner: (n) => `담아 온 성취기준 ${n}개가 있습니다. 아직 프로젝트에 저장되지 않았습니다. 워크스페이스를 고르고 새 프로젝트 만들기를 마쳐야 저장됩니다.`,
  },

  // 탐색 시작 화면 (/explore)
  hub: {
    title: N.explore,
    intro: '세 단계로 진행합니다. 성취기준을 이미 정했다면 2단계에서 시작합니다.',
    destinationLegend: '탐색 결과를 넣을 곳',
    projectOption: '진행 중인 프로젝트',
    projectOptionBody: '결과를 이 프로젝트의 A-3 대화로 보냅니다.',
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
    step2Title: '수업 아이디어 비교',
    step2Body: `${N.futures}에서 성취기준 2~7개로 여덟 가지 수업 아이디어를 비교합니다.`,
    step2Count: '지금 담은 성취기준',
    step2Subjects: (n) => `${n}과목`,
    step2Ready: '비교할 수 있는 개수입니다',
    step2TooFew: '2개 이상 담으면 비교할 수 있습니다',
    step2TooMany: '비교는 7개까지 합니다. 담은 성취기준을 줄입니다',
    step2FromProject: '미래보기를 열면 프로젝트에 등록된 성취기준을 가져옵니다.',
    step2Open: `${N.futures} 열기`,
    step2Footer: '성취기준 코드를 알고 있다면 1단계 없이 여기서 바로 시작합니다.',
    step3Title: '프로젝트로 보내기',
    step3BodyProject: '고른 아이디어와 연결 근거를 확인한 뒤 A-3 대화로 보냅니다.',
    step3BodyNew: '고른 아이디어로 새 프로젝트 만들기 화면을 엽니다.',
    ladderLabel: '반영 단계',
    ladder: [
      { key: 'before', title: '보내기 전', body: '어느 프로젝트에도 저장되지 않았습니다.' },
      { key: 'sent', title: 'A-3 대화에 보냄', body: 'AI가 기존 분석과 비교해 보드 제안을 만듭니다.' },
      { key: 'reflected', title: '보드에 반영됨', body: '팀이 제안을 수락하면 A-3 보드에 저장됩니다.' },
    ],
    ladderNow: '(지금)',
    basketTitle: (n) => `담은 성취기준 ${n}개`,
    basketFromDest: (title) => `${title}로 보낼 성취기준입니다.`,
    basketForNew: '새 프로젝트에 사용할 성취기준입니다.',
    basketEmpty: '아직 담은 성취기준이 없습니다. 1단계 화면에서 담으면 여기에 표시됩니다.',
    basketCompare: `${N.futures}로 비교`,
    basketClear: '비우기',
    basketClearConfirm: '모두 비울까요?',
  },

  // 성취기준 연결 찾기·전체 지도의 담기 줄
  graph: {
    compare: `${N.futures}로 비교`,
    startProject: '이 조합으로 프로젝트 시작',
    tooFew: '2개 이상 담으면 미래보기로 비교할 수 있습니다.',
    tooMany: '미래보기 비교는 7개까지 합니다. 담은 성취기준을 줄입니다.',
    basketCount: (n) => `담은 성취기준 ${n}`,
    openInNeighbor: `${N.neighbor}로 보기`,
  },

  // 미래보기 보내기 확인 창
  send: {
    projectTitle: 'A-3로 보낼 내용 확인',
    newTitle: '새 프로젝트로 가져갈 내용 확인',
    openProjectAction: 'A-3로 보낼 내용 확인',
    openNewAction: '새 프로젝트로 가져갈 내용 확인',
    openFromBridges: '이 연결을 A-3에 가져가기',
    a3Procedure: (label) => label,
    teamProcedure: (code) => `팀의 현재 절차는 ${code}입니다. 보내도 현재 절차는 바뀌지 않습니다. 초안은 팀이 A-3에서 대화할 때 입력창에 넣을 수 있습니다.`,
    teamAtA3: '팀이 A-3에 있습니다. 프로젝트로 돌아가면 대화 입력창에 초안을 넣을 수 있습니다.',
    boardLine: (status) => `A-3 보드 (마지막 조회 기준): ${status}`,
    boardRecheck: '새로 확인',
    boardRechecking: '확인 중',
    boardRecheckFailed: '최신 저장 상태 확인 실패',
    boardRechecked: '보드 상태를 다시 확인했습니다. 이번 아이디어의 반영 여부는 보낸 뒤 프로젝트 화면에서 표시됩니다.',
    contentLegend: '보내는 내용',
    ideaItem: '수업 아이디어 1개',
    ideaItemNote: '상황, 탐구 질문, 과목별 역할, 활동 순서가 함께 들어갑니다.',
    keywordItem: (n) => `연결 키워드 ${n}개와 근거`,
    standardsItem: (n) => `성취기준 ${n}개`,
    standardsRegistered: (registered, total) => registered === total
      ? `${total}개 모두 이 프로젝트에 이미 등록된 성취기준입니다. 프로젝트 성취기준 목록은 바뀌지 않습니다.`
      : `${total}개 중 ${registered}개가 이 프로젝트에 등록되어 있습니다. 보내도 프로젝트 성취기준 목록은 바뀌지 않습니다.`,
    standardsAlways: '성취기준은 항상 함께 보냅니다.',
    notSent: '고르지 않은 아이디어는 보내지 않습니다. 같은 성취기준으로 미래보기를 다시 열면 다시 볼 수 있습니다.',
    afterTitle: '보낸 뒤 진행 순서',
    after: [
      'A-3 대화 입력창에 초안이 준비됩니다. 내 화면에만 있고 팀원에게는 아직 보이지 않습니다.',
      '대화로 보내면 AI가 기존 분석과 비교해 핵심 요소 통합·조정 제안을 만듭니다.',
      '제안을 수락해야 A-3 보드에 저장됩니다.',
    ],
    footerNote: '보내기 전까지 프로젝트는 바뀌지 않습니다.',
    submit: 'A-3로 보내기',
    copy: '초안 복사',
    draftDetails: '보낼 초안 전체 보기',
    draftTextLabel: '보낼 초안',
    copied: '초안을 복사했습니다. 프로젝트의 A-3 대화에 붙여 넣으면 됩니다.',
    copyFailed: '자동 복사를 사용할 수 없습니다. 보낼 초안 전체 보기를 펼쳐 직접 복사해 주세요.',
    saveFailed: '이 브라우저에 초안을 저장하지 못했습니다. 초안 복사를 사용합니다.',
    readOnlyReason: '이 프로젝트는 읽기 전용이라 보낼 수 없습니다. 초안 복사만 할 수 있습니다.',
    replaceWarning: '이 프로젝트에 아직 대화에 넣지 않은 탐색 초안이 있습니다. 보내면 새 초안으로 바뀝니다.',
    // 새 프로젝트
    workspaceLabel: '워크스페이스',
    workspaceLoading: '워크스페이스를 불러오는 중입니다.',
    workspaceFailed: '워크스페이스 목록을 불러오지 못했습니다.',
    workspaceEmpty: '워크스페이스가 없습니다. 홈에서 워크스페이스를 먼저 만듭니다.',
    nameLabel: '프로젝트 이름',
    descLabel: '설명',
    descNote: '미래보기에서 고른 아이디어의 제목과 탐구 질문을 넣었습니다. 고쳐 써도 됩니다.',
    duplicateTitle: '같은 이름의 프로젝트가 있습니다',
    duplicateBody: (name) => `이 워크스페이스에 ${name} 프로젝트가 있습니다. 새로 만들지 않고 그 프로젝트의 A-3로 보낼 수 있습니다.`,
    duplicateAction: '그 프로젝트의 A-3로 보내기',
    duplicateCheckFailed: '같은 이름의 프로젝트가 있는지 확인하지 못했습니다.',
    notCarriedNew: '상황 설명, 과목별 역할, 활동 순서는 새 프로젝트에 저장되지 않습니다. 필요하면 프로젝트를 만든 뒤 대화에 붙여 넣습니다.',
    newFooterNote: '다음 화면에서 만들기를 마쳐야 저장됩니다.',
    newSubmit: '프로젝트 만들기 화면으로',
  },

  // 미래보기 화면 안의 안내
  futures: {
    howTo: '반영 방법 보기',
    howToBody: [
      '미래보기는 고른 성취기준만 사용합니다. 프로젝트의 기존 주제와 분석 내용은 아이디어를 만들 때 쓰지 않으니, 결과를 기존 설계와 비교합니다.',
      '보낸 초안은 프로젝트의 A-3 대화에서 검토하고, AI 제안을 수락해야 보드에 저장됩니다. 프로젝트의 진행 절차와 생략 상태는 바뀌지 않습니다.',
      '이어서 시뮬레이션은 보드에 저장된 설계를 사용합니다. 복사만 한 초안은 시뮬레이션에 들어가지 않습니다.',
    ],
    projectStandardsTitle: '현재 프로젝트의 성취기준',
    projectStandardsLoading: '프로젝트 성취기준 불러오기',
  },

  // 프로젝트 화면 안내 줄
  strip: {
    regionLabel: '미래보기 탐색 초안 반영 상태',
    entryTitle: '아이디어 탐색',
    entryBody: '미래보기에서 고른 아이디어를 이 A-3 대화로 가져올 수 있습니다.',
    entryAction: '아이디어 탐색 열기',
    beforeA3Title: 'A-3에서 검토할 탐색 초안 1건',
    beforeA3Body: '팀이 A-3로 이동하면 대화 입력창에 넣을 수 있습니다. 탐색 때문에 현재 절차를 옮기지 않습니다.',
    arrivedTitle: '미래보기 탐색 초안 1건 도착',
    arrivedBody: '입력창에 넣은 뒤 보내면 AI가 기존 분석과 비교합니다. 보내기 전에는 팀원에게 보이지 않습니다.',
    insert: '대화 입력창에 넣기',
    reinsert: '초안 다시 넣기',
    inserted: '대화 입력창에 넣었습니다. 내용을 확인하고 보냅니다.',
    readOnlyInsert: '읽기 전용 프로젝트라 대화에 넣을 수 없습니다.',
    sentTitle: '미래보기 탐색 초안',
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
    reopen: `${N.futures} 다시 열기`,
    dismiss: '안내 닫기',
    stepsLabel: '반영 단계',
    steps: { sent: '대화에 보냄', reviewing: '제안 검토 중', reflected: '보드에 반영' },
    savedAt: (time) => time,
  },

  // 홈 카드의 초안 한 줄 (상태 이름은 UI_COPY.status)
  homeDraftLine: {
    arrived: 'A-3에서 검토할 탐색 초안 1건이 있습니다.',
    sent: '탐색 초안을 A-3 대화에 보냈습니다.',
    reflected: '탐색 초안의 제안이 보드에 반영되었습니다.',
    rejected: '탐색 초안의 제안을 반영하지 않았습니다.',
    unconfirmed: '탐색 초안 제안의 저장 확인이 필요합니다.',
  },

  // 프로젝트 화면 헤더
  projectHeader: {
    explore: '아이디어 탐색',
    exploreTitle: '이 프로젝트로 수업 아이디어 탐색',
    skippedNote: '생략한 단계가 있는 프로젝트는 현재 이어서 시뮬레이션을 지원하지 않습니다. 아이디어 탐색은 사용할 수 있습니다.',
  },

  // 미래보기 → A-3 인계 정책 안내 (futuresProjectHandoff.handoffPolicy)
  policy: {
    demo: '시연 모드는 A-3 대신 성취기준·단원 선택 화면을 사용합니다. 원래 프로젝트에서 이어서 진행해 주세요.',
    generating: '시뮬레이션 생성 중입니다. 완료된 뒤 연결 아이디어를 탐색해 주세요.',
    failed: '생성이 중단된 프로젝트입니다. 복구 상태를 확인한 뒤 탐색해 주세요.',
    simulation: '시뮬레이션 결과는 읽기 전용입니다. 탐색 결과는 비교·참고용으로 복사할 수 있으며 원본에 저장되지 않습니다.',
    viewer: '열람 권한으로 탐색 중입니다. 복사한 결과는 편집 권한이 있는 팀원과 검토해 주세요.',
    skipped: 'A-3가 생략된 상태입니다. 탐색은 참고용이며, 반영하려면 프로젝트에서 단계 상태를 먼저 확인해 주세요.',
    locked: 'A-3 보드가 잠겨 있습니다. 탐색 결과를 검토하고, 반영할 때 프로젝트에서 잠금 상태를 확인해 주세요.',
    normal: '보내기를 누르면 원래 프로젝트의 A-3 대화로 초안을 가져갑니다. 기존 분석과 비교해 반영할 초안을 요청합니다.',
  },

  // A-3 보드 저장 상태 (마지막 조회 기준)
  board: {
    unknown: '저장 상태 확인 필요',
    none: '아직 저장된 보드 없음',
    locked: '저장된 보드 · 잠김',
    confirmed: '저장된 보드 · 확정됨',
    draft: '저장된 보드 · 초안',
  },

  // 대화로 보내는 인계 초안 본문 (AI와 팀원이 읽는다)
  handoff: {
    header: '[A-3 성취기준 분석 · 연결 아이디어 탐색 결과]',
    project: (title) => `참고 프로젝트: ${title}`,
    instruction: '아래 내용은 검토용 탐색 초안입니다. 기존 주제와 성취기준 분석에 비추어 적합성을 검토하고, ‘핵심 요소 통합·조정’에 반영할 초안을 제안해 주세요. 기존 내용을 바로 덮어쓰거나 단계를 완료·이동하지 말고 먼저 비교해 주세요. 재구조화 성취기준은 검토 후 별도로 제안해 주세요.',
    standards: '선택한 성취기준',
    bridges: '연결 키워드와 근거',
    bridgeWhy: (why) => `근거: ${why}`,
    idea: '참고할 수업 아이디어',
    ideaTitle: (v) => `제목: ${v}`,
    ideaSituation: (v) => `상황: ${v}`,
    ideaQuestion: (v) => `탐구 질문: ${v}`,
    roles: '과목별 역할',
    activities: '활동과 결과물 (후속 설계 참고)',
    output: (v) => `결과물: ${v}`,
  },
}

/** 프로젝트 역할 코드 → 화면 표기 */
export function roleLabel(role) {
  return EXPLORE_COPY.home.roles[role] || ''
}
