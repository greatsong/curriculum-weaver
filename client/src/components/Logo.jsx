/**
 * 커리큘럼 위버 로고
 * 파비콘과 동일한 직조(weave) 모티프 — 두 실의 오버/언더 교차
 */
export default function Logo({ size = 32, className = '' }) {
  // 고유 ID: 동일 페이지에 여러 로고가 있어도 그라디언트 충돌 방지
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
        <linearGradient id={`${id}-gold`} x1="14" y1="14" x2="50" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>

      {/* 배경 */}
      <rect width="64" height="64" rx="16" fill={`url(#${id}-bg)`} />
      <rect width="64" height="64" rx="16" fill={`url(#${id}-shine)`} />

      {/* 실 A (골드): 왼위→오아래 — 아래 레이어, 교차점에서 끊김 */}
      <path
        d="M14 14 C18 18, 24 24, 28.5 28.5"
        stroke={`url(#${id}-gold)`}
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M35.5 35.5 C40 40, 46 46, 50 50"
        stroke={`url(#${id}-gold)`}
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />

      {/* 실 B (흰색): 오위→왼아래 — 위 레이어, 연속으로 A 위를 지남 */}
      <path
        d="M50 14 C46 18, 38 26, 32 32 C26 38, 18 46, 14 50"
        stroke="white"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />

      {/* 교차점 글로우 */}
      <circle cx="32" cy="32" r="3.5" fill="white" fillOpacity="0.3" />
    </svg>
  )
}
