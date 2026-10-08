/**
 * 전체 기록 패키지 — 보고서(보드 전부) + 대화 전문을 한 파일로 묶는다.
 *
 * 보고서(reportGenerator)는 보드 내용을 이미 전부 담지만 대화는 건수 통계만 싣는다.
 * 팀이 설계 과정을 그대로 배포하려면 대화 전문이 필요하므로, 보고서 뒤에 대화 전문 장을 덧붙인다.
 *
 * 익명화(anonymize): 팀이 외부에 배포할 때 교사 이름이 남지 않게 한다.
 *   - 이름 수집처: 교사 메시지 발신자 이름, 역할 배분(T-3)·개인 비전 보드의 이름, 워크스페이스 멤버 표시 이름
 *   - 치환 대상: 대화 본문·발신자, 보드 내용의 모든 문자열, 워크스페이스 이름(비움), 이메일(정규식)
 *   - 치환은 긴 이름부터, 등장 순으로 "교사 A·B·C…"를 배정한다. 두 글자 미만 이름은 오탐이 커서 가리지 않는다.
 *   - 원본 데이터는 건드리지 않는다(깊은 복사 후 치환).
 */
import { marked } from 'marked'
import JSZip from 'jszip'
import { getMessages, getWorkspace } from '../lib/supabaseService.js'
import { collectReportData, generateHTML, generateMarkdown } from './reportGenerator.js'
import { getProcedureLabel, replaceInternalProcedureCodes } from '../../shared/constants.js'
import { isMoveNote } from '../../shared/procedureMove.js'
import { stripBoardKeyMentions } from '../../shared/boardKeys.js'

const PAGE_SIZE = 1000
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** 메시지 전부를 시간순으로 모은다 (getMessages는 한 페이지가 상한이라 끝까지 돈다). */
export async function fetchAllMessages(projectId) {
  const all = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await getMessages(projectId, PAGE_SIZE, offset)
    if (!Array.isArray(page) || page.length === 0) break
    all.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return all
}

/** 화면(ChatPanel)과 같은 규칙으로 저장본의 XML 마커를 걷어낸다. */
export function cleanMessageText(text) {
  return stripBoardKeyMentions(replaceInternalProcedureCodes(String(text || ''))
    .replace(/<ai_suggestion[\s\S]*?<\/ai_suggestion>/g, '')
    .replace(/<coherence_check[\s\S]*?<\/coherence_check>/g, '')
    .replace(/<procedure_advance[\s\S]*?<\/procedure_advance>/g, '')
    .replace(/<procedure_advance\b[^>]*\/?>/g, '')
    .replace(/<board_update\s+type="[^"]*">[\s\S]*?<\/board_update>/g, '')
    .replace(/<stage_advance>[\s\S]*?<\/stage_advance>/g, '')
    .replace(/<ai_suggestion[\s\S]*$/g, '')
    .replace(/<coherence_check[\s\S]*$/g, '')
    .replace(/<board_update[\s\S]*$/g, '')
    .replace(/<stage_advance[\s\S]*$/g, ''))
    .trim()
}

// ── 익명화 ──

function collectNames(data, messages, workspace) {
  const names = []
  const push = (v) => {
    const s = typeof v === 'string' ? v.trim() : ''
    if (s.length >= 2 && !names.includes(s)) names.push(s)
  }
  for (const m of messages) {
    if (m.sender_type === 'teacher' && m.sender_name && m.sender_name !== '교사') push(m.sender_name)
  }
  for (const p of data.participants || []) push(p?.name)
  const roles = data.designMap?.['T-2-1']?.content?.roles
  if (Array.isArray(roles)) for (const r of roles) push(r?.memberName || r?.['교사명'] || r?.name)
  const visions = data.designMap?.['T-1-1']?.content?.individualVisions
  if (Array.isArray(visions)) for (const v of visions) push(v?.name || v?.['교사명'])
  for (const m of workspace?.members || []) push(m?.users?.display_name || m?.display_name)
  return names
}

function buildNameMap(names) {
  const map = new Map()
  names.forEach((n, i) => {
    const letter = i < ALPHA.length ? ALPHA[i] : `${ALPHA[i % ALPHA.length]}${Math.floor(i / ALPHA.length) + 1}`
    map.set(n, `교사 ${letter}`)
  })
  return map
}

