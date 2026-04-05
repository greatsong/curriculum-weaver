/**
 * 시맨틱 검색 서비스
 *
 * OpenAI 임베딩 캐시를 활용하여 코사인 유사도 기반 검색 수행.
 * 검색어를 실시간 임베딩 → 4,856개 성취기준과 비교 → 유사도순 정렬.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import OpenAI from 'openai'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_FILE = path.join(__dirname, '..', 'data', 'openai-embeddings-cache.json')

let embeddingsData = null  // { code → float32[] }
let openai = null

/**
 * 임베딩 데이터 로드 (서버 시작 시 1회)
 */
export function loadSemanticIndex() {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }

  try {
    if (!fs.existsSync(CACHE_FILE)) {
      console.log('  ⚠️ OpenAI 임베딩 캐시 없음 — 시맨틱 검색 비활성 (백그라운드 생성 시도)')
      return false
    }
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
    embeddingsData = {}
    for (const [code, vec] of Object.entries(raw.embeddings)) {
      embeddingsData[code] = new Float32Array(vec)
    }
    console.log(`  🔍 시맨틱 검색 인덱스 로드: ${Object.keys(embeddingsData).length}개 임베딩`)
    return true
  } catch (e) {
    console.warn('  시맨틱 검색 인덱스 로드 실패:', e.message)
    return false
  }
}

/**
 * 임베딩 캐시 자동 생성 (서버 시작 후 백그라운드)
 * Railway 등 배포 환경에서 캐시 파일이 없을 때 자동으로 생성
 */
export async function ensureEmbeddingsCache(standards) {
  if (embeddingsData) return // 이미 로드됨
  if (!openai) {
    console.log('  ⚠️ OPENAI_API_KEY 없음 — 임베딩 자동 생성 불가')
    return
  }

  console.log(`  🔄 OpenAI 임베딩 백그라운드 생성 시작 (${standards.length}개)...`)
  const BATCH_SIZE = 500
  const embeddings = {}
  let totalTokens = 0

  try {
    for (let i = 0; i < standards.length; i += BATCH_SIZE) {
      const batch = standards.slice(i, i + BATCH_SIZE)
      const texts = batch.map(s => {
        const parts = [s.subject_group, s.subject, s.area, s.content]
        if (s.keywords?.length) parts.push(s.keywords.join(', '))
        if (s.explanation) parts.push(s.explanation)
        return parts.filter(Boolean).join(' | ')
      })

      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      })
      totalTokens += response.usage.total_tokens

      response.data.forEach((item, idx) => {
        embeddings[batch[idx].code] = item.embedding
      })
      console.log(`    배치 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(standards.length / BATCH_SIZE)} 완료`)
    }

    // 파일 캐시 저장
    const cache = {
      model: 'text-embedding-3-small',
      count: standards.length,
      created_at: new Date().toISOString(),
      total_tokens: totalTokens,
      embeddings,
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache))
    console.log(`  ✅ OpenAI 임베딩 캐시 생성 완료 (${standards.length}개, ${totalTokens} 토큰)`)

    // 메모리에 로드
    embeddingsData = {}
    for (const [code, vec] of Object.entries(embeddings)) {
      embeddingsData[code] = new Float32Array(vec)
    }
  } catch (e) {
    console.error('  ❌ OpenAI 임베딩 자동 생성 실패:', e.message)
  }
}

/**
 * 코사인 유사도 계산
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1)
}

/**
 * 시맨틱 검색 수행
 * @param {string} query - 검색어
 * @param {object[]} standards - Standards.list() 결과
 * @param {number} limit - 최대 결과 수
 * @returns {object[]} 유사도순 정렬된 성취기준 + _similarity 점수
 */
export async function semanticSearch(query, standards, limit = 50) {
  if (!embeddingsData || !openai) {
    return null // 시맨틱 검색 불가 → 호출자가 폴백 사용
  }

  // 1. 검색어 임베딩
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  })
  const queryVec = new Float32Array(response.data[0].embedding)

  // 2. 모든 성취기준과 유사도 계산
  const scored = standards
    .map(s => {
      const vec = embeddingsData[s.code]
      if (!vec) return null
      const similarity = cosineSimilarity(queryVec, vec)
      return { ...s, _similarity: similarity, _matchField: 'semantic' }
    })
    .filter(Boolean)

  // 3. 유사도 내림차순 정렬
  scored.sort((a, b) => b._similarity - a._similarity)

  return scored.slice(0, limit)
}

/**
 * 시맨틱 검색 가능 여부
 */
export function isSemanticSearchAvailable() {
  return !!(embeddingsData && openai)
}
