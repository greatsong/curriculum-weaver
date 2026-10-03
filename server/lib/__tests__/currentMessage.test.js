import { describe, it, expect } from 'vitest'
import { excludeCurrentTeacherMessage } from '../currentMessage.js'
import { buildMessages } from '../../services/aiAgent.js'

const ai = (id, content = '안내') => ({ id, sender_type: 'ai', content })
const t = (id, content) => ({ id, sender_type: 'teacher', content })

describe('excludeCurrentTeacherMessage — AI에게 같은 말이 두 번 가지 않게', () => {
  it('재현: 빼지 않으면 buildMessages 결과에 현재 메시지가 두 번 들어간다', () => {
    const history = [ai('a1'), t('m1', '추천해주세요. 주제에 맞는 성취기준')]
    const roles = buildMessages(history, '추천해주세요. 주제에 맞는 성취기준').filter((m) => m.role === 'user')
    expect(roles).toHaveLength(2)
  })

  it('메시지 번호가 오면 그 메시지만 뺀다 → 현재 메시지는 한 번만 들어간다', () => {
    const history = [ai('a1'), t('m1', '추천해주세요. 주제에 맞는 성취기준')]
    const cleaned = excludeCurrentTeacherMessage(history, { teacherMessageId: 'm1', content: '추천해주세요. 주제에 맞는 성취기준' })
    expect(cleaned.map((m) => m.id)).toEqual(['a1'])
    const users = buildMessages(cleaned, '추천해주세요. 주제에 맞는 성취기준').filter((m) => m.role === 'user')
    expect(users).toHaveLength(1)
    expect(history).toHaveLength(2) // 원본은 그대로
  })

  it('번호가 기록에 없으면 아무것도 빼지 않는다(내용이 같아도)', () => {
    const history = [ai('a1'), t('m0', '네')]
    expect(excludeCurrentTeacherMessage(history, { teacherMessageId: 'mX', content: '네' })).toBe(history)
  })

  it('번호가 없으면(옛 탭) 마지막 AI 답 이후의 같은 내용 메시지 하나만 뺀다', () => {
    const history = [ai('a1'), t('m1', '다른 선생님 의견'), t('m2', '  공통영어  ')]
    expect(excludeCurrentTeacherMessage(history, { content: '공통영어' }).map((m) => m.id)).toEqual(['a1', 'm1'])
  })

  it('마지막 AI 답보다 앞의 같은 말은 실제 반복이라 남긴다', () => {
    const history = [t('m0', '네'), ai('a1')]
    expect(excludeCurrentTeacherMessage(history, { content: '네' })).toBe(history)
  })

  it('같은 내용이 연달아 두 개면 가장 최근 하나만 뺀다', () => {
    const history = [ai('a1'), t('m1', '네'), t('m2', '네')]
    expect(excludeCurrentTeacherMessage(history, { content: '네' }).map((m) => m.id)).toEqual(['a1', 'm1'])
  })

  it('빈 기록·빈 내용·잘못된 입력에도 깨지지 않는다', () => {
    expect(excludeCurrentTeacherMessage([], { content: 'x' })).toEqual([])
    expect(excludeCurrentTeacherMessage(undefined, { content: 'x' })).toEqual([])
    const h = [ai('a1'), null, t('m1', 'x')]
    expect(excludeCurrentTeacherMessage(h, { content: '' })).toBe(h)
    expect(excludeCurrentTeacherMessage(h, {}).length).toBe(3)
  })
})
