/**
 * 인트로 캐싱 + 절차별 맥락 유지 — 종합 테스트
 *
 * 테스트 영역:
 * 1. buildStaticIntro: 정적 인트로 생성 정합성
 * 2. 메시지 병합 로직: 절차별 대화 맥락 유지
 * 3. introCache 복원 로직: loadMessages에서 캐시 구축
 * 4. 엣지 케이스: null, 빈 배열, 잘못된 코드 등
 */

import { PROCEDURES, ACTION_TYPES, PHASES } from 'curriculum-weaver-shared/constants.js'
import { PROCEDURE_STEPS } from 'curriculum-weaver-shared/procedureSteps.js'
import { PROCEDURE_GUIDE } from '../../server/data/procedureGuide.js'

let passed = 0
let failed = 0
const failures = []

function assert(condition, testName) {
  if (condition) {
    passed++
    console.log(`  ✅ ${testName}`)
  } else {
    failed++
    failures.push(testName)
    console.log(`  ❌ ${testName}`)
  }
}

// ──────────────────────────────────────────
// buildStaticIntro 재현 (서버 코드와 동일)
// ──────────────────────────────────────────

function buildStaticIntro(procedureCode) {
  const procInfo = PROCEDURES[procedureCode]
  const guide = PROCEDURE_GUIDE[procedureCode]
  const steps = PROCEDURE_STEPS[procedureCode] || []
  const phaseInfo = Object.values(PHASES).find(p => p.id === procInfo?.phase)
  const isFirst = procedureCode === 'T-1-1'

  if (!procInfo || !guide) return null

  const lines = []

  if (isFirst) {
    lines.push(`안녕하세요! 협력적 수업설계의 AI 공동설계자입니다. 함께 의미 있는 수업을 만들어 보겠습니다.`)
    lines.push('')
  }

  lines.push(`**[${phaseInfo?.name || ''} > ${procedureCode}: ${procInfo.name}]** 절차에 진입했습니다.`)
  lines.push('')

  if (guide.coreQuestion) {
    lines.push(`> **핵심 질문**: ${guide.coreQuestion}`)
    lines.push('')
  }

  lines.push(`| 항목 | 내용 |`)
  lines.push(`|------|------|`)
  if (guide.concept) lines.push(`| **개념** | ${guide.concept} |`)
  if (guide.methods?.length) lines.push(`| **방법/절차** | ${guide.methods.join(' → ') } |`)
  if (guide.notes) lines.push(`| **유의사항** | ${guide.notes} |`)
  if (guide.deliverable) lines.push(`| **산출물** | ${guide.deliverable} |`)
  lines.push('')

  if (steps.length > 0) {
    lines.push(`**이 절차의 스텝 (${steps.length}개):**`)
    for (const s of steps) {
      const actionName = ACTION_TYPES[s.actionType]?.name || s.actionType
      const aiTag = s.aiCapability ? ' 🤖' : ''
      lines.push(`${s.stepNumber}. [${actionName}] ${s.title}${aiTag}`)
    }
    lines.push('')

    const first = steps[0]
    lines.push(`**첫 번째 스텝**: ${first.title}`)
    lines.push(`- ${first.description}`)
    lines.push('')
  }

  lines.push(`이 절차에서 궁금한 점이 있으시면 자유롭게 질문해 주세요!`)

  return lines.join('\n')
}

// ──────────────────────────────────────────
// 메시지 병합 로직 재현 (서버 chat.js와 동일)
// ──────────────────────────────────────────

function buildRecentMessages(allMessages, activeProcedure) {
  const currentProcMessages = allMessages.filter(
    m => (m.procedure_context || m.stage_context) === activeProcedure
  )
  const recentGlobalMessages = allMessages.slice(-10)

  const procSlice = currentProcMessages.slice(-10)
  const mergedMap = new Map()
  for (const m of procSlice) mergedMap.set(m.id, m)
  for (const m of recentGlobalMessages) mergedMap.set(m.id, m)
  const recentMessages = [...mergedMap.values()]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  return recentMessages
}

// ──────────────────────────────────────────
// introCache 복원 로직 재현 (chatStore.js와 동일)
// ──────────────────────────────────────────

