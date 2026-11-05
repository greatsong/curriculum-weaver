#!/usr/bin/env node
/**
 * materials 버킷 고아 파일 정리 — 워크스페이스·프로젝트 삭제가 Storage 파일을 지우지 않던 때 남은 업로드 원본.
 * 판단 기준은 server/lib/projectStorage.js의 findOrphanMaterialFiles:
 *   - 삭제된 프로젝트: 폴더 이름(프로젝트 ID)의 프로젝트가 DB에 없다
 *   - 참조 없는 파일: 프로젝트는 있지만 어느 자료 행도 가리키지 않는다(자료 삭제 때 Storage 삭제 실패 등)
 * 어느 자료 행이든 가리키는 파일(시뮬레이션 복제본이 공유하는 원본 포함)과 최근 파일은 건너뛴다.
 *
 * 사용법:
 *   node scripts/cleanup-orphan-material-files.mjs                       # 시험 실행(기본): 찾기만 하고 지우지 않는다
 *   node scripts/cleanup-orphan-material-files.mjs --list                # 고아 파일 경로를 전부 출력
 *   node scripts/cleanup-orphan-material-files.mjs --out scripts/results/orphans.json   # 결과를 JSON으로 저장
 *   node scripts/cleanup-orphan-material-files.mjs --apply               # 실제 삭제(지우기 직전에 참조를 다시 확인)
 *
 * 옵션:
 *   --min-age-hours N                    이보다 최근 파일은 건너뛴다(기본 24). 업로드 중인 파일과 겹치지 않게 한다
 *   --only deleted_project|unreferenced  한 종류만 다룬다
 *
 * 환경: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. 이미 설정된 환경변수가 우선이고, 없으면 server/.env에서 읽는다.
 * 주의: 지운 Storage 파일은 되돌릴 수 없다. --apply 전에 시험 실행 결과를 검토할 것.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { config as dotenvConfig } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { findOrphanMaterialFiles, removeUnreferencedFiles } from '../server/lib/projectStorage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenvConfig({ path: path.join(__dirname, '..', 'server', '.env'), quiet: true })

const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const opt = (n) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null }

const APPLY = flag('--apply')
const LIST = flag('--list')
const OUT = opt('--out')
const ONLY = opt('--only')
const MIN_AGE_HOURS = opt('--min-age-hours') == null ? 24 : Number(opt('--min-age-hours'))
const REASON_LABELS = { deleted_project: '삭제된 프로젝트', unreferenced: '참조 없는 파일' }

function fail(message) {
  console.error(`오류: ${message}`)
  process.exit(1)
}

if (!Number.isFinite(MIN_AGE_HOURS) || MIN_AGE_HOURS < 0) fail('--min-age-hours는 0 이상의 숫자여야 합니다.')
if (ONLY && !REASON_LABELS[ONLY]) fail('--only는 deleted_project 또는 unreferenced입니다.')

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || SUPABASE_URL.includes('placeholder')) {
  fail('SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다(server/.env 또는 환경변수).')
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
console.log(`대상: ${new URL(SUPABASE_URL).host} / materials 버킷${APPLY ? ' (실제 삭제)' : ' (시험 실행)'}`)

const report = await findOrphanMaterialFiles(sb, { minAgeMs: MIN_AGE_HOURS * 60 * 60 * 1000 })
const orphans = ONLY ? report.orphans.filter((o) => o.reason === ONLY) : report.orphans

const mb = (bytes) => (bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${(bytes / 1024 / 1024).toFixed(2)}MB`)
const sizeOf = (list) => list.reduce((n, o) => n + (o.size || 0), 0)
console.log(`폴더 ${report.scannedFolders}개, 파일 ${report.scannedFiles}개를 확인했습니다.`)
console.log(`  자료 행이 가리키는 파일 ${report.referenced}개, ${MIN_AGE_HOURS}시간 이내이거나 생성 시각을 모르는 파일 ${report.skippedRecent}개는 건너뜀`)
if (report.otherFolders.length) console.log(`  프로젝트 ID 형식이 아닌 폴더 ${report.otherFolders.length}개는 판단하지 않음: ${report.otherFolders.join(', ')}`)
if (report.rootFiles) console.log(`  버킷 맨 위 파일 ${report.rootFiles}개는 판단하지 않음`)
for (const [reason, label] of Object.entries(REASON_LABELS)) {
  if (ONLY && ONLY !== reason) continue
  const list = orphans.filter((o) => o.reason === reason)
  const projects = new Set(list.map((o) => o.projectId)).size
  console.log(`고아 파일(${label}): ${list.length}개, 프로젝트 ${projects}개, ${mb(sizeOf(list))}`)
  for (const o of LIST ? list : list.slice(0, 5)) console.log(`  - ${o.path} (${o.createdAt?.slice(0, 10) || '날짜 없음'})`)
  if (!LIST && list.length > 5) console.log(`  … 외 ${list.length - 5}개 (전체는 --list)`)
}

if (OUT) {
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), minAgeHours: MIN_AGE_HOURS, ...report, orphans }, null, 2))
  console.log(`결과를 ${OUT}에 저장했습니다.`)
}

if (!APPLY) {
  console.log('\n[시험 실행] 아무것도 지우지 않았습니다. 실제 삭제는 --apply를 붙여 다시 실행하세요.')
  process.exit(0)
}
if (!orphans.length) {
  console.log('\n지울 파일이 없습니다.')
  process.exit(0)
}

const result = await removeUnreferencedFiles(sb, orphans.map((o) => o.path))
console.log(`\n[실제 삭제] ${result.removed}개 삭제, 그사이 참조가 생겨 남긴 파일 ${result.kept}개`)
for (const f of result.failed) console.error(`  실패(${f.step}): ${f.error}`)
process.exit(result.failed.length ? 2 : 0)
