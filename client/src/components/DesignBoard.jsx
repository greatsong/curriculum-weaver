import { useState } from 'react'
import { STAGES, BOARD_TYPES, BOARD_TYPE_LABELS } from 'curriculum-weaver-shared/constants.js'
import { BOARD_SCHEMAS } from 'curriculum-weaver-shared/boardSchemas.js'
import { useStageStore } from '../stores/stageStore'
import { useChatStore } from '../stores/chatStore'
import { FileText, Sparkles, Check, X, Edit3, MessageSquarePlus, Plus, Trash2 } from 'lucide-react'

export default function DesignBoard({ sessionId, stage }) {
  const { boards, loading, applyBoardSuggestion, updateBoard } = useStageStore()
  const { boardSuggestions, sendMessage } = useChatStore()
  const stageInfo = STAGES.find((s) => s.id === stage)
  const boardTypes = BOARD_TYPES[stage] || []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        로딩 중...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 단계 헤더 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-bold text-gray-900">
          {stage}단계: {stageInfo?.name}
        </h2>
        <p className="text-sm text-gray-500 mt-1">{stageInfo?.description}</p>
      </div>

      {/* 보드 카드들 */}
      {boardTypes.map((boardType) => {
        const board = boards[boardType]
        const suggestion = boardSuggestions.find((s) => s.board_type === boardType)

        return (
          <BoardCard
            key={boardType}
            boardType={boardType}
            board={board}
            suggestion={suggestion}
            sessionId={sessionId}
            stage={stage}
            onApply={async (content) => {
              await applyBoardSuggestion(sessionId, stage, boardType, content)
            }}
            onUpdate={async (content) => {
              if (board?.id) {
                await updateBoard(board.id, content)
              } else {
                await applyBoardSuggestion(sessionId, stage, boardType, content)
              }
            }}
            onRequestAI={() => {
              const label = BOARD_TYPE_LABELS[boardType]
              sendMessage(sessionId, `현재 논의된 내용을 바탕으로 "${label}" 보드의 내용을 구체적으로 작성해 주세요.`, stage)
            }}
          />
        )
      })}
    </div>
  )
}

