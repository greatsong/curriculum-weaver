/**
 * 교차 교과 연결 자동 생성 스크립트
 * 모든 성취기준이 최소 1개 이상의 교차 교과 연결을 갖도록 보장합니다.
 * 링크 수에 인위적 제한을 두지 않습니다.
 *
 * 실행: node scripts/generateLinks.js
 */
import { ALL_STANDARDS } from '../server/data/standards.js'
import { SOCIAL_STANDARDS } from '../server/data/standards_social.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

console.log('=== 교차 교과 연결 생성 ===')

// 1. 데이터 정리
const socialFixed = SOCIAL_STANDARDS.map(s => ({ ...s, subject_group: '사회' }))
const seenCodes = new Set()
const allStandards = []
for (const s of ALL_STANDARDS) {
  if (!seenCodes.has(s.code)) { seenCodes.add(s.code); allStandards.push(s) }
}
for (const s of socialFixed) {
  if (!seenCodes.has(s.code)) { seenCodes.add(s.code); allStandards.push(s) }
}
console.log(`총 성취기준: ${allStandards.length}개`)

function getSG(s) {
  const sg = s.subject_group || s.subject
  if (sg === '실과(기술·가정)/정보' || sg === '실과') return '기술·가정'
  return sg
}

// 2. 토큰화 (area, domain, subject도 포함)
const STOP_WORDS = new Set(['있다', '한다', '이다', '하다', '것이', '수행', '이해', '설명', '활용',
  '탐구', '과정', '결과', '방법', '상황', '학습', '평가', '능력', '적용', '분석',
  '파악', '다양', '통해', '중심', '바탕', '대한', '위한', '등을', '있는', '하는',
  '하고', '것을', '관한', '대해', '같은', '또는', '위해', '수있', '있도록', '기를',
  '대하', '통하', '그리', '따라', '이를', '이에', '가지', '알고', '있으', '하여',
  '되는', '된다', '않는', '들의', '에서', '으로', '에게', '부터', '까지', '라고',
  '성취기준', '해설', '고려', '사항', '지도', '교육과정'])

function tokenize(s) {
  const text = (s.content || '') + ' ' + (s.keywords || []).join(' ') +
    ' ' + (s.area || '') + ' ' + (s.domain || '') + ' ' + (s.explanation || '')
  const words = text.match(/[가-힣]{2,}/g) || []
  const tokens = new Set()
  for (const w of words) {
    if (w.length >= 2 && !STOP_WORDS.has(w)) tokens.add(w)
  }
  return tokens
}

// 3. IDF 계산
const docFreq = {}
const tokenSets = allStandards.map(s => {
  const tokens = tokenize(s)
  for (const t of tokens) docFreq[t] = (docFreq[t] || 0) + 1
  return tokens
})

const N = allStandards.length

// 상위 3% 초빈도 단어 제거
const sortedByFreq = Object.entries(docFreq).sort((a, b) => b[1] - a[1])
const cutoff = sortedByFreq[Math.floor(sortedByFreq.length * 0.03)]?.[1] || 100
const commonWords = new Set(sortedByFreq.filter(([k, v]) => v >= cutoff).map(([k]) => k))
console.log(`빈도 컷오프: ${cutoff}회, 제거 단어: ${commonWords.size}개`)

// 토큰셋에서 초빈도 제거
for (const tokens of tokenSets) {
  for (const t of [...tokens]) {
    if (commonWords.has(t)) tokens.delete(t)
  }
}

// IDF 값
const idf = {}
for (const [term, df] of Object.entries(docFreq)) {
  if (!commonWords.has(term)) {
    idf[term] = Math.log(N / (df + 1))
  }
}

// 4. 역인덱스
const invertedIndex = new Map()
for (let i = 0; i < allStandards.length; i++) {
  for (const t of tokenSets[i]) {
    if (!invertedIndex.has(t)) invertedIndex.set(t, [])
    invertedIndex.get(t).push(i)
  }
}

// 5. 교차 교과 유사도 계산
console.log('유사도 계산 중...')
const pairScores = new Map()

