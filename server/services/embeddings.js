import { UMAP } from 'umap-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

/**
 * 교육과정 성취기준 임베딩 서비스
 *
 * OpenAI text-embedding-3-small 벡터가 있으면 우선 사용하고,
 * 없으면 TF-IDF 폴백. UMAP으로 3D 좌표로 차원 축소합니다.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_FILE = path.join(__dirname, '..', 'data', 'embeddings-cache.json')
const OPENAI_CACHE_FILE = path.join(__dirname, '..', 'data', 'openai-embeddings-cache.json')

// 메모리 캐시 (id 기반)
let cachedCoords = null
let cachedHash = null

// 파일 캐시 (code 기반 — ID는 서버 재시작마다 변경되므로)
let fileCacheByCode = null

// OpenAI 임베딩 캐시
let openaiEmbeddings = null

/**
 * OpenAI 임베딩 캐시 로드
 * @returns {{ embeddings: Object<string, number[]> } | null}
 */
function loadOpenAIEmbeddings() {
  if (openaiEmbeddings) return openaiEmbeddings
  try {
    if (fs.existsSync(OPENAI_CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(OPENAI_CACHE_FILE, 'utf-8'))
      console.log(`  🤖 OpenAI 임베딩 로드: ${data.count}개 (${data.model})`)
      openaiEmbeddings = data
      return data
    }
  } catch (e) {
    console.warn('  OpenAI 임베딩 캐시 읽기 실패:', e.message)
  }
  return null
}

/**
 * 파일 캐시에서 임베딩 로드
 * @returns {{ hash: string, coords: Object<string, {x,y,z}> } | null}
 */
function loadFileCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
      console.log(`  📦 임베딩 파일 캐시 로드: ${Object.keys(data.coords).length}개 좌표`)
      return data
    }
  } catch (e) {
    console.warn('  임베딩 캐시 파일 읽기 실패:', e.message)
  }
  return null
}

/**
 * 파일 캐시에 임베딩 저장
 */
function saveFileCache(hash, coordsByCode) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ hash, coords: coordsByCode }))
    console.log(`  💾 임베딩 파일 캐시 저장: ${Object.keys(coordsByCode).length}개 좌표`)
  } catch (e) {
    console.warn('  임베딩 캐시 파일 저장 실패:', e.message)
  }
}

/**
 * 한국어 텍스트에서 의미 있는 토큰을 추출
 * (간단한 형태소 분리 — 조사/어미 등 제거)
 */
function tokenize(text) {
  if (!text) return []
  // 한글 단어 + 영문 단어 추출
  const words = text.match(/[가-힣]{2,}|[a-zA-Z]{2,}/g) || []
  // 흔한 조사/어미 패턴 제거
  const stopwords = new Set([
    '수', '것', '등', '및', '또는', '있다', '없다', '하다', '되다',
    '이다', '위해', '대한', '통해', '관한', '위한', '대해',
    '있는', '하는', '되는', '관련', '필요', '다양한',
  ])
  return words.filter(w => !stopwords.has(w) && w.length >= 2)
}

/**
 * TF-IDF 벡터를 계산
 * @param {Array} documents - [{tokens: string[], subject: string, area: string}]
 * @returns {{vectors: number[][], vocabulary: string[]}}
 */
function computeTFIDF(documents) {
  // 1. 어휘 구축
  const df = new Map() // document frequency
  const allTokens = new Set()

  documents.forEach(doc => {
    const uniqueTokens = new Set(doc.tokens)
    uniqueTokens.forEach(token => {
      allTokens.add(token)
      df.set(token, (df.get(token) || 0) + 1)
    })
  })

  const vocabulary = [...allTokens].sort()
  const vocabIndex = new Map(vocabulary.map((t, i) => [t, i]))
  const N = documents.length

  // 2. TF-IDF 벡터 계산
  const vectors = documents.map(doc => {
    const vec = new Float64Array(vocabulary.length)
    const tokenCounts = new Map()
    doc.tokens.forEach(t => tokenCounts.set(t, (tokenCounts.get(t) || 0) + 1))
    const maxTF = Math.max(...tokenCounts.values(), 1)

    tokenCounts.forEach((count, token) => {
      const idx = vocabIndex.get(token)
      if (idx === undefined) return
      const tf = count / maxTF // 정규화된 TF
      const idf = Math.log(N / (df.get(token) || 1))
      vec[idx] = tf * idf
    })
    return [...vec]
  })

  return { vectors, vocabulary }
}

/**
 * 코사인 유사도 기반 거리 행렬 생성 (UMAP 입력용)
 */
function cosineDistance(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1)
  return 1 - similarity
}

/**
 * 성취기준 목록으로부터 3D 좌표를 계산
 * @param {Array} standards - [{id, code, subject, area, content, keywords}]
 * @returns {Map<string, {x: number, y: number, z: number}>} id → 좌표
 */
