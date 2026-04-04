#!/usr/bin/env node
/**
 * AI 기반 교과 간 연결 생성 스크립트
 *
 * 기존 TF-IDF 키워드 매칭 → Claude Opus 기반 의미적 연결 판단
 *
 * 전략:
 * - 14개 교과군 × C(14,2) = 91개 교과 쌍
 * - 큰 교과는 하위 교과별로 분할 (제2외국어, 사회 등)
 * - 각 쌍에 대해 Claude Opus가 성취기준 수준에서 의미있는 연결 탐색
 * - 병렬 처리 (p-queue, concurrency 5)
 *
 * 사용법: ANTHROPIC_API_KEY=... node scripts/generateLinksAI.js
 */

import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import PQueue from 'p-queue'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── 설정 ───
const MODEL = 'claude-opus-4-20250514'
const CONCURRENCY = 5          // 동시 API 호출 수
const MAX_STANDARDS_PER_CALL = 120 // 한 호출에 넣을 최대 성취기준 수 (양쪽 합산)
const OUTPUT_FILE = path.join(__dirname, '..', 'server', 'data', 'generatedLinksAI.js')
const PROGRESS_FILE = path.join(__dirname, 'generateLinksAI_progress.json')

// ─── 데이터 로드 ───
async function loadStandards() {
  const { ALL_STANDARDS } = await import('../server/data/standards.js')
  const { SOCIAL_STANDARDS } = await import('../server/data/standards_social.js')

  const socialFixed = SOCIAL_STANDARDS.map(s => ({ ...s, subject_group: '사회' }))
  const all = [...ALL_STANDARDS, ...socialFixed]

  // 중복 코드 제거
  const seen = new Set()
  const deduped = all.filter(s => {
    if (seen.has(s.code)) return false
    seen.add(s.code)
    return true
  })

  return deduped
}

// ─── 교과군별 그룹핑 ───
function groupBySubject(standards) {
  const groups = new Map()
  for (const s of standards) {
    const key = s.subject_group || 'unknown'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(s)
  }
  return groups
}

// ─── 큰 교과군은 하위 교과(subject)로 분할 ───
function splitLargeGroups(groups, maxSize = 80) {
  const result = new Map()
  for (const [groupName, standards] of groups) {
    if (standards.length <= maxSize) {
      result.set(groupName, standards)
      continue
    }
    // 하위 교과별로 분할
    const subGroups = new Map()
    for (const s of standards) {
      const subKey = s.subject || groupName
      if (!subGroups.has(subKey)) subGroups.set(subKey, [])
      subGroups.get(subKey).push(s)
    }
    // 하위 교과를 적절한 크기로 병합
    let batch = []
    let batchIdx = 0
    for (const [subName, subStandards] of subGroups) {
      if (batch.length + subStandards.length > maxSize && batch.length > 0) {
        result.set(`${groupName}_${batchIdx}`, batch)
        batch = []
        batchIdx++
      }
      batch.push(...subStandards)
    }
    if (batch.length > 0) {
      result.set(`${groupName}_${batchIdx}`, batch)
    }
  }
  return result
}

// ─── 성취기준을 텍스트로 변환 (프롬프트용) ───
function standardsToText(standards) {
  return standards.map(s => {
    const parts = [`${s.code} [${s.subject}] ${s.content}`]
    if (s.explanation) parts.push(`  해설: ${s.explanation.substring(0, 150)}`)
    return parts.join('\n')
  }).join('\n')
}

// ─── 교과 쌍 생성 ───
function generatePairs(groups) {
  const keys = [...groups.keys()].sort()
  const pairs = []
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      // 같은 교과군의 분할 그룹끼리는 건너뛰기
      const baseI = keys[i].replace(/_\d+$/, '')
      const baseJ = keys[j].replace(/_\d+$/, '')
      if (baseI === baseJ) continue
      pairs.push([keys[i], keys[j]])
    }
  }
  return pairs
}