function makeScrubber(nameMap, extraStrings = []) {
  // 긴 이름부터 치환해야 "김민수"가 "김민"보다 먼저 잡힌다
  const entries = [...nameMap.entries()].sort((a, b) => b[0].length - a[0].length)
  const extras = extraStrings.filter((s) => typeof s === 'string' && s.trim().length >= 2)
  return (text) => {
    if (typeof text !== 'string' || !text) return text
    let out = text.replace(EMAIL_RE, '[이메일]')
    for (const [name, alias] of entries) out = out.split(name).join(alias)
    for (const s of extras) out = out.split(s).join('[학교]')
    return out
  }
}

function deepScrub(value, scrub) {
  if (typeof value === 'string') return scrub(value)
  if (Array.isArray(value)) return value.map((v) => deepScrub(v, scrub))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = deepScrub(v, scrub)
    return out
  }
  return value
}

/**
 * 보고서 데이터와 메시지를 익명화한 사본으로 돌려준다.
 * @returns {{ data: object, messages: object[], nameMap: Map<string,string> }}
 */
export function anonymizeRecord(data, messages, workspace) {
  const names = collectNames(data, messages, workspace)
  const nameMap = buildNameMap(names)
  const schools = (workspace?.members || []).map((m) => m?.users?.school_name).filter(Boolean)
  const scrub = makeScrubber(nameMap, schools)

  const project = { ...data.project }
  if (project.workspace) project.workspace = { ...project.workspace, name: '' }
  project.title = scrub(project.title)
  project.description = scrub(project.description)

  const designMap = {}
  for (const [code, d] of Object.entries(data.designMap || {})) {
    designMap[code] = { ...d, content: deepScrub(d?.content, scrub) }
  }
  const participants = (data.participants || []).map((p) => deepScrub(p, scrub))
  const standards = data.standards // 성취기준은 공개 자료라 그대로

  const outMessages = messages.map((m) => ({
    ...m,
    content: scrub(m.content),
    sender_name: m.sender_type === 'teacher' ? (nameMap.get(String(m.sender_name || '').trim()) || '교사') : m.sender_name,
    sender_subject: m.sender_subject, // 교과명은 익명화 대상이 아니다
  }))

  return {
    data: { ...data, project, designMap, participants, standards },
    messages: outMessages,
    nameMap,
  }
}

// ── 대화 전문 렌더링 ──

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    })
  } catch {
    return String(iso || '')
  }
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 마크다운 → HTML. 본문의 HTML 태그는 '<'만 이스케이프해 문자로 남긴다('>'는 인용문 문법이라 남긴다). */
function mdToHtml(text) {
  const cleaned = cleanMessageText(text)
  if (!cleaned) return ''
  return marked.parse(cleaned.replace(/</g, '&lt;'), { async: false, gfm: true, breaks: true })
}

function senderLabel(m) {
  if (m.sender_type === 'ai') return 'AI 공동설계자'
  if (m.sender_type === 'system') return '시스템'
  const name = m.sender_name || '교사'
  return m.sender_subject ? `${name} · ${m.sender_subject}` : name
}

function procedureOf(m) {
  return m?.stage_context || m?.procedure_context || ''
}

export const TRANSCRIPT_CSS = `
  /* ── 대화 전문 ── */
  .chat-proc { margin: 28px 0 10px; padding: 6px 10px; border-left: 3px solid #cbd5e1; background: #f8fafc; font-size: 13px; font-weight: 600; color: #475569; }
  .chat-move { margin: 14px 0; padding: 6px 12px; font-size: 12px; color: #64748b; background: #f1f5f9; border-radius: 6px; }
  .chat-msg { display: flex; flex-direction: column; margin: 10px 0; }
  .chat-msg.teacher { align-items: flex-end; }
  .chat-msg.ai, .chat-msg.system { align-items: flex-start; }
  .chat-meta { font-size: 11px; color: #9b9a97; margin: 0 4px 3px; }
  .chat-bubble { max-width: 88%; padding: 10px 16px; border-radius: 14px; font-size: 14px; line-height: 1.65; overflow-wrap: anywhere; }
  .chat-msg.teacher .chat-bubble { background: #111827; color: #fff; border-bottom-right-radius: 4px; }
  .chat-msg.ai .chat-bubble { background: #f3f4f6; color: #111827; border-bottom-left-radius: 4px; }
  .chat-msg.system .chat-bubble { background: #fffbeb; color: #78350f; font-size: 13px; }
  .chat-bubble p { margin: 0 0 8px; } .chat-bubble p:last-child { margin-bottom: 0; }
  .chat-bubble ul, .chat-bubble ol { margin: 4px 0 8px 20px; }
  .chat-bubble pre { white-space: pre-wrap; background: rgba(0,0,0,0.06); padding: 8px 10px; border-radius: 6px; font-size: 12.5px; }
  .chat-bubble code { font-size: 12.5px; }
  .chat-bubble blockquote { margin: 6px 0; padding: 2px 0 2px 10px; border-left: 3px solid #cbd5e1; color: #4b5563; }
  .chat-bubble table { border-collapse: collapse; margin: 6px 0; font-size: 13px; }
  .chat-bubble th, .chat-bubble td { border: 1px solid #d1d5db; padding: 4px 8px; vertical-align: top; }
  .chat-bubble td:first-child, .chat-bubble th:first-child { min-width: 5em; }
  .chat-msg.teacher .chat-bubble a { color: #c7d2fe; }
  .chat-attach { font-size: 11px; opacity: 0.75; margin-top: 4px; }
  .anon-note { font-size: 12px; color: #9b9a97; margin: 6px 0 0; }
  @media print { .chat-bubble { max-width: 100%; } }
`

