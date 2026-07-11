// 절차별 현행 노출 문구 인벤토리 추출 — 레벨 A(설명·안내만 교체) 기준
// 출력: docs/절차-문구-대조표.md (항목마다 안정적 ID 부여 → 새 문구 매핑용)
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { PROCEDURES, PROCEDURE_LIST, PHASES, BOARD_TYPES } = await import(path.join(ROOT, 'shared/constants.js'))
const { PROCEDURE_STEPS } = await import(path.join(ROOT, 'shared/procedureSteps.js'))
const { BOARD_SCHEMAS } = await import(path.join(ROOT, 'shared/boardSchemas.js'))
const { PROCEDURE_GUIDE } = await import(path.join(ROOT, 'server/data/procedureGuide.js'))

const L = []
const p = (s = '') => L.push(s)

p('# 절차별 현행 문구 대조표 (레벨 A — 설명·세부 안내 교체용)')
p('')
p(`> 생성: ${new Date().toISOString().slice(0, 10)}, \`scripts/extract-procedure-texts.mjs\` (정의 파일 4개에서 자동 추출).`)
p('> 각 항목의 `ID`는 코드 반영 시 위치를 특정하는 열쇠다. **절차 이름(name)은 바뀌지 않음이 확정**되어 참고용으로만 표기.')
p('> 새 문구가 준비되면 이 문서의 항목 ID 기준으로 "현행 → 신규" 매핑을 만들어 4개 정의 파일에 반영한다.')
p('>')
p('> | 출처 파일 | 항목 접두어 |')
p('> |------|------|')
p('> | `shared/constants.js` | `desc` |')
p('> | `shared/procedureSteps.js` | `step.N.*` |')
p('> | `server/data/procedureGuide.js` | `guide.*` |')
p('> | `shared/boardSchemas.js` | `board.*` |')
p('')

let itemCount = 0
const item = (id, text) => {
  if (text === null || text === undefined || text === '') return
  itemCount++
  p(`- \`${id}\` — ${String(text).replace(/\n/g, ' / ')}`)
}

for (const proc of PROCEDURE_LIST) {
  const { code, name, description, phase, displayCode } = proc
  const disp = displayCode || '(코드 없음)'
  p(`---`)
  p('')
  p(`## ${disp} ${name}  \`${code}\` (Phase: ${PHASES[phase.toUpperCase?.()]?.name || phase})`)
  p('')

  p(`### 한 줄 설명 (constants.js)`)
  item(`${code}.desc`, description)
  p('')

  const steps = PROCEDURE_STEPS[code] || []
  if (steps.length) {
    p(`### 스텝 문구 (procedureSteps.js — ${steps.length}스텝, 구조 메타는 변경 대상 아님)`)
    for (const s of steps) {
      item(`${code}.step.${s.stepNumber}.title`, s.title)
      item(`${code}.step.${s.stepNumber}.desc`, s.description)
    }
    p('')
  }

  const g = PROCEDURE_GUIDE[code]
  if (g) {
    p(`### 상세 가이드 (procedureGuide.js — AI 프롬프트·절차 소개에 주입)`)
    item(`${code}.guide.coreQuestion`, g.coreQuestion)
    item(`${code}.guide.concept`, g.concept)
    ;(g.methods || []).forEach((m, i) => item(`${code}.guide.methods.${i + 1}`, m))
    item(`${code}.guide.deliverable`, g.deliverable)
    if (g.aiRole) for (const [k, v] of Object.entries(g.aiRole)) item(`${code}.guide.aiRole.${k}`, v)
    if (g.coherenceCheck) {
      item(`${code}.guide.coherence.desc`, g.coherenceCheck.description)
      item(`${code}.guide.coherence.checkAgainst(관계-참고)`, (g.coherenceCheck.checkAgainst || []).join(', '))
    }
    item(`${code}.guide.notes`, g.notes)
    ;(g.reflectionQuestions || []).forEach((q, i) => item(`${code}.guide.reflection.${i + 1}`, q))
    ;(g.activityFlow || []).forEach((f) => {
      item(`${code}.guide.flow.${f.step}.title`, f.title)
      item(`${code}.guide.flow.${f.step}.desc`, f.description)
      if (f.aiPrompt) item(`${code}.guide.flow.${f.step}.aiPrompt(예시)`, f.aiPrompt)
    })
    if (g.exampleCase) {
      item(`${code}.guide.example.title`, g.exampleCase.title)
      item(`${code}.guide.example.content`, g.exampleCase.content)
    }
    p('')
  }

  const boardType = BOARD_TYPES[code]
  const schema = boardType && BOARD_SCHEMAS[boardType]
  if (schema) {
    p(`### 보드 필드 문구 (boardSchemas.js — 보드타입 \`${boardType}\`, 필드 키는 변경 대상 아님)`)
    for (const f of schema.fields || []) {
      item(`${code}.board.${f.name}.label`, f.label)
      item(`${code}.board.${f.name}.desc`, f.description)
      if (f.columns) for (const c of f.columns) {
        item(`${code}.board.${f.name}.col.${c.name || c.key}.label`, c.label)
      }
    }
    p('')
  }
}

p('---')
p('')
p(`_총 문구 항목: ${itemCount}개 / 절차 ${PROCEDURE_LIST.length}개_`)

writeFileSync(path.join(ROOT, 'docs/절차-문구-대조표.md'), L.join('\n'), 'utf8')
console.log(`완료 — ${itemCount}개 항목, ${L.length}줄`)
