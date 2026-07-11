/**
 * 성취기준 content 품질 분류 — 단일 소스
 *
 * store.js(런타임 로드)와 scripts/report-standards-quality.mjs(품질 게이트)가
 * 동일한 기준을 쓰도록 분류 로직을 이 모듈 하나로 일원화한다.
 * (standardsValidator.js는 자체 탐지 없이 store가 매긴 _quality 플래그만 소비)
 *
 * 플래그 우선순위 (복수 해당 시 앞선 것 하나만):
 *   headless_explanation > explanation_as_content > page_tag_mixed > truncated
 */

/** _quality 플래그 종류 (ok 제외) */
export const QUALITY_FLAGS = [
  'headless_explanation', // 문두 결손 해설체: 조사(은/는/을/를/와/과)+공백으로 시작
  'explanation_as_content', // 해설문이 content에 들어감: "이 성취기준은 ..."
  'page_tag_mixed', // PDF 페이지 푸터 혼입: "78 선택 중심 교육과정" 류
  'truncated', // 문장이 중간에 잘림: 종결부호 없이 끝남
]

// ── 완전 제거 대상 (성취기준으로 볼 수 없는 content) ──
const REMOVE_PATTERNS = [
  /^[\w가-힣\[\]-]+의\s*성취기준\s*(내용|해설|코드)/, // placeholder: "국어의 성취기준 내용"
  /^적용\s*시\s*고려|^성취기준\s*(내용|해설)/, // 섹션 제목 혼입
]

/**
 * 로드 시 완전히 제거해야 하는 content인지 판정
 * @param {string} content
 * @returns {boolean}
 */
export function shouldRemoveStandard(content) {
  const c = (content || '').trim()
  if (!c || c.length < 5) return true
  return REMOVE_PATTERNS.some((re) => re.test(c))
}

// ── 플래그 탐지 정규식 ──
// 문두 결손 해설체: 앞 문장이 잘려나가 조사부터 시작 (예: "는 과학적 탐구 능력을 ...")
const HEADLESS_RE = /^(은|는|을|를|와|과)\s/
// 해설문 혼입
const EXPLANATION_RE = /^이\s*성취기준은\s/
// 페이지 푸터 혼입: "78 선택 중심 교육과정", "17 도덕과 교육과정", "12 편제와 시간 배당 기준" 류
// (숫자와 키워드 사이에 낱말이 끼어도 잡도록 확장)
const PAGE_TAG_RE = /\d+\s*[가-힣]*\s*(교육과정|편제와|시간 배당)/
// 문미에서 닫는 따옴표/괄호는 무시하고 종결부호(. ? !)를 확인
const TRAILING_CLOSERS_RE = /["'’”)\]』」>]+$/

/**
 * 성취기준 content의 품질 플래그를 분류한다.
 * 제거 대상 판정(shouldRemoveStandard)은 하지 않는다 — 제거 후 남은 항목에 대해 호출할 것.
 *
 * @param {string} content
 * @returns {'ok'|'headless_explanation'|'explanation_as_content'|'page_tag_mixed'|'truncated'}
 */
export function classifyStandardQuality(content) {
  const c = (content || '').trim()
  if (!c) return 'ok' // 빈 content는 제거 대상이지 플래그 대상이 아님

  // 1. 문두 결손 해설체
  if (HEADLESS_RE.test(c)) return 'headless_explanation'

  // 2. 해설문이 content에 들어감
  if (EXPLANATION_RE.test(c)) return 'explanation_as_content'

  // 3. 페이지 푸터 혼입
  if (PAGE_TAG_RE.test(c)) return 'page_tag_mixed'

  // 4. 잘린 문장: 종결부호(. ? !) 없이 끝나고 길이 > 15
  //    (기존 "조사로 끝남" 규칙을 포괄 — 조사로 끝나면 당연히 종결부호도 없음)
  const stripped = c.replace(TRAILING_CLOSERS_RE, '')
  if (stripped.length > 15 && !/[.?!]$/.test(stripped)) return 'truncated'

  return 'ok'
}
