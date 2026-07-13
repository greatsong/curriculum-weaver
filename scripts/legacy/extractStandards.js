import fs from 'fs'
import { ALL_STANDARDS } from '../server/data/standards.js'
import { SOCIAL_STANDARDS } from '../server/data/standards_social.js'

// Social standards에 subject_group 추가
const socStd = SOCIAL_STANDARDS.map(s => ({ ...s, subject_group: s.subject_group || '사회' }))
const all = [...ALL_STANDARDS, ...socStd]
console.log('Total standards:', all.length)

// subject_group별 분류
const groups = {}
all.forEach(s => {
  const g = s.subject_group
  if (!groups[g]) groups[g] = []
  groups[g].push({
    code: s.code,
    subject: s.subject,
    content: s.content,
    keywords: s.keywords,
    school_level: s.school_level,
    grade_group: s.grade_group
  })
})

// 각 교과군별 개수 출력
Object.entries(groups).sort((a, b) => b[1].length - a[1].length).forEach(([k, v]) => {
  console.log(`  ${k}: ${v.length}`)
})

// JSON 저장
fs.writeFileSync('scripts/all_standards_by_group.json', JSON.stringify(groups, null, 2), 'utf-8')
console.log('\nSaved to scripts/all_standards_by_group.json')

// 교과 쌍 목록도 생성
const subjectNames = Object.keys(groups).sort()
const pairs = []
for (let i = 0; i < subjectNames.length; i++) {
  for (let j = i + 1; j < subjectNames.length; j++) {
    pairs.push([subjectNames[i], subjectNames[j]])
  }
}
console.log(`\nSubject pairs: ${pairs.length}`)
fs.writeFileSync('scripts/subject_pairs.json', JSON.stringify(pairs, null, 2), 'utf-8')
