/**
 * 커리큘럼 위버 로고
 * 3가닥 과목 실(초록·파랑·앰버) + 1가닥 AI 실(흰색)의 직조 패턴
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

      {/* 과목 실 1 — 초록: AI가 위를 지나므로 끊김 */}
      <path d="M10 20 Q19 16, 27 18.5" stroke="#34d399" strokeWidth="5.5" strokeLinecap="round" fill="none" />
      <path d="M37 21.5 Q45 24, 54 20" stroke="#34d399" strokeWidth="5.5" strokeLinecap="round" fill="none" />

      {/* 과목 실 3 — 앰버: AI가 위를 지나므로 끊김 */}
      <path d="M10 44 Q19 40, 27 42.5" stroke="#fbbf24" strokeWidth="5.5" strokeLinecap="round" fill="none" />
      <path d="M37 45.5 Q45 48, 54 44" stroke="#fbbf24" strokeWidth="5.5" strokeLinecap="round" fill="none" />

      {/* AI 실 상단 (초록 위를 지남) */}
      <path d="M32 10 C33 15, 31 21, 32 26" stroke="white" strokeWidth="5" strokeLinecap="round" fill="none" />

      {/* 과목 실 2 — 파랑: AI 위에 그려짐 (AI가 아래를 지남) */}
      <path d="M10 32 Q22 27, 32 32 Q42 37, 54 32" stroke="#60a5fa" strokeWidth="5.5" strokeLinecap="round" fill="none" />

      {/* AI 실 하단 (앰버 위를 지남) */}
      <path d="M32 38 C31 43, 33 49, 32 54" stroke="white" strokeWidth="5" strokeLinecap="round" fill="none" />

      {/* AI 스파클 */}
      <circle cx="36" cy="13" r="1.2" fill="white" opacity="0.5" />
    </svg>
  )
}
