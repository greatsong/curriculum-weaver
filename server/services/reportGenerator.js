/**
 * 결과 보고서 생성 서비스
 *
 * 프로젝트의 전체 설계 데이터를 수집하여 HTML / Markdown 형식으로 변환.
 * 새로운 6-Phase, 16+1 Procedure 구조 기반.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  getProject, getDesignsByProject, getStandardsByProject,
  getMessages,
} from '../lib/supabaseService.js'
import {
  PHASES, PHASE_LIST, PROCEDURES, PROCEDURE_LIST,
  BOARD_TYPES, BOARD_TYPE_LABELS, getProceduresByPhase,
} from '../../shared/constants.js'
import { BOARD_SCHEMAS } from '../../shared/boardSchemas.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 로고 이미지를 base64로 한 번만 로드
let logoBase64 = ''
try {
  const logoPath = path.resolve(__dirname, '../../client/public/logo-192.png')
  const logoBuffer = fs.readFileSync(logoPath)
  logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`
} catch { /* 로고 파일이 없으면 무시 */ }

// Phase별 색상
const PHASE_COLORS = {
  prep: '#64748b',
  T:    '#8b5cf6',
  A:    '#3b82f6',
  Ds:   '#22c55e',
  DI:   '#f59e0b',
  E:    '#ef4444',
}

// Phase별 아이콘 (이모지)
const PHASE_ICONS = {
  prep: '📋',
  T:    '👥',
  A:    '🔍',
  Ds:   '🧭',
  DI:   '🚀',
  E:    '🔄',
}

/**
 * 프로젝트의 전체 데이터를 수집
 *
 * @param {string} projectId - 프로젝트 ID
 * @returns {Promise<object|null>} 보고서 데이터 또는 null
 */
export async function collectReportData(projectId) {
  const project = await getProject(projectId)
  if (!project) return null

  // 전체 설계 캔버스 수집
  const designs = await getDesignsByProject(projectId)

  // 절차 코드 → 설계 매핑
  const designMap = {}
  for (const d of designs) {
    designMap[d.procedure_code] = d
  }

  // 성취기준
  const standards = await getStandardsByProject(projectId)

  // 메시지 통계
  let messageStats = { total: 0, teacher: 0, ai: 0, system: 0 }
  try {
    const msgs = await getMessages(projectId, 9999, 0)
    messageStats = {
      total: msgs.length,
      teacher: msgs.filter(m => m.sender_type === 'teacher').length,
      ai: msgs.filter(m => m.sender_type === 'ai').length,
      system: msgs.filter(m => m.sender_type === 'system').length,
    }
  } catch { /* 메시지 없으면 무시 */ }

  // 참여자 추출: role_assignment 보드에서 추출 (영문/한글 키 모두 대응)
  const participants = []
  const roleDesign = designMap['T-2-1']
  if (roleDesign?.content?.roles) {
    for (const r of roleDesign.content.roles) {
      const name = r.memberName || r['교사명'] || r.name || ''
      if (name) {
        participants.push({
          name,
          subject: r.subject || r['담당 교과'] || '',
          role: r.role || r['팀 내 역할'] || '',
          strengths: r.strengths || r['강점/전문성'] || '',
        })
      }
    }
  }

  // 절차별 완료 상태 계산
  const isSimulation = project.status === 'simulation' || project.title?.startsWith('[시뮬레이션]')
  const procedureStatus = {}
  for (const proc of PROCEDURE_LIST) {
    const design = designMap[proc.code]
    if (!design) {
      procedureStatus[proc.code] = 'empty'
    } else if (design.save_status === 'confirmed') {
      procedureStatus[proc.code] = 'confirmed'
    } else if (isSimulation && design.content && Object.keys(design.content).length > 0) {
      // 시뮬레이션 프로젝트: 내용이 있으면 완료 취급
      procedureStatus[proc.code] = 'confirmed'
    } else if (design.save_status === 'draft') {
      procedureStatus[proc.code] = 'draft'
    } else {
      procedureStatus[proc.code] = 'in_progress'
    }
  }

  // 완료 절차 수
  const confirmedCount = Object.values(procedureStatus).filter(s => s === 'confirmed').length
  const totalProcedures = PROCEDURE_LIST.length

  return {
    project,
    designMap,
    standards,
    messageStats,
    participants,
    procedureStatus,
    confirmedCount,
    totalProcedures,
  }
}

