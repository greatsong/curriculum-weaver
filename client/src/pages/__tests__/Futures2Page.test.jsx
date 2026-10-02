import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Futures2Page from '../Futures2Page'
import { ALL_STANDARDS } from '../../../../server/data/standards.js'

vi.mock('../../lib/api', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }))
vi.mock('../../lib/futures2Scene', () => ({
  colorOfStandard: () => '#2BF59B', colorOfStone: () => '#2BF59B', startDust: () => () => {},
  createFuturesScene: () => ({ destroy: vi.fn(), setBridges: vi.fn(), setModel: vi.fn() }),
}))
const fields = ['key', 'code', 'subject', 'subject_group', 'school_level', 'content']
const rows = [
  ['k1', '[12생과01-05]', '생명과학', '과학', '고등학교', '질환을 예방하는 생활 습관을 토의한다.'],
  ['k2', '[12화학01-01]', '화학', '과학', '고등학교', '화학의 유용성을 설명한다.'],
  ['k3', '[12운건01-01]', '운동과 건강', '체육', '고등학교', '운동으로 질환을 예방한다.'],
  ['k4', '[9수01-01]', '수학', '수학', '중학교', '소인수분해를 한다.'],
]
function Url() { const location = useLocation(); return <output data-testid="url">{location.search}</output> }
let root, host, get, post
async function mount(entry = '/futures2') {
  await act(async () => root.render(<MemoryRouter initialEntries={[entry]}><Futures2Page get={get} post={post} /><Url /></MemoryRouter>))
}
async function change(element, value) {
  await act(async () => {
    const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value)
    element.dispatchEvent(new Event(element.tagName === 'TEXTAREA' ? 'input' : 'change', { bubbles: true }))
  })
}
async function click(text) {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)
  expect(button).toBeTruthy()
  await act(async () => button.click())
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  get = vi.fn().mockResolvedValue({ fields, rows }); post = vi.fn().mockResolvedValue({ bridges: null })
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.clearAllMocks() })

describe('타임스톤 성취기준 입력', () => {
  it('실제 기본 세트 두 개를 전환하고 3과목 6개를 표시하며 미래는 자동 생성하지 않는다', async () => {
    const standards = ALL_STANDARDS.map(s => ({ ...s, key: `${s.code}|${s.subject}` }))
    get.mockResolvedValue({ fields, rows: standards.map(s => fields.map(f => s[f])) })
    await mount()
    await click('음악 · 수학 · 국어')
    expect(host.querySelectorAll('.fu-chip')).toHaveLength(6)
    expect(host.querySelector('h2').textContent).toContain('3과목 · 6 / 7개')
    expect(host.querySelector('[aria-label="학교급"]').value).toBe('고등학교')
    await act(async () => vi.advanceTimersByTime(1000))
    expect(post.mock.calls.every(([url]) => url === '/api/futures2/bridges')).toBe(true)
    await click('미술 · 정보 · 영어')
    expect(host.querySelectorAll('.fu-chip')).toHaveLength(6)
    expect(host.querySelector('.fu-slots').textContent).toContain('[12미01-03]')
    expect(host.querySelector('.fu-slots').textContent).not.toContain('[12음02-01]')
  })
  it('교과 목록에서 골라 URL에 반영하고 2개부터 연결 분석만 요청한다', async () => {
    await mount()
    await change(host.querySelector('#fu2-subject'), '과학')
    expect(host.querySelectorAll('.fu-result')).toHaveLength(2)
    await act(async () => host.querySelector('.fu-result').click())
    expect(host.querySelectorAll('.fu-chip')).toHaveLength(1)
    await act(async () => vi.advanceTimersByTime(1000))
    expect(post).not.toHaveBeenCalled()
    await act(async () => host.querySelector('.fu-result').click())
    await act(async () => vi.advanceTimersByTime(1000))
    expect(post).toHaveBeenCalledWith('/api/futures2/bridges', { codes: ['k1', 'k2'] }, { timeoutMs: 120_000 })
    expect(post.mock.calls.some(([url]) => url === '/api/futures2')).toBe(false)
    expect(host.querySelector('[data-testid="url"]').textContent).toContain('k1%2Ck2')
  })
  it('여러 코드 입력은 다른 학교급도 찾고 오류·중복을 안내하며 선택을 보존한다', async () => {
    await mount('/futures2?codes=k1')
    await change(host.querySelector('#fu2-bulk'), '[12생과01-05]\n[9수01-01]\n[12없음99-99]')
    await click('코드 넣기')
    expect(host.querySelectorAll('.fu-chip')).toHaveLength(2)
    expect(host.querySelector('[role="status"]').textContent).toContain('코드 1개를 넣었습니다.')
    expect(host.querySelector('[role="status"]').textContent).toContain('이미 고른 1개')
    expect(host.querySelector('[role="status"]').textContent).toContain('[12없음99-99]')
    expect(host.querySelector('#fu2-bulk').value).toContain('[12없음99-99]')
    await change(host.querySelector('#fu2-bulk'), '[12없음99-99]')
    await click('코드 넣기')
    expect(host.querySelectorAll('.fu-chip')).toHaveLength(2)
    expect(host.querySelector('[role="status"]').textContent).toContain('코드 0개를 넣었습니다.')
  })
  it('학교급 변경 시 교과 필터를 초기화하고 모델 변경 시 입력 선택을 유지한다', async () => {
    await mount('/futures2?codes=k1,k4')
    await change(host.querySelector('#fu2-subject'), '과학')
    await change(host.querySelector('[aria-label="학교급"]'), '중학교')
    expect(host.querySelector('#fu2-subject').value).toBe('')
    await click('정밀Opus 5.5')
    expect(host.querySelector('[data-testid="url"]').textContent).toContain('codes=k1%2Ck4')
    expect(host.querySelector('[data-testid="url"]').textContent).toContain('model=precise')
  })
})
