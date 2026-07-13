#!/usr/bin/env node
/**
 * 성취기준 explanation/application_notes 필드 "추출 잔재(bleed) 오염" 전수 스캐너 (READ-ONLY)
 *
 * 정본(server/data/standards.js)의 텍스트 필드에서 PDF/HWP 추출 잔재 유형을 분류·정량화한다.
 * 아무것도 수정하지 않는다. 결과 리포트(JSON + 요약)를 stdout/파일로 출력.
 *
 * 유형(신호 강도 순):
 *   A. foreign_code   — 다른 성취기준 코드 [12xxx00-00]가 섞임 (가장 강한 신호)
 *   B. page_footer    — 쪽번호 + 교육과정/과목 영역명 푸터 bleed
 *   C. numbering_head — 번호매김 영역 헤더 "(3) 행렬의 대각화"
 *   D. section_head   — 섹션 헤더 "(나) 성취기준 적용 시 고려 사항" 등 (원문 존재 — 경계 판정 대상)
 *   E. broken_word    — 어절 중간 띄어쓰기/개행 파손 "유 리함수", "구할 수 있 게"
 */
import { ALL_STANDARDS } from '../server/data/standards.js'
import { writeFileSync } from 'node:fs'

const OWN_CODE_RE = /\[[0-9]{2}[가-힣A-Za-z]{1,6}[0-9]{2}-[0-9]{2}\]/g
// 페이지 푸터: 교육과정 편제 영역명 (쪽번호는 줄 안/밖 어디든 붙어 있음)
const FOOTER_KEYWORD_RE = /(진로|일반|융합)\s*선택\s*과목|계열\s*선택\s*과목|선택\s*중심\s*교육과정|공통\s*교육과정|과목\s*교육과정|편제와\s*시간|[가-힣]{2,10}\s*계열\s*선택|\d+\s*[가-힣]{0,12}\s*교육과정/
// 번호매김 영역 헤더 "(3) 행렬의 대각화" — 줄머리에서만 (본문 중 "(3)회" 같은 인라인 배제)
const NUMBERING_HEAD_RE = /(^|\n)\s*\(\s*\d+\s*\)\s*[가-힣]/
// (나) 성취기준 적용 시 고려 사항 — 영역 공통 블록 (경계판정 대상)
const GUIDANCE_NOTES_RE = /적용\s*시\s*고려\s*사항/
// 영역 열거 헤더 (가)(나)(다)... 줄머리에서만 (인라인 "(열)","(예)" 배제)
const AREA_ENUM_RE = /(^|\n)\s*\([가-하]\)\s*[가-힣]/
// 다중공백: 한글 사이 3+ 연속 공백 = PDF 컬럼/표 추출 흔적
const SPACED_RUN_RE = /[가-힣] {3,}[가-힣]/
// 본문 유실 스텁: "성취기준 해설" 헤더만 남고 실질 내용 없음
const HEADER_ONLY_RE = /성취기준\s*해설/
const stripHeader = (t) => (t || '').replace(/\s|성취기준|해설/g, '')

function detect(text, ownCode) {
  if (!text || !text.trim()) return []
  const flags = []
  // A. foreign code (다음 성취기준 코드 침범 — 최강 신호)
  const codes = text.match(OWN_CODE_RE) || []
  const foreign = codes.filter((c) => c !== ownCode)
  if (foreign.length) flags.push('foreign_code')
  // B. page footer
  if (FOOTER_KEYWORD_RE.test(text)) flags.push('page_footer')
  // C. numbering header
  if (NUMBERING_HEAD_RE.test(text)) flags.push('numbering_head')
  // D. 본문 유실 스텁 ("성취기준 해설"만)
  if (HEADER_ONLY_RE.test(text) && stripHeader(text).length < 3) flags.push('header_only_stub')
  // E. (나) 적용 시 고려 사항 블록
  if (GUIDANCE_NOTES_RE.test(text)) flags.push('guidance_notes')
  // F. 기타 영역 열거 헤더 (D·E 아닌 (가)(나)…)
  else if (!flags.includes('header_only_stub') && AREA_ENUM_RE.test(text)) flags.push('area_enum')
  // G. 다중공백(3+)
  if (SPACED_RUN_RE.test(text)) flags.push('spaced_run')
  return flags
}

const FIELDS = ['explanation', 'application_notes']
const results = { explanation: {}, application_notes: {} }
const perFlagCount = {}
const perFlagSubject = {} // flag -> subject -> n
const records = [] // {code, subject, field, flags, preview}

for (const field of FIELDS) {
  const flagCounts = {}
  for (const s of ALL_STANDARDS) {
    const text = s[field]
    const flags = detect(text, s.code)
    if (!flags.length) continue
    for (const f of flags) {
      flagCounts[f] = (flagCounts[f] || 0) + 1
      perFlagCount[f] = (perFlagCount[f] || 0) + 1
      perFlagSubject[f] = perFlagSubject[f] || {}
      const subj = s.subject_group || s.subject || '(미분류)'
      perFlagSubject[f][subj] = (perFlagSubject[f][subj] || 0) + 1
    }
    records.push({
      code: s.code,
      subject_group: s.subject_group,
      subject: s.subject,
      field,
      flags,
      len: text.length,
      preview: text.slice(0, 160).replace(/\n/g, '⏎'),
    })
  }
  results[field] = flagCounts
}

// 중복(한 레코드에 여러 유형) 집계
const multiFlag = records.filter((r) => r.flags.length > 1).length
const affectedCodes = new Set(records.map((r) => r.code))

// ── 출력 ──
const pad = (s, w) => {
  const dw = [...String(s)].reduce((a, c) => a + (/[가-힣]/.test(c) ? 2 : 1), 0)
  return String(s) + ' '.repeat(Math.max(0, w - dw))
}
console.log('━━━ explanation/application_notes bleed 스캔 (정본 4,856) ━━━')
console.log(`영향 레코드(고유 code): ${affectedCodes.size} / 오염 필드 인스턴스: ${records.length} / 복수유형: ${multiFlag}`)
console.log('')
for (const field of FIELDS) {
  console.log(`── [${field}] 유형별 건수 ──`)
  const entries = Object.entries(results[field]).sort((a, b) => b[1] - a[1])
  for (const [f, n] of entries) console.log(pad(f, 18) + n)
  console.log('')
}
console.log('── 유형별 과목군 분포 (상위 6) ──')
for (const [f, subjMap] of Object.entries(perFlagSubject)) {
  const top = Object.entries(subjMap).sort((a, b) => b[1] - a[1]).slice(0, 6)
  console.log(pad(f, 18) + top.map(([s, n]) => `${s}:${n}`).join('  '))
}
console.log('')

// 원자료 저장
const outDir = new URL('./results/', import.meta.url).pathname
try {
  writeFileSync(outDir + 'bleed-scan-raw.json', JSON.stringify({ perFlagCount, byField: results, records }, null, 1))
  console.log(`원자료 저장: scripts/results/bleed-scan-raw.json (${records.length} rows)`)
} catch (e) {
  console.error('저장 실패:', e.message)
}
