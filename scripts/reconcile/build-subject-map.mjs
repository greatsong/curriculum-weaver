#!/usr/bin/env node
/**
 * 원문 별책에서 과목명 ↔ 코드 매핑 추출 (READ-ONLY, 명세화용).
 * 구조: <과목명>\n\n N. 성격 … 나. 성취기준 … [code] … (다음 과목의 N. 성격까지)
 * 각 "성격" 헤더 직전 제목줄 = 과목명. 그 과목 구간의 성취기준 코드 수집.
 * 출력: results/subject-map.json { prefix: {subject, byeolchaek, codes:[...] } }
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = '/Users/greatsong/Downloads/outputs'
const CODE_G = /\[[0-9가-힣A-Za-zⅠ-Ⅹ][0-9가-힣A-Za-zⅠ-Ⅹ \-·–]*?[0-9]{1,2}[-–][0-9]{2}\]/g
const prefixOf = (code) => {
  const inner = code.replace(/[\[\]]/g, '').replace(/\s+/g, '')
  const m = inner.match(/^([0-9]*)([가-힣A-Za-zⅠ-Ⅹ]+)/)
  return m ? m[2] : inner
}
const footer = (l) => /^\s*\d{1,4}\s*$/.test(l) || /(교육과정|계열\s*선택\s*과목|선택\s*중심)/.test(l) && l.trim().length < 40

function subjectsIn(file) {
  const j = JSON.parse(readFileSync(path.join(SRC, file), 'utf8'))
  const num = (j['메타데이터'] || {})['별책_번호'] || file
  const text = (j['페이지별_원문'] || []).map((p) => p.text).join('\n')
  const lines = text.split('\n')
  // "성격"/"성격 및 목표" 헤더 라인 = 과목 시작 (최상위 번호 헤더만: "1." 또는 "가.")
  const HDR = /^\s*(1|가)\s*\.\s*성격(\s*및\s*목표)?\s*$/
  // 제목 아닌 구조어(역추적 시 건너뜀)
  const STRUCT = /성격|목표|성취기준|내용\s*체계|평가|교수|고려\s*사항|교육과정|편제|^[Ⅰ-Ⅹ\d.\s]+$|^[가-하]\s*\./
  const starts = []
  for (let i = 0; i < lines.length; i++) {
    if (HDR.test(lines[i])) {
      // 직전 제목줄 = 과목명 (구조어·푸터·숫자·빈줄 건너뜀)
      let name = ''
      for (let k = i - 1; k >= 0 && i - k < 12; k--) {
        const t = lines[k].trim()
        if (!t || footer(lines[k]) || STRUCT.test(t)) continue
        if (t.length < 2 || t.length > 25) continue
        name = t; break
      }
      starts.push({ line: i, name })
    }
  }
  // 각 과목 구간 [start_i, start_{i+1}) 의 코드 수집
  const subjects = []
  for (let s = 0; s < starts.length; s++) {
    const from = starts[s].line
    const to = s + 1 < starts.length ? starts[s + 1].line : lines.length
    const chunk = lines.slice(from, to).join('\n')
    const codes = [...new Set((chunk.match(CODE_G) || []).map((c) => c.replace(/\s+/g, ' ').replace(/–/g, '-')))]
    subjects.push({ name: starts[s].name, byeolchaek: num, codes })
  }
  return subjects
}

const files = readdirSync(SRC).filter((x) => /^2022_개정_교육과정_별책\d+\.json$/.test(x))
const prefixMap = {} // prefix -> {subject, byeolchaek, codes:Set}
for (const f of files.sort()) {
  for (const subj of subjectsIn(f)) {
    // 과목 구간 내 코드 → 프리픽스별 그룹(한 과목이 여러 프리픽스 가질 수도)
    for (const code of subj.codes) {
      const p = prefixOf(code)
      if (!prefixMap[p]) prefixMap[p] = { subject: subj.name, byeolchaek: subj.byeolchaek, codes: new Set() }
      prefixMap[p].codes.add(code)
      // 과목명이 비었던 경우 채우기
      if (!prefixMap[p].subject && subj.name) prefixMap[p].subject = subj.name
    }
  }
}
const out = {}
for (const [p, v] of Object.entries(prefixMap)) out[p] = { subject: v.subject, byeolchaek: v.byeolchaek, count: v.codes.size, codes: [...v.codes] }
writeFileSync(path.join(__dirname, 'results', 'subject-map.json'), JSON.stringify(out, null, 1))
console.log('프리픽스 수:', Object.keys(out).length)
console.log('샘플 매핑:')
for (const p of ['세지', '여지', '한탐', '정치', '경제', '독어', '비서']) if (out[p]) console.log(`  ${p} → "${out[p].subject}" (별책${out[p].byeolchaek}, ${out[p].count})`)