export function computeEmbedding3D(standards) {
  if (standards.length < 5) return new Map()

  // 해시 계산 (code 기반 — ID는 매번 변경됨)
  const hash = standards.map(s => s.code).sort().join(',')

  // 1. 메모리 캐시 확인
  if (cachedHash === hash && cachedCoords) {
    return cachedCoords
  }

  // 2. 파일 캐시 확인 (code → coords)
  if (!fileCacheByCode) {
    fileCacheByCode = loadFileCache()
  }
  if (fileCacheByCode && fileCacheByCode.hash === hash) {
    console.log('  ✅ 파일 캐시에서 임베딩 복원 (재계산 불필요)')
    const result = new Map()
    for (const s of standards) {
      const coord = fileCacheByCode.coords[s.code]
      if (coord) result.set(s.id, coord)
    }
    // 메모리 캐시에도 저장
    cachedCoords = result
    cachedHash = hash
    return result
  }

  // Production에서 캐시 미스 → UMAP 계산 건너뜀 (OOM 방지)
  if (process.env.NODE_ENV === 'production') {
    console.warn('  ⚠️ 임베딩 캐시 미스 — production에서 UMAP 계산 건너뜀')
    return new Map()
  }

  console.time('임베딩 3D 계산')

  // OpenAI 임베딩이 있으면 우선 사용
  const openaiCache = loadOpenAIEmbeddings()
  let vectors

  if (openaiCache) {
    console.log('  🤖 OpenAI 시맨틱 임베딩으로 UMAP 계산')
    vectors = standards.map(s => {
      const emb = openaiCache.embeddings[s.code]
      if (!emb) {
        // 누락된 성취기준은 제로 벡터로 폴백
        console.warn(`  ⚠️ OpenAI 임베딩 누락: ${s.code}`)
        return new Array(1536).fill(0)
      }
      return emb
    })
  } else {
    console.log('  📊 TF-IDF 폴백으로 UMAP 계산')

    // 1. 토큰화 (content + keywords + subject + area를 결합)
    const documents = standards.map(s => {
      const contentTokens = tokenize(s.content)
      const keywordTokens = (s.keywords || []).flatMap(k => tokenize(k))
      // 교과명과 영역에 가중치 (3배 반복)
      const subjectTokens = Array(3).fill(s.subject).flatMap(tokenize)
      const areaTokens = Array(2).fill(s.area).flatMap(tokenize)
      return {
        id: s.id,
        code: s.code,
        tokens: [...contentTokens, ...keywordTokens, ...subjectTokens, ...areaTokens],
        subject: s.subject,
        area: s.area,
      }
    })

    // 2. TF-IDF 벡터 계산
    vectors = computeTFIDF(documents).vectors
  }

  // 3. UMAP으로 3D 차원 축소
  const umap = new UMAP({
    nComponents: 3,
    nNeighbors: Math.min(15, Math.floor(standards.length / 3)),
    minDist: 0.3,
    spread: 1.5,
    ...(openaiCache ? {} : { distanceFn: cosineDistance }),
  })

  const coords3D = umap.fit(vectors)

  // 4. 좌표 정규화 (-150 ~ 150 범위)
  const scale = 150
  const mins = [Infinity, Infinity, Infinity]
  const maxs = [-Infinity, -Infinity, -Infinity]
  coords3D.forEach(([x, y, z]) => {
    mins[0] = Math.min(mins[0], x); maxs[0] = Math.max(maxs[0], x)
    mins[1] = Math.min(mins[1], y); maxs[1] = Math.max(maxs[1], y)
    mins[2] = Math.min(mins[2], z); maxs[2] = Math.max(maxs[2], z)
  })

  const result = new Map()
  const coordsByCode = {}
  standards.forEach((s, i) => {
    const [x, y, z] = coords3D[i]
    const coord = {
      x: ((x - mins[0]) / (maxs[0] - mins[0] || 1) - 0.5) * 2 * scale,
      y: ((y - mins[1]) / (maxs[1] - mins[1] || 1) - 0.5) * 2 * scale,
      z: ((z - mins[2]) / (maxs[2] - mins[2] || 1) - 0.5) * 2 * scale,
    }
    result.set(s.id, coord)
    coordsByCode[s.code] = coord
  })

  // 메모리 캐시 저장
  cachedCoords = result
  cachedHash = hash

  // 파일 캐시 저장 (code 기반 — 서버 재시작해도 유지)
  saveFileCache(hash, coordsByCode)
  fileCacheByCode = { hash, coords: coordsByCode }

  console.timeEnd('임베딩 3D 계산')
  return result
}

/**
 * 서버 시작 시 임베딩 백그라운드 사전 계산
 */
export function precomputeEmbeddings(standards) {
  // 파일 캐시가 있으면 즉시 반환
  const fileCache = loadFileCache()
  const hash = standards.map(s => s.code).sort().join(',')
  if (fileCache && fileCache.hash === hash) {
    fileCacheByCode = fileCache
    console.log('  ✅ 임베딩 캐시 유효 — 사전 계산 불필요')
    return
  }

  // Production에서는 메모리 부족 위험 → 캐시 없으면 건너뜀
  if (process.env.NODE_ENV === 'production') {
    console.log('  ⚠️ 임베딩 캐시 없음 — production에서 UMAP 계산 건너뜀 (메모리 절약)')
    return
  }

  // 개발 환경: 백그라운드에서 계산
  console.log('  🔄 임베딩 백그라운드 사전 계산 시작...')
  setImmediate(() => {
    computeEmbedding3D(standards)
    console.log('  ✅ 임베딩 백그라운드 사전 계산 완료')
  })
}

/**
 * 캐시 무효화 (데이터 변경 시 호출)
 */
export function invalidateEmbeddingCache() {
  cachedCoords = null
  cachedHash = null
  fileCacheByCode = null
  openaiEmbeddings = null
  // 파일 캐시도 삭제
  try {
    if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE)
  } catch (e) { /* ignore */ }
}
