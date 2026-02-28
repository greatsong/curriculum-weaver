/**
 * 커리큘럼 위버 로고
 * 3가닥 과목 실(초록·파랑·앰버) + 1가닥 AI 실(흰색)의 직조 패턴
 * AI 실이 과목 실을 오버/언더로 엮어 융합 수업을 표현
 */
export default function Logo({ size = 32, className = '' }) {
  const id = `cw-logo-${size}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-label="커리큘럼 위버 로고"
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
        <radialGradient id={`${id}-shine`} cx="35%" cy="35%" r="60%">
          <stop offset="0%" stopColor="white" stopOpacity="0.12" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 배경 */}
      <rect width="64" height="64" rx="16" fill={`url(#${id}-bg)`} />
      <rect width="64" height="64" rx="16" fill={`url(#${id}-shine)`} />

      {/* ── 레이어 1: 과목 실 (AI가 위로 지나가는 것들) ── */}

      {/* 과목 실 1 — 초록 (#34d399): AI가 위를 지나므로 끊김 */}
      <path d="M10 20 Q19 16, 27 18.5" stroke="#34d399" strokeWidth="5.5" strokeLinecap="round" fill="none" />
      <path d="M37 21.5 Q45 24, 54 20" stroke="#34d399" strokeWidth="5.5" strokeLinecap="round" fill="none" />

      {/* 과목 실 3 — 앰버 (#fbbf24): AI가 위를 지나므로 끊김 */}
      <path d="M10 44 Q19 40, 27 42.5" stroke="#fbbf24" strokeWidth="5.5" strokeLinecap="round" fill="none" />
      <path d="M37 45.5 Q45 48, 54 44" stroke="#fbbf24" strokeWidth="5.5" strokeLinecap="round" fill="none" />

      {/* ── 레이어 2: AI 실 상단 (초록 위를 지남) ── */}
      <path d="M32 10 C33 15, 31 21, 32 26" stroke="white" strokeWidth="5" strokeLinecap="round" fill="none" />

      {/* ── 레이어 3: 과목 실 2 — 파랑 (#60a5fa): AI 위에 그려짐 (AI가 아래를 지남) ── */}
      <path d="M10 32 Q22 27, 32 32 Q42 37, 54 32" stroke="#60a5fa" strokeWidth="5.5" strokeLinecap="round" fill="none" />

      {/* ── 레이어 4: AI 실 하단 (앰버 위를 지남) ── */}
      <path d="M32 38 C31 43, 33 49, 32 54" stroke="white" strokeWidth="5" strokeLinecap="round" fill="none" />

      {/* AI 힌트: 미세한 스파클 (과하지 않게) */}
      <path d="M36 13 L36.7 12 L37.5 13 L36.7 14Z" fill="white" fillOpacity="0.45" />
    </svg>
  )
}
