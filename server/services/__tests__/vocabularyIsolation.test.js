/**
 * 어휘 격리(vocabulary isolation) 봉인 테스트
 *
 * 원칙: "모델이 본 적 없는 어휘는 뱉을 수 없다."
 * 내부 절차 코드(T-1-1, T-1-2 …)는 DB·코드 전용 식별자이며,
 * 모델에게 보이는 모든 텍스트(시스템 프롬프트·대화 이력)에는
 * 가이드북 표시 코드(T-1, T-2 …)만 존재해야 한다.
 *
 * 이 테스트가 깨지면: 새로 추가된 프롬프트 섹션이 내부 코드를 노출하고 있다는 뜻.
 * 해당 섹션을 getProcedureDisplayCode / getProcedureLabel / xmlProcToken /
 * replaceInternalProcedureCodes 로 감싸서 고칠 것. (테스트를 완화하지 말 것)
 */
import { describe, it, expect } from 'vitest'
import {
  PROCEDURES,
  DISPLAY_TO_INTERNAL,
  normalizeProcedureCode,
  replaceInternalProcedureCodes,
  BOARD_TYPES,
} from 'curriculum-weaver-shared/constants.js'
import { buildSystemPrompt, buildMessages } from '../aiAgent.js'
import {
  extractAiSuggestions,
  extractCoherenceCheck,
  extractProcedureAdvance,
} from '../../routes/chat.js'

// 내부 절차 코드 패턴 — 3분절 (T-1-1, Ds-2-2, DI-1-1 …)
const INTERNAL_CODE = /\b(?:T|A|Ds|DI|E)-\d+-\d+\b/g

const ALL_PROCEDURES = Object.keys(PROCEDURES)

// ──────────────────────────────────────────
// 1. 매핑 무결성 — 표시↔내부 전단사
// ──────────────────────────────────────────

describe('표시 코드 매핑 무결성', () => {
  it('displayCode는 절차별로 유일하다 (전단사)', () => {
    const displays = Object.values(PROCEDURES)
      .map((p) => p.displayCode)
      .filter(Boolean)
    expect(new Set(displays).size).toBe(displays.length)
  })

  it('DISPLAY_TO_INTERNAL 역매핑이 완전하다', () => {
    for (const [code, proc] of Object.entries(PROCEDURES)) {
      if (proc.displayCode) {
        expect(DISPLAY_TO_INTERNAL[proc.displayCode]).toBe(code)
      }
    }
  })

  it('normalizeProcedureCode — 내부·표시·prep·미지·비문자 모두 안전', () => {
    // 내부 코드는 그대로
    for (const code of ALL_PROCEDURES) {
      expect(normalizeProcedureCode(code)).toBe(code)
    }
    // 표시 코드는 내부로
    for (const [display, internal] of Object.entries(DISPLAY_TO_INTERNAL)) {
      expect(normalizeProcedureCode(display)).toBe(internal)
    }
    // 공백 포함 표시 코드도 수용
    expect(normalizeProcedureCode(' T-2 ')).toBe('T-1-2')
    // 미지 코드는 원본 유지 (호출부에서 존재 검증)
    expect(normalizeProcedureCode('E-2-2')).toBe('E-2-2')
    expect(normalizeProcedureCode('Z-9')).toBe('Z-9')
    // null/undefined 안전
    expect(normalizeProcedureCode(null)).toBe(null)
    expect(normalizeProcedureCode(undefined)).toBe(undefined)
  })
})

// ──────────────────────────────────────────
// 2. 시스템 프롬프트 — 19개 절차 전부 내부 코드 0건
// ──────────────────────────────────────────