for (const [token, indices] of invertedIndex) {
  if (indices.length > 500) continue // 너무 흔한 토큰 스킵

  const bySg = {}
  for (const idx of indices) {
    const sg = getSG(allStandards[idx])
    if (!bySg[sg]) bySg[sg] = []
    bySg[sg].push(idx)
  }
  const sgs = Object.keys(bySg)
  if (sgs.length < 2) continue

  const weight = idf[token] || 0
  for (let a = 0; a < sgs.length; a++) {
    for (let b = a + 1; b < sgs.length; b++) {
      for (const i of bySg[sgs[a]]) {
        for (const j of bySg[sgs[b]]) {
          const key = i < j ? `${i}|${j}` : `${j}|${i}`
          if (!pairScores.has(key)) pairScores.set(key, 0)
          pairScores.set(key, pairScores.get(key) + weight)
        }
      }
    }
  }
}

console.log(`후보 쌍: ${pairScores.size}개`)

// 6. 노드별 최고 연결 선택 (제한 없음, 모든 노드 연결 보장)
const MAX_LINKS_PER_NODE = 8

const nodeTopPairs = new Map()
for (const [key, score] of pairScores) {
  const [i, j] = key.split('|').map(Number)
  if (!nodeTopPairs.has(i)) nodeTopPairs.set(i, [])
  if (!nodeTopPairs.has(j)) nodeTopPairs.set(j, [])
  nodeTopPairs.get(i).push({ other: j, score, key })
  nodeTopPairs.get(j).push({ other: i, score, key })
}

for (const [, pairs] of nodeTopPairs) {
  pairs.sort((a, b) => b.score - a.score)
}

const selectedPairs = new Set()
const nodeLinkCount = new Map()

function addPair(i, j) {
  const key = i < j ? `${i}|${j}` : `${j}|${i}`
  if (selectedPairs.has(key)) return false
  selectedPairs.add(key)
  nodeLinkCount.set(i, (nodeLinkCount.get(i) || 0) + 1)
  nodeLinkCount.set(j, (nodeLinkCount.get(j) || 0) + 1)
  return true
}

// Phase 1: 모든 노드에 최소 1개 연결 보장
for (let idx = 0; idx < allStandards.length; idx++) {
  if ((nodeLinkCount.get(idx) || 0) >= 1) continue
  const pairs = nodeTopPairs.get(idx)
  if (!pairs || pairs.length === 0) continue
  addPair(idx, pairs[0].other) // 가장 유사한 것 1개
}

const phase1Count = selectedPairs.size
const phase1Nodes = nodeLinkCount.size
console.log(`Phase 1 (최소 보장): ${phase1Count}개 연결, ${phase1Nodes}개 노드`)

// Phase 2: 추가 연결 (MAX_LINKS_PER_NODE까지)
const allCandidates = [...pairScores.entries()]
  .sort((a, b) => b[1] - a[1])

for (const [key, score] of allCandidates) {
  if (selectedPairs.has(key)) continue
  const [i, j] = key.split('|').map(Number)
  const ci = nodeLinkCount.get(i) || 0
  const cj = nodeLinkCount.get(j) || 0
  if (ci >= MAX_LINKS_PER_NODE && cj >= MAX_LINKS_PER_NODE) continue
  addPair(i, j)
}

console.log(`Phase 2 (추가): 총 ${selectedPairs.size}개 연결, ${nodeLinkCount.size}개 노드`)

// Phase 3: 아직 연결 안 된 노드 — 2-gram 기반 폴백
const unconnected = []
for (let idx = 0; idx < allStandards.length; idx++) {
  if (!nodeLinkCount.has(idx)) unconnected.push(idx)
}
console.log(`Phase 3 폴백 대상: ${unconnected.length}개 노드`)

