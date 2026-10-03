/**
 * 절차 이동 기록 (shared/procedureMove.js) — 정해진 문구와 "지나쳐 간 이동" 정리 규칙.
 * 교사 요청(2026-10-04): 실수로 다음 단계를 누르는 경우, 호기심에 전체 단계를 미리 둘러보는 경우까지 고려.
 *
 * 시뮬레이터는 서버 라우트(계획대로 지우고 기록 저장)와 화면 대기열(기록 뒤 처음 온 절차면 안내 저장)을 흉내 낸다.
 */
import { describe, it, expect } from 'vitest'
import { PROCEDURE_LIST, getProcedureLabel } from 'curriculum-weaver-shared/constants.js'
import {
  planProcedureMove, isMoveNote, decodeMoveMeta, MOVE_NOTE_SENDER, encodeMoveMeta, BROWSE_WINDOW_MS,
} from 'curriculum-weaver-shared/procedureMove.js'

const ORDER = PROCEDURE_LIST.map((p) => p.code)
const T0 = Date.parse('2026-10-09T01:00:00Z')

function makeTeam({ designs = [], skippedCodes = [] } = {}) {
  let seq = 0
  let clock = T0
  const team = {
    messages: [],
    designs: designs.map((d) => ({ updated_at: new Date(T0 - 60_000).toISOString(), ...d })),
    skippedCodes,
    cursor: null,
    wait(ms) { clock += ms },
    now: () => clock,
    add(row) {
      const msg = { id: `m${++seq}`, created_at: new Date(clock).toISOString(), ...row }
      team.messages.push(msg)
      clock += 50
      return msg
    },
    intro(code) {
      if (!team.messages.some((m) => m.sender_type === 'ai' && !isMoveNote(m) && m.procedure_context === code)) {
        team.add({ sender_type: 'ai', procedure_context: code, content: `[${code}] 안내` })
      }
    },
    teacher(code, content = '의견') { team.add({ sender_type: 'teacher', procedure_context: code, content }) },
    saveBoard(code, content) {
      const row = team.designs.find((d) => d.procedure_code === code)
      const updated = { procedure_code: code, content, updated_at: new Date(clock).toISOString() }
      if (row) Object.assign(row, updated)
      else team.designs.push(updated)
      clock += 50
    },
    /** 절차 이동: 서버 계획 실행 → 처음 온 절차면 안내 저장(화면 대기열과 같은 순서) */
    move(to) {
      const from = team.cursor
      team.cursor = to
      const visitedHint = team.messages.some((m) => m.sender_type === 'ai' && !isMoveNote(m) && m.procedure_context === to)
      const plan = planProcedureMove({ messages: team.messages, designs: team.designs, skippedCodes: team.skippedCodes, from, to, now: clock, visitedHint })
      if (plan.duplicate) return plan
      team.messages = team.messages.filter((m) => !plan.removeIds.includes(m.id))
      team.add({ sender_type: 'ai', sender_name: MOVE_NOTE_SENDER, sender_subject: encodeMoveMeta(plan.meta), procedure_context: to, content: plan.content })
      team.intro(to)
      return plan
    },
    notes: () => team.messages.filter(isMoveNote),
    introsOf: (code) => team.messages.filter((m) => m.sender_type === 'ai' && !isMoveNote(m) && m.procedure_context === code),
  }
  return team
}

/** 시작 상태: 그 절차에 들어와 안내를 받은 팀 */
function startAt(code, opts) {
  const team = makeTeam(opts)
  team.cursor = code
  team.intro(code)
  team.wait(5 * 60_000)
  return team
}

