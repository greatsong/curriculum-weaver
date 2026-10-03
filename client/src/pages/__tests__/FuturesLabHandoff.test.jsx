import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import FuturesLabPage from '../FuturesLabPage'
import A3ExplorationEntry from '../../components/A3ExplorationEntry'
import ContinueSimulationButton from '../../components/ContinueSimulationButton'
import { a3BoardStatus, resolveProjectStandards } from '../../lib/futuresProjectHandoff'

const scene = vi.hoisted(() => ({ options: null }))
vi.mock('../../lib/api', () => ({ apiGet: vi.fn(), apiPost: vi.fn(), API_BASE: '', getHeaders: vi.fn() }))
vi.mock('../../lib/futuresLabScene', () => ({ createFuturesLabScene: (_, options) => {
  scene.options = options
  return { destroy: vi.fn(), setBridges: vi.fn(), setModel: vi.fn() }
} }))
const catalog = Array.from({ length: 9 }, (_, i) => ({ key: `s${i}`, code: `[코드${i}]`, subject: `과목${i}`, subject_group: '국어', school_level: '고등학교', content: `성취기준 원문 ${i}` }))
let host, root, get, post, project, design, registered
const fields = Object.keys(catalog[0])
function Url() { return <output data-testid="url">{useLocation().pathname}{useLocation().search}</output> }
async function mount(entry = '/futures-lab?project=p1') {
  await act(async () => root.render(<MemoryRouter initialEntries={[entry]}><FuturesLabPage get={get} post={post}/><Url/></MemoryRouter>))
}
async function click(text) {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent === text)
  expect(button).toBeTruthy()
  await act(async () => button.click())
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers(); sessionStorage.clear(); scene.options = null
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  project = { id: 'p1', workspace_id: 'w1', title: '진행 중인 프로젝트', status: 'active', current_procedure: 'A-2-1', my_role: 'owner', skipped_procedures: [{ procedure_code: 'T-2-2' }] }
  design = { content: { standards: [catalog[2]], duplicateCheck: '기존 통합 내용' }, save_status: 'draft' }
  registered = catalog.slice(0, 2).map(s => ({ curriculum_standards: s }))
  get = vi.fn(async url => {
    if (url === '/api/futures2/catalog') return { fields, rows: catalog.map(s => fields.map(f => s[f])) }
    if (url === '/api/projects/p1') return project
    if (url === '/api/standards/project/p1') return registered
    if (url.endsWith('/designs/A-2-1')) return design
    throw new Error(`예상하지 않은 조회: ${url}`)
  })
  post = vi.fn(async () => ({ bridges: { keywords: {}, concepts: [{ label: '함께 해석하기', why: '공통 자료를 비교한다.', ends: [{ key: 's0', word: '자료' }, { key: 's1', word: '비교' }] }] } }))
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks() })

it('A-3에서 새 탭으로 열며 다른 단계와 시연 모드에는 진입 버튼이 없다', async () => {
  await act(async () => root.render(<A3ExplorationEntry project={project} procedure="A-2-1"/>))
  expect(host.querySelector('a').getAttribute('href')).toBe('/futures-lab?project=p1')
  expect(host.querySelector('a').target).toBe('_blank')
  await act(async () => root.render(<A3ExplorationEntry project={project} procedure="A-2-2"/>))
  expect(host.querySelector('a')).toBeNull()
  await act(async () => root.render(<A3ExplorationEntry project={{ ...project, learner_context: { demo: true } }} procedure="A-2-1"/>))
  expect(host.querySelector('a')).toBeNull()
})