// ─── 보드 카드 ───
function BoardCard({ boardType, board, suggestion, onApply, onUpdate, onRequestAI }) {
  const [editing, setEditing] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const label = BOARD_TYPE_LABELS[boardType] || boardType
  const schema = BOARD_SCHEMAS[boardType]
  const hasContent = board?.content && Object.keys(board.content).length > 0 &&
    Object.values(board.content).some((v) => (Array.isArray(v) ? v.length > 0 : v !== '' && v !== 0))

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50">
        <FileText size={16} className="text-gray-400" />
        <h3 className="font-medium text-gray-700">{label}</h3>
        {board?.version > 1 && (
          <span className="text-xs text-gray-400">v{board.version}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {hasContent && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="p-1 text-gray-400 hover:text-blue-600 rounded transition"
              title="편집"
            >
              <Edit3 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* AI 제안 배너 */}
      {suggestion && !dismissed && (
        <SuggestionBanner
          suggestion={suggestion}
          schema={schema}
          onApply={() => {
            onApply(suggestion.content)
            setDismissed(true)
          }}
          onDismiss={() => setDismissed(true)}
        />
      )}

      {/* 콘텐츠 */}
      <div className="p-5">
        {editing && schema ? (
          <BoardEditor
            schema={schema}
            content={board?.content || schema.empty}
            onSave={(content) => {
              onUpdate(content)
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        ) : hasContent && schema ? (
          <BoardRenderer schema={schema} content={board.content} />
        ) : (
          <div className="text-center py-8 text-gray-400">
            <p className="text-sm">아직 내용이 없습니다</p>
            <p className="text-xs mt-1 mb-3">AI와 대화하면서 이 보드를 채워나가세요</p>
            <div className="flex justify-center gap-2">
              <button
                onClick={onRequestAI}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
              >
                <MessageSquarePlus size={14} />
                AI에게 이 보드 내용 요청
              </button>
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
              >
                <Edit3 size={14} />
                직접 작성
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── AI 제안 배너 ───
function SuggestionBanner({ suggestion, schema, onApply, onDismiss }) {
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className="mx-5 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
      <div className="flex items-start gap-2">
        <Sparkles size={16} className="text-amber-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-800">
            AI가 이 보드에 내용을 제안했습니다
          </p>
          {showPreview && schema && (
            <div className="mt-3 p-3 bg-white rounded-lg border border-amber-100">
              <BoardRenderer schema={schema} content={suggestion.content} />
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={onApply}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition"
            >
              <Check size={12} />
              반영하기
            </button>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-100 rounded-lg transition"
            >
              {showPreview ? '미리보기 닫기' : '미리보기'}
            </button>
            <button
              onClick={onDismiss}
              className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition"
            >
              무시
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 스키마 기반 렌더러 ───
function BoardRenderer({ schema, content }) {
  if (!schema || !content) return null

  return (
    <div className="space-y-4">
      {schema.fields.map((field) => {
        const value = content[field.key]
        if (value === undefined || value === null) return null
        if (Array.isArray(value) && value.length === 0) return null
        if (value === '' && field.type !== 'number') return null

        return (
          <div key={field.key}>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              {field.label}
            </label>
            {field.type === 'table' ? (
              <TableRenderer columns={field.columns} data={value} />
            ) : field.type === 'list' ? (
              <ListRenderer items={value} />
            ) : field.type === 'tags' ? (
              <TagsRenderer tags={value} />
            ) : field.type === 'textarea' ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{value}</p>
            ) : field.type === 'number' ? (
              <p className="text-sm font-medium text-gray-800">{value}</p>
            ) : (
              <p className="text-sm text-gray-800">{value}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TableRenderer({ columns, data }) {
  if (!Array.isArray(data) || data.length === 0) return null

  return (
    <div className="overflow-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="text-left px-3 py-2 text-xs font-medium text-gray-500 whitespace-nowrap">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2 text-gray-700">
                  {String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ListRenderer({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null

  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
          <span className="text-blue-400 mt-1 shrink-0">•</span>
          <span>{typeof item === 'string' ? item : JSON.stringify(item)}</span>
        </li>
      ))}
    </ul>
  )
}

function TagsRenderer({ tags }) {
  if (!Array.isArray(tags) || tags.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag, i) => (
        <span key={i} className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
          {tag}
        </span>
      ))}
    </div>
  )
}

// ─── 보드 편집기 ───
function BoardEditor({ schema, content, onSave, onCancel }) {
  const [draft, setDraft] = useState(JSON.parse(JSON.stringify(content || schema.empty)))

  const updateField = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const updateTableRow = (fieldKey, rowIdx, colKey, value) => {
    setDraft((prev) => {
      const rows = [...(prev[fieldKey] || [])]
      rows[rowIdx] = { ...rows[rowIdx], [colKey]: value }
      return { ...prev, [fieldKey]: rows }
    })
  }

  const addTableRow = (field) => {
    const emptyRow = {}
    for (const col of field.columns) {
      emptyRow[col.key] = ''
    }
    setDraft((prev) => ({
      ...prev,
      [field.key]: [...(prev[field.key] || []), emptyRow],
    }))
  }

  const removeTableRow = (fieldKey, rowIdx) => {
    setDraft((prev) => ({
      ...prev,
      [fieldKey]: (prev[fieldKey] || []).filter((_, i) => i !== rowIdx),
    }))
  }

  const addListItem = (fieldKey) => {
    setDraft((prev) => ({
      ...prev,
      [fieldKey]: [...(prev[fieldKey] || []), ''],
    }))
  }

  const updateListItem = (fieldKey, idx, value) => {
    setDraft((prev) => {
      const items = [...(prev[fieldKey] || [])]
      items[idx] = value
      return { ...prev, [fieldKey]: items }
    })
  }

  const removeListItem = (fieldKey, idx) => {
    setDraft((prev) => ({
      ...prev,
      [fieldKey]: (prev[fieldKey] || []).filter((_, i) => i !== idx),
    }))
  }

  return (
    <div className="space-y-4">
      {schema.fields.map((field) => (
        <div key={field.key}>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
            {field.label}
          </label>

          {field.type === 'text' && (
            <input
              value={draft[field.key] || ''}
              onChange={(e) => updateField(field.key, e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}

          {field.type === 'textarea' && (
            <textarea
              value={draft[field.key] || ''}
              onChange={(e) => updateField(field.key, e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          )}

          {field.type === 'number' && (
            <input
              type="number"
              value={draft[field.key] || 0}
              onChange={(e) => updateField(field.key, parseInt(e.target.value) || 0)}
              className="w-24 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}

          {field.type === 'tags' && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {(draft[field.key] || []).map((tag, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                    {tag}
                    <button onClick={() => removeListItem(field.key, i)} className="hover:text-red-600">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
              <input
                placeholder="입력 후 Enter"
                className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target.value.trim()) {
                    updateField(field.key, [...(draft[field.key] || []), e.target.value.trim()])
                    e.target.value = ''
                  }
                }}
              />
            </div>
          )}

          {field.type === 'list' && (
            <div className="space-y-1.5">
              {(draft[field.key] || []).map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-gray-400 text-xs">{i + 1}.</span>
                  <input
                    value={item}
                    onChange={(e) => updateListItem(field.key, i, e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button onClick={() => removeListItem(field.key, i)} className="text-gray-400 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => addListItem(field.key)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
              >
                <Plus size={12} /> 항목 추가
              </button>
            </div>
          )}

          {field.type === 'table' && (
            <div className="space-y-2">
              <div className="overflow-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {field.columns.map((col) => (
                        <th key={col.key} className="text-left px-2 py-1.5 text-xs font-medium text-gray-500 whitespace-nowrap">
                          {col.label}
                        </th>
                      ))}
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(draft[field.key] || []).map((row, rowIdx) => (
                      <tr key={rowIdx}>
                        {field.columns.map((col) => (
                          <td key={col.key} className="px-1 py-1">
                            <input
                              value={row[col.key] || ''}
                              onChange={(e) => updateTableRow(field.key, rowIdx, col.key, e.target.value)}
                              className="w-full px-2 py-1 bg-white border border-gray-100 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                        ))}
                        <td className="px-1 py-1">
                          <button
                            onClick={() => removeTableRow(field.key, rowIdx)}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={() => addTableRow(field)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
              >
                <Plus size={12} /> 행 추가
              </button>
            </div>
          )}
        </div>
      ))}

      {/* 저장/취소 버튼 */}
      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <button
          onClick={() => onSave(draft)}
          className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition"
        >
          <Check size={14} />
          저장
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
        >
          취소
        </button>
      </div>
    </div>
  )
}
