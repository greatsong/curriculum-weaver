/**
 * 설계 모드 렌즈 공통 상수·헬퍼
 */

// 교과군 색상 (Graph3D와 동일 팔레트)
export const SUBJECT_COLORS = {
  '과학': '#22c55e', '수학': '#3b82f6', '국어': '#ef4444',
  '사회': '#eab308', '도덕': '#f97316',
  '기술·가정': '#a855f7', '정보': '#06b6d4',
  '실과(기술·가정)/정보': '#a855f7', '실과': '#14b8a6',
  '미술': '#ec4899', '체육': '#84cc16', '음악': '#8b5cf6',
  '영어': '#6366f1', '제2외국어': '#0891b2', '한문': '#14b8a6',
}

export const LINK_TYPE_LABELS = {
  cross_subject: '교과연계', same_concept: '동일개념', prerequisite: '선수학습',
  application: '적용', extension: '확장',
}

export const LINK_TYPE_COLORS = {
  cross_subject: '#f59e0b', same_concept: '#3b82f6', prerequisite: '#ef4444',
  application: '#22c55e', extension: '#a855f7',
}

// link source/target이 객체일 수도 있어 ID 안전 추출
export const getLinkId = (l, key) => typeof l[key] === 'object' ? l[key]?.id : l[key]

export const subjectColor = (node) =>
  SUBJECT_COLORS[node?.subject_group] || SUBJECT_COLORS[node?.subject] || '#6b7280'

// 시맨틱 유사도 → 교사용 서수 라벨 (원시 수치는 툴팁으로)
export function simBadge(sim) {
  if (sim == null) return null
  if (sim >= 0.5) return { label: '매우 관련', cls: 'bg-green-100 text-green-700 border-green-200' }
  if (sim >= 0.42) return { label: '관련', cls: 'bg-blue-100 text-blue-700 border-blue-200' }
  return { label: '참고', cls: 'bg-gray-100 text-gray-500 border-gray-200' }
}

// 학년군 정렬 순서 (오염 표기 정규화 포함: 초2/초4/초6/중1~3 등)
const GRADE_BUCKETS = [
  { key: '초1-2', label: '초1-2', match: ['초1-2', '초1~2', '초2'] },
  { key: '초3-4', label: '초3-4', match: ['초3-4', '초3~4', '초4'] },
  { key: '초5-6', label: '초5-6', match: ['초5-6', '초5~6', '초6'] },
  { key: '중1-3', label: '중1-3', match: ['중1-3', '중1~3'] },
  { key: '고공통', label: '고 공통', match: ['고공통'] },
  { key: '고선택', label: '고 선택', match: ['고선택'] },
]

export function gradeBucket(node) {
  const g = node?.grade_group || ''
  for (let i = 0; i < GRADE_BUCKETS.length; i++) {
    if (GRADE_BUCKETS[i].match.some(m => g === m)) return { order: i, ...GRADE_BUCKETS[i] }
  }
  // 학년군이 비정형이면 학교급으로 대략 배치
  const lv = node?.school_level || ''
  if (lv === '초등학교') return { order: 2, key: '초5-6', label: '초등' }
  if (lv === '중학교') return { order: 3, key: '중1-3', label: '중1-3' }
  if (lv === '고등학교') return { order: 5, key: '고선택', label: '고등' }
  return { order: 9, key: '기타', label: '기타' }
}

// 링크 대표 품질 (없으면 semantic으로 폴백)
export const linkQuality = (l) => l.quality_score ?? l.semantic_score ?? 0.5

// 같은 학년군 여부 — 융합 수업은 같은 학년군끼리가 기본이므로 정렬 우선순위에 사용
export const isSameGrade = (a, b) => gradeBucket(a).order === gradeBucket(b).order

// 정렬 점수: 같은 학년군 우선, 그 안에서 품질순
export const linkPriority = (l, a, b) => (isSameGrade(a, b) ? 10 : 0) + linkQuality(l)

// 노드의 학교급 판별 — school_level이 비면 grade_group 접두사로 추정.
// 고교 선택과목 상당수가 school_level이 비어 있어(grade_group '고선택' 등),
// school_level만 보면 고등 필터에서 경제 수학·데이터 과학 등이 누락된다 (서버 resolveSchoolLevel과 동일 규칙).
export const nodeSchoolLevel = (node) => {
  if (node?.school_level) return node.school_level
  const gg = node?.grade_group || ''
  if (/^초/.test(gg)) return '초등학교'
  if (/^중/.test(gg)) return '중학교'
  if (/^고/.test(gg)) return '고등학교'
  return null
}
