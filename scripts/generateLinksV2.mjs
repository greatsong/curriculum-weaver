#!/usr/bin/env node
/**
 * 링크 생성 파이프라인 v2 — 임베딩 후보 추출 + LLM 판정 2단계
 *
 * v1(교과 쌍 전수 프롬프트)의 한계를 해결:
 *  - recall 낮음/비결정적 → 1단계에서 임베딩 코사인으로 후보쌍을 결정적으로 추출
 *  - 코드 할루시네이션(v1에서 713개) → LLM은 후보를 "인덱스 번호"로만 참조 (코드 생성 불가)
 *  - 가짜 similarity → 실측 코사인(semantic_score) + LLM 품질 점수(quality_score) 기록
 *  - 전부 published 적재 → candidate로 적재해 3계층 검토 워크플로우 통과
 *
 * 사용법:
 *   node scripts/generateLinksV2.mjs --dry-run              # 1단계만: 후보쌍 통계
 *   node scripts/generateLinksV2.mjs --limit 2 --no-db      # 스모크: 2배치 판정, 파일만 출력
 *   node scripts/generateLinksV2.mjs                        # 전체 실행 + DB(candidate) 적재
 *   node scripts/generateLinksV2.mjs --backfill-semantic    # 기존 DB 링크의 semantic_score 채우기
 *
 * 옵션: --top-k 6  --min-cos 0.45  --concurrency 3  --batch-size 25
 * 필요 env (server/.env에서 자동 로드): OPENAI 임베딩 캐시(파일), ANTHROPIC_API_KEY,
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (DB 적재 시)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { config as dotenvConfig } from 'dotenv'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenvConfig({ path: path.join(__dirname, '..', 'server', '.env'), override: true })

// ─── 설정 ───
const EMBEDDINGS_FILE = path.join(__dirname, '..', 'server', 'data', 'openai-embeddings-cache.json')
const OUTPUT_DIR = path.join(__dirname, 'mission_output')
const PROGRESS_FILE = path.join(OUTPUT_DIR, 'v2_progress.jsonl')
const RESULT_FILE = path.join(OUTPUT_DIR, 'v2_links.jsonl')
const REPORT_DIR = path.join(__dirname, 'mission_reports')
const MODEL = 'claude-sonnet-5'
const LINK_TYPES = new Set(['cross_subject', 'same_concept', 'application', 'prerequisite', 'extension'])
const SCHOOL_LEVEL_ORDER = { '초등학교': 0, '중학교': 1, '고등학교': 2 }

// ─── CLI 인자 ───
const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const opt = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : def
}
const DRY_RUN = flag('--dry-run')
const NO_DB = flag('--no-db')
const BACKFILL = flag('--backfill-semantic')
const LIMIT_BATCHES = opt('--limit', Infinity)
const TOP_K = opt('--top-k', 6)
const MIN_COS = opt('--min-cos', 0.45)
const CONCURRENCY = opt('--concurrency', 3)
const BATCH_SIZE = opt('--batch-size', 25)

// ─── 유틸 ───
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }) }
function log(...a) { console.log(...a) }
function normalizePair(a, b) { return a < b ? [a, b] : [b, a] }

function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || url.includes('placeholder')) return null
  return createClient(url, key)
}

// ─── 데이터 로드 ───
async function loadStandards() {
  const { ALL_STANDARDS } = await import('../server/data/standards.js')
  // 서버 store.js와 동일한 오염 필터 (검색/그래프에 없는 성취기준은 후보에서 제외)
  const seen = new Set()
  return ALL_STANDARDS.filter(s => {
    const c = (s.content || '').trim()
    if (!c || c.length < 5) return false
    if (/^[\w가-힣[\]-]+의\s*성취기준\s*(내용|해설|코드)/.test(c)) return false
    if (/^적용\s*시\s*고려|^성취기준\s*(내용|해설)/.test(c)) return false
    if (seen.has(s.code)) return false
    seen.add(s.code)
    return true
  })
}

function loadEmbeddings() {
  if (!fs.existsSync(EMBEDDINGS_FILE)) {
    throw new Error(`임베딩 캐시 없음: ${EMBEDDINGS_FILE} — 서버를 한 번 구동해 생성하거나 캐시 파일을 받으세요`)
  }
  log('📦 임베딩 캐시 로드 중 (136MB)...')
  const raw = JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, 'utf-8'))
  const map = new Map()
  for (const [code, vec] of Object.entries(raw.embeddings)) {
    // 정규화된 Float32Array로 저장 (코사인 = 내적)
    const f = new Float32Array(vec)
    let norm = 0
    for (let i = 0; i < f.length; i++) norm += f[i] * f[i]
    norm = Math.sqrt(norm) || 1
    for (let i = 0; i < f.length; i++) f[i] /= norm
    map.set(code, f)
  }
  log(`  임베딩 ${map.size}개 로드 완료`)
  return map
}

/** 기존 링크 쌍(정규화) 집합 — DB 우선, 실패 시 정적 파일 */
async function loadExistingPairs(supabase) {
  const pairs = new Set()
  if (supabase) {
    try {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('curriculum_links')
          .select('source_code, target_code').range(from, from + 999)
        if (error) throw new Error(error.message)
        data.forEach(r => pairs.add(`${r.source_code}|${r.target_code}`))
        if (data.length < 1000) break
      }
      log(`  기존 DB 링크 쌍 ${pairs.size}개 (중복 생성 제외 대상)`)
      return pairs
    } catch (e) {
      log(`  ⚠️ DB 조회 실패(${e.message}) — 정적 파일로 폴백`)
    }
  }
  const { GENERATED_LINKS } = await import('../server/data/generatedLinks.js')
  for (const l of GENERATED_LINKS) {
    const [src, tgt] = Array.isArray(l) ? l : [l.source, l.target]
    const [a, b] = normalizePair(src, tgt)
    pairs.add(`${a}|${b}`)
  }
  log(`  기존 정적 링크 쌍 ${pairs.size}개 (중복 생성 제외 대상)`)
  return pairs
}

