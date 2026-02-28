/**
 * 커리큘럼 위버 로고 — 팔레트 모티프
 * 여러 과목 색이 올려진 팔레트 = 융합 수업 설계
 */
export default function Logo({ size = 32, className = '' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="커리큘럼 위버"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    >
      {/* 배경 */}
      <rect width="64" height="64" rx="16" fill="#6366f1" />

      {/* 팔레트 본체 */}
      <path
        d="M32 10 C46 10, 56 18, 56 30 C56 42, 48 54, 34 54 C28 54, 22 50, 18 44 C14 38, 12 30, 14 22 C16 16, 22 10, 32 10Z"
        fill="white"
        fillOpacity="0.92"
      />

      {/* 엄지 구멍 */}
      <circle cx="22" cy="40" r="5" fill="#6366f1" />

      {/* 과목 물감 — 5단계 색상 */}
      <circle cx="30" cy="17" r="4.5" fill="#8b5cf6" />
      <circle cx="42" cy="18" r="4.5" fill="#3b82f6" />
      <circle cx="49" cy="28" r="4.5" fill="#22c55e" />
      <circle cx="46" cy="40" r="4.5" fill="#f59e0b" />
      <circle cx="35" cy="48" r="4.5" fill="#ef4444" />

      {/* AI 스파클 — 팔레트 중앙, 섞이는 느낌 */}
      <circle cx="36" cy="32" r="2" fill="white" opacity="0.7" />
      <circle cx="36" cy="32" r="0.8" fill="#6366f1" />
    </svg>
  )
}
