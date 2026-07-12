import fs from 'fs'

// 1. 검증된 링크 로드
const validLinks = JSON.parse(fs.readFileSync('scripts/validated_links.json', 'utf-8'))

// 2. 유효한 성취기준 코드로 필터 + 같은 교과 연결 제거
const allStd = JSON.parse(fs.readFileSync('scripts/all_standards_by_group.json', 'utf-8'))
const codeToGroup = new Map()
Object.entries(allStd).forEach(([group, stds]) => {
  stds.forEach(s => codeToGroup.set(s.code, group))
})

// 같은 교과 쌍 제거 (cross-subject만 유지)
const crossSubjectLinks = validLinks.filter(l => {
  const srcGroup = codeToGroup.get(l.source)
  const tgtGroup = codeToGroup.get(l.target)
  return srcGroup && tgtGroup && srcGroup !== tgtGroup
})

console.log('총 유효 링크:', validLinks.length)
console.log('같은 교과 제거 후:', crossSubjectLinks.length)

// 3. link_type 축약 맵
const ltShort = {
  cross_subject: 'cs',
  same_concept: 'sc',
  application: 'ap',
  prerequisite: 'pr'
}

// 4. 압축 배열 형식으로 변환
const compressed = crossSubjectLinks.map(l => {
  const lt = ltShort[l.link_type] || l.link_type
  return [l.source, l.target, lt, l.rationale || '']
})

// 5. generatedLinks.js 생성
const header = `// AI 기반 교차 교과 연결 ${compressed.length}개
// Opus 모델이 성취기준 수준에서 평가한 의미 있는 융합 연결
// 형식: [source, target, link_type, rationale]
// link_type: cs=cross_subject, sc=same_concept, ap=application, pr=prerequisite
export const GENERATED_LINKS = `

const content = header + JSON.stringify(compressed) + '\n'

fs.writeFileSync('server/data/generatedLinks.js', content, 'utf-8')
console.log('\nSaved server/data/generatedLinks.js')
console.log('Links:', compressed.length)

// 6. 통계 출력
const stats = {}
compressed.forEach(([, , lt]) => { stats[lt] = (stats[lt] || 0) + 1 })
console.log('\n링크 타입:')
Object.entries(stats).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`))

// 파일 크기 확인
const fileSizeKB = (Buffer.byteLength(content, 'utf-8') / 1024).toFixed(1)
console.log(`\n파일 크기: ${fileSizeKB} KB`)