// ─── Claude Opus로 연결 생성 ───
async function findConnections(client, groupA, groupB, standardsA, standardsB) {
  const textA = standardsToText(standardsA)
  const textB = standardsToText(standardsB)
  const baseGroupA = groupA.replace(/_\d+$/, '')
  const baseGroupB = groupB.replace(/_\d+$/, '')

  const prompt = `당신은 한국 2022 개정 교육과정 전문가입니다.

아래에 두 교과(군)의 성취기준이 나열되어 있습니다.
이 두 교과 사이에서 **교육적으로 진정 의미있는 교차 연결**을 찾아주세요.

## 중요한 판단 기준

1. **표면적 단어 일치가 아닌 개념적/교육적 연결**만 찾으세요.
   - ❌ 나쁜 예: "뜻과"라는 단어가 수학과 한문에 모두 있다고 연결 → 무의미
   - ❌ 나쁜 예: "분류"라는 단어가 생물과 한문에 모두 있다고 연결 → 무의미
   - ✅ 좋은 예: 수학의 "통계적 추론"과 사회의 "사회 현상 데이터 분석" → 통계적 사고력이 사회 탐구에 직접 적용됨
   - ✅ 좋은 예: 과학의 "에너지 보존 법칙"과 체육의 "운동 역학" → 같은 물리 원리의 실제 적용

2. **연결 강도가 약한 것은 포함하지 마세요.** 정말 수업에서 함께 다루면 시너지가 나는 것만.

3. **link_type 분류**:
   - \`cross_subject\`: 서로 다른 교과에서 같은 현상/개념을 다른 관점으로 다룸
   - \`same_concept\`: 본질적으로 동일한 개념을 두 교과에서 다룸
   - \`prerequisite\`: 한쪽이 다른 쪽의 선수학습
   - \`application\`: 한 교과의 개념을 다른 교과에서 실제 적용

## 교과A: ${baseGroupA}
${textA}

## 교과B: ${baseGroupB}
${textB}

## 응답 형식

반드시 아래 JSON 형식으로만 응답하세요. 연결이 없으면 빈 배열 \`[]\`을 반환하세요.

\`\`\`json
[
  {
    "source": "[코드]",
    "target": "[코드]",
    "link_type": "cross_subject|same_concept|prerequisite|application",
    "rationale": "이 두 성취기준이 교육적으로 어떻게 연결되는지 구체적으로 설명 (2-3문장)"
  }
]
\`\`\`

중요: 존재하지 않는 코드를 만들지 마세요. 위에 나열된 코드만 사용하세요.`

  // 스트리밍 모드 사용 (Opus는 긴 요청 시 스트리밍 필수)
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16384,
    messages: [{ role: 'user', content: prompt }],
  })
  const response = await stream.finalMessage()
  const text = response.content[0].text
  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\[[\s\S]*\])/)
    if (jsonMatch) {
      const links = JSON.parse(jsonMatch[1])
      return Array.isArray(links) ? links : []
    }
  } catch (e) {
    console.warn(`  ⚠️ JSON 파싱 실패 (${groupA}×${groupB}):`, e.message)
    console.warn(`  응답 미리보기:`, text.substring(0, 200))
  }
  return []
}

// ─── 진행 상황 관리 ───
function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'))
    }
  } catch {}
  return { completed: [], links: [] }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2))
}

// ─── 코드 검증 ───
function validateLinks(links, validCodes) {
  return links.filter(l => {
    if (!validCodes.has(l.source) || !validCodes.has(l.target)) {
      return false
    }
    if (l.source === l.target) return false
    if (!['cross_subject', 'same_concept', 'prerequisite', 'application'].includes(l.link_type)) {
      l.link_type = 'cross_subject'
    }
    return true
  })
}

