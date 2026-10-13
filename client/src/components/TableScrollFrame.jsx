import { useEffect, useRef, useState } from 'react'

/**
 * 옆으로 스크롤되는 표의 틀. 가려진 칸이 있는 쪽 가장자리에 그림자를 그린다.
 * 열이 많은 표는 틀 안에서 옆으로 스크롤하는데, 마침 열 경계에서 잘리면 완성된 표처럼 보여
 * 나머지 칸이 있다는 것을 알아채기 어려웠다(2026-10-13). 측정할 수 없으면 그림자 없이 종전처럼 보인다.
 */
export default function TableScrollFrame({ children, style }) {
  const ref = useRef(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const max = el.scrollWidth - el.clientWidth
      const left = el.scrollLeft > 1
      const right = el.scrollLeft < max - 1
      setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    // 틀 너비(창 크기)와 표 너비(행 추가·입력) 어느 쪽이 바뀌어도 다시 잰다
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    if (observer) {
      observer.observe(el)
      if (el.firstElementChild) observer.observe(el.firstElementChild)
    }
    return () => {
      el.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [])

  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} data-scroll-edges={`${edges.left ? 'L' : ''}${edges.right ? 'R' : ''}`} style={{ overflowX: 'auto', ...style }}>
        {children}
      </div>
      {edges.left && <EdgeShadow side="left" />}
      {edges.right && <EdgeShadow side="right" />}
    </div>
  )
}

function EdgeShadow({ side }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute', top: 1, bottom: 1, [side]: 1, width: 18, pointerEvents: 'none',
        background: `linear-gradient(to ${side === 'left' ? 'right' : 'left'}, rgba(15, 23, 42, 0.12), rgba(15, 23, 42, 0))`,
        borderRadius: side === 'left' ? 'var(--radius-md) 0 0 var(--radius-md)' : '0 var(--radius-md) var(--radius-md) 0',
      }}
    />
  )
}
