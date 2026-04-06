/**
 * 성취기준 코드 검증 유틸리티
 *
 * AI가 생성한 성취기준 코드를 실제 DB(인메모리)와 대조하여
 * 할루시네이션을 방지한다.
 *
 * 3가지 핵심 함수:
 *  - validateCode(code)        : 단일 코드 검증 + 유사 코드 추천
 *  - validateBoardStandards()  : A-2-1 보드 전체 검증/교정
 *  - getStandardsForSubjects() : 교과+학년에 해당하는 실제 성취기준 목록 반환
 */

import { Standards } from './store.js'

// ── 성취기준 코드 정규식 ──
// 예: [9과05-01], [4수02-03], [12통합01-02], [10과탐1-01-01], [공관 01-01-01]
const CODE_REGEX = /\[[\d\w가-힣 ]+-[\d]+-[\d]+\]|\[[\d\w가-힣 ]+[\d]+-[\d]+\]/g

/**
 * 두 문자열 간 편집 거리 (Levenshtein distance)
 */
function editDistance(a, b) {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

/**
 * 단일 성취기준 코드 검증
 *
 * @param {string} code - 검증할 코드 (예: "[9과05-01]")
 * @returns {{ valid: boolean, matched?: object, suggestion?: object, distance?: number }}
 */
export function validateCode(code) {
  if (!code || typeof code !== 'string') {
    return { valid: false }
  }

  // 앞뒤 공백 제거
  code = code.trim()

  // 정확히 일치하는 코드 찾기
  const exact = Standards.getByCode(code)
  if (exact) {
    return { valid: true, matched: exact }
  }

  // 대괄호 정규화
  const normalized = code.startsWith('[') ? code : `[${code}]`
  const exactNorm = Standards.getByCode(normalized)
  if (exactNorm) {
    return { valid: true, matched: exactNorm }
  }

  // 유사 코드 추천 (편집거리 기반)
  const allStandards = Standards.list()
  let bestMatch = null
  let bestDist = Infinity

  for (const std of allStandards) {
    const dist = editDistance(normalized, std.code)
    if (dist < bestDist) {
      bestDist = dist
      bestMatch = std
    }
    if (dist === 0) break // 정확 일치
  }

  // 편집거리 3 이하면 추천
  if (bestMatch && bestDist <= 3) {
    return { valid: false, suggestion: bestMatch, distance: bestDist }
  }

  return { valid: false }
}

/**
 * A-2-1 보드의 성취기준 테이블 검증 및 자동 교정
 *
 * @param {object} boardContent - A-2-1 (standards_analysis) 보드 content
 * @param {object} [options]
 * @param {boolean} [options.strict=false] - true이면 교정 불가 행을 제거 (가짜 데이터 영속화 방지)
 * @returns {{ corrected: object, issues: Array<{ row: number, original: string, correctedTo?: string, status: string }> }}
 */
export function validateBoardStandards(boardContent, { strict = false } = {}) {
  const issues = []
  if (!boardContent?.standards || !Array.isArray(boardContent.standards)) {
    return { corrected: boardContent, issues }
  }

  const correctedStandards = []
  for (let idx = 0; idx < boardContent.standards.length; idx++) {
    const row = boardContent.standards[idx]
    if (!row.code) {
      if (!strict) correctedStandards.push(row)
      continue
    }

    const result = validateCode(row.code)

    if (result.valid) {
      // 유효한 코드 — content도 실제 데이터로 교정
      const correctedRow = { ...row }
      if (result.matched && result.matched.content !== row.content) {
        correctedRow.content = result.matched.content
      }
      correctedStandards.push(correctedRow)
      continue
    }

    if (result.suggestion) {
      // 유사 코드로 교정
      issues.push({
        row: idx + 1,
        original: row.code,
        correctedTo: result.suggestion.code,
        status: 'auto_corrected',
        distance: result.distance,
      })
      correctedStandards.push({
        ...row,
        code: result.suggestion.code,
        content: result.suggestion.content,
      })
      continue
    }

    // 교정 불가
    issues.push({
      row: idx + 1,
      original: row.code,
      status: 'invalid',
    })
    if (!strict) {
      correctedStandards.push(row) // 비엄격: 원본 유지
    }
    // strict: 행 자체를 제거 — 가짜 데이터 영속화 방지
  }

  return {
    corrected: { ...boardContent, standards: correctedStandards },
    issues,
  }
}

/**
 * 교과군 + 학년(학교급)에 해당하는 실제 성취기준 목록 반환
 * 데모 모드에서 AI 프롬프트에 주입하기 위한 용도
 *
 * @param {string[]} subjects - 교과군 이름 배열 (예: ["과학", "수학"])
 * @param {string} grade - 학년 텍스트 (예: "중학교 2학년", "초등학교 5학년")
 * @returns {{ standards: object[], text: string }}
 */
export function getStandardsForSubjects(subjects, grade) {
  const allStandards = Standards.list()
  if (allStandards.length === 0) {
    return { standards: [], text: '' }
  }

  // 학년 텍스트에서 학년군 매칭 (변형 포함)
  const gradeGroups = resolveGradeGroups(grade)

  // 교과군 필터 (subject_group 또는 subject로 정확 매칭 우선)
  // 품질 플래그가 나쁜 항목은 AI 프롬프트에서 제외
  const filtered = allStandards.filter((s) => {
    if (s._quality && s._quality !== 'ok') return false

    const subjectMatch = subjects.some((subj) =>
      s.subject_group === subj || s.subject === subj
    )
    if (!subjectMatch) return false

    // 학년군 필터 (gradeGroups 배열에 포함되면 통과)
    if (gradeGroups) {
      return gradeGroups.includes(s.grade_group)
    }
    return true
  })

  // 프롬프트용 텍스트 생성 (교과별 그룹)
  const bySubject = {}
  for (const s of filtered) {
    const key = s.subject_group || s.subject
    if (!bySubject[key]) bySubject[key] = []
    bySubject[key].push(s)
  }

  const textParts = []
  for (const [subj, stds] of Object.entries(bySubject)) {
    textParts.push(`### ${subj} (${stds.length}개)`)
    for (const s of stds) {
      textParts.push(`  ${s.code} ${s.content}`)
    }
  }

  return {
    standards: filtered,
    text: textParts.join('\n'),
  }
}

/**
 * 학년 텍스트를 grade_group 값 배열로 변환
 * DB에 '중1-3'과 '중1~3' 형식이 혼재하므로 가능한 변형을 모두 반환
 *
 * "중학교 2학년" → ["중1-3", "중1~3"]
 * "초등학교 5학년" → ["초5-6"]
 */
function resolveGradeGroups(grade) {
  if (!grade) return null
  const g = grade.replace(/\s+/g, '')

  // 패턴 매칭 → 가능한 변형 모두 반환
  if (/중학교|중[1-3]|중1[~-]3/.test(g)) return ['중1-3', '중1~3']
  if (/초등.*[56]|초[56]/.test(g)) return ['초5-6', '초6']
  if (/초등.*[34]|초[34]/.test(g)) return ['초3-4', '초4']
  if (/초등.*[12]|초[12]/.test(g)) return ['초2', '초1-2']
  if (/고1|고등학교\s*1|고공통/.test(g)) return ['고공통']          // 고1은 공통과목만
  if (/고[23]|고등학교\s*[23]|고.*선택/.test(g)) return ['고선택']  // 고2-3은 선택과목
  if (/고등학교/.test(g)) return ['고공통']                          // 일반 '고등학교'는 공통 우선

  return null
}

/**
 * 텍스트에서 성취기준 코드를 추출하여 검증
 * AI 응답 텍스트에 포함된 모든 성취기준 코드를 찾아 검증
 *
 * @param {string} text - AI 응답 텍스트
 * @returns {{ codes: Array<{ code: string, valid: boolean, suggestion?: string }> }}
 */
export function validateCodesInText(text) {
  if (!text) return { codes: [] }

  const matches = text.match(CODE_REGEX) || []
  const uniqueCodes = [...new Set(matches)]

  return {
    codes: uniqueCodes.map((code) => {
      const result = validateCode(code)
      return {
        code,
        valid: result.valid,
        suggestion: result.suggestion?.code || null,
      }
    }),
  }
}