// 실전과 유사한 리치 컨텍스트: 이전 절차 보드(내부 코드 키) + 확정 내용
function buildRichContext(procedure) {
  const currentOrder = PROCEDURES[procedure].order
  const boards = Object.entries(PROCEDURES)
    .filter(([, p]) => p.order < currentOrder)
    .map(([code]) => ({
      procedure_code: code,
      board_type: BOARD_TYPES[code],
      content: { note: `${code} 절차에서 확정한 내용`, keywords: ['협력', '데이터'] },
    }))
    .filter((b) => b.board_type)
  return {
    session: { title: '기후위기와 우리 동네', description: '융합 수업 설계' },
    standards: [],
    materials: [],
    boards,
    recentMessages: [],
    procedure,
    currentStep: 1,
  }
}

describe('시스템 프롬프트 어휘 격리 — 절차 19종 전수', () => {
  for (const procedure of ALL_PROCEDURES) {
    it(`${procedure}: 프롬프트에 내부 절차 코드가 없다`, () => {
      const prompt = buildSystemPrompt(buildRichContext(procedure))
      const leaks = prompt.match(INTERNAL_CODE) || []
      expect(leaks, `내부 코드 노출: ${[...new Set(leaks)].join(', ')}`).toEqual([])
    })
  }
})

// ──────────────────────────────────────────
// 2-B. 시연 모드 — 자립 보드 코드(demo_lesson_plan)가 스크럽/격리에 무해
// ──────────────────────────────────────────

describe('시연 모드 어휘 격리 + 분기', () => {
  const demoContext = {
    session: { title: '중학교 과학 한 차시 실연', description: '임용 실연 준비' },
    standards: [
      { curriculum_standards: { code: '9과01-01', content: '힘과 운동을 설명한다.', subject_group: '과학' } },
    ],
    materials: [],
    boards: [],
    recentMessages: [],
    procedure: 'demo_lesson_plan',
    currentStep: null,
    mode: 'demo',
    tone: 'coaching',
  }

  it('demo_lesson_plan 프롬프트에 내부 절차 코드가 없다', () => {
    const prompt = buildSystemPrompt(demoContext)
    const leaks = prompt.match(INTERNAL_CODE) || []
    expect(leaks, `내부 코드 노출: ${[...new Set(leaks)].join(', ')}`).toEqual([])
  })

  it('demo_lesson_plan는 유효 프롬프트를 생성한다(시스템 오류 아님)', () => {
    const prompt = buildSystemPrompt(demoContext)
    expect(prompt).not.toContain('시스템 오류')
    expect(prompt).toContain('교수학습과정안')
  })

  it('단일 교과여도 융합 가드를 발동하지 않는다 + 코치 톤이 주입된다', () => {
    const prompt = buildSystemPrompt(demoContext)
    expect(prompt).not.toContain('융합 가드')
    expect(prompt).not.toContain('다른 교과의 성취기준을')
    expect(prompt).toContain('코치')
  })

  it('demo_lesson_plan 코드는 스크럽·정규화가 원본을 보존한다', () => {
    expect(replaceInternalProcedureCodes('demo_lesson_plan 보드')).toBe('demo_lesson_plan 보드')
    expect(normalizeProcedureCode('demo_lesson_plan')).toBe('demo_lesson_plan')
  })
})

// ──────────────────────────────────────────
// 3. 대화 이력 스크럽 — 옛 메시지의 내부 코드가 모델 입력에서 제거
// ──────────────────────────────────────────

describe('대화 이력 어휘 격리', () => {
  it('가드 이전 저장 메시지의 내부 코드를 표시 코드로 스크럽한다', () => {
    const history = [
      { sender_type: 'ai', content: '현재 T-1-2 절차입니다. Ds-1-1은 나중에 다룹니다.' },
      { sender_type: 'teacher', content: 'T-2-1 역할 배분은 언제 하나요?' },
    ]
    const messages = buildMessages(history, '다음은 뭔가요?')
    const joined = messages.map((m) => m.content).join('\n')
    expect(joined.match(INTERNAL_CODE)).toBeNull()
    // 의미는 보존 — 표시 코드로 치환됨
    expect(messages[0].content).toContain('T-2')
    expect(messages[0].content).toContain('Ds-1')
    expect(messages[1].content).toContain('T-3')
  })

  it('system 메시지는 제외하고 사용자 메시지는 마지막에 붙인다 (기존 동작 유지)', () => {
    const history = [
      { sender_type: 'system', content: '자료 업로드됨' },
      { sender_type: 'ai', content: '안녕하세요' },
    ]
    const messages = buildMessages(history, '질문')
    expect(messages).toHaveLength(2)
    expect(messages[1]).toEqual({ role: 'user', content: '질문' })
  })
})