// ─── 1단계: 임베딩 코사인 후보쌍 추출 ───
function extractCandidatePairs(standards, embeddings, existingPairs) {
  const items = standards
    .filter(s => embeddings.has(s.code))
    .map(s => ({ ...s, vec: embeddings.get(s.code) }))
  const noEmbedding = standards.length - items.length
  log(`\n🔍 1단계: 후보쌍 추출 — 대상 ${items.length}개 (임베딩 없음 ${noEmbedding}개 제외)`)

  const stats = { compared: 0, belowMinCos: 0, sameGroup: 0, levelGap: 0, existing: 0 }
  // 각 성취기준별 top-K (교과군 밖, 학교급 인접) 후보 수집
  const perStandard = new Map() // code -> [{code, cos}]
  for (const s of items) perStandard.set(s.code, [])

  for (let i = 0; i < items.length; i++) {
    const a = items[i]
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j]
      const groupA = a.subject_group || a.subject
      const groupB = b.subject_group || b.subject
      if (groupA === groupB) { stats.sameGroup++; continue }
      const la = SCHOOL_LEVEL_ORDER[a.school_level], lb = SCHOOL_LEVEL_ORDER[b.school_level]
      if (la !== undefined && lb !== undefined && Math.abs(la - lb) > 1) { stats.levelGap++; continue }
      stats.compared++
      let cos = 0
      const va = a.vec, vb = b.vec
      for (let k = 0; k < va.length; k++) cos += va[k] * vb[k]
      if (cos < MIN_COS) { stats.belowMinCos++; continue }
      perStandard.get(a.code).push({ code: b.code, cos })
      perStandard.get(b.code).push({ code: a.code, cos })
    }
    if ((i + 1) % 500 === 0) log(`  ...${i + 1}/${items.length} 처리`)
  }

  // top-K 자르기 + 쌍 dedupe + 기존 링크 제외
  const pairMap = new Map() // "a|b" -> cos
  for (const [code, neighbors] of perStandard) {
    neighbors.sort((x, y) => y.cos - x.cos)
    for (const n of neighbors.slice(0, TOP_K)) {
      const [a, b] = normalizePair(code, n.code)
      const key = `${a}|${b}`
      if (existingPairs.has(key)) { stats.existing++; continue }
      if (!pairMap.has(key) || pairMap.get(key) < n.cos) pairMap.set(key, n.cos)
    }
  }

  const pairs = [...pairMap.entries()]
    .map(([key, cos]) => { const [a, b] = key.split('|'); return { a, b, cos } })
    .sort((x, y) => y.cos - x.cos)

  log(`  비교 ${stats.compared.toLocaleString()}쌍 | 임계값(${MIN_COS}) 미달 ${stats.belowMinCos.toLocaleString()} | 동일교과군 제외 ${stats.sameGroup.toLocaleString()} | 학교급 격차 제외 ${stats.levelGap.toLocaleString()}`)
  log(`  기존 링크와 중복 제외 ${stats.existing}쌍 → 신규 후보 ${pairs.length}쌍`)
  return pairs
}

