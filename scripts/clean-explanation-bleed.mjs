#!/usr/bin/env node
/**
 * explanation bleed 비파괴 클리닝 — 자동복원 트랙 (Step 2+3)
 *
 * 대상: hard_bleed 컷 + (나)적용시고려사항 → application_notes 이관.
 * 제외: content_lost(사회 헤더스텁 + 복합유실) + PUA 잔존 7건 → 원문 트랙(손대지 않음).
 *
 * 연산(레코드당):
 *   1) explanation에서 "잔재 시작 최초 지점"을 찾아 그 앞까지만 남긴다(cut).
 *      잔재 시작 = min( (나)헤더, 다음성취기준코드, 페이지푸터, 다음영역 번호헤더 ).
 *   2) (나) 블록이 있으면 그 텍스트(헤더 다음~다음 하드마커 전)를 application_notes로 이관.
 *      단 application_notes가 이미 차 있으면 이관하지 않고 보류 목록에 남긴다.
 *   content·keywords·기타 필드는 절대 불변. explanation/application_notes만.
 *
 * 실행:
 *   node scripts/clean-explanation-bleed.mjs            # dry-run 요약 + 샘플 + fixes JSON 저장
 *   node scripts/clean-explanation-bleed.mjs --samples 12
 */
import { ALL_STANDARDS } from '../server/data/standards.js'
import { writeFileSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import classified from './results/bleed-classified.json' with { type: 'json' }

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const sampleN = (() => { const i = args.indexOf('--samples'); return i >= 0 ? Number(args[i + 1]) : 6 })()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CANONICAL = path.join(__dirname, '..', 'server', 'data', 'standards.js')

// ── 제외 집합 (원문 트랙) ──
const contentLost = new Set(classified.rows.filter((r) => r.bucket === 'content_lost').map((r) => r.code))
const PUA_REMAINING = new Set(['[12고대03-06]', '[12고미01-05]', '[12이수01-04]', '[12전수01-07]', '[12전수02-07]', '[12전수03-09]', '[12경수02-06]'])

// ── 마커 정규식 ──
const OWN_CODE = /\[[0-9]{2}[가-힣A-Za-z]{1,6}[0-9]{2}-[0-9]{2}\]/g
const FOOT = [/(진로|일반|융합)\s*선택\s*과목/, /[가-힣]{2,10}\s*계열\s*선택\s*과목/, /선택\s*중심\s*교육과정/, /공통\s*교육과정/, /과목\s*교육과정/, /\d+\s*[가-힣]{0,12}\s*교육과정/]
// 러닝 푸터(문미): "고등학교 교양 교과 교육과정" 류 — (나) 본문 끝에 딸려온 것만 제거(광범위 컷 마커로 쓰면 산업수요전문 교수학습 보일러플레이트를 오컷하므로 문미 한정)
const TRAILING_FOOTER_RE = /\s*\d{0,3}\s*(고등학교|중학교|초등학교)?\s*[가-힣]{2,8}\s*교과\s*교육과정\s*$/
// 본문 중간에 박힌 러닝푸터 블록(페이지 경계): "\n<쪽번호>\n<러닝제목 …교육과정/…과목 ->" — 전역 제거해 페이지 넘김 앞뒤 (나) 내용을 잇는다.
// 쪽번호줄 + 러닝제목줄의 결합만 매칭해 본문 내 정상 "교육과정" 언급 오제거 방지.
const FOOTER_BLOCK_RE = /\n[ \t]*\d{1,3}[ \t]*\n[ \t]*[^\n]*?(교과\s*교육과정|계열\s*선택\s*과목|선택\s*중심\s*교육과정|과목\s*교육과정)[^\n]*/g
const stripFooterBlocks = (t) => (t || '').replace(FOOTER_BLOCK_RE, '\n')
const NUMBERING = /(^|\n)\s*\(\s*\d+\s*\)\s*[가-힣]/
// 영역 구조 열거 헤더 "(가) 성취기준 해설", "(나) 영역 성취기준" 등 — 순수 컷 대상(내용 아님).
// 줄머리 + (가~하) + 성취기준/영역 키워드로 한정해 인라인 "(열) 수지" 오탐 배제.
const ENUM_SECTION = /(^|\n)\s*\([가-하]\)\s*(성취기준|영역\s*성취기준|영역)/
const GUIDANCE_HDR = /\(?\s*나\s*\)?\s*성취기준\s*적용\s*시\s*고려\s*사항|적용\s*시\s*고려\s*사항/
const PUA = /[\u{E000}-\u{F8FF}]/u

// 보수적 공백 정규화 — 기존 정상 appnotes 규약(다중공백 0, \n 줄바꿈, \n\n 불릿구분)에 맞춤.
// 문자 내용은 불변, 수평공백 런만 정리. (어절 중간 단일공백 "있 게" 같은 잔재는 사전 없이 확정 불가라 보존)
function normalizeWs(t) {
  if (!t) return t
  return t
    .replace(/[ \t ]{2,}/g, ' ') // 다중 수평공백 → 단일
    .replace(/[ \t ]*\n[ \t ]*/g, '\n') // 개행 주변 공백 제거
    .replace(/\n{3,}/g, '\n\n') // 3+ 개행 → 불릿구분 2개로
    .replace(/\s+\d{1,3}\s*$/, '') // 끝에 딸려온 쪽번호 제거(문미 1~3자리 숫자)
    .trim()
}

function firstIndexOf(text, re, from = 0) {
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  r.lastIndex = from; const m = r.exec(text); return m ? m.index : -1
}
// 하드마커(잔재)의 최초 위치 (own code 제외)
function firstHard(text, ownCode, from = 0) {
  const idxs = []
  const r = new RegExp(OWN_CODE.source, 'g'); r.lastIndex = from; let m
  while ((m = r.exec(text))) { if (m[0] !== ownCode) { idxs.push(m.index); break } }
  for (const f of FOOT) { const i = firstIndexOf(text, f, from); if (i >= 0) idxs.push(i) }
  const nm = new RegExp(NUMBERING.source, 'g'); nm.lastIndex = from; const nmm = nm.exec(text); if (nmm) idxs.push(nmm.index + (nmm[1] ? nmm[1].length : 0))
  const em = new RegExp(ENUM_SECTION.source, 'g'); em.lastIndex = from; const emm = em.exec(text); if (emm) idxs.push(emm.index + (emm[1] ? emm[1].length : 0))
  return idxs.length ? Math.min(...idxs) : -1
}

const fixes = []
const held = [] // appnotes 이미 참 → 이관 보류
const flaggedPua = []
let cutOnly = 0, cutAndMove = 0

for (const s of ALL_STANDARDS) {
  if (contentLost.has(s.code) || PUA_REMAINING.has(s.code)) continue
  const text = s.explanation || ''
  if (!text.trim()) continue

  const guidIdx = firstIndexOf(text, GUIDANCE_HDR)
  const hardIdx = firstHard(text, s.code)
  if (guidIdx < 0 && hardIdx < 0) continue // 오염 없음

  const cut = Math.min(...[guidIdx, hardIdx].filter((x) => x >= 0))
  const keptExpl = normalizeWs(stripFooterBlocks(text.slice(0, cut)))

  // 안전장치: 컷 후 본문이 사라지면 content_lost로 봐야 함 → 손대지 않음
  if (keptExpl.replace(/[\s,~·⋅]/g, '').length < 5) continue

  const fix = { code: s.code, subject: s.subject_group, actions: [], old_explanation: text, new_explanation: keptExpl }

  // (나) 이관: guidance 헤더가 있으면
  if (guidIdx >= 0) {
    // (나) 본문 = 헤더 다음부터 그 뒤 첫 하드마커 전까지
    const afterHdrMatch = new RegExp(GUIDANCE_HDR.source).exec(text)
    const bodyStart = afterHdrMatch ? afterHdrMatch.index + afterHdrMatch[0].length : guidIdx
    const nextHard = firstHard(text, s.code, bodyStart)
    const guidEnd = nextHard >= 0 ? nextHard : text.length
    const guidBody = normalizeWs(stripFooterBlocks(text.slice(bodyStart, guidEnd)).replace(/^[\s\n:·]+/, '')).replace(TRAILING_FOOTER_RE, '').trim()
    if (guidBody.length >= 5) {
      if ((s.application_notes || '').trim()) {
        held.push({ code: s.code, reason: 'application_notes 이미 있음', existing: s.application_notes.slice(0, 60), incoming: guidBody.slice(0, 60) })
        fix.actions.push('cut_only(guidance_held)')
      } else {
        fix.new_application_notes = guidBody
        fix.actions.push('cut', 'move_guidance')
        cutAndMove++
      }
    }
  }
  if (!fix.actions.includes('move_guidance')) { fix.actions.push('cut'); cutOnly++ }

  if (PUA.test(keptExpl) || PUA.test(fix.new_application_notes || '')) flaggedPua.push(s.code)
  fixes.push(fix)
}

// ── 출력 ──
console.log('━━━ explanation bleed 클리닝 dry-run ━━━')
console.log(`대상(자동복원): ${fixes.length}건  = 컷만 ${cutOnly} + 컷&(나)이관 ${cutAndMove}`)
console.log(`(나) 이관 보류(appnotes 기존값): ${held.length}건`)
console.log(`제외(원문트랙): content_lost ${contentLost.size} + PUA ${PUA_REMAINING.size}`)
if (flaggedPua.length) console.log(`⚠️ 클린 결과에 PUA 잔존(신규 확인 필요): ${flaggedPua.length}건 — ${flaggedPua.slice(0, 8).join(' ')}`)
console.log('')
console.log(`── 샘플 ${sampleN}건 (kept explanation ▶ 이관 appnotes) ──`)
for (const f of fixes.filter((x) => x.actions.includes('move_guidance')).slice(0, sampleN)) {
  console.log(`\n[${f.code}] ${f.subject}  actions=${f.actions.join('+')}`)
  console.log(`  expl: …${f.new_explanation.slice(-90).replace(/\n/g, ' ')}`)
  console.log(`  →appnotes: ${(f.new_application_notes || '').slice(0, 110).replace(/\n/g, ' ')}…`)
}
if (held.length) {
  console.log('\n── 이관 보류 샘플 ──')
  held.slice(0, 4).forEach((h) => console.log(`  [${h.code}] 기존="${h.existing}" / 들어올값="${h.incoming}"`))
}

writeFileSync(new URL('./results/explanation-bleed-fixes.json', import.meta.url).pathname, JSON.stringify({ generated: APPLY ? 'applied' : 'dry-run', counts: { total: fixes.length, cutOnly, cutAndMove, held: held.length, flaggedPua: flaggedPua.length }, fixes, held, flaggedPua }, null, 1))
console.log(`\n저장: scripts/results/explanation-bleed-fixes.json (${fixes.length} fixes)`)

// ── 적용(--apply): 백업 후 explanation/application_notes만 비파괴 교체 ──
if (APPLY) {
  const fixByCode = new Map(fixes.map((f) => [f.code, f]))
  let patched = 0
  const next = ALL_STANDARDS.map((s) => {
    const f = fixByCode.get(s.code)
    if (!f) return s
    const out = { ...s } // content·keywords·기타 불변
    out.explanation = f.new_explanation
    if (f.new_application_notes !== undefined) out.application_notes = f.new_application_notes
    patched++
    return out
  })
  // 백업
  const stamp = args.find((a) => /^\d{8}$/.test(a)) || 'prebleed'
  const backupDir = path.join(__dirname, '..', 'server', 'data', `backup_${stamp}_explbleed`)
  mkdirSync(backupDir, { recursive: true })
  copyFileSync(CANONICAL, path.join(backupDir, 'standards.js'))
  // 헤더 보존 재직렬화
  const src = readFileSync(CANONICAL, 'utf8')
  const marker = 'export const ALL_STANDARDS = '
  const headerEnd = src.indexOf(marker)
  if (headerEnd < 0) { console.error('❌ ALL_STANDARDS 마커 없음 — 중단'); process.exit(1) }
  const header = src.slice(0, headerEnd)
  writeFileSync(CANONICAL, header + marker + JSON.stringify(next, null, 2) + ';\n')
  console.log(`\n✅ 적용: ${patched}건 정본 갱신 (백업: ${path.relative(path.join(__dirname, '..'), backupDir)})`)
  console.log('   content·keywords 불변, explanation·application_notes만 수정')
}
