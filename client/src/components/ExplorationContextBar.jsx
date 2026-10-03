/**
 * ExplorationContextBar — 탐색 화면 머리 줄. "보낼 곳"과 반영 상태를 한 줄에 한 번만 보여 준다.
 * (예전 ExplorationStatus를 대체. 접근성 이름 "탐색 대상과 반영 상태"는 그대로 유지)
 *
 * theme: 'light'(밝은 화면) | 'nebula'(교육과정 성운 3D) | 'lab'(미래보기)
 * variant: 'row'(화면 폭 줄) | 'floating'(둥근 카드)
 * status: { tone: 'neutral'|'info'|'warning'|'success'|'danger', text }
 */
import { Lightbulb, FolderOpen, Lock, BookMarked } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EXPLORE_COPY } from '../lib/explorationCopy'

const THEMES = {
  light: {
    root: 'bg-white text-gray-900',
    rowBorder: 'border-b border-gray-200',
    floatBorder: 'border border-gray-200 rounded-xl shadow-sm',
    label: 'text-gray-600',
    note: 'text-gray-600',
    link: 'text-blue-700 hover:text-blue-800',
    iconBox: { new: 'bg-blue-50 text-blue-700', project: 'bg-green-50 text-green-700', lock: 'bg-gray-100 text-gray-600', search: 'bg-green-50 text-green-700' },
    tone: {
      neutral: 'bg-gray-100 text-gray-700 border-gray-200',
      info: 'bg-blue-50 text-blue-700 border-blue-200',
      warning: 'bg-amber-50 text-amber-800 border-amber-200',
      success: 'bg-green-50 text-green-700 border-green-200',
      danger: 'bg-red-50 text-red-700 border-red-200',
    },
    dot: { neutral: 'bg-gray-500', info: 'bg-blue-600', warning: 'bg-amber-600', success: 'bg-green-600', danger: 'bg-red-600' },
  },
  nebula: {
    root: 'bg-[#0B1228]/80 backdrop-blur-xl text-slate-100',
    rowBorder: 'border-b border-white/[0.08]',
    floatBorder: 'border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45)]',
    label: 'text-slate-300',
    note: 'text-slate-300',
    link: 'text-sky-300 hover:text-sky-200',
    iconBox: { new: 'bg-sky-400/15 text-sky-200', project: 'bg-emerald-400/15 text-emerald-200', lock: 'bg-white/[0.08] text-slate-300', search: 'bg-emerald-400/15 text-emerald-200' },
    tone: {
      neutral: 'bg-white/[0.08] text-slate-200 border-white/[0.12]',
      info: 'bg-sky-400/15 text-sky-100 border-sky-300/30',
      warning: 'bg-amber-400/15 text-amber-100 border-amber-300/30',
      success: 'bg-emerald-400/15 text-emerald-100 border-emerald-300/30',
      danger: 'bg-red-400/15 text-red-100 border-red-300/30',
    },
    dot: { neutral: 'bg-slate-300', info: 'bg-sky-300', warning: 'bg-amber-300', success: 'bg-emerald-300', danger: 'bg-red-300' },
  },
  lab: {
    root: 'bg-[#101a23] text-[#edf2f5]',
    rowBorder: 'border-b border-[#26343e]',
    floatBorder: 'border border-[#26343e] rounded-xl',
    label: 'text-[#a0b0bf]',
    note: 'text-[#a0b0bf]',
    link: 'text-[#b8ead3] hover:text-[#d9f3e5]',
    iconBox: { new: 'bg-[#16302a] text-[#b8ead3]', project: 'bg-[#16302a] text-[#b8ead3]', lock: 'bg-[#1b2731] text-[#c9d4dc]', search: 'bg-[#16302a] text-[#b8ead3]' },
    tone: {
      neutral: 'bg-[#1b2731] text-[#c9d4dc] border-[#2e3c47]',
      info: 'bg-[#13283a] text-[#cfe6ff] border-[#2a4a66]',
      warning: 'bg-[#3a2f12] text-[#f5d58a] border-[#5b4a1c]',
      success: 'bg-[#16302a] text-[#b8ead3] border-[#2f5a4b]',
      danger: 'bg-[#3a1717] text-[#ffc4c4] border-[#5b2525]',
    },
    dot: { neutral: 'bg-[#a0b0bf]', info: 'bg-[#8ec5ff]', warning: 'bg-[#f5d58a]', success: 'bg-[#b8ead3]', danger: 'bg-[#ff9b9b]' },
  },
}

const ICONS = { new: Lightbulb, project: FolderOpen, lock: Lock, search: BookMarked }

export function StatusChip({ theme = 'light', tone = 'neutral', className = '', children }) {
  const t = THEMES[theme] || THEMES.light
  return (
    <span aria-live="polite"
      className={`inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full border text-xs font-semibold whitespace-nowrap shrink-0 ${t.tone[tone] || t.tone.neutral} ${className}`}>
      <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${t.dot[tone] || t.dot.neutral}`} />
      {children}
    </span>
  )
}

export default function ExplorationContextBar({
  theme = 'light', variant = 'row', icon = 'new', label = EXPLORE_COPY.common.destinationLabel,
  target, changeHref, status, note, actions, children, className = '',
  compact = false, chipClassName = '',
}) {
  const t = THEMES[theme] || THEMES.light
  const Icon = ICONS[icon] || Lightbulb
  // compact: 한 줄 고정(3D 화면 위 떠 있는 줄). 제목은 말줄임, 안내 문장은 숨긴다.
  return (
    <section aria-label="탐색 대상과 반영 상태"
      className={`${t.root} ${variant === 'floating' ? t.floatBorder : t.rowBorder} ${className}`}>
      <div className={`flex items-center ${compact ? 'flex-nowrap gap-x-2.5 px-2.5 py-1.5' : 'flex-wrap gap-x-4 gap-y-2 px-4 py-2'}`}>
        <span aria-hidden="true" className={`inline-flex items-center justify-center ${compact ? 'w-7 h-7' : 'w-8 h-8'} rounded-lg shrink-0 ${t.iconBox[icon] || t.iconBox.new}`}>
          <Icon size={compact ? 14 : 16} strokeWidth={2} />
        </span>
        <span className={`flex items-baseline gap-x-2 min-w-0 ${compact ? 'flex-nowrap flex-1' : 'flex-wrap gap-y-0.5 flex-[1_1_220px]'}`}>
          {label && <span className={`text-xs whitespace-nowrap ${t.label} ${compact ? 'hidden sm:inline' : ''}`}>{label}</span>}
          <strong className={`text-sm font-semibold min-w-0 ${compact ? 'truncate' : 'break-words'}`} title={compact && typeof target === 'string' ? target : undefined}>{target}</strong>
          {changeHref && (
            <Link to={changeHref} className={`inline-flex items-center min-h-[32px] text-[13px] font-medium whitespace-nowrap ${t.link}`}>
              {EXPLORE_COPY.common.change}
            </Link>
          )}
        </span>
        {status?.text && <StatusChip theme={theme} tone={status.tone} className={chipClassName}>{status.text}</StatusChip>}
        {actions && <span className={`flex items-center gap-2 ml-auto ${compact ? 'flex-nowrap shrink-0' : 'flex-wrap'}`}>{actions}</span>}
      </div>
      {!compact && (note || children) && (
        <div className={`px-4 pb-2 -mt-1 text-xs leading-relaxed ${t.note}`}>
          {note}
          {children}
        </div>
      )}
    </section>
  )
}