function buildIntroCache(msgs) {
  const introsByProcedure = {}
  msgs.forEach(m => {
    const proc = m.stage_context || m.procedure_context
    if (m.sender_type === 'ai' && proc && !introsByProcedure[proc]) {
      introsByProcedure[proc] = m.content
    }
  })
  return introsByProcedure
}

// ══════════════════════════════════════════
// 테스트 1: buildStaticIntro 정합성
// ══════════════════════════════════════════

console.log('\n═══ 테스트 1: buildStaticIntro 정합성 ═══')

// 1-1: 모든 유효한 절차에 대해 인트로 생성 가능
const allProcCodes = Object.keys(PROCEDURES).filter(c => c !== 'prep')
const guideCodes = Object.keys(PROCEDURE_GUIDE)

console.log('\n[1-1] 모든 가이드 있는 절차에 인트로 생성')
for (const code of guideCodes) {
  const intro = buildStaticIntro(code)
  assert(intro !== null && intro.length > 50, `${code}: 인트로 생성 성공 (${intro?.length || 0}자)`)
}

// 1-2: T-1-1은 인사 포함
console.log('\n[1-2] T-1-1 첫 절차 인사 포함')
const t11Intro = buildStaticIntro('T-1-1')
assert(t11Intro.includes('안녕하세요'), 'T-1-1: 인사 포함')
assert(t11Intro.includes('비전설정'), 'T-1-1: 절차명 포함')

// 1-3: T-1-1 이외 절차는 인사 미포함
console.log('\n[1-3] T-1-2는 인사 미포함')
const t12Intro = buildStaticIntro('T-1-2')
assert(!t12Intro.includes('안녕하세요'), 'T-1-2: 인사 미포함')
assert(t12Intro.includes('수업설계 방향 수립'), 'T-1-2: 절차명 포함')

// 1-4: 잘못된 코드
console.log('\n[1-4] 잘못된 절차 코드')
assert(buildStaticIntro('INVALID') === null, 'INVALID: null 반환')
assert(buildStaticIntro('') === null, '빈 문자열: null 반환')
assert(buildStaticIntro(null) === null, 'null: null 반환')
assert(buildStaticIntro(undefined) === null, 'undefined: null 반환')

// 1-5: prep 절차 (가이드 없음)
console.log('\n[1-5] prep 절차 (가이드 없음)')
assert(buildStaticIntro('prep') === null, 'prep: null 반환 (가이드 없음)')

// 1-6: 핵심 요소 포함 검증
console.log('\n[1-6] 인트로 핵심 요소 포함')
for (const code of guideCodes.slice(0, 5)) {
  const intro = buildStaticIntro(code)
  const guide = PROCEDURE_GUIDE[code]
  assert(intro.includes('핵심 질문'), `${code}: 핵심 질문 섹션`)
  assert(intro.includes('| 항목 | 내용 |'), `${code}: 표 형식`)
  if (guide.deliverable) {
    assert(intro.includes(guide.deliverable), `${code}: 산출물 포함`)
  }
}

// 1-7: 스텝이 있는 절차는 스텝 목록 포함
console.log('\n[1-7] 스텝 목록 포함')
for (const code of guideCodes.slice(0, 5)) {
  const steps = PROCEDURE_STEPS[code]
  const intro = buildStaticIntro(code)
  if (steps?.length > 0) {
    assert(intro.includes(`스텝 (${steps.length}개)`), `${code}: 스텝 개수 표시`)
    assert(intro.includes('첫 번째 스텝'), `${code}: 첫 스텝 안내`)
  }
}

// 1-8: 마크다운 테이블 파이프 개수 일관성
console.log('\n[1-8] 마크다운 테이블 파이프 일관성')
for (const code of guideCodes) {
  const intro = buildStaticIntro(code)
  const tableLines = intro.split('\n').filter(l => l.startsWith('|'))
  for (const line of tableLines) {
    const pipeCount = (line.match(/\|/g) || []).length
    assert(pipeCount >= 3, `${code}: 테이블 행 파이프 ${pipeCount}개 (≥3)`)
  }
}

// ══════════════════════════════════════════
// 테스트 2: 메시지 병합 로직
// ══════════════════════════════════════════

console.log('\n═══ 테스트 2: 메시지 병합 로직 ═══')

