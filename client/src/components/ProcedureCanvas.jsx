import { useState, useMemo } from 'react'
import {
  PROCEDURES, PHASES, PHASE_LIST, ACTION_TYPES, ACTOR_COLUMNS,
  BOARD_TYPES, BOARD_TYPE_LABELS, PROCEDURE_ACTIVITIES,
} from 'curriculum-weaver-shared/constants.js'
import { PROCEDURE_STEPS } from 'curriculum-weaver-shared/procedureSteps.js'
import { BOARD_SCHEMAS, getBoardSchemaForProcedure, createEmptyBoard } from 'curriculum-weaver-shared/boardSchemas.js'
import { useProcedureStore } from '../stores/procedureStore'
import { useChatStore } from '../stores/chatStore'
import {
  FileText, Check, X, Edit3, Plus, Trash2, Lightbulb,
  BookOpen, Brain, Sparkles, MessageCircle, Share2, Sliders,
  CheckCircle, Save, User, Users, Bot, MessageSquarePlus,
  ChevronRight, ChevronDown, AlertTriangle,
} from 'lucide-react'

// 액션 타입 아이콘 매핑
const ACTION_ICONS = {
  guide: BookOpen,
  judge: Brain,
  generate: Sparkles,
  discuss: MessageCircle,
  share: Share2,
  adjust: Sliders,
  check: CheckCircle,
  record: Save,
}

// 행위자 아이콘 매핑
const ACTOR_ICONS = {
  individual: User,
  individual_ai: User,
  team: Users,
  team_ai: Users,
  ai_only: Bot,
}

// Tailwind 색상 매핑
const COLOR_MAP = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', ring: 'ring-blue-500' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', ring: 'ring-purple-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', ring: 'ring-amber-500' },
  green: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', ring: 'ring-green-500' },
  cyan: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', ring: 'ring-cyan-500' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', ring: 'ring-orange-500' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', ring: 'ring-emerald-500' },
  gray: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', ring: 'ring-gray-500' },
}

