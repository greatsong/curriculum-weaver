#!/usr/bin/env node
/**
 * 완결성/귀속 오류 전수 탐지 (반-할루시네이션 통과분) — 5 카테고리.
 * READ-ONLY. 결과를 scripts/results/completeness-errors.json 저장.
 */
import { ALL_STANDARDS } from '../server/data/standards.js'
import { writeFileSync } from 'node:fs'

const norm = (t) => (t || '').replace(/\s/g, '')
const CONTENT_SYSTEM = /(\[[^\]]{1,20}\]|<[^>]{1,20}>|[가-힣0-9·]{1,20})?\s*가\s*\.\s*내용\s*체계/ // "[과목] 가. 내용 체계"
const UNTERMINATED = /[,，、\-–—(（[]$/ // 문미 미종결(쉼표·대시·열린괄호)
const endsCleanKo = (t) => { const e = (t || '').replace(/["'’”)\]』」]+$/, '').trim(); return e.length <= 15 || /[.?!]$|다$|음$|함$|기$|라$|것$|점$|임$|됨$/.test(e) }

const cats = { cross_subject: [], expl_truncation: [], tail_stub: [], appnotes_truncation: [], fragment: [] }
for (const s of ALL_STANDARDS) {
  const e = (s.explanation || '').trim(), a = (s.application_notes || '').trim(), c = (s.content || '').trim()
  // 1) 교차과목 내용체계 bleed (appnotes 또는 expl에 "가. 내용 체계")
  if (CONTENT_SYSTEM.test(e) || CONTENT_SYSTEM.test(a)) cats.cross_subject.push(s.code)
  // 3) tail-stub: explanation이 content 문장의 꼬리 어절과 동일(끝부분 일치)하고 짧음
  else if (e && c && e.length < 40 && norm(c).endsWith(norm(e)) && norm(e).length >= 3) cats.tail_stub.push(s.code)
  // 2) explanation 심각절단/오귀속: 조사·연결어로 시작(문두결손) 또는 미종결이면서 짧음
  else if (e && e.length >= 5 && (/^(를|을|은|는|이|가|와|과|에|의|로|으로)\s|^[를을은는이가와과]/.test(e) || (!endsCleanKo(e) && e.length < 120))) cats.expl_truncation.push(s.code)
  // 5) 파편: appnotes가 무의미 짧은 조각(조사 시작·<8자)
  if (a && a.length < 10 && /^(까지|부터|의|를|을|은|는|와|과)/.test(a)) cats.fragment.push(s.code)
  // 4) appnotes 하드 절단: 미종결(쉼표/괄호/대시 끝)
  else if (a && a.length > 20 && UNTERMINATED.test(a) && !cats.cross_subject.includes(s.code)) cats.appnotes_truncation.push(s.code)
}
// 중복 제거·상호배제 정리
for (const k of Object.keys(cats)) cats[k] = [...new Set(cats[k])]
// cross_subject에 든 건 appnotes_truncation에서 빼기
cats.appnotes_truncation = cats.appnotes_truncation.filter((c) => !cats.cross_subject.includes(c) && !cats.fragment.includes(c))

const total = new Set([...cats.cross_subject, ...cats.expl_truncation, ...cats.tail_stub, ...cats.appnotes_truncation, ...cats.fragment])
console.log('완결성/귀속 오류 탐지:')
for (const [k, v] of Object.entries(cats)) console.log(`  ${k.padEnd(20)}: ${v.length}`)
console.log(`  고유 코드 합계: ${total.size}`)
console.log('')
for (const [k, v] of Object.entries(cats)) { console.log(`[${k}] ${v.slice(0, 12).join(' ')}${v.length > 12 ? ' …' : ''}`) }
writeFileSync(new URL('./results/completeness-errors.json', import.meta.url).pathname, JSON.stringify(cats, null, 1))
console.log('\n저장: scripts/results/completeness-errors.json')