// ─── 2단계: LLM 판정 (인덱스 참조 — 코드 할루시네이션 원천 차단) ───
function buildJudgePrompt(batch, stdByCode) {
  const pairsText = batch.map((p, i) => {
    const A = stdByCode.get(p.a), B = stdByCode.get(p.b)
    return `### 후보 ${i}
A: ${A.code} [${A.subject} · ${A.grade_group || A.school_level || ''}] ${A.content}
B: ${B.code} [${B.subject} · ${B.grade_group || B.school_level || ''}] ${B.content}`
  }).join('\n\n')

  return `당신은 한국 2022 개정 교육과정 기반 융합 수업 설계 전문가입니다.
아래 성취기준 후보 쌍들이 "실제 수업에서 함께 다루면 시너지가 나는 교육적 연결"인지 판정하세요.

## 판정 기준
- 표면적 단어 일치가 아닌 개념적·교육적 연결만 accept. 애매하면 reject.
- accept 시 반드시: link_type, quality(0.0~1.0), rationale(교사용 2~3문장, 어떤 수업 활동으로 연결되는지 구체적으로), integration_theme(융합 주제 한 구절), lesson_hook(수업 아이디어 한 문장)
- link_type: cross_subject(같은 현상을 다른 관점으로) | same_concept(본질적으로 동일 개념) | prerequisite(선수학습 관계) | application(한쪽 개념을 다른 쪽에서 적용) | extension(심화·확장)
- quality: 0.9+=바로 수업 가능한 강한 연결, 0.7~0.8=좋은 연결, 0.5~0.6=쓸만함, 그 미만이면 reject하세요.

## 후보 쌍 목록
${pairsText}

## 응답 형식
JSON 배열만 출력. 각 원소는 반드시 위 "후보 N"의 번호 idx로만 쌍을 지칭 (성취기준 코드를 쓰지 마세요):
\`\`\`json
[
  {"idx": 0, "accept": true, "link_type": "application", "quality": 0.8, "rationale": "...", "integration_theme": "...", "lesson_hook": "..."},
  {"idx": 1, "accept": false}
]
\`\`\`
모든 후보(0~${batch.length - 1})에 대해 판정을 포함하세요.`
}

function parseJudgeResponse(text, batchLen) {
  const m = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\[[\s\S]*\])/)
  if (!m) throw new Error('JSON 블록 없음')
  const arr = JSON.parse(m[1])
  if (!Array.isArray(arr)) throw new Error('배열이 아님')
  const results = []
  for (const r of arr) {
    if (typeof r.idx !== 'number' || r.idx < 0 || r.idx >= batchLen) continue // 범위 밖 인덱스 폐기
    if (!r.accept) { results.push({ idx: r.idx, accept: false }); continue }
    // accept 필드 엄격 검증 — 하나라도 불량이면 해당 판정 폐기(reject 취급)
    const valid = LINK_TYPES.has(r.link_type)
      && typeof r.quality === 'number' && r.quality >= 0 && r.quality <= 1
      && typeof r.rationale === 'string' && r.rationale.trim().length >= 30
    if (!valid) { results.push({ idx: r.idx, accept: false, invalid: true }); continue }
    results.push({
      idx: r.idx, accept: true, link_type: r.link_type,
      quality: Math.round(r.quality * 100) / 100,
      rationale: r.rationale.trim(),
      integration_theme: (r.integration_theme || '').trim() || null,
      lesson_hook: (r.lesson_hook || '').trim() || null,
    })
  }
  return results
}

