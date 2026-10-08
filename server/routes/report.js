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
 * - GET /api/report/:projectId/full/:format — 전체 기록(보고서 + 대화 전문). ?anonymize=1이면 이름 가리기
 */
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { collectReportData, generateHTML, generateMarkdown } from '../services/reportGenerator.js'
import { generateFullRecord } from '../services/fullRecord.js'
import { getProject, getMemberRole } from '../lib/supabaseService.js'

export const reportRouter = Router()

// 인증 필수 + 멤버십 검증
// 멤버십 검사는 각 라우트에 붙인다. 라우터 수준 use()에서는 req.params가 비어 있어
// :projectId를 읽지 못하고 검사 없이 통과하던 문제가 있었다.
reportRouter.use(requireAuth)
async function checkReportAccess(req, res, next) {
  const projectId = req.params.projectId
  if (!projectId) return next()
  try {
    const project = await getProject(projectId)
    if (!project) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
    if (project.workspace_id) {
      const role = await getMemberRole(project.workspace_id, req.user.id)
      if (!role) return res.status(403).json({ error: '이 프로젝트의 보고서에 접근 권한이 없습니다.' })
    }
  } catch {
    // Supabase 미설정(로컬 dev) 시에만 통과.
    // 프로덕션/스테이징에서 DB 조회가 예외를 던진 경우엔 fail-closed(503)로 접근을 막는다.
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(503).json({ error: '접근 권한 확인 중 일시적 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' })
    }
  }
  next()
}

/**
 * GET /api/report/:projectId/html
 * HTML 보고서 파일 다운로드
 */
reportRouter.get('/:projectId/html', checkReportAccess, async (req, res) => {
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
reportRouter.get('/:projectId/md', checkReportAccess, async (req, res) => {
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
reportRouter.get('/:projectId/preview', checkReportAccess, async (req, res) => {
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
 * GET /api/report/:projectId/full/:format   (format: html | md)
 * 전체 기록 다운로드 — 보고서(보드 전부)에 대화 전문을 덧붙인 한 파일.
 * ?anonymize=1 이면 교사 이름·이메일·워크스페이스 이름을 가린다(팀 외부 배포용).
 */
reportRouter.get('/:projectId/full/:format', checkReportAccess, async (req, res) => {
  const format = req.params.format === 'md' ? 'md' : req.params.format === 'html' ? 'html' : null
  if (!format) return res.status(400).json({ error: '형식은 html 또는 md만 지원합니다.' })
  const anonymize = ['1', 'true', 'yes'].includes(String(req.query.anonymize || '').toLowerCase())
  try {
    const result = await generateFullRecord(req.params.projectId, { anonymize, format })
    if (!result) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' })
    }
    const suffix = anonymize ? '_전체기록_익명' : '_전체기록'
    const filename = `${sanitizeFilename(result.title)}${suffix}.${format}`
    res.setHeader('Content-Type', format === 'md' ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    res.send(result.body)
  } catch (err) {
    console.error('[report] 전체 기록 생성 오류:', err.message)
    res.status(500).json({ error: '전체 기록 생성 중 오류가 발생했습니다.' })
  }
})

/**
 * 파일명에서 특수문자 제거
 */
function sanitizeFilename(name) {
  return String(name || '보고서').replace(/[<>:"/\\|?*]/g, '_').slice(0, 100)
}
