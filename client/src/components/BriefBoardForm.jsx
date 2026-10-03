/**
 * 약식 기록(연수 모드) 보드 양식 — 설문지처럼 빈 칸에 적고 [저장]한다.
 *
 * - 저장은 AI를 거치지 않는다. 적은 문장이 그대로 보드에 들어가고 팀원 화면에도 바로 반영된다.
 * - "저장하면 AI 조언 받기"가 켜져 있으면 저장 뒤 AI가 한두 문장으로 조언한다(필수 칸이 비면 그 칸을 짚는다).
 * - 필수(A)·선택(B) 칸을 먼저 펼치고, 나머지 칸은 "다른 칸 더 보기"로 접어 둔다.
 * 분류는 shared/briefMode.js 단일 소스를 따른다.
 */
import { useMemo, useState } from 'react'
import {
  getBriefFieldClasses,
  seedBriefForm,
  dropEmptyRows,
  buildBoardSavedText,
} from 'curriculum-weaver-shared/briefMode.js'
import BoardEditor from './BoardEditor'
import { useChatStore } from '../stores/chatStore'
import { useProcedureStore } from '../stores/procedureStore'
import { pushToast } from '../stores/toastStore'

const ADVICE_KEY = (projectId) => `cw_brief_advice_${projectId}`

function readAdvicePref(projectId) {
  try {
    return localStorage.getItem(ADVICE_KEY(projectId)) !== 'off'
  } catch {
    return true
  }
}

function writeAdvicePref(projectId, on) {
  try {
    localStorage.setItem(ADVICE_KEY(projectId), on ? 'on' : 'off')
  } catch {
    /* 저장소를 못 쓰면 이번 화면에서만 유지 */
  }
}

/**
 * @param {object} props
 * @param {string} props.projectId
 * @param {string} props.procedureCode
 * @param {object} props.schema - BOARD_SCHEMAS 항목
 * @param {object|null} props.board - 현재 보드 행
 * @param {(projectId: string, procedureCode: string, content: object) => Promise<any>} props.updateBoard
 */
export default function BriefBoardForm({ projectId, procedureCode, schema, board, updateBoard }) {
  const classes = useMemo(() => getBriefFieldClasses(procedureCode), [procedureCode])
  const [showMore, setShowMore] = useState(false)
  const [adviceOn, setAdviceOn] = useState(() => readAdvicePref(projectId))
  const [saving, setSaving] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const sendMessage = useChatStore((s) => s.sendMessage)
  // 이 절차의 보드를 서버에서 다 불러온 뒤에만 양식을 연다. 그 전에 빈 양식을 저장하면
  // 이미 적어 둔 보드를 빈 내용으로 덮어쓴다(운영 DB 점검에서 확인한 위험).
  const loadedFor = useProcedureStore((s) => s.boardsLoadedFor)
  const ready = loadedFor === procedureCode || loadedFor === '*'

  const content = board?.content
  const seeded = useMemo(() => seedBriefForm(content || schema.empty, procedureCode), [content, schema.empty, procedureCode])

  if (!classes) return null
  const aNames = classes.a.map((f) => f.name)
  const bNames = classes.b.map((f) => f.name)
  const cNames = classes.c.map((f) => f.name)
  const visible = showMore ? [...aNames, ...bNames, ...cNames] : [...aNames, ...bNames]

  const handleSave = async (draft) => {
    if (saving) return
    setSaving(true)
    try {
      await updateBoard(projectId, procedureCode, dropEmptyRows(draft, schema))
      setFormKey((k) => k + 1)
      pushToast({ kind: 'success', message: '보드에 저장했어요.', duration: 2_500 })
      if (adviceOn) {
        // 다른 AI 응답이 진행 중이면 sendMessage가 거절한다(false). 저장은 이미 끝났으니 조언만 건너뛴다.
        const sent = await Promise.resolve(sendMessage(projectId, buildBoardSavedText(procedureCode), procedureCode)).catch(() => false)
        if (sent === false) pushToast({ kind: 'info', message: 'AI가 답하는 중이라 이번 조언은 건너뛰었어요.', duration: 3_000 })
      }
    } catch (err) {
      pushToast({ kind: 'error', message: err?.message || '저장에 실패했어요. 잠시 후 다시 시도해 주세요.', duration: 6_000 })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card" data-testid="brief-board-form" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>보드 양식</span>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          오프라인 활동 결과를 칸에 적고 저장하세요. <span style={{ color: '#EF4444' }}>*</span> 표시는 필수입니다.
        </span>
      </div>
      {!ready ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)', padding: '12px 0' }}>보드를 불러오는 중입니다…</div>
      ) : (
      <BoardEditor
        // 다른 칸 펼치기는 보이는 칸만 바꾼다(다시 그리지 않아 적던 내용이 남는다). 저장 뒤에만 새로 연다.
        key={`${procedureCode}-${formKey}`}
        schema={schema}
        content={seeded}
        fieldNames={visible}
        requiredNames={aNames}
        optionalNames={bNames}
        autoSyncWhenPristine
        hideCancel
        saveLabel={saving ? '저장 중…' : '저장'}
        onSave={handleSave}
        onCancel={() => {}}
        footerExtra={(
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)', marginLeft: 'auto', cursor: 'pointer' }}>
            <input
              id={`brief-advice-${projectId}`}
              type="checkbox"
              checked={adviceOn}
              onChange={(e) => { setAdviceOn(e.target.checked); writeAdvicePref(projectId, e.target.checked) }}
              style={{ width: 14, height: 14 }}
            />
            저장하면 AI 조언 받기
          </label>
        )}
      />
      )}
      {ready && cNames.length > 0 && (
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--color-text-secondary)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
        >
          {showMore ? '다른 칸 접기 ▴' : `다른 칸 더 보기 (${classes.c.map((f) => f.label).join(', ')}) ▾`}
        </button>
      )}
    </div>
  )
}