it('등록 기준·A-3 분석표를 합쳐 가져오고 복사·복귀해도 프로젝트와 건너뛰기는 보존한다', async () => {
  const before = JSON.stringify({ project, design })
  await mount()
  expect(host.querySelectorAll('.fu-chip')).toHaveLength(3)
  await click('정밀Opus 5.5')
  expect(host.querySelector('output').textContent).toContain('project=p1')
  expect(host.querySelector('output').textContent).toContain('model=precise')
  await act(async () => vi.advanceTimersByTime(1000))
  expect(scene.options.hideBasket).toBe(true)
  await act(async () => scene.options.onStartProject({ title: '탐색한 미래', driving_question: '어떻게 비교할까?', roles: [{ key: 's0', role: '자료 해석' }], activity_steps: ['자료 조사'] }))
  const text = host.querySelector('.lab-handoff textarea').value
  expect(text).toContain('탐색한 미래'); expect(text).toContain('공통 자료를 비교한다.'); expect(text).toContain('성취기준 원문 2')
  expect(text).toContain('기존 내용을 바로 덮어쓰거나 단계를 완료·이동하지 말고')
  const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  await click('탐색 결과 복사')
  expect(copy).toHaveBeenCalledWith(text)
  expect(host.querySelector('[aria-label="탐색 대상과 반영 상태"]').textContent).toContain('복사 완료 · 프로젝트 반영 여부 확인 필요')
  expect(sessionStorage.length).toBe(0)
  expect(post.mock.calls.every(([url]) => url === '/api/futures2/bridges')).toBe(true)
  await click('프로젝트로 돌아가기 ↗')
  expect(host.querySelector('output').textContent).toBe('/workspaces/w1/projects/p1')
  expect(JSON.stringify({ project, design })).toBe(before)
})

it.each([
  ['simulation', {}, '읽기 전용'],
  ['active', { title: '[시뮬레이션] 기존 결과' }, '읽기 전용'],
  ['active', { my_role: 'viewer' }, '열람 권한'],
  ['active', { skipped_procedures: [{ procedure_code: 'A-2-1' }] }, '생략된 상태'],
])('%s 참고 탐색은 내용 저장·진행 단계 변경 없이 복사한다', async (status, extra, note) => {
  Object.assign(project, { status }, extra)
  await mount(); await act(async () => vi.advanceTimersByTime(1000))
  expect(host.querySelector('.lab-project-context').textContent).toContain(note)
  await click('이 연결을 A-3에 가져가기')
  expect(host.querySelector('.lab-handoff textarea').value).toContain('연결 키워드와 근거')
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('거부'))
  await click('탐색 결과 복사')
  expect(host.textContent).toContain('직접 복사해 주세요')
  expect(host.querySelector('[aria-label="탐색 대상과 반영 상태"]').textContent).not.toContain('복사 완료')
  expect(post.mock.calls.every(([url]) => url === '/api/futures2/bridges')).toBe(true)
})

it.each(['generating', 'failed'])('%s 중에는 탐색 생성 요청을 하지 않는다', async status => {
  project.status = status
  await mount('/futures-lab?project=p1&codes=s0,s1')
  await act(async () => vi.advanceTimersByTime(1000))
  expect(scene.options).toBeNull(); expect(post).not.toHaveBeenCalled()
  expect(host.querySelector('.lab-map-open').disabled).toBe(true)
})

it('잠긴 A-3 보드는 상태를 안내하고 복사 초안만 제공한다', async () => {
  design.save_status = 'locked'
  await mount()
  expect(host.textContent).toContain('A-3 보드가 잠겨 있습니다')
  expect(design.save_status).toBe('locked')
})

it('7개 초과는 임의로 자르지 않고 교사가 고른다', async () => {
  registered = catalog
  await mount()
  expect(host.querySelectorAll('.fu-chip')).toHaveLength(0)
  expect(host.querySelectorAll('.lab-project-standards button')).toHaveLength(9)
  for (const button of [...host.querySelectorAll('.lab-project-standards button')].slice(0, 7)) await act(async () => button.click())
  expect(host.querySelectorAll('.fu-chip')).toHaveLength(7)
  expect([...host.querySelectorAll('.lab-project-standards button')].slice(7).every(b => b.disabled)).toBe(true)
})

it('공유 URL의 선택은 원래 프로젝트 조합으로 덮어쓰지 않는다', async () => {
  await mount('/futures-lab?project=p1&codes=s7,s8')
  expect(host.querySelectorAll('.fu-chip')).toHaveLength(2)
  expect(host.querySelector('.fu-slots').textContent).toContain('[코드7]')
})

