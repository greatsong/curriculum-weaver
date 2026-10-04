/**
 * 개인정보 동의 체크 두 가지(수집·이용, 국외 이전) — 회원가입 화면과 동의 화면(PrivacyConsentGate)이 함께 사용한다.
 * 문구·표는 lib/privacyConsent.js 단일 소스.
 */
import { useState } from 'react'
import { CONSENT_TEXT, COLLECTION_ROWS, TRANSFER_ROWS, TRANSFER_NOTE } from '../lib/privacyConsent'

const cell = { padding: '5px 8px', borderBottom: '1px solid var(--color-border-subtle)', verticalAlign: 'top', textAlign: 'left' }

function ConsentItem({ id, label, summary, checked, onChange, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '10px 12px', background: 'var(--color-bg-primary)' }}>
      <label htmlFor={id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--color-text-primary)', cursor: 'pointer', lineHeight: 1.5 }}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ marginTop: 3, accentColor: '#3B82F6', flexShrink: 0 }}
        />
        <span>
          <strong>{label}</strong>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>{summary}</span>
        </span>
      </label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ marginTop: 6, marginLeft: 22, padding: 0, border: 'none', background: 'none', fontSize: 11, color: '#3B82F6', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
      >
        {CONSENT_TEXT.detailToggle} {open ? '▲' : '▼'}
      </button>
      {open && <div style={{ marginTop: 6, marginLeft: 22, fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{children}</div>}
    </div>
  )
}

export default function PrivacyConsentFields({ value, onChange, idPrefix = 'privacy' }) {
  const set = (key) => (checked) => onChange({ ...value, [key]: checked })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <ConsentItem
        id={`${idPrefix}-collection`}
        label={CONSENT_TEXT.item1Label}
        summary={CONSENT_TEXT.item1Summary}
        checked={!!value.collection}
        onChange={set('collection')}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {COLLECTION_ROWS.map((row) => (
              <tr key={row.label}>
                <th style={{ ...cell, whiteSpace: 'nowrap', fontWeight: 600 }}>{row.label}</th>
                <td style={cell}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ConsentItem>
      <ConsentItem
        id={`${idPrefix}-transfer`}
        label={CONSENT_TEXT.item2Label}
        summary={CONSENT_TEXT.item2Summary}
        checked={!!value.transfer}
        onChange={set('transfer')}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
            <thead>
              <tr>
                {['이전받는 곳', '국가', '이전 항목', '목적'].map((h) => <th key={h} style={{ ...cell, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {TRANSFER_ROWS.map((row) => (
                <tr key={row.to}>
                  <td style={cell}>{row.to}</td>
                  <td style={{ ...cell, whiteSpace: 'nowrap' }}>{row.country}</td>
                  <td style={cell}>{row.items}</td>
                  <td style={cell}>{row.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ margin: '6px 0 0' }}>{TRANSFER_NOTE}</p>
      </ConsentItem>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>{CONSENT_TEXT.refusal}</p>
    </div>
  )
}

export function isConsentComplete(value) {
  return !!value?.collection && !!value?.transfer
}