// 헬퍼: 테스트용 메시지 생성
function makeMsg(id, proc, minutesAgo, sender = 'teacher') {
  return {
    id,
    procedure_context: proc,
    sender_type: sender,
    content: `msg-${id}`,
    created_at: new Date(Date.now() - minutesAgo * 60000).toISOString(),
  }
}

// 2-1: 기본 시나리오 — 절차 1→2→3→4→5, 절차 2로 복귀
console.log('\n[2-1] 1→2→3→4→5 후 절차 2로 복귀')
{
  const msgs = [
    // 절차 1 (50분 전)
    makeMsg('1a', 'T-1-1', 50, 'ai'),
    makeMsg('1b', 'T-1-1', 49),
    makeMsg('1c', 'T-1-1', 48, 'ai'),
    // 절차 2 (40분 전)
    makeMsg('2a', 'T-1-2', 40, 'ai'),
    makeMsg('2b', 'T-1-2', 39),
    makeMsg('2c', 'T-1-2', 38, 'ai'),
    makeMsg('2d', 'T-1-2', 37),
    // 절차 3 (30분 전)
    makeMsg('3a', 'T-2-1', 30, 'ai'),
    makeMsg('3b', 'T-2-1', 29),
    makeMsg('3c', 'T-2-1', 28, 'ai'),
    // 절차 4 (20분 전)
    makeMsg('4a', 'T-2-2', 20, 'ai'),
    makeMsg('4b', 'T-2-2', 19),
    makeMsg('4c', 'T-2-2', 18, 'ai'),
    // 절차 5 (10분 전)
    makeMsg('5a', 'T-2-3', 10, 'ai'),
    makeMsg('5b', 'T-2-3', 9),
    makeMsg('5c', 'T-2-3', 8, 'ai'),
    makeMsg('5d', 'T-2-3', 7),
    makeMsg('5e', 'T-2-3', 6, 'ai'),
    makeMsg('5f', 'T-2-3', 5),
  ]

  const result = buildRecentMessages(msgs, 'T-1-2')
  const resultIds = result.map(m => m.id)

  // 절차 2의 메시지가 포함되어야 함
  assert(resultIds.includes('2a'), '절차 2 메시지(2a) 포함')
  assert(resultIds.includes('2b'), '절차 2 메시지(2b) 포함')
  assert(resultIds.includes('2c'), '절차 2 메시지(2c) 포함')
  assert(resultIds.includes('2d'), '절차 2 메시지(2d) 포함')

  // 최근 전체 메시지도 포함
  assert(resultIds.includes('5f'), '최근 메시지(5f) 포함')

  // 시간순 정렬 확인
  for (let i = 1; i < result.length; i++) {
    assert(
      new Date(result[i].created_at) >= new Date(result[i-1].created_at),
      `시간순 정렬: ${result[i-1].id} ≤ ${result[i].id}`
    )
  }

  // 중복 없음
  const uniqueIds = new Set(resultIds)
  assert(uniqueIds.size === resultIds.length, `중복 없음 (${uniqueIds.size} === ${resultIds.length})`)

  // 최대 20개 이하
  assert(result.length <= 20, `최대 20개 이하 (${result.length}개)`)
}

// 2-2: 같은 절차에 계속 있는 경우 (일반 케이스)
console.log('\n[2-2] 같은 절차에 계속 있는 경우')
{
  const msgs = Array.from({ length: 15 }, (_, i) =>
    makeMsg(`s${i}`, 'T-1-1', 15 - i, i % 2 === 0 ? 'ai' : 'teacher')
  )
  const result = buildRecentMessages(msgs, 'T-1-1')
  // 모두 같은 절차이므로 최대한 포함
  assert(result.length >= 10, `같은 절차 15개 중 ${result.length}개 포함 (≥10)`)
}

// 2-3: 메시지 0개 (빈 프로젝트)
console.log('\n[2-3] 메시지 0개')
{
  const result = buildRecentMessages([], 'T-1-1')
  assert(result.length === 0, '빈 배열 반환')
}

