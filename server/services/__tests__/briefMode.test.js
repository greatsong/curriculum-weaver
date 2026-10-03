/**
 * 약식 기록(연수 모드) — 분류 데이터 무결성과 AI 지시문 주입 범위를 고정한다.
 *
 * 핵심 위험
 * 1. 약식 블록이 약식을 켜지 않은 팀(팀 채팅·1인 기록)의 지시문에 섞이면 기존 수업 설계가 달라진다.
 * 2. 분류 데이터가 절차·보드 정의와 어긋나면(없는 칸, 필수 칸 누락) 화면 막대와 AI가 서로 다른 말을 한다.
 */
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '../aiAgent.js'
import { buildBriefModeBlock } from '../briefPrompt.js'
import { buildStaticIntro } from '../../routes/chat.js'
import { PROCEDURES, BOARD_TYPES, isProcedureSkippable } from 'curriculum-weaver-shared/constants.js'
import { BOARD_SCHEMAS } from 'curriculum-weaver-shared/boardSchemas.js'
import { PROCEDURE_STEPS } from 'curriculum-weaver-shared/procedureSteps.js'
import {
  resolveBriefMode,
  getBriefFieldClasses,
  getBriefStatus,
  getBriefHelpActions,
  buildBriefIntro,
  seedBriefForm,
  dropEmptyRows,
  buildBoardSavedText,
  BRIEF_SAVED_MARK,
  buildHelpRequestText,
  stripEmptyBoardFields,
  BRIEF_ASK_ONCE,
  BRIEF_HELP_STEPS,
  BRIEF_DEPENDENCIES,
} from 'curriculum-weaver-shared/briefMode.js'

const INTERNAL_CODE = /\b(?:T|A|Ds|DI|E)-\d+-\d+\b/

const baseContext = {
  session: { title: '테스트 프로젝트', subjects: ['영어', '정보'] },
  standards: [],
  materials: [],
  boards: [],
  recentMessages: [],
  procedure: 'T-2-1',
  currentStep: 5,
}

describe('분류 데이터 무결성', () => {
  const codes = Object.keys(PROCEDURES)

  it('모든 절차가 분류되고, 스키마의 필수 칸은 모두 A에 들어간다', () => {
    for (const code of codes) {
      const classes = getBriefFieldClasses(code)
      expect(classes, code).toBeTruthy()
      const schema = BOARD_SCHEMAS[BOARD_TYPES[code]]
      const aNames = classes.a.map((f) => f.name)
      for (const f of schema.fields.filter((x) => x.required)) expect(aNames, `${code}.${f.name}`).toContain(f.name)
      expect(classes.a.length + classes.b.length + classes.c.length).toBe(schema.fields.length)
    }
  })

  it('B(한 번 묻기) 칸은 실제로 있는 선택 칸이다', () => {
    for (const [code, { fields }] of Object.entries(BRIEF_ASK_ONCE)) {
      const schema = BOARD_SCHEMAS[BOARD_TYPES[code]]
      for (const name of fields) {
        const field = schema.fields.find((f) => f.name === name)
        expect(field, `${code}.${name}`).toBeTruthy()
        expect(field.required, `${code}.${name}`).toBeFalsy()
      }
    }
  })

  it('도움 버튼은 AI가 생성·점검하는 실제 스텝을 가리킨다', () => {
    for (const [code, list] of Object.entries(BRIEF_HELP_STEPS)) {
      const steps = PROCEDURE_STEPS[code] || []
      for (const { step } of list) {
        const data = steps.find((s) => s.stepNumber === step)
        expect(data, `${code} step ${step}`).toBeTruthy()
        expect(['generate', 'check'], `${code} step ${step}`).toContain(data.aiCapability)
      }
      expect(getBriefHelpActions(code).length).toBe(list.length)
    }
  })

  it('생략 의존은 앞선, 생략할 수 있는 절차만 가리킨다', () => {
    for (const [code, deps] of Object.entries(BRIEF_DEPENDENCIES)) {
      for (const { dep } of deps) {
        expect(PROCEDURES[dep], dep).toBeTruthy()
        expect(PROCEDURES[dep].order).toBeLessThan(PROCEDURES[code].order)
        expect(isProcedureSkippable(dep), dep).toBe(true)
      }
    }
  })
})

describe('팀 설정 판별', () => {
  it('briefMode가 true일 때만 켠다', () => {
    expect(resolveBriefMode({ briefMode: true })).toBe(true)
    expect(resolveBriefMode({ briefMode: 'true' })).toBe(false)
    expect(resolveBriefMode({})).toBe(false)
    expect(resolveBriefMode(null)).toBe(false)
  })
})