/**
 * 보드 콘텐츠를 렌더링 가능한 섹션으로 변환
 *
 * @param {string} boardType - 보드 타입 코드
 * @param {object} content - 보드 콘텐츠
 * @returns {Array|null} 섹션 배열 또는 null
 */
function renderBoardContent(boardType, content) {
  if (!content || Object.keys(content).length === 0) return null
  const schema = BOARD_SCHEMAS[boardType]
  if (!schema) return null

  const sections = []
  for (const field of schema.fields) {
    const value = content[field.name]
    if (!value || (Array.isArray(value) && value.length === 0) || value === '') continue

    if (field.type === 'table' && Array.isArray(value)) {
      sections.push({
        label: field.label,
        type: 'table',
        columns: field.columns,
        rows: value,
      })
    } else if (field.type === 'list' && Array.isArray(value)) {
      // 객체 배열 (itemSchema 있음) vs 문자열 배열
      if (field.itemSchema && value.length > 0 && typeof value[0] === 'object') {
        const cols = Object.entries(field.itemSchema).map(([key, v]) => ({ name: key, label: v.label }))
        sections.push({
          label: field.label,
          type: 'table',
          columns: cols,
          rows: value,
        })
      } else {
        sections.push({ label: field.label, type: 'list', items: value })
      }
    } else if (field.type === 'tags' && Array.isArray(value)) {
      sections.push({ label: field.label, type: 'tags', items: value })
    } else if (field.type === 'json' && value) {
      // JSON 필드: 클러스터맵 형태이면 cluster, 아니면 텍스트
      const isClusterMap = typeof value === 'object' && !Array.isArray(value) &&
        Object.values(value).some(v => Array.isArray(v))
      if (isClusterMap) {
        sections.push({ label: field.label, type: 'cluster', clusters: value })
      } else {
        sections.push({ label: field.label, type: 'text', value: typeof value === 'string' ? value : JSON.stringify(value, null, 2) })
      }
    } else if (typeof value === 'string' || typeof value === 'number') {
      sections.push({ label: field.label, type: 'text', value: String(value) })
    }
  }
  return sections.length > 0 ? sections : null
}

// ════════════════════════════════════════════
// Executive Summary 자동 생성
// ════════════════════════════════════════════

/**
 * 확정된 보드 내용으로 요약문 생성
 */
function generateExecutiveSummary(data) {
  const { project, designMap, participants, confirmedCount, totalProcedures, standards } = data
  const lines = []

  // 주제
  const topicDesign = designMap['A-1-2']
  if (topicDesign?.content?.selectedTopic) {
    lines.push(`선정 주제: ${topicDesign.content.selectedTopic}`)
  }

  // 비전
  const visionDesign = designMap['T-1-1']
  if (visionDesign?.content?.commonVision) {
    lines.push(`팀 비전: ${visionDesign.content.commonVision}`)
  }

  // 통합 목표
  const objDesign = designMap['A-2-2']
  if (objDesign?.content?.integratedObjectives?.length > 0) {
    lines.push(`통합 학습목표: ${objDesign.content.integratedObjectives.length}개 설정`)
  }

  // 참여자
  if (participants.length > 0) {
    const subjects = [...new Set(participants.map(p => p.subject).filter(Boolean))]
    lines.push(`참여 교과: ${subjects.join(', ') || '미정'}`)
  }

  // 성취기준
  if (standards.length > 0) {
    lines.push(`관련 성취기준: ${standards.length}개`)
  }

  // 진행률
  lines.push(`설계 진행: ${confirmedCount}/${totalProcedures} 절차 완료`)

  return lines
}