describe('앞으로 넘어갈 때 — 떠나는 절차 상태별 문구', () => {
  it('아무 말도 하지 않고 보드도 비었으면 생략 여부를 확인한다', () => {
    const team = startAt('E-1-1')
    team.move('E-2-1')
    expect(team.notes()[0].content).toBe('E-1 수업 성찰과 공동 개선 단계는 생략하시는 거죠? 알겠습니다. E-2 협력 과정 성찰 단계로 넘어갑니다.')
  })

  it('대화는 했지만 보드가 비었으면 나중에 채울 수 있다고 알린다', () => {
    const team = startAt('E-1-1')
    team.teacher('E-1-1')
    team.wait(60_000)
    team.move('E-2-1')
    expect(team.notes()[0].content).toContain('E-1 수업 성찰과 공동 개선 보드는 아직 비어 있습니다. 나중에 돌아와 채울 수 있습니다.')
    expect(team.notes()[0].content).not.toContain('생략하시는')
  })

  it('보드를 일부만 채웠으면 빈 필수 칸을 알린다', () => {
    const fwd = startAt('E-1-1')
    fwd.saveBoard('E-1-1', { rubricGapAnalysis: '시간 부족' })
    fwd.wait(60_000)
    fwd.move('E-2-1')
    expect(fwd.notes()[0].content).toBe('E-1 수업 성찰과 공동 개선의 원인 분석·개선 아이디어 칸이 아직 비어 있습니다. 나중에 돌아와 채울 수 있습니다. E-2 협력 과정 성찰 단계로 넘어갑니다.')
  })

  it('필수 칸을 다 채웠으면 마쳤다고 하고 넘어간다', () => {
    const team = startAt('E-1-1')
    team.saveBoard('E-1-1', { improvements: ['시간 배분 조정'] })
    team.wait(60_000)
    team.move('E-2-1')
    expect(team.notes()[0].content).toBe('E-1 수업 성찰과 공동 개선 단계를 마쳤습니다. E-2 협력 과정 성찰 단계로 넘어갑니다.')
  })

  it('핵심 절차를 비운 채 넘어가면 나중에 채우도록 한 문장을 덧붙인다', () => {
    const team = startAt('T-1-1')
    team.move('T-1-2')
    expect(team.notes()[0].content).toContain('이후 절차에서 T-1 내용을 참고하므로 나중에 채워 주시면 좋습니다.')
  })

  it('여러 절차를 건너뛰면 사이의 빈 절차 수를 알린다(생략·작성된 절차는 빼고 센다)', () => {
    const team = startAt('Ds-1-1', { skippedCodes: ['Ds-1-3'], designs: [{ procedure_code: 'Ds-2-1', content: { a: '작성' } }] })
    team.move('DI-1-1')
    // 사이: Ds-1-2, Ds-1-3(생략), Ds-2-1(작성), Ds-2-2 → 빈 절차 2개
    expect(team.notes()[0].content).toContain('사이에 있는 Ds-2 등 2개 단계도 아직 비어 있습니다.')
  })

  it('팀이 생략 표시한 절차에서 떠날 때는 생략 확인을 묻지 않는다', () => {
    const team = startAt('T-2-2', { skippedCodes: ['T-2-2'] })
    team.move('T-2-3')
    expect(team.notes()[0].content).toBe(`${getProcedureLabel('T-2-3')} 단계로 넘어갑니다.`)
  })
})

describe('되돌아갈 때 — 다시 안내', () => {
  it('다녀간 절차로 돌아오면 보드 현황과 빈 필수 칸을 알린다', () => {
    const team = startAt('E-1-1')
    team.saveBoard('E-1-1', { learningResults: [{ subject: '물리', processResult: '낙하 실험' }] })
    team.wait(60_000)
    team.move('E-2-1')
    team.wait(10 * 60_000)
    team.teacher('E-2-1')
    team.wait(60_000)
    team.move('E-1-1')
    const back = team.notes().at(-1).content
    expect(back).toContain('E-1 수업 성찰과 공동 개선 단계로 돌아왔습니다.')
    expect(back).toContain('보드에는 학생 자료·학습 결과 칸이 채워져 있습니다.')
    expect(back).toContain('비어 있는 필수 칸은')
    expect(back).toContain('[절차 안내 보기]')
    expect(team.introsOf('E-1-1')).toHaveLength(1) // 안내를 새로 만들지 않는다
  })

  it('한 번도 안 가 본 앞 절차로 가면 현황 대신 첫 안내가 이어진다', () => {
    const team = startAt('A-1-1')
    team.wait(60_000)
    team.teacher('A-1-1')
    team.move('T-2-1')
    expect(team.notes().at(-1).content).toBe(`${getProcedureLabel('T-2-1')} 단계로 돌아왔습니다.`)
    expect(team.introsOf('T-2-1')).toHaveLength(1)
  })
})

describe('실수로 누른 경우', () => {
  it('다음 단계를 잘못 눌렀다가 바로 돌아오면 생략 확인과 그 단계 안내를 지우고 돌아왔다는 안내만 남긴다', () => {
    const team = startAt('E-1-1')
    team.teacher('E-1-1', '학생 반응이 좋았어요')
    team.wait(60_000)
    team.move('E-2-1')
    expect(team.introsOf('E-2-1')).toHaveLength(1)
    team.wait(5_000)
    team.move('E-1-1')
    expect(team.notes()).toHaveLength(1)
    expect(team.notes()[0].content.startsWith('E-1 수업 성찰과 공동 개선 단계로 돌아왔습니다.')).toBe(true)
    expect(team.introsOf('E-2-1')).toHaveLength(0)
    // 나중에 제대로 넘어가면 E-2 안내가 다시 만들어진다
    team.wait(10 * 60_000)
    team.saveBoard('E-1-1', { improvements: ['시간 조정'] })
    team.wait(60_000)
    team.move('E-2-1')
    expect(team.notes().at(-1).content).toBe('E-1 수업 성찰과 공동 개선 단계를 마쳤습니다. E-2 협력 과정 성찰 단계로 넘어갑니다.')
    expect(team.introsOf('E-2-1')).toHaveLength(1)
  })

  it('잘못 누른 단계에서 대화를 시작했으면 지우지 않는다', () => {
    const team = startAt('E-1-1')
    team.move('E-2-1')
    team.wait(5_000)
    team.teacher('E-2-1', '여기서 할게요')
    team.wait(5_000)
    team.move('E-1-1')
    expect(team.notes()).toHaveLength(2)
    expect(team.introsOf('E-2-1')).toHaveLength(1)
  })

  it('잘못 누른 단계에서 보드를 저장했으면 지우지 않는다', () => {
    const team = startAt('E-1-1')
    team.move('E-2-1')
    team.wait(5_000)
    team.saveBoard('E-2-1', { structureReview: '메모' })
    team.wait(5_000)
    team.move('E-1-1')
    expect(team.notes()).toHaveLength(2)
  })
})

