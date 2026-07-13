/**
 * explanation 추출잔재(bleed) 클리너 — 파서·후처리 공유 단일 소스 (2026-07-13)
 *
 * 종합감사에서 밝혀진 근본원인: 종합분석표 xlsx의 "해설" 셀에 해설 + (나)적용시고려사항 +
 * 다음 성취기준 코드/영역헤더/페이지푸터가 통째로 병합되어 있고, 파서가 이를 그대로 복사했다.
 * 이 모듈을 파서(parse-xlsx-to-standards.mjs)에 배선하면 재파싱 산출물이 자동으로 정제된다.
 *
 * cleanExplanation(explanation, ownCode) →
 *   { explanation: <해설만>, applicationNotes: <(나) 블록 or ''> }
 *
 * 규칙: explanation에서 "본문이 끝나고 잔재가 시작되는 최초 지점"에서 절단.
 *   잔재 시작 = min( (나)헤더, 다음성취기준코드, 페이지푸터, 다음영역 번호/열거 헤더 )
 *   (나) 헤더가 있으면 그 블록을 applicationNotes로 분리(정위치).
 *   페이지 경계에 박힌 러닝푸터 블록은 전역 제거해 앞뒤 본문을 잇는다.
 *   경계가 모호(절단 후 본문<5자)하면 손대지 않는다(원문 대조 트랙).
 */

// 모든 코드 포맷 포괄: [12고대02-05] · [10통사1-01-01] · [공관 02-03-05] · [12영Ⅱ-02-09]
const CODE_G = /\[[0-9가-힣A-Za-zⅠ-Ⅹ][0-9가-힣A-Za-zⅠ-Ⅹ \-·]*?[0-9]{2}-[0-9]{2}\]/g
const FOOT = [
  /(진로|일반|융합)\s*선택\s*과목/, /[가-힣]{2,10}\s*계열\s*선택\s*과목/,
  /선택\s*중심\s*교육과정/, /공통\s*교육과정/, /과목\s*교육과정/,
  /[가-힣][가-힣()⋅·/]{0,20}\s*(교과|정보과)\s*교육과정/, // 실과(기술⋅가정)/정보과 교육과정, 교양 교과 교육과정
  /\d+\s*[가-힣]{0,12}\s*교육과정/,
]
const NUMBERING = /(^|\n)\s*\(\s*\d+\s*\)\s*[가-힣]/
const ENUM_SECTION = /(^|\n)\s*\([가-하]\)\s*(성취기준|영역\s*성취기준|영역)/
const GUIDANCE_HDR = /\(?\s*나\s*\)?\s*성취기준\s*적용\s*시\s*고려\s*사항|적용\s*시\s*고려\s*사항/
// 본문 중간에 박힌 러닝푸터 블록(페이지 경계): "\n<쪽번호>\n<러닝제목 …교육과정/…과목 ->"
const FOOTER_BLOCK = /\n[ \t]*\d{1,3}[ \t]*\n[ \t]*[^\n]*?(교과\s*교육과정|계열\s*선택\s*과목|선택\s*중심\s*교육과정|과목\s*교육과정)[^\n]*/g
const TRAILING_FOOTER = /\s*\d{0,3}\s*(고등학교|중학교|초등학교)?\s*[가-힣]{2,8}\s*교과\s*교육과정\s*$/
const TRAILING_PAGENUM = /\s+\d{1,3}\s*$/

const stripFooterBlocks = (t) => (t || '').replace(FOOTER_BLOCK, '\n')
function normalizeWs(t) {
  if (!t) return t
  return t.replace(/[ \t ]{2,}/g, ' ').replace(/[ \t ]*\n[ \t ]*/g, '\n').replace(/\n{3,}/g, '\n\n').replace(TRAILING_PAGENUM, '').trim()
}

function firstIndexOf(text, re, from = 0) {
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  r.lastIndex = from
  const m = r.exec(text)
  return m ? m.index + (m[1] ? m[1].length : 0) : -1
}
function firstHard(text, ownCode, from = 0) {
  const idxs = []
  const r = new RegExp(CODE_G.source, 'g'); r.lastIndex = from; let m
  while ((m = r.exec(text))) { if (m[0] !== ownCode) { idxs.push(m.index); break } }
  for (const f of FOOT) { const i = firstIndexOf(text, f, from); if (i >= 0) idxs.push(i) }
  for (const re of [NUMBERING, ENUM_SECTION]) { const i = firstIndexOf(text, re, from); if (i >= 0) idxs.push(i) }
  return idxs.length ? Math.min(...idxs) : -1
}

/**
 * @param {string} explanation
 * @param {string} ownCode
 * @returns {{ explanation: string, applicationNotes: string, changed: boolean }}
 */
export function cleanExplanation(explanation, ownCode = '') {
  const text = explanation || ''
  if (!text.trim()) return { explanation: '', applicationNotes: '', changed: false }

  const guidIdx = firstIndexOf(text, GUIDANCE_HDR)
  const hardIdx = firstHard(text, ownCode)
  if (guidIdx < 0 && hardIdx < 0) return { explanation: text.trim(), applicationNotes: '', changed: false }

  const cut = Math.min(...[guidIdx, hardIdx].filter((x) => x >= 0))
  const keptExpl = normalizeWs(stripFooterBlocks(text.slice(0, cut)))

  // 절단 후 본문 소실 → 경계 모호, 손대지 않음(원문 대조 트랙)
  if (keptExpl.replace(/[\s,~·⋅]/g, '').length < 5) {
    return { explanation: text.trim(), applicationNotes: '', changed: false }
  }

  let applicationNotes = ''
  if (guidIdx >= 0) {
    const hdr = new RegExp(GUIDANCE_HDR.source).exec(text)
    const bodyStart = hdr ? hdr.index + hdr[0].length : guidIdx
    const nextHard = firstHard(text, ownCode, bodyStart)
    const end = nextHard >= 0 ? nextHard : text.length
    const body = normalizeWs(stripFooterBlocks(text.slice(bodyStart, end)).replace(/^[\s\n:·]+/, '')).replace(TRAILING_FOOTER, '').trim()
    if (body.length >= 5) applicationNotes = body
  }
  return { explanation: keptExpl, applicationNotes, changed: true }
}
