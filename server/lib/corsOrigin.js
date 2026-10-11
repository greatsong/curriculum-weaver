/**
 * CORS 허용 출처 판정 — Express와 Socket.IO가 같은 함수를 쓴다.
 *
 * 허용:
 * - CLIENT_URL(쉼표 구분)에 적은 출처
 * - 운영 프런트: https://curriculum-weaver.vercel.app
 * - 이 프로젝트의 Vercel 미리보기 주소만 (팀 접미어 -greatsongs-projects 필수)
 *   · 배포별: curriculum-weaver-<해시>-greatsongs-projects.vercel.app
 *   · 브랜치별: curriculum-weaver-git-<브랜치>-greatsongs-projects.vercel.app
 * - Origin 헤더가 없는 요청(서버 간 호출·헬스 체크 등)
 * 예전 패턴(curriculum-weaver(-.*)?.vercel.app)은 다른 Vercel 계정의 프로젝트 주소도 맞았다.
 */

export const PRODUCTION_ORIGIN = 'https://curriculum-weaver.vercel.app'

const VERCEL_PREVIEW_PATTERNS = [
  /^https:\/\/curriculum-weaver-[a-z0-9]+-greatsongs-projects\.vercel\.app$/,
  /^https:\/\/curriculum-weaver-git-[a-z0-9-]+-greatsongs-projects\.vercel\.app$/,
]

/** CLIENT_URL 값을 출처 목록으로 */
export function parseAllowedOrigins(value) {
  return String(value || 'http://localhost:4006')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

/**
 * @param {string[]} allowedOrigins - CLIENT_URL 목록
 * @returns {(origin: string|undefined) => boolean}
 */
export function createOriginChecker(allowedOrigins) {
  const allowed = new Set(allowedOrigins)
  return function checkOrigin(origin) {
    if (!origin) return true
    if (typeof origin !== 'string') return false
    if (allowed.has(origin) || origin === PRODUCTION_ORIGIN) return true
    return VERCEL_PREVIEW_PATTERNS.some((re) => re.test(origin))
  }
}
