import { useState, useRef, useEffect } from 'react'
import { Send, ArrowRight, Check, X, Edit3, Sparkles, AlertTriangle, CheckCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useChatStore } from '../stores/chatStore'
import { useProcedureStore } from '../stores/procedureStore'
import { PROCEDURES, ACTION_TYPES, ACTOR_COLUMNS } from 'curriculum-weaver-shared/constants.js'
import { PROCEDURE_STEPS } from 'curriculum-weaver-shared/procedureSteps.js'

// 스트리밍 텍스트에서 XML 마커 제거 (완성된 블록 + 미완성 블록)
function cleanStreamingText(text) {
  return text
    .replace(/<ai_suggestion[\s\S]*?<\/ai_suggestion>/g, '')
    .replace(/<coherence_check>[\s\S]*?<\/coherence_check>/g, '')
    .replace(/<procedure_advance>[\s\S]*?<\/procedure_advance>/g, '')
    .replace(/<board_update\s+type="[^"]*">[\s\S]*?<\/board_update>/g, '')
    .replace(/<stage_advance>[\s\S]*?<\/stage_advance>/g, '')
    .replace(/<ai_suggestion[\s\S]*$/g, '')
    .replace(/<coherence_check[\s\S]*$/g, '')
    .replace(/<procedure_advance[\s\S]*$/g, '')
    .replace(/<board_update[\s\S]*$/g, '')
    .replace(/<stage_advance[\s\S]*$/g, '')
    .trim() || '...'
}

