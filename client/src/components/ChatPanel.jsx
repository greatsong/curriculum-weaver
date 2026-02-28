import { useState, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useChatStore } from '../stores/chatStore'

export default function ChatPanel({ sessionId, stage }) {
  const { messages, streaming, streamingText, sendMessage } = useChatStore()
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)

  // 자동 스크롤
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streamingText])

  const handleSend = async (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || streaming) return

    setInput('')
    // API로 교사 메시지 저장 + AI 응답 요청
    await sendMessage(sessionId, text, stage)
  }

  return (
    <div className="flex flex-col h-full">
      {/* 메시지 영역 */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 && !streaming && (
          <div className="text-center text-gray-400 mt-8">
            <p className="text-3xl mb-2">💬</p>
            <p className="text-sm">AI 조교와 대화를 시작하세요</p>
            <p className="text-xs mt-1">현재 단계의 설계 원칙에 기반하여 안내합니다</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender_type === 'teacher' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] ${msg.sender_type === 'teacher' ? 'text-right' : ''}`}>
              {/* 발신자 이름 표시 */}
              {msg.sender_type === 'teacher' && msg.sender_name && (
                <p className="text-[11px] text-gray-400 mb-0.5 px-1">
                  {msg.sender_name}
                  {msg.sender_subject ? ` · ${msg.sender_subject}` : ''}
                </p>
              )}
              {msg.sender_type === 'ai' && (
                <p className="text-[11px] text-gray-400 mb-0.5 px-1">AI 조교</p>
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
        ))}

        {/* 스트리밍 중인 AI 응답 */}
        {streaming && streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[85%] bg-gray-100 text-gray-800 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm max-w-none">
                {streamingText
                  .replace(/<board_update\s+type="[^"]*">[\s\S]*?<\/board_update>/g, '')
                  .replace(/<board_update[\s\S]*$/g, '')
                  .trim() || '...'}
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
      </div>

      {/* 입력 영역 */}
      <form onSubmit={handleSend} className="border-t border-gray-200 p-2 sm:p-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={streaming ? "AI 응답 중... 메시지를 미리 입력할 수 있습니다" : "메시지를 입력하세요..."}
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