it('조회 실패는 생성 흐름으로 잘못 전환하지 않고 재시도한다', async () => {
  get.mockRejectedValueOnce(new Error('권한 확인 실패'))
  await mount()
  expect(host.textContent).toContain('접근 권한을 확인')
  expect(scene.options).toBeNull()
  await click('다시 시도')
  expect(host.querySelectorAll('.fu-chip')).toHaveLength(3)
})

it('동일 코드의 다른 과목은 임의로 매칭하지 않는다', () => {
  const items = [{ key: 'one', code: '[공통]', subject: '국어' }, { key: 'two', code: '[공통]', subject: '영어' }]
  expect(resolveProjectStandards(items, [{ code: '[공통]' }]).missing).toEqual(['[공통]'])
  expect(resolveProjectStandards(items, [{ key: 'two', code: '[공통]' }]).standards).toEqual([items[1]])
})

it('보드 저장과 이번 초안 채택을 구분하고, 조회 실패 시 이전 상태를 최신으로 표시하지 않는다', async () => {
  design = { id: 'd1', content: {}, save_status: 'confirmed' }
  await mount()
  const status = () => host.querySelector('[aria-label="탐색 대상과 반영 상태"]').textContent
  expect(status()).toContain('진행 중인 프로젝트 · A-3')
  expect(status()).toContain('저장된 보드 · 확정됨')
  expect(status()).toContain('아이디어 검토 중 · 자동 반영되지 않음')
  get.mockRejectedValueOnce(new Error('서버 중단'))
  await click('저장 상태 새로 확인')
  expect(status()).toContain('최신 저장 상태 확인 실패')
  expect(status()).not.toContain('확정됨')
  design.save_status = 'locked'
  await click('저장 상태 새로 확인')
  expect(status()).toContain('저장된 보드 · 잠김')
  expect(status()).toContain('반영 여부는 보드 내용에서 확인')
  expect(post).not.toHaveBeenCalled()
})

it('선택을 바꾸면 이전 복사 상태가 새 아이디어로 이어지지 않는다', async () => {
  await mount()
  await act(async () => scene.options.onStartProject({ title: '첫 아이디어' }))
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  await click('탐색 결과 복사')
  await act(async () => host.querySelector('.fu-chip .fu-x').click())
  expect(host.querySelector('[aria-label="탐색 대상과 반영 상태"]').textContent).toContain('아이디어 검토 중')
  expect(host.querySelector('.lab-handoff')).toBeNull()
})

it('복사 응답이 늦게 와도 새 선택을 복사 완료로 표시하지 않는다', async () => {
  await mount()
  await act(async () => scene.options.onStartProject({ title: '이전 아이디어' }))
  let finish
  vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(() => new Promise(resolve => { finish = resolve }))
  await click('탐색 결과 복사')
  await act(async () => host.querySelector('.fu-chip .fu-x').click())
  await act(async () => finish())
  expect(host.querySelector('[aria-label="탐색 대상과 반영 상태"]').textContent).not.toContain('복사 완료')
})

it.each([
  [undefined, '저장 상태 확인 필요'],
  [{ created: false, save_status: 'draft', content: {} }, '아직 저장된 보드 없음'],
  [{ content: { standards: [] }, save_status: 'draft' }, '저장 상태 확인 필요'],
  [{ id: 'd1', save_status: 'draft' }, '저장된 보드 · 초안'],
])('DB 저장 근거 없이 저장 완료로 추정하지 않는다 (%j)', (value, label) => {
  expect(a3BoardStatus(value)).toBe(label)
})

it('단계 생략 시 이어서 시뮬레이션은 실행 전에 안내하고 요청을 보내지 않는다', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch')
  await act(async () => root.render(<MemoryRouter><ContinueSimulationButton projectId="p1" workspaceId="w1" skippedCount={1}/></MemoryRouter>))
  expect(host.querySelector('button').disabled).toBe(true)
  expect(host.querySelector('button').title).toContain('A-3 아이디어 탐색은 가능합니다')
  await act(async () => host.querySelector('button').click())
  expect(fetch).not.toHaveBeenCalled()
})