// 2-4: 현재 절차 메시지가 없는 경우 (첫 진입)
console.log('\n[2-4] 현재 절차 메시지 없음 (첫 진입)')
{
  const msgs = [
    makeMsg('a1', 'T-1-1', 10, 'ai'),
    makeMsg('a2', 'T-1-1', 9),
  ]
  const result = buildRecentMessages(msgs, 'T-1-2')
  // 절차 T-1-2 메시지는 없지만 최근 전체 메시지는 포함
  assert(result.length === 2, `최근 전체 메시지 2개 포함`)
  assert(result[0].id === 'a1', '이전 절차 메시지 포함')
}

// 2-5: 현재 절차 메시지가 10개 초과 (슬라이스 테스트)
console.log('\n[2-5] 현재 절차 메시지 15개 (슬라이스)')
{
  const msgs = Array.from({ length: 15 }, (_, i) =>
    makeMsg(`p${i}`, 'T-1-1', 30 - i, i % 2 === 0 ? 'ai' : 'teacher')
  )
  // 다른 절차 최근 메시지 5개 추가
  for (let i = 0; i < 5; i++) {
    msgs.push(makeMsg(`o${i}`, 'T-1-2', 5 - i))
  }

  const result = buildRecentMessages(msgs, 'T-1-1')
  // T-1-1 최근 10개 + T-1-2 최근 5개 (일부 최근 10개에 포함) = 최대 15개
  assert(result.length <= 20, `최대 20개 이하 (${result.length}개)`)

  // T-1-1의 가장 최근 메시지 포함 확인
  const t11Ids = result.filter(m => m.procedure_context === 'T-1-1').map(m => m.id)
  assert(t11Ids.includes('p14'), 'T-1-1 최신 메시지(p14) 포함')
}

// 2-6: procedure_context가 없는 레거시 메시지 (stage_context만 있음)
console.log('\n[2-6] stage_context만 있는 레거시 메시지')
{
  const msgs = [
    { id: 'leg1', stage_context: 'T-1-1', sender_type: 'ai', content: 'legacy', created_at: new Date(Date.now() - 10 * 60000).toISOString() },
    { id: 'leg2', stage_context: 'T-1-1', sender_type: 'teacher', content: 'test', created_at: new Date(Date.now() - 9 * 60000).toISOString() },
  ]
  const result = buildRecentMessages(msgs, 'T-1-1')
  assert(result.length === 2, `stage_context 레거시 메시지 2개 인식`)
}

// 2-7: procedure_context와 stage_context 둘 다 없는 메시지
console.log('\n[2-7] context 없는 메시지')
{
  const msgs = [
    { id: 'nc1', sender_type: 'system', content: '시스템 메시지', created_at: new Date(Date.now() - 5 * 60000).toISOString() },
    makeMsg('nc2', 'T-1-1', 3, 'ai'),
  ]
  const result = buildRecentMessages(msgs, 'T-1-1')
  // 시스템 메시지는 절차 필터에서 제외되지만 최근 전체에는 포함
  assert(result.some(m => m.id === 'nc1'), '시스템 메시지도 최근 전체에 포함')
  assert(result.some(m => m.id === 'nc2'), 'T-1-1 메시지 포함')
}

// ══════════════════════════════════════════
// 테스트 3: introCache 복원 로직
// ══════════════════════════════════════════

console.log('\n═══ 테스트 3: introCache 복원 로직 ═══')

// 3-1: 기본 캐시 구축
console.log('\n[3-1] 기본 캐시 구축')
{
  const msgs = [
    { sender_type: 'ai', stage_context: 'T-1-1', content: 'T-1-1 인트로 내용' },
    { sender_type: 'teacher', stage_context: 'T-1-1', content: '교사 메시지' },
    { sender_type: 'ai', stage_context: 'T-1-1', content: 'T-1-1 두번째 AI' },
    { sender_type: 'ai', stage_context: 'T-1-2', content: 'T-1-2 인트로 내용' },
  ]
  const cache = buildIntroCache(msgs)
  assert(cache['T-1-1'] === 'T-1-1 인트로 내용', '절차별 첫 AI 메시지만 캐시')
  assert(cache['T-1-2'] === 'T-1-2 인트로 내용', '다른 절차도 캐시')
  assert(Object.keys(cache).length === 2, '2개 절차 캐시')
}

// 3-2: 교사 메시지만 있는 절차 → 캐시 안 됨
console.log('\n[3-2] 교사 메시지만 있는 절차')
{
  const msgs = [
    { sender_type: 'teacher', stage_context: 'T-1-1', content: '교사만' },
  ]
  const cache = buildIntroCache(msgs)
  assert(!cache['T-1-1'], '교사 메시지만 → 캐시 안 됨')
}

