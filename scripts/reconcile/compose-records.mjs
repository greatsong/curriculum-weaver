#!/usr/bin/env node
/**
 * 누락 성취기준 → 완전 레코드 조립 (원문 별책 기반, READ 전용 산출).
 * content/explanation = GT 인덱스(원문 verbatim). area·curriculum_category·(나) = 원문에서 추출.
 * subject = subject-map(원문 과목명). keywords = content 토큰(기존 관례).
 *
 * 사용: node scripts/reconcile/compose-records.mjs --byeolchaek 7 --group 사회 [--out social]
 * 출력: results/composed-<out>.json (신규 레코드 배열) — 검증 후 apply-restore로 정본 병합.
 */
import { ALL_STANDARDS } from '../../server/data/standards.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = '/Users/greatsong/Downloads/outputs'
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d }
const BNUM = arg('byeolchaek'), GROUP = arg('group'), OUT = arg('out', 'out')

const GTC = JSON.parse(readFileSync(path.join(__dirname, 'results', 'groundtruth-content.json'), 'utf8'))
const GTE = JSON.parse(readFileSync(path.join(__dirname, 'results', 'groundtruth-expl.json'), 'utf8'))
const SMAP = JSON.parse(readFileSync(path.join(__dirname, 'results', 'subject-map.json'), 'utf8'))
let SOCIAL = {}
try { const s = await import('../../server/data/standards_social.js'); for (const x of (s.SOCIAL_STANDARDS || [])) SOCIAL[nk(x.code)] = x } catch {}

function nk(c) { return c.replace(/\s+/g, '').replace(/–/g, '-') }
const canon = new Set(ALL_STANDARDS.map((s) => nk(s.code)))
const prefixOf = (code) => { const m = code.replace(/[\[\]]/g, '').replace(/\s+/g, '').match(/^([0-9]*)([가-힣A-Za-zⅠ-Ⅹ]+)/); return m ? m[2] : code }

const CODE_CORE = '\\[[0-9가-힣A-Za-zⅠ-Ⅹ][0-9가-힣A-Za-zⅠ-Ⅹ \\-·–]*?[0-9]{1,2}[-–][0-9]{2}\\]'
const CODE_G = new RegExp(CODE_CORE, 'g')
const RUNNING_FOOTER = /\s*\d{1,3}\s*(선택\s*중심\s*교육과정\s*[–—\-]\s*[가-힣]+\s*과목\s*[–—\-]?|[가-힣]{2,10}\s*계열\s*선택\s*과목\s*교육과정|[가-힣]{2,8}\s*교과\s*교육과정|[가-힣]{1,8}과\s*교육과정|[가-힣]{0,10}\s*공통\s*교육과정)\s*/g
const clean = (t) => (t || '').replace(RUNNING_FOOTER, ' ').replace(/\s+/g, ' ').trim()

// explanation/(나) 최종 정리: 푸터 다형·선두 범위코드·다음성취기준 절단
const CC = '\\[[0-9가-힣A-Za-zⅠ-Ⅹ][0-9가-힣A-Za-zⅠ-Ⅹ \\-·–]*?[0-9]{1,2}[-–][0-9]{2}\\]'
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function stripFooters(t, subject) {
  let x = (t || '')
    .replace(/[]/g, '•') // 별책11 등 PUA 불릿 인코딩 → 표준 •
    .replace(/\d{1,4}\s*선택\s*중심\s*교육과정\s*[–—\-]\s*[가-힣]+(\s*[가-힣]+)?\s*과목\s*[–—\-]?/g, ' ') // "234 선택 중심 교육과정 – 진로 선택 과목 -"
    .replace(/\d{1,4}\s*[가-힣]{2,10}\s*계열\s*선택\s*과목\s*교육과정/g, ' ')
    .replace(/\d{1,4}\s*[가-힣0-9]{1,10}과\s*교육과정/g, ' ') // "109 사회과 교육과정"·"176 제2외국어과 교육과정"
    .replace(/\d{1,4}\s*[가-힣]{2,8}\s*교과\s*교육과정/g, ' ')
  // 과목명 인지 러닝푸터: "<page#> 일반/진로/융합 선택 – <과목명>" (별책16 페이지 경계 삽입)
  if (subject) x = x.replace(new RegExp('\\d{1,4}\\s*(일반|진로|융합)\\s*선택\\s*[–—\\-]\\s*' + reEsc(subject) + '\\s*', 'g'), ' ')
  x = x.replace(/\d{1,4}\s*(일반|진로|융합)\s*선택\s*[–—\-]\s*[가-힣][가-힣\s]{0,10}?(?=\s|$)/g, ' ') // 과목명 미상 폴백(짧게 바운드)
  return x.replace(/\s+/g, ' ').trim()
}
function stripLeadCodes(t) { // "[c1]~[c4]는" / "~[c]는" 선두 범위·연결조사
  return (t || '').replace(new RegExp('^\\s*~?\\s*(' + CC + '\\s*[~,]?\\s*)+\\s*(에서는|은|는|이|가|에서|,)?\\s*'), '').trim()
}
function cutTrailingNextStd(t) { // 문장종결 후 새 코드(다음 성취기준/불릿) 절단. 괄호참조 "([2국01-01])"는 앞이 "("라 제외
  const m = (t || '').match(new RegExp('[.다요음]\\s*[•\\s]*' + CC))
  return m ? t.slice(0, m.index + 1).trim() : (t || '')
}
const PUA_BULLET = new RegExp(String.fromCodePoint(0xf09f), 'g')
const finalClean = (t, subject) => stripFooters(cutTrailingNextStd(stripLeadCodes(String(t || '').replace(PUA_BULLET, '•'))), subject)

