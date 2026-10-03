// 실제 React 컴포넌트와 Zustand를 연결하고 API만 모의 처리한다.
// 조사에서 확인한 사용자 오류가 다시 발생하지 않는지 검증한다.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiDelete: vi.fn(),
  apiUploadFile: vi.fn(), apiGetMaterialAnalysis: vi.fn(),
  apiReanalyzeMaterial: vi.fn(), apiDeleteMaterial: vi.fn(),
}))
vi.mock('../../lib/socket', () => ({ socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn() } }))
vi.mock('../../stores/chatStore', () => ({ useChatStore: selector => selector({ messages: [], pendingSuggestions: [], streaming: false, introCache: {} }) }))
import MaterialUploadBar from '../MaterialUploadBar.jsx'
import ChatPanel from '../ChatPanel.jsx'
import { useProcedureStore } from '../../stores/procedureStore.js'
import { apiUploadFile, apiGetMaterialAnalysis } from '../../lib/api'

let root, container
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  vi.stubGlobal('React', React)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
  useProcedureStore.getState().reset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  useProcedureStore.getState().stopAllMaterialPolling()
  await act(async () => root.unmount())
  container.remove()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
async function render(rows = []) {
  useProcedureStore.setState({ materials: rows })
  await act(async () => root.render(<MaterialUploadBar projectId="audit" />))
  await act(async () => container.querySelector('button').click())
}
function row(patch = {}) {
  return { id: 'one', file_name: '수업.txt', category: 'reference', file_type: 'txt', processing_status: 'completed', ai_analysis: { summary: '수업 요약' }, ...patch }
}
async function chooseFiles(files) {
  const input = container.querySelector('input[type="file"]')
  Object.defineProperty(input, 'files', { configurable: true, value: files })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
}

it('[정상] 빈 파일·지원하지 않는 파일·20MB 초과 파일은 전송 전 안내한다', async () => {
  await render()
  await chooseFiles([
    new File([], '빈파일.txt'), new File(['본문'], '수업.hwp'),
    new File([new Uint8Array(21 * 1024 * 1024)], '큰파일.pdf'),
  ])
  expect(container.textContent).toContain('빈 파일은 업로드할 수 없어요')
  expect(container.textContent).toContain('지원하지 않는 형식')
  expect(container.textContent).toContain('파일이 너무 큽니다')
  expect(apiUploadFile).not.toHaveBeenCalled()
})

it('[정상] 짧은 TXT 업로드 후 분석 완료·요약·상세 버튼이 나타난다', async () => {
  await render()
  apiUploadFile.mockResolvedValue({ material: row({ processing_status: 'pending', ai_analysis: null }) })
  apiGetMaterialAnalysis.mockResolvedValue({ material: row(), analysis: { summary: '수업 요약' } })
  await chooseFiles([new File(['수업 본문'], '수업.txt', { type: 'text/plain' })])
  await act(async () => container.querySelector('button[title="업로드 시작"]').click())
  expect(container.textContent).toContain('완료')
  expect(container.textContent).toContain('수업 요약')
  expect(container.querySelector('button[aria-label="분석 결과 상세 보기"]')).not.toBeNull()
})

it('분석 실패 이유와 스캔 문서의 해결 방법을 표시한다', async () => {
  await render([row({ processing_status: 'failed', ai_analysis: null, error_code: 'PARSE_FAILED', processing_error: 'PARSE_FAILED: 추출된 텍스트가 비어 있습니다.' })])
  expect(container.textContent).toContain('실패')
  expect(container.querySelector('button[aria-label="재분석"]')).not.toBeNull()
  expect(container.textContent).not.toContain('추출된 텍스트가 비어')
  expect(container.textContent).toContain('텍스트를 읽지 못')
  expect(container.textContent).toContain('OCR')
})

it('업로드 실패 파일과 안내를 보존하고 다시 업로드할 수 있다', async () => {
  await render()
  apiUploadFile.mockRejectedValue(new Error('연결이 끊겼습니다'))
  await chooseFiles([new File(['본문'], '실패자료.txt')])
  expect(container.querySelector('section[aria-label="업로드 대기 자료 의도 선택"]')).not.toBeNull()
  await act(async () => container.querySelector('button[title="업로드 시작"]').click())
  expect(container.textContent).toContain('연결이 끊겼습니다')
  expect(container.querySelector('section[aria-label="업로드 대기 자료 의도 선택"]')).not.toBeNull()
  expect(useProcedureStore.getState().materials).toEqual([])
  await act(async () => vi.advanceTimersByTimeAsync(6001))
  expect(container.textContent).toContain('실패자료.txt')
  expect(container.textContent).toContain('연결이 끊겼습니다')
})

it('분석 중 자료는 포함 자료 개수에 집계하지 않는다', async () => {
  await render([row({ processing_status: 'analyzing', ai_analysis: null })])
  const checkbox = container.querySelector('input[type="checkbox"]')
  expect(checkbox.disabled).toBe(true)
  expect(checkbox.checked).toBe(false)
  expect(container.textContent.replace(/\s/g, '')).toContain('AI입력컨텍스트에포함된자료0/1')
})

it('[정상] 완료 자료 체크 해제는 전송할 선택 목록에서 제외한다', async () => {
  await render([row()])
  expect(useProcedureStore.getState().getSelectedMaterialIds()).toEqual(['one'])
  await act(async () => container.querySelector('input[type="checkbox"]').click())
  expect(useProcedureStore.getState().getSelectedMaterialIds()).toEqual([])
})

it('채팅 첨부도 중복 클릭을 막고 실패 파일의 의도를 보존하여 재시도한다', async () => {
  await act(async () => root.render(<ChatPanel projectId="audit" stage="T-1-1" />))
  let fail
  apiUploadFile.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
  await chooseFiles([new File(['본문'], '채팅자료.txt')])
  const dialog = () => container.querySelector('[aria-label="첨부 자료 의도 선택"]')
  const confirm = () => [...dialog().querySelectorAll('button')].find(b => b.textContent.includes('첨부 및 분석'))
  const button = confirm()
  await act(async () => { button.click(); button.click() })
  expect(apiUploadFile).toHaveBeenCalledTimes(1)
  await act(async () => fail(new Error('연결 실패')))
  expect(dialog().textContent).toContain('채팅자료.txt')
  expect(dialog().textContent).toContain('연결 실패')
  apiUploadFile.mockResolvedValue({ material: row() })
  await act(async () => confirm().click())
  expect(apiUploadFile).toHaveBeenCalledTimes(2)
  expect(apiUploadFile.mock.calls[0][2].intent).toBe(apiUploadFile.mock.calls[1][2].intent)
  expect(dialog()).toBeNull()
})
