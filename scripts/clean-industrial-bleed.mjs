#!/usr/bin/env node
/**
 * 산업수요전문(마이스터고) explanation의 "교수·학습/평가 섹션 헤더" bleed 정리.
 * (별개 클래스 — 산업수요전문 별책엔 성취기준 해설 섹션이 없어 원문복원 불가, 컷만 가능)
 *
 * 컷 규칙: explanation에서 "본문 뒤에 딸려온 섹션 헤더" 최초 지점에서 절단.
 *   섹션 마커(가장 이른 것):
 *     - "N. 교수 ․ 학습" (줄머리 섹션헤더. 인라인 "…교수·학습을 계획" 문장은 보존)
 *     - 전문교과/과 교육과정 러닝푸터
 *     - "N. <다음 과목/영역 제목>" 다음 섹션 번호헤더
 *   컷 후 본문<5자면 손대지 않음(전체가 교수학습 내용인 경우).
 *
 * 사용: node scripts/clean-industrial-bleed.mjs [--apply YYYYMMDD]
 */
import { ALL_STANDARDS } from '../server/data/standards.js'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const stamp = args.find((a) => /^\d{8}$/.test(a)) || 'industrial'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CANONICAL = path.join(__dirname, '..', 'server', 'data', 'standards.js')

// 산업수요전문 = 공백 포함 코드 "[공관 02-03-05]"
const isIndustrial = (code) => /^\[[가-힣]{2,}\s+\d/.test(code)

// ── Step1: 본문 중간/끝에 박힌 러닝푸터 블록을 전역 제거(페이지 경계 앞뒤 본문 이어붙임) ──
// <쪽번호줄> + <러닝제목 줄(…교육과정/…과목…)> — 한 줄 통째 제거.
const FOOTER_LINE = /\s*\d{1,3}[ \t]*\n+[ \t]*[^\n]*?(전문\s*교과\s*교육과정|계열\s*선택\s*과목\s*교육과정|전문\s*공통\s*과목|전공\s*(일반|실무)\s*과목|[가-힣]{2,10}\s*전문\s*교과)[^\n]*/g
const stripFooters = (t) => (t || '').replace(FOOTER_LINE, ' ')

// ── Step2: 러닝푸터 제거 후 남는 "다음 영역" bleed 마커 (여기서 컷) ──
const SECTION_TEACHING = /\n[\s\d.]*교수\s*[·․]\s*학습/       // "3. 교수 ․ 학습" (줄머리, 인라인 문장 보존)
const ENUM_HEADER = /\n\s*([가-하]|\d{1,2})\)\s*[가-힣]/       // "나) 자주 검사" · "2) 설비 일상 관리"
const NEXT_SECTION = /\n\s*\d+\.\s*[가-힣]/                    // "5. 회계 정보 처리 시스템"
const FOREIGN_CODE = /\[[가-힣]{2,}\s+\d[\d\-]*\]/g            // "[공관 01-02-01]" (다음 성취기준)

function firstMarker(text, ownCode) {
  const idxs = []
  for (const re of [SECTION_TEACHING, ENUM_HEADER, NEXT_SECTION]) {
    const m = re.exec(text); if (m) idxs.push(m.index)
  }
  const fc = new RegExp(FOREIGN_CODE.source, 'g'); let m
  while ((m = fc.exec(text))) { if (m[0].replace(/\s+/g, ' ') !== ownCode.replace(/\s+/g, ' ')) { idxs.push(m.index); break } }
  return idxs.length ? Math.min(...idxs) : -1
}
const normalize = (t) => (t || '').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]*\n[ \t]*/g, ' ').replace(/\s{2,}/g, ' ').trim()
// 문장 종결(과잉컷 방지 가드): 종결부호/한국어 종결어미로 끝나야 안전 컷
const endsClean = (t) => /[.?!]$|(다|함|음|기|라|것|점|임|됨|짐)$/.test(t.replace(/["'’”)\]』」]+$/, ''))

const fixes = []
let cut = 0, skipped = 0, unsafe = 0
for (const s of ALL_STANDARDS) {
  if (!isIndustrial(s.code)) continue
  const raw = s.explanation || ''
  if (!raw.trim()) continue
  const stripped = stripFooters(raw)
  const idx = firstMarker(stripped, s.code)
  // 컷 지점이 없어도 푸터 제거만으로 바뀌면 반영
  const base = idx >= 0 ? stripped.slice(0, idx) : stripped
  const kept = normalize(base)
  if (kept === normalize(raw)) continue // 변화 없음
  if (kept.replace(/[\s,~·]/g, '').length < 5) { skipped++; continue } // 전체가 섹션내용 → 보류
  if (!endsClean(kept)) { unsafe++; continue } // 문장 중간 절단 위험 → 스킵(수동 트랙)
  fixes.push({ code: s.code, subject: s.subject, old_explanation: raw, new_explanation: kept })
  cut++
}

console.log('━━━ 산업수요전문 교수학습 bleed 컷 ' + (APPLY ? '(적용)' : '(dry-run)') + ' ━━━')
console.log(`컷 대상: ${cut} / 전체가 섹션내용이라 보류: ${skipped}`)
console.log('── 샘플 ──')
for (const f of fixes.slice(0, 4)) {
  console.log(`[${f.code}] …${f.new_explanation.slice(-55)}  ✂ (-${f.old_explanation.length - f.new_explanation.length})`)
}
writeFileSync(path.join(__dirname, 'results', 'industrial-bleed-fixes.json'), JSON.stringify({ mode: APPLY ? 'applied' : 'dry-run', cut, skipped, fixes }, null, 1))
console.log('\n저장: scripts/results/industrial-bleed-fixes.json')

if (APPLY) {
  const byCode = new Map(fixes.map((f) => [f.code, f]))
  let patched = 0
  const next = ALL_STANDARDS.map((s) => {
    const f = byCode.get(s.code); if (!f) return s
    patched++; return { ...s, explanation: f.new_explanation }
  })
  const backupDir = path.join(__dirname, '..', 'server', 'data', `backup_${stamp}_industrial`)
  mkdirSync(backupDir, { recursive: true })
  copyFileSync(CANONICAL, path.join(backupDir, 'standards.js'))
  const src = readFileSync(CANONICAL, 'utf8')
  const marker = 'export const ALL_STANDARDS = '
  const he = src.indexOf(marker)
  writeFileSync(CANONICAL, src.slice(0, he) + marker + JSON.stringify(next, null, 2) + ';\n')
  console.log(`\n✅ 적용: ${patched}건 (백업 ${path.relative(path.join(__dirname, '..'), backupDir)}) — content·keywords 불변`)
}
