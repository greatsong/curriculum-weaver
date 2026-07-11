/**
 * 절차 스킵 라우트 헬퍼·데이터 함수 테스트
 * - computeSkipCursorCorrection: 스킵 시 팀 커서 자동 보정 (순수 함수)
 * - supabaseService 스킵 함수: 인메모리 폴백 경로의 멱등성·추가/해제
 *   (Supabase env 미설정 상태에서 실행되므로 mem 폴백을 탄다)
 */
import { describe, it, expect } from 'vitest'
import { computeSkipCursorCorrection } from '../designs.js'
import { getProjectSkips, addProjectSkip, removeProjectSkip } from '../../lib/supabaseService.js'

describe('computeSkipCursorCorrection', () => {
  it('커서가 스킵 절차와 다르면 보정 없음', () => {
    expect(computeSkipCursorCorrection('A-1-1', 'T-2-2', ['T-2-2'])).toBeNull()
  })

  it('커서 = 스킵 절차면 다음 활성 절차로', () => {
    expect(computeSkipCursorCorrection('T-2-2', 'T-2-2', ['T-2-2'])).toBe('T-2-3')
  })

  it('다음도 스킵이면 연쇄 건너뛰기', () => {
    expect(computeSkipCursorCorrection('T-2-2', 'T-2-2', ['T-2-2', 'T-2-3'])).toBe('A-1-1')
  })

  it('뒤가 전부 끝이면 앞쪽 마지막 활성 절차로', () => {
    expect(computeSkipCursorCorrection('E-2-1', 'E-2-1', ['E-2-1'])).toBe('E-1-1')
  })

  it('앞뒤 모두 스킵인 극단 케이스도 활성 절차를 찾는다', () => {
    expect(computeSkipCursorCorrection('E-2-1', 'E-2-1', ['E-2-1', 'E-1-1'])).toBe('DI-2-1')
  })
})

describe('스킵 데이터 함수 (인메모리 폴백)', () => {
  const pid = 'test-project-skip-' + Math.random().toString(36).slice(2)

  it('초기 스킵 목록은 빈 배열', async () => {
    expect(await getProjectSkips(pid)).toEqual([])
  })

  it('스킵 추가 후 목록에 나타난다', async () => {
    await addProjectSkip(pid, 'T-2-2', 'user-1', '이미 팀 규칙이 있음')
    const skips = await getProjectSkips(pid)
    expect(skips).toHaveLength(1)
    expect(skips[0].procedure_code).toBe('T-2-2')
    expect(skips[0].reason).toBe('이미 팀 규칙이 있음')
    expect(skips[0].skipped_by).toBe('user-1')
  })

  it('중복 스킵은 멱등 — 기존 행 유지, 최초 사유 보존', async () => {
    await addProjectSkip(pid, 'T-2-2', 'user-2', '다른 사유')
    const skips = await getProjectSkips(pid)
    expect(skips).toHaveLength(1)
    expect(skips[0].reason).toBe('이미 팀 규칙이 있음')
  })

  it('해제하면 목록에서 사라진다', async () => {
    const removed = await removeProjectSkip(pid, 'T-2-2')
    expect(removed).toBe(true)
    expect(await getProjectSkips(pid)).toEqual([])
  })

  it('없는 스킵 해제는 no-op (멱등)', async () => {
    const removed = await removeProjectSkip(pid, 'T-2-2')
    expect(removed).toBe(false)
  })
})
