/**
 * 보드 편집기의 글 칸이 칸보다 긴 글을 가리지 않는지 — 한 줄 입력창 대신 높이가 늘어나는 칸을 쓴다.
 * (교사 피드백 "입력창을 넘어가면 잘린다", 2026-10-12)
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import BoardEditor from '../BoardEditor'
import AutoGrowTextarea from '../AutoGrowTextarea'

const schema = {
  fields: [
    { name: 'topic', label: '최종 선정 주제', type: 'text' },
    { name: 'memo', label: '메모', type: 'textarea' },
    { name: 'tags', label: '키워드', type: 'tags' },
    { name: 'ideas', label: '아이디어', type: 'list' },
    { name: 'goals', label: '교과별 목표', type: 'list', itemSchema: { subject: { label: '교과', type: 'text' }, goal: { label: '학습목표', type: 'textarea' } } },
    { name: 'rows', label: '활동', type: 'table', columns: [{ name: 'name', label: '활동명' }, { name: 'desc', label: '활동 설명' }] },
  ],
  empty: { topic: '', memo: '', tags: [], ideas: [], goals: [], rows: [] },
}
const LONG = '기후 위기와 지역 에너지 전환을 주제로 과학·사회·수학 교과가 함께 데이터를 모으고 해석하는 프로젝트'
const content = {
  topic: LONG, memo: '', tags: ['기후'], ideas: [LONG],
  goals: [{ subject: '과학', goal: '탄소 순환을 설명한다' }],
  rows: [{ name: '자료 조사', desc: LONG }],
}

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

function typeValue(el, value) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
function beforeInput(el, inputType) {
  const e = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true })
  el.dispatchEvent(e)
  return e.defaultPrevented
}
const field = (label) => host.querySelector(`textarea[aria-label="${label}"]`)

it('글 칸(한 줄 칸·표 칸·목록 항목)은 한 줄 입력창이 아니라 늘어나는 칸으로 그리고 긴 글을 그대로 담는다', async () => {
  await act(async () => root.render(<BoardEditor schema={schema} content={content} onSave={() => {}} onCancel={() => {}} />))
  // 남는 한 줄 입력창은 태그 입력(입력 후 Enter로 태그 추가)뿐이다
  const inputs = [...host.querySelectorAll('input')]
  expect(inputs.map((el) => el.placeholder)).toEqual(['입력 후 Enter'])

  expect(field('최종 선정 주제').value).toBe(LONG)
  expect(field('활동 설명').value).toBe(LONG)
  expect(field('아이디어 1').value).toBe(LONG)
  expect(host.querySelectorAll('textarea')).toHaveLength(7) // 주제·메모·아이디어·교과·학습목표·활동명·활동 설명
})

it('고친 글은 표 칸·한 줄 칸 모두 저장 내용에 그대로 들어간다', async () => {
  const onSave = vi.fn()
  await act(async () => root.render(<BoardEditor schema={schema} content={content} onSave={onSave} onCancel={() => {}} />))
  await act(async () => typeValue(field('활동 설명'), `${LONG} 2차시`))
  await act(async () => typeValue(field('최종 선정 주제'), '지역 에너지 전환'))
  const save = [...host.querySelectorAll('button')].find((b) => b.textContent.includes('저장'))
  await act(async () => save.click())
  const draft = onSave.mock.calls[0][0]
  expect(draft.rows[0].desc).toBe(`${LONG} 2차시`)
  expect(draft.topic).toBe('지역 에너지 전환')
  expect(draft.ideas).toEqual([LONG])
})

it('한 줄 칸은 Enter 줄바꿈만 막고 글자 입력은 막지 않는다. 여러 줄 칸은 줄바꿈을 그대로 둔다', async () => {
  await act(async () => root.render(<BoardEditor schema={schema} content={content} onSave={() => {}} onCancel={() => {}} />))
  for (const label of ['최종 선정 주제', '활동 설명', '아이디어 1']) {
    expect(beforeInput(field(label), 'insertLineBreak')).toBe(true)
    expect(beforeInput(field(label), 'insertText')).toBe(false)
    expect(beforeInput(field(label), 'insertFromPaste')).toBe(false)
  }
  expect(beforeInput(field('메모'), 'insertLineBreak')).toBe(false)
  const goal = [...host.querySelectorAll('textarea')].find((el) => el.value === '탄소 순환을 설명한다')
  expect(beforeInput(goal, 'insertLineBreak')).toBe(false)
})

it('높이를 글에 맞추고, 측정할 수 없으면(화면에 아직 안 보임) 기본 높이와 스크롤바를 남긴다', async () => {
  let measured = 0
  vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(() => measured)
  const style = { boxSizing: 'border-box', border: '1px solid #ccc', padding: '4px 8px' }

  await act(async () => root.render(<AutoGrowTextarea aria-label="칸" value="가" onChange={() => {}} style={style} />))
  expect(field('칸').style.height).toBe('auto')
  expect(field('칸').style.overflowY).toBe('')

  measured = 60
  await act(async () => root.render(<AutoGrowTextarea aria-label="칸" value={LONG} onChange={() => {}} style={style} />))
  expect(field('칸').style.height).toBe('62px') // 글 높이 60 + 위아래 테두리
  expect(field('칸').style.overflowY).toBe('hidden')
})
