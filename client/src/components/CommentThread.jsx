import { useState, useRef, useEffect } from 'react'
import { useCommentStore } from '../stores/commentStore'

/**
 * 슬라이드-인 코멘트 스레드 패널
 *
 * Props:
 *  - designId: 현재 설계 보드 ID
 *  - sectionKey: 보드 내 섹션 키 (optional)
 *  - open: 열림 여부
 *  - onClose: 닫기 콜백
 */
export default function CommentThread({ designId, sectionKey, open, onClose }) {
  const { comments, loading, loadComments, addComment, resolveComment, unresolveComment, deleteComment } = useCommentStore()
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const scrollRef = useRef(null)
  const textareaRef = useRef(null)

  const threadComments = comments[designId] || []
  const MAX_CHARS = 500

  // 패널 열릴 때 코멘트 로드
  useEffect(() => {
    if (open && designId) {
      loadComments(designId, sectionKey)
    }
  }, [open, designId, sectionKey])

  // 새 코멘트 추가 시 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [threadComments.length])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const text = body.trim()
    if (!text || submitting) return
    setSubmitting(true)
    await addComment(designId, sectionKey, text)
    setBody('')
    setSubmitting(false)
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit(e)
    }
  }

  // 시간 포맷
  const formatTime = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now - d
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return '방금 전'
    if (diffMin < 60) return `${diffMin}분 전`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}시간 전`
    const diffDay = Math.floor(diffHr / 24)
    if (diffDay < 7) return `${diffDay}일 전`
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  }

  // 이니셜 추출
  const getInitial = (name) => {
    if (!name) return '?'
    return name.charAt(0).toUpperCase()
  }

  // 아바타 색상 (이름 기반)
  const getAvatarColor = (name) => {
    const colors = [
      '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B',
      '#10B981', '#06B6D4', '#F97316', '#6366F1',
    ]
    if (!name) return colors[0]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  if (!open) return null

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        className="fixed inset-0 z-40"
        style={{
          background: 'rgba(0, 0, 0, 0.08)',
          backdropFilter: 'blur(2px)',
          transition: 'opacity var(--transition-slow, 300ms)',
        }}
        onClick={onClose}
      />

      {/* 슬라이드-인 패널 */}
      <div
        className="fixed top-0 right-0 bottom-0 z-50 flex flex-col animate-slide-in-right"
        style={{
          width: 'min(380px, 90vw)',
          background: 'var(--color-bg-secondary, #fff)',
          borderLeft: '1px solid var(--color-border, #E5E7EB)',
          boxShadow: 'var(--shadow-xl, 0 20px 50px -12px rgba(0,0,0,0.08))',
        }}
      >
        {/* 헤더 */}
        <div
          className="flex items-center gap-3 px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border-subtle, #F3F4F6)' }}
        >
          <div className="flex-1 min-w-0">
            <h3
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--color-text-primary, #111827)',
                margin: 0,
              }}
            >
              코멘트
            </h3>
            <p
              style={{
                fontSize: '12px',
                color: 'var(--color-text-tertiary, #9CA3AF)',
                margin: '2px 0 0',
              }}
            >
              {threadComments.length}개의 코멘트
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-md, 8px)',
              border: 'none',
              background: 'transparent',
              color: 'var(--color-text-tertiary, #9CA3AF)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast, 150ms)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-tertiary, #F3F4F6)'
              e.currentTarget.style.color = 'var(--color-text-primary, #111827)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--color-text-tertiary, #9CA3AF)'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* 코멘트 목록 */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto"
          style={{ padding: '16px 20px' }}
        >
          {loading && threadComments.length === 0 ? (
            <div
              className="animate-fade-in"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 0',
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  border: '3px solid var(--color-border, #E5E7EB)',
                  borderTopColor: '#3B82F6',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <span style={{ fontSize: 13, color: 'var(--color-text-tertiary, #9CA3AF)' }}>
                불러오는 중...
              </span>
            </div>
          ) : threadComments.length === 0 ? (
            <div
              className="animate-fade-in"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 0',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 'var(--radius-lg, 12px)',
                  background: 'var(--color-bg-tertiary, #F3F4F6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-secondary, #6B7280)', margin: 0 }}>
                아직 코멘트가 없습니다
              </p>
              <p style={{ fontSize: 12, color: 'var(--color-text-tertiary, #9CA3AF)', margin: 0 }}>
                이 섹션에 대한 의견을 남겨보세요
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {threadComments.map((comment, idx) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  getInitial={getInitial}
                  getAvatarColor={getAvatarColor}
                  formatTime={formatTime}
                  onResolve={() => resolveComment(comment.id)}
                  onUnresolve={() => unresolveComment(comment.id)}
                  onDelete={() => deleteComment(comment.id)}
                  animDelay={idx * 50}
                />
              ))}
            </div>
          )}
        </div>

        {/* 입력 영역 */}
        <div
          className="shrink-0"
          style={{
            padding: '12px 20px 16px',
            borderTop: '1px solid var(--color-border-subtle, #F3F4F6)',
            background: 'var(--color-bg-secondary, #fff)',
          }}
        >
          <form onSubmit={handleSubmit}>
            <div style={{ position: 'relative' }}>
              <textarea
                ref={textareaRef}
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, MAX_CHARS))}
                onKeyDown={handleKeyDown}
                placeholder="코멘트를 입력하세요..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  paddingBottom: 28,
                  border: '1px solid var(--color-border, #E5E7EB)',
                  borderRadius: 'var(--radius-lg, 12px)',
                  fontSize: 13,
                  lineHeight: 1.5,
                  resize: 'none',
                  background: 'var(--color-bg-primary, #FAFBFC)',
                  color: 'var(--color-text-primary, #111827)',
                  transition: 'border-color var(--transition-fast, 150ms), box-shadow var(--transition-fast, 150ms)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#3B82F6'
                  e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--color-border, #E5E7EB)'
                  e.target.style.boxShadow = 'none'
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: 8,
                  left: 12,
                  right: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: body.length > MAX_CHARS * 0.9
                      ? '#EF4444'
                      : 'var(--color-text-tertiary, #9CA3AF)',
                  }}
                >
                  {body.length}/{MAX_CHARS}
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary, #9CA3AF)' }}>
                  Ctrl+Enter로 전송
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                type="submit"
                disabled={!body.trim() || submitting}
                className="btn btn-primary"
                style={{
                  padding: '6px 16px',
                  fontSize: 13,
                  opacity: !body.trim() || submitting ? 0.4 : 1,
                  cursor: !body.trim() || submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? '전송 중...' : '코멘트 남기기'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

/**
 * 개별 코멘트 아이템
 */
function CommentItem({ comment, getInitial, getAvatarColor, formatTime, onResolve, onUnresolve, onDelete, animDelay }) {
  const [showActions, setShowActions] = useState(false)
  const authorName = comment.author_name || comment.sender_name || '익명'
  const isResolved = comment.resolved

  return (
    <div
      className="animate-slide-up"
      style={{
        animationDelay: `${animDelay}ms`,
        opacity: isResolved ? 0.55 : 1,
        transition: 'opacity var(--transition-normal, 200ms)',
      }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {/* 아바타 */}
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: getAvatarColor(authorName),
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 600,
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          {getInitial(authorName)}
        </div>

        {/* 내용 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-text-primary, #111827)',
              }}
            >
              {authorName}
            </span>
            <span
              style={{
                fontSize: 11,
                color: 'var(--color-text-tertiary, #9CA3AF)',
              }}
            >
              {formatTime(comment.created_at)}
            </span>
            {isResolved && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  padding: '1px 6px',
                  borderRadius: 9999,
                  background: '#F0FDF4',
                  color: '#16A34A',
                }}
              >
                해결됨
              </span>
            )}
          </div>

          <p
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--color-text-secondary, #6B7280)',
              margin: 0,
              textDecoration: isResolved ? 'line-through' : 'none',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {comment.body}
          </p>

          {/* 액션 버튼 */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              marginTop: 6,
              opacity: showActions ? 1 : 0,
              transition: 'opacity var(--transition-fast, 150ms)',
            }}
          >
            {isResolved ? (
              <button
                onClick={onUnresolve}
                className="btn-ghost"
                style={{
                  padding: '2px 8px',
                  fontSize: 11,
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--color-text-tertiary, #9CA3AF)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast, 150ms)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--color-bg-tertiary, #F3F4F6)'
                  e.currentTarget.style.color = 'var(--color-text-primary, #111827)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--color-text-tertiary, #9CA3AF)'
                }}
              >
                해결 취소
              </button>
            ) : (
              <button
                onClick={onResolve}
                style={{
                  padding: '2px 8px',
                  fontSize: 11,
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: 'none',
                  background: 'transparent',
                  color: '#16A34A',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  transition: 'all var(--transition-fast, 150ms)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#F0FDF4'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                해결
              </button>
            )}
            <button
              onClick={onDelete}
              style={{
                padding: '2px 8px',
                fontSize: 11,
                borderRadius: 'var(--radius-sm, 6px)',
                border: 'none',
                background: 'transparent',
                color: 'var(--color-text-tertiary, #9CA3AF)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast, 150ms)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#FEE2E2'
                e.currentTarget.style.color = '#DC2626'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--color-text-tertiary, #9CA3AF)'
              }}
            >
              삭제
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