describe('호기심에 전체 단계를 미리 둘러보는 경우', () => {
  it('처음부터 끝까지 빠르게 둘러보면 기록 한 건과 마지막 절차 안내만 남는다', () => {
    const team = startAt('prep')
    for (const code of ORDER.slice(1)) {
      team.wait(20_000)
      team.move(code)
    }
    expect(team.notes()).toHaveLength(1)
    expect(team.notes()[0].content).toBe(
      '학습자/맥락 정보 제공 단계는 생략하시는 거죠? 알겠습니다. E-2 협력 과정 성찰 단계로 넘어갑니다. 사이에 있는 T-1 등 17개 단계도 아직 비어 있습니다.')
    const introCodes = team.messages.filter((m) => m.sender_type === 'ai' && !isMoveNote(m)).map((m) => m.procedure_context)
    expect(introCodes).toEqual(['prep', 'E-2-1'])
  })

  it('끝까지 둘러본 뒤 처음 절차로 돌아오면 돌아왔다는 안내 하나만 남고 채팅은 원래대로다', () => {
    const team = startAt('T-1-1')
    for (const code of ORDER.slice(ORDER.indexOf('T-1-2'))) {
      team.wait(15_000)
      team.move(code)
    }
    team.wait(15_000)
    team.move('T-1-1')
    expect(team.notes()).toHaveLength(1)
    expect(team.notes()[0].content.startsWith('T-1 공동 비전 설정 단계로 돌아왔습니다.')).toBe(true)
    expect(team.messages.filter((m) => !isMoveNote(m)).map((m) => m.procedure_context)).toEqual(['T-1-1'])
  })

  it('한 절차에 3분 넘게 머물렀다 넘어가면 둘러보기가 아니라 각각 기록한다', () => {
    const team = startAt('T-2-1')
    team.move('T-2-2')
    team.wait(BROWSE_WINDOW_MS + 1_000)
    team.move('T-2-3')
    expect(team.notes()).toHaveLength(2)
    expect(team.introsOf('T-2-2')).toHaveLength(1)
  })

  it('둘러보다 중간 절차에서 대화를 시작하면 거기서 둘러보기가 끝난다', () => {
    const team = startAt('T-1-1')
    team.saveBoard('T-1-1', { sharedVision: '함께 성장', individualVisions: [{ name: '김', vision: '탐구' }] })
    team.wait(60_000)
    team.move('T-1-2'); team.wait(10_000)
    team.move('T-2-1'); team.wait(10_000)
    team.move('T-2-2'); team.wait(10_000)
    team.teacher('T-2-2', '여기부터 하죠')
    team.wait(10_000)
    team.move('T-2-3')
    const notes = team.notes()
    expect(notes).toHaveLength(2)
    expect(decodeMoveMeta(notes[0])).toMatchObject({ origin: 'T-1-1', to: 'T-2-2' })
    expect(notes[0].content).toContain('사이에 있는 T-2 등 2개 단계는 아직 비어 있습니다.')
    expect(decodeMoveMeta(notes[1])).toMatchObject({ origin: 'T-2-2', to: 'T-2-3' })
  })
})

describe('동시에 누른 경우', () => {
  it('같은 이동이 15초 안에 또 오면 기록을 하나만 남긴다', () => {
    const team = startAt('E-1-1')
    const first = team.move('E-2-1')
    expect(first.duplicate).toBeUndefined()
    team.cursor = 'E-1-1'
    team.wait(2_000)
    const second = team.move('E-2-1')
    expect(second.duplicate).toBeTruthy()
    expect(team.notes()).toHaveLength(1)
  })
})

describe('표식', () => {
  it('이동 기록은 sender_name 표식으로 구분하고 이동 정보를 sender_subject에 담는다', () => {
    const team = startAt('A-1-1')
    team.move('A-1-2')
    const note = team.notes()[0]
    expect(note.sender_name).toBe('procedure_move')
    expect(decodeMoveMeta(note)).toEqual({ from: 'A-1-1', to: 'A-1-2', origin: 'A-1-1' })
    expect(isMoveNote({ sender_type: 'ai', content: 'x' })).toBe(false)
    expect(decodeMoveMeta({ sender_subject: '깨진 값' })).toBeNull()
  })
})
