import { Router } from 'express'
import multer from 'multer'
import { optionalAuth } from '../middleware/auth.js'
import { Materials } from '../lib/store.js'

export const materialsRouter = Router()
materialsRouter.use(optionalAuth)

const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'hwp', 'hwpx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt', 'jpg', 'jpeg', 'png', 'webp']

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error(`허용되지 않은 파일 형식입니다: .${ext}`))
    }
    cb(null, true)
  },
})

// 세션 자료 목록 조회
materialsRouter.get('/:sessionId', async (req, res) => {
  const materials = Materials.list(req.params.sessionId)
  res.json(materials)
})

// 파일 업로드 (인메모리 — Storage 없이)
materialsRouter.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 필요합니다.' })

  const { session_id } = req.body
  if (!session_id) return res.status(400).json({ error: '세션 ID가 필요합니다.' })

  const file = req.file
  const fileExt = file.originalname.split('.').pop().toLowerCase()

  const { category } = req.body

  const material = Materials.add(session_id, {
    file_name: file.originalname,
    file_type: fileExt,
    file_size: file.size,
    category: category || 'reference',
    storage_path: `memory://${session_id}/${file.originalname}`,
    processing_status: 'completed',
    ai_summary: `파일 "${file.originalname}" (${(file.size / 1024).toFixed(1)}KB)이 업로드되었습니다.`,
  })

  res.status(201).json(material)
})

// URL 자료 추가
materialsRouter.post('/url', async (req, res) => {
  const { session_id, url, category, title } = req.body
  if (!session_id) return res.status(400).json({ error: '세션 ID가 필요합니다.' })
  if (!url) return res.status(400).json({ error: 'URL이 필요합니다.' })

  const material = Materials.add(session_id, {
    file_name: title || url,
    file_type: 'url',
    file_size: 0,
    category: category || 'website',
    storage_path: url,
    processing_status: 'completed',
    ai_summary: `참고 링크: ${title || url}`,
  })

  res.status(201).json(material)
})

// 자료 분석 결과 조회
materialsRouter.get('/analysis/:id', async (req, res) => {
  res.status(404).json({ error: '자료를 찾을 수 없습니다.' })
})
