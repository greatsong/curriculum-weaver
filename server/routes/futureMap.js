/**
 * 미래 보기 라우트 (모두 로그인 필수, 명세 3부 T2)
 *
 * GET  /api/future-map/catalog — 성취기준 검색용 가벼운 목록 { fields, rows }(전체, 메모리에 만든 문자열 재사용)
 * POST /api/future-map/bridges — body: { codes: key[2..6] } → { bridges, cached }
 *   연결 찾기. 조합당 1회 생성·캐시, 모델과 무관.
 *   bridges = { keywords: {key: string[]}, concepts: [{label, kind, strength, ends: [{key, word}, {key, word}], why}], isolated: key[] }
 * POST /api/future-map — body: { codes: key[2..6], model: 'fast'|'precise', index: 0..29 } → { future, cached }
 *   수업 아이디어 1장. future = { index, lens_label, title, activity, product, pitch, axis, light_keys, model, keys }
 *
 * 상태: 검증 실패 400(1부 §6-7 문구), 모델 거절 422, 생성·파싱 2회 실패 502, 그 밖 500(일반 문구), 미인증 401.
 */
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { Standards } from '../lib/store.js'
import {
  resolveStandards, resolveFutureRequest, generateFuture, generateBridges, FutureError, FUTURE_MESSAGES,
} from '../services/futureMapGenerator.js'

export const futureMapRouter = Router()
futureMapRouter.use(requireAuth)

// 목록은 성취기준 정본이 바뀔 때(재시작·reload)만 달라진다 — 개수가 같으면 만든 문자열을 재사용
let catalogCache = { count: -1, body: '' }
export function buildCatalogBody() {
  const list = Standards.list()
  if (catalogCache.count !== list.length) {
    const rows = list.map((s) => [s.key ?? s.code, s.code, s.subject, s.subject_group, s.school_level, s.curriculum_category || '', s.content])
    catalogCache = { count: list.length, body: JSON.stringify({ fields: ['key', 'code', 'subject', 'subject_group', 'school_level', 'curriculum_category', 'content'], rows }) }
  }
  return catalogCache.body
}

futureMapRouter.get('/catalog', (req, res) => {
  res.set('Cache-Control', 'private, max-age=600')
  res.type('application/json').send(buildCatalogBody())
})

futureMapRouter.post('/bridges', async (req, res) => {
  const resolved = resolveStandards(req.body)
  if (resolved.error) return res.status(400).json({ error: resolved.error })
  try {
    const { bridges, cached } = await generateBridges({ standards: resolved.standards })
    res.json({ bridges, cached })
  } catch (err) {
    if (err instanceof FutureError) return res.status(err.status).json({ error: err.message })
    console.error('[future-map] 연결 찾기 오류:', err?.message || err)
    res.status(500).json({ error: FUTURE_MESSAGES.bridgeFailed })
  }
})

futureMapRouter.post('/', async (req, res) => {
  const resolved = resolveFutureRequest(req.body)
  if (resolved.error) return res.status(400).json({ error: resolved.error })
  try {
    const { future, cached } = await generateFuture(resolved)
    res.json({ future, cached })
  } catch (err) {
    if (err instanceof FutureError) return res.status(err.status).json({ error: err.message })
    console.error('[future-map] 수업 아이디어 생성 오류:', err?.message || err)
    res.status(500).json({ error: FUTURE_MESSAGES.cardFailed })
  }
})
