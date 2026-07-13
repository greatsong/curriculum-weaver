#!/usr/bin/env node
/**
 * Phase 0 (explanation) — 원문 "(가) 성취기준 해설" 불릿을 코드별로 추출 (READ-ONLY).
 * 원문: (가) 성취기준 해설 \n • [code]에서는 …다룬다. \n • [c1], [c2]에서는 …
 * 규칙: 불릿의 선두 연속 코드 그룹 이후를 본문으로. 공동해설(복수코드)=동일본문 각 코드 부여.
 * 출력: results/groundtruth-expl.json { [code]: {haeseol, byeolchaek, shared} }
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC_DIR = '/Users/greatsong/Downloads/outputs'

const CODE_CORE = '\\[[0-9가-힣A-Za-zⅠ-Ⅹ][0-9가-힣A-Za-zⅠ-Ⅹ \\-·–]*?[0-9]{1,2}[-–][0-9]{2}\\]'
const CODE_RE = new RegExp(CODE_CORE)
const CODE_G = new RegExp(CODE_CORE, 'g')

// 러닝푸터 다형 제거
const RUNNING_FOOTER = /\s*\d{1,3}\s*(선택\s*중심\s*교육과정\s*[–—\-]\s*[가-힣]+\s*과목\s*[–—\-]?|[가-힣]{2,10}\s*계열\s*선택\s*과목\s*교육과정|[가-힣]{2,8}\s*교과\s*교육과정|[가-힣]{1,8}과\s*교육과정|[가-힣]{0,10}\s*공통\s*교육과정|(전공\s*실무|전공\s*일반|진로\s*선택|융합\s*선택|일반\s*선택|공통)\s*과목\s*[-–—][^\n]{0,20})\s*/g
function clean(t) {
  return (t || '')
    .replace(/␞\d+␞/g, ' ')
    .replace(/\n[ \t]*\d{1,3}[ \t]*\n[ \t]*[^\n]*?(교육과정|계열\s*선택\s*과목|선택\s*중심\s*교육과정)[^\n]*/g, '\n')
    .replace(/[ \t]+/g, ' ').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{2,}/g, '\n')
    .replace(RUNNING_FOOTER, ' ').replace(/\s+/g, ' ').trim()
}

function extract(file) {
  const j = JSON.parse(readFileSync(path.join(SRC_DIR, file), 'utf8'))
  const meta = j['메타데이터'] || {}
  const num = meta['별책_번호'] || file
  const full = (j['페이지별_원문'] || []).map((p) => `␞${p.page_number}␞\n${p.text}`).join('\n')
  const haeseol = {}
  const SECTION_RE = /성취기준\s*해설/g
  let m
  while ((m = SECTION_RE.exec(full))) {
    const start = m.index + m[0].length
    const rest = full.slice(start)
    // 섹션 끝: (나) 적용 시 고려 / 다음 성취기준 해설 / (다) / 다음 영역헤더 / 교수학습
    const endMatch = /적용\s*시\s*고려\s*사항|성취기준\s*해설|\n\s*\(\s*\d+\s*\)\s*[가-힣]|[가-하]\s*\.\s*(교수|평가)|가\s*\.\s*내용\s*체계/.exec(rest.slice(3))
    const body = rest.slice(0, endMatch ? endMatch.index + 3 : 2500)
    const bullets = body.split(/\n?\s*•\s*/).filter((b) => CODE_RE.test(b))
    for (const b of bullets) {
      // 선두 연속 코드 그룹: 불릿 맨앞 [code](, [code])* 이후가 본문
      const lead = new RegExp('^\\s*(' + CODE_CORE + ')(\\s*,\\s*' + CODE_CORE + ')*').exec(b)
      if (!lead) continue
      const codes = lead[0].match(CODE_G) || []
      if (!codes.length) continue
      let text = b.slice(lead[0].length)
      // 코드-본문 연결 조사만 제거. "이/가"(→"이 성취기준은")는 보존.
      text = clean(text).replace(/^(에서는|에서|은|는|과|와|,|\)|에|의)\s*/, '').trim()
      // 후행 섹션 마커 절단
      text = text.replace(/\s*\([가-하]\)\s*(성취기준|영역)[\s\S]*$/, '')
        .replace(/\s*(성취기준\s*적용\s*시\s*고려\s*사항|적용\s*시\s*고려\s*사항|성취기준\s*해설)[\s\S]*$/, '')
        .replace(/\s*\(\s*\d+\s*\)\s*[가-힣][\s\S]*$/, '').trim()
      if (text.length < 8) continue
      const shared = codes.length > 1
      for (const c of codes) {
        const code = c.replace(/\s+/g, ' ').replace(/–/g, '-') // 코드 정규화(엔대시→하이픈)
        if (!haeseol[code]) haeseol[code] = { haeseol: text, byeolchaek: num, shared }
      }
    }
  }
  return haeseol
}

const files = readdirSync(SRC_DIR).filter((x) => /^2022_개정_교육과정_별책\d+\.json$/.test(x))
const gt = {}
for (const f of files.sort()) {
  const h = extract(f)
  for (const [code, rec] of Object.entries(h)) if (!gt[code]) gt[code] = rec
}
writeFileSync(path.join(__dirname, 'results', 'groundtruth-expl.json'), JSON.stringify(gt, null, 1))
console.log(`원문 해설 추출 코드: ${Object.keys(gt).length}`)
console.log('저장: scripts/reconcile/results/groundtruth-expl.json')
