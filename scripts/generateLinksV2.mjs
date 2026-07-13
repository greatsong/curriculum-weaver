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
 *   node scripts/generateLinksV2.mjs --rejudge --ids-file scripts/results/ids.json  # 링크 id 정밀 재판정
 *   node scripts/generateLinksV2.mjs --cross-method --dry-run # 방법×대상 융합쌍 후보 통계
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
// 같은 교과군 내부(단, 다른 과목) 쌍만 대상 — 선수학습/심화 계열 연결 생성용
// (예: 정보군의 인공지능 기초 ↔ 데이터 과학. 같은 과목 내 쌍은 여전히 제외)
const SAME_GROUP = flag('--same-group')
// cross-method 모드: "방법·도구 과목 × 다른 교과군 과목" 쌍을 코사인 임계값 없이
// 과목쌍별 top-N 보장으로 판정에 올린다.
// 배경: 성취기준 문장 임베딩 유사도는 "통계로 사회 현상 분석"처럼 방법을 대상에
// 적용하는 융합쌍을 원천 배제한다 (문장이 의미적으로 겹치지 않으므로).
// 실측(2026-07-12): 확률과 통계의 연결 상대가 전부 수학·과학 계열, 사회 계열 0건.
// 품질 판정은 LLM이 하므로, 이 모드는 "후보 공급"의 사각지대만 보정한다.
const CROSS_METHOD = flag('--cross-method')
// 방법·도구 성격 과목 기본 목록 (--tools "과목1,과목2"로 교체 가능)
const DEFAULT_TOOL_SUBJECTS = [
  '확률과 통계', '실용 통계', '인공지능 수학', '경제 수학',
  '정보(고등 일반선택)', '데이터 과학(진로선택)', '인공지능 기초(진로선택)',
  '정보(중학교 공통)', '수학과제 탐구',
]
const TOOL_SUBJECTS = (() => {
  const i = args.indexOf('--tools')
  return i >= 0 && args[i + 1]
    ? args[i + 1].split(',').map((t) => t.trim()).filter(Boolean)
    : DEFAULT_TOOL_SUBJECTS
})()
// cross-method는 MIN_COS를 적용하지 않되, 완전 무관 쌍 판정 낭비를 막는 최소 바닥값만 사용
const CROSS_METHOD_COS_FLOOR = 0.15
// rejudge 모드: quality_score가 없는 기존 DB 링크(v1)를 동일 저지로 재판정해 점수 기록
// (링크 생성이 아니라 기존 행 UPDATE — rationale 보존, 빈 theme/hook만 채움, 기각은 0.2)
const REJUDGE = flag('--rejudge')
// --codes-file <json>: 재판정 대상을 "해당 성취기준 코드가 낀 링크"로 제한.
// 성취기준 content 복원(2026-07-11) 후 오염 텍스트 기반 판정을 갱신하는 용도 —
// quality_score 유무와 무관하게 재판정하고, rationale/theme/hook도 새 판정으로 교체한다.
const CODES_FILE = (() => { const i = args.indexOf('--codes-file'); return i >= 0 ? args[i + 1] : null })()
// --touch-codes-file <json>: 후보쌍을 "지정 코드가 한 끝에라도 낀 쌍"으로 한정 (신규 복원 코드 링크 생성용)
const TOUCH_CODES = (() => {
  const i = args.indexOf('--touch-codes-file'); if (i < 0) return null
  const arr = JSON.parse(fs.readFileSync(args[i + 1], 'utf8'))
  return new Set(arr)
})()
// --ids-file <json>: 재판정 대상을 "링크 id 배열"로 정밀 지정 (codes-file은 코드가 낀
// 링크 전체를 스윕하므로 과잉 — 위험군만 좁혀 재판정할 때 사용).
// 갱신 정책은 기본 rejudge와 동일: rationale 보존, 빈 theme/hook만 채움, 기각은 0.2.
const IDS_FILE = (() => { const i = args.indexOf('--ids-file'); return i >= 0 ? args[i + 1] : null })()
// import-results 모드: 결과 파일(v2_links.jsonl)의 채택 링크를 DB에 멱등 upsert
// (실행 말미 DB 적재가 네트워크 오류로 실패했을 때의 복구 경로)
const IMPORT_RESULTS = flag('--import-results')
const LIMIT_BATCHES = opt('--limit', Infinity)
const TOP_K = opt('--top-k', 6)
const MIN_COS = opt('--min-cos', 0.45)
// same-group/cross-method 모드: 과목쌍별 top-N 보장 (전역 임계값이 아니라 과목쌍마다 상위 N쌍 선발)
// → 상호보완적이라 코사인이 중간대인 과목쌍(예: 데이터 과학↔인공지능 기초)도 커버
const PAIR_TOP = opt('--pair-top', 4)
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

  const stats = { compared: 0, belowMinCos: 0, sameGroup: 0, levelGap: 0, existing: 0, notToolPair: 0 }
  // 각 성취기준별 top-K (교과군 밖, 학교급 인접) 후보 수집
  const perStandard = new Map() // code -> [{code, cos}]
  const perSubjectPair = new Map() // "subjA|subjB" -> [{a, b, cos}] (same-group/cross-method 모드)
  for (const s of items) perStandard.set(s.code, [])

  // cross-method: 도구 과목 목록 검증 (오타·데이터에 없는 과목명 조기 경고)
  const toolSet = new Set(TOOL_SUBJECTS)
  if (CROSS_METHOD) {
    const knownSubjects = new Set(items.map((s) => s.subject))
    const unknown = TOOL_SUBJECTS.filter((t) => !knownSubjects.has(t))
    if (unknown.length > 0) log(`  ⚠️ 데이터에 없는 도구 과목명 (무시됨): ${unknown.join(', ')}`)
    log(`  🧰 도구 과목: ${TOOL_SUBJECTS.filter((t) => knownSubjects.has(t)).join(', ')}`)
  }

  // 모드별 코사인 하한 — cross-method는 임계 필터가 존재 이유상 없어야 하므로 최소 바닥값만
  const cosFloor = CROSS_METHOD ? CROSS_METHOD_COS_FLOOR : MIN_COS

  for (let i = 0; i < items.length; i++) {
    const a = items[i]
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j]
      const groupA = a.subject_group || a.subject
      const groupB = b.subject_group || b.subject
      if (CROSS_METHOD) {
        // 도구 과목이 최소 한쪽 + 교과군 교차 쌍만
        if (groupA === groupB) { stats.sameGroup++; continue }
        if (!toolSet.has(a.subject) && !toolSet.has(b.subject)) { stats.notToolPair++; continue }
      } else if (SAME_GROUP) {
        // 같은 교과군 내 "다른 과목" 쌍만 (같은 과목 내부는 제외)
        if (groupA !== groupB || a.subject === b.subject) { stats.sameGroup++; continue }
      } else {
        if (groupA === groupB) { stats.sameGroup++; continue }
      }
      const la = SCHOOL_LEVEL_ORDER[a.school_level], lb = SCHOOL_LEVEL_ORDER[b.school_level]
      if (la !== undefined && lb !== undefined && Math.abs(la - lb) > 1) { stats.levelGap++; continue }
      stats.compared++
      let cos = 0
      const va = a.vec, vb = b.vec
      for (let k = 0; k < va.length; k++) cos += va[k] * vb[k]
      if (cos < cosFloor) { stats.belowMinCos++; continue }
      if (SAME_GROUP || CROSS_METHOD) {
        // 과목쌍별 수집 (뒤에서 top-N 선발)
        const pairKey = a.subject < b.subject ? `${a.subject}|${b.subject}` : `${b.subject}|${a.subject}`
        if (!perSubjectPair.has(pairKey)) perSubjectPair.set(pairKey, [])
        perSubjectPair.get(pairKey).push({ a: a.code, b: b.code, cos })
      } else {
        perStandard.get(a.code).push({ code: b.code, cos })
        perStandard.get(b.code).push({ code: a.code, cos })
      }
    }
    if ((i + 1) % 500 === 0) log(`  ...${i + 1}/${items.length} 처리`)
  }

  const pairMap = new Map() // "a|b" -> cos
  if (SAME_GROUP || CROSS_METHOD) {
    // 과목쌍별 top-N 보장 선발 + 기존 링크 제외
    for (const [, candidates] of perSubjectPair) {
      candidates.sort((x, y) => y.cos - x.cos)
      let taken = 0
      for (const c of candidates) {
        if (taken >= PAIR_TOP) break
        const [a, b] = normalizePair(c.a, c.b)
        const key = `${a}|${b}`
        if (existingPairs.has(key)) { stats.existing++; continue }
        if (!pairMap.has(key)) { pairMap.set(key, c.cos); taken++ }
      }
    }
  } else {
    // top-K 자르기 + 쌍 dedupe + 기존 링크 제외
    for (const [code, neighbors] of perStandard) {
      neighbors.sort((x, y) => y.cos - x.cos)
      for (const n of neighbors.slice(0, TOP_K)) {
        const [a, b] = normalizePair(code, n.code)
        const key = `${a}|${b}`
        if (existingPairs.has(key)) { stats.existing++; continue }
        if (!pairMap.has(key) || pairMap.get(key) < n.cos) pairMap.set(key, n.cos)
      }
    }
  }

  let pairs = [...pairMap.entries()]
    .map(([key, cos]) => { const [a, b] = key.split('|'); return { a, b, cos } })
    .sort((x, y) => y.cos - x.cos)

  // --touch-codes-file: 지정 코드 집합이 한 끝에라도 낀 쌍만 (신규 복원 코드 연결 한정, 기존-기존 증가 방지)
  if (TOUCH_CODES) {
    const before = pairs.length
    pairs = pairs.filter(p => TOUCH_CODES.has(p.a) || TOUCH_CODES.has(p.b))
    log(`  🎯 --touch-codes: ${TOUCH_CODES.size}개 코드가 낀 쌍만 → ${before} → ${pairs.length}쌍`)
  }

  log(`  비교 ${stats.compared.toLocaleString()}쌍 | 임계값(${CROSS_METHOD ? `바닥 ${CROSS_METHOD_COS_FLOOR}` : MIN_COS}) 미달 ${stats.belowMinCos.toLocaleString()} | 동일교과군 제외 ${stats.sameGroup.toLocaleString()} | 학교급 격차 제외 ${stats.levelGap.toLocaleString()}${CROSS_METHOD ? ` | 비도구쌍 제외 ${stats.notToolPair.toLocaleString()}` : ''}`)
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

  // cross-method 모드: 방법×대상 융합(application)을 적극 검토하라는 지시 추가.
  // 품질 임계(0.5 미만 reject)는 그대로 — recall만 보강하고 정확도 기준은 낮추지 않는다.
  const crossMethodGuide = CROSS_METHOD ? `
- 두 과목의 문장이 서로 달라 보여도, 한 과목의 방법·기능(예: 통계 분석, 데이터 처리, 프로그래밍)을
  다른 과목의 탐구 대상·제재에 적용하는 수업이 성립하면 application 유형으로 적극 검토하세요.
  (예: 확률·통계의 자료 분석 기능으로 사회 현상 탐구하기)` : ''

  return `당신은 한국 2022 개정 교육과정 기반 융합 수업 설계 전문가입니다.
아래 성취기준 후보 쌍들이 "실제 수업에서 함께 다루면 시너지가 나는 교육적 연결"인지 판정하세요.

## 판정 기준
- 표면적 단어 일치가 아닌 개념적·교육적 연결만 accept. 애매하면 reject.${crossMethodGuide}
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
    // 네트워크 일시 오류 대비 재시도 (최대 3회, 지수 백오프)
    let lastErr = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { error } = await supabase.from('curriculum_links')
          .upsert(batch, { onConflict: 'source_code,target_code', ignoreDuplicates: true })
        if (error) throw new Error(error.message)
        lastErr = null
        break
      } catch (e) {
        lastErr = e
        log(`  🔁 DB 적재 재시도 ${attempt}/3: ${e.message}`)
        await new Promise(r => setTimeout(r, 3000 * attempt))
      }
    }
    if (lastErr) throw new Error(`DB 적재 실패: ${lastErr.message}`)
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

// ─── rejudge 모드: 기존 링크(quality_score 없음) 재판정 ───
async function rejudgeExistingLinks(standards) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('재판정에는 SUPABASE_URL/SERVICE_ROLE_KEY 필요')
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY 필요')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const stdByCode = new Map(standards.map(s => [s.code, s]))

  // codes-file 모드: 지정 코드가 낀 링크 전체 (quality_score 무관)
  const targetCodes = CODES_FILE ? new Set(JSON.parse(fs.readFileSync(CODES_FILE, 'utf-8'))) : null
  if (targetCodes) log(`🎯 --codes-file: ${targetCodes.size}개 코드가 낀 링크만 재판정`)
  // ids-file 모드: 링크 id 배열로 정밀 지정 (quality_score 무관)
  const targetIds = IDS_FILE ? new Set(JSON.parse(fs.readFileSync(IDS_FILE, 'utf-8'))) : null
  if (targetIds) log(`🎯 --ids-file: 링크 id ${targetIds.size}개만 재판정`)

  // 대상 조회 (id 순 고정 → 배치 구성 결정적, resume 안전)
  const rows = []
  for (let from = 0; ; from += 1000) {
    let query = supabase.from('curriculum_links')
      .select('id, source_code, target_code, integration_theme, lesson_hook')
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (!targetCodes && !targetIds) query = query.is('quality_score', null)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    rows.push(...(
      targetIds ? data.filter(r => targetIds.has(r.id))
      : targetCodes ? data.filter(r => targetCodes.has(r.source_code) || targetCodes.has(r.target_code))
      : data
    ))
    if (data.length < 1000) break
  }
  const judgeable = rows.filter(r => stdByCode.has(r.source_code) && stdByCode.has(r.target_code))
  log(`🔄 재판정 대상: ${rows.length}행 중 판정 가능 ${judgeable.length}행 (미등재 코드 ${rows.length - judgeable.length}개 제외)`)

  // codes-file/ids-file 모드는 별도 배치 네임스페이스 + 파일명 포함 (다른 실행과 진행기록 충돌 방지)
  const prefix = targetIds ? `rji-${path.basename(IDS_FILE).replace(/\.[^.]+$/, '')}`
    : targetCodes ? `rjc-${path.basename(CODES_FILE).replace(/\.[^.]+$/, '')}` : 'rj'
  const batches = []
  for (let i = 0; i < judgeable.length; i += BATCH_SIZE) {
    batches.push({ batchId: `${prefix}-s${BATCH_SIZE}-b${Math.floor(i / BATCH_SIZE)}`, rows: judgeable.slice(i, i + BATCH_SIZE) })
  }
  const done = loadDoneBatches()
  const remaining = batches.filter(b => !done.has(b.batchId))
  const todo = remaining.slice(0, LIMIT_BATCHES)
  log(`  총 ${batches.length}배치 중 완료 ${batches.length - remaining.length}, 이번 실행 ${todo.length}배치`)

  let scored = 0, rejectedCount = 0, failed = 0
  let cursor = 0
  async function worker() {
    while (cursor < todo.length) {
      const batch = todo[cursor++]
      const pairs = batch.rows.map(r => ({ a: r.source_code, b: r.target_code }))
      const results = await judgeBatch(client, pairs, stdByCode, batch.batchId)
      if (!results) { failed++; continue }
      for (const r of results) {
        const row = batch.rows[r.idx]
        const patch = r.accept
          ? targetCodes
            ? {
                // codes-file 모드: 오염 텍스트 기반이던 판정 산출물 전부 갱신
                quality_score: r.quality,
                link_type: r.link_type,
                rationale: r.rationale,
                integration_theme: r.integration_theme,
                lesson_hook: r.lesson_hook,
              }
            : {
                quality_score: r.quality,
                // rationale은 v1 원본 보존, 비어 있는 메타만 채움
                ...(row.integration_theme ? {} : { integration_theme: r.integration_theme }),
                ...(row.lesson_hook ? {} : { lesson_hook: r.lesson_hook }),
              }
          : { quality_score: 0.2 } // 재판정 기각 표식 (어떤 게시 기준에도 미달)
        const { error } = await supabase.from('curriculum_links').update(patch).eq('id', row.id)
        if (error) { log(`  ⚠️ ${row.source_code}|${row.target_code} 업데이트 실패: ${error.message}`); continue }
        if (r.accept) scored++; else rejectedCount++
      }
      fs.appendFileSync(PROGRESS_FILE, JSON.stringify({ batchId: batch.batchId, judged: results.length, ts: new Date().toISOString() }) + '\n')
      log(`  ✅ ${batch.batchId}: 통과 ${results.filter(x => x.accept).length}/${batch.rows.length} (누적 통과 ${scored} / 기각 ${rejectedCount})`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  log(`\n📊 재판정 완료: 통과 ${scored} / 기각 ${rejectedCount} / 실패 배치 ${failed}`)
  log('ℹ️ 강등은 별도 실행: node scripts/promoteLinks.mjs --demote-below 0.7 --dry-run')
}

// ─── import-results 모드: 결과 파일 → DB 멱등 upsert ───
async function importResultsFile() {
  const supabase = getSupabase()
  if (!supabase) throw new Error('SUPABASE_URL/SERVICE_ROLE_KEY 필요')
  if (!fs.existsSync(RESULT_FILE)) throw new Error(`결과 파일 없음: ${RESULT_FILE}`)
  const links = []
  for (const line of fs.readFileSync(RESULT_FILE, 'utf-8').split('\n')) {
    if (!line.trim()) continue
    try { links.push(JSON.parse(line)) } catch { log(`  ⚠️ 손상 라인 무시: ${line.slice(0, 60)}`) }
  }
  log(`📥 결과 파일에서 ${links.length}개 링크 로드 — DB upsert (기존 쌍 무시, 멱등)`)
  const inserted = await upsertCandidates(supabase, links)
  log(`✅ ${inserted}행 upsert 완료 (status=candidate)`)
}

// ─── 메인 ───
async function main() {
  ensureDir(OUTPUT_DIR); ensureDir(REPORT_DIR)

  if (IMPORT_RESULTS) return importResultsFile() // 성취기준/임베딩 불필요

  const standards = await loadStandards()
  log(`📚 정본 성취기준 ${standards.length}개 로드`)

  if (REJUDGE) return rejudgeExistingLinks(standards) // 임베딩 불필요 — 로드 생략

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
  const runKey = `${CROSS_METHOD ? `xm-p${PAIR_TOP}-` : SAME_GROUP ? 'sg-' : ''}k${TOP_K}c${MIN_COS}s${BATCH_SIZE}`
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