describe('AI 지시문 주입 범위', () => {
  it('약식을 켜지 않으면 지시문이 종전과 같다', () => {
    const before = buildSystemPrompt({ ...baseContext })
    expect(buildSystemPrompt({ ...baseContext, briefMode: false })).toBe(before)
    expect(buildSystemPrompt({ ...baseContext, participationMode: 'recorder' })).toBe(
      buildSystemPrompt({ ...baseContext, participationMode: 'recorder', briefMode: undefined })
    )
    expect(before).not.toContain('약식 기록')
  })

  it('약식을 켜면 약식 블록이 들어가고 스텝별 대화 프로토콜은 빠진다', () => {
    const normal = buildSystemPrompt({ ...baseContext })
    const brief = buildSystemPrompt({ ...baseContext, briefMode: true })
    expect(brief).toContain('[진행 방식 — 약식 기록(연수)')
    expect(brief).toContain('필수: 역할 배분')
    expect(brief).toContain('JSON 키: 역할 배분=roles')
    expect(brief).toContain('역할 예시:')
    // 스텝별 프로토콜(질문으로 이끌기)은 약식에서 넣지 않는다
    expect(normal).toContain('[대화 프로토콜')
    expect(brief).not.toContain('[대화 프로토콜')
    // 이동 규칙과 보드 스키마는 그대로 남는다
    expect(brief).toContain('suggested="T-4"')
    expect(brief).toContain('보드 스키마:')
  })

  it('시연 모드에는 약식 블록을 넣지 않는다', () => {
    const prompt = buildSystemPrompt({ ...baseContext, procedure: 'demo_lesson_plan', mode: 'demo', briefMode: true })
    expect(prompt).not.toContain('약식 기록')
  })

  it('보드 상태를 반영해 채워진 필수 칸과 빈 칸을 알려 준다', () => {
    const empty = buildBriefModeBlock({ procedure: 'T-2-1', boards: [] })
    expect(empty).toContain('비어 있는 필수 역할 배분')
    const filled = buildBriefModeBlock({
      procedure: 'T-2-1',
      boards: [{ procedure_code: 'T-2-1', content: { roles: [{ name: '김', subject: '영어' }] } }],
    })
    expect(filled).toContain('채워진 필수 역할 배분')
    expect(filled).toContain('비어 있는 필수 없음')
  })

  it('앞 절차가 생략됐으면 필요한 최소 정보만 묻게 한다', () => {
    const block = buildBriefModeBlock({ procedure: 'Ds-2-1', boards: [], skippedCodes: ['Ds-1-3'] })
    expect(block).toContain('생략된 앞 절차')
    expect(block).toContain('도구를 사용할 활동 이름')
    expect(block).not.toMatch(INTERNAL_CODE)
    const none = buildBriefModeBlock({ procedure: 'Ds-2-1', boards: [] })
    expect(none).not.toContain('생략된 앞 절차')
  })

  it('지시문 블록에 내부 절차 코드가 없다', () => {
    for (const code of Object.keys(PROCEDURES)) {
      const block = buildBriefModeBlock({ procedure: code, boards: [], skippedCodes: Object.keys(PROCEDURES).filter(isProcedureSkippable) })
      expect(block, code).not.toMatch(INTERNAL_CODE)
    }
  })
})

describe('약식 절차 안내·입력 틀', () => {
  it('짧은 안내는 핵심 질문과 필수·선택 입력을 담고 내부 코드를 쓰지 않는다', () => {
    for (const code of Object.keys(PROCEDURES)) {
      const intro = buildBriefIntro(code, '핵심 질문 예시')
      expect(intro, code).toBeTruthy()
      expect(intro).toContain('필수 입력')
      expect(intro).toContain('약식 기록')
      expect(intro).not.toMatch(INTERNAL_CODE)
      // 기존 정적 안내보다 확실히 짧다
      const full = buildStaticIntro(code)
      if (full) expect(intro.length).toBeLessThan(full.length / 2)
    }
  })

  it('양식은 비어 있는 필수·선택 목록·표에 빈 행 하나를 펼치고, 저장 전 빈 행은 뺀다', () => {
    const seeded = seedBriefForm({}, 'T-2-1')
    expect(Array.isArray(seeded.roles)).toBe(true)
    expect(seeded.roles).toHaveLength(1)
    const kept = seedBriefForm({ roles: [{ memberName: '김' }] }, 'T-2-1')
    expect(kept.roles).toEqual([{ memberName: '김' }])
    const schema = BOARD_SCHEMAS[BOARD_TYPES['T-2-1']]
    expect(dropEmptyRows({ roles: [{ memberName: '' }, { memberName: '김' }], coverageCheck: '' }, schema))
      .toEqual({ roles: [{ memberName: '김' }], coverageCheck: '' })
  })

  it('양식 저장 알림 형식', () => {
    expect(buildBoardSavedText().startsWith(BRIEF_SAVED_MARK)).toBe(true)
    // 절차 이름을 함께 적어 앞 절차의 저장 알림과 헷갈리지 않게 한다(내부 코드는 쓰지 않는다)
    expect(buildBoardSavedText('A-1-1')).toBe('[보드 저장] A-1 주제 선정 기준 논의 및 조정 양식에 적은 내용을 보드에 저장했어요.')
    const block = buildBriefModeBlock({ procedure: 'T-2-1', boards: [] })
    expect(block).toContain(`"${BRIEF_SAVED_MARK}"로 시작하는 메시지`)
  })

  it('도움 요청 머리말 형식', () => {
    expect(buildHelpRequestText('역할 예시')).toBe('[AI 도움: 역할 예시]')
    expect(buildHelpRequestText('역할 예시', ' 김 / 영어\n')).toBe('[AI 도움: 역할 예시]\n김 / 영어')
  })
})

describe('보드 상태·빈 칸 제거', () => {
  it('한글 라벨 키로 저장된 예전 보드도 채워진 것으로 읽는다', () => {
    const status = getBriefStatus('T-2-1', { '역할 배분': [{ 교사명: '김' }] })
    expect(status.allAFilled).toBe(true)
  })

  it('빈 문자열·빈 배열·빈 항목만 있는 칸은 뺀다', () => {
    expect(stripEmptyBoardFields({
      commonVision: '팀 비전',
      commonVisionCandidates: [],
      individualVisions: [{ name: '', vision: '' }],
      note: '  ',
    })).toEqual({ commonVision: '팀 비전' })
  })
})