async function judgeBatch(client, batch, stdByCode, batchId) {
  const prompt = buildJudgePrompt(batch, stdByCode)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const stream = client.messages.stream({
        model: MODEL, max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      })
      const response = await stream.finalMessage()
      // content 블록이 여러 개일 수 있음 (thinking 등) — 텍스트 블록만 결합
      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
      if (!text) throw new Error(`텍스트 블록 없음 (stop_reason=${response.stop_reason})`)
      const results = parseJudgeResponse(text, batch.length)
      const invalidCount = results.filter(r => r.invalid).length
      if (invalidCount > 0) log(`  ⚠️ 배치 ${batchId}: 불량 판정 ${invalidCount}건 폐기`)
      return results
    } catch (e) {
      const retriable = attempt < 3
      log(`  ${retriable ? '🔁' : '❌'} 배치 ${batchId} 시도 ${attempt} 실패: ${e.message}`)
      if (!retriable) return null
      await new Promise(r => setTimeout(r, 2000 * attempt))
    }
  }
  return null
}

// ─── 진행 상태 (resume) ───
function loadDoneBatches() {
  if (!fs.existsSync(PROGRESS_FILE)) return new Set()
  const done = new Set()
  for (const line of fs.readFileSync(PROGRESS_FILE, 'utf-8').split('\n')) {
    if (!line.trim()) continue
    try { done.add(JSON.parse(line).batchId) } catch { /* 손상 라인 무시 */ }
  }
  return done
}

// ─── DB 적재 ───
async function upsertCandidates(supabase, links) {
  let inserted = 0
  for (let i = 0; i < links.length; i += 500) {
    const batch = links.slice(i, i + 500).map(l => ({
      source_code: l.source_code, target_code: l.target_code,
      link_type: l.link_type, rationale: l.rationale,
      integration_theme: l.integration_theme, lesson_hook: l.lesson_hook,
      semantic_score: l.semantic_score, quality_score: l.quality_score,
      status: 'candidate', generation_method: 'ai',
    }))
    const { error } = await supabase.from('curriculum_links')
      .upsert(batch, { onConflict: 'source_code,target_code', ignoreDuplicates: true })
    if (error) throw new Error(`DB 적재 실패: ${error.message}`)
    inserted += batch.length
  }
  return inserted
}

// ─── 백필 모드: 기존 링크의 semantic_score 채우기 ───
async function backfillSemanticScores(embeddings) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('백필에는 SUPABASE_URL/SERVICE_ROLE_KEY 필요')
  log('🔄 기존 링크 semantic_score 백필 시작')
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('curriculum_links')
      .select('id, source_code, target_code, semantic_score').range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...data)
    if (data.length < 1000) break
  }
  const targets = rows.filter(r => r.semantic_score == null)
  log(`  전체 ${rows.length}행 중 백필 대상 ${targets.length}행`)
  let updated = 0, noEmb = 0
  for (const r of targets) {
    const va = embeddings.get(r.source_code), vb = embeddings.get(r.target_code)
    if (!va || !vb) { noEmb++; continue }
    let cos = 0
    for (let k = 0; k < va.length; k++) cos += va[k] * vb[k]
    const { error } = await supabase.from('curriculum_links')
      .update({ semantic_score: Math.round(cos * 1000) / 1000 }).eq('id', r.id)
    if (error) { log(`  ⚠️ ${r.source_code}|${r.target_code}: ${error.message}`); continue }
    updated++
    if (updated % 200 === 0) log(`  ...${updated}/${targets.length}`)
  }
  log(`✅ 백필 완료: ${updated}개 업데이트, 임베딩 없음 ${noEmb}개 스킵`)
}

