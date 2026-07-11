/**
 * OpenAI 임베딩 공유 스토어 (성능, 2026-07-12)
 *
 * 배경: openai-embeddings-cache.json(±136MB 텍스트 JSON)을
 *  - 부팅 시 동기 readFileSync+JSON.parse로 이벤트 루프를 수 초 블로킹했고
 *  - semanticSearch.js와 embeddings.js가 각자 로드해 메모리에 이중 상주했다.
 *
 * 해결:
 *  - 바이너리 사이드카(.meta.json + .f32, ~30MB)로 1회 변환 후 이후 로드는 수십 ms
 *  - 비동기 로드 + whenReady() — 부팅은 즉시, 소비자는 준비를 기다리거나 폴백
 *  - 단일 Float32Array 버퍼 + code별 subarray 뷰 — 복사 없는 단일 상주
 *
 * 파일은 모두 gitignore 대상(로컬/인스턴스 생성물). 프로덕션은 기존처럼
 * 캐시가 없으면 백그라운드 재생성(ensureEmbeddingsCache) 경로를 쓴다.
 */
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
export const JSON_CACHE_FILE = path.join(DATA_DIR, 'openai-embeddings-cache.json')
const META_FILE = path.join(DATA_DIR, 'openai-embeddings-cache.meta.json')
const BIN_FILE = path.join(DATA_DIR, 'openai-embeddings-cache.f32')

let store = null        // { model, count, dim, byCode: Map<code, Float32Array> }
let legacyShape = null  // { model, count, embeddings: { code → Float32Array } } — embeddings.js 호환
let loadPromise = null

function buildStore(model, codes, dim, flat) {
  const byCode = new Map()
  const embeddingsObj = {}
  for (let i = 0; i < codes.length; i++) {
    const view = flat.subarray(i * dim, (i + 1) * dim)
    byCode.set(codes[i], view)
    embeddingsObj[codes[i]] = view
  }
  store = { model, count: codes.length, dim, byCode }
  legacyShape = { model, count: codes.length, embeddings: embeddingsObj }
  return store
}

async function loadFromBinary() {
  const meta = JSON.parse(await fsp.readFile(META_FILE, 'utf-8'))
  const buf = await fsp.readFile(BIN_FILE)
  const expected = meta.codes.length * meta.dim * 4
  if (buf.byteLength !== expected) {
    throw new Error(`바이너리 크기 불일치: ${buf.byteLength} ≠ ${expected}`)
  }
  const flat = new Float32Array(buf.buffer, buf.byteOffset, meta.codes.length * meta.dim)
  return buildStore(meta.model, meta.codes, meta.dim, flat)
}

async function loadFromJsonAndConvert() {
  const raw = JSON.parse(await fsp.readFile(JSON_CACHE_FILE, 'utf-8'))
  const codes = Object.keys(raw.embeddings)
  const dim = codes.length ? raw.embeddings[codes[0]].length : 0
  const flat = new Float32Array(codes.length * dim)
  for (let i = 0; i < codes.length; i++) {
    flat.set(raw.embeddings[codes[i]], i * dim)
  }
  const built = buildStore(raw.model || 'text-embedding-3-small', codes, dim, flat)
  // 다음 부팅부터 빠른 경로를 쓰도록 바이너리 사이드카 기록 (실패해도 무해)
  writeBinarySidecar(built.model, codes, dim, flat).catch((e) =>
    console.warn('  임베딩 바이너리 사이드카 기록 실패 (무시):', e.message))
  return built
}

async function writeBinarySidecar(model, codes, dim, flat) {
  await fsp.writeFile(BIN_FILE, Buffer.from(flat.buffer, flat.byteOffset, flat.length * 4))
  await fsp.writeFile(META_FILE, JSON.stringify({ model, dim, codes }))
  console.log(`  💾 임베딩 바이너리 사이드카 기록: ${(flat.length * 4 / 1048576).toFixed(0)}MB`)
}

/** 캐시 파일(바이너리 또는 JSON)이 존재하는가 — 부팅 시 재생성 필요 판단용 (동기, 저비용) */
export function hasEmbeddingCacheFile() {
  return (fs.existsSync(META_FILE) && fs.existsSync(BIN_FILE)) || fs.existsSync(JSON_CACHE_FILE)
}

/**
 * 비동기 로드 시작(멱등). 바이너리 우선, 없으면 JSON 파싱 후 바이너리 변환.
 * @returns {Promise<object|null>} 로드된 스토어 (파일 없으면 null)
 */
export function loadEmbeddingsAsync() {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    const t0 = Date.now()
    try {
      if (fs.existsSync(META_FILE) && fs.existsSync(BIN_FILE)) {
        const st = await loadFromBinary()
        console.log(`  🔍 임베딩 로드(바이너리): ${st.count}개, ${Date.now() - t0}ms`)
        return st
      }
      if (fs.existsSync(JSON_CACHE_FILE)) {
        const st = await loadFromJsonAndConvert()
        console.log(`  🔍 임베딩 로드(JSON→바이너리 변환): ${st.count}개, ${Date.now() - t0}ms`)
        return st
      }
      return null
    } catch (e) {
      console.warn('  임베딩 로드 실패:', e.message)
      loadPromise = null // 다음 호출에서 재시도 가능
      return null
    }
  })()
  return loadPromise
}

/** 로드 완료 대기 (파일 없으면 null) */
export function whenReady() {
  return loadEmbeddingsAsync()
}

/** 즉시(동기) 접근 — 로드 완료 전이면 null */
export function getStoreIfReady() {
  return store
}

/** embeddings.js(UMAP 3D 좌표) 호환 형태 — 로드 완료 전이면 null */
export function getLegacyShapeIfReady() {
  return legacyShape
}

/** code의 임베딩 벡터 (로드 전/누락 시 null) */
export function getEmbedding(code) {
  return store?.byCode.get(code) || null
}

/**
 * 백그라운드 재생성(ensureEmbeddingsCache) 결과를 스토어에 반영 + 파일 기록.
 * @param {string} model
 * @param {Object<string, number[]>} embeddingsObj - code → number[]
 * @param {object} [jsonMetaExtra] - JSON 캐시에 함께 기록할 부가 필드
 */
export async function setEmbeddings(model, embeddingsObj, jsonMetaExtra = {}) {
  const codes = Object.keys(embeddingsObj)
  const dim = codes.length ? embeddingsObj[codes[0]].length : 0
  const flat = new Float32Array(codes.length * dim)
  for (let i = 0; i < codes.length; i++) flat.set(embeddingsObj[codes[i]], i * dim)
  buildStore(model, codes, dim, flat)
  loadPromise = Promise.resolve(store)
  // 기존 소비자(스크립트 등) 호환을 위해 JSON도 유지 기록, 빠른 재기동용 바이너리도 기록
  try {
    await fsp.writeFile(JSON_CACHE_FILE, JSON.stringify({
      model, count: codes.length, ...jsonMetaExtra, embeddings: embeddingsObj,
    }))
  } catch (e) {
    console.warn('  임베딩 JSON 캐시 기록 실패 (무시):', e.message)
  }
  await writeBinarySidecar(model, codes, dim, flat).catch(() => {})
}
