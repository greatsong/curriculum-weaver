/**
 * 사용자가 글자를 입력한 입력란 추적 — 새 배포 자동 새로고침이 적던 글을 지우지 않게 한다.
 *
 * 컴포넌트마다 따로 신고하지 않아도(댓글 입력, 검색어, 설정 칸 등) 문서 전체에서
 * 사용자 입력(input 이벤트)이 있었던 칸을 기억한다. 그 칸이 아직 화면에 있고 값이
 * 처음 초점을 받았을 때와 다르면 "작성 중"으로 센다. 저장 뒤 칸이 비거나 닫히면 빠진다.
 */

const NON_TEXT_INPUT_TYPES = new Set([
  'button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image', 'hidden',
])

/** 글자를 입력하는 칸인지 (textarea, 글자형 input, contenteditable) */
export function isTextEntryElement(el) {
  if (!el || el.nodeType !== 1) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  if (tag === 'INPUT') return !NON_TEXT_INPUT_TYPES.has(String(el.type || 'text').toLowerCase())
  return el.isContentEditable === true
}

/** 초점이 가 있으면 "입력 중"으로 보는 요소인지 (글자 칸 + select + iframe) */
export function isEditableFocusTarget(el) {
  if (!el || el.nodeType !== 1) return false
  if (isTextEntryElement(el)) return true
  return el.tagName === 'SELECT' || el.tagName === 'IFRAME'
}

function readValue(el) {
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return String(el.value ?? '')
  return String(el.textContent ?? '')
}

const UNKNOWN_BASELINE = Symbol('unknown-baseline')

/**
 * 추적기를 만든다. start(doc)로 문서에 붙이고, countTypedFields()로 작성 중인 칸 수를 센다.
 */
export function createTypedFieldTracker() {
  let baselines = new WeakMap() // el → 처음 초점을 받았을 때의 값
  const touched = new Set() // 사용자 입력이 있었던 칸
  let detach = null

  const onFocusIn = (e) => {
    const el = e.target
    if (isTextEntryElement(el) && !baselines.has(el)) baselines.set(el, readValue(el))
  }

  const onInput = (e) => {
    const el = e.target
    if (!isTextEntryElement(el)) return
    // 초점 이벤트 없이 입력이 왔으면 처음 값을 알 수 없다 → 글자가 남아 있는 동안 작성 중으로 본다
    if (!baselines.has(el)) baselines.set(el, UNKNOWN_BASELINE)
    touched.add(el)
    if (touched.size > 200) prune()
  }

  function prune() {
    for (const el of touched) if (!el.isConnected) touched.delete(el)
  }

  return {
    start(doc) {
      if (detach || !doc?.addEventListener) return
      doc.addEventListener('focusin', onFocusIn, true)
      doc.addEventListener('input', onInput, true)
      detach = () => {
        doc.removeEventListener('focusin', onFocusIn, true)
        doc.removeEventListener('input', onInput, true)
      }
    },
    stop() {
      detach?.()
      detach = null
      touched.clear()
      baselines = new WeakMap()
    },
    /** 화면에 남아 있고 처음 값과 달라진 칸 수 */
    countTypedFields() {
      prune()
      let dirty = 0
      for (const el of touched) {
        const base = baselines.get(el)
        const value = readValue(el)
        if (base === UNKNOWN_BASELINE ? value !== '' : value !== base) dirty += 1
      }
      return dirty
    },
  }
}
