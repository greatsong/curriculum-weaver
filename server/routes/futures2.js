/**
 * 미래 보기 2 라우트
 *
 * POST /api/futures2 — body: { codes: string[2..7], model: 'fast'|'precise', index: 0..29 }
 *   교사가 고른 성취기준으로 index번째 "수업의 미래"를 생성(캐시 우선)해 돌려준다.
 * GET /api/futures2/catalog — 성취기준 검색용 가벼운 목록(전체, 메모리 캐시)
 * POST /api/futures2/bridges — body: { codes } → 고른 성취기준을 엮는 연결 개념 지도(조합당 1회 생성·캐시)
 */
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { Standards } from '../lib/store.js'
import {
  resolveFutureRequest, generateFuture, generateBridges, FutureError,
} from '../services/futures2Generator.js'

export const futures2Router = Router()
futures2Router.use(requireAuth)

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

futures2Router.get('/catalog', (req, res) => {
  res.set('Cache-Control', 'private, max-age=600')
  res.type('application/json').send(buildCatalogBody())
})

futures2Router.post('/bridges', async (req, res) => {
  const resolved = resolveFutureRequest({ codes: req.body?.codes, index: 0 })
  if (resolved.error) return res.status(400).json({ error: resolved.error })
  try {
    const { bridges, cached } = await generateBridges({ standards: resolved.standards })
    res.json({ bridges, cached })
  } catch (err) {
    if (err instanceof FutureError) return res.status(err.status).json({ error: err.message })
    console.error('[futures2] 연결 개념 오류:', err?.message || err)
    res.status(500).json({ error: '연결 개념을 그리지 못했습니다. 잠시 후 다시 시도해 주세요.' })
  }
})

futures2Router.post('/', async (req, res) => {
  const resolved = resolveFutureRequest(req.body)
  if (resolved.error) return res.status(400).json({ error: resolved.error })
  try {
    const { future, cached } = await generateFuture(resolved)
    res.json({ future, cached })
  } catch (err) {
    if (err instanceof FutureError) return res.status(err.status).json({ error: err.message })
    console.error('[futures2] 생성 오류:', err?.message || err)
    res.status(500).json({ error: '미래를 그리지 못했습니다. 잠시 후 다시 시도해 주세요.' })
  }
})