// ════════════════════════════════════════════
// HTML 보고서 생성
// ════════════════════════════════════════════

export function generateHTML(data) {
  const { project, designMap, messageStats, participants, standards, procedureStatus, confirmedCount, totalProcedures } = data
  const createdDate = new Date(project.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
  const now = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
  const summary = generateExecutiveSummary(data)

  // 참여자 아바타 색상 팔레트
  const avatarColors = ['#8b5cf6', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16']

  // 워크스페이스 이름 (프로젝트에 포함된 경우)
  const workspaceName = project.workspace?.name || ''

  let html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(project.title)} — 융합 수업 설계 보고서</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #37352f; background: #fff;
    line-height: 1.7; font-size: 15px;
    -webkit-font-smoothing: antialiased;
  }

  .page { max-width: 900px; margin: 0 auto; padding: 0 96px; }

  /* ── 표지 ── */
  .cover { padding: 80px 0 40px; }
  .cover-top {
    display: flex; align-items: center; gap: 14px; margin-bottom: 32px;
  }
  .cover-logo { width: 52px; height: 52px; border-radius: 12px; }
  .cover-brand {
    font-size: 14px; font-weight: 500; color: #9b9a97; letter-spacing: .3px;
  }
  .cover h1 {
    font-size: 40px; font-weight: 700; line-height: 1.2;
    color: #37352f; letter-spacing: -1px; margin-bottom: 8px;
  }
  .cover-desc { font-size: 16px; color: #787774; margin-bottom: 24px; }
  .cover-props {
    display: flex; gap: 36px; flex-wrap: wrap;
    font-size: 14px; color: #9b9a97; padding-top: 12px;
    border-top: 1px solid #e3e2e0;
  }
  .cover-props .prop-label { color: #9b9a97; margin-right: 6px; }
  .cover-props .prop-value { color: #37352f; font-weight: 500; }

  /* ── 구분선 ── */
  .divider { border: none; border-top: 1px solid #e3e2e0; margin: 36px 0; }

  /* ── 섹션 제목 ── */
  .section-title {
    font-size: 24px; font-weight: 700; color: #37352f;
    margin-bottom: 20px; display: flex; align-items: center; gap: 10px;
  }

  /* ── Phase 헤더 (컬러 좌측 보더) ── */
  .phase-header {
    font-size: 22px; font-weight: 700; color: #37352f;
    margin: 40px 0 20px; padding: 14px 20px;
    border-left: 5px solid #ccc; background: #fafafa;
    border-radius: 0 8px 8px 0;
    display: flex; align-items: center; gap: 10px;
    page-break-before: auto;
  }
  .phase-badge {
    display: inline-block; padding: 3px 12px; border-radius: 4px;
    font-size: 12px; font-weight: 700; color: #fff;
  }

  /* ── Procedure 블록 ── */
  .proc-block {
    background: #fbfbfa; border: 1px solid #e3e2e0;
    border-radius: 8px; padding: 20px 24px; margin-bottom: 16px;
    page-break-inside: avoid;
  }
  .proc-header {
    font-size: 16px; font-weight: 600; color: #37352f;
    margin-bottom: 4px; display: flex; align-items: center; gap: 10px;
  }
  .proc-code {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    font-size: 11px; font-weight: 700; color: #fff;
  }
  .proc-desc {
    font-size: 13px; color: #9b9a97; margin-bottom: 14px;
  }
  .proc-status {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    font-size: 11px; font-weight: 600; margin-left: 8px;
  }
  .status-confirmed { background: #DBEDDB; color: #2D7A3A; }
  .status-draft { background: #FDECC8; color: #9A6700; }
  .status-empty { background: #f1f0ee; color: #9b9a97; }

  /* ── 참여자 ── */
  .members-grid { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
  .member-chip {
    display: flex; align-items: center; gap: 10px;
    background: #f7f6f3; border-radius: 8px; padding: 10px 16px;
  }
  .member-avatar {
    width: 32px; height: 32px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 600; font-size: 14px; flex-shrink: 0;
  }
  .member-name { font-size: 14px; font-weight: 600; color: #37352f; }
  .member-sub { font-size: 12px; color: #9b9a97; }

  /* ── 통계 ── */
  .stats-row {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px; margin-bottom: 24px;
  }
  .stat-box {
    background: #f7f6f3; border-radius: 8px; padding: 20px; text-align: center;
  }
  .stat-num { font-size: 28px; font-weight: 700; color: #37352f; line-height: 1; }
  .stat-label { font-size: 13px; color: #9b9a97; margin-top: 4px; }

  /* ── 요약 ── */
  .summary-list { list-style: none; padding: 0; margin-bottom: 24px; }
  .summary-list li {
    padding: 6px 0 6px 20px; position: relative; font-size: 14px; color: #37352f;
  }
  .summary-list li::before {
    content: '▸'; position: absolute; left: 2px; top: 6px; color: #8b5cf6; font-weight: 700;
  }

  /* ── 성취기준 ── */
  .std-item {
    display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f1f0ee;
  }
  .std-item:last-child { border-bottom: none; }
  .std-code {
    font-size: 12px; font-weight: 600; color: #6940A5;
    background: #f3f0ff; padding: 2px 8px; border-radius: 4px;
    white-space: nowrap; align-self: flex-start; margin-top: 2px;
  }
  .std-content { font-size: 14px; color: #37352f; }

  /* ── 보드 필드 ── */
  .board-section { margin-bottom: 16px; }
  .board-label {
    font-size: 13px; font-weight: 600; color: #9b9a97;
    margin-bottom: 8px; padding-left: 10px;
    border-left: 3px solid #e3e2e0;
  }
  .f-group { margin-bottom: 10px; }
  .f-label { font-size: 12px; font-weight: 600; color: #9b9a97; margin-bottom: 2px; }
  .f-value { font-size: 14px; color: #37352f; white-space: pre-wrap; }

  /* ── 테이블 (노션 스타일) ── */
  table {
    width: 100%; border-collapse: collapse;
    font-size: 14px; margin-bottom: 8px;
    border: 1px solid #e3e2e0; border-radius: 4px;
  }
  th {
    background: #f7f6f3; color: #9b9a97; font-weight: 600;
    text-align: left; padding: 8px 12px;
    border-bottom: 1px solid #e3e2e0; font-size: 12px;
  }
  td {
    padding: 8px 12px; border-bottom: 1px solid #f1f0ee;
    color: #37352f; vertical-align: top;
  }
  tr:last-child td { border-bottom: none; }

  /* ── 리스트 ── */
  .n-list { list-style: none; padding: 0; }
  .n-list li {
    padding: 4px 0 4px 20px; position: relative; font-size: 14px; color: #37352f;
  }
  .n-list li::before {
    content: '\\2022'; position: absolute; left: 4px; top: 4px;
    color: #37352f; font-weight: 700;
  }

  /* ── 태그 ── */
  .tags { display: flex; gap: 6px; flex-wrap: wrap; }
  .tag {
    display: inline-block; padding: 3px 10px; border-radius: 4px;
    font-size: 13px; font-weight: 500;
  }
  .tag-blue { background: #D3E5EF; color: #1F6AA5; }
  .tag-green { background: #DBEDDB; color: #2D7A3A; }
  .tag-purple { background: #E8DEEE; color: #6940A5; }
  .tag-pink { background: #F5E0E9; color: #AD3B6E; }
  .tag-orange { background: #FADEC9; color: #CC5E2B; }
  .tag-yellow { background: #FDECC8; color: #9A6700; }

  /* ── 점검 결과 (AI 리뷰) ── */
  .check-result {
    background: #f3f0ff; border-left: 3px solid #8b5cf6;
    padding: 10px 14px; border-radius: 0 6px 6px 0;
    font-size: 13px; color: #37352f; margin-top: 8px;
    white-space: pre-wrap;
  }
  .check-label {
    font-size: 11px; font-weight: 600; color: #8b5cf6;
    margin-bottom: 4px;
  }

  /* ── 푸터 ── */
  .footer {
    padding: 40px 0; text-align: center;
    border-top: 1px solid #e3e2e0; margin-top: 40px;
    color: #9b9a97; font-size: 13px;
  }
  .footer-logo {
    width: 24px; height: 24px; border-radius: 5px;
    vertical-align: middle; margin-right: 6px;
  }
  .footer-brand { font-weight: 600; color: #37352f; }

  @media print {
    .page { padding: 0 48px; }
    .proc-block { page-break-inside: avoid; }
    .phase-header { page-break-before: always; }
    .phase-header:first-of-type { page-break-before: auto; }
  }

  @media (max-width: 640px) {
    .page { padding: 0 20px; }
    .cover { padding: 40px 0 20px; }
    .cover h1 { font-size: 28px; }
    .cover-props { flex-direction: column; gap: 8px; }
    .stats-row { grid-template-columns: repeat(2, 1fr); }
    .members-grid { flex-direction: column; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- 표지 -->
  <div class="cover">
    <div class="cover-top">
      ${logoBase64 ? `<img src="${logoBase64}" alt="" class="cover-logo">` : ''}
      <span class="cover-brand">커리큘럼 위버 · 융합 수업 설계 보고서</span>
    </div>
    <h1>${esc(project.title)}</h1>
    ${project.description ? `<p class="cover-desc">${esc(project.description)}</p>` : ''}
    <div class="cover-props">
      ${workspaceName ? `<span><span class="prop-label">워크스페이스</span><span class="prop-value">${esc(workspaceName)}</span></span>` : ''}
      <span><span class="prop-label">생성일</span><span class="prop-value">${createdDate}</span></span>
      <span><span class="prop-label">보고서</span><span class="prop-value">${now}</span></span>
      <span><span class="prop-label">진행</span><span class="prop-value">${confirmedCount}/${totalProcedures} 절차 완료</span></span>
    </div>
  </div>
`

  // ── 참여자 ──
  if (participants.length > 0) {
    html += `<hr class="divider">
  <div class="section-title">참여 선생님</div>
  <div class="members-grid">`
    participants.forEach((p, i) => {
      const color = avatarColors[i % avatarColors.length]
      const initial = (p.name || '?')[0]
      const detail = [p.subject, p.role].filter(Boolean).join(' · ')
      html += `
    <div class="member-chip">
      <div class="member-avatar" style="background:${color};">${esc(initial)}</div>
      <div>
        <div class="member-name">${esc(p.name)}</div>
        ${detail ? `<div class="member-sub">${esc(detail)}</div>` : ''}
      </div>
    </div>`
    })
    html += `</div>`
  }

  // ── Executive Summary ──
  html += `<hr class="divider">
  <div class="section-title">요약</div>
  <div class="stats-row">
    <div class="stat-box"><div class="stat-num">${confirmedCount}</div><div class="stat-label">완료 절차</div></div>
    <div class="stat-box"><div class="stat-num">${messageStats.total}</div><div class="stat-label">전체 대화</div></div>
    <div class="stat-box"><div class="stat-num">${messageStats.teacher}</div><div class="stat-label">교사 메시지</div></div>
    <div class="stat-box"><div class="stat-num">${messageStats.ai}</div><div class="stat-label">AI 응답</div></div>
  </div>
  <ul class="summary-list">`
  for (const line of summary) {
    html += `<li>${esc(line)}</li>`
  }
  html += `</ul>`

  // ── 성취기준 ──
  if (standards.length > 0) {
    html += `<hr class="divider">
  <div class="section-title">관련 성취기준 <span style="font-size:14px;font-weight:400;color:#9b9a97;">${standards.length}개</span></div>`
    for (const s of standards) {
      const std = s.curriculum_standards || s
      const code = std.code || s.standard_id || ''
      const content = std.content || ''
      if (!code && !content) continue
      html += `<div class="std-item">
      <span class="std-code">${esc(code)}</span>
      <span class="std-content">${esc(content)}</span>
    </div>`
    }
  }

  // ── Phase별 절차 보드 ──
  for (const phase of PHASE_LIST) {
    const procedures = getProceduresByPhase(phase.id)
    const phaseColor = PHASE_COLORS[phase.id] || '#64748b'

    // 이 Phase에 내용이 있는 절차가 있는지 확인
    const hasContent = procedures.some(proc => {
      const boardType = BOARD_TYPES[proc.code]
      const design = designMap[proc.code]
      return design && renderBoardContent(boardType, design.content)
    })
    if (!hasContent) continue

    html += `
  <div class="phase-header" style="border-left-color: ${phaseColor};">
    <span>${PHASE_ICONS[phase.id] || ''}</span>
    ${esc(phase.name)}
    <span class="phase-badge" style="background:${phaseColor};">${phase.id}</span>
  </div>`

    for (const proc of procedures) {
      const boardType = BOARD_TYPES[proc.code]
      const design = designMap[proc.code]
      const sections = design ? renderBoardContent(boardType, design.content) : null

      if (!sections) continue

      const status = procedureStatus[proc.code] || 'empty'
      const statusLabel = status === 'confirmed' ? '확정' : status === 'draft' ? '초안' : ''
      const statusClass = status === 'confirmed' ? 'status-confirmed' : status === 'draft' ? 'status-draft' : 'status-empty'

      html += `
  <div class="proc-block">
    <div class="proc-header">
      <span class="proc-code" style="background:${phaseColor};">${esc(proc.code)}</span>
      ${esc(proc.name)}
      ${statusLabel ? `<span class="proc-status ${statusClass}">${statusLabel}</span>` : ''}
    </div>
    <div class="proc-desc">${esc(proc.description)}</div>`

      html += renderSectionsHTML(sections)

      // AI 점검 결과가 있으면 별도 표시 (Check 필드)
      if (design?.content) {
        const checkFields = getCheckFields(boardType, design.content)
        for (const cf of checkFields) {
          html += `<div class="check-result"><div class="check-label">AI 점검: ${esc(cf.label)}</div>${esc(cf.value)}</div>`
        }
      }

      html += `</div>`
    }
  }

  // ── 푸터 ──
  html += `
  <div class="footer">
    <p>${logoBase64 ? `<img src="${logoBase64}" alt="" class="footer-logo">` : ''}<span class="footer-brand">커리큘럼 위버</span> — TADDs-DIE 기반 AI 협력 수업 설계 플랫폼</p>
    <p style="margin-top:4px;">보고서 자동 생성일: ${now}</p>
  </div>

</div>
</body>
</html>`

  return html
}

/**
 * AI 점검 결과 필드 추출 (필드명에 Check, Alignment 등 포함)
 */
function getCheckFields(boardType, content) {
  const schema = BOARD_SCHEMAS[boardType]
  if (!schema) return []
  const results = []
  for (const field of schema.fields) {
    const isCheck = field.name.toLowerCase().includes('check') ||
                    field.name.toLowerCase().includes('alignment')
    if (isCheck && content[field.name] && typeof content[field.name] === 'string' && content[field.name].trim()) {
      results.push({ label: field.label, value: content[field.name] })
    }
  }
  return results
}

/**
 * 섹션 배열 → HTML 렌더링 (체크 필드는 별도 처리되므로 제외)
 */
function renderSectionsHTML(sections) {
  const tagClasses = ['tag-blue', 'tag-green', 'tag-purple', 'tag-pink', 'tag-orange', 'tag-yellow']
  let html = ''
  for (const sec of sections) {
    if (sec.type === 'table') {
      html += `<div class="board-section"><div class="board-label">${esc(sec.label)}</div>`
      html += `<table><thead><tr>`
      for (const col of sec.columns) {
        html += `<th>${esc(col.label)}</th>`
      }
      html += `</tr></thead><tbody>`
      for (const row of sec.rows) {
        html += `<tr>`
        for (const col of sec.columns) {
          html += `<td>${esc(String(row[col.name] || row[col.label] || row[col.key] || ''))}</td>`
        }
        html += `</tr>`
      }
      html += `</tbody></table></div>`
    } else if (sec.type === 'list') {
      html += `<div class="board-section"><div class="board-label">${esc(sec.label)}</div><ul class="n-list">`
      for (const item of sec.items) {
        html += `<li>${esc(String(item))}</li>`
      }
      html += `</ul></div>`
    } else if (sec.type === 'tags') {
      html += `<div class="board-section"><div class="board-label">${esc(sec.label)}</div><div class="tags">`
      sec.items.forEach((item, i) => {
        html += `<span class="tag ${tagClasses[i % tagClasses.length]}">${esc(String(item))}</span>`
      })
      html += `</div></div>`
    } else if (sec.type === 'cluster') {
      const clusterColors = [
        { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF', tag: '#DBEAFE' },
        { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534', tag: '#DCFCE7' },
        { bg: '#FFF7ED', border: '#FED7AA', text: '#9A3412', tag: '#FFEDD5' },
        { bg: '#FAF5FF', border: '#E9D5FF', text: '#6B21A8', tag: '#F3E8FF' },
        { bg: '#FFF1F2', border: '#FECDD3', text: '#9F1239', tag: '#FFE4E6' },
        { bg: '#F0FDFA', border: '#99F6E4', text: '#115E59', tag: '#CCFBF1' },
      ]
      html += `<div class="board-section"><div class="board-label">${esc(sec.label)}</div>`
      html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">`
      const entries = Object.entries(sec.clusters)
      entries.forEach(([name, items], idx) => {
        const c = clusterColors[idx % clusterColors.length]
        const itemList = Array.isArray(items) ? items : [String(items)]
        html += `<div style="background:${c.bg};border:1px solid ${c.border};border-radius:8px;padding:14px;">`
        html += `<div style="font-size:13px;font-weight:700;color:${c.text};margin-bottom:8px;">${esc(name)}</div>`
        html += `<div style="display:flex;flex-wrap:wrap;gap:6px;">`
        for (const item of itemList) {
          html += `<span style="font-size:12px;padding:3px 10px;border-radius:9999px;background:${c.tag};color:${c.text};">${esc(String(item))}</span>`
        }
        html += `</div></div>`
      })
      html += `</div></div>`
    } else {
      html += `<div class="f-group"><div class="f-label">${esc(sec.label)}</div><div class="f-value">${esc(sec.value)}</div></div>`
    }
  }
  return html
}

// ════════════════════════════════════════════
// Markdown 보고서 생성
// ════════════════════════════════════════════

export function generateMarkdown(data) {
  const { project, designMap, messageStats, participants, standards, procedureStatus, confirmedCount, totalProcedures } = data
  const createdDate = new Date(project.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
  const now = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
  const summary = generateExecutiveSummary(data)

  let md = `# ${project.title}\n\n`
  md += `> TADDs-DIE 협력적 수업 설계 보고서\n\n`
  if (project.description) md += `${project.description}\n\n`
  md += `- **생성일**: ${createdDate}\n`
  md += `- **보고서 생성**: ${now}\n`
  md += `- **설계 진행**: ${confirmedCount}/${totalProcedures} 절차 완료\n\n`

  // 참여자
  if (participants.length > 0) {
    md += `## 참여 선생님\n\n`
    for (const p of participants) {
      const detail = [p.subject, p.role].filter(Boolean).join(' · ')
      md += `- **${p.name}**${detail ? ` — ${detail}` : ''}\n`
    }
    md += `\n`
  }

  md += `---\n\n`

  // 요약
  md += `## 요약\n\n`
  md += `| 항목 | 수치 |\n|------|------|\n`
  md += `| 완료 절차 | ${confirmedCount}/${totalProcedures} |\n`
  md += `| 전체 대화 | ${messageStats.total} |\n`
  md += `| 교사 메시지 | ${messageStats.teacher} |\n`
  md += `| AI 응답 | ${messageStats.ai} |\n\n`

  if (summary.length > 0) {
    for (const line of summary) {
      md += `- ${line}\n`
    }
    md += `\n`
  }

  // 성취기준
  if (standards.length > 0) {
    md += `## 관련 성취기준\n\n`
    for (const s of standards) {
      const std = s.curriculum_standards || s
      const code = std.code || s.standard_id || ''
      const content = std.content || ''
      if (!code && !content) continue
      md += `- \`${code}\` ${content}\n`
    }
    md += `\n`
  }

  md += `---\n\n`

  // Phase별 절차
  for (const phase of PHASE_LIST) {
    const procedures = getProceduresByPhase(phase.id)
    const phaseIcon = PHASE_ICONS[phase.id] || ''

    const hasContent = procedures.some(proc => {
      const boardType = BOARD_TYPES[proc.code]
      const design = designMap[proc.code]
      return design && renderBoardContent(boardType, design.content)
    })
    if (!hasContent) continue

    md += `## ${phaseIcon} ${phase.name} (${phase.id})\n\n`

    for (const proc of procedures) {
      const boardType = BOARD_TYPES[proc.code]
      const design = designMap[proc.code]
      const sections = design ? renderBoardContent(boardType, design.content) : null
      if (!sections) continue

      const status = procedureStatus[proc.code] || 'empty'
      const statusTag = status === 'confirmed' ? ' [확정]' : status === 'draft' ? ' [초안]' : ''

      md += `### ${proc.code}: ${proc.name}${statusTag}\n\n`
      md += `> ${proc.description}\n\n`
      md += renderSectionsMD(sections)

      // AI 점검 결과
      if (design?.content) {
        const checkFields = getCheckFields(boardType, design.content)
        for (const cf of checkFields) {
          md += `> **AI 점검: ${cf.label}**\n>\n> ${cf.value.replace(/\n/g, '\n> ')}\n\n`
        }
      }
    }
  }

  // 푸터
  md += `---\n\n`
  md += `*커리큘럼 위버 — TADDs-DIE 기반 AI 협력 수업 설계 플랫폼*\n`
  md += `*보고서 자동 생성일: ${now}*\n`

  return md
}

function renderSectionsMD(sections) {
  let md = ''
  for (const sec of sections) {
    if (sec.type === 'table') {
      md += `**${sec.label}**\n\n`
      md += `| ${sec.columns.map(c => c.label).join(' | ')} |\n`
      md += `| ${sec.columns.map(() => '---').join(' | ')} |\n`
      for (const row of sec.rows) {
        const cells = sec.columns.map(c => {
          const val = String(row[c.name] || row[c.key] || '')
          return val.replace(/\|/g, '\\|').replace(/\n/g, ' ')
        })
        md += `| ${cells.join(' | ')} |\n`
      }
      md += `\n`
    } else if (sec.type === 'list') {
      md += `**${sec.label}**\n\n`
      for (const item of sec.items) {
        md += `- ${String(item)}\n`
      }
      md += `\n`
    } else if (sec.type === 'tags') {
      md += `**${sec.label}**: ${sec.items.map(i => `\`${i}\``).join(', ')}\n\n`
    } else {
      md += `**${sec.label}**: ${sec.value}\n\n`
    }
  }
  return md
}

// ════════════════════════════════════════════
// 유틸리티
// ════════════════════════════════════════════

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