// ─── 중복 제거 ───
function deduplicateLinks(links) {
  const seen = new Set()
  return links.filter(l => {
    const key = [l.source, l.target].sort().join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ─── link_type 약어 매핑 ───
function linkTypeAbbrev(lt) {
  const map = { cross_subject: 'cs', same_concept: 'sc', prerequisite: 'pr', application: 'ap' }
  return map[lt] || 'cs'
}

// ─── 메인 실행 ───
async function main() {
  console.log('🚀 AI 기반 교과 간 연결 생성 시작')
  console.log(`  모델: ${MODEL}`)
  console.log(`  동시 처리: ${CONCURRENCY}`)
  console.log()

  // 1. 데이터 로드
  const standards = await loadStandards()
  console.log(`📚 성취기준 ${standards.length}개 로드됨`)

  const validCodes = new Set(standards.map(s => s.code))

  // 2. 교과군 그룹핑 + 큰 교과 분할
  const rawGroups = groupBySubject(standards)
  const groups = splitLargeGroups(rawGroups, 100)

  console.log(`📂 교과 그룹 ${groups.size}개:`)
  for (const [name, stds] of groups) {
    console.log(`   ${name}: ${stds.length}개`)
  }

  // 3. 교과 쌍 생성
  const pairs = generatePairs(groups)
  console.log(`\n🔗 교과 쌍 ${pairs.length}개 생성됨`)

  // 4. 진행 상황 로드 (이어서 실행 가능)
  const progress = loadProgress()
  const completedSet = new Set(progress.completed)
  const allLinks = [...progress.links]
  const skipped = pairs.filter(([a, b]) => completedSet.has(`${a}|${b}`)).length
  if (skipped > 0) {
    console.log(`⏩ ${skipped}개 쌍 이미 완료 (이어서 진행)`)
  }

  // 5. Claude 클라이언트 & 큐 설정
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const queue = new PQueue({ concurrency: CONCURRENCY })

  let completed = progress.completed.length
  let totalLinks = allLinks.length
  const startTime = Date.now()

  // 6. 병렬 실행
  const tasks = pairs.map(([groupA, groupB]) => {
    const pairKey = `${groupA}|${groupB}`
    if (completedSet.has(pairKey)) return null

    return queue.add(async () => {
      const standardsA = groups.get(groupA)
      const standardsB = groups.get(groupB)
      const baseA = groupA.replace(/_\d+$/, '')
      const baseB = groupB.replace(/_\d+$/, '')

      console.log(`  🔍 ${baseA}(${standardsA.length}) × ${baseB}(${standardsB.length})...`)

      try {
        const links = await findConnections(client, groupA, groupB, standardsA, standardsB)
        const validated = validateLinks(links, validCodes)

        completed++
        totalLinks += validated.length
        allLinks.push(...validated)
        progress.completed.push(pairKey)
        progress.links.push(...validated)

        const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1)
        console.log(`  ✅ ${baseA}×${baseB}: ${validated.length}개 연결 (총 ${totalLinks}개, ${completed}/${pairs.length}쌍, ${elapsed}분)`)

        // 10쌍마다 진행 저장
        if (completed % 10 === 0) saveProgress(progress)
      } catch (e) {
        console.error(`  ❌ ${baseA}×${baseB} 실패:`, e.message)
        // 재시도하지 않고 건너뛰기 (다음 실행 시 이어서)
      }
    })
  }).filter(Boolean)

  await Promise.all(tasks)
  saveProgress(progress)

  // 7. 중복 제거 + 최종 저장
  const dedupedLinks = deduplicateLinks(allLinks)
  console.log(`\n📊 결과 요약:`)
  console.log(`   총 연결: ${dedupedLinks.length}개 (중복 제거 전: ${allLinks.length}개)`)

  // link_type 분포
  const typeDist = {}
  dedupedLinks.forEach(l => typeDist[l.link_type] = (typeDist[l.link_type] || 0) + 1)
  console.log('   연결 유형:', typeDist)

  // 8. generatedLinksAI.js 저장
  const compressed = dedupedLinks.map(l =>
    `["${l.source}","${l.target}","${linkTypeAbbrev(l.link_type)}","${(l.rationale || '').replace(/"/g, '\\"').replace(/\n/g, ' ')}"]`
  )

  const output = `// AI 기반 교차 교과 연결 ${dedupedLinks.length}개 (Claude Opus 생성)
// 생성일: ${new Date().toISOString()}
// 형식: [source, target, link_type, rationale]
// link_type: cs=cross_subject, sc=same_concept, pr=prerequisite, ap=application
export const GENERATED_LINKS = [${compressed.join(',\n')}]
`
  fs.writeFileSync(OUTPUT_FILE, output)
  console.log(`\n💾 ${OUTPUT_FILE} 저장 완료`)

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1)
  console.log(`⏱️ 총 소요시간: ${elapsed}분`)
}

main().catch(e => {
  console.error('치명적 오류:', e)
  process.exit(1)
})
