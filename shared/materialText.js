/** 본문 보존 한도와 AI 입력 한도를 분리한다. 새 DB 컬럼 없이 분석 JSON에 범위를 기록한다. */
export const MAX_MATERIAL_TEXT_CHARS = 1_000_000
export const MATERIAL_ANALYSIS_CHARS = 20_000

/** 질문의 단어가 있는 구간을 우선하고, 나머지는 문서 전체에 고르게 배분한다. */
export function selectMaterialExcerpts(value, budget, query = '') {
  const source = typeof value === 'string' ? value : ''
  const limit = Math.max(0, Math.floor(budget || 0))
  if (!limit || !source) return { text: '', sourceChars: source.length, includedChars: 0, complete: false }
  if (source.length <= limit) return { text: source, sourceChars: source.length, includedChars: source.length, complete: true }
  const size = Math.max(1, Math.min(2000, Math.floor(limit / 5)))
  const count = Math.floor(limit / size)
  const chunks = []
  const terms = [...new Set(String(query).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])]
    .flatMap(word => [word, word.replace(/(에서는|에서|으로|에는|은|는|을|를|이|가|의)$/, '')])
    .filter(word => word.length >= 2).slice(0, 40)
  for (let start = 0; start < source.length; start += size) {
    const text = source.slice(start, start + size)
    const lower = text.toLowerCase()
    let score = terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0)
    if (/마지막|결론|뒷부분|끝부분/.test(query) && start + size >= source.length) score += 3
    chunks.push({ start, text, score })
  }
  const selected = new Set()
  for (const chunk of [...chunks].filter(c => c.score > 0).sort((a, b) => b.score - a.score || a.start - b.start).slice(0, count)) {
    selected.add(chunk)
  }
  // 앞·중간·뒤를 함께 제공하여 앞부분만 읽고 전체를 요약하는 일을 피한다.
  for (let i = 0; i < count && selected.size < count; i++) {
    selected.add(chunks[Math.round(i * (chunks.length - 1) / Math.max(1, count - 1))])
  }
  const picked = [...selected].sort((a, b) => a.start - b.start)
  return {
    text: picked.map(c => `[원문 ${c.start + 1}–${c.start + c.text.length}자]\n${c.text}`).join('\n\n'),
    sourceChars: source.length,
    includedChars: picked.reduce((sum, c) => sum + c.text.length, 0),
    complete: false,
  }
}

/** 자료 관리와 채팅에서 동일한 분석 범위 안내를 사용한다. */
export function materialCoverageMessage(material) {
  const mode = material?.ai_analysis?.meta?.analysis_mode
  if (mode === 'vision_pdf' || mode === 'vision_image') return '원본을 시각적으로 분석했습니다. 요약을 활용하며 질문 시 검색할 추출 본문은 없습니다.'
  const coverage = material?.ai_analysis?.meta?.coverage
  if (!coverage) return '이전 분석 자료: 본문 반영 범위를 확인하려면 재분석해주세요.'
  const original = Number(coverage.source_chars || 0).toLocaleString('ko-KR')
  if (coverage.storage_truncated) return `긴 자료의 앞 ${Number(coverage.stored_chars).toLocaleString('ko-KR')}자만 보관했습니다(전체 ${original}자). 필요한 부분을 나누어 올려주세요.`
  if (coverage.analysis_truncated) return `전체 ${original}자 중 ${Number(coverage.analyzed_chars).toLocaleString('ko-KR')}자를 문서 전반에서 발췌해 요약했습니다. 질문에 따라 보관된 본문에서 관련 구간을 찾습니다.`
  return `추출된 본문 ${original}자 전체를 분석했습니다.`
}
