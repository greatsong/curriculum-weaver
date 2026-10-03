/**
 * 미래 보기 화면 문구 — 명세서 1부 §6이 정본. 화면의 모든 한국어 문자열을 여기에 모은다
 * (솔라 윤문 검토·금지어 점검을 한 파일에서 하기 위해).
 * 금지어(§6-9): 자리·별자리·타임스톤·스톤·마방진·마법진·갈래·그리는/그리기/그리지/그립니다·꼭지·만나는 지점·성운·솔직한 메모
 */
export const COPY = {
  title: '미래 지도',
  back: '‹ 워크스페이스',
  intro: '성취기준 2~6개를 고르면 과목이 어떤 키워드에서 만나는지 지도로 보여 주고, 그 연결을 바탕으로 관점 8가지의 수업 아이디어를 만듭니다.',

  pick: {
    title: '고른 성취기준',
    count: (n) => `${n} / 6`,
    placeholder: '코드나 낱말로 찾기 (예: 12생과01-05, 기후)',
    placeholderFull: '6개를 모두 골랐습니다',
    searchAria: '성취기준 검색',
    levelAria: '학교급',
    loading: '성취기준 목록을 불러오는 중…',
    loadError: '성취기준 목록을 불러오지 못했습니다. 새로고침해 주세요.',
    noResult: '맞는 성취기준이 없습니다. 다른 낱말이나 학교급으로 찾아 주세요.',
    help: '코드를 알면 코드로 찾는 것이 가장 빠릅니다. 코드 여러 개를 한 번에 붙여 넣어도 됩니다.',
    example: (subjects) => `예시 조합으로 보기 (${subjects.join('·')})`,
    pasted: (n) => `코드 ${n}개를 추가했습니다.`,
    overflow: '최대 6개까지 고를 수 있습니다.',
    missing: (codes) => `찾지 못한 코드: ${codes.join(', ')}`,
    empty: '고른 성취기준이 여기에 표시됩니다.',
    removeAria: (code) => `${code} 빼기`,
  },

  graph: {
    title: '과목이 만나는 키워드 지도',
    guide: '큰 원은 과목, 원 둘레의 말은 그 과목 성취기준의 원문 키워드입니다. 과목을 가로지르는 선이 연결입니다. 연결을 확인하고, 필요하면 위에서 조합을 고친 뒤 미래 보기를 누릅니다.',
    finding: (s) => `키워드 연결을 찾는 중 · ${s}초`,
    refinding: (s) => `새 조합의 키워드 연결을 찾는 중 · ${s}초`,
    previousTag: '이전 조합',
    result: (n, m) => (m ? `연결 ${n}개 · 연결되지 않은 성취기준 ${m}개` : `연결 ${n}개`),
    zeroRight: '연결 0개',
    zeroLine: '이어지는 키워드를 찾지 못했습니다. 수업 아이디어는 성취기준 원문만으로 만듭니다.',
    errorLine: '키워드 연결을 불러오지 못했습니다. 수업 아이디어는 성취기준 원문만으로 만듭니다.',
    retry: '다시 찾기',
    isolated: '연결된 키워드 없음',
    legendKeyword: '키워드',
    legendKeywordNote: '성취기준 원문 그대로',
    legendShape: '표식 모양은 같은 과목 안의 성취기준 구분',
    innerTitle: '같은 과목 안의 연결',
    legendName: '연결 이름',
    legendNameNote: 'AI가 붙인 이름',
    legendSame: '같은 대상',
    legendMethod: '활동으로 다룸',
    legendStrength: '선이 밝을수록 강한 연결',
    listTitle: '연결 근거',
    kind: { same: '같은 대상', method: '활동으로 다룸' },
    strength: { 3: '강함', 2: '보통', 1: '약함' },
    rowAria: (c, a, b) => `${c.label}: ${a.subject} ${a.word}, ${b.subject} ${b.word}. ${c.why}`,
  },

  decide: {
    basket: '성취기준 담기',
    basketDone: (n) => `성취기준 ${n}개 담김`,
    basketTip: '설계 모드와 프로젝트 만들기에서 이어서 사용할 수 있습니다.',
    modelAria: 'AI 모델',
    models: [
      { id: 'fast', label: '빠른', model: 'Sonnet 5.5', tip: 'Sonnet 5.5로 만듭니다.' },
      { id: 'precise', label: '정밀', model: 'Opus 5.5', tip: 'Opus 5.5로 만듭니다. 시간이 더 걸립니다.' },
    ],
    runNote: '이 지도의 연결을 바탕으로 관점 8가지 수업 아이디어를 만듭니다.',
    run: '미래 보기',
    disabledNote: '성취기준을 2개 이상 골라 주세요.',
  },

  ideas: {
    title: '관점별 수업 아이디어',
    progress: (n) => `${n} / 8 준비됨`,
    done: '마음에 드는 아이디어로 프로젝트를 시작할 수 있습니다.',
    centerTitle: '이번 조합의 연결',
    centerIsolated: (subjects) => `연결되지 않은 성취기준: ${subjects.join(', ')}`,
    centerZero: '이어지는 키워드를 찾지 못했습니다.',
    sameAxis: (label) => `여덟 아이디어 모두 ‘${label}’ 연결을 사용합니다.`,
    axisLine: '연결:',
    light: (subjects) => `비중이 작은 성취기준: ${subjects.join(', ')}`,
    start: '프로젝트 시작',
    startTip: '프로젝트 만들기 화면으로 이동합니다. 제목과 설명이 미리 채워집니다.',
    startAria: (lens, title) => `${lens} 아이디어로 프로젝트 시작: ${title}`,
    making: (s) => `만드는 중 · ${s}초`,
    makingAria: (lens) => `${lens} 아이디어를 만드는 중`,
    retry: '다시 만들기',
    fallbackError: '수업 아이디어를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.',
  },

  footer: '키워드 연결과 수업 아이디어는 AI가 성취기준 원문을 바탕으로 만든 것입니다. 키워드는 원문에 있는 말만 사용하고, 이어지지 않는 성취기준은 억지로 잇지 않습니다. 수업에 사용하기 전에 성취기준 해설과 함께 확인해 주세요.',
}

