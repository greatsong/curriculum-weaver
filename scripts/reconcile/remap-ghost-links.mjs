#!/usr/bin/env node
/**
 * Round 1 — 유령 중복 코드 제거에 따른 Supabase curriculum_links remap.
 * 유령 [수입   01-05-04](공백3)를 참조하는 링크 3건을 정상본 [수입 01-05-04](공백1)로 이관.
 * [수입   01-05-02]는 참조 0건(제거만).
 * source_code < target_code 정규화 유지(공백 축소는 정렬 불변 — 사전 검증).
 * ⚠ 프로덕션 DB 쓰기 — 머지 승인 시점에만 --apply. 기본은 dry-run(읽기).
 *
 * 크레덴셜: 원본 트리 server/.env (워크트리엔 없음).
 * 사용: node scripts/reconcile/remap-ghost-links.mjs [--apply] [--env <path>]
 */
import { readFileSync } from 'node:fs'

const APPLY = process.argv.includes('--apply')
const envIdx = process.argv.indexOf('--env')
const ENV_PATH = envIdx >= 0 ? process.argv[envIdx + 1] : '/Users/greatsong/greatsong-project/curriculum-weaver/server/.env'

const env = readFileSync(ENV_PATH, 'utf8')
const getEnv = (k) => (env.match(new RegExp('^' + k + '=(.+)$', 'm')) || [])[1]?.trim()
const BASE = getEnv('SUPABASE_URL'), KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }

const GHOST = '[수입   01-05-04]'
const CANON = '[수입 01-05-04]'

async function q(pathq) { return (await fetch(BASE + '/rest/v1/' + pathq, { headers: H })).json() }

;(async () => {
  const enc = encodeURIComponent(GHOST)
  const rows = await q(`curriculum_links?or=(source_code.eq.${enc},target_code.eq.${enc})&select=id,source_code,target_code,status,link_type`)
  console.log(`유령 ${JSON.stringify(GHOST)} 참조 링크: ${rows.length}`)
  const plans = []
  for (const l of rows) {
    const src = l.source_code === GHOST ? CANON : l.source_code
    const tgt = l.target_code === GHOST ? CANON : l.target_code
    // source < target 정규화 확인
    const [a, b] = [src, tgt].sort()
    plans.push({ id: l.id, from: [l.source_code, l.target_code], to: [a, b], status: l.status })
    console.log(`  ${l.id.slice(0, 8)} ${JSON.stringify(l.source_code)}↔${JSON.stringify(l.target_code)} → ${JSON.stringify(a)}↔${JSON.stringify(b)}`)
  }
  // 정상본 기존 링크와 충돌(중복 쌍) 확인
  const cenc = encodeURIComponent(CANON)
  const existing = await q(`curriculum_links?or=(source_code.eq.${cenc},target_code.eq.${cenc})&select=source_code,target_code`)
  const existSet = new Set(existing.map((e) => e.source_code + '|' + e.target_code))
  const collisions = plans.filter((p) => existSet.has(p.to[0] + '|' + p.to[1]))
  console.log(`정상본 기존 링크: ${existing.length} / remap 충돌: ${collisions.length}`)

  if (!APPLY) { console.log('\n(dry-run — 프로덕션 미변경. 머지 승인 후 --apply)'); return }

  let updated = 0, deleted = 0
  for (const p of plans) {
    if (existSet.has(p.to[0] + '|' + p.to[1])) {
      // 충돌 → 중복 방지 위해 유령 링크 삭제
      await fetch(BASE + '/rest/v1/curriculum_links?id=eq.' + p.id, { method: 'DELETE', headers: H }); deleted++
    } else {
      await fetch(BASE + '/rest/v1/curriculum_links?id=eq.' + p.id, { method: 'PATCH', headers: H, body: JSON.stringify({ source_code: p.to[0], target_code: p.to[1] }) }); updated++
    }
  }
  console.log(`\n✅ remap ${updated} / 충돌삭제 ${deleted}`)
})()