/**
 * 대화 전문 HTML 장 (보고서 푸터 앞에 덧붙인다)
 */
export function renderTranscriptHTML(messages, { anonymized = false, nameCount = 0 } = {}) {
  let html = `<hr class="divider">
  <div class="section-title">대화 전문 <span style="font-size:14px;font-weight:400;color:#9b9a97;">${messages.length}건</span></div>`
  if (anonymized) {
    html += `<p class="anon-note">이름 가리기를 적용한 기록입니다. 교사 이름 ${nameCount}건을 "교사 A·B·C…"로 바꾸고 이메일·워크스페이스 이름을 지웠습니다.</p>`
  }
  if (messages.length === 0) {
    html += `<p style="color:#9b9a97;font-size:13px;">저장된 대화가 없습니다.</p>`
    return html
  }
  let currentProc = null
  for (const m of messages) {
    const proc = procedureOf(m)
    if (proc && proc !== currentProc) {
      currentProc = proc
      html += `<div class="chat-proc">${esc(getProcedureLabel(proc) || proc)}</div>`
    }
    if (isMoveNote(m)) {
      html += `<div class="chat-move">↪ ${esc(cleanMessageText(m.content))}</div>`
      continue
    }
    const kind = m.sender_type === 'ai' ? 'ai' : m.sender_type === 'system' ? 'system' : 'teacher'
    const body = mdToHtml(m.content)
    if (!body) continue
    html += `<div class="chat-msg ${kind}">
    <div class="chat-meta">${esc(senderLabel(m))} · ${esc(fmtTime(m.created_at))}</div>
    <div class="chat-bubble">${body}${m.attached_material_id ? '<div class="chat-attach">📎 자료 첨부</div>' : ''}</div>
  </div>`
  }
  return html
}

/**
 * 대화 전문 Markdown 장
 */
export function renderTranscriptMD(messages, { anonymized = false, nameCount = 0 } = {}) {
  let md = `---\n\n## 대화 전문 (${messages.length}건)\n\n`
  if (anonymized) {
    md += `> 이름 가리기를 적용한 기록입니다. 교사 이름 ${nameCount}건을 "교사 A·B·C…"로 바꾸고 이메일·워크스페이스 이름을 지웠습니다.\n\n`
  }
  if (messages.length === 0) return md + `저장된 대화가 없습니다.\n\n`
  let currentProc = null
  for (const m of messages) {
    const proc = procedureOf(m)
    if (proc && proc !== currentProc) {
      currentProc = proc
      md += `### ${getProcedureLabel(proc) || proc}\n\n`
    }
    if (isMoveNote(m)) {
      md += `> ↪ ${cleanMessageText(m.content).replace(/\n/g, ' ')}\n\n`
      continue
    }
    const text = cleanMessageText(m.content)
    if (!text) continue
    md += `**${senderLabel(m)}** · ${fmtTime(m.created_at)}\n\n`
    md += `${text}\n`
    if (m.attached_material_id) md += `\n📎 자료 첨부\n`
    md += `\n`
  }
  return md
}

// ── 조립 ──

/**
 * 보고서 데이터 + 메시지 전량을 읽고, 요청 시 익명화한 사본으로 바꾼다.
 * @returns {Promise<{ data: object, messages: object[], nameCount: number }|null>}
 */
