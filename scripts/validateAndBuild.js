import fs from 'fs'

// 1. 모든 유효한 성취기준 코드 수집
const allStd = JSON.parse(fs.readFileSync('scripts/all_standards_by_group.json', 'utf-8'))
const validCodes = new Set()
Object.values(allStd).forEach(stds => stds.forEach(s => validCodes.add(s.code)))
console.log('Valid standard codes:', validCodes.size)

// 2. 결과 파일 읽기 및 검증
const dir = 'scripts/results'
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
let allLinks = []
let invalidSources = []
let invalidTargets = []
let duplicates = 0
let linkTypes = {}
const seen = new Set()

files.forEach(f => {
  const data = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf-8'))
  data.forEach(link => {
    // 코드 검증
    if (!validCodes.has(link.source)) invalidSources.push({ file: f, code: link.source })
    if (!validCodes.has(link.target)) invalidTargets.push({ file: f, code: link.target })

    // 중복 검증 (양방향)
    const key1 = link.source + '|' + link.target
    const key2 = link.target + '|' + link.source
    if (seen.has(key1) || seen.has(key2)) {
      duplicates++
      return
    }
    seen.add(key1)

    // 링크 타입 집계
    linkTypes[link.link_type] = (linkTypes[link.link_type] || 0) + 1

    allLinks.push(link)
  })
})

console.log('\n=== 검증 결과 ===')
console.log('총 연결:', allLinks.length + duplicates, '→ 중복 제거 후:', allLinks.length)
console.log('중복:', duplicates)
console.log('\n유효하지 않은 source 코드:', invalidSources.length)
if (invalidSources.length > 0) {
  invalidSources.slice(0, 30).forEach(s => console.log('  ', s.file, s.code))
}
console.log('유효하지 않은 target 코드:', invalidTargets.length)
if (invalidTargets.length > 0) {
  invalidTargets.slice(0, 30).forEach(s => console.log('  ', s.file, s.code))
}
console.log('\n링크 타입 분포:')
Object.entries(linkTypes).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  ' + k + ':', v))

// 3. 유효한 링크만 필터링 (양쪽 코드 모두 존재하는 것만)
const validLinks = allLinks.filter(l => validCodes.has(l.source) && validCodes.has(l.target))
console.log('\n유효한 링크 (양쪽 코드 존재):', validLinks.length)

// 4. 교과 쌍별 통계
const pairStats = {}
validLinks.forEach(l => {
  // source/target에서 교과 찾기
  let srcSubject = null, tgtSubject = null
  for (const [group, stds] of Object.entries(allStd)) {
    if (stds.find(s => s.code === l.source)) srcSubject = group
    if (stds.find(s => s.code === l.target)) tgtSubject = group
  }
  if (srcSubject && tgtSubject) {
    const pair = [srcSubject, tgtSubject].sort().join(' × ')
    pairStats[pair] = (pairStats[pair] || 0) + 1
  }
})
console.log('\n교과 쌍별 연결 수:')
Object.entries(pairStats).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  ' + k + ':', v))

// 5. 연결된 노드 수 / 전체 노드 수
const connectedNodes = new Set()
validLinks.forEach(l => {
  connectedNodes.add(l.source)
  connectedNodes.add(l.target)
})
console.log('\n연결된 노드:', connectedNodes.size, '/', validCodes.size)
console.log('고립 노드:', validCodes.size - connectedNodes.size)

// 결과 저장 (나중에 generatedLinks.js로 변환)
fs.writeFileSync('scripts/validated_links.json', JSON.stringify(validLinks, null, 2), 'utf-8')
console.log('\nSaved validated_links.json:', validLinks.length, 'links')
