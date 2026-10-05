/**
 * 새 배포 감지 순수 로직 — 버전 비교, HTML 폴백 오탐 금지, 안전 판정, 자동 새로고침 1회 제한
 */
import { describe, it, expect } from 'vitest'
import {
  normalizeBuildId,
  parseVersionResponse,
  hasNewDeploy,
  evaluateReloadSafety,
  describeReloadBlocks,
  isAutoReloadPath,
  canAutoReload,
  rememberAutoReload,
  settleAutoReload,
  AUTO_RELOAD_RECORD_KEY,
} from '../deployVersion'

const SHA_A = '1c2ab67d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b'
const SHA_B = '9f8e7d6c5b4a39281706f5e4d3c2b1a098765432'

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    _map: map,
  }
}

const SAFE = Object.freeze({
  streaming: false,
  chatInputEmpty: true,
  pendingSuggestions: false,
  pendingHandoff: false,
  unsavedWork: [],
  pendingRequests: 0,
  focusedField: 'none',
  typedFields: 0,
  openDialog: false,
})

describe('빌드 식별자와 version.json 응답', () => {
  it('SHA·빌드 시각 형식만 받고 나머지는 null', () => {
    expect(normalizeBuildId(` ${SHA_A} `)).toBe(SHA_A)
    expect(normalizeBuildId('build-20261005223656123')).toBe('build-20261005223656123')
    expect(normalizeBuildId('')).toBeNull()
    expect(normalizeBuildId('<!doctype html>')).toBeNull()
    expect(normalizeBuildId(123)).toBeNull()
    expect(normalizeBuildId('a'.repeat(129))).toBeNull()
  })

  it('정상 JSON 응답에서 buildId를 꺼낸다', () => {
    const text = JSON.stringify({ buildId: SHA_B, builtAt: '2026-10-05T00:00:00Z' })
    expect(parseVersionResponse({ ok: true, contentType: 'application/json; charset=utf-8', text })).toBe(SHA_B)
  })

  it('SPA 폴백으로 index.html이 오면 업데이트 없음(null)으로 본다', () => {
    const html = '<!doctype html><html lang="ko"><head><title>커리큘럼 위버</title></head></html>'
    expect(parseVersionResponse({ ok: true, contentType: 'text/html; charset=utf-8', text: html })).toBeNull()
    // content-type이 틀리게 와도 본문이 HTML이면 null
    expect(parseVersionResponse({ ok: true, contentType: 'application/json', text: html })).toBeNull()
    expect(parseVersionResponse({ ok: true, contentType: '', text: html })).toBeNull()
  })

  it('실패 응답·깨진 JSON·형식이 다른 JSON은 모두 null', () => {
    expect(parseVersionResponse({ ok: false, contentType: 'application/json', text: JSON.stringify({ buildId: SHA_B }) })).toBeNull()
    expect(parseVersionResponse({ ok: true, contentType: 'application/json', text: '{"buildId":' })).toBeNull()
    expect(parseVersionResponse({ ok: true, contentType: 'application/json', text: '{}' })).toBeNull()
    expect(parseVersionResponse({ ok: true, contentType: 'application/json', text: '["x"]' })).toBeNull()
    expect(parseVersionResponse({ ok: true, contentType: 'application/json', text: JSON.stringify({ buildId: 42 }) })).toBeNull()
    expect(parseVersionResponse(null)).toBeNull()
  })

  it('둘 다 유효하고 다를 때만 새 배포', () => {
    expect(hasNewDeploy(SHA_A, SHA_B)).toBe(true)
    expect(hasNewDeploy(SHA_A, SHA_A)).toBe(false)
    expect(hasNewDeploy(SHA_A, null)).toBe(false)
    expect(hasNewDeploy(null, SHA_B)).toBe(false)
    expect(hasNewDeploy('dev', '<html>')).toBe(false)
  })
})