// ── 원문 파싱: 과목 구간 → area/category/(나) ──
const j = JSON.parse(readFileSync(path.join(SRC, `2022_개정_교육과정_별책${BNUM}.json`), 'utf8'))
const pages = j['페이지별_원문'] || []
const text = pages.map((p) => p.text).join('\n')
const lines = text.split('\n')

// 과목 시작(성격 헤더) 인덱스 + 과목명
const HDR = /^\s*(1|가)\s*\.\s*성격(\s*및\s*목표)?\s*$/
const STRUCT = /성격|목표|성취기준|내용\s*체계|평가|교수|고려\s*사항|교육과정|편제|^[Ⅰ-Ⅹ\d.\s]+$|^[가-하]\s*\./
const starts = []
for (let i = 0; i < lines.length; i++) {
  if (HDR.test(lines[i])) {
    let name = ''
    for (let k = i - 1; k >= 0 && i - k < 12; k--) { const t = lines[k].trim(); if (!t || /(교육과정)$/.test(t) || /^\d{1,4}$/.test(t) || STRUCT.test(t) || t.length < 2 || t.length > 25) continue; name = t; break }
    starts.push({ line: i, name })
  }
}

// 코드 → {area, guidance, category, subject}
const meta = {}
const CATS = [['일반 선택', '일반선택'], ['진로 선택', '진로선택'], ['융합 선택', '융합선택'], ['공통 과목', '공통'], ['전공 일반', '전공일반'], ['전공 실무', '전공실무']]
for (let s = 0; s < starts.length; s++) {
  const from = starts[s].line, to = s + 1 < starts.length ? starts[s + 1].line : lines.length
  const region = lines.slice(from, to)
  const regionText = region.join('\n')
  const subject = starts[s].name
  // category: 구간 텍스트의 러닝푸터/헤더에서
  let category = ''
  for (const [pat, val] of CATS) if (new RegExp(pat.replace(' ', '\\s*') + '\\s*과목').test(regionText)) { category = val; break }
  // area 파싱: "나. 성취기준" 이후 "(N) 영역명" → 코드 할당
  let curArea = '', inStd = false, curGuideArea = ''
  const guidanceByArea = {}
  for (let li = 0; li < region.length; li++) {
    const t = region[li].trim()
    if (/^나\s*\.\s*성취기준|^\d\s*\.\s*성취기준|^성취기준$/.test(t)) { inStd = true; continue }
    const am = t.match(/^\(\s*(\d+)\s*\)\s*(.+)$/)
    if (am && inStd) { curArea = clean(am[2]); continue }
    // content 코드 라인 → area 기록
    const lc = region[li].match(new RegExp('^\\s*(' + CODE_CORE + ')'));
    if (lc && inStd && !/•/.test(region[li])) {
      const code = nk(lc[1])
      if (!meta[code]) meta[code] = { area: curArea, subject, category }
      else if (!meta[code].area) meta[code].area = curArea
    }
  }
  // (나) 블록: "(나) 성취기준 적용 시 고려 사항" ~ 다음 영역/섹션. 직전 영역 코드로 area 매핑.
  const GH = /\(\s*나\s*\)\s*성취기준\s*적용\s*시\s*고려\s*사항/g
  let gm
  while ((gm = GH.exec(regionText))) {
    const after = regionText.slice(gm.index + gm[0].length)
    const end = /\(\s*가\s*\)\s*성취기준\s*해설|\(\s*나\s*\)\s*성취기준\s*적용|성취기준\s*해설|\n\s*\(\s*\d+\s*\)\s*[가-힣]|[가-하]\s*\.\s*(교수|평가)|가\s*\.\s*내용\s*체계|\d\s*\.\s*교수/.exec(after.slice(3))
    let body = clean(after.slice(0, end ? end.index + 3 : 2500))
    const nextStd = new RegExp('\\n\\s*' + CODE_CORE + '\\s*[가-힣]').exec(body); if (nextStd) body = body.slice(0, nextStd.index).trim()
    if (body.length < 15) continue
    // 직전 900자 코드 → 영역
    const before = regionText.slice(Math.max(0, gm.index - 900), gm.index)
    const codes = before.match(CODE_G) || []; if (!codes.length) continue
    const freq = {}; for (const c of codes) { const a = meta[nk(c)]?.area || ''; freq[a] = (freq[a] || 0) + 1 }
    const area = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]
    if (!(area in guidanceByArea)) guidanceByArea[area] = body
  }
  // guidance를 area로 각 코드에 부여
  for (const code of Object.keys(meta)) {
    if (meta[code].subject !== subject) continue
    if (meta[code].guidance) continue
    const g = guidanceByArea[meta[code].area]; if (g) meta[code].guidance = g
  }
}