// 3-3: stage_context 없는 메시지 → 무시
console.log('\n[3-3] context 없는 AI 메시지')
{
  const msgs = [
    { sender_type: 'ai', content: 'context 없음' },
  ]
  const cache = buildIntroCache(msgs)
  assert(Object.keys(cache).length === 0, 'context 없으면 캐시 안 됨')
}

// 3-4: 빈 메시지 배열
console.log('\n[3-4] 빈 메시지 배열')
{
  const cache = buildIntroCache([])
  assert(Object.keys(cache).length === 0, '빈 배열 → 빈 캐시')
}

// 3-5: procedure_context 사용 (stage_context 대신)
console.log('\n[3-5] procedure_context 필드 사용')
{
  const msgs = [
    { sender_type: 'ai', procedure_context: 'A-1-1', content: 'A-1-1 내용' },
  ]
  const cache = buildIntroCache(msgs)
  assert(cache['A-1-1'] === 'A-1-1 내용', 'procedure_context도 인식')
}

// 3-6: 모든 유효 절차에 인트로가 있는 대규모 시나리오
console.log('\n[3-6] 16절차 전체 인트로 캐시')
{
  const msgs = guideCodes.map(code => ({
    sender_type: 'ai',
    stage_context: code,
    content: `${code} 인트로`,
  }))
  const cache = buildIntroCache(msgs)
  assert(Object.keys(cache).length === guideCodes.length, `${guideCodes.length}개 절차 모두 캐시`)
  for (const code of guideCodes) {
    assert(cache[code] === `${code} 인트로`, `${code}: 정확한 내용 캐시`)
  }
}

// ══════════════════════════════════════════
// 테스트 4: 통합 시나리오
// ══════════════════════════════════════════

console.log('\n═══ 테스트 4: 통합 시나리오 ═══')

// 4-1: 전체 워크플로우 시뮬레이션
console.log('\n[4-1] 전체 워크플로우: 진입→대화→이동→복귀')
{
  // 절차 T-1-1 진입: 인트로 생성
  const t11IntroContent = buildStaticIntro('T-1-1')
  assert(t11IntroContent !== null, 'T-1-1 인트로 생성 성공')

  // 인트로 + 대화 메시지 축적
  const allMsgs = [
    { id: 'i1', sender_type: 'ai', procedure_context: 'T-1-1', stage_context: 'T-1-1', content: t11IntroContent, created_at: new Date(Date.now() - 60 * 60000).toISOString() },
    { id: 'm1', sender_type: 'teacher', procedure_context: 'T-1-1', stage_context: 'T-1-1', content: '비전을 세우고 싶습니다', created_at: new Date(Date.now() - 59 * 60000).toISOString() },
    { id: 'm2', sender_type: 'ai', procedure_context: 'T-1-1', stage_context: 'T-1-1', content: '좋은 시작이네요!', created_at: new Date(Date.now() - 58 * 60000).toISOString() },
  ]

  // 절차 T-1-2로 이동
  const t12IntroContent = buildStaticIntro('T-1-2')
  allMsgs.push(
    { id: 'i2', sender_type: 'ai', procedure_context: 'T-1-2', stage_context: 'T-1-2', content: t12IntroContent, created_at: new Date(Date.now() - 50 * 60000).toISOString() },
    { id: 'm3', sender_type: 'teacher', procedure_context: 'T-1-2', stage_context: 'T-1-2', content: '방향을 수립하겠습니다', created_at: new Date(Date.now() - 49 * 60000).toISOString() },
    { id: 'm4', sender_type: 'ai', procedure_context: 'T-1-2', stage_context: 'T-1-2', content: '브레인스토밍을 시작해 볼까요?', created_at: new Date(Date.now() - 48 * 60000).toISOString() },
  )

  // 절차 T-2-1, T-2-2, T-2-3 진행 (각 3개 메시지)
  const laterProcs = ['T-2-1', 'T-2-2', 'T-2-3']
  laterProcs.forEach((proc, pi) => {
    const base = 40 - pi * 10
    allMsgs.push(
      { id: `${proc}-i`, sender_type: 'ai', procedure_context: proc, stage_context: proc, content: buildStaticIntro(proc), created_at: new Date(Date.now() - base * 60000).toISOString() },
      { id: `${proc}-m1`, sender_type: 'teacher', procedure_context: proc, stage_context: proc, content: `${proc} 대화`, created_at: new Date(Date.now() - (base-1) * 60000).toISOString() },
      { id: `${proc}-m2`, sender_type: 'ai', procedure_context: proc, stage_context: proc, content: `${proc} 응답`, created_at: new Date(Date.now() - (base-2) * 60000).toISOString() },
    )
  })

  // T-1-1로 복귀: introCache 확인
  const cache = buildIntroCache(allMsgs)
  assert(cache['T-1-1'] !== undefined, 'T-1-1 캐시 존재 → 인트로 재생성 안 함')
  assert(cache['T-1-2'] !== undefined, 'T-1-2 캐시 존재')

  // T-1-1로 복귀: 대화 맥락 확인
  const contextMsgs = buildRecentMessages(allMsgs, 'T-1-1')
  const contextIds = contextMsgs.map(m => m.id)
  assert(contextIds.includes('i1'), '복귀 시 T-1-1 인트로 메시지 포함')
  assert(contextIds.includes('m1'), '복귀 시 T-1-1 교사 메시지 포함')
  assert(contextIds.includes('m2'), '복귀 시 T-1-1 AI 응답 포함')
  assert(contextMsgs.length <= 20, `복귀 시 메시지 20개 이하 (${contextMsgs.length}개)`)

  // 시간순 정렬
  for (let i = 1; i < contextMsgs.length; i++) {
    assert(
      new Date(contextMsgs[i].created_at) >= new Date(contextMsgs[i-1].created_at),
      `통합 시간순: ${contextMsgs[i-1].id} ≤ ${contextMsgs[i].id}`
    )
  }
}

