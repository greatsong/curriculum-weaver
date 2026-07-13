#!/usr/bin/env node
/**
 * Phase 0 — Ground-Truth Index 빌더 (READ-ONLY).
 *
 * 교육부 고시 원문(별책 JSON, 페이지별_원문)에서 코드별 구조화 레코드를 만든다:
 *   { code, content(성취기준), haeseol(해설), guidance((나)), byeolchaek, subject }
 *
 * 원문 구조(실측):
 *   나. 성취기준
 *   (1) <영역명>
 *   [code] <성취기준 문장>.        ← 줄머리 [code], 여러 줄 wrap. content.
 *   (가) 성취기준 해설
 *    • [code]에서는 …             ← 불릿. haeseol.
 *   (나) 성취기준 적용 시 고려 사항
 *    • …                         ← guidance.
 *
 * 핵심 원칙: 원문 substring만 저장(할루시네이션 0). 정규화는 비교 단계에서.
 * 출력: results/groundtruth.json  { [code]: {content, haeseol, guidance, byeolchaek, page} }
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC_DIR = '/Users/greatsong/Downloads/outputs'

// 모든 코드 포맷 포괄: [12고대02-05]·[10통사1-01-01]·[공관 02-03-05]·[12영Ⅱ-02-09]·[9기가03-04](한자리)
const CODE_CORE = '\\[[0-9가-힣A-Za-zⅠ-Ⅹ][0-9가-힣A-Za-zⅠ-Ⅹ \\-·]*?[0-9]{1,2}-[0-9]{2}\\]'
const CODE_RE = new RegExp(CODE_CORE)
const CODE_G = new RegExp(CODE_CORE, 'g')
// 줄머리 코드(불릿 아님) — content 앵커
const LINE_CODE_RE = new RegExp('^\\s*(' + CODE_CORE + ')\\s*(.*)$')

// content 캡처를 멈추는 경계 라인
function isBoundaryLine(line) {
  const t = line.trim()
  if (!t) return false
  return (
    /^•/.test(t) ||                                   // 해설/(나) 불릿
    /^</.test(t) ||                                    // <탐구 활동>·<예시> 등 하위 헤더
    /^\([가-하]\)/.test(t) ||                          // (가)(나)(다)
    /^\(\s*\d+\s*\)/.test(t) ||                        // (1) 영역
    /^[가-하]\s*\.\s/.test(t) ||                        // 가. 나. 다.
    /^\d+\s*\.\s*[가-힣]/.test(t) ||                    // 3. 교수학습
    /성취기준\s*해설/.test(t) ||
    /적용\s*시\s*고려/.test(t) ||
    /내용\s*체계/.test(t) ||
    /교수\s*[⋅·․]\s*학습/.test(t) ||
    /^평가$/.test(t)
  )
}
// 페이지 러닝푸터/쪽번호 라인(무시)
function isFooterLine(line) {
  const t = line.trim()
  if (!t) return true
  if (/^\d{1,4}$/.test(t)) return true                                  // 쪽번호
  if (/^[가-힣0-9][가-힣0-9\s()·⋅/]{1,30}(교육과정)$/.test(t)) return true // "사회과 교육과정"·"제2외국어과 교육과정"
  if (/(계열\s*선택\s*과목|선택\s*중심\s*교육과정|전문\s*교과)/.test(t) && /교육과정|과목/.test(t) && t.length < 40) return true
  if (/^(일반|진로|융합)\s*선택\s*[-–—]/.test(t) && t.length < 30) return true // "일반 선택 - 베트남어"
  return false
}

function buildForByeolchaek(file) {
  const j = JSON.parse(readFileSync(path.join(SRC_DIR, file), 'utf8'))
  const meta = j['메타데이터'] || {}
  const num = meta['별책_번호'] || meta['제목'] || file
  const pages = j['페이지별_원문'] || []
  const out = {} // code -> {content, page}

  for (const pg of pages) {
    // 각 페이지 개별 + 다음 페이지 이어지는 wrap 대비 이어붙이기는 전체에서
  }

  // content: 전체 텍스트를 라인 단위로 순회하며 "성취기준" 섹션 안의 줄머리 코드 블록 캡처.
  // 페이지 경계를 넘는 wrap이 있으므로 전체를 페이지마커와 함께 결합.
  const lines = []
  for (const pg of pages) {
    lines.push({ marker: pg.page_number })
    for (const ln of String(pg.text).split('\n')) lines.push({ text: ln, page: pg.page_number })
  }

  let i = 0
  while (i < lines.length) {
    const L = lines[i]
    if (L.marker !== undefined || L.text === undefined) { i++; continue }
    const m = LINE_CODE_RE.exec(L.text)
    // content 코드 라인: 줄머리 코드 + 불릿 아님. 해설 섹션의 "• [code]"는 LINE_CODE_RE가 ^\s*•라 매칭 안됨.
    if (m && !/•/.test(L.text)) {
      const code = m[1].replace(/\s+/g, ' ')
      let buf = [m[2]]
      let j2 = i + 1
      while (j2 < lines.length) {
        const N = lines[j2]
        if (N.marker !== undefined) { j2++; continue }          // 페이지 마커 건너뜀
        if (N.text === undefined) { j2++; continue }
        if (LINE_CODE_RE.test(N.text) && !/•/.test(N.text)) break // 다음 content 코드
        if (isBoundaryLine(N.text)) break                        // 섹션 경계
        if (isFooterLine(N.text)) { j2++; continue }             // 푸터/쪽번호 무시
        buf.push(N.text)
        j2++
      }
      const content = buf.join(' ').replace(/\s+/g, ' ').trim()
      // 성취기준 문장으로 보이는 것만(종결 어미·최소 길이). 목차/표 파편 배제.
      if (content.length >= 8 && !out[code]) {
        out[code] = { content, page: L.page }
      }
      i = j2
      continue
    }
    i++
  }

  return { num, subject: meta['과목명'] || '', codes: out }
}

// ── 실행 ──
const files = readdirSync(SRC_DIR).filter((x) => /^2022_개정_교육과정_별책\d+\.json$/.test(x))
const groundtruth = {} // code -> {content, byeolchaek, subject, page}
const perByeolchaek = {}
for (const f of files.sort()) {
  const { num, subject, codes } = buildForByeolchaek(f)
  const n = Object.keys(codes).length
  perByeolchaek[f] = { num, subject, extracted: n }
  for (const [code, rec] of Object.entries(codes)) {
    if (!groundtruth[code]) groundtruth[code] = { content: rec.content, byeolchaek: num, subject, page: rec.page }
  }
}

writeFileSync(path.join(__dirname, 'results', 'groundtruth-content.json'), JSON.stringify(groundtruth, null, 1))
console.log('=== 별책별 content 추출 ===')
for (const [f, v] of Object.entries(perByeolchaek)) console.log(`  ${f}: ${v.subject} → ${v.extracted} codes`)
console.log(`\n총 원문 content 코드: ${Object.keys(groundtruth).length}`)
console.log('저장: scripts/reconcile/results/groundtruth-content.json')