// ── 대상: GROUP 소속 & 정본 미존재 코드 조립 ──
// GROUP 판정: subject-map의 prefix가 대상 별책이고 정본에 없는 코드
const KW = (content) => (content || '').replace(/[.,·]/g, ' ').split(/\s+/).filter((w) => w.length >= 2 && /[가-힣]/.test(w)).slice(0, 5)
const records = []
let noContent = 0, noMeta = 0
for (const [code, gt] of Object.entries(GTC)) {
  if (gt.byeolchaek != BNUM) continue
  const k = nk(code)
  if (canon.has(k)) continue // 이미 정본에 있음
  const m = meta[k]
  const subj = m?.subject || SMAP[prefixOf(code)]?.subject || ''
  if (!m || !subj) { noMeta++; }
  // content: 원문 verbatim. 단 PDF 추출로 종결부호가 유실된 경우("…한다" 무마침표)만 마침표 복구
  //  (형제 성취기준은 "…다." 종결 → 유실 명백. 내용 창작 아님)
  let content = gt.content
  if (/다$/.test(content.trim())) content = content.trim() + '.'
  const expl = finalClean(GTE[k]?.haeseol || '', subj) // 원문 해설 우선. 없으면 빈값(선별적)
  records.push({
    code: code.replace(/\s+/g, ' ').replace(/–/g, '-'),
    subject_group: GROUP,
    subject: subj,
    grade_group: '고선택',
    school_level: '고등학교',
    curriculum_category: m?.category || SOCIAL[k]?.curriculum_category || '',
    area: m?.area || '성취기준',
    domain: '',
    content,
    keywords: (SOCIAL[k]?.keywords?.length ? SOCIAL[k].keywords : KW(content)),
    explanation: expl,
    application_notes: finalClean(m?.guidance || '', subj),
  })
}
records.sort((a, b) => a.code.localeCompare(b.code))
writeFileSync(path.join(__dirname, 'results', `composed-${OUT}.json`), JSON.stringify(records, null, 1))
console.log(`조립 레코드: ${records.length} (메타없음 ${noMeta})`)
// 품질 요약
const withExpl = records.filter((r) => r.explanation).length, withGuide = records.filter((r) => r.application_notes).length, withArea = records.filter((r) => r.area !== '성취기준').length, withCat = records.filter((r) => r.curriculum_category).length
console.log(`  explanation 보유: ${withExpl} / (나) 보유: ${withGuide} / 실area: ${withArea} / category: ${withCat}`)
const subs = {}; for (const r of records) subs[r.subject] = (subs[r.subject] || 0) + 1
console.log('  과목별:', JSON.stringify(subs))
console.log(`저장: scripts/reconcile/results/composed-${OUT}.json`)
