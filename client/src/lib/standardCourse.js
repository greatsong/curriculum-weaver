/**
 * 성취기준 표시용 과목 이름과 같은 문장 판정.
 *
 * 정본에서 공통영어1·공통영어2(기본영어1·2도 같음)는 교과 이름이 "공통영어1·2" 하나로 저장돼 있고,
 * 두 과목에 문장이 같은 성취기준이 많다([10공영1-02-04] = [10공영2-02-04] 등). 화면에서 과목을
 * 가를 단서가 코드 속 숫자뿐이라, 교사가 원하지 않은 과목의 코드를 담는 일이 생겼다(2026-10-03 제보).
 */

// "공통영어1·2"처럼 두 과목을 한 이름으로 묶은 교과
const PAIR_SUBJECT = /^(.+?)(\d)·(\d)$/
// 코드 앞부분의 과목 번호: [10공영2-02-04] → 2
const CODE_COURSE_DIGIT = /^\[\d{1,2}[가-힣]+?(\d)-/

/** 표시용 과목 이름. 묶인 교과는 코드 번호로 "공통영어2"처럼 가르고, 그 밖에는 교과 이름 그대로 */
export function courseLabel(std) {
  const subject = typeof std?.subject === 'string' ? std.subject : ''
  const pair = subject.match(PAIR_SUBJECT)
  if (!pair) return subject
  const digit = String(std?.code || '').match(CODE_COURSE_DIGIT)?.[1]
  if (digit && (digit === pair[2] || digit === pair[3])) return `${pair[1]}${digit}`
  return subject
}

/** 문장 비교용 정규화: 공백 묶기, 끝 마침표 제거 */
export function normalizeStandardText(text) {
  return String(text || '').replace(/\s+/g, ' ').replace(/[.。]\s*$/, '').trim()
}

/**
 * 이미 담은 성취기준 가운데 std와 문장이 같고 코드(키)가 다른 것을 찾는다. 없으면 null.
 * @param {object} std 검색 결과·추천 성취기준
 * @param {Array} entries 프로젝트에 담긴 항목({ curriculum_standards })
 * @param {(entry) => string} entryKey 담긴 항목의 키
 * @param {string} stdKey std의 키
 */
export function findSameTextAdded(std, entries, entryKey, stdKey) {
  const text = normalizeStandardText(std?.content)
  if (!text || !Array.isArray(entries)) return null
  for (const entry of entries) {
    const other = entry?.curriculum_standards
    if (!other || entryKey(entry) === stdKey) continue
    if (normalizeStandardText(other.content) === text) return other
  }
  return null
}
