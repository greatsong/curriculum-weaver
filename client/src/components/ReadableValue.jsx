// AI 제안 value(문자열/객체/배열/중첩)를 사람이 읽기 좋은 형태로 렌더한다.
// 기존엔 JSON.stringify로 raw JSON을 노출해 "프로그램 오류처럼 보인다"는 의견이 있었다.

import { BOARD_SCHEMAS } from 'curriculum-weaver-shared/boardSchemas.js'

// 보드 스키마(shared/boardSchemas.js)에 정의된 필드 라벨을 그대로 쓴다.
// 스키마에 '학생 수'·'디지털 리터러시 수준' 같은 한국어 라벨이 이미 있는데도
// 제안 카드가 studentCount·digitalLiteracy 같은 영문 키를 그대로 노출하던 문제를 막는다.
const SCHEMA_LABELS = (() => {
  const map = {}
  // 같은 키가 여러 보드에 다른 라벨로 있으면(rationale → '근거' / '제안 근거')
  // 먼저 만난 쪽을 쓴다. 스키마 파일 편집 순서에 따라 UI 문구가 흔들리지 않게.
  const put = (key, label) => { if (key && label && !(key in map)) map[key] = label }
  const addField = (field) => {
    if (!field || typeof field !== 'object') return
    put(field.name, field.label)
    // list 필드의 항목 스키마: { 키: { label, type } }
    if (field.itemSchema) {
      for (const [key, spec] of Object.entries(field.itemSchema)) put(key, spec?.label)
    }
    if (Array.isArray(field.fields)) field.fields.forEach(addField)
  }
  for (const schema of Object.values(BOARD_SCHEMAS)) {
    (schema.fields || []).forEach(addField)
  }
  return map
})()

// 어느 보드에도 매이지 않는 범용 키 — 스키마 라벨보다 먼저 쓴다.
// (스키마를 먼저 두면 'title'이 특정 보드의 '맥락' 같은 라벨로 덮여 오해를 부른다)
export const KEY_LABELS = {
  assessments: '평가',
  assessment: '평가',
  activities: '활동',
  activity: '활동',
  objectives: '목표',
  objective: '목표',
  materials: '자료',
  steps: '단계',
  items: '항목',
  title: '제목',
  description: '설명',
  content: '내용',
  subject: '교과',
  grade: '학년',
}

export function labelize(key) {
  return KEY_LABELS[key] || SCHEMA_LABELS[key] || key
}

export default function ReadableValue({ value, depth = 0 }) {
  if (value === null || value === undefined || value === '') {
    return <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <span style={{ whiteSpace: 'pre-wrap' }}>{String(value)}</span>
  }

  if (Array.isArray(value)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {value.map((item, i) => (
          <div key={i}>
            {value.length > 1 && (
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED', marginBottom: 3 }}>
                {i + 1}
              </div>
            )}
            <div style={{ paddingLeft: 8, borderLeft: '2px solid #E9D5FF' }}>
              <ReadableValue value={item} depth={depth + 1} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // 객체 — key: value 목록. value가 복합형이면 줄바꿈 후 들여쓰기.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {Object.entries(value).map(([k, v]) => {
        const isComplex = v !== null && typeof v === 'object'
        return (
          <div
            key={k}
            style={{ display: 'flex', flexDirection: isComplex ? 'column' : 'row', gap: isComplex ? 3 : 6 }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6D28D9', flexShrink: 0 }}>
              {labelize(k)}
            </span>
            <span style={{ minWidth: 0, color: 'var(--color-text-primary)' }}>
              <ReadableValue value={v} depth={depth + 1} />
            </span>
          </div>
        )
      })}
    </div>
  )
}
