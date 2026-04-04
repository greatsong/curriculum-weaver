/**
 * 보고서 라우트
 *
 * 프로젝트 기반 보고서 생성 (HTML / Markdown / Preview).
 * supabaseService를 통해 프로젝트 + 설계 + 성취기준 로드.
 *
 * 라우트:
 * - GET /api/report/:projectId/html     — HTML 보고서 다운로드
 * - GET /api/report/:projectId/md       — Markdown 보고서 다운로드
 * - GET /api/report/:projectId/preview  — HTML 프리뷰 (인앱 표시용)
 */
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { collectReportData, generateHTML, generateMarkdown } from '../services/reportGenerator.js'
import { getProject, getMemberRole } from '../lib/supabaseService.js'

export const reportRouter = Router()

// 인증 필수 + 멤버십 검증
reportRouter.use(requireAuth)
reportRouter.use(async (req, res, next) => {
  const projectId = req.params.projectId
  if (!projectId) return next()
  try {
    const project = await getProject(projectId)
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
    if (project.workspace_id) {
      const role = await getMemberRole(project.workspace_id, req.user.id)
      if (!role) return res.status(403).json({ error: '이 프로젝트의 보고서에 접근 권한이 없습니다.' })
    }
  } catch { /* Supabase 연결 실패 시 통과 */ }
  next()
})

/**
 * GET /api/report/:projectId/html
 * HTML 보고서 파일 다운로드
 */
reportRouter.get('/:projectId/html', async (req, res) => {
  try {
    const data = await collectReportData(req.params.projectId)
    if (!data) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
    }

    const html = generateHTML(data)
    const filename = `${sanitizeFilename(data.project.title)}_보고서.html`

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    res.send(html)
  } catch (err) {
    console.error('[report] HTML 생성 오류:', err.message)
    res.status(500).json({ error: '보고서 생성 중 오류가 발생했습니다.' })
  }
})

/**
 * GET /api/report/:projectId/md
 * Markdown 보고서 파일 다운로드
 */
reportRouter.get('/:projectId/md', async (req, res) => {
  try {
    const data = await collectReportData(req.params.projectId)
    if (!data) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
    }

    const md = generateMarkdown(data)
    const filename = `${sanitizeFilename(data.project.title)}_보고서.md`

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    res.send(md)
  } catch (err) {
    console.error('[report] Markdown 생성 오류:', err.message)
    res.status(500).json({ error: '보고서 생성 중 오류가 발생했습니다.' })
  }
})

/**
 * GET /api/report/:projectId/preview
 * HTML 프리뷰 (브라우저에서 인라인 표시, window.print()로 PDF 변환 가능)
 */
reportRouter.get('/:projectId/preview', async (req, res) => {
  try {
    const data = await collectReportData(req.params.projectId)
    if (!data) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
    }

    const html = generateHTML(data)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  } catch (err) {
    console.error('[report] 프리뷰 생성 오류:', err.message)
    res.status(500).json({ error: '보고서 프리뷰 생성 중 오류가 발생했습니다.' })
  }
})

/**
 * 파일명에서 특수문자 제거
 */
function sanitizeFilename(name) {
  return String(name || '보고서').replace(/[<>:"/\\|?*]/g, '_').slice(0, 100)
}
