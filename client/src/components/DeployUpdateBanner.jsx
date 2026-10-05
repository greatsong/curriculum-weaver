/**
 * 새 배포 안내 막대 — 화면 상단 가운데에 고정.
 *
 * [새로고침]을 눌러도 바로 새로고침하지 않고 먼저 안전한지 본다. 보내지 않은 글, 저장하지 않은
 * 편집, 진행 중인 AI 답 등이 있으면 무엇이 사라질 수 있는지 알리고 한 번 더 묻는다.
 */
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { describeReloadBlocks } from '../lib/deployVersion'

export const DEPLOY_BANNER_MESSAGE = '새 버전이 배포되었습니다. 새로고침하면 최신 화면으로 바뀝니다.'

const wrapStyle = {
  position: 'fixed',
  top: 8,
  left: 0,
  right: 0,
  zIndex: 10050,
  display: 'flex',
  justifyContent: 'center',
  padding: '0 16px',
  pointerEvents: 'none',
}

const cardStyle = {
  pointerEvents: 'auto',
  maxWidth: 640,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '8px 8px 8px 16px',
  borderRadius: 12,
  background: '#111827',
  color: '#F9FAFB',
  boxShadow: '0 8px 24px rgba(17, 24, 39, 0.25)',
  fontSize: 13,
  lineHeight: 1.5,
  fontFamily: 'var(--font-sans, inherit)',
}

const primaryButton = {
  minHeight: 32,
  padding: '4px 12px',
  borderRadius: 8,
  border: 'none',
  background: '#FFFFFF',
  color: '#111827',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const secondaryButton = {
  ...primaryButton,
  background: 'transparent',
  color: '#F9FAFB',
  border: '1px solid rgba(249, 250, 251, 0.4)',
  fontWeight: 600,
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onReload
 * @param {() => void} props.onDismiss
 * @param {() => { safe: boolean, reasons: string[] }} [props.checkSafety]
 */
export default function DeployUpdateBanner({ open, onReload, onDismiss, checkSafety }) {
  const [warning, setWarning] = useState(null) // 사라질 수 있는 내용 문구 목록

  useEffect(() => {
    if (!open) setWarning(null)
  }, [open])

  if (!open) return null

  const handleReload = () => {
    let result
    try {
      result = checkSafety ? checkSafety() : { safe: true, reasons: [] }
    } catch {
      result = { safe: false, reasons: ['unknown'] }
    }
    if (result?.safe === true) onReload?.()
    else setWarning(describeReloadBlocks(result?.reasons?.length ? result.reasons : ['unknown']))
  }

  return (
    <div data-deploy-banner="" style={wrapStyle}>
      <div role="status" aria-live="polite" style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px' }}>
            <span style={{ flex: '1 1 240px', minWidth: 0 }}>{DEPLOY_BANNER_MESSAGE}</span>
            {!warning && (
              <button type="button" style={primaryButton} onClick={handleReload}>새로고침</button>
            )}
          </div>
          <button
            type="button"
            aria-label="안내 닫기"
            title="안내 닫기"
            onClick={() => { setWarning(null); onDismiss?.() }}
            style={{
              flexShrink: 0, width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, border: 'none', background: 'transparent', color: '#D1D5DB', cursor: 'pointer',
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {warning && (
          <div data-testid="deploy-banner-warning" style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 40 }}>
            <span style={{ color: '#FDE68A' }}>
              {warning.join(' ')} 지금 새로고침하면 이 내용이 사라질 수 있습니다.
            </span>
            <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" style={secondaryButton} onClick={() => setWarning(null)}>취소</button>
              <button type="button" style={primaryButton} onClick={() => onReload?.()}>그래도 새로고침</button>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
