import { UMAP } from 'umap-js'

/**
 * 교육과정 성취기준 임베딩 서비스
 *
 * 키워드 + 내용 기반 TF-IDF 벡터를 생성하고,
 * UMAP으로 3D 좌표로 차원 축소합니다.
 *
 * 임베딩은 데이터 변경 시에만 1회 계산 후 캐시됩니다.
 */

// 캐시
let cachedCoords = null
let cachedHash = null

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

  // 해시로 캐시 확인
  const hash = standards.map(s => s.code).sort().join(',')
  if (cachedHash === hash && cachedCoords) {
    return cachedCoords
  }

  console.time('임베딩 3D 계산')

  // 1. 토큰화 (content + keywords + subject + area를 결합)
  const documents = standards.map(s => {
    const contentTokens = tokenize(s.content)
    const keywordTokens = (s.keywords || []).flatMap(k => tokenize(k))
    // 교과명과 영역에 가중치 (3배 반복)
    const subjectTokens = Array(3).fill(s.subject).flatMap(tokenize)
    const areaTokens = Array(2).fill(s.area).flatMap(tokenize)
    return {
      id: s.id,
      tokens: [...contentTokens, ...keywordTokens, ...subjectTokens, ...areaTokens],
      subject: s.subject,
      area: s.area,
    }
  })

  // 2. TF-IDF 벡터 계산
  const { vectors } = computeTFIDF(documents)

  // 3. UMAP으로 3D 차원 축소
  const umap = new UMAP({
    nComponents: 3,
    nNeighbors: Math.min(15, Math.floor(standards.length / 3)),
    minDist: 0.3,
    spread: 1.5,
    distanceFn: cosineDistance,
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
  standards.forEach((s, i) => {
    const [x, y, z] = coords3D[i]
    result.set(s.id, {
      x: ((x - mins[0]) / (maxs[0] - mins[0] || 1) - 0.5) * 2 * scale,
      y: ((y - mins[1]) / (maxs[1] - mins[1] || 1) - 0.5) * 2 * scale,
      z: ((z - mins[2]) / (maxs[2] - mins[2] || 1) - 0.5) * 2 * scale,
    })
  })

  // 캐시 저장
  cachedCoords = result
  cachedHash = hash

  console.timeEnd('임베딩 3D 계산')
  return result
}

/**
 * 캐시 무효화 (데이터 변경 시 호출)
 */
export function invalidateEmbeddingCache() {
  cachedCoords = null
  cachedHash = null
}