// ──────────────────────────────────────────
// 4. 파서 관용성 — AI가 표시·내부 어느 형식을 내도 내부 코드로 정규화
// ──────────────────────────────────────────

describe('XML 파서 관용성 (표시·내부 양형식 수용)', () => {
  const suggestionJson = '{"keywords": ["협력"]}'

  it('ai_suggestion: 표시 코드(T-2)를 내부 코드(T-1-2)로 정규화', () => {
    const text = `제안드립니다.\n<ai_suggestion type="board_update" procedure="T-2" step="3" action="generate">${suggestionJson}</ai_suggestion>`
    const { suggestions } = extractAiSuggestions(text)
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].procedure).toBe('T-1-2')
  })

  it('ai_suggestion: 내부 코드(T-1-2)도 그대로 수용 (하위 호환)', () => {
    const text = `<ai_suggestion type="board_update" procedure="T-1-2" step="3" action="generate">${suggestionJson}</ai_suggestion>`
    const { suggestions } = extractAiSuggestions(text)
    expect(suggestions[0].procedure).toBe('T-1-2')
  })

  it('ai_suggestion: prep은 양쪽 모두 prep', () => {
    const text = `<ai_suggestion type="board_update" procedure="prep" step="1" action="generate">${suggestionJson}</ai_suggestion>`
    const { suggestions } = extractAiSuggestions(text)
    expect(suggestions[0].procedure).toBe('prep')
  })

  it('procedure_advance: 표시 코드를 정규화하고 존재 검증 통과', () => {
    const { procedureAdvance } = extractProcedureAdvance(
      '좋습니다. <procedure_advance current="T-1" suggested="T-2" reason="비전 확정"/>'
    )
    expect(procedureAdvance).toEqual({ current: 'T-1-1', suggested: 'T-1-2', reason: '비전 확정' })
  })

  it('procedure_advance: 내부 코드도 수용 (하위 호환)', () => {
    const { procedureAdvance } = extractProcedureAdvance(
      '<procedure_advance current="T-1-1" suggested="T-1-2" reason="완료"/>'
    )
    expect(procedureAdvance?.suggested).toBe('T-1-2')
  })

  it('procedure_advance: 존재하지 않는 코드(환각)는 여전히 기각', () => {
    const { procedureAdvance } = extractProcedureAdvance(
      '<procedure_advance current="E-2" suggested="E-2-2" reason="다음"/>'
    )
    expect(procedureAdvance).toBeNull()
  })

  it('coherence_check: procedure·against 모두 정규화', () => {
    const text = `<coherence_check procedure="A-4" against="A-2,A-3">{"aligned":true,"feedback":"정합","details":[]}</coherence_check>`
    const { coherenceCheck } = extractCoherenceCheck(text)
    expect(coherenceCheck.procedure).toBe('A-2-2')
    expect(coherenceCheck.against).toBe('A-1-2,A-2-1')
  })
})

// ──────────────────────────────────────────
// 5. 싱크 가드 회귀 — 표시용 텍스트 치환 (기존 가드 유지 확인)
// ──────────────────────────────────────────

describe('표시용 치환 가드 회귀', () => {
  it('본문 속 내부 코드는 표시 코드로, 미지 패턴은 보존', () => {
    expect(replaceInternalProcedureCodes('T-1-2와 Ds-2-2, 그리고 E-2-2'))
      .toBe('T-2와 Ds-5, 그리고 E-2-2')
  })
})
