/**
 * 결과 보고서 생성 서비스
 * 세션의 전체 설계 데이터를 수집하여 HTML / Markdown 형식으로 변환
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Sessions, Boards, Messages, SessionStandards, Principles, Materials } from '../lib/store.js'
import { STAGES, PHASES, BOARD_TYPES, BOARD_TYPE_LABELS } from '../../shared/constants.js'
import { BOARD_SCHEMAS } from '../../shared/boardSchemas.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 로고 이미지를 base64로 한 번만 로드
let logoBase64 = ''
try {
  const logoPath = path.resolve(__dirname, '../../client/public/logo-192.png')
  const logoBuffer = fs.readFileSync(logoPath)
  logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`
} catch { /* 로고 파일이 없으면 무시 */ }

/**
 * 세션의 전체 데이터를 수집
 */
export function collectReportData(sessionId) {
  const session = Sessions.get(sessionId)
  if (!session) return null

  // 전체 단계 보드 수집
  const allBoards = {}
  for (let stage = 1; stage <= 10; stage++) {
    allBoards[stage] = Boards.listByStage(sessionId, stage)
  }

  // 메시지 통계
  const msgs = Messages.list(sessionId)
  const messageStats = {
    total: msgs.length,
    teacher: msgs.filter((m) => m.sender_type === 'teacher').length,
    ai: msgs.filter((m) => m.sender_type === 'ai').length,
    system: msgs.filter((m) => m.sender_type === 'system').length,
  }

  // 사용된 원칙 집계
  const principleUsage = {}
  for (const msg of msgs) {
    if (msg.principles_used) {
      for (const pid of msg.principles_used) {
        principleUsage[pid] = (principleUsage[pid] || 0) + 1
      }
    }
  }

  // 참여자 수집: 메시지의 sender_name + team_roles 보드에서 추출
  const participantMap = new Map()
  for (const msg of msgs) {
    if (msg.sender_type === 'teacher' && msg.sender_name) {
      const key = msg.sender_name
      if (!participantMap.has(key)) {
        participantMap.set(key, { name: msg.sender_name, subject: msg.sender_subject || '' })
      }
    }
  }
  // team_roles 보드에서도 추가 (더 상세한 정보)
  const teamRolesBoards = allBoards[2] || []
  for (const board of teamRolesBoards) {
    if (board.board_type === 'team_roles' && board.content?.members) {
      for (const m of board.content.members) {
        if (m.name) {
          participantMap.set(m.name, {
            name: m.name,
            subject: m.subject || '',
            role: m.role || '',
            strength: m.strength || '',
          })
        }
      }
    }
  }
  const participants = [...participantMap.values()]

  // 성취기준
  const standards = SessionStandards.list(sessionId)

  // 자료
  const materials = Materials.list(sessionId)

  // 원칙 전체 목록
  const allPrinciples = Principles.list()

  return {
    session,
    allBoards,
    messageStats,
    principleUsage,
    participants,
    standards,
    materials,
    allPrinciples,
  }
}

/**
 * 보드 콘텐츠를 읽기 쉬운 텍스트로 변환
 */
function renderBoardContent(boardType, content) {
  if (!content || Object.keys(content).length === 0) return null
  const schema = BOARD_SCHEMAS[boardType]
  if (!schema) return null

  const sections = []
  for (const field of schema.fields) {
    const value = content[field.key]
    if (!value || (Array.isArray(value) && value.length === 0) || value === '') continue

    if (field.type === 'table' && Array.isArray(value)) {
      sections.push({ label: field.label, type: 'table', columns: field.columns, rows: value })
    } else if (field.type === 'list' && Array.isArray(value)) {
      sections.push({ label: field.label, type: 'list', items: value })
    } else if (field.type === 'tags' && Array.isArray(value)) {
      sections.push({ label: field.label, type: 'tags', items: value })
    } else {
      sections.push({ label: field.label, type: 'text', value: String(value) })
    }
  }
  return sections.length > 0 ? sections : null
}