describe('새로고침 안전 판정', () => {
  it('모든 조건이 안전하면 safe', () => {
    expect(evaluateReloadSafety(SAFE)).toEqual({ safe: true, reasons: [] })
  })

  it('대화 입력창에 초점이 있어도 비어 있으면 safe', () => {
    expect(evaluateReloadSafety({ ...SAFE, focusedField: 'chat-composer' }).safe).toBe(true)
  })

  it.each([
    [{ streaming: true }, 'ai-streaming'],
    [{ chatInputEmpty: false }, 'chat-input'],
    [{ pendingSuggestions: true }, 'pending-suggestion'],
    [{ pendingHandoff: true }, 'handoff'],
    [{ unsavedWork: ['board-edit'] }, 'board-edit'],
    [{ unsavedWork: ['setup'] }, 'setup'],
    [{ unsavedWork: ['simulation'] }, 'simulation'],
    [{ pendingRequests: 1 }, 'saving'],
    [{ focusedField: 'field' }, 'focused-field'],
    [{ typedFields: 2 }, 'typed-field'],
    [{ openDialog: true }, 'dialog'],
  ])('%o 이면 막고 이유를 남긴다', (patch, reason) => {
    const result = evaluateReloadSafety({ ...SAFE, ...patch })
    expect(result.safe).toBe(false)
    expect(result.reasons).toContain(reason)
  })

  it('값을 읽지 못했거나 형식이 다르면 unknown으로 막는다(안전 쪽 실패)', () => {
    expect(evaluateReloadSafety(null)).toEqual({ safe: false, reasons: ['unknown'] })
    for (const key of Object.keys(SAFE)) {
      const snapshot = { ...SAFE, [key]: undefined }
      const result = evaluateReloadSafety(snapshot)
      expect(result.safe, key).toBe(false)
      expect(result.reasons, key).toContain('unknown')
    }
    expect(evaluateReloadSafety({ ...SAFE, unsavedWork: ['처음 보는 이유'] }).reasons).toEqual(['unknown'])
    expect(evaluateReloadSafety({ ...SAFE, pendingRequests: -1 }).safe).toBe(false)
    expect(evaluateReloadSafety({ ...SAFE, focusedField: 'somewhere' }).safe).toBe(false)
  })

  it('이유 문구는 합쇼체이고 같은 문구는 한 번만', () => {
    const labels = describeReloadBlocks(['typed-field', 'focused-field', 'chat-input'])
    expect(labels).toEqual(['작성 중인 입력란이 있습니다.', '대화 입력창에 보내지 않은 글이 있습니다.'])
    for (const label of describeReloadBlocks(['ai-streaming', 'board-edit', 'saving', 'dialog', 'unknown', 'x'])) {
      expect(label).toMatch(/니다\.$/) // 합쇼체 평서형
      expect(label).not.toMatch(/[—]|자리/)
    }
  })
})

describe('자동 새로고침 경로', () => {
  it('한 번만 하는 일이 있는 경로는 제외', () => {
    expect(isAutoReloadPath('/workspaces/w1/projects/p1')).toBe(true)
    expect(isAutoReloadPath('/graph')).toBe(true)
    expect(isAutoReloadPath('/demo')).toBe(true)
    expect(isAutoReloadPath('/auth/callback')).toBe(false)
    expect(isAutoReloadPath('/invite/abc')).toBe(false)
    expect(isAutoReloadPath('/demo-prep')).toBe(false)
    expect(isAutoReloadPath('')).toBe(false)
    expect(isAutoReloadPath(undefined)).toBe(false)
  })
})

describe('무한 새로고침 방지 (sessionStorage 1회 제한)', () => {
  it('같은 빌드 → 같은 배포 자동 새로고침은 한 번만 허용한다', () => {
    const storage = memoryStorage()
    expect(canAutoReload(storage, SHA_A, SHA_B)).toBe(true)
    expect(rememberAutoReload(storage, SHA_A, SHA_B, 1000)).toBe(true)
    // 새로고침 뒤에도 여전히 옛 빌드(SHA_A)로 열렸다 → 기록 유지, 다시 시도 안 함
    expect(settleAutoReload(storage, SHA_A)).toEqual({ arrived: false })
    expect(canAutoReload(storage, SHA_A, SHA_B)).toBe(false)
    // 더 새 배포가 나오면 다시 한 번 허용
    expect(canAutoReload(storage, SHA_A, 'build-20261006000000000')).toBe(true)
  })

  it('새 빌드로 도착하면 arrived를 알리고 기록을 지운다', () => {
    const storage = memoryStorage()
    rememberAutoReload(storage, SHA_A, SHA_B)
    expect(settleAutoReload(storage, SHA_B)).toEqual({ arrived: true })
    expect(storage.getItem(AUTO_RELOAD_RECORD_KEY)).toBeNull()
    expect(settleAutoReload(storage, SHA_B)).toEqual({ arrived: false })
  })

  it('다른 빌드에서 남은 오래된 기록은 지운다', () => {
    const storage = memoryStorage()
    rememberAutoReload(storage, 'build-1', 'build-2')
    expect(settleAutoReload(storage, SHA_A)).toEqual({ arrived: false })
    expect(storage.getItem(AUTO_RELOAD_RECORD_KEY)).toBeNull()
  })

  it('저장소가 없거나 오류를 내면 자동 새로고침하지 않는다', () => {
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => {} }
    expect(canAutoReload(null, SHA_A, SHA_B)).toBe(false)
    expect(canAutoReload(broken, SHA_A, SHA_B)).toBe(false)
    expect(rememberAutoReload(broken, SHA_A, SHA_B)).toBe(false)
    expect(settleAutoReload(broken, SHA_A)).toEqual({ arrived: false })
    // 같은 빌드끼리는 애초에 대상이 아니다
    expect(canAutoReload(memoryStorage(), SHA_A, SHA_A)).toBe(false)
  })

  it('깨진 기록은 없는 것으로 본다', () => {
    const storage = memoryStorage()
    storage.setItem(AUTO_RELOAD_RECORD_KEY, '{not json')
    expect(canAutoReload(storage, SHA_A, SHA_B)).toBe(true)
  })
})
