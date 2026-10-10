/**
 * AI 모델 단가(백만 토큰당 달러) — 관리자 사용량 조회의 비용 추정용.
 * 출처·확인일: Anthropic은 claude-api 스킬 모델 표(2026-10-06 캐시), OpenAI는
 * developers.openai.com/api/docs/pricing Standard 등급(2026-10-10 확인). 실제 청구액의 정본은 각 사 콘솔이다.
 * in: 일반 입력, read: 캐시 읽기, write: 캐시 쓰기(5분), out: 출력(추론 포함)
 */
export const AI_PRICES = {
  'claude-sonnet-5-5': { in: 2, read: 0.2, write: 2.5, out: 10 },
  'claude-opus-5-5': { in: 4, read: 0.2, write: 5, out: 20 },
  'gpt-6-luna': { in: 0.10, read: 0.01, write: 0, out: 0.50 },
  'gpt-5.6-luna': { in: 0.20, read: 0.02, write: 0, out: 1.20 },
}

/**
 * 한 행(ai_usage)의 추정 비용. input_tokens는 캐시 포함 전체 입력이다.
 * @returns {number|null} 단가표에 없는 모델이면 null
 */
export function estimateCost(row) {
  const p = AI_PRICES[row?.model]
  if (!p) return null
  const read = row.cache_read_tokens || 0
  const write = row.cache_write_tokens || 0
  const plain = Math.max(0, (row.input_tokens || 0) - read - write)
  return (plain * p.in + read * p.read + write * p.write + (row.output_tokens || 0) * p.out) / 1e6
}