// ────────────── HTML 보고서 ──────────────

export function generateHTML(data) {
  const { session, allBoards, messageStats, principleUsage, participants, standards, allPrinciples } = data
  const createdDate = new Date(session.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
  const now = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

  const topPrinciples = Object.entries(principleUsage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pid, count]) => {
      const p = allPrinciples.find((pr) => pr.id === pid)
      return p ? { id: pid, name: p.name, count } : null
    })
    .filter(Boolean)

  // 참여자 아바타 색상 팔레트
  const avatarColors = ['#E8856C', '#D9A348', '#5BA07B', '#5B93C5', '#9B7FBD', '#C77BA2', '#6AADAD', '#B5855A']

  let html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(session.title)} — 융합 수업 설계 보고서</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Noto Sans KR', -apple-system, sans-serif;
    color: #37352f; background: #fff;
    line-height: 1.7; font-size: 15px;
    -webkit-font-smoothing: antialiased;
  }

  .page { max-width: 900px; margin: 0 auto; padding: 0 96px; }

  /* ── 표지 헤더 ── */
  .cover { padding: 80px 0 40px; }
  .cover-top {
    display: flex; align-items: center; gap: 14px; margin-bottom: 32px;
  }
  .cover-logo {
    width: 52px; height: 52px; border-radius: 12px;
  }
  .cover-brand {
    font-size: 14px; font-weight: 500; color: #9b9a97;
    letter-spacing: .3px;
  }
  .cover h1 {
    font-size: 40px; font-weight: 700; line-height: 1.2;
    color: #37352f; letter-spacing: -1px; margin-bottom: 8px;
  }
  .cover-desc {
    font-size: 16px; color: #787774; margin-bottom: 24px;
  }
  .cover-props {
    display: flex; gap: 36px; flex-wrap: wrap;
    font-size: 14px; color: #9b9a97; padding-top: 12px;
    border-top: 1px solid #e3e2e0;
  }
  .cover-props .prop-label { color: #9b9a97; margin-right: 6px; }
  .cover-props .prop-value { color: #37352f; font-weight: 500; }

  /* ── 구분선 ── */
  .divider {
    border: none; border-top: 1px solid #e3e2e0;
    margin: 36px 0;
  }

  /* ── 섹션 제목 ── */
  .section-title {
    font-size: 24px; font-weight: 700; color: #37352f;
    margin-bottom: 20px; display: flex; align-items: center; gap: 10px;
  }
  .section-title .emoji { font-size: 24px; }

  /* ── 참여자 ── */
  .members-grid {
    display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 8px;
  }
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
    background: #f7f6f3; border-radius: 8px;
    padding: 20px; text-align: center;
  }
  .stat-num {
    font-size: 28px; font-weight: 700; color: #37352f; line-height: 1;
  }
  .stat-label {
    font-size: 13px; color: #9b9a97; margin-top: 4px;
  }

  /* ── 원칙 목록 ── */
  .principle-row {
    display: flex; align-items: center; gap: 10px;
    padding: 6px 0;
  }
  .principle-id {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    font-size: 12px; font-weight: 600; color: #fff;
    background: #9b7fbd;
  }
  .principle-name { font-size: 14px; color: #37352f; flex: 1; }
  .principle-cnt {
    font-size: 12px; color: #9b9a97;
  }

  /* ── 성취기준 ── */
  .std-item {
    display: flex; gap: 10px; padding: 8px 0;
    border-bottom: 1px solid #f1f0ee;
  }
  .std-item:last-child { border-bottom: none; }
  .std-code {
    font-size: 12px; font-weight: 600; color: #6940A5;
    background: #f3f0ff; padding: 2px 8px; border-radius: 4px;
    white-space: nowrap; align-self: flex-start; margin-top: 2px;
  }
  .std-content { font-size: 14px; color: #37352f; }

  /* ── 단계 그룹 ── */
  .phase-title {
    font-size: 20px; font-weight: 700; color: #37352f;
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 16px;
  }
  .phase-badge {
    display: inline-block; padding: 3px 10px; border-radius: 4px;
    font-size: 12px; font-weight: 600; color: #fff;
  }

  .stage-block {
    background: #fbfbfa; border: 1px solid #e3e2e0;
    border-radius: 8px; padding: 20px 24px; margin-bottom: 12px;
  }
  .stage-header {
    font-size: 15px; font-weight: 600; color: #37352f;
    margin-bottom: 14px; display: flex; align-items: center; gap: 8px;
  }
  .stage-code {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    font-size: 11px; font-weight: 700; color: #fff;
  }

  /* ── 보드 ── */
  .board-label {
    font-size: 13px; font-weight: 600; color: #9b9a97;
    margin-bottom: 8px; padding-left: 10px;
    border-left: 3px solid #e3e2e0;
  }
  .board-section { margin-bottom: 16px; }

  /* ── 필드 ── */
  .f-group { margin-bottom: 10px; }
  .f-label {
    font-size: 12px; font-weight: 600; color: #9b9a97;
    margin-bottom: 2px;
  }
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
    border-bottom: 1px solid #e3e2e0;
    font-size: 12px;
  }
  td {
    padding: 8px 12px; border-bottom: 1px solid #f1f0ee;
    color: #37352f; vertical-align: top;
  }
  tr:last-child td { border-bottom: none; }

  /* ── 리스트 ── */
  .n-list { list-style: none; padding: 0; }
  .n-list li {
    padding: 4px 0 4px 20px; position: relative;
    font-size: 14px; color: #37352f;
  }
  .n-list li::before {
    content: '•'; position: absolute; left: 4px; top: 4px;
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
    .stage-block { page-break-inside: avoid; }
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
    <h1>${esc(session.title)}</h1>
    ${session.description ? `<p class="cover-desc">${esc(session.description)}</p>` : ''}
    <div class="cover-props">
      <span><span class="prop-label">생성일</span><span class="prop-value">${createdDate}</span></span>
      <span><span class="prop-label">보고서</span><span class="prop-value">${now}</span></span>
      <span><span class="prop-label">진행 단계</span><span class="prop-value">${session.current_stage}/10</span></span>
    </div>
  </div>
`

  // ── 참여자 ──
  if (participants.length > 0) {
    html += `<hr class="divider">
  <div class="section-title"><span class="emoji">👤</span> 참여 선생님</div>
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

  // ── 협력 과정 통계 ──
  html += `<hr class="divider">
  <div class="section-title"><span class="emoji">📊</span> 협력 설계 과정 요약</div>
  <div class="stats-row">
    <div class="stat-box"><div class="stat-num">${messageStats.total}</div><div class="stat-label">전체 대화</div></div>
    <div class="stat-box"><div class="stat-num">${messageStats.teacher}</div><div class="stat-label">교사 메시지</div></div>
    <div class="stat-box"><div class="stat-num">${messageStats.ai}</div><div class="stat-label">AI 조교 응답</div></div>
    <div class="stat-box"><div class="stat-num">${Object.keys(principleUsage).length}</div><div class="stat-label">활용 설계 원칙</div></div>
  </div>
`

  if (topPrinciples.length > 0) {
    html += `<p style="font-size:14px;font-weight:600;color:#37352f;margin-bottom:8px;">주요 활용 설계 원칙</p>`
    for (const p of topPrinciples) {
      html += `<div class="principle-row">
        <span class="principle-id">${esc(p.id)}</span>
        <span class="principle-name">${esc(p.name)}</span>
        <span class="principle-cnt">${p.count}회</span>
      </div>`
    }
  }

  // ── 성취기준 ──
  if (standards.length > 0) {
    html += `<hr class="divider">
  <div class="section-title"><span class="emoji">📋</span> 선택된 성취기준 <span style="font-size:14px;font-weight:400;color:#9b9a97;">${standards.length}개</span></div>`
    for (const s of standards) {
      const std = s.curriculum_standards
      if (!std) continue
      html += `<div class="std-item">
      <span class="std-code">${esc(std.code)}</span>
      <span class="std-content">${esc(std.content)}</span>
    </div>`
    }
  }

  // ── 단계별 설계 보드 ──
  const phaseColors = { T: '#9b7fbd', A: '#5B93C5', Ds: '#5BA07B', DI: '#D9A348', E: '#E8856C' }

  for (const phase of PHASES) {
    const phaseStages = STAGES.filter((s) => s.phase === phase.id)
    const hasContent = phaseStages.some((s) => {
      const boards = allBoards[s.id] || []
      return boards.some((b) => renderBoardContent(b.board_type, b.content))
    })
    if (!hasContent) continue

    html += `<hr class="divider">
  <div class="phase-title">
    <span class="emoji">${phaseIcon(phase.id)}</span>
    ${esc(phase.name)}
    <span class="phase-badge" style="background:${phaseColors[phase.id]};">${phase.id}</span>
  </div>`

    for (const stage of phaseStages) {
      const boards = allBoards[stage.id] || []
      const boardContents = boards
        .map((b) => ({ type: b.board_type, sections: renderBoardContent(b.board_type, b.content) }))
        .filter((b) => b.sections)

      if (boardContents.length === 0) continue

      html += `<div class="stage-block">
    <div class="stage-header">
      <span class="stage-code" style="background:${phaseColors[phase.id]};">${esc(stage.code)}</span>
      ${esc(stage.shortName)}
    </div>`

      for (const board of boardContents) {
        const label = BOARD_TYPE_LABELS[board.type] || board.type
        html += `<div class="board-section"><div class="board-label">${esc(label)}</div>`
        html += renderSectionsHTML(board.sections)
        html += `</div>`
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

function renderSectionsHTML(sections) {
  const tagClasses = ['tag-blue', 'tag-green', 'tag-purple', 'tag-pink', 'tag-orange', 'tag-yellow']
  let html = ''
  for (const sec of sections) {
    if (sec.type === 'table') {
      html += `<table><thead><tr>`
      for (const col of sec.columns) {
        html += `<th>${esc(col.label)}</th>`
      }
      html += `</tr></thead><tbody>`
      for (const row of sec.rows) {
        html += `<tr>`
        for (const col of sec.columns) {
          html += `<td>${esc(String(row[col.key] || ''))}</td>`
        }
        html += `</tr>`
      }
      html += `</tbody></table>`
    } else if (sec.type === 'list') {
      html += `<div class="f-group"><div class="f-label">${esc(sec.label)}</div><ul class="n-list">`
      for (const item of sec.items) {
        html += `<li>${esc(String(item))}</li>`
      }
      html += `</ul></div>`
    } else if (sec.type === 'tags') {
      html += `<div class="f-group"><div class="f-label">${esc(sec.label)}</div><div class="tags">`
      sec.items.forEach((item, i) => {
        html += `<span class="tag ${tagClasses[i % tagClasses.length]}">${esc(String(item))}</span>`
      })
      html += `</div></div>`
    } else {
      html += `<div class="f-group"><div class="f-label">${esc(sec.label)}</div><div class="f-value">${esc(sec.value)}</div></div>`
    }
  }
  return html
}

// ────────────── Markdown 보고서 ──────────────

export function generateMarkdown(data) {
  const { session, allBoards, messageStats, principleUsage, participants, standards, allPrinciples } = data
  const createdDate = new Date(session.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
  const now = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

  let md = `# ${session.title}\n\n`
  md += `> TADDs-DIE 협력적 수업 설계 보고서\n\n`
  if (session.description) md += `${session.description}\n\n`
  md += `- **생성일**: ${createdDate}\n`
  md += `- **보고서 생성**: ${now}\n`
  md += `- **설계 단계**: ${session.current_stage}/10\n\n`

  // 참여자
  if (participants.length > 0) {
    md += `## 👤 참여 선생님\n\n`
    for (const p of participants) {
      const detail = [p.subject, p.role].filter(Boolean).join(' · ')
      md += `- **${p.name}**${detail ? ` — ${detail}` : ''}\n`
    }
    md += `\n`
  }

  md += `---\n\n`

  // 통계
  md += `## 📊 협력 설계 과정 요약\n\n`
  md += `| 항목 | 수치 |\n|------|------|\n`
  md += `| 전체 대화 | ${messageStats.total} |\n`
  md += `| 교사 메시지 | ${messageStats.teacher} |\n`
  md += `| AI 조교 응답 | ${messageStats.ai} |\n`
  md += `| 활용 설계 원칙 | ${Object.keys(principleUsage).length}개 |\n\n`

  // 활용 원칙
  const topPrinciples = Object.entries(principleUsage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pid, count]) => {
      const p = allPrinciples.find((pr) => pr.id === pid)
      return p ? { id: pid, name: p.name, count } : null
    })
    .filter(Boolean)

  if (topPrinciples.length > 0) {
    md += `### 주요 활용 설계 원칙\n\n`
    for (const p of topPrinciples) {
      md += `- **${p.id}** ${p.name} (${p.count}회)\n`
    }
    md += `\n`
  }

  // 성취기준
  if (standards.length > 0) {
    md += `## 📋 선택된 성취기준\n\n`
    for (const s of standards) {
      const std = s.curriculum_standards
      if (!std) continue
      md += `- \`${std.code}\` ${std.content}\n`
    }
    md += `\n`
  }

  md += `---\n\n`

  // 단계별 보드
  for (const phase of PHASES) {
    const phaseStages = STAGES.filter((s) => s.phase === phase.id)
    const hasContent = phaseStages.some((s) => {
      const boards = allBoards[s.id] || []
      return boards.some((b) => renderBoardContent(b.board_type, b.content))
    })
    if (!hasContent) continue

    md += `## ${phaseIcon(phase.id)} ${phase.name} (${phase.id})\n\n`

    for (const stage of phaseStages) {
      const boards = allBoards[stage.id] || []
      const boardContents = boards
        .map((b) => ({ type: b.board_type, sections: renderBoardContent(b.board_type, b.content) }))
        .filter((b) => b.sections)

      if (boardContents.length === 0) continue

      md += `### ${stage.code}: ${stage.shortName}\n\n`

      for (const board of boardContents) {
        const label = BOARD_TYPE_LABELS[board.type] || board.type
        md += `#### ${label}\n\n`
        md += renderSectionsMD(board.sections)
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
      // 헤더
      md += `| ${sec.columns.map((c) => c.label).join(' | ')} |\n`
      md += `| ${sec.columns.map(() => '---').join(' | ')} |\n`
      for (const row of sec.rows) {
        md += `| ${sec.columns.map((c) => String(row[c.key] || '').replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |\n`
      }
      md += `\n`
    } else if (sec.type === 'list') {
      md += `**${sec.label}**\n\n`
      for (const item of sec.items) {
        md += `- ${String(item)}\n`
      }
      md += `\n`
    } else if (sec.type === 'tags') {
      md += `**${sec.label}**: ${sec.items.map((i) => `\`${i}\``).join(', ')}\n\n`
    } else {
      md += `**${sec.label}**: ${sec.value}\n\n`
    }
  }
  return md
}

// ────────────── 유틸 ──────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function phaseIcon(phaseId) {
  const icons = { T: '👥', A: '🔍', Ds: '🧭', DI: '🚀', E: '🔄' }
  return icons[phaseId] || '📌'
}