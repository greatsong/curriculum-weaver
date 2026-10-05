/**
 * 개인정보 처리방침 공개 페이지(/privacy) — 로그인 없이 볼 수 있다(개인정보 보호법 제30조 공개 의무).
 * 문장·목록은 lib/privacyPolicy.js, 수집·국외 이전 표는 동의 화면과 같은 lib/privacyConsent.js 값을 그린다.
 */
import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import { ContactMail } from '../components/PrivacyConsentFields'
import { COLLECTION_ROWS, TRANSFER_ROWS, TRANSFER_NOTE } from '../lib/privacyConsent'
import {
  POLICY_TITLE, POLICY_EFFECTIVE_DATE, POLICY_TEXT, POLICY_SECTIONS, PRIVACY_OFFICER, REMEDY_AGENCIES,
} from '../lib/privacyPolicy'

const cell = { padding: '6px 10px', borderBottom: '1px solid var(--color-border-subtle)', verticalAlign: 'top', textAlign: 'left' }
const headCell = { ...cell, fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--color-text-primary)' }
const tableWrap = { overflowX: 'auto', marginTop: 10 }
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }

function CollectionTable() {
  return (
    <div style={tableWrap}>
      <table style={table}>
        <tbody>
          {COLLECTION_ROWS.map((row) => (
            <tr key={row.label}>
              <th scope="row" style={headCell}>{row.label}</th>
              <td style={cell}>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TransferTable() {
  return (
    <>
      <div style={tableWrap}>
        <table style={{ ...table, minWidth: 420 }}>
          <thead>
            <tr>
              {['이전받는 곳(연락처)', '국가', '이전 항목', '목적'].map((h) => <th key={h} scope="col" style={headCell}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {TRANSFER_ROWS.map((row) => (
              <tr key={row.to}>
                <td style={cell}>{row.to}<ContactMail address={row.contact} /></td>
                <td style={{ ...cell, whiteSpace: 'nowrap' }}>{row.country}</td>
                <td style={cell}>{row.items}</td>
                <td style={cell}>{row.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ margin: '8px 0 0' }}>{TRANSFER_NOTE}</p>
    </>
  )
}

function OfficerTable() {
  return (
    <div style={tableWrap}>
      <table style={table} data-testid="privacy-officer">
        <tbody>
          <tr><th scope="row" style={headCell}>성명</th><td style={cell}>{PRIVACY_OFFICER.name}</td></tr>
          <tr><th scope="row" style={headCell}>메일</th><td style={cell}>{PRIVACY_OFFICER.email}</td></tr>
        </tbody>
      </table>
    </div>
  )
}

function RemedyList() {
  return (
    <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
      {REMEDY_AGENCIES.map((a) => (
        <li key={a.name} style={{ marginBottom: 4 }}>
          {a.name}: {a.phone}, {a.site}
        </li>
      ))}
    </ul>
  )
}

const TABLES = { collection: CollectionTable, transfer: TransferTable, officer: OfficerTable, remedy: RemedyList }

export default function PrivacyPolicyPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-secondary)', padding: '32px 16px 48px' }}>
      <main style={{ maxWidth: 760, margin: '0 auto', background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '28px 24px', color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <Logo size={28} />
          <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>커리큘럼 위버</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: 'var(--color-text-primary)' }}>{POLICY_TITLE}</h1>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--color-text-tertiary)' }}>시행일 {POLICY_EFFECTIVE_DATE}</p>
        <p style={{ margin: '0 0 8px' }}>{POLICY_TEXT.preamble}</p>

        {POLICY_SECTIONS.map((section, i) => {
          const Extra = section.table ? TABLES[section.table] : null
          return (
            <section key={section.key} style={{ marginTop: 22 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: 'var(--color-text-primary)' }}>
                {i + 1}. {section.title}
              </h2>
              <p style={{ margin: 0 }}>{POLICY_TEXT[section.key]}</p>
              {Extra && <Extra />}
            </section>
          )
        })}

        <p style={{ marginTop: 28, fontSize: 13 }}>
          <Link to="/" style={{ color: '#3B82F6' }}>커리큘럼 위버로 돌아가기</Link>
        </p>
      </main>
    </div>
  )
}
