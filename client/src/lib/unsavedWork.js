/**
 * 미저장 작업 신고 창구 — 새 배포 자동 새로고침이 사용자의 작업을 지우지 않게 한다.
 *
 * 입력란 글자만으로는 알 수 없는 작업(보드 편집 초안, 설정 마법사 진행, 시뮬레이션 생성)을
 * 컴포넌트가 직접 신고한다. 신고가 하나라도 있으면 자동 새로고침을 하지 않는다(reloadSafety.js).
 */
import { useEffect } from 'react'

const holds = new Map() // token → reason
let seq = 0

/**
 * 미저장 작업을 등록한다. 반환한 함수를 부르면 해제된다(여러 번 불러도 안전).
 * @param {string} reason - deployVersion.js의 RELOAD_BLOCK_LABELS 키 (board-edit, setup, simulation…)
 */
export function holdUnsavedWork(reason) {
  const token = ++seq
  holds.set(token, String(reason || 'unknown'))
  return () => { holds.delete(token) }
}

/** 지금 등록된 미저장 작업 이유 목록(중복 제거) */
export function listUnsavedWork() {
  return [...new Set(holds.values())]
}

/** 테스트 전용: 등록을 모두 지운다 */
export function resetUnsavedWorkForTest() {
  holds.clear()
}

/**
 * active인 동안 미저장 작업으로 신고한다. 컴포넌트가 사라지면 자동 해제.
 * @param {string} reason
 * @param {boolean} active
 */
export function useUnsavedWork(reason, active) {
  useEffect(() => {
    if (!active) return undefined
    return holdUnsavedWork(reason)
  }, [reason, active])
}
