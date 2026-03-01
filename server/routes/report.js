import { Router } from 'express'
import { collectReportData, generateHTML, generateMarkdown } from '../services/reportGenerator.js'

export const reportRouter = Router()

// HTML 보고서 다운로드
reportRouter.get('/:sessionId/html', (req, res) => {
  const data = collectReportData(req.params.sessionId)
  if (!data) return res.status(404).json({ error: '세션을 찾을 수 없습니다.' })

  const html = generateHTML(data)
  const filename = `${sanitizeFilename(data.session.title)}_보고서.html`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
  res.send(html)
})

// Markdown 보고서 다운로드
reportRouter.get('/:sessionId/md', (req, res) => {
  const data = collectReportData(req.params.sessionId)
  if (!data) return res.status(404).json({ error: '세션을 찾을 수 없습니다.' })

  const md = generateMarkdown(data)
  const filename = `${sanitizeFilename(data.session.title)}_보고서.md`

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
  res.send(md)
})

// PDF용 HTML (인라인 표시 — 브라우저에서 window.print()로 PDF 변환)
reportRouter.get('/:sessionId/preview', (req, res) => {
  const data = collectReportData(req.params.sessionId)
  if (!data) return res.status(404).json({ error: '세션을 찾을 수 없습니다.' })

  const html = generateHTML(data)
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(html)
})

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').slice(0, 100)
}