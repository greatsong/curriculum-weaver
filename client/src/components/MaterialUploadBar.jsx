import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import {
  MATERIAL_CATEGORIES,
  MATERIAL_PROCESSING_STATUSES,
  MAX_MATERIAL_SIZE_BYTES,
  SUPPORTED_MATERIAL_EXTENSIONS,
  MATERIAL_INTENTS,
  MATERIAL_INTENT_LABELS,
  MAX_INTENT_NOTE_LENGTH,
  DEFAULT_MATERIAL_INTENT,
} from 'curriculum-weaver-shared/constants.js'
import { useProcedureStore } from '../stores/procedureStore'
import { materialErrorMessage, validateMaterialFile } from '../lib/materialErrors'
import {
  Upload,
  Link as LinkIcon,
  ChevronDown,
  ChevronUp,
  X,
  FileText,
  Globe,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  RotateCw,
  Trash2,
  Info,
} from 'lucide-react'

const { PENDING, PARSING, ANALYZING, COMPLETED, FAILED } = MATERIAL_PROCESSING_STATUSES

/**
 * 자료 업로드 바.
 *
 * @param {object} props
 * @param {string} props.projectId — 대상 프로젝트 ID (신규, 필수)
 * @param {string} [props.sessionId] — 레거시 호환 alias (projectId가 없을 때 사용)
 */
