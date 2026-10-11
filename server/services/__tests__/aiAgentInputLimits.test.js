/**
 * aiAgent — AI 입력 상한과 오류 노출 정리
 * - buildMessages: 이력 메시지 하나당 8,000자 상한, 결정적으로 잘라 턴마다 같은 접두어 유지(캐시)
 * - 오류 로그: 오류 객체 전체 대신 상태 코드·종류만 남긴다
 * - 절차 안내 오류: 운영에서는 원본 메시지 대신 일반 문구
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

const { streamMock } = vi.hoisted(() => ({ streamMock: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { stream: streamMock, create: vi.fn() }
  },
}))

let mod
beforeAll(async () => {
  mod = await import('../aiAgent.js')
})

const savedEnv = { NODE_ENV: process.env.NODE_ENV, RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT }
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  vi.restoreAllMocks()
})

describe('buildMessages — 이력 메시지 길이 상한', () => {
  it('짧은 메시지는 그대로 둔다', () => {
    const out = mod.buildMessages([{ sender_type: 'teacher', content: '안녕하세요' }], '다음 질문')
    expect(out).toEqual([
      { role: 'user', content: '안녕하세요' },
      { role: 'user', content: '다음 질문' },
    ])
  })

  it('8,000자를 넘는 이력 메시지는 앞 8,000자 + "(이하 생략)"으로 자른다', () => {
    const long = '가'.repeat(9000)
    const [first] = mod.buildMessages([{ sender_type: 'ai', content: long }], 'q')
    expect(first.role).toBe('assistant')
    expect(first.content.startsWith('가'.repeat(mod.HISTORY_MESSAGE_MAX_CHARS))).toBe(true)
    expect(first.content.endsWith('(이하 생략)')).toBe(true)
    expect(first.content.length).toBeLessThan(mod.HISTORY_MESSAGE_MAX_CHARS + 20)
  })

  it('결정적으로 자른다 — 다음 턴에도 같은 이력은 같은 내용(캐시 접두어 유지)', () => {
    const history = [
      { sender_type: 'teacher', content: '질문 1' },
      { sender_type: 'ai', content: '긴 답변 '.repeat(2000) },
    ]
    const turn1 = mod.buildMessages(history, '질문 2')
    const turn2 = mod.buildMessages([...history, { sender_type: 'teacher', content: '질문 2' }, { sender_type: 'ai', content: '짧은 답' }], '질문 3')
    expect(turn2.slice(0, 2)).toEqual(turn1.slice(0, 2))
    // 현재 발화도 같은 변환을 거쳐 다음 턴의 이력과 일치한다
    expect(turn2[2]).toEqual(turn1[2])
  })

  it('서로게이트 쌍 가운데를 자르지 않는다', () => {
    const content = 'a'.repeat(mod.HISTORY_MESSAGE_MAX_CHARS - 1) + '😀' + 'b'.repeat(10)
    const capped = mod.capHistoryContent(content)
    const body = capped.replace(/\n\(이하 생략\)$/, '')
    expect(body.length).toBe(mod.HISTORY_MESSAGE_MAX_CHARS - 1)
    expect(body.endsWith('a')).toBe(true)
  })

  it('현재 발화에도 같은 상한을 적용한다', () => {
    const out = mod.buildMessages([], 'x'.repeat(mod.HISTORY_MESSAGE_MAX_CHARS + 5))
    expect(out[0].content.endsWith('(이하 생략)')).toBe(true)
  })

  it('문자열이 아닌 content는 건드리지 않는다', () => {
    expect(mod.capHistoryContent(null)).toBe(null)
    expect(mod.capHistoryContent(undefined)).toBe(undefined)
  })
})

describe('절차 안내 오류 — 운영 노출 정리', () => {
  const secretError = () => Object.assign(new Error('401 invalid x-api-key sk-ant-SECRET-PART'), {
    status: 401,
    error: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key sk-ant-SECRET-PART' } },
    requestID: 'req_123',
  })

  async function runIntro() {
    streamMock.mockImplementation(() => { throw secretError() })
    const errors = []
    const logged = []
    vi.spyOn(console, 'error').mockImplementation((...args) => logged.push(args.map(String).join(' ')))
    await mod.buildProcedureIntroResponse({ procedure: 'T-1-1', sessionTitle: '융합', boards: [] }, {
      onText: () => {},
      onError: (m) => errors.push(m),
    })
    return { errors, logged }
  }

  it('운영(NODE_ENV=production)에서는 일반 문구를 보낸다', async () => {
    process.env.NODE_ENV = 'production'
    const { errors } = await runIntro()
    expect(errors).toHaveLength(1)
    expect(errors[0]).not.toContain('SECRET')
    expect(errors[0]).toContain('절차 안내')
  })

  it('운영(RAILWAY_ENVIRONMENT)에서도 일반 문구를 보낸다', async () => {
    process.env.NODE_ENV = 'test'
    process.env.RAILWAY_ENVIRONMENT = 'production'
    const { errors } = await runIntro()
    expect(errors[0]).not.toContain('SECRET')
  })

  it('로컬에서는 원본 메시지를 보여 준다(디버깅용)', async () => {
    process.env.NODE_ENV = 'development'
    delete process.env.RAILWAY_ENVIRONMENT
    const { errors } = await runIntro()
    expect(errors[0]).toContain('invalid x-api-key')
  })

  it('서버 로그에는 상태 코드·오류 종류만 남고 메시지는 남지 않는다', async () => {
    process.env.NODE_ENV = 'production'
    const { logged } = await runIntro()
    const line = logged.join('\n')
    expect(line).toContain('status=401')
    expect(line).toContain('type=authentication_error')
    expect(line).toContain('request_id=req_123')
    expect(line).not.toContain('SECRET')
  })

  it('시연 모드 안내도 같은 정책을 따른다', async () => {
    process.env.NODE_ENV = 'production'
    streamMock.mockImplementation(() => { throw secretError() })
    const errors = []
    const logged = []
    vi.spyOn(console, 'error').mockImplementation((...args) => logged.push(args.map(String).join(' ')))
    await mod.buildProcedureIntroResponse({ procedure: 'demo_lesson_plan', mode: 'demo', boards: [] }, {
      onText: () => {},
      onError: (m) => errors.push(m),
    })
    expect(errors[0]).not.toContain('SECRET')
    expect(logged.join('\n')).not.toContain('SECRET')
  })
})

describe('메인 대화 오류 로그', () => {
  it('Claude 호출 오류는 상태 코드·종류만 기록한다', async () => {
    process.env.NODE_ENV = 'production'
    streamMock.mockImplementation(() => {
      throw Object.assign(new Error('boom sk-ant-SECRET'), { status: 529, error: { error: { type: 'overloaded_error' } } })
    })
    const logged = []
    vi.spyOn(console, 'error').mockImplementation((...args) => logged.push(args.map(String).join(' ')))
    const errors = []
    await mod.buildAIResponse({
      session: { id: 's1' }, standards: [], materials: [], boards: [], recentMessages: [],
      userMessage: '안녕', procedure: 'T-1-1', aiModel: 'fast',
    }, { onText: () => {}, onError: (m) => errors.push(m) })
    const line = logged.join('\n')
    expect(line).toContain('status=529')
    expect(line).not.toContain('SECRET')
    expect(errors[0]).not.toContain('SECRET')
  })
})
