import { useState, useEffect, useRef } from 'react'
import ReadableValue, { labelize } from './ReadableValue'
import { normalizeListItem, listItemFields, emptyListItem, isPlainObject } from '../lib/boardContent'

/**
 * 보드 편집기 — 보드 스키마의 필드 유형별 입력 폼.
 * 보드 카드의 "편집"과 AI 제안 카드의 "편집"이 같은 폼을 쓴다(JSON 원문 편집 금지).
 *
 * @param {object} props.schema - BOARD_SCHEMAS 항목 ({ fields, empty })
 * @param {object} props.content - 편집 시작 content
 * @param {(draft: object) => void} props.onSave
 * @param {() => void} props.onCancel
 * @param {string[]|null} [props.fieldNames] - 이 필드들만 보여 준다(나머지는 draft에 그대로 보존)
 * @param {string} [props.saveLabel]
 */
export default function BoardEditor({ schema, content, onSave, onCancel, fieldNames = null, saveLabel = '저장' }) {
  const [draft, setDraft] = useState(JSON.parse(JSON.stringify(content || schema.empty)))
  const visibleFields = fieldNames
    ? schema.fields.filter((f) => fieldNames.includes(f.name))
    : schema.fields

  // 편집 중 다른 참여자가 같은 보드를 바꾸면(외부 design 변경으로 content prop이 바뀜)
  // 비차단 경고만 띄운다. 저장 동작은 그대로 두되 교사가 모르고 덮어쓰는 일을 막는다.
  const initialSnapshotRef = useRef(JSON.stringify(content || schema.empty))
  const [externalChanged, setExternalChanged] = useState(false)
  useEffect(() => {
    if (JSON.stringify(content || schema.empty) !== initialSnapshotRef.current) {
      setExternalChanged(true)
    }
  }, [content, schema.empty])

  const updateField = (name, value) => setDraft((prev) => ({ ...prev, [name]: value }))

  const updateTableRow = (fieldName, rowIdx, colName, value) => {
    setDraft((prev) => {
      const rows = [...(prev[fieldName] || [])]
      rows[rowIdx] = { ...rows[rowIdx], [colName]: value }
      return { ...prev, [fieldName]: rows }
    })
  }

  const addTableRow = (field) => {
    const emptyRow = {}
    for (const col of field.columns) emptyRow[col.name] = ''
    setDraft((prev) => ({ ...prev, [field.name]: [...(prev[field.name] || []), emptyRow] }))
  }

  const removeTableRow = (fieldName, rowIdx) => {
    setDraft((prev) => ({ ...prev, [fieldName]: (prev[fieldName] || []).filter((_, i) => i !== rowIdx) }))
  }

  const removeListItem = (fieldName, idx) => {
    setDraft((prev) => ({ ...prev, [fieldName]: (prev[fieldName] || []).filter((_, i) => i !== idx) }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {externalChanged && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8,
          padding: '8px 12px', fontSize: 12.5, color: '#92400E',
        }}>
          <span style={{ flex: 1, minWidth: 180 }}>다른 참여자가 이 보드를 수정했어요. 지금 저장하면 그 내용을 덮어쓸 수 있습니다.</span>
          <button
            onClick={() => { setDraft(JSON.parse(JSON.stringify(content || schema.empty))); initialSnapshotRef.current = JSON.stringify(content || schema.empty); setExternalChanged(false) }}
            style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: '1px solid #F59E0B', background: '#fff', color: '#92400E', cursor: 'pointer' }}
          >
            최신 내용으로 교체
          </button>
          <button
            onClick={() => setExternalChanged(false)}
            style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6, border: 'none', background: 'transparent', color: '#92400E', cursor: 'pointer', textDecoration: 'underline' }}
          >
            내 편집 유지
          </button>
        </div>
      )}
      {visibleFields.map((field) => (
        <div key={field.name}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
            {field.label}
            {field.required && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
          </label>
          {field.description && (
            <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '0 0 6px' }}>{field.description}</p>
          )}

          {field.type === 'text' && (
            <input
              value={draft[field.name] || ''}
              onChange={(e) => updateField(field.name, e.target.value)}
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--color-bg-primary)', boxSizing: 'border-box' }}
            />
          )}
          {field.type === 'textarea' && (
            <textarea
              value={draft[field.name] || ''}
              onChange={(e) => updateField(field.name, e.target.value)}
              rows={3}
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--color-bg-primary)', resize: 'vertical', boxSizing: 'border-box' }}
            />
          )}
          {field.type === 'number' && (
            <input
              type="number"
              value={draft[field.name] ?? ''}
              onChange={(e) => updateField(field.name, e.target.value ? parseInt(e.target.value) : null)}
              style={{ width: 96, padding: '8px 12px', fontSize: 13, background: 'var(--color-bg-primary)', boxSizing: 'border-box' }}
            />
          )}
          {field.type === 'select' && (
            <select
              value={draft[field.name] || ''}
              onChange={(e) => updateField(field.name, e.target.value || null)}
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--color-bg-primary)', boxSizing: 'border-box' }}
            >
              <option value="">선택...</option>
              {field.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          )}
          {field.type === 'tags' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(draft[field.name] || []).map((tag, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: '#EFF6FF', color: '#2563EB', fontSize: 12, borderRadius: 9999 }}>
                    {tag}
                    <button
                      onClick={() => removeListItem(field.name, i)}
                      style={{ background: 'none', border: 'none', color: '#2563EB', cursor: 'pointer', padding: 0, display: 'flex' }}
                    >
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>
                    </button>
                  </span>
                ))}
              </div>
              <input
                placeholder="입력 후 Enter"
                style={{ padding: '6px 10px', fontSize: 12, background: 'var(--color-bg-primary)', boxSizing: 'border-box', width: 200 }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target.value.trim()) {
                    updateField(field.name, [...(draft[field.name] || []), e.target.value.trim()])
                    e.target.value = ''
                  }
                }}
              />
            </div>
          )}
          {field.type === 'list' && (
            <ListFieldEditor
              field={field}
              items={draft[field.name]}
              onChange={(items) => updateField(field.name, items)}
            />
          )}
          {field.type === 'json' && draft[field.name] != null && (
            <div style={{ fontSize: 13, padding: 10, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-primary)', border: '1px dashed var(--color-border)' }}>
              <ReadableValue value={draft[field.name]} />
              <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '8px 0 0' }}>
                AI가 만든 구조라 여기서는 고칠 수 없습니다. 바꾸려면 채팅으로 요청하세요.
              </p>
            </div>
          )}
          {field.type === 'table' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-bg-primary)' }}>
                      {field.columns.map((col) => (
                        <th key={col.name} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                          {col.label}
                        </th>
                      ))}
                      <th style={{ width: 32 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {(draft[field.name] || []).map((row, rowIdx) => (
                      <tr key={rowIdx} style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                        {field.columns.map((col) => (
                          <td key={col.name} style={{ padding: '4px 4px' }}>
                            <input
                              value={row[col.name] || row[col.label] || ''}
                              onChange={(e) => updateTableRow(field.name, rowIdx, col.name, e.target.value)}
                              style={{ width: '100%', padding: '4px 8px', fontSize: 12, border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', boxSizing: 'border-box' }}
                            />
                          </td>
                        ))}
                        <td style={{ padding: '4px' }}>
                          <button
                            onClick={() => removeTableRow(field.name, rowIdx)}
                            style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 2, display: 'flex' }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#DC2626'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-tertiary)'}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={() => addTableRow(field)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', padding: '4px 0' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                행 추가
              </button>
            </div>
          )}
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid var(--color-border-subtle)' }}>
        <button onClick={() => onSave(draft)} className="btn btn-primary" style={{ fontSize: 13 }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 8 6.5 11.5 13 4.5"/></svg>
          {saveLabel}
        </button>
        <button onClick={onCancel} className="btn btn-ghost" style={{ fontSize: 13 }}>취소</button>
      </div>
    </div>
  )
}

// ── 목록 필드 편집 ──
// 글자 항목은 한 줄 입력, 객체 항목(예: 개인 비전 {교사명, 개인 비전})은 하위 칸별 입력.
// 예전에는 객체를 JSON 한 줄로 보여 주고 고치면 문자열로 바꿔 저장해 보드가 깨졌다.
function ListFieldEditor({ field, items, onChange }) {
  const list = Array.isArray(items) ? items : []
  const setItem = (idx, value) => onChange(list.map((it, i) => (i === idx ? value : it)))
  const removeItem = (idx) => onChange(list.filter((_, i) => i !== idx))
  const addItem = () => onChange([...list, emptyListItem(field.itemSchema)])

  const inputStyle = { width: '100%', padding: '6px 10px', fontSize: 13, background: 'var(--color-bg-primary)', boxSizing: 'border-box' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {list.map((raw, i) => {
        const item = normalizeListItem(raw)
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', width: 16, textAlign: 'right', paddingTop: 8, flexShrink: 0 }}>{i + 1}.</span>
            {isPlainObject(item) ? (
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}>
                {listItemFields(item, field.itemSchema).map((sub) => (
                  <label key={sub.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)' }}>{sub.label || labelize(sub.key)}</span>
                    {sub.type === 'textarea' ? (
                      <textarea
                        value={item[sub.key] ?? ''}
                        onChange={(e) => setItem(i, { ...item, [sub.key]: e.target.value })}
                        rows={2}
                        style={{ ...inputStyle, resize: 'vertical' }}
                      />
                    ) : (
                      <input
                        value={item[sub.key] ?? ''}
                        onChange={(e) => setItem(i, { ...item, [sub.key]: e.target.value })}
                        style={inputStyle}
                      />
                    )}
                  </label>
                ))}
              </div>
            ) : Array.isArray(item) ? (
              // 중첩 배열은 AI가 만든 예외 구조 — 보존만 하고 읽기 전용으로 보여 준다
              <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}><ReadableValue value={item} /></div>
            ) : (
              <input
                value={item == null ? '' : String(item)}
                onChange={(e) => setItem(i, e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
            )}
            <button
              onClick={() => removeItem(i)}
              title="항목 삭제"
              style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 4, marginTop: 4, display: 'flex', flexShrink: 0, transition: 'color var(--transition-fast)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#DC2626'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-tertiary)'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          </div>
        )
      })}
      <button
        onClick={addItem}
        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', padding: '4px 0' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        항목 추가
      </button>
    </div>
  )
}
