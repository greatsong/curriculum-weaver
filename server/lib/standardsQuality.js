/**
 * 성취기준 content 품질 분류 — 단일 소스
 *
 * store.js(런타임 로드)와 scripts/report-standards-quality.mjs(품질 게이트)가
 * 동일한 기준을 쓰도록 분류 로직을 이 모듈 하나로 일원화한다.
 * (standardsValidator.js는 자체 탐지 없이 store가 매긴 _quality 플래그만 소비)
 *
 * 플래그 우선순위 (복수 해당 시 앞선 것 하나만):
 *   pua_encoding > headless_explanation > explanation_as_content > page_tag_mixed > truncated
 */

/** _quality 플래그 종류 (ok 제외) */
export const QUALITY_FLAGS = [
  'pua_encoding', // HWP 수식 폰트의 사설 영역(PUA) 글리프 잔존: 수식이 깨진 채 유입 (예: 수학 성취기준 y=xⁿ)
  'headless_explanation', // 문두 결손 해설체: 조사(은/는/을/를/와/과)+공백으로 시작
  'explanation_as_content', // 해설문이 content에 들어감: "이 성취기준은 ..."
  'page_tag_mixed', // PDF 페이지 푸터 혼입: "78 선택 중심 교육과정" 류
  'truncated', // 문장이 중간에 잘림: 종결부호 없이 끝남
]

// ── PUA(사설 영역) 문자 탐지 ──
// U+E000–U+F8FF: HWP 수식/심볼 폰트 글리프가 텍스트 추출 시 코드포인트만 살아남은 경우.
// 표준 폰트에 글리프가 없어 폴백도 안 돼(네모·엉뚱한 글자로 렌더) 반드시 원문 복원 대상.
// 재발 지점: xlsx/HWP 재파싱(parse-xlsx-to-standards.mjs). 이 게이트로 유입을 조기 차단한다.
export const PUA_RE = /[-\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/u

/**
 * content에 PUA(사설 영역) 문자가 있는지 판정.
 * @param {string} content
 * @returns {boolean}
 */
export function hasPuaChars(content) {
  return PUA_RE.test(content || '')
}

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
 * @returns {'ok'|'pua_encoding'|'headless_explanation'|'explanation_as_content'|'page_tag_mixed'|'truncated'}
 */
export function classifyStandardQuality(content) {
  const c = (content || '').trim()
  if (!c) return 'ok' // 빈 content는 제거 대상이지 플래그 대상이 아님

  // 0. PUA(HWP 수식 글리프) 잔존 — 렌더 폴백 불가라 최우선 플래그
  if (PUA_RE.test(c)) return 'pua_encoding'

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

// ────────────────────────────────────────────────────────────────────
// explanation / application_notes 필드 추출잔재(bleed) 탐지 — 2026-07-13
//
// content 게이트(classifyStandardQuality)는 content만 검사해 explanation 오염을
// 사각지대로 남겼다. 종합감사에서 explanation bleed 526+건이 무방비 존치된 원인.
// 아래 탐지기로 게이트를 explanation/application_notes까지 확장한다.
// (탐지만 — 복원은 scripts/clean-explanation-bleed.mjs. 마커는 그 스크립트와 동일 계열)
// ────────────────────────────────────────────────────────────────────

/** explanation/application_notes bleed 플래그 종류 (ok 제외) */
export const TEXT_FIELD_FLAGS = [
  'pua_encoding', // HWP 수식 PUA 글리프 잔존
  'foreign_code', // 다른 성취기준 코드 침범 (다음 성취기준 본문 유입)
  'page_footer', // 쪽번호+교육과정 편제 영역명 러닝푸터 혼입
  'guidance_bleed', // (나) 적용 시 고려 사항 블록이 explanation에 유입 (정위치=application_notes)
  'enum_header', // 영역 열거/번호 헤더 "(가) 성취기준 해설"·"(3) …" 잔존
  'header_stub', // 본문 유실, "성취기준 해설" 헤더 라벨만 잔존
]

const STD_CODE_RE = /\[[0-9]{2}[가-힣A-Za-z]{1,6}[0-9]{2}-[0-9]{2}\]/g
const FOOTER_RES = [
  /(진로|일반|융합)\s*선택\s*과목/, /[가-힣]{2,10}\s*계열\s*선택\s*과목/,
  /선택\s*중심\s*교육과정/, /공통\s*교육과정/, /과목\s*교육과정/,
  /\d+\s*[가-힣]{0,12}\s*교육과정/,
]
const GUIDANCE_BLEED_RE = /적용\s*시\s*고려\s*사항/
const ENUM_HEADER_RE = /(^|\n)\s*(\([가-하]\)\s*(성취기준|영역)|\(\s*\d+\s*\)\s*[가-힣])/
const HEADER_STUB_RE = /성취기준\s*해설/

/**
 * explanation 필드의 bleed 플래그를 분류한다 (본문은 아님 — 해설 전용).
 * @param {string} explanation
 * @param {string} ownCode 이 성취기준의 코드 (자기 코드 인용은 오염 아님)
 * @returns {'ok'|'pua_encoding'|'foreign_code'|'page_footer'|'guidance_bleed'|'enum_header'|'header_stub'}
 */
export function classifyExplanationQuality(explanation, ownCode = '') {
  const t = (explanation || '').trim()
  if (!t) return 'ok' // 빈값은 대체로 원본부재(정상)
  if (PUA_RE.test(t)) return 'pua_encoding'
  // 본문 유실 헤더 스텁: "성취기준 해설"만 남고 실질 내용 없음
  if (HEADER_STUB_RE.test(t) && t.replace(/\s|성취기준|해설/g, '').length < 3) return 'header_stub'
  const foreign = (t.match(STD_CODE_RE) || []).some((c) => c !== ownCode)
  if (foreign) return 'foreign_code'
  if (FOOTER_RES.some((re) => re.test(t))) return 'page_footer'
  if (GUIDANCE_BLEED_RE.test(t)) return 'guidance_bleed'
  if (ENUM_HEADER_RE.test(t)) return 'enum_header'
  return 'ok'
}

/**
 * application_notes 필드의 bleed 플래그를 분류한다.
 * (나) 적용 시 고려 사항은 정위치 필드이며 본질적으로 타 과목·성취기준을 **정상적으로 참조**한다
 * ("‘…’ 과목과 연계", "[코드]과 [코드]을 지도할 때는" 등). 따라서 foreign_code·page_footer는
 * 오탐이 심해 게이트 대상에서 제외하고, **명백한 오염(PUA·라벨 스텁)만** 플래그한다.
 * @param {string} notes
 * @returns {'ok'|'pua_encoding'|'header_stub'}
 */
export function classifyApplicationNotesQuality(notes) {
  const t = (notes || '').trim()
  if (!t) return 'ok'
  if (PUA_RE.test(t)) return 'pua_encoding'
  if (/^(적용\s*시\s*고려\s*사항|성취기준\s*해설)$/.test(t)) return 'header_stub' // 라벨만 잔존
  return 'ok'
}