// 관점 8개 — index 순서는 서버 FUTURE_LENSES와 같다(명세서 1부 §3). 3×3 가운데 칸을 둘러 행 단위로 읽힌다.
export const LENSES = [
  { label: '학교 생활', tip: '학교 안 공간·규칙 개선', icon: 'School' },
  { label: '지역 문제', tip: '지역 현장 조사와 제안', icon: 'MapPin' },
  { label: '지구적 문제', tip: '국가 간 자료 비교', icon: 'Earth' },
  { label: '창작 프로젝트', tip: '작품으로 표현', icon: 'Palette' },
  { label: '진로·직업', tip: '직업인의 역할 수행', icon: 'Briefcase' },
  { label: '데이터 탐구', tip: '자료 수집과 분석', icon: 'ChartColumn' },
  { label: '과학 탐구', tip: '가설 세우기와 검증', icon: 'FlaskConical' },
  { label: '역사적 관점', tip: '과거와 오늘 비교', icon: 'ScrollText' },
]
export const IDEA_AREAS = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'] // "c0 c1 c2" / "c3 mid c4" / "c5 c6 c7"

// 처음 온 교사를 위한 예시 조합(고등 일반 과목 3개·성취기준 6개, 연습 세트 ①)
export const EXAMPLE = { codes: ['[12음02-01]', '[12음03-03]', '[10공수1-03-01]', '[10공수1-03-03]', '[10공국1-06-01]', '[10공국1-06-02]'], subjects: ['음악', '공통수학1', '공통국어1'] }

// 연결 강도 → 선 밝기·굵기(최신 사용자 결정 3)
export const STRENGTH_STYLE = { 3: { opacity: 0.95, width: 2.2 }, 2: { opacity: 0.65, width: 1.8 }, 1: { opacity: 0.38, width: 1.5 } }
export const strengthStyle = (s) => STRENGTH_STYLE[s] || STRENGTH_STYLE[2]

export const FORBIDDEN_WORDS = ['자리', '별자리', '타임스톤', '스톤', '마방진', '마법진', '갈래', '그리는', '그리기', '그리지', '그립니다', '꼭지', '만나는 지점', '성운', '솔직한 메모']
