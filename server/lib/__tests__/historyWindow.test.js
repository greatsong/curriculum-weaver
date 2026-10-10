/**
 * AI 대화 이력 창(lib/historyWindow.js) — 결정적이고 앞부분이 고정되는지.
 */
import { describe, it, expect } from 'vitest'
import { selectHistoryWindow } from '../historyWindow.js'

const msg = (i, sender = i % 2 ? 'ai' : 'teacher') => ({ id: `m${i}`, sender_type: sender, content: `내용${i}` })
const range = (from, to) => Array.from({ length: to - from }, (_, k) => msg(from + k))
const ids = (list) => list.map((m) => m.id)

describe('selectHistoryWindow', () => {
  const pre = range(100, 110) // 다른 절차 대화 10개

  it('절차 메시지가 20개 이하면 전부 + 진입 직전 대화 8개', () => {
    const proc = range(0, 12)
    const out = selectHistoryWindow(proc, pre)
    expect(ids(out)).toEqual([...ids(pre.slice(-8)), ...ids(proc)])
  })

  it('21~29개는 시작점 0(전부 + 직전 8개), 30개부터 시작점이 10개 단위로 옮겨 간다', () => {
    expect(selectHistoryWindow(range(0, 29), pre)).toHaveLength(8 + 29)
    const at30 = selectHistoryWindow(range(0, 30), pre)
    expect(ids(at30)).toEqual(ids(range(10, 30))) // 직전 대화는 시작점이 0일 때만
    const at39 = selectHistoryWindow(range(0, 39), pre)
    expect(ids(at39)[0]).toBe('m10')
    const at40 = selectHistoryWindow(range(0, 40), pre)
    expect(ids(at40)[0]).toBe('m20')
  })

  it('같은 묶음 안에서는 턴이 늘어도 앞부분이 그대로다(뒤에 붙기만 한다)', () => {
    for (const [a, b] of [[4, 6], [22, 24], [31, 33], [45, 47]]) {
      const prev = ids(selectHistoryWindow(range(0, a), pre))
      const next = ids(selectHistoryWindow(range(0, b), pre))
      expect(next.slice(0, prev.length)).toEqual(prev)
    }
  })

  it('같은 입력이면 같은 결과(결정적)', () => {
    const proc = range(0, 37)
    expect(selectHistoryWindow(proc, pre)).toEqual(selectHistoryWindow(proc, pre))
  })

  it('system 메시지(첨부 알림 등)는 세지도 넣지도 않는다', () => {
    const proc = [...range(0, 5), { id: 'sys', sender_type: 'system', content: '첨부' }, ...range(5, 8)]
    const out = selectHistoryWindow(proc, [{ id: 'sys0', sender_type: 'system' }, ...pre])
    expect(ids(out)).not.toContain('sys')
    expect(ids(out)).not.toContain('sys0')
    expect(out).toHaveLength(8 + 8)
  })

  it('빈 입력도 안전하다', () => {
    expect(selectHistoryWindow([], [])).toEqual([])
    expect(selectHistoryWindow(undefined, undefined)).toEqual([])
  })
})
