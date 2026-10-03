/**
 * 새 프로젝트 성취기준 일괄 연결 — 일부 실패를 알아차리고, 실패한 것만 한 번 더 보낸다(2026-10-03 검토).
 */
import { describe, it, expect, vi } from 'vitest'
import { saveProjectStandards, standardsSaveNotice } from '../projectStandards.js'

const KEYS = ['[10통과1-01-04]', '[10통사1-05-02]', '[12심독01-01]|심화 영어 독해와 작문']

describe('saveProjectStandards', () => {
  it('모두 저장되면 실패가 없다', async () => {
    const post = vi.fn(async (_p, body) => ({ results: body.standard_codes.map((key) => ({ key, status: 'saved' })) }))
    const out = await saveProjectStandards(post, 'p1', KEYS, { retryDelayMs: 0 })
    expect(out.failed).toEqual([])
    expect(out.saved).toHaveLength(3)
    expect(post).toHaveBeenCalledTimes(1)
    expect(standardsSaveNotice(out)).toBeNull()
  })

  it('HTTP 201이어도 일부 실패면 실패한 것만 한 번 더 보낸다', async () => {
    const post = vi.fn()
      .mockResolvedValueOnce({ ok: false, results: [
        { key: KEYS[0], status: 'saved' }, { key: KEYS[1], status: 'failed' }, { key: KEYS[2], status: 'unresolved' },
      ] })
      .mockResolvedValueOnce({ ok: true, results: [{ key: KEYS[1], status: 'saved' }] })
    const out = await saveProjectStandards(post, 'p1', KEYS, { retryDelayMs: 0 })
    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1][1].standard_codes).toEqual([KEYS[1]])
    expect(out.failed).toEqual([])
    expect(out.unresolved).toEqual([KEYS[2]])
    expect(standardsSaveNotice(out)).toContain('찾을 수 없는 성취기준 코드 1개')
    expect(standardsSaveNotice(out)).toContain('[12심독01-01]')
    expect(standardsSaveNotice(out)).not.toContain('|')
  })

  it('서버 오류가 두 번이면 모두 실패로 알리고, 안내에 코드를 담는다', async () => {
    const post = vi.fn(async () => { throw Object.assign(new Error('서버 오류'), { status: 500 }) })
    const out = await saveProjectStandards(post, 'p1', KEYS.slice(0, 2), { retryDelayMs: 0 })
    expect(post).toHaveBeenCalledTimes(2)
    expect(out.failed).toEqual(KEYS.slice(0, 2))
    expect(out.error).toBeTruthy()
    const notice = standardsSaveNotice(out)
    expect(notice).toContain('프로젝트는 만들었지만 성취기준 2개를 저장하지 못했습니다.')
    expect(notice).toContain('[10통과1-01-04], [10통사1-05-02]')
  })

  it('권한 오류(403)는 다시 보내지 않는다', async () => {
    const post = vi.fn(async () => { throw Object.assign(new Error('권한 없음'), { status: 403 }) })
    const out = await saveProjectStandards(post, 'p1', KEYS.slice(0, 1), { retryDelayMs: 0 })
    expect(post).toHaveBeenCalledTimes(1)
    expect(out.failed).toEqual(KEYS.slice(0, 1))
  })

  it('옛 서버 응답(results 없음)은 HTTP 성공이면 모두 저장된 것으로 본다', async () => {
    const post = vi.fn(async () => ({ ok: true, added: 2, total: 2 }))
    const out = await saveProjectStandards(post, 'p1', KEYS.slice(0, 2), { retryDelayMs: 0 })
    expect(out.failed).toEqual([])
    expect(out.saved).toHaveLength(2)
  })
})