// 4-2: 대량 메시지 상황 (절차당 20개 대화, 5절차 = 100개)
console.log('\n[4-2] 대량 메시지 (100개) 절차 2로 복귀')
{
  const procs = ['T-1-1', 'T-1-2', 'T-2-1', 'T-2-2', 'T-2-3']
  const allMsgs = []
  procs.forEach((proc, pi) => {
    for (let i = 0; i < 20; i++) {
      const minutesAgo = (4 - pi) * 100 + (20 - i)
      allMsgs.push(makeMsg(`${proc}-${i}`, proc, minutesAgo, i % 2 === 0 ? 'ai' : 'teacher'))
    }
  })

  const result = buildRecentMessages(allMsgs, 'T-1-2')
  const t12Count = result.filter(m => m.procedure_context === 'T-1-2').length
  assert(t12Count >= 1, `복귀 절차(T-1-2) 메시지 ${t12Count}개 포함 (≥1)`)
  assert(result.length <= 20, `최대 20개 이하 (${result.length}개)`)

  // 최근 전체 메시지도 포함 (T-2-3이 가장 최근)
  const hasRecent = result.some(m => m.procedure_context === 'T-2-3')
  assert(hasRecent, '가장 최근 절차(T-2-3) 메시지도 포함')
}

// 4-3: openIntroModal 시뮬레이션
console.log('\n[4-3] openIntroModal 동작 시뮬레이션')
{
  const cache = { 'T-1-1': 'T-1-1 인트로 내용', 'T-1-2': 'T-1-2 인트로 내용' }

  // 캐시에 있는 절차
  const content1 = cache['T-1-1']
  assert(content1 === 'T-1-1 인트로 내용', '캐시 히트: T-1-1')

  // 캐시에 없는 절차
  const content2 = cache['T-2-1']
  assert(content2 === undefined, '캐시 미스: T-2-1 (모달 안 열림)')
}

// ══════════════════════════════════════════
// 결과 요약
// ══════════════════════════════════════════

console.log('\n══════════════════════════════════════')
console.log(`✅ 통과: ${passed}`)
console.log(`❌ 실패: ${failed}`)
if (failures.length > 0) {
  console.log('\n실패 목록:')
  failures.forEach(f => console.log(`  - ${f}`))
}
console.log('══════════════════════════════════════')

process.exit(failed > 0 ? 1 : 0)
