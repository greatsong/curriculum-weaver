/**
 * MainNav — 홈·탐색 화면 상단의 주 입구 세 개(아이디어 탐색 · 교육과정 성운 · 미래보기).
 * 같은 모양의 링크를 나란히 두고, 현재 화면은 aria-current로 표시한다. 이름은 UI_COPY.nav 한 곳에서 관리한다.
 */
import { Link } from 'react-router-dom'
import { Compass, Globe, Sparkles } from 'lucide-react'
import { UI_COPY } from '../lib/uiCopy'

const LINKS = [
  { key: 'explore', to: '/explore', icon: Compass },
  { key: 'map', to: '/graph?mode=explore', icon: Globe },
  { key: 'futures', to: '/futures-lab', icon: Sparkles },
]

export default function MainNav({ current = '', className = '' }) {
  return (
    <nav aria-label="주요 기능" className={`flex flex-wrap items-center gap-0.5 ${className}`}>
      {LINKS.map(({ key, to, icon: Icon }) => {
        const active = key === current
        return (
          <Link key={key} to={to} aria-current={active ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-md text-sm font-semibold no-underline transition ${active ? 'bg-bg-tertiary text-text-primary' : 'text-link hover:text-link-hover hover:bg-bg-tertiary'}`}>
            <Icon aria-hidden="true" size={16} strokeWidth={2} />
            {UI_COPY.nav[key]}
          </Link>
        )
      })}
    </nav>
  )
}