export default function ChatPanel({ sessionId, stage, onStageChange }) {
  const {
    messages, streaming, streamingText, sendMessage,
    pendingSuggestions, coherenceCheckResult, procedureAdvanceSuggestion,
    acceptSuggestion, editAcceptSuggestion, rejectSuggestion,
    clearProcedureAdvance, clearCoherenceCheck,
    // 레거시 호환
    stageAdvanceSuggestion, clearStageAdvance,
  } = useChatStore()
  const { currentStep, getCurrentStep } = useProcedureStore()
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)

  // 현재 스텝 정보
  const currentStepInfo = getCurrentStep()
  const procInfo = PROCEDURES[stage]

  // 자동 스크롤
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streamingText, pendingSuggestions, procedureAdvanceSuggestion, stageAdvanceSuggestion])

  const handleSend = async (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    await sendMessage(sessionId, text, stage)
  }

  const handleProcedureAdvance = () => {
    const advance = procedureAdvanceSuggestion || stageAdvanceSuggestion
    if (!advance) return
    const nextCode = advance.next_procedure || advance.next_stage
    if (nextCode && onStageChange) {
      onStageChange(nextCode)
      clearProcedureAdvance()
      clearStageAdvance()
    }
  }

  const dismissAdvance = () => {
    clearProcedureAdvance()
    clearStageAdvance()
  }

  const advance = procedureAdvanceSuggestion || stageAdvanceSuggestion

  return (
    <div className="flex flex-col h-full">
      {/* 스텝 컨텍스트 표시 */}
      {currentStepInfo && (
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
          <span className="text-xs font-bold text-gray-400">Step {currentStep}</span>
          <span className="text-xs text-gray-400">|</span>
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
            ACTION_TYPES[currentStepInfo.actionType]
              ? `bg-${ACTION_TYPES[currentStepInfo.actionType].color}-50 text-${ACTION_TYPES[currentStepInfo.actionType].color}-700`
              : 'bg-gray-100 text-gray-600'
          }`}>
            {ACTION_TYPES[currentStepInfo.actionType]?.name || currentStepInfo.actionType}
          </span>
          <span className="text-xs text-gray-500 truncate">{currentStepInfo.title}</span>
          {currentStepInfo.aiCapability && (
            <span className="ml-auto px-1.5 py-0.5 bg-violet-100 text-violet-600 text-[10px] font-medium rounded shrink-0">
              AI
            </span>
          )}
        </div>
      )}

      {/* 메시지 영역 */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 && !streaming && (
          <div className="text-center text-gray-400 mt-8">
            <p className="text-sm">AI 공동설계자와 대화를 시작하세요</p>
            <p className="text-xs mt-1">현재 절차의 설계 원칙에 기반하여 안내합니다</p>
            {procInfo && (
              <p className="text-xs mt-2 text-gray-300">
                {stage}: {procInfo.name}
              </p>
            )}
          </div>
        )}

        {messages.map((msg) => (
          msg.sender_type === 'system' ? (
            <div key={msg.id} className="flex justify-center">
              <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-4 py-1.5">
                {msg.content}
              </p>
            </div>
          ) : (
            <div
              key={msg.id}
              className={`flex ${msg.sender_type === 'teacher' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[85%] ${msg.sender_type === 'teacher' ? 'text-right' : ''}`}>
                {msg.sender_type === 'teacher' && msg.sender_name && (
                  <p className="text-[11px] text-gray-400 mb-0.5 px-1">
                    {msg.sender_name}
                    {msg.sender_subject ? ` -- ${msg.sender_subject}` : ''}
                  </p>
                )}
                {msg.sender_type === 'ai' && (
                  <p className="text-[11px] text-gray-400 mb-0.5 px-1">AI 공동설계자</p>
                )}
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.sender_type === 'teacher'
                      ? 'bg-blue-600 text-white rounded-br-md'
                      : msg.sender_type === 'ai'
                        ? 'bg-gray-100 text-gray-800 rounded-bl-md'
                        : 'bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-bl-md'
                  }`}
                >
                  {msg.sender_type === 'ai' ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm max-w-none">
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            </div>
          )
        ))}

        {/* 스트리밍 중인 AI 응답 */}
        {streaming && streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[85%] bg-gray-100 text-gray-800 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm max-w-none">
                {cleanStreamingText(streamingText)}
              </ReactMarkdown>
              <span className="inline-block w-1.5 h-4 bg-blue-500 animate-pulse ml-0.5" />
            </div>
          </div>
        )}

        {streaming && !streamingText && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {/* AI 인라인 제안 카드 */}
        {!streaming && pendingSuggestions.filter((s) => s.status === 'pending').map((suggestion) => (
          <InlineSuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            onAccept={() => acceptSuggestion(suggestion.id)}
            onReject={() => rejectSuggestion(suggestion.id)}
            onEditAccept={(val) => editAcceptSuggestion(suggestion.id, val)}
          />
        ))}

        {/* 정합성 점검 인라인 */}
        {!streaming && coherenceCheckResult && (
          <div className="mx-auto max-w-[90%]">
            <div className={`rounded-xl border p-3 ${
              coherenceCheckResult.status === 'pass' || coherenceCheckResult.status === 'good'
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex items-center gap-2 mb-1">
                {coherenceCheckResult.status === 'pass' || coherenceCheckResult.status === 'good' ? (
                  <CheckCircle size={14} className="text-emerald-600" />
                ) : (
                  <AlertTriangle size={14} className="text-amber-600" />
                )}
                <span className="text-xs font-semibold">정합성 점검</span>
              </div>
              {coherenceCheckResult.issues && (
                <p className="text-xs text-gray-700">{coherenceCheckResult.issues}</p>
              )}
              {coherenceCheckResult.suggestions && (
                <p className="text-xs text-gray-500 mt-1 italic">{coherenceCheckResult.suggestions}</p>
              )}
              <button
                onClick={clearCoherenceCheck}
                className="mt-2 text-[11px] text-gray-400 hover:text-gray-600"
              >
                닫기
              </button>
            </div>
          </div>
        )}

        {/* 절차 전환 제안 */}
        {advance && !streaming && (
          <div className="mx-auto max-w-[90%]">
            <div className="bg-gradient-to-r from-violet-50 to-blue-50 border border-violet-200 rounded-xl p-4">
              <p className="text-sm text-gray-700 mb-2">
                {advance.summary}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleProcedureAdvance}
                  className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition"
                >
                  {advance.next_procedure || advance.next_code || advance.next_stage}
                  {' '}{advance.next_name || ''}(으)로 이동
                  <ArrowRight size={14} />
                </button>
                <button
                  onClick={dismissAdvance}
                  className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-white/60 rounded-lg transition"
                >
                  계속 작업하기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 입력 영역 */}
      <form onSubmit={handleSend} className="border-t border-gray-200 p-2 sm:p-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={streaming ? 'AI 응답 중... 메시지를 미리 입력할 수 있습니다' : '메시지를 입력하세요...'}
          className="flex-1 px-3 py-2.5 sm:py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white min-h-[44px]"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="p-2.5 sm:p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  )
}

// ── 인라인 AI 제안 카드 (채팅 내) ──

function InlineSuggestionCard({ suggestion, onAccept, onReject, onEditAccept }) {
  const [showEdit, setShowEdit] = useState(false)
  const [editedValue, setEditedValue] = useState(
    typeof suggestion.value === 'string' ? suggestion.value : JSON.stringify(suggestion.value, null, 2)
  )

  return (
    <div className="mx-auto max-w-[90%]">
      <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={14} className="text-violet-600" />
          <span className="text-xs font-semibold text-violet-800">AI 제안</span>
          <span className="text-[11px] text-violet-500">{suggestion.field}</span>
        </div>

        {suggestion.rationale && (
          <p className="text-[11px] text-violet-600 mb-2 bg-violet-100 rounded p-1.5">
            {suggestion.rationale}
          </p>
        )}

        <div className="text-xs text-gray-700 bg-white rounded-lg p-2 mb-2 max-h-32 overflow-auto">
          {typeof suggestion.value === 'string' ? (
            <p className="whitespace-pre-wrap">{suggestion.value}</p>
          ) : (
            <pre>{JSON.stringify(suggestion.value, null, 2)}</pre>
          )}
        </div>

        {showEdit && (
          <textarea
            value={editedValue}
            onChange={(e) => setEditedValue(e.target.value)}
            rows={3}
            className="w-full px-2 py-1.5 border border-violet-200 rounded-lg text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-y"
          />
        )}

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              if (showEdit) {
                let val = editedValue
                try { val = JSON.parse(editedValue) } catch { /* 문자열 */ }
                onEditAccept(val)
              } else {
                onAccept()
              }
            }}
            className="flex items-center gap-1 px-2.5 py-1 bg-violet-600 text-white text-[11px] font-medium rounded-lg hover:bg-violet-700 transition"
          >
            <Check size={10} />
            {showEdit ? '편집 수락' : '수락'}
          </button>
          <button
            onClick={() => setShowEdit(!showEdit)}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-violet-600 bg-white border border-violet-200 rounded-lg hover:bg-violet-50 transition"
          >
            <Edit3 size={10} />
            {showEdit ? '취소' : '편집'}
          </button>
          <button
            onClick={onReject}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
          >
            <X size={10} />
            거부
          </button>
        </div>
      </div>
    </div>
  )
}