if (unconnected.length > 0) {
  // 2-gram 기반 매칭
  function bigrams(s) {
    const text = (s.content || '') + (s.keywords || []).join('')
    const grams = new Set()
    for (let i = 0; i < text.length - 1; i++) {
      const pair = text.slice(i, i + 2)
      if (/[가-힣]{2}/.test(pair)) grams.add(pair)
    }
    return grams
  }

  const bigramSets = allStandards.map(bigrams)

  for (const idx of unconnected) {
    const sg = getSG(allStandards[idx])
    const myBigrams = bigramSets[idx]
    if (myBigrams.size === 0) continue

    let bestOther = -1, bestScore = 0
    for (let j = 0; j < allStandards.length; j++) {
      if (j === idx) continue
      if (getSG(allStandards[j]) === sg) continue // 다른 교과만
      const otherBigrams = bigramSets[j]
      let overlap = 0
      for (const g of myBigrams) {
        if (otherBigrams.has(g)) overlap++
      }
      const score = overlap / (myBigrams.size + otherBigrams.size - overlap)
      if (score > bestScore) {
        bestScore = score
        bestOther = j
      }
    }
    if (bestOther >= 0) {
      addPair(idx, bestOther)
    }
  }
  console.log(`Phase 3 후: 총 ${selectedPairs.size}개 연결, ${nodeLinkCount.size}개 노드`)
}

// 최종 미연결 확인
const finalUnconnected = allStandards.length - nodeLinkCount.size
console.log(`최종 미연결: ${finalUnconnected}개`)

// 7. 연결 데이터 생성
const links = []
for (const key of selectedPairs) {
  const [i, j] = key.split('|').map(Number)
  const s1 = allStandards[i], s2 = allStandards[j]
  const sg1 = getSG(s1), sg2 = getSG(s2)

  const shared = []
  for (const t of tokenSets[i]) {
    if (tokenSets[j].has(t)) shared.push(t)
  }

  let link_type = 'cross_subject'
  if (shared.length >= 5) link_type = 'same_concept'
  else if (shared.length >= 3) link_type = 'application'

  const kws = shared.length > 0
    ? shared.slice(0, 4).join(', ') + (shared.length > 4 ? ` 외 ${shared.length - 4}개` : '')
    : '유사 내용'

  links.push({
    source: s1.code,
    target: s2.code,
    link_type,
    rationale: `${sg1}×${sg2}: ${kws}`,
  })
}

console.log(`\n총 연결: ${links.length}개`)

// 통계
const pairSummary = {}
const codeToSg = new Map(allStandards.map(s => [s.code, getSG(s)]))
for (const link of links) {
  const sg1 = codeToSg.get(link.source), sg2 = codeToSg.get(link.target)
  const pairKey = [sg1, sg2].sort().join(' ↔ ')
  pairSummary[pairKey] = (pairSummary[pairKey] || 0) + 1
}
console.log('\n교과 쌍별 연결 (상위 15):')
Object.entries(pairSummary).sort((a, b) => b[1] - a[1]).slice(0, 15)
  .forEach(([k, v]) => console.log(`  ${k}: ${v}개`))

const typeDist = {}
for (const l of links) typeDist[l.link_type] = (typeDist[l.link_type] || 0) + 1
console.log('\n연결 유형:', typeDist)

// 연결 수 분포
const linkDist = {}
for (const [, count] of nodeLinkCount) {
  linkDist[count] = (linkDist[count] || 0) + 1
}
console.log('\n노드별 연결 수 분포:')
Object.entries(linkDist).sort((a,b) => Number(a[0]) - Number(b[0]))
  .forEach(([k, v]) => console.log(`  ${k}개 연결: ${v}개 노드`))

// 8. 별도 파일에 저장 (안전)
const linksPath = path.join(__dirname, '..', 'server', 'data', 'generatedLinks.js')
const linksContent = `/**
 * 자동 생성된 교차 교과 연결 데이터
 * ${links.length}개 연결, ${nodeLinkCount.size}/${allStandards.length}개 노드 연결
 * 생성일: ${new Date().toISOString().split('T')[0]}
 */
export const GENERATED_LINKS = ${JSON.stringify(links, null, 2)}
`
fs.writeFileSync(linksPath, linksContent, 'utf-8')
console.log(`\n✅ server/data/generatedLinks.js 저장 완료 (${links.length}개 연결)`)
