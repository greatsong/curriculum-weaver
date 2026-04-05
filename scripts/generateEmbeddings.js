/**
 * OpenAI text-embedding-3-small로 성취기준 임베딩 생성
 *
 * 사용법: node scripts/generateEmbeddings.js
 *
 * 4,856개 성취기준을 배치로 처리하여
 * server/data/openai-embeddings-cache.json에 저장합니다.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import OpenAI from 'openai'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(__dirname, '..', 'server', '.env') })

// 성취기준 데이터 로드
const standardsPath = path.join(__dirname, '..', 'server', 'data', 'standards.js')
const standardsModule = await import(standardsPath)
const ALL_STANDARDS = standardsModule.ALL_STANDARDS

const OUTPUT_FILE = path.join(__dirname, '..', 'server', 'data', 'openai-embeddings-cache.json')
const MODEL = 'text-embedding-3-small'
const BATCH_SIZE = 500 // 토큰 제한 고려 (300K tokens/request)

// dotenv는 import 후에 config()가 실행되므로 여기서 읽음
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * 성취기준을 임베딩용 텍스트로 변환
 */
function standardToText(s) {
  const parts = [
    s.subject_group,
    s.subject,
    s.area,
    s.content,
  ]
  if (s.keywords?.length) parts.push(s.keywords.join(', '))
  if (s.explanation) parts.push(s.explanation)
  return parts.filter(Boolean).join(' | ')
}

async function main() {
  console.log(`총 ${ALL_STANDARDS.length}개 성취기준 임베딩 생성 시작`)
  console.log(`모델: ${MODEL}`)

  // 이미 생성된 캐시가 있으면 확인
  if (fs.existsSync(OUTPUT_FILE)) {
    const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'))
    if (existing.count === ALL_STANDARDS.length) {
      console.log(`이미 ${existing.count}개 임베딩 캐시 존재. 덮어쓰기 진행.`)
    }
  }

  const texts = ALL_STANDARDS.map(standardToText)
  const embeddings = {}
  let totalTokens = 0

  // 배치 처리
  const batches = Math.ceil(texts.length / BATCH_SIZE)
  for (let i = 0; i < batches; i++) {
    const start = i * BATCH_SIZE
    const end = Math.min(start + BATCH_SIZE, texts.length)
    const batchTexts = texts.slice(start, end)
    const batchStandards = ALL_STANDARDS.slice(start, end)

    console.log(`  배치 ${i + 1}/${batches}: ${start}~${end - 1} (${batchTexts.length}개)`)

    const response = await openai.embeddings.create({
      model: MODEL,
      input: batchTexts,
    })

    totalTokens += response.usage.total_tokens

    response.data.forEach((item, idx) => {
      embeddings[batchStandards[idx].code] = item.embedding
    })

    console.log(`    완료 (누적 토큰: ${totalTokens.toLocaleString()})`)
  }

  // 저장
  const cache = {
    model: MODEL,
    count: ALL_STANDARDS.length,
    created_at: new Date().toISOString(),
    total_tokens: totalTokens,
    embeddings,
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(cache))
  const fileSizeMB = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(1)
  console.log(`\n완료! ${OUTPUT_FILE}`)
  console.log(`  - ${ALL_STANDARDS.length}개 임베딩 (${MODEL}, 1536차원)`)
  console.log(`  - 총 토큰: ${totalTokens.toLocaleString()}`)
  console.log(`  - 파일 크기: ${fileSizeMB}MB`)
  console.log(`  - 예상 비용: $${(totalTokens * 0.02 / 1_000_000).toFixed(4)}`)
}

main().catch(err => {
  console.error('임베딩 생성 실패:', err.message)
  process.exit(1)
})
