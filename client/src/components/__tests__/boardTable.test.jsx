/**
 * 보드 읽기 화면 표 — 열이 많은 표에서 긴 글 칸이 몇 글자 폭으로 좁아지지 않는지,
 * 옆으로 스크롤되는 표에 가려진 칸 쪽 그림자가 생기는지(2026-10-13).
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import BoardTable, { cellMinWidth } from '../BoardTable'
import TableScrollFrame from '../TableScrollFrame'

const LONG = '모둠별로 공공데이터 포털에서 우리 구의 최근 3년 월별 전력 사용량을 내려받고, 자료 출처와 단위를 조사 기록지에 정리한다'
const MID = '우리 동네 전력 사용 자료 조사'
const wideColumns = ['order', 'activityName', 'description', 'subject', 'hours', 'expectedTime', 'teacherSupport', 'assessmentPoint']
  .map((name) => ({ name, label: name }))
const wideRow = { order: '1', activityName: MID, description: LONG, subject: '과학, 정보', hours: '1~2차시', expectedTime: '90분', teacherSupport: '', assessmentPoint: '조사 기록지(출처·단위 기록 여부)' }

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})

const cells = () => [...host.querySelectorAll('tbody td')].slice(1) // 첫 칸은 행 번호

it('칸 최소 너비: 8자 이하는 없음, 30자 이하는 140px, 그보다 길면 200px', () => {
  expect(cellMinWidth('과학, 정보')).toBeNull()
  expect(cellMinWidth(MID)).toBe(140)
  expect(cellMinWidth(LONG)).toBe(200)
})

it('5열 이상 표는 긴 글 칸에 최소 너비를 두고, 짧은 칸은 줄바꿈 없이 그대로 둔다', async () => {
  await act(async () => root.render(<BoardTable columns={wideColumns} data={[wideRow]} />))
  const byName = Object.fromEntries(wideColumns.map((c, i) => [c.name, cells()[i]]))
  expect(byName.description.firstElementChild.style.minWidth).toBe('200px')
  expect(byName.activityName.firstElementChild.style.minWidth).toBe('140px')
  expect(byName.assessmentPoint.firstElementChild.style.minWidth).toBe('140px')
  for (const name of ['order', 'subject', 'hours', 'expectedTime', 'teacherSupport']) {
    expect(byName[name].firstElementChild).toBeNull()
    expect(byName[name].style.whiteSpace).toBe('nowrap')
  }
  expect(byName.description.textContent).toBe(LONG)
})

it('4열 이하 표(주제 후보 등)는 최소 너비를 두지 않아 종전처럼 틀 안에 맞춘다', async () => {
  const columns = [{ name: 'topic', label: '주제명' }, { name: 'subjects', label: '관련 교과' }, { name: 'rationale', label: '제안 근거' }]
  await act(async () => root.render(<BoardTable columns={columns} data={[{ topic: MID, subjects: '과학, 사회, 수학, 정보', rationale: LONG }]} />))
  expect(host.querySelectorAll('tbody td div')).toHaveLength(0)
  expect(cells().map((td) => td.textContent)).toEqual([MID, '과학, 사회, 수학, 정보', LONG])
})

it('스크롤 틀은 가려진 칸이 있는 쪽에만 그림자를 그리고, 넘치지 않으면 그리지 않는다', async () => {
  let scrollWidth = 1000
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(() => scrollWidth)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 400)
  await act(async () => root.render(<TableScrollFrame><table><tbody><tr><td>칸</td></tr></tbody></table></TableScrollFrame>))
  const frame = host.querySelector('[data-scroll-edges]')
  const shadows = () => host.querySelectorAll('[aria-hidden="true"]').length
  const scrollTo = async (x) => act(async () => { frame.scrollLeft = x; frame.dispatchEvent(new Event('scroll')) })

  expect(frame.getAttribute('data-scroll-edges')).toBe('R')
  expect(shadows()).toBe(1)
  await scrollTo(300)
  expect(frame.getAttribute('data-scroll-edges')).toBe('LR')
  expect(shadows()).toBe(2)
  await scrollTo(600)
  expect(frame.getAttribute('data-scroll-edges')).toBe('L')

  scrollWidth = 400 // 창이 넓어져 표가 틀 안에 다 들어온 경우
  await scrollTo(0)
  expect(frame.getAttribute('data-scroll-edges')).toBe('')
  expect(shadows()).toBe(0)
})
