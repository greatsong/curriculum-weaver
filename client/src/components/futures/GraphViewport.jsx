import React, { useLayoutEffect, useRef, useState } from 'react'

/** 화면보다 넓은 연결 지도를 축소해서 시작하고, 원래 글자 크기로 확대·이동한다. */
export default function GraphViewport({ layout, width, children }) {
  const viewportRef = useRef(null)
  const dragRef = useRef(null)
  const pendingCenter = useRef(null)
  const [zoom, setZoom] = useState(1)
  const fit = Math.min(1, width / layout.W, 680 / layout.H)
  const scale = fit * zoom
  const maxZoom = Math.max(2, 1.5 / fit)

  useLayoutEffect(() => {
    const el = viewportRef.current
    const center = pendingCenter.current
    if (el && center) {
      el.scrollLeft = center.x * scale - el.clientWidth / 2
      el.scrollTop = center.y * scale - el.clientHeight / 2
      pendingCenter.current = null
    }
  }, [scale])

  function changeZoom(next) {
    const el = viewportRef.current
    if (el) pendingCenter.current = { x: (el.scrollLeft + el.clientWidth / 2) / scale, y: (el.scrollTop + el.clientHeight / 2) / scale }
    setZoom(Math.max(1, Math.min(maxZoom, next)))
  }
  function fitAll() {
    pendingCenter.current = null
    setZoom(1)
    const el = viewportRef.current
    if (el) { el.scrollLeft = 0; el.scrollTop = 0 }
  }
  function endDrag(event) {
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div className="fu-map">
      <div className="fu-map-toolbar">
        <span className="fu-map-hint">확대해서 읽고, 끌어서 이동하세요</span>
        <div className="fu-map-controls" role="group" aria-label="연결 지도 확대 및 축소">
          <button type="button" aria-label="연결 지도 축소" disabled={zoom <= 1} onClick={() => changeZoom(zoom / 1.35)}>−</button>
          <output aria-label="연결 지도 배율">{Math.round(scale * 100)}%</output>
          <button type="button" aria-label="연결 지도 확대" disabled={zoom >= maxZoom} onClick={() => changeZoom(zoom * 1.35)}>+</button>
          <button type="button" onClick={fitAll}>전체 보기</button>
        </div>
      </div>
      <div className="fu-map-viewport" ref={viewportRef} tabIndex={0} role="region" aria-label="과목과 키워드 연결 지도. 확대 후 방향키 또는 드래그로 이동할 수 있습니다. 연결 내용은 아래 연결 근거에서 읽을 수 있습니다."
        style={{ height: Math.min(680, Math.max(240, layout.H * fit)) }}
        onPointerDown={event => {
          if (event.pointerType !== 'mouse' || event.button !== 0) return
          const el = event.currentTarget
          dragRef.current = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop }
          el.setPointerCapture(event.pointerId)
        }}
        onPointerMove={event => {
          const drag = dragRef.current
          if (!drag) return
          event.currentTarget.scrollLeft = drag.left - event.clientX + drag.x
          event.currentTarget.scrollTop = drag.top - event.clientY + drag.y
        }}
        onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={() => { dragRef.current = null }}>
        <div className="fu-map-canvas" style={{ width: layout.W * scale, height: layout.H * scale }}>
          <div style={{ width: layout.W, height: layout.H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
        </div>
      </div>
    </div>
  )
}
