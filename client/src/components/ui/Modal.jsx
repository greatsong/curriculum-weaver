/**
 * Modal — document.body 포털 대화상자. Esc로 닫고, Tab 초점을 상자 안에 가두며, 닫히면 열기 전 초점으로 돌아간다.
 * 어두운 화면(교육과정 성운 등) 위에 띄워도 바깥 화면의 CSS를 물려받지 않도록 포털로 그린다.
 */
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import Button from './Button'
import { UI_COPY } from '../../lib/uiCopy'
import './ui.css'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

export default function Modal({ open = true, onClose, title, children, footer, className = '', initialFocusRef, labelledBy }) {
  const autoId = useId()
  const titleId = labelledBy || `modal-title-${autoId}`
  const ref = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    const node = ref.current
    if (!node) return undefined
    const previous = typeof document !== 'undefined' ? document.activeElement : null
    const focusables = () => [...node.querySelectorAll(FOCUSABLE)].filter((el) => !el.closest('[hidden]'))
    ;(initialFocusRef?.current || node).focus?.()
    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current?.(); return }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) { e.preventDefault(); node.focus(); return }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    node.addEventListener('keydown', onKeyDown)
    return () => {
      node.removeEventListener('keydown', onKeyDown)
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus()
    }
  }, [open, initialFocusRef])

  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div className="ui-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCloseRef.current?.() }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`ui-modal ${className}`.trim()}>
        <div className="ui-modal__head">
          <h2 id={titleId} className="ui-modal__title">{title}</h2>
          <Button variant="ghost" aria-label={UI_COPY.actions.close} onClick={() => onCloseRef.current?.()} className="ui-modal__close" icon={X} />
        </div>
        <div className="ui-modal__body">{children}</div>
        {footer && <div className="ui-modal__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
