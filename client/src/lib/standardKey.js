/**
 * 성취기준 식별자 헬퍼 (2026-09-05 복합 키 전환)
 *
 * 교육부 성취기준 코드는 과목 간에 충돌한다([12심독…] 심화 영어 독해와 작문/심화 독일어,
 * [12스문…] 스포츠 문화/스페인어권 문화). 그래서 앱 식별자는 (code, subject) 복합 키다.
 * 서버는 모든 성취기준 객체에 `key`를 준다 — 충돌이 없으면 code와 같고,
 * 충돌 레코드만 "code|과목" 형태다. 링크 끝점·서버 요청 파라미터·담기·선택 상태·맵 키는
 * 전부 이 key를 쓰고, 화면 표시는 계속 code를 쓴다 (사용자에게 "|과목" 접미가 보이면 안 됨).
 *
 * 서버가 아직 key를 주지 않는 응답에도 안전하도록 code로 폴백한다.
 */

/** 성취기준 객체 → 식별 키 (key 우선, 없으면 code) */
export const standardKey = (s) => s?.key ?? s?.code ?? null

/** 프로젝트 성취기준 행({ curriculum_standards }) 또는 성취기준 객체 → 식별 키 */
export const projectStandardKey = (entry) => standardKey(entry?.curriculum_standards ?? entry)

/**
 * 키만 있는 값(링크 끝점·URL·담기 저장값)에서 표시용 코드를 뽑는다.
 * "[12심독01-01]|심화 독일어" → "[12심독01-01]", 일반 코드는 그대로.
 */
export const codeFromKey = (k) => (typeof k === 'string' ? k.split('|')[0] : k ?? '')

/** 키에 과목 접미가 있으면 그 과목명, 없으면 null */
export const subjectFromKey = (k) => {
  if (typeof k !== 'string') return null
  const i = k.indexOf('|')
  return i >= 0 ? k.slice(i + 1) || null : null
}

/**
 * 두 성취기준 키의 순서 무관 로컬 조합 ID (신고 상태·시나리오 열림 여부 등 클라이언트 전용 키).
 * 키 자체에 '|'가 들어갈 수 있어 다른 구분자를 쓴다. 서버로 보내지 않는다.
 */
export const pairId = (...keys) => [...keys].filter(Boolean).sort().join('')
