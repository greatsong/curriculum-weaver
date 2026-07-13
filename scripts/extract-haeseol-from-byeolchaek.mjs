#!/usr/bin/env node
/**
 * 교육부 고시 원문(별책 JSON, 페이지별_원문)에서 성취기준 해설(가) + 적용 시 고려사항(나)을
 * 코드별로 추출한다 (READ-ONLY 추출·매칭·커버리지 측정). 정본 미변경.
 *
 * 원문 서식:
 *   성취기준 해설
 *    • [10통사1-01-01]에서는 … 다룬다.
 *    • [10통사1-01-03], [10통사1-01-04]에서는 … 한다.
 *   (나) 성취기준 적용 시 고려 사항
 *    • …
 *
 * 사용: node scripts/extract-haeseol-from-byeolchaek.mjs <별책JSON경로> [--codes 코드,코드]
 */
import { readFileSync } from 'node:fs'

const INPUT = process.argv[2]
if (!INPUT) { console.error('사용법: node ... <별책JSON>'); process.exit(1) }
const j = JSON.parse(readFileSync(INPUT, 'utf8'))
const pages = j['페이지별_원문'] || []
// 페이지 경계 마커를 넣어 러닝푸터/쪽번호 제거에 활용
const full = pages.map((p) => `␞${p.page_number}␞\n${p.text}`).join('\n')

// 모든 코드 포맷 포괄: [12고대02-05] · [10통사1-01-01] · [공관 02-03-05] · [12영Ⅱ-02-09]
const CODE_SRC = '\\[[0-9가-힣A-Za-zⅠ-Ⅹ][0-9가-힣A-Za-zⅠ-Ⅹ \\-·]*?[0-9]{2}-[0-9]{2}\\]'
const CODE_RE = new RegExp(CODE_SRC)
const CODE_G = new RegExp(CODE_SRC, 'g')

// 러닝푸터(페이지 하단 반복 제목) — <쪽번호> + 러닝제목. 개행 유무 무관하게 인라인으로 제거.
const RUNNING_FOOTER = /\s*\d{1,3}\s*(선택\s*중심\s*교육과정\s*[–—\-]\s*[가-힣]+\s*과목\s*[–—\-]?|[가-힣]{2,10}\s*계열\s*선택\s*과목\s*교육과정|[가-힣]{2,8}\s*교과\s*교육과정|[가-힣]{1,8}과\s*교육과정|[가-힣]{0,10}\s*공통\s*교육과정)\s*/g
// 러닝푸터/페이지마커/쪽번호 정리
function clean(t) {
  return (t || '')
    .replace(/␞\d+␞/g, ' ') // 페이지 마커
    .replace(/\n[ \t]*\d{1,3}[ \t]*\n[ \t]*[^\n]*?(교육과정|계열\s*선택\s*과목|선택\s*중심\s*교육과정)[^\n]*/g, '\n') // 개행형 러닝푸터 블록
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/\s+/g, ' ')
    .replace(RUNNING_FOOTER, ' ') // 인라인 러닝푸터(쪽번호+제목)
    .replace(/\s+/g, ' ')
    .trim()
}

// "성취기준 해설" 섹션들: 헤더 다음부터 "(나) …적용 시 고려" 또는 다음 "(가)/(2)/영역" 전까지
const haeseol = {} // code -> { text, page }
const SECTION_RE = /성취기준\s*해설/g
let m
while ((m = SECTION_RE.exec(full))) {
  const start = m.index + m[0].length
  // 섹션 끝: 다음 "(나) …적용 시 고려 사항" 또는 다음 "성취기준 해설" 또는 "(다)"·영역헤더
  const rest = full.slice(start)
  const endMatch = /적용\s*시\s*고려\s*사항|성취기준\s*해설|\n\s*\(\s*\d+\s*\)\s*[가-힣]/.exec(rest.slice(3))
  const body = rest.slice(0, endMatch ? endMatch.index + 3 : 2500)
  // 불릿 단위로 분해: "• [code]…에서는 …"
  const bullets = body.split(/\n?\s*•\s*/).filter((b) => CODE_RE.test(b))
  for (const b of bullets) {
    const codes = b.match(CODE_G) || []
    if (!codes.length) continue
    // 해설 본문 = 첫 코드 그룹(연속된 [code], [code]…) 이후
    const lastCodeEnd = b.lastIndexOf(codes[codes.length - 1]) + codes[codes.length - 1].length
    let text = b.slice(lastCodeEnd)
    // 코드-본문 연결 조사만 제거. "이/가"는 "이 성취기준은…" 정상 해설 문두라 제거하지 않음.
    text = clean(text).replace(/^(에서는|은|는|과|와|에서|,|\)|에|의)\s*/, '').trim()
    // 후행 섹션 마커 이후 절단.
    // ① "(나) 성취기준…"·"(가) 영역…" 등 enum+구조어(enum 접두 필수 → 본문 내 "성취기준을 달성" 오제거 방지)
    text = text.replace(/\s*\([가-하]\)\s*(성취기준|영역)[\s\S]*$/, '')
      // ② enum 없이도 자명한 전체 헤더
      .replace(/\s*(성취기준\s*적용\s*시\s*고려\s*사항|적용\s*시\s*고려\s*사항|성취기준\s*해설)[\s\S]*$/, '')
      // ③ 다음 영역 번호헤더 "(3) …"
      .replace(/\s*\(\s*\d+\s*\)\s*[가-힣][\s\S]*$/, '').trim()
    if (text.length < 10) continue
    // 공동 해설(여러 코드)이면 "이 성취기준들은…" 뉘앙스로 각 코드에 동일 본문 저장
    const shared = codes.length > 1
    for (const c of codes) {
      if (!haeseol[c]) haeseol[c] = { text, shared, codes: codes.length > 1 ? codes : undefined }
    }
  }
}

const codes = Object.keys(haeseol)
console.log(`별책: ${j['메타데이터']?.과목명 || INPUT} — 추출된 해설 코드: ${codes.length}`)

const filterCodes = (() => { const i = process.argv.indexOf('--codes'); return i >= 0 ? new Set(process.argv[i + 1].split(',')) : null })()
if (filterCodes) {
  const hit = [...filterCodes].filter((c) => haeseol[c])
  const miss = [...filterCodes].filter((c) => !haeseol[c])
  console.log(`대상 ${filterCodes.size}건 중 — 원문 해설 있음: ${hit.length} / 없음(빈값정리 대상): ${miss.length}`)
  console.log('\n[해설 있음 샘플]')
  hit.slice(0, 4).forEach((c) => console.log(`  ${c}: ${haeseol[c].text.slice(0, 90)}…`))
  console.log('\n[해설 없음(원문에 해설 미존재)]')
  console.log('  ' + miss.slice(0, 30).join(' '))
}

// 결과 저장
import { writeFileSync } from 'node:fs'
const out = new URL('./results/haeseol-' + (j['메타데이터']?.별책_번호 || 'x') + '.json', import.meta.url).pathname
writeFileSync(out, JSON.stringify(haeseol, null, 1))
console.log(`\n저장: ${out.split('/scripts/')[1]} (${codes.length} codes)`)
