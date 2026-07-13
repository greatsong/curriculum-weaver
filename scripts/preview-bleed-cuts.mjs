#!/usr/bin/env node
/**
 * 자명 제거(clear) 케이스의 절단 규칙 프리뷰 (READ-ONLY, 아무것도 저장 안 함 옵션 기본)
 *
 * 절단 규칙: explanation에서 "본문이 끝나고 잔재가 시작되는 최초 지점"에서 잘라낸다.
 * 잔재 시작 후보(가장 이른 인덱스 채택):
 *   1) 다른 성취기준 코드 [..] 출현 위치
 *   2) 페이지 푸터 마커 (선택/공통 교육과정, 계열 선택 과목 등)
 *   3) (나) 성취기준 적용 시 고려 사항 헤더
 *   4) 줄머리 번호매김 헤더 "(n) ..."
 * 잘라낸 뒤 꼬리 공백/개행 정리. 경계 모호(잔재 마커 없음)면 손대지 않음.
 */
import { ALL_STANDARDS } from '../server/data/standards.js'
import { writeFileSync } from 'node:fs'

const OWN_CODE_RE = /\[[0-9]{2}[가-힣A-Za-z]{1,6}[0-9]{2}-[0-9]{2}\]/g
const FOOTER_MARKERS = [
  /(진로|일반|융합)\s*선택\s*과목/, /[가-힣]{2,10}\s*계열\s*선택\s*과목/,
  /선택\s*중심\s*교육과정/, /공통\s*교육과정/, /과목\s*교육과정/,
  /\d+\s*[가-힣]{0,12}\s*교육과정/, /계열\s*선택\s*과목\s*교육과정/,
]
const GUIDANCE_RE = /\(?\s*나\s*\)?\s*성취기준\s*적용\s*시\s*고려\s*사항|적용\s*시\s*고려\s*사항/
const NUMBERING_RE = /\n\s*\(\s*\d+\s*\)\s*[가-힣]/

function earliestBleedIndex(text, ownCode) {
  const idxs = []
  // 1) foreign code
  let m
  const re = new RegExp(OWN_CODE_RE.source, 'g')
  while ((m = re.exec(text))) { if (m[0] !== ownCode) { idxs.push(m.index); break } }
  // 2) footer marker
  for (const fr of FOOTER_MARKERS) { const mm = fr.exec(text); if (mm) idxs.push(mm.index) }
  // 3) guidance header
  const gm = GUIDANCE_RE.exec(text); if (gm) idxs.push(gm.index)
  // 4) numbering header
  const nm = NUMBERING_RE.exec(text); if (nm) idxs.push(nm.index + 1) // \n 다음
  if (!idxs.length) return -1
  return Math.min(...idxs)
}

const previews = []
for (const s of ALL_STANDARDS) {
  const text = s.explanation
  if (!text || !text.trim()) continue
  const cut = earliestBleedIndex(text, s.code)
  if (cut <= 0) continue
  const kept = text.slice(0, cut).replace(/[\s\n]+$/g, '')
  const removed = text.slice(cut)
  previews.push({
    code: s.code, subject: s.subject_group,
    kept_len: kept.length, removed_len: removed.length,
    kept_tail: kept.slice(-70),
    removed_head: removed.slice(0, 90).replace(/\n/g, '⏎'),
    kept_empty: kept.length < 5, // 절단 후 본문이 사실상 사라지면 위험 → 보류 대상
  })
}

const risky = previews.filter((p) => p.kept_empty)
console.log(`절단 대상(잔재 마커 있음): ${previews.length}`)
console.log(`  → 절단 후 본문<5자(위험, 보류): ${risky.length}`)
console.log(`  → 안전 절단: ${previews.length - risky.length}`)
console.log('')
console.log('── 안전 절단 샘플 8건 (kept_tail ⟪잘림⟫ removed_head) ──')
for (const p of previews.filter((x) => !x.kept_empty).slice(0, 8)) {
  console.log(`[${p.code}] …${p.kept_tail}  ⟪✂ -${p.removed_len}⟫  ${p.removed_head}`)
}
console.log('')
console.log('── 위험(보류) 샘플 6건 ──')
for (const p of risky.slice(0, 6)) {
  console.log(`[${p.code}] kept="${p.kept_tail}"  removed_head=${p.removed_head}`)
}

writeFileSync(new URL('./results/bleed-cut-preview.json', import.meta.url).pathname,
  JSON.stringify(previews, null, 1))
console.log(`\n저장: scripts/results/bleed-cut-preview.json (${previews.length})`)
