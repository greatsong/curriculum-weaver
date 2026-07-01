#!/usr/bin/env node
/**
 * 프로젝트 전체 로컬 백업 도구.
 *
 * 서버/DB가 사라져도 브라우저로 열어볼 수 있도록 프로젝트의 모든 데이터를
 * (프로젝트·워크스페이스·멤버·메시지 전체·보드·성취기준·자료) 로컬에 저장한다.
 * 산출물(모두 backups/ 아래):
 *   - <name>.json         : 원본 데이터 완전 덤프 (권위 백업)
 *   - <name>-viewer.html  : 오프라인 대화 뷰어 (마크다운 렌더, 인터넷 불필요)
 *   - <name>-report.html  : 공식 최종 보고서 (reportGenerator)
 *   - <name>-report.md    : 공식 보고서 Markdown
 *
 * 사용:
 *   node scripts/backup-project.mjs <projectId>
 *   (미지정 시 f728ebc0 = "고1, 고2 융합수업 설계")
 */
import { createRequire } from 'module'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const require = createRequire(join(ROOT, 'package.json'))
const { createClient } = require('@supabase/supabase-js')

// ── server/.env 로드 ──
const env = {}
for (const line of readFileSync(join(ROOT, 'server/.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
process.env.SUPABASE_URL ||= env.SUPABASE_URL
process.env.SUPABASE_SERVICE_ROLE_KEY ||= env.SUPABASE_SERVICE_ROLE_KEY

const PROJECT_ID = process.argv[2] || 'f728ebc0-41ed-4f38-b86b-b9a90f0532a8'
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ── 아주 작은 Markdown → HTML (오프라인 뷰어용) ──
function md(src) {
  if (!src) return ''
  const lines = String(src).split('\n')
  const out = []
  let i = 0
  const inline = (t) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\*)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`([^`]+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  while (i < lines.length) {
    const line = lines[i]
    if (/^\s*$/.test(line)) { i++; continue }
    // 헤딩
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue }
    // 구분선
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue }
    // 표 (GFM)
    if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const cells = (r) => r.replace(/^\s*\||\|\s*$/g, '').split('|').map((c) => c.trim())
      const head = cells(line)
      i += 2
      const rows = []
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) { rows.push(cells(lines[i])); i++ }
      out.push('<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>')
      continue
    }
    // 목록
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line)
      const items = []
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, '')); i++
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>` + items.map((t) => `<li>${inline(t)}</li>`).join('') + `</${ordered ? 'ol' : 'ul'}>`)
      continue
    }
    // 문단
    const para = [line]; i++
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|\s*([-*+]|\d+\.)\s|\s*(-{3,})\s*$)/.test(lines[i]) && !/\|/.test(lines[i])) { para.push(lines[i]); i++ }
    out.push('<p>' + para.map(inline).join('<br>') + '</p>')
  }
  return out.join('\n')
}

async function pull(table, filter) {
  const q = sb.from(table).select('*')
  for (const [k, v] of Object.entries(filter)) q.eq(k, v)
  const { data, error } = await q
  if (error) { console.warn(`  [${table}] 조회 실패: ${error.message}`); return [] }
  return data || []
}

async function main() {
  console.log('백업 대상 project_id:', PROJECT_ID)
  const { data: projRows } = await sb.from('projects').select('*').eq('id', PROJECT_ID)
  const project = projRows?.[0]
  if (!project) { console.error('프로젝트를 찾을 수 없습니다.'); process.exit(1) }

  const { data: wsRows } = await sb.from('workspaces').select('*').eq('id', project.workspace_id)
  const workspace = wsRows?.[0] || null
  const members = workspace ? await pull('members', { workspace_id: workspace.id }) : []

  // 메시지 전체 (시간순)
  const { data: msgDesc } = await sb.from('messages').select('*').eq('project_id', PROJECT_ID).order('created_at', { ascending: true }).range(0, 9999)
  const messages = msgDesc || []
  const designs = await pull('designs', { project_id: PROJECT_ID })
  const projectStandards = await pull('project_standards', { project_id: PROJECT_ID })
  const materials = await pull('materials', { project_id: PROJECT_ID })

  console.log(`  프로젝트="${project.title}" 메시지=${messages.length} 보드=${designs.length} 성취기준=${projectStandards.length} 자료=${materials.length} 멤버=${members.length}`)

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const safe = (project.title || 'project').replace(/[^\w가-힣]+/g, '_').slice(0, 40)
  const base = `${safe}_${PROJECT_ID.slice(0, 8)}_${stamp}`
  const dir = join(ROOT, 'backups')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  // 1) 원본 JSON 덤프
  const dump = { backed_up_at: new Date().toISOString(), project, workspace, members, messages, designs, projectStandards, materials }
  const jsonPath = join(dir, `${base}.json`)
  writeFileSync(jsonPath, JSON.stringify(dump, null, 2))
  console.log('  ✅ JSON 덤프:', jsonPath)

  // 2) 오프라인 대화 뷰어 HTML
  const senderLabel = (m) => m.sender_type === 'ai' ? 'AI 공동설계자' : m.sender_type === 'system' ? '시스템' : (m.sender_name ? `${m.sender_name}${m.sender_subject ? ' · ' + m.sender_subject : ''}` : '교사')
  const bubbles = messages.map((m) => {
    const cls = m.sender_type === 'teacher' ? 'teacher' : m.sender_type === 'ai' ? 'ai' : 'system'
    const when = (m.created_at || '').replace('T', ' ').slice(0, 16)
    return `<div class="row ${cls}"><div class="bubble ${cls}"><div class="who">${esc(senderLabel(m))} <span class="ts">${esc(when)}</span></div><div class="body">${md(m.content)}</div></div></div>`
  }).join('\n')

  const boardsHtml = designs.filter(d => d.content && Object.keys(d.content).length).map((d) =>
    `<details><summary>${esc(d.board_type)}${d.procedure_code ? ` · ${esc(d.procedure_code)}` : ''}</summary><pre>${esc(JSON.stringify(d.content, null, 2))}</pre></details>`
  ).join('\n')

  const viewer = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(project.title)} — 백업 뷰어</title>
<style>
:root{--bg:#f8fafc;--card:#fff;--ai:#eef2ff;--teacher:#111827;--sys:#fffbeb;--border:#e5e7eb;--muted:#6b7280}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,'Apple SD Gothic Neo',system-ui,sans-serif;background:var(--bg);color:#111827;line-height:1.6}
header{position:sticky;top:0;background:#fff;border-bottom:1px solid var(--border);padding:16px 20px;z-index:10}
header h1{margin:0 0 4px;font-size:18px}header .meta{font-size:12px;color:var(--muted)}
.wrap{max-width:860px;margin:0 auto;padding:20px}
.info,.boards{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 18px;margin-bottom:16px;font-size:13px}
.info b{color:#374151}
.row{display:flex;margin:12px 0}.row.teacher{justify-content:flex-end}.row.ai,.row.system{justify-content:flex-start}
.bubble{max-width:82%;border-radius:14px;padding:10px 16px;font-size:14px}
.bubble.ai{background:var(--ai)}.bubble.teacher{background:var(--teacher);color:#fff}.bubble.system{background:var(--sys);border:1px solid #fde68a;font-size:12px;max-width:100%}
.who{font-size:11px;color:var(--muted);margin-bottom:4px}.bubble.teacher .who{color:#cbd5e1}.ts{opacity:.7}
.body :is(h1,h2,h3){font-size:15px;margin:10px 0 4px}.body p{margin:6px 0}.body table{border-collapse:collapse;width:100%;margin:8px 0;font-size:12px}
.body th,.body td{border:1px solid var(--border);padding:4px 8px;text-align:left}.bubble.teacher .body th,.bubble.teacher .body td{border-color:#374151}
.body code{background:rgba(0,0,0,.06);padding:1px 4px;border-radius:4px;font-size:12px}.body hr{border:0;border-top:1px solid var(--border);margin:8px 0}
.body ul,.body ol{margin:6px 0;padding-left:20px}
details{margin:6px 0}summary{cursor:pointer;font-weight:600}pre{white-space:pre-wrap;word-break:break-all;background:#f1f5f9;padding:10px;border-radius:8px;font-size:11px;overflow:auto}
.banner{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:13px}
</style></head><body>
<header><h1>${esc(project.title)}</h1><div class="meta">워크스페이스: ${esc(workspace?.name || '-')} · 현재 절차: ${esc(project.current_procedure || '-')} · 백업: ${esc(new Date().toISOString().slice(0, 16).replace('T', ' '))}</div></header>
<div class="wrap">
<div class="banner">📦 이 파일은 <b>로컬 오프라인 백업</b>입니다. 서버 없이도 열립니다. 원본 데이터는 같은 폴더의 <code>${esc(base)}.json</code>에 있습니다.</div>
<div class="info"><b>메시지</b> ${messages.length}개 · <b>보드</b> ${designs.length}개 · <b>성취기준</b> ${projectStandards.length}개 · <b>자료</b> ${materials.length}개 · <b>멤버</b> ${members.length}명<br>
<b>기간</b> ${esc((messages[0]?.created_at || '').slice(0, 10))} ~ ${esc((messages[messages.length - 1]?.created_at || '').slice(0, 10))}</div>
${boardsHtml ? `<div class="boards"><b>설계 보드 (${designs.filter(d => d.content && Object.keys(d.content).length).length})</b>\n${boardsHtml}</div>` : ''}
<h2 style="font-size:15px">대화 기록</h2>
${bubbles}
</div></body></html>`
  const viewerPath = join(dir, `${base}-viewer.html`)
  writeFileSync(viewerPath, viewer)
  console.log('  ✅ 오프라인 뷰어:', viewerPath)

  // 3) 공식 보고서 (reportGenerator)
  try {
    const rg = await import(join(ROOT, 'server/services/reportGenerator.js'))
    const data = await rg.collectReportData(PROJECT_ID)
    if (data) {
      const html = rg.generateHTML(data)
      const mdReport = rg.generateMarkdown(data)
      writeFileSync(join(dir, `${base}-report.html`), html)
      writeFileSync(join(dir, `${base}-report.md`), mdReport)
      console.log('  ✅ 공식 보고서 HTML/MD 저장 (HTML ' + html.length + '자, MD ' + mdReport.length + '자)')
      // 보고서 품질 요약 출력
      console.log('\n[보고서 점검]')
      console.log('  제목:', data.project?.title)
      console.log('  보드 섹션 수:', (data.boards?.length ?? data.designs?.length ?? '?'))
      console.log('  성취기준 수:', (data.standards?.length ?? '?'))
      console.log('  요약 존재:', !!(data.executiveSummary || data.summary))
    } else {
      console.warn('  ⚠️ collectReportData가 null — 보고서 생략')
    }
  } catch (e) {
    console.warn('  ⚠️ 보고서 생성 실패(뷰어/JSON은 정상):', e.message)
  }

  console.log('\n완료 → backups/ 폴더 확인')
}
main()