export default function MaterialUploadBar({ projectId: projectIdProp, sessionId }) {
  const projectId = projectIdProp || sessionId

  const {
    materials,
    uploadMaterials,
    addUrlMaterial,
    reanalyzeMaterial,
    deleteMaterial,
    stopAllMaterialPolling,
  } = useProcedureStore()

  const [expanded, setExpanded] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('reference')
  const [urlInput, setUrlInput] = useState('')
  const [urlTitle, setUrlTitle] = useState('')
  const [showUrlForm, setShowUrlForm] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [banners, setBanners] = useState([]) // { id, kind: 'error'|'info', message }
  const [detailMaterialId, setDetailMaterialId] = useState(null)
  // 업로드 대기 큐 — 파일 선택 후 intent 확정까지 보관
  // { tempId, file, intent, intentNote }
  const [pendingUploads, setPendingUploads] = useState([])
  const [bulkIntent, setBulkIntent] = useState(DEFAULT_MATERIAL_INTENT)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef(null)
  const dropRef = useRef(null)

  // 언마운트 시 폴링 정리
  useEffect(() => {
    return () => {
      stopAllMaterialPolling()
    }
  }, [stopAllMaterialPolling])

  const pushBanner = useCallback((kind, message) => {
    const id = `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setBanners((prev) => [...prev, { id, kind, message }])
    // 6초 후 자동 소멸
    setTimeout(() => {
      setBanners((prev) => prev.filter((b) => b.id !== id))
    }, 6_000)
  }, [])

  const dismissBanner = (id) => setBanners((prev) => prev.filter((b) => b.id !== id))

  const categoryCount = (catId) => materials.filter((m) => m.category === catId).length

  const filteredMaterials = useMemo(
    () => materials.filter((m) => !selectedCategory || m.category === selectedCategory),
    [materials, selectedCategory],
  )

  const acceptAttr = useMemo(
    () => SUPPORTED_MATERIAL_EXTENSIONS.map((e) => `.${e}`).join(','),
    [],
  )

  /** 파일 선택 → 검증 후 pending 큐에 추가 (의도 선택을 위해 업로드는 지연). */
  const handleFiles = useCallback(
    (fileList) => {
      if (!projectId) {
        pushBanner('error', '프로젝트 정보가 준비되지 않았어요.')
        return
      }
      const files = Array.from(fileList || [])
      if (files.length === 0) return

      // 클라이언트 검증
      const validEntries = []
      for (const f of files) {
        const err = validateMaterialFile(f, {
          maxBytes: MAX_MATERIAL_SIZE_BYTES,
          allowedExts: SUPPORTED_MATERIAL_EXTENSIONS,
        })
        if (err) {
          pushBanner('error', `${f.name}: ${err.message}`)
        } else {
          const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          validEntries.push({
            tempId,
            file: f,
            intent: DEFAULT_MATERIAL_INTENT,
            intentNote: '',
          })
        }
      }
      if (validEntries.length > 0) {
        setPendingUploads((prev) => [...prev, ...validEntries])
        setExpanded(true)
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [projectId, pushBanner],
  )

  /** pending 항목 intent 변경 */
  const setPendingIntent = useCallback((tempId, intent) => {
    setPendingUploads((prev) =>
      prev.map((p) =>
        p.tempId === tempId
          ? { ...p, intent, intentNote: intent === MATERIAL_INTENTS.CUSTOM ? p.intentNote : '' }
          : p,
      ),
    )
  }, [])

  /** pending 항목 메모 변경 */
  const setPendingNote = useCallback((tempId, note) => {
    setPendingUploads((prev) =>
      prev.map((p) =>
        p.tempId === tempId
          ? { ...p, intentNote: note.slice(0, MAX_INTENT_NOTE_LENGTH) }
          : p,
      ),
    )
  }, [])

  /** 전체에 intent 일괄 적용 */
  const applyIntentToAll = useCallback(
    (intent) => {
      setBulkIntent(intent)
      setPendingUploads((prev) =>
        prev.map((p) => ({
          ...p,
          intent,
          intentNote: intent === MATERIAL_INTENTS.CUSTOM ? p.intentNote : '',
        })),
      )
    },
    [],
  )

  /** pending 항목 제거 */
  const removePending = useCallback((tempId) => {
    setPendingUploads((prev) => prev.filter((p) => p.tempId !== tempId))
  }, [])

  /** custom인데 메모 공란인 항목 있으면 true */
  const hasInvalidPending = useMemo(
    () =>
      pendingUploads.some(
        (p) => p.intent === MATERIAL_INTENTS.CUSTOM && !p.intentNote.trim(),
      ),
    [pendingUploads],
  )

  /** "업로드" 버튼 확정 — pending 전체를 intent와 함께 전송 */
  const handleConfirmUpload = useCallback(async () => {
    if (pendingUploads.length === 0) return
    if (hasInvalidPending) {
      pushBanner('error', '메모를 입력해주세요. (기타 — 메모 입력 선택 시 필수)')
      return
    }
    setIsUploading(true)
    const items = pendingUploads.map((p) => ({
      file: p.file,
      intent: p.intent,
      intentNote: p.intent === MATERIAL_INTENTS.CUSTOM ? p.intentNote.trim() : null,
      category: selectedCategory,
    }))
    try {
      const results = await uploadMaterials(projectId, items)
      for (const r of results) {
        if (r.status === 'rejected') {
          const msg = materialErrorMessage(r.reason, '업로드에 실패했어요.')
          pushBanner('error', `${r.file?.name || '파일'}: ${msg}`)
        }
      }
      setPendingUploads([])
    } catch (err) {
      pushBanner('error', materialErrorMessage(err))
    } finally {
      setIsUploading(false)
    }
  }, [
    pendingUploads,
    hasInvalidPending,
    projectId,
    selectedCategory,
    uploadMaterials,
    pushBanner,
  ])

  const handleFileInputChange = (e) => {
    handleFiles(e.target.files)
  }

  // 드래그&드롭
  const onDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!dragOver) setDragOver(true)
  }
  const onDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    // 드롭존 외부로 나간 경우에만 해제
    if (dropRef.current && !dropRef.current.contains(e.relatedTarget)) {
      setDragOver(false)
    } else if (!e.relatedTarget) {
      setDragOver(false)
    }
  }
  const onDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const files = e.dataTransfer?.files
    if (files && files.length > 0) handleFiles(files)
  }

  // 키보드 접근 (드롭존을 버튼처럼 활성화 → 파일 선택창 열기)
  const onDropZoneKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fileInputRef.current?.click()
    }
  }

  const handleUrlSubmit = async (e) => {
    e.preventDefault()
    const url = urlInput.trim()
    if (!url) return
    // URL 형식 가드
    try {
      // eslint-disable-next-line no-new
      new URL(url)
    } catch {
      pushBanner('error', 'URL 형식이 올바르지 않아요. (예: https://...)')
      return
    }
    try {
      await addUrlMaterial(projectId, url, selectedCategory, urlTitle.trim())
      setUrlInput('')
      setUrlTitle('')
      setShowUrlForm(false)
    } catch (err) {
      pushBanner('error', materialErrorMessage(err, 'URL 추가에 실패했어요.'))
    }
  }

  const handleReanalyze = async (id) => {
    try {
      await reanalyzeMaterial(id)
    } catch (err) {
      pushBanner('error', materialErrorMessage(err, '재분석에 실패했어요.'))
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteMaterial(id)
    } catch (err) {
      pushBanner('error', materialErrorMessage(err, '삭제에 실패했어요.'))
    }
  }

  const detailMaterial = useMemo(
    () => (detailMaterialId ? materials.find((m) => m.id === detailMaterialId) : null),
    [detailMaterialId, materials],
  )

  return (
    <div className="bg-white border-b border-gray-200 shrink-0">
      {/* 접힌 상태: 한 줄 요약 */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 text-sm hover:bg-gray-50 transition"
      >
        <Upload size={14} className="text-gray-500 shrink-0" />
        <span className="text-gray-600 truncate">
          자료 관리
          {materials.length > 0 && (
            <span className="text-gray-400 ml-1">({materials.length}개)</span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <div className="hidden sm:flex items-center gap-1">
            {MATERIAL_CATEGORIES.map((cat) => {
              const count = categoryCount(cat.id)
              if (count === 0) return null
              return (
                <span
                  key={cat.id}
                  className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500"
                >
                  {cat.label} {count}
                </span>
              )
            })}
          </div>
          {expanded ? (
            <ChevronUp size={14} className="text-gray-400" />
          ) : (
            <ChevronDown size={14} className="text-gray-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-3 sm:px-4 pb-3 space-y-3">
          {/* 인라인 배너 (에러/정보) */}
          {banners.length > 0 && (
            <div className="space-y-1" aria-live="polite">
              {banners.map((b) => (
                <div
                  key={b.id}
                  className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs border ${
                    b.kind === 'error'
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : 'bg-blue-50 border-blue-200 text-blue-700'
                  }`}
                >
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span className="flex-1 break-words">{b.message}</span>
                  <button
                    type="button"
                    onClick={() => dismissBanner(b.id)}
                    className="shrink-0 opacity-60 hover:opacity-100"
                    aria-label="알림 닫기"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 카테고리 칩 */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {MATERIAL_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition ${
                  selectedCategory === cat.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat.label}
                {categoryCount(cat.id) > 0 && (
                  <span className="ml-1 opacity-75">({categoryCount(cat.id)})</span>
                )}
              </button>
            ))}
          </div>

          {/* 드래그&드롭 존 + 업로드 버튼 */}
          <div
            ref={dropRef}
            role="button"
            tabIndex={0}
            aria-label="파일을 드롭하거나 Enter를 눌러 선택하세요"
            onDragOver={onDragOver}
            onDragEnter={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onKeyDown={onDropZoneKeyDown}
            onClick={() => fileInputRef.current?.click()}
            className={`relative rounded-lg border-2 border-dashed p-3 sm:p-4 text-center cursor-pointer transition ${
              dragOver
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept={acceptAttr}
              onChange={handleFileInputChange}
              aria-label="수업 자료 파일 업로드"
            />
            <div className="flex flex-col items-center gap-1.5">
              <Upload size={18} className="text-gray-400" />
              <div className="text-xs text-gray-600">
                <span className="font-medium text-blue-600">파일 선택</span>
                <span className="text-gray-500"> 또는 여기에 끌어다 놓기</span>
              </div>
              <div className="text-[11px] text-gray-400">
                {SUPPORTED_MATERIAL_EXTENSIONS.join(', ').toUpperCase()} · 최대{' '}
                {Math.round(MAX_MATERIAL_SIZE_BYTES / 1024 / 1024)}MB
              </div>
            </div>
          </div>

          {/* 업로드 대기 (pending) — intent 선택 UI */}
          {pendingUploads.length > 0 && (
            <PendingUploadsPanel
              items={pendingUploads}
              bulkIntent={bulkIntent}
              isUploading={isUploading}
              hasInvalid={hasInvalidPending}
              onChangeIntent={setPendingIntent}
              onChangeNote={setPendingNote}
              onApplyAll={applyIntentToAll}
              onRemove={removePending}
              onConfirm={handleConfirmUpload}
              onCancelAll={() => setPendingUploads([])}
            />
          )}

          {/* URL 버튼 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowUrlForm(!showUrlForm)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-green-50 text-green-700 hover:bg-green-100 rounded-lg transition"
            >
              <LinkIcon size={14} />
              URL 추가
            </button>
          </div>

          {showUrlForm && (
            <form onSubmit={handleUrlSubmit} className="flex flex-col sm:flex-row gap-2">
              <input
                value={urlTitle}
                onChange={(e) => setUrlTitle(e.target.value)}
                placeholder="제목 (선택)"
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 sm:w-36"
              />
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://..."
                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                type="submit"
                disabled={!urlInput.trim()}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
              >
                추가
              </button>
            </form>
          )}

          {/* 업로드된 자료 목록 */}
          {filteredMaterials.length > 0 && (
            <ul
              className="space-y-1.5 max-h-64 overflow-y-auto"
              aria-live="polite"
              aria-label="업로드된 자료 목록"
            >
              {filteredMaterials.map((m) => (
                <MaterialRow
                  key={m.id}
                  material={m}
                  onReanalyze={handleReanalyze}
                  onDelete={handleDelete}
                  onOpenDetail={setDetailMaterialId}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {detailMaterial && (
        <MaterialDetailModal
          material={detailMaterial}
          onClose={() => setDetailMaterialId(null)}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────
// Subcomponent: 업로드 대기 패널 (intent 선택)
// ────────────────────────────────────────
function PendingUploadsPanel({
  items,
  bulkIntent,
  isUploading,
  hasInvalid,
  onChangeIntent,
  onChangeNote,
  onApplyAll,
  onRemove,
  onConfirm,
  onCancelAll,
}) {
  return (
    <section
      className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2"
      aria-label="업로드 대기 자료 의도 선택"
    >
      {/* 헤더 + 일괄 적용 + 업로드/취소 버튼 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-xs font-semibold text-blue-900">
          업로드 대기 ({items.length})
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <label className="text-[11px] text-gray-600" htmlFor="bulk-intent-select">
            일괄 적용:
          </label>
          <select
            id="bulk-intent-select"
            value={bulkIntent}
            onChange={(e) => onApplyAll(e.target.value)}
            aria-label="모든 자료에 의도 일괄 적용"
            className="text-xs px-2 py-1 border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {Object.entries(MATERIAL_INTENT_LABELS).map(([id, meta]) => (
              <option key={id} value={id}>
                {meta.icon} {meta.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onCancelAll}
            disabled={isUploading}
            className="text-xs px-2.5 py-1 rounded bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            전체 취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isUploading || hasInvalid}
            className="text-xs px-3 py-1 rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title={hasInvalid ? '메모가 비어 있는 항목이 있습니다' : '업로드 시작'}
          >
            {isUploading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" /> 업로드 중
              </span>
            ) : (
              `업로드 (${items.length})`
            )}
          </button>
        </div>
      </div>

      {hasInvalid && (
        <div className="flex items-start gap-1.5 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>"기타 — 메모 입력"을 선택한 파일은 메모를 입력해야 업로드할 수 있어요.</span>
        </div>
      )}

      {/* 파일 행 */}
      <ul className="space-y-1.5">
        {items.map((p) => (
          <PendingUploadRow
            key={p.tempId}
            item={p}
            disabled={isUploading}
            onChangeIntent={onChangeIntent}
            onChangeNote={onChangeNote}
            onRemove={onRemove}
          />
        ))}
      </ul>
    </section>
  )
}

function PendingUploadRow({ item: p, disabled, onChangeIntent, onChangeNote, onRemove }) {
  const isCustom = p.intent === MATERIAL_INTENTS.CUSTOM
  const noteError = isCustom && !p.intentNote.trim()
  const noteId = `note-${p.tempId}`
  const noteHintId = `${noteId}-hint`
  const noteLen = p.intentNote.length

  return (
    <li className="bg-white border border-gray-200 rounded-lg px-2.5 py-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <FileText size={12} className="text-blue-500 shrink-0" />
        <span className="truncate flex-1 text-xs text-gray-800" title={p.file.name}>
          {p.file.name}
        </span>
        <span className="text-[11px] text-gray-400 shrink-0">
          {(p.file.size / 1024).toFixed(0)}KB
        </span>
        <select
          value={p.intent}
          onChange={(e) => onChangeIntent(p.tempId, e.target.value)}
          disabled={disabled}
          aria-label={`${p.file.name}의 업로드 의도`}
          className="text-[11px] px-1.5 py-1 border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-[180px]"
        >
          {Object.entries(MATERIAL_INTENT_LABELS).map(([id, meta]) => (
            <option key={id} value={id}>
              {meta.icon} {meta.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onRemove(p.tempId)}
          disabled={disabled}
          className="p-1 text-gray-400 hover:text-red-600 rounded disabled:opacity-40"
          aria-label={`${p.file.name} 제거`}
          title="제거"
        >
          <X size={12} />
        </button>
      </div>

      {/* custom 메모 입력 */}
      {isCustom && (
        <div className="pl-4 space-y-1">
          <textarea
            id={noteId}
            value={p.intentNote}
            onChange={(e) => onChangeNote(p.tempId, e.target.value)}
            maxLength={MAX_INTENT_NOTE_LENGTH}
            rows={2}
            disabled={disabled}
            aria-describedby={noteHintId}
            aria-invalid={noteError || undefined}
            placeholder="이 자료에서 AI가 무엇을 읽어내야 하는지 간단히 적어주세요. (예: 3학년 1반 학생 프로파일, 토론 수업 활동지 등)"
            className={`w-full text-[11px] px-2 py-1.5 border rounded bg-white focus:outline-none focus:ring-2 resize-none ${
              noteError
                ? 'border-red-300 focus:ring-red-400'
                : 'border-gray-300 focus:ring-blue-400'
            }`}
          />
          <div
            id={noteHintId}
            className={`flex items-center justify-between text-[10px] ${
              noteError ? 'text-red-600' : 'text-gray-400'
            }`}
          >
            <span>
              {noteError ? '메모를 입력해주세요.' : `최대 ${MAX_INTENT_NOTE_LENGTH}자까지 입력할 수 있습니다.`}
            </span>
            <span aria-live="polite">
              {noteLen} / {MAX_INTENT_NOTE_LENGTH}
            </span>
          </div>
        </div>
      )}

      {/* intent 설명 (custom이 아닐 때만 간단 노출) */}
      {!isCustom && (
        <div className="pl-4 text-[10px] text-gray-500">
          {MATERIAL_INTENT_LABELS[p.intent]?.description}
        </div>
      )}
    </li>
  )
}

// ────────────────────────────────────────
// Subcomponent: 자료 1행
// ────────────────────────────────────────
function MaterialRow({ material: m, onReanalyze, onDelete, onOpenDetail }) {
  const isUrl = m.file_type === 'url'
  const isUploading = m._uploading
  const status = m.processing_status

  return (
    <li className="flex flex-col gap-1 px-2 py-1.5 bg-gray-50 rounded-lg text-xs text-gray-700">
      <div className="flex items-center gap-2">
        {isUrl ? (
          <Globe size={12} className="text-green-500 shrink-0" />
        ) : (
          <FileText size={12} className="text-blue-500 shrink-0" />
        )}
        <span className="truncate flex-1" title={m.file_name}>
          {m.file_name}
        </span>
        {m.file_size > 0 && (
          <span className="text-gray-400 shrink-0 text-[11px]">
            {(m.file_size / 1024).toFixed(0)}KB
          </span>
        )}
        <StatusBadge status={isUploading ? 'uploading' : status} />
        {/* 액션 버튼들 */}
        {status === FAILED && !isUploading && (
          <button
            type="button"
            onClick={() => onReanalyze(m.id)}
            className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-orange-700 bg-orange-50 hover:bg-orange-100 rounded"
            aria-label="재분석"
            title="재분석"
          >
            <RotateCw size={10} />
            재분석
          </button>
        )}
        {status === COMPLETED && m.ai_analysis && (
          <button
            type="button"
            onClick={() => onOpenDetail(m.id)}
            className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-blue-700 bg-blue-50 hover:bg-blue-100 rounded"
            aria-label="분석 결과 상세 보기"
            title="분석 결과 상세 보기"
          >
            <Info size={10} />
            상세
          </button>
        )}
        {!isUploading && (
          <button
            type="button"
            onClick={() => onDelete(m.id)}
            className="shrink-0 p-1 text-gray-400 hover:text-red-600 rounded"
            aria-label="자료 삭제"
            title="삭제"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {/* 진행률 바 (업로드 중) */}
      {isUploading && (
        <div className="w-full h-1.5 bg-gray-200 rounded overflow-hidden" aria-hidden="true">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${m._progress ?? 0}%` }}
          />
        </div>
      )}

      {/* 요약 미리보기 */}
      {status === COMPLETED && m.ai_analysis?.summary && (
        <div className="text-[11px] text-gray-500 pl-4 line-clamp-1">
          {m.ai_analysis.summary}
        </div>
      )}

      {/* 실패 사유 */}
      {status === FAILED && m._error && (
        <div className="text-[11px] text-red-600 pl-4">{m._error}</div>
      )}
    </li>
  )
}

// ────────────────────────────────────────
// Subcomponent: 상태 뱃지
// ────────────────────────────────────────
function StatusBadge({ status }) {
  if (!status) return null
  const map = {
    uploading: {
      label: '업로드 중',
      className: 'bg-blue-50 text-blue-700',
      icon: <Loader2 size={10} className="animate-spin" />,
    },
    [PENDING]: {
      label: '대기',
      className: 'bg-gray-100 text-gray-600',
      icon: <Clock size={10} />,
    },
    [PARSING]: {
      label: '파싱 중',
      className: 'bg-blue-50 text-blue-700',
      icon: <Loader2 size={10} className="animate-spin" />,
    },
    [ANALYZING]: {
      label: 'AI 분석',
      className: 'bg-purple-50 text-purple-700',
      icon: <Sparkles size={10} />,
    },
    [COMPLETED]: {
      label: '완료',
      className: 'bg-green-50 text-green-700',
      icon: <CheckCircle2 size={10} />,
    },
    [FAILED]: {
      label: '실패',
      className: 'bg-red-50 text-red-700',
      icon: <AlertCircle size={10} />,
    },
  }
  const entry = map[status]
  if (!entry) return null
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${entry.className}`}
    >
      {entry.icon}
      {entry.label}
    </span>
  )
}

// ────────────────────────────────────────
// Subcomponent: 분석 결과 상세 모달
// ────────────────────────────────────────
function MaterialDetailModal({ material, onClose }) {
  const analysis = material.ai_analysis || {}
  const validated = analysis.validated_connections || []
  const insights = analysis.key_insights || []
  const suggestions = analysis.design_suggestions || []
  const keywords = analysis.extracted_keywords || []

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="자료 분석 결과"
      >
        <div className="sticky top-0 flex items-center justify-between px-5 py-3 border-b bg-white">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {material.file_name}
            </h3>
            {analysis.material_type && (
              <p className="text-xs text-gray-500">{analysis.material_type}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-700 rounded"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          {analysis.summary && (
            <section>
              <h4 className="text-xs font-semibold text-gray-500 mb-1">요약</h4>
              <p className="text-gray-800 whitespace-pre-wrap">{analysis.summary}</p>
            </section>
          )}

          {validated.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-gray-500 mb-2">
                연결된 성취기준 ({validated.length})
              </h4>
              <ul className="space-y-1.5">
                {validated.map((c, i) => (
                  <li
                    key={`${c.code}-${i}`}
                    className="flex flex-col gap-0.5 p-2 bg-blue-50 border border-blue-100 rounded"
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-block px-1.5 py-0.5 text-[11px] font-mono bg-white border border-blue-200 rounded text-blue-700">
                        {c.code}
                      </span>
                      {typeof c.confidence === 'number' && (
                        <span className="text-[11px] text-gray-500">
                          신뢰도 {Math.round(c.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    {c.content && (
                      <p className="text-xs text-gray-700 line-clamp-2">{c.content}</p>
                    )}
                    {c.reason && (
                      <p className="text-[11px] text-gray-500 italic">{c.reason}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {insights.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-gray-500 mb-1">핵심 인사이트</h4>
              <ul className="list-disc list-inside space-y-0.5 text-gray-800">
                {insights.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </section>
          )}

          {suggestions.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-gray-500 mb-1">설계 제안</h4>
              <ul className="list-disc list-inside space-y-0.5 text-gray-800">
                {suggestions.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </section>
          )}

          {keywords.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold text-gray-500 mb-1">추출 키워드</h4>
              <div className="flex flex-wrap gap-1">
                {keywords.map((k, i) => (
                  <span
                    key={`${k}-${i}`}
                    className="px-1.5 py-0.5 text-[11px] bg-gray-100 text-gray-700 rounded"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