export default function ProcedureCanvas({ projectId, procedureCode }) {
  const { boards, currentStep, setStep, updateBoard } = useProcedureStore()
  const { pendingSuggestions, coherenceCheckResult, acceptSuggestion, editAcceptSuggestion, rejectSuggestion, sendMessage } = useChatStore()
  const [editing, setEditing] = useState(false)

  const procInfo = PROCEDURES[procedureCode]
  const phase = procInfo ? PHASE_LIST.find((p) => p.id === procInfo.phase) : null
  const steps = PROCEDURE_STEPS[procedureCode] || []
  const activity = PROCEDURE_ACTIVITIES[procedureCode]
  const boardType = BOARD_TYPES[procedureCode]
  const schema = boardType ? BOARD_SCHEMAS[boardType] : null
  const board = boardType ? boards[boardType] : null

  // 현재 절차에 관련된 pending suggestions
  const relevantSuggestions = pendingSuggestions.filter(
    (s) => s.procedureCode === procedureCode && s.status === 'pending'
  )

  if (!procInfo) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        절차를 선택해주세요
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 절차 헤더 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-1">
          {phase && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded"
              style={{ color: phase.color, backgroundColor: `${phase.color}15` }}
            >
              {procedureCode}
            </span>
          )}
          <span className="text-xs text-gray-400">{phase?.name}</span>
        </div>
        <h2 className="text-lg font-bold text-gray-900">{procInfo.name}</h2>
        <p className="text-sm text-gray-500 mt-1">{procInfo.description}</p>
      </div>

      {/* 활동 설명 배너 */}
      {activity && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <Lightbulb size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-amber-900">{activity.activity}</h3>
            <p className="text-sm text-amber-700 mt-0.5">{activity.description}</p>
          </div>
        </div>
      )}

      {/* 스텝 타임라인 */}
      {steps.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">진행 스텝</h3>
          <div className="space-y-2">
            {steps.map((step) => {
              const isActive = step.stepNumber === currentStep
              const actionInfo = ACTION_TYPES[step.actionType]
              const actorInfo = ACTOR_COLUMNS[step.actorColumn]
              const colorSet = COLOR_MAP[actionInfo?.color] || COLOR_MAP.gray
              const ActionIcon = ACTION_ICONS[step.actionType] || BookOpen
              const ActorIcon = ACTOR_ICONS[step.actorColumn] || User

              return (
                <button
                  key={step.stepNumber}
                  onClick={() => setStep(step.stepNumber)}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition ${
                    isActive
                      ? `${colorSet.bg} border ${colorSet.border} ring-1 ${colorSet.ring}`
                      : 'hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  {/* 스텝 번호 */}
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                      isActive ? `${colorSet.text} ${colorSet.bg}` : 'text-gray-400 bg-gray-100'
                    }`}
                  >
                    {step.stepNumber}
                  </span>

                  {/* 스텝 내용 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <ActionIcon size={14} className={isActive ? colorSet.text : 'text-gray-400'} />
                      <span className={`text-xs font-medium ${isActive ? colorSet.text : 'text-gray-400'}`}>
                        {actionInfo?.name}
                      </span>
                      <span className="text-gray-300">|</span>
                      <ActorIcon size={12} className="text-gray-400" />
                      <span className="text-xs text-gray-400">{actorInfo?.name}</span>
                      {step.aiCapability && (
                        <span className="px-1.5 py-0.5 bg-violet-100 text-violet-600 text-[10px] font-medium rounded">
                          AI {step.aiCapability}
                        </span>
                      )}
                    </div>
                    <p className={`text-sm ${isActive ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
                      {step.title}
                    </p>
                    {isActive && (
                      <p className="text-xs text-gray-500 mt-1">{step.description}</p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* AI 제안 카드 */}
      {relevantSuggestions.length > 0 && (
        <div className="space-y-3">
          {relevantSuggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              onAccept={() => acceptSuggestion(suggestion.id)}
              onReject={() => rejectSuggestion(suggestion.id)}
              onEditAccept={(edited) => editAcceptSuggestion(suggestion.id, edited)}
            />
          ))}
        </div>
      )}

      {/* 정합성 점검 결과 */}
      {coherenceCheckResult && (
        <CoherenceCheckCard result={coherenceCheckResult} />
      )}

      {/* 보드 카드 */}
      {boardType && schema && (
        <BoardCard
          boardType={boardType}
          schema={schema}
          board={board}
          editing={editing}
          setEditing={setEditing}
          onUpdate={async (content) => {
            await updateBoard(projectId, procedureCode, content)
            setEditing(false)
          }}
          onRequestAI={() => {
            const label = BOARD_TYPE_LABELS[boardType]
            sendMessage(projectId, `현재 논의된 내용을 바탕으로 "${label}" 보드의 내용을 구체적으로 작성해 주세요.`, procedureCode)
          }}
        />
      )}
    </div>
  )
}

// ── AI 제안 카드 ──

function SuggestionCard({ suggestion, onAccept, onReject, onEditAccept }) {
  const [showEdit, setShowEdit] = useState(false)
  const [editedValue, setEditedValue] = useState(
    typeof suggestion.value === 'string' ? suggestion.value : JSON.stringify(suggestion.value, null, 2)
  )

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={16} className="text-violet-600" />
        <span className="text-sm font-semibold text-violet-800">AI 제안</span>
        <span className="text-xs text-violet-500">
          {suggestion.field} 필드
        </span>
      </div>

      {suggestion.rationale && (
        <p className="text-xs text-violet-600 mb-2 bg-violet-100 rounded-lg p-2">
          {suggestion.rationale}
        </p>
      )}

      <div className="text-sm text-gray-700 bg-white rounded-lg p-3 mb-3 max-h-40 overflow-auto">
        {typeof suggestion.value === 'string' ? (
          <p className="whitespace-pre-wrap">{suggestion.value}</p>
        ) : (
          <pre className="text-xs">{JSON.stringify(suggestion.value, null, 2)}</pre>
        )}
      </div>

      {showEdit && (
        <textarea
          value={editedValue}
          onChange={(e) => setEditedValue(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-violet-200 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-y"
        />
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            if (showEdit) {
              let finalVal = editedValue
              try { finalVal = JSON.parse(editedValue) } catch { /* 문자열 */ }
              onEditAccept(finalVal)
            } else {
              onAccept()
            }
          }}
          className="flex items-center gap-1 px-3 py-1.5 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 transition"
        >
          <Check size={12} />
          {showEdit ? '편집 후 수락' : '수락'}
        </button>
        <button
          onClick={() => setShowEdit(!showEdit)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-violet-600 bg-white border border-violet-200 rounded-lg hover:bg-violet-50 transition"
        >
          <Edit3 size={12} />
          {showEdit ? '편집 취소' : '편집'}
        </button>
        <button
          onClick={onReject}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
        >
          <X size={12} />
          거부
        </button>
      </div>
    </div>
  )
}

// ── 정합성 점검 카드 ──

function CoherenceCheckCard({ result }) {
  const isGood = result.status === 'pass' || result.status === 'good'

  return (
    <div className={`rounded-xl border p-4 ${
      isGood
        ? 'bg-emerald-50 border-emerald-200'
        : 'bg-amber-50 border-amber-200'
    }`}>
      <div className="flex items-center gap-2 mb-2">
        {isGood ? (
          <CheckCircle size={16} className="text-emerald-600" />
        ) : (
          <AlertTriangle size={16} className="text-amber-600" />
        )}
        <span className={`text-sm font-semibold ${isGood ? 'text-emerald-800' : 'text-amber-800'}`}>
          정합성 점검 결과
        </span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          isGood ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
        }`}>
          {result.status}
        </span>
      </div>
      {result.issues && (
        <p className="text-sm text-gray-700 mb-1">{result.issues}</p>
      )}
      {result.suggestions && (
        <p className="text-sm text-gray-600 italic">{result.suggestions}</p>
      )}
    </div>
  )
}

// ── 보드 카드 ──

function BoardCard({ boardType, schema, board, editing, setEditing, onUpdate, onRequestAI }) {
  const label = BOARD_TYPE_LABELS[boardType] || boardType
  const hasContent = board?.content && Object.keys(board.content).length > 0 &&
    Object.values(board.content).some((v) => (Array.isArray(v) ? v.length > 0 : v !== '' && v !== null && v !== 0))

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50">
        <FileText size={16} className="text-gray-400" />
        <h3 className="font-medium text-gray-700">{label}</h3>
        {board?.version > 1 && (
          <span className="text-xs text-gray-400">v{board.version}</span>
        )}
        <div className="ml-auto">
          {hasContent && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="p-1 text-gray-400 hover:text-blue-600 rounded transition"
            >
              <Edit3 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="p-5">
        {editing && schema ? (
          <BoardEditor
            schema={schema}
            content={board?.content || schema.empty}
            onSave={onUpdate}
            onCancel={() => setEditing(false)}
          />
        ) : hasContent && schema ? (
          <BoardRenderer schema={schema} content={board.content} />
        ) : (
          <div className="text-center py-8 text-gray-400">
            <p className="text-sm">아직 내용이 없습니다</p>
            <p className="text-xs mt-1 mb-3">AI와 대화하면 자동으로 이 보드가 채워집니다</p>
            <button
              onClick={onRequestAI}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition mx-auto"
            >
              <MessageSquarePlus size={14} />
              AI에게 이 보드 내용 요청
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 스키마 기반 렌더러 (기존 DesignBoard에서 이관) ──

function BoardRenderer({ schema, content }) {
  if (!schema || !content) return null

  return (
    <div className="space-y-4">
      {schema.fields.map((field) => {
        const value = content[field.name]
        if (value === undefined || value === null) return null
        if (Array.isArray(value) && value.length === 0) return null
        if (value === '' && field.type !== 'number') return null

        return (
          <div key={field.name}>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              {field.label}
            </label>
            {field.type === 'table' ? (
              <TableRenderer columns={field.columns} data={value} />
            ) : field.type === 'list' ? (
              <ListRenderer items={value} itemSchema={field.itemSchema} />
            ) : field.type === 'tags' ? (
              <TagsRenderer tags={value} />
            ) : field.type === 'select' ? (
              <p className="text-sm font-medium text-gray-800">{value}</p>
            ) : field.type === 'textarea' ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{value}</p>
            ) : field.type === 'number' ? (
              <p className="text-sm font-medium text-gray-800">{value}</p>
            ) : field.type === 'json' ? (
              <pre className="text-xs text-gray-600 bg-gray-50 p-2 rounded-lg overflow-auto max-h-40">
                {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-gray-800">{String(value)}</p>
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
              <th key={col.name} className="text-left px-3 py-2 text-xs font-medium text-gray-500 whitespace-nowrap">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {columns.map((col) => (
                <td key={col.name} className="px-3 py-2 text-gray-700">
                  {String(row[col.name] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ListRenderer({ items, itemSchema }) {
  if (!Array.isArray(items) || items.length === 0) return null

  const toText = (item) => {
    if (typeof item === 'string') return item
    if (item && typeof item === 'object') {
      const values = Object.values(item).filter((v) => typeof v === 'string' && v.trim())
      if (values.length > 0) return values.join(' -- ')
    }
    return String(item)
  }

  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
          <span className="text-blue-400 mt-1 shrink-0">-</span>
          <span>{toText(item)}</span>
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

// ── 보드 편집기 ──

function BoardEditor({ schema, content, onSave, onCancel }) {
  const [draft, setDraft] = useState(JSON.parse(JSON.stringify(content || schema.empty)))

  const updateField = (name, value) => {
    setDraft((prev) => ({ ...prev, [name]: value }))
  }

  const updateTableRow = (fieldName, rowIdx, colName, value) => {
    setDraft((prev) => {
      const rows = [...(prev[fieldName] || [])]
      rows[rowIdx] = { ...rows[rowIdx], [colName]: value }
      return { ...prev, [fieldName]: rows }
    })
  }

  const addTableRow = (field) => {
    const emptyRow = {}
    for (const col of field.columns) {
      emptyRow[col.name] = ''
    }
    setDraft((prev) => ({
      ...prev,
      [field.name]: [...(prev[field.name] || []), emptyRow],
    }))
  }

  const removeTableRow = (fieldName, rowIdx) => {
    setDraft((prev) => ({
      ...prev,
      [fieldName]: (prev[fieldName] || []).filter((_, i) => i !== rowIdx),
    }))
  }

  const addListItem = (fieldName) => {
    setDraft((prev) => ({
      ...prev,
      [fieldName]: [...(prev[fieldName] || []), ''],
    }))
  }

  const updateListItem = (fieldName, idx, value) => {
    setDraft((prev) => {
      const items = [...(prev[fieldName] || [])]
      items[idx] = value
      return { ...prev, [fieldName]: items }
    })
  }

  const removeListItem = (fieldName, idx) => {
    setDraft((prev) => ({
      ...prev,
      [fieldName]: (prev[fieldName] || []).filter((_, i) => i !== idx),
    }))
  }

  return (
    <div className="space-y-4">
      {schema.fields.map((field) => (
        <div key={field.name}>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
            {field.label}
            {field.required && <span className="text-red-400 ml-0.5">*</span>}
          </label>
          {field.description && (
            <p className="text-xs text-gray-400 mb-1">{field.description}</p>
          )}

          {field.type === 'text' && (
            <input
              value={draft[field.name] || ''}
              onChange={(e) => updateField(field.name, e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}

          {field.type === 'textarea' && (
            <textarea
              value={draft[field.name] || ''}
              onChange={(e) => updateField(field.name, e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          )}

          {field.type === 'number' && (
            <input
              type="number"
              value={draft[field.name] ?? ''}
              onChange={(e) => updateField(field.name, e.target.value ? parseInt(e.target.value) : null)}
              className="w-24 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}

          {field.type === 'select' && (
            <select
              value={draft[field.name] || ''}
              onChange={(e) => updateField(field.name, e.target.value || null)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">선택...</option>
              {field.options?.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )}

          {field.type === 'tags' && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {(draft[field.name] || []).map((tag, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                    {tag}
                    <button onClick={() => removeListItem(field.name, i)} className="hover:text-red-600">
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
                    updateField(field.name, [...(draft[field.name] || []), e.target.value.trim()])
                    e.target.value = ''
                  }
                }}
              />
            </div>
          )}

          {field.type === 'list' && (
            <div className="space-y-1.5">
              {(draft[field.name] || []).map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-gray-400 text-xs">{i + 1}.</span>
                  <input
                    value={typeof item === 'string' ? item : JSON.stringify(item)}
                    onChange={(e) => updateListItem(field.name, i, e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button onClick={() => removeListItem(field.name, i)} className="text-gray-400 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => addListItem(field.name)}
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
                        <th key={col.name} className="text-left px-2 py-1.5 text-xs font-medium text-gray-500 whitespace-nowrap">
                          {col.label}
                        </th>
                      ))}
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(draft[field.name] || []).map((row, rowIdx) => (
                      <tr key={rowIdx}>
                        {field.columns.map((col) => (
                          <td key={col.name} className="px-1 py-1">
                            <input
                              value={row[col.name] || ''}
                              onChange={(e) => updateTableRow(field.name, rowIdx, col.name, e.target.value)}
                              className="w-full px-2 py-1 bg-white border border-gray-100 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                        ))}
                        <td className="px-1 py-1">
                          <button
                            onClick={() => removeTableRow(field.name, rowIdx)}
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