async function loadRecord(projectId, anonymize) {
  let data = await collectReportData(projectId)
  if (!data) return null
  let messages = await fetchAllMessages(projectId)
  let nameCount = 0
  if (anonymize) {
    let workspace = null
    try {
      workspace = data.project.workspace_id ? await getWorkspace(data.project.workspace_id) : null
    } catch { /* 멤버 조회 실패 시 보드·대화에서 모은 이름만으로 진행 */ }
    const result = anonymizeRecord(data, messages, workspace)
    data = result.data
    messages = result.messages
    nameCount = result.nameMap.size
  }
  return { data, messages, nameCount }
}

const ANON_NOTE_CSS = `
  .anon-note { font-size: 12px; color: #9b9a97; margin: 6px 0 0; }
`
function anonNoteHTML(nameCount) {
  return `<p class="anon-note">이름 가리기를 적용한 기록입니다. 교사 이름 ${nameCount}건을 "교사 A·B·C…"로 바꾸고 이메일·워크스페이스 이름을 지웠습니다.</p>`
}
function anonNoteMD(nameCount) {
  return `> 이름 가리기를 적용한 기록입니다. 교사 이름 ${nameCount}건을 "교사 A·B·C…"로 바꾸고 이메일·워크스페이스 이름을 지웠습니다.\n\n`
}

/**
 * 보고서만 (보드 전부, 대화는 통계만). anonymize=false면 기존 보고서와 완전히 같다.
 * @returns {Promise<{ title: string, body: string }|null>}
 */
export async function generateReportDoc(projectId, { anonymize = false, format = 'html' } = {}) {
  const rec = await loadRecord(projectId, anonymize)
  if (!rec) return null
  const { data, nameCount } = rec
  const extras = anonymize
    ? (format === 'md' ? { bodyMD: `---\n\n${anonNoteMD(nameCount)}` } : { css: ANON_NOTE_CSS, bodyHTML: `<hr class="divider">${anonNoteHTML(nameCount)}` })
    : {}
  const body = format === 'md' ? generateMarkdown(data, extras) : generateHTML(data, extras)
  return { title: data.project.title, body }
}

