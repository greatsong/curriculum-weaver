// @vitest-environment happy-dom
/**
 * 절차 화면의 건너뛰기/해제 버튼 회귀 테스트.
 *
 * showSkipButton = canManageSkip && (isSkipped || isProcedureSkippable)
 * - 핵심 절차(UNSKIPPABLE_PROCEDURES)에는 '이 절차 건너뛰기' 버튼이 없다.
 * - 핵심 절차 목록이 바뀌기 전에 이미 생략된 핵심 절차는 '건너뛰기 해제' 버튼과 생략 안내가 보여야 한다.
 *   목록에서 파생하므로 목록이 바뀌어도 그대로 유지한다.
 */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest'
import { UNSKIPPABLE_PROCEDURES } from 'curriculum-weaver-shared/constants.js'

const store = vi.hoisted(() => ({ skippedProcedures: [] }))

vi.mock('../../stores/procedureStore', () => ({
  useProcedureStore: () => ({
    boards: {},
    currentStep: null,
    setStep: () => {},
    updateBoard: async () => {},
    skippedProcedures: store.skippedProcedures,
    skipProcedure: async () => ({}),
    unskipProcedure: async () => ({}),
  }),
}))
vi.mock('../../stores/chatStore', () => ({
  useChatStore: () => ({
    pendingSuggestions: [],
    coherenceCheckResult: null,
    acceptSuggestion: async () => {},
    editAcceptSuggestion: async () => {},
    rejectSuggestion: async () => {},
    sendMessage: async () => {},
    examinerLens: false,
    setExaminerLens: () => {},
    requestProcedureIntro: async () => {},
  }),
}))

import ProcedureCanvas from '../ProcedureCanvas'

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  store.skippedProcedures = []
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

async function render(procedureCode, memberRole = 'owner') {
  await act(async () => root.render(<ProcedureCanvas projectId="p1" procedureCode={procedureCode} memberRole={memberRole} />))
  const labels = [...host.querySelectorAll('button')].map((b) => b.textContent.trim())
  return {
    skipButton: labels.includes('이 절차 건너뛰기'),
    unskipButton: labels.includes('건너뛰기 해제'),
    text: host.textContent,
  }
}

describe('핵심 절차 버튼 (목록과 무관하게 유지)', () => {
  it.each(UNSKIPPABLE_PROCEDURES)('핵심 절차 %s에는 호스트에게도 건너뛰기 버튼이 없다', async (code) => {
    const view = await render(code)
    expect(view.skipButton).toBe(false)
    expect(view.unskipButton).toBe(false)
  })

  it.each(UNSKIPPABLE_PROCEDURES)('목록 변경 전에 생략된 핵심 절차 %s는 해제 버튼과 생략 안내가 보인다', async (code) => {
    store.skippedProcedures = [{ procedure_code: code, reason: '목록 변경 전 생략' }]
    const view = await render(code)
    expect(view.unskipButton).toBe(true)
    expect(view.skipButton).toBe(false)
    expect(view.text).toContain('팀 결정으로 생략된 절차입니다')
    expect(view.text).toContain('사유: 목록 변경 전 생략')
  })

  it('일반 절차(T-4 팀 규칙)는 호스트에게 버튼이 보이고 편집자(editor)에게는 보이지 않는다', async () => {
    expect((await render('T-2-2')).skipButton).toBe(true)
    expect((await render('T-2-2', 'editor')).skipButton).toBe(false)
  })
})
