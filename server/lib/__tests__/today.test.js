import { describe, it, expect } from 'vitest'
import { formatKoreanToday, buildTodayPromptSection } from '../today.js'
import { buildSystemPrompt } from '../../services/aiAgent.js'

describe('오늘 날짜 (한국 시간)', () => {
  it('UTC로는 전날이어도 한국 날짜로 계산한다', () => {
    // 2026-10-02 16:30 UTC = 2026-10-03 01:30 KST
    expect(formatKoreanToday(new Date('2026-10-02T16:30:00Z'))).toBe('2026년 10월 3일(토)')
  })

  it('한국 자정 직전은 그날로 남는다', () => {
    // 2026-10-03 14:59 UTC = 2026-10-03 23:59 KST
    expect(formatKoreanToday(new Date('2026-10-03T14:59:00Z'))).toBe('2026년 10월 3일(토)')
    expect(formatKoreanToday(new Date('2026-10-03T15:00:00Z'))).toBe('2026년 10월 4일(일)')
  })

  it('프롬프트 섹션은 날짜와 일정 기준 규칙을 담는다', () => {
    const section = buildTodayPromptSection(new Date('2026-10-02T16:30:00Z'))
    expect(section).toContain('[오늘 날짜]')
    expect(section).toContain('2026년 10월 3일(토)')
    expect(section).toContain('이미 지난 날짜로 일정을 잡지 않는다')
  })

  it('채팅 시스템 프롬프트에 오늘 날짜가 들어간다 (팀 일정 절차 포함 모든 절차)', () => {
    const now = new Date('2026-10-02T16:30:00Z')
    for (const procedure of ['prep', 'T-2-3', 'A-2-1']) {
      const prompt = buildSystemPrompt({
        session: { title: 't' }, standards: [], materials: [], boards: [], recentMessages: [],
        procedure, currentStep: null, now,
      })
      expect(prompt).toContain('[오늘 날짜]\n2026년 10월 3일(토), 한국 시간')
    }
  })
})