// ─── 메인 ───
async function main() {
  ensureDir(OUTPUT_DIR); ensureDir(REPORT_DIR)
  const standards = await loadStandards()
  log(`📚 정본 성취기준 ${standards.length}개 로드`)
  const embeddings = loadEmbeddings()

  if (BACKFILL) return backfillSemanticScores(embeddings)

  const supabase = NO_DB ? null : getSupabase()
  if (!NO_DB && !supabase) log('⚠️ Supabase 미설정 — 파일 출력만 수행 (--no-db와 동일)')

  const existingPairs = await loadExistingPairs(supabase)
  const pairs = extractCandidatePairs(standards, embeddings, existingPairs)

  // 코사인 분포 리포트
  const buckets = {}
  pairs.forEach(p => { const b = (Math.floor(p.cos * 20) / 20).toFixed(2); buckets[b] = (buckets[b] || 0) + 1 })
  log('  코사인 분포:', Object.entries(buckets).sort().map(([k, v]) => `${k}:${v}`).join(' '))

  if (DRY_RUN) {
    log('\n🏁 dry-run 종료 — 상위 10개 후보:')
    const stdByCode = new Map(standards.map(s => [s.code, s]))
    pairs.slice(0, 10).forEach(p => {
      const A = stdByCode.get(p.a), B = stdByCode.get(p.b)
      log(`  ${p.cos.toFixed(3)} | ${A.code}(${A.subject}) ↔ ${B.code}(${B.subject})`)
      log(`         A: ${A.content.slice(0, 60)}`)
      log(`         B: ${B.content.slice(0, 60)}`)
    })
    return
  }

  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY 필요 (2단계 LLM 판정)')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const stdByCode = new Map(standards.map(s => [s.code, s]))

  // 배치 구성 (결정적: 코사인 내림차순 정렬 기준)
  // batchId에 파라미터를 포함 — top-k/min-cos가 바뀌면 후보 목록이 달라지므로
  // 다른 파라미터의 진행 기록과 섞여 잘못 스킵되는 것을 방지
  const runKey = `k${TOP_K}c${MIN_COS}s${BATCH_SIZE}`
  const batches = []
  for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
    batches.push({ batchId: `${runKey}-b${Math.floor(i / BATCH_SIZE)}`, pairs: pairs.slice(i, i + BATCH_SIZE) })
  }
  const done = loadDoneBatches()
  const todo = batches.filter(b => !done.has(b.batchId)).slice(0, LIMIT_BATCHES)
  log(`\n🤖 2단계: LLM 판정 — 총 ${batches.length}배치 중 완료 ${done.size}, 이번 실행 ${todo.length}배치 (모델: ${MODEL})`)

  const accepted = []
  let rejected = 0, failed = 0
  let cursor = 0
  async function worker() {
    while (cursor < todo.length) {
      const batch = todo[cursor++]
      const results = await judgeBatch(client, batch.pairs, stdByCode, batch.batchId)
      if (!results) { failed++; continue } // 진행 기록 안 함 → 다음 실행에서 재시도
      const links = []
      for (const r of results) {
        if (!r.accept) { rejected++; continue }
        const p = batch.pairs[r.idx]
        links.push({
          source_code: p.a, target_code: p.b, // 이미 정규화(a<b)됨
          link_type: r.link_type, rationale: r.rationale,
          integration_theme: r.integration_theme, lesson_hook: r.lesson_hook,
          semantic_score: Math.round(p.cos * 1000) / 1000, quality_score: r.quality,
        })
      }
      accepted.push(...links)
      fs.appendFileSync(PROGRESS_FILE, JSON.stringify({ batchId: batch.batchId, judged: results.length, accepted: links.length, ts: new Date().toISOString() }) + '\n')
      links.forEach(l => fs.appendFileSync(RESULT_FILE, JSON.stringify(l) + '\n'))
      log(`  ✅ ${batch.batchId}: ${links.length}/${batch.pairs.length} 채택 (누적 ${accepted.length})`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  log(`\n📊 판정 완료: 채택 ${accepted.length} / 기각 ${rejected} / 실패 배치 ${failed}`)

  if (supabase && accepted.length > 0) {
    const inserted = await upsertCandidates(supabase, accepted)
    log(`📥 DB 적재: ${inserted}행 upsert (status=candidate, 기존 쌍은 무시)`)
  } else if (accepted.length > 0) {
    log(`💾 파일 출력만: ${RESULT_FILE}`)
  }

  // 리포트
  const report = [
    `# 링크 생성 v2 실행 리포트 (${new Date().toISOString()})`,
    '', `- 후보쌍: ${pairs.length} (top-k=${TOP_K}, min-cos=${MIN_COS})`,
    `- 판정 배치: ${todo.length}/${batches.length} (완료 누적 ${done.size + todo.length - failed})`,
    `- 채택: ${accepted.length} / 기각: ${rejected} / 실패 배치: ${failed}`,
    `- 적재: ${supabase ? 'DB candidate' : '파일'} — 검토 후 published 승격 필요`,
  ].join('\n')
  const reportPath = path.join(REPORT_DIR, `v2_report_${Date.now()}.md`)
  fs.writeFileSync(reportPath, report)
  log(`📄 리포트: ${reportPath}`)
}

main().catch(err => { console.error('실행 실패:', err); process.exit(1) })