const TRANSCRIPT_SHELL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #37352f; background: #fff; line-height: 1.7; font-size: 15px; -webkit-font-smoothing: antialiased; }
  .page { max-width: 900px; margin: 0 auto; padding: 0 96px; }
  .cover { padding: 72px 0 32px; }
  .cover-brand { font-size: 13px; color: #9b9a97; letter-spacing: 0.02em; }
  .cover h1 { font-size: 30px; font-weight: 700; line-height: 1.3; margin: 12px 0 10px; letter-spacing: -0.02em; }
  .cover-desc { color: #787774; font-size: 15px; }
  .cover-props { display: flex; flex-wrap: wrap; gap: 6px 24px; margin-top: 20px; font-size: 13px; color: #787774; }
  .prop-label { margin-right: 6px; color: #9b9a97; }
  .prop-value { font-weight: 500; color: #37352f; }
  .divider { border: 0; border-top: 1px solid #e9e9e7; margin: 28px 0; }
  .section-title { font-size: 20px; font-weight: 700; margin: 8px 0 14px; }
  .footer { margin: 56px 0 72px; padding-top: 20px; border-top: 1px solid #e9e9e7; font-size: 12px; color: #9b9a97; }
  .footer-brand { font-weight: 600; color: #37352f; }
  @media (max-width: 720px) { .page { padding: 0 20px; } .cover { padding-top: 40px; } }
  @media print { .page { padding: 0; max-width: 100%; } }
`

/**
 * 대화 기록만 (보드 없이 대화 전문). 보고서와 같은 표지·푸터 틀을 쓴다.
 * @returns {Promise<{ title: string, body: string }|null>}
 */
export async function generateTranscriptDoc(projectId, { anonymize = false, format = 'html' } = {}) {
  const rec = await loadRecord(projectId, anonymize)
  if (!rec) return null
  return renderTranscriptDoc(rec, { anonymize, format })
}

/** 이미 읽은 레코드로 대화 기록 문서를 만든다 (zip 패키지와 공유 — 두 번 읽으면 익명 글자 배정이 어긋날 수 있다). */
export function renderTranscriptDoc({ data, messages, nameCount }, { anonymize = false, format = 'html' } = {}) {
  const { project } = data
  const opts = { anonymized: anonymize, nameCount }
  const dateOpts = { year: 'numeric', month: 'long', day: 'numeric' }
  const createdDate = new Date(project.created_at).toLocaleDateString('ko-KR', dateOpts)
  const now = new Date().toLocaleDateString('ko-KR', dateOpts)
  const workspaceName = project.workspace?.name || ''

  if (format === 'md') {
    let md = `# ${project.title}\n\n`
    md += `> 커리큘럼 위버 · 융합 수업 설계 대화 기록\n\n`
    if (project.description) md += `${project.description}\n\n`
    md += `- 생성일: ${createdDate}\n- 기록 작성일: ${now}\n`
    if (workspaceName) md += `- 워크스페이스: ${workspaceName}\n`
    md += `\n`
    md += renderTranscriptMD(messages, opts)
    md += `---\n\n*커리큘럼 위버 — TADDs-DIE 기반 AI 협력 수업 설계 플랫폼*\n*대화 기록 자동 생성일: ${now}*\n`
    return { title: project.title, body: replaceInternalProcedureCodes(md) }
  }

  let html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(project.title)} — 융합 수업 설계 대화 기록</title>
<style>${TRANSCRIPT_SHELL_CSS}${TRANSCRIPT_CSS}</style>
</head>
<body>
<div class="page">
  <div class="cover">
    <div class="cover-brand">커리큘럼 위버 · 융합 수업 설계 대화 기록</div>
    <h1>${esc(project.title)}</h1>
    ${project.description ? `<p class="cover-desc">${esc(project.description)}</p>` : ''}
    <div class="cover-props">
      ${workspaceName ? `<span><span class="prop-label">워크스페이스</span><span class="prop-value">${esc(workspaceName)}</span></span>` : ''}
      <span><span class="prop-label">생성일</span><span class="prop-value">${createdDate}</span></span>
      <span><span class="prop-label">기록</span><span class="prop-value">${now}</span></span>
    </div>
  </div>
`
  html += renderTranscriptHTML(messages, opts)
  html += `
  <div class="footer">
    <p><span class="footer-brand">커리큘럼 위버</span> — TADDs-DIE 기반 AI 협력 수업 설계 플랫폼</p>
    <p style="margin-top:4px;">대화 기록 자동 생성일: ${now}</p>
  </div>
</div>
</body>
</html>`
  return { title: project.title, body: replaceInternalProcedureCodes(html) }
}

/**
 * 합본: 보고서 + 대화 전문을 한 파일로
 * @returns {Promise<{ title: string, body: string }|null>}
 */
export async function generateFullRecord(projectId, { anonymize = false, format = 'html' } = {}) {
  const rec = await loadRecord(projectId, anonymize)
  if (!rec) return null
  const { data, messages, nameCount } = rec
  const opts = { anonymized: anonymize, nameCount }
  const body = format === 'md'
    ? generateMarkdown(data, { bodyMD: renderTranscriptMD(messages, opts) })
    : generateHTML(data, { css: TRANSCRIPT_CSS, bodyHTML: renderTranscriptHTML(messages, opts) })
  return { title: data.project.title, body }
}

export function safeFilename(name) {
  return String(name || '보고서').replace(/[<>:"/\\|?*]/g, '_').slice(0, 100)
}

/**
 * 둘 다: 보고서 파일 + 대화 기록 파일을 zip 하나로. 같은 데이터를 한 번만 읽어 두 문서를 만든다.
 * @returns {Promise<{ title: string, buffer: Buffer, files: string[] }|null>}
 */
export async function generatePackageZip(projectId, { anonymize = false, format = 'html' } = {}) {
  const rec = await loadRecord(projectId, anonymize)
  if (!rec) return null
  const { data, nameCount } = rec
  const suffix = anonymize ? '_익명' : ''
  const base = safeFilename(data.project.title)

  // 보고서(익명이면 안내 한 줄 덧붙임)
  const reportExtras = anonymize
    ? (format === 'md' ? { bodyMD: `---\n\n${anonNoteMD(nameCount)}` } : { css: ANON_NOTE_CSS, bodyHTML: `<hr class="divider">${anonNoteHTML(nameCount)}` })
    : {}
  const report = format === 'md' ? generateMarkdown(data, reportExtras) : generateHTML(data, reportExtras)

  // 대화 기록 — 같은 사본으로
  const transcriptDoc = renderTranscriptDoc(rec, { anonymize, format }).body

  const zip = new JSZip()
  const files = [`${base}_보고서${suffix}.${format}`, `${base}_대화기록${suffix}.${format}`]
  zip.file(files[0], report)
  zip.file(files[1], transcriptDoc)
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  return { title: data.project.title, buffer, files }
}
