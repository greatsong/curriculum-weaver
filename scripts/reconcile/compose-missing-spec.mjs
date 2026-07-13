#!/usr/bin/env node
/**
 * 누락 과목 최종 명세서 생성 (READ-ONLY).
 * subject-map(원문 과목명·코드) × 정본 × standards_social(복원소스) 교차.
 * 출력: results/missing-spec.json + _workspace/qa/reconcile/MISSING-SUBJECTS-SPEC.md
 */
import { ALL_STANDARDS } from '../../server/data/standards.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SMAP = JSON.parse(readFileSync(path.join(__dirname, 'results', 'subject-map.json'), 'utf8'))
const GTC = JSON.parse(readFileSync(path.join(__dirname, 'results', 'groundtruth-content.json'), 'utf8'))
let SOCIAL = new Set()
try { const s = await import('../../server/data/standards_social.js'); const arr = s.SOCIAL_STANDARDS || s.default || []; SOCIAL = new Set(arr.map((x) => x.code.replace(/\s+/g, '').replace(/–/g, '-'))) } catch {}

const nk = (c) => c.replace(/\s+/g, '').replace(/–/g, '-')
const canon = new Set(ALL_STANDARDS.map((s) => nk(s.code)))
// GT content 진짜 성취기준 필터
const realStd = (c) => c && c.length >= 12 && /(다|음|함|기)\.?$|한다\.?$|된다\.?$|있다\.?$/.test(String(c).replace(/[\s"'’”)\]]+$/, '').slice(-6))
const cleanName = (n) => (n || '').replace(/^\s*[\d]+\s*[.)]\s*/, '').replace(/^\s*[가-하]\s*[.)]\s*/, '').trim() || '(미상)'

const rows = []
for (const [prefix, v] of Object.entries(SMAP)) {
  // 이 프리픽스의 원문 유효 코드(GT content 실존)
  const orig = v.codes.filter((c) => { const g = GTC[c] || GTC[c.replace(/ /g, '   ')]; return g && realStd(g.content) })
  if (!orig.length) continue
  const missing = orig.filter((c) => !canon.has(nk(c)))
  if (!missing.length) continue
  const inSocial = missing.filter((c) => SOCIAL.has(nk(c))).length
  rows.push({
    byeolchaek: v.byeolchaek, subject: cleanName(v.subject), prefix,
    orig: orig.length, canon: orig.length - missing.length, missing: missing.length,
    status: canon.has(nk(orig.find((c) => canon.has(nk(c))) || '')) ? 'partial' : 'whole',
    restoreSocial: inSocial, sampleCodes: missing.slice(0, 3),
  })
}
rows.sort((a, b) => a.byeolchaek - b.byeolchaek || b.missing - a.missing)
const totMissing = rows.reduce((s, r) => s + r.missing, 0)
const whole = rows.filter((r) => r.canon === 0), partial = rows.filter((r) => r.canon > 0)

// 별책 → 교과명
const BNAME = { 5: '국어', 6: '도덕', 7: '사회', 8: '수학', 9: '과학', 10: '실과/정보', 11: '체육', 12: '음악', 13: '미술', 14: '영어', 16: '제2외국어', 17: '한문', 19: '교양', 20: '과학계열', 21: '체육계열', 22: '예술계열', 23: '전문(경영금융)' }
let md = `# 정본 누락 과목 명세서 (2026-07-13)\n\n원문 별책 과목명 ↔ 정본 대조. **통째누락 ${whole.length}과목 + 부분누락 ${partial.length}과목, 총 ${totMissing}개 코드 미존재.**\n정본 4,854 → 원문 기준 약 ${4854 + totMissing}.\n\n`
md += `| 별책 | 과목명 | 접두 | 원문 | 정본 | 누락 | 상태 | 복원(social) |\n|---|---|---|---:|---:|---:|---|---:|\n`
for (const r of rows) md += `| ${BNAME[r.byeolchaek] || r.byeolchaek} | ${r.subject} | ${r.prefix} | ${r.orig} | ${r.canon} | ${r.missing} | ${r.status === 'whole' ? '통째' : '부분'} | ${r.restoreSocial || '-'} |\n`
md += `\n## 별책(교과)별 누락 합계\n\n`
const byB = {}
for (const r of rows) byB[r.byeolchaek] = (byB[r.byeolchaek] || 0) + r.missing
for (const [b, n] of Object.entries(byB).sort((a, b2) => b2[1] - a[1] || 0)) md += `- ${BNAME[b] || ('별책' + b)}: ${n}\n`

writeFileSync(path.join(__dirname, 'results', 'missing-spec.json'), JSON.stringify(rows, null, 1))
writeFileSync(path.join(__dirname, '..', '..', '_workspace', 'qa', 'reconcile', 'MISSING-SUBJECTS-SPEC.md'), md)
console.log(`통째누락 ${whole.length}과목 / 부분누락 ${partial.length}과목 / 총 누락코드 ${totMissing}`)
console.log('별책별 누락:', JSON.stringify(byB))
console.log('\n저장: _workspace/qa/reconcile/MISSING-SUBJECTS-SPEC.md')
