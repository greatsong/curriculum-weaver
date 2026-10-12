import { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * 내용에 맞춰 높이가 늘어나는 입력 칸.
 * 보드 편집기의 한 줄 입력창(<input>)은 칸보다 긴 글이 옆으로 밀려 앞부분이 보이지 않았다
 * (교사 피드백 "입력창을 넘어가면 잘린다", 2026-10-12). 글은 칸 너비에서 줄을 바꿔 모두 보여 준다.
 *
 * @param {number} [props.minRows] - 비어 있을 때의 줄 수
 * @param {boolean} [props.singleLine] - 줄바꿈 없이 쓰는 칸(표 칸·짧은 칸). 화면에서만 줄을 바꾸고
 *   Enter로 줄바꿈을 넣지 않는다. 읽기 화면·보고서가 이 칸들을 한 줄 글로 보여 주기 때문이다.
 */
export default function AutoGrowTextarea({ minRows = 1, singleLine = false, style, ...rest }) {
  const ref = useRef(null)

  // 글이 바뀔 때마다 높이를 다시 맞춘다
  useLayoutEffect(() => { scheduleFit(ref.current) }, [rest.value])

  // 칸 너비가 바뀌면(창 크기·표 열 너비·처음 보이게 될 때) 줄 수가 달라지므로 다시 맞춘다
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let lastWidth = el.clientWidth
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return
      lastWidth = el.clientWidth
      scheduleFit(el)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Enter 줄바꿈만 막는다. beforeinput은 한글 조합을 끝내는 입력과 구분되므로 조합 중 Enter도 안전하다.
  useEffect(() => {
    const el = ref.current
    if (!el || !singleLine) return
    const blockLineBreak = (e) => {
      if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') e.preventDefault()
    }
    el.addEventListener('beforeinput', blockLineBreak)
    return () => el.removeEventListener('beforeinput', blockLineBreak)
  }, [singleLine])

  return (
    <textarea
      ref={ref}
      rows={minRows}
      {...rest}
      style={{ display: 'block', ...style, resize: 'none' }}
    />
  )
}

// 높이 맞추기는 모아서 한 번에 한다. 칸마다 따로 재면 칸 수만큼 화면 배치를 다시 계산해
// 큰 표(20행×8열)를 열 때 화면이 멈칫했다. 그리기 전(마이크로태스크)에 처리하므로 깜빡임은 없다.
const pendingFits = new Set()
let fitScheduled = false

function scheduleFit(el) {
  if (!el) return
  pendingFits.add(el)
  if (fitScheduled) return
  fitScheduled = true
  queueMicrotask(flushFits)
}

/**
 * 높이를 글에 맞춘다. 측정하려고 높이를 잠깐 auto로 줄이면 스크롤하던 패널이 위로 튈 수 있어
 * 바깥 패널들의 스크롤 위치를 기억했다가 되돌린다.
 * 측정이 안 되는 칸(화면에 아직 안 보임)은 기본 줄 수 높이와 스크롤바를 그대로 둔다.
 */
function flushFits() {
  fitScheduled = false
  const els = [...pendingFits].filter((el) => el.isConnected)
  pendingFits.clear()
  if (els.length === 0) return

  const scrolled = new Map()
  for (const el of els) {
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (p.scrollTop && !scrolled.has(p)) scrolled.set(p, p.scrollTop)
    }
  }

  // 쓰기 → 읽기 → 쓰기 순서로 나눠 화면 배치 계산을 한 번으로 줄인다
  for (const el of els) el.style.height = 'auto'
  const heights = els.map((el) => {
    const contentHeight = el.scrollHeight // 안쪽 여백 포함, 테두리 제외
    if (!contentHeight) return null
    const cs = getComputedStyle(el)
    const px = (v) => parseFloat(v) || 0
    return cs.boxSizing === 'border-box'
      ? contentHeight + px(cs.borderTopWidth) + px(cs.borderBottomWidth)
      : contentHeight - px(cs.paddingTop) - px(cs.paddingBottom)
  })
  els.forEach((el, i) => {
    if (heights[i] == null) {
      el.style.overflowY = ''
      return
    }
    el.style.height = `${heights[i]}px`
    el.style.overflowY = 'hidden'
  })

  for (const [p, top] of scrolled) {
    if (p.scrollTop !== top) p.scrollTop = top
  }
}
