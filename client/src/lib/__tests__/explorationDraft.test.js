import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createDraft, readDraft, saveDraft, removeDraft, nextDraft, applyDraftEvent, viewStatus,
  draftStorageKey, isValidDraft, subscribeDraft,
} from '../explorationDraft'

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
  }
}
const throwing = { getItem: () => { throw new Error('막힘') }, setItem: () => { throw new Error('막힘') }, removeItem: () => { throw new Error('막힘') } }

const base = () => createDraft({
  projectId: 'p1', text: '[A-3 ...] 초안', now: 1_000,
  standards: [{ code: '[10통과2-02-06]', subject: '통합과학', content: '원문' }],
  keywords: ['에너지 효율', ''], ideaTitle: '아이디어',
})

describe('초안 저장과 읽기', () => {
  let storage
  beforeEach(() => { storage = memoryStorage() })

  it('프로젝트별 키에 저장하고 같은 프로젝트에서만 읽는다', () => {
    const draft = base()
    expect(draft.status).toBe('arrived')
    expect(draft.summary).toEqual({ standards: [{ code: '[10통과2-02-06]', subject: '통합과학' }], keywords: ['에너지 효율'], ideaTitle: '아이디어' })
    expect(saveDraft(storage, draft)).toBe(true)
    expect(storage.getItem(draftStorageKey('p1'))).toBeTruthy()
    expect(readDraft(storage, 'p1')).toEqual(draft)
    expect(readDraft(storage, 'p2')).toBeNull()
  })

  it('모양이 다르거나 다른 프로젝트로 바뀐 값은 버린다', () => {
    storage.setItem(draftStorageKey('p1'), JSON.stringify({ ...base(), projectId: 'p9' }))
    expect(readDraft(storage, 'p1')).toBeNull()
    storage.setItem(draftStorageKey('p1'), JSON.stringify({ ...base(), status: 'done' }))
    expect(readDraft(storage, 'p1')).toBeNull()
    storage.setItem(draftStorageKey('p1'), '{깨짐')
    expect(readDraft(storage, 'p1')).toBeNull()
    expect(isValidDraft(null, 'p1')).toBe(false)
  })

  it('막힌 저장소에서는 실패를 돌려주고 예외를 내지 않는다', () => {
    expect(saveDraft(throwing, base())).toBe(false)
    expect(readDraft(throwing, 'p1')).toBeNull()
    expect(removeDraft(throwing, 'p1')).toBe(false)
  })

  it('지우기와 변경 알림', () => {
    const cb = vi.fn()
    const off = subscribeDraft('p1', cb)
    saveDraft(storage, base())
    removeDraft(storage, 'p1')
    expect(readDraft(storage, 'p1')).toBeNull()
    expect(cb).toHaveBeenCalledTimes(2)
    off()
    saveDraft(storage, base())
    expect(cb).toHaveBeenCalledTimes(2)
  })
})

describe('상태 전이', () => {
  it('도착 → 대화에 보냄 → 수락(저장 성공) → 보드에 반영됨', () => {
    const d0 = base()
    const d1 = nextDraft(d0, { type: 'sent', draftId: d0.id, at: 2_000 })
    expect(d1.status).toBe('sent'); expect(d1.sentAt).toBe(2_000)
    const d2 = nextDraft(d1, { type: 'accepted', draftId: d0.id, persisted: true, at: 3_000, label: 'A-3 주제의 상세 내용 분석' })
    expect(d2).toMatchObject({ status: 'reflected', resolvedAt: 3_000, reflectedLabel: 'A-3 주제의 상세 내용 분석' })
  })

  it('저장 결과를 모르면 반영으로 표시하지 않고 확인 필요로 둔다', () => {
    const t = Date.parse('2026-10-03T05:00:00Z')
    const d1 = nextDraft(base(), { type: 'sent', at: t - 60_000 })
    const d2 = nextDraft(d1, { type: 'accepted', persisted: false, at: t })
    expect(d2.status).toBe('unconfirmed'); expect(d2.attemptAt).toBe(t)
    // 다시 확인: 수락 시도보다 확실히 옛 보드면 그대로 (시계 차이 5초까지만 허용)
    expect(nextDraft(d2, { type: 'rechecked', board: { updated_at: new Date(t - 30_000).toISOString() } }).status).toBe('unconfirmed')
    // 날짜가 없으면 그대로
    expect(nextDraft(d2, { type: 'rechecked', board: {} }).status).toBe('unconfirmed')
    // 수락 시도 뒤에 저장된 보드면 반영으로
    expect(nextDraft(d2, { type: 'rechecked', board: { updated_at: new Date(t + 500).toISOString() } }).status).toBe('reflected')
  })

  it('거부 뒤에 같은 응답의 다른 제안을 수락하면 반영으로 바뀐다', () => {
    const d1 = nextDraft(base(), { type: 'sent', at: 2_000 })
    const d2 = nextDraft(d1, { type: 'rejected', at: 2_500 })
    expect(d2.status).toBe('rejected')
    expect(nextDraft(d2, { type: 'accepted', persisted: true, at: 2_600 }).status).toBe('reflected')
  })

  it('반영된 뒤의 거부는 반영 상태를 되돌리지 않는다', () => {
    const d1 = nextDraft(base(), { type: 'sent', at: 2_000 })
    const d2 = nextDraft(d1, { type: 'accepted', persisted: true, at: 3_000 })
    expect(nextDraft(d2, { type: 'rejected', at: 3_100 })).toBe(d2)
  })

  it('거부한 초안은 다시 대화로 보낼 수 있다', () => {
    const d1 = nextDraft(base(), { type: 'sent', at: 2_000 })
    const d2 = nextDraft(d1, { type: 'rejected', at: 2_500 })
    expect(nextDraft(d2, { type: 'sent', at: 4_000 })).toMatchObject({ status: 'sent', sentAt: 4_000 })
  })

  it('다른 초안의 사건이나 순서에 맞지 않는 사건은 무시한다', () => {
    const d0 = base()
    expect(nextDraft(d0, { type: 'sent', draftId: 'other' })).toBe(d0)
    expect(nextDraft(d0, { type: 'accepted', persisted: true })).toBe(d0) // 보내기 전 수락
    expect(nextDraft(d0, { type: 'rejected' })).toBe(d0)
    expect(nextDraft(d0, { type: 'unknown' })).toBe(d0)
  })

  it('저장된 초안에 사건을 적용한다', () => {
    const storage = memoryStorage()
    const d0 = base(); saveDraft(storage, d0)
    expect(applyDraftEvent(storage, 'p1', { type: 'sent', at: 5 }).status).toBe('sent')
    expect(readDraft(storage, 'p1').status).toBe('sent')
    expect(applyDraftEvent(storage, 'p2', { type: 'sent' })).toBeNull()
  })
})

describe('화면 상태', () => {
  it('보낸 초안에서 나온 대기 제안이 있을 때만 검토 중', () => {
    const d1 = nextDraft(base(), { type: 'sent', at: 2_000 })
    expect(viewStatus(d1, [])).toBe('sent')
    expect(viewStatus(d1, [{ status: 'pending', fromExploration: 'other' }])).toBe('sent')
    expect(viewStatus(d1, [{ status: 'accepted', fromExploration: d1.id }])).toBe('sent')
    expect(viewStatus(d1, [{ status: 'pending', fromExploration: d1.id }])).toBe('reviewing')
    expect(viewStatus(null)).toBe('none')
    expect(viewStatus(base(), [{ status: 'pending', fromExploration: base().id }])).toBe('arrived')
  })
})
