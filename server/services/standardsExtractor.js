import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * PDF/DOCX 파일에서 교육과정 성취기준을 추출하여 구조화된 JSON으로 변환
 * 확장 스키마 지원: explanation, application_notes, domain, school_level, curriculum_category
 *
 * 하이브리드 접근:
 * 1단계: 정규식 기반 추출 (무료, 한국 교육과정 PDF에 정확)
 * 2단계: AI 추출 (비표준 형식일 때만 fallback)
 *
 * @param {Buffer} fileBuffer - 업로드된 파일 버퍼
 * @param {string} fileType - 파일 확장자 (pdf, docx, doc)
 * @returns {{ standards: Array, links: Array, meta: object }}
 */
export async function extractStandardsFromFile(fileBuffer, fileType) {
  let extractedText = ''

  if (fileType === 'pdf') {
    const pdfParse = (await import('pdf-parse')).default
    const result = await pdfParse(fileBuffer)
    extractedText = result.text
  } else if (fileType === 'docx' || fileType === 'doc') {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer: fileBuffer })
    extractedText = result.value
  } else {
    throw new Error(`지원하지 않는 파일 형식: ${fileType}`)
  }

  if (!extractedText.trim()) {
    throw new Error('파일에서 텍스트를 추출할 수 없습니다.')
  }

  // 1단계: 정규식 기반 추출 시도
  const regexResult = extractWithRegex(extractedText)

  // 정규식으로 충분히 추출된 경우 바로 반환
  if (regexResult.standards.length >= 3) {
    console.log(`정규식 추출 성공: ${regexResult.standards.length}개 성취기준`)
    return {
      ...regexResult,
      meta: {
        source_type: fileType,
        extraction_method: 'regex',
        extracted_chars: extractedText.length,
        total_standards: regexResult.standards.length,
        total_links: regexResult.links.length,
      }
    }
  }

  // 2단계: AI 보정 (정규식 실패 시)
  console.log(`정규식 추출 부족 (${regexResult.standards.length}개). AI 추출 시도...`)
  const aiResult = await extractWithAIExpanded(extractedText)

  // 정규식 + AI 결과 합치기
  const merged = mergeResults(regexResult, aiResult)

  return {
    ...merged,
    meta: {
      source_type: fileType,
      extraction_method: 'hybrid',
      extracted_chars: extractedText.length,
      regex_count: regexResult.standards.length,
      ai_count: aiResult.standards.length,
      total_standards: merged.standards.length,
      total_links: merged.links.length,
    }
  }
}

/**
 * 정규식 기반 교육과정 성취기준 추출 (확장 스키마)
 * 한국 교과서의 표준 형식을 빠르고 정확하게 추출
 */
function extractWithRegex(text) {
  const standards = []
  const explanations = {}
  const applicationNotes = {}

  // 성취기준 코드 패턴: [학년군교과영역-순번]
  // 예: [4사01-01], [9과02-01], [12경제01-01]
  const codePattern = /\[(\d{1,2}[가-힣()]+\d{2}-\d{2})\]/g

  // 모든 코드 위치 찾기
  const codePositions = []
  let match
  while ((match = codePattern.exec(text)) !== null) {
    codePositions.push({ code: match[1], fullCode: match[0], index: match.index })
  }

  // 중복 코드 제거 (첫 번째 등장만 유지하고, 해설 영역의 등장은 해설로 처리)
  const seenCodes = new Map()  // code -> { content, index }

  for (let i = 0; i < codePositions.length; i++) {
    const { code, fullCode, index } = codePositions[i]
    const nextIndex = i + 1 < codePositions.length ? codePositions[i + 1].index : index + 2000
    const textAfter = text.slice(index + fullCode.length, Math.min(nextIndex, index + 2000)).trim()

    // 해설 섹션인지 확인 (코드 앞 300자에 '해설' 또는 '성취기준 해설'이 있는지)
    const textBefore = text.slice(Math.max(0, index - 300), index)
    const isExplanation = /(?:성취기준\s*해설|[가-힣]\)\s*성취기준\s*해설|\(가\)\s*성취기준\s*해설)/.test(textBefore)

    // 적용 시 고려사항 섹션인지 확인
    const isApplicationNotes = /성취기준\s*적용\s*시\s*고려\s*사항/.test(textBefore)

    if (isExplanation) {
      // 해설 영역의 성취기준 코드 → 해설 텍스트 저장
      const explanationText = textAfter.split(/\n{2,}|\[/)[0].trim()
      if (explanationText.length > 10) {
        explanations[code] = explanationText
      }
    } else if (isApplicationNotes) {
      // 적용 시 고려사항
      const notesText = textAfter.split(/\n{2,}|\[/)[0].trim()
      if (notesText.length > 10) {
        applicationNotes[code] = notesText
      }
    } else if (!seenCodes.has(code)) {
      // 최초 등장 → 성취기준 본문
      const contentText = textAfter.split(/\n{2,}|\[\d/)[0].trim()
      if (contentText.length > 5) {
        seenCodes.set(code, { content: contentText, index })
      }
    }
  }

  // 성취기준 객체 생성
  for (const [code, data] of seenCodes) {
    const parsed = parseStandardCode(code)
    if (!parsed) continue

    const keywords = extractKeywords(data.content)

    standards.push({
      code: `[${code}]`,
      subject: parsed.subject,
      grade_group: parsed.grade_group,
      school_level: parsed.school_level,
      curriculum_category: parsed.curriculum_category,
      domain: parsed.domain || '',
      area: parsed.area || '',
      content: data.content,
      keywords,
      explanation: explanations[code] || '',
      application_notes: applicationNotes[code] || '',
    })
  }

  return { standards, links: [] }
}

/**
 * 성취기준 코드 파싱
 * 예: 4사01-01, 9과02-01, 12경제01-01
 */
function parseStandardCode(code) {
  // 초등 3-4학년: 4사01-01
  if (/^4/.test(code)) {
    const subjectMatch = code.match(/^4([가-힣]+)/)
    return {
      subject: mapSubjectName(subjectMatch?.[1] || ''),
      grade_group: '초3-4',
      school_level: '초등학교',
      curriculum_category: '공통',
      domain: guessDomain(code, subjectMatch?.[1] || ''),
      area: '',
    }
  }

  // 초등 5-6학년: 6사01-01
  if (/^6/.test(code)) {
    const subjectMatch = code.match(/^6([가-힣]+)/)
    return {
      subject: mapSubjectName(subjectMatch?.[1] || ''),
      grade_group: '초5-6',
      school_level: '초등학교',
      curriculum_category: '공통',
      domain: guessDomain(code, subjectMatch?.[1] || ''),
      area: '',
    }
  }

  // 중학교: 9사(지리)01-01 or 9과01-01
  if (/^9/.test(code)) {
    const subjectMatch = code.match(/^9([가-힣]+(?:\([가-힣]+\))?)/)
    return {
      subject: mapSubjectName(subjectMatch?.[1] || ''),
      grade_group: '중1-3',
      school_level: '중학교',
      curriculum_category: '공통',
      domain: guessDomain(code, subjectMatch?.[1] || ''),
      area: '',
    }
  }

  // 고등학교: 12경제01-01
  if (/^12/.test(code)) {
    const subjectMatch = code.match(/^12([가-힣]+)/)
    const info = mapHighSchoolSubject(subjectMatch?.[1] || '')
    return {
      ...info,
      grade_group: '고선택',
      school_level: '고등학교',
      area: '',
    }
  }

  return null
}

/**
 * 교과명 매핑
 */
function mapSubjectName(raw) {
  const map = {
    '사': '사회', '과': '과학', '수': '수학', '국': '국어', '영': '영어',
    '도': '도덕', '음': '음악', '미': '미술', '체': '체육', '정': '정보',
    '기가': '기술·가정', '실': '실과',
    '사(지리)': '사회', '사(일반)': '사회', '사(역사)': '사회',
    '역': '역사',
  }
  return map[raw] || raw
}

/**
 * 고등학교 선택과목 매핑
 */
function mapHighSchoolSubject(raw) {
  const map = {
    '정치': { subject: '정치', curriculum_category: '일반선택', domain: '일반사회' },
    '법과': { subject: '법과사회', curriculum_category: '일반선택', domain: '일반사회' },
    '경제': { subject: '경제', curriculum_category: '일반선택', domain: '일반사회' },
    '사회문화': { subject: '사회와문화', curriculum_category: '일반선택', domain: '일반사회' },
    '사문': { subject: '사회와문화', curriculum_category: '일반선택', domain: '일반사회' },
    '세계사': { subject: '세계사', curriculum_category: '일반선택', domain: '역사' },
    '한국지리': { subject: '한국지리탐구', curriculum_category: '진로선택', domain: '지리' },
    '세계시민': { subject: '세계시민과지리', curriculum_category: '진로선택', domain: '지리' },
    '여행지리': { subject: '여행지리', curriculum_category: '융합선택', domain: '지리' },
    '역사로': { subject: '역사로탐구하는현대세계', curriculum_category: '진로선택', domain: '역사' },
    '역사탐구': { subject: '역사로탐구하는현대세계', curriculum_category: '진로선택', domain: '역사' },
    '동아시아': { subject: '동아시아역사기행', curriculum_category: '진로선택', domain: '역사' },
    '사회문제': { subject: '사회문제탐구', curriculum_category: '진로선택', domain: '일반사회' },
    '금융': { subject: '금융과경제생활', curriculum_category: '융합선택', domain: '일반사회' },
    '기후': { subject: '기후변화와지속가능한세계', curriculum_category: '융합선택', domain: '지리' },
    '도시': { subject: '도시의미래탐구', curriculum_category: '융합선택', domain: '지리' },
    '국제': { subject: '국제관계의이해', curriculum_category: '진로선택', domain: '일반사회' },
    '한국사': { subject: '한국사', curriculum_category: '공통', domain: '역사' },
    '통합사회': { subject: '통합사회', curriculum_category: '공통', domain: '일반사회' },
  }
  return map[raw] || { subject: raw, curriculum_category: '일반선택', domain: '' }
}

/**
 * 영역(domain) 추측
 */
function guessDomain(code, subjectRaw) {
  if (subjectRaw.includes('지리') || subjectRaw === '사(지리)') return '지리'
  if (subjectRaw.includes('역사') || subjectRaw === '사(역사)' || subjectRaw === '역') return '역사'
  if (subjectRaw.includes('일반') || subjectRaw === '사(일반)') return '일반사회'

  // 초등 사회: 영역번호로 추측
  const areaNum = code.match(/\d{2}(?=-)/)?.[0]
  if (areaNum) {
    const num = parseInt(areaNum)
    if (code.startsWith('4사') || code.startsWith('6사')) {
      if (num <= 1 || num === 5 || num === 10) return '지리'
      if (num >= 2 && num <= 4) return '역사'
      return '일반사회'
    }
  }

  return ''
}

/**
 * 키워드 추출 (간단한 한국어 명사 추출)
 */
function extractKeywords(text) {
  // 한국어 조사/어미 제거 후 핵심 명사 추출
  const particles = /[은는이가을를에서의로와과도만까지]$/
  const words = text.replace(/[.,;:!?""''()[\]]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && w.length <= 10)
    .map(w => w.replace(particles, ''))
    .filter(w => w.length >= 2 && !/^(할|수|있다|한다|등|및|또는|그리고|이를|것을|통해|위한|대한|대해|관한|바탕|활용|이해|설명|분석|탐구|조사)$/.test(w))

  // 빈도수 기반 상위 5개
  const freq = {}
  for (const w of words) freq[w] = (freq[w] || 0) + 1
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w)
}

/**
 * AI 기반 확장 스키마 추출 (fallback)
 */
async function extractWithAIExpanded(text) {
  const MAX_CHUNK = 12000
  const chunks = splitIntoChunks(text, MAX_CHUNK)
  const allStandards = []
  const allLinks = []

  for (const chunk of chunks) {
    const result = await extractWithAI(chunk)
    allStandards.push(...result.standards)
    allLinks.push(...result.links)
  }

  const seen = new Set()
  const deduped = allStandards.filter(s => {
    if (seen.has(s.code)) return false
    seen.add(s.code)
    return true
  })

  return { standards: deduped, links: allLinks }
}

/**
 * 정규식과 AI 결과 병합 (정규식 데이터 우선, AI로 부족한 필드 채우기)
 */
function mergeResults(regexResult, aiResult) {
  const merged = [...regexResult.standards]
  const codeMap = new Map()

  // 정규식 결과를 코드로 인덱싱
  for (const s of regexResult.standards) {
    codeMap.set(s.code, s)
  }

  // AI 결과에서 정규식에 없는 코드 추가
  for (const aiStandard of aiResult.standards) {
    if (!codeMap.has(aiStandard.code)) {
      merged.push(aiStandard)
    }
  }

  return {
    standards: merged,
    links: regexResult.links.concat(aiResult.links),
  }
}

/**
 * AI를 사용하여 텍스트에서 성취기준 구조화 추출 (확장 스키마)
 */
async function extractWithAI(text) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: `다음은 한국 교육과정 문서에서 추출한 텍스트입니다. 이 텍스트에서 **교육과정 성취기준**을 찾아 구조화된 JSON으로 변환해주세요.

## 추출 규칙

1. **성취기준 코드** 형식: \`[학년군교과영역-순번]\`
   - 예: \`[9과02-01]\` = 중학교(9) 과학(과) 물질(02) 1번
   - 예: \`[6수01-01]\` = 초등5-6(6) 수학(수) 수와연산(01) 1번
   - 예: \`[12미01-01]\` = 고등(12) 미술(미) 체험(01) 1번
   - 코드가 문서에 명시되어 있지 않으면, 맥락에서 학년/교과/영역을 판단하여 생성하세요.

2. **학년군(grade_group)** 값:
   - 초1-2, 초3-4, 초5-6, 중1-3, 고1, 고선택

3. **교과(subject)** 값:
   - 국어, 수학, 과학, 사회, 영어, 도덕, 기술·가정, 정보, 미술, 음악, 체육, 실과, 한국사, 통합사회, 통합과학 등

4. **school_level**: 초등학교, 중학교, 고등학교

5. **curriculum_category**: 공통, 일반선택, 진로선택, 융합선택

6. **domain**: 지리, 역사, 일반사회, 물질, 생명 등 구체적 영역

7. **keywords**: 성취기준 내용에서 핵심 명사 3~5개 추출

8. **explanation**: 성취기준 해설 텍스트 (없으면 빈 문자열)

9. **application_notes**: 성취기준 적용 시 고려사항 (없으면 빈 문자열)

10. **교과 간 연결(links)**: 같은 문서 내에서 자연스럽게 연결되는 성취기준 쌍이 있으면 포함
    - link_type: cross_subject, same_concept, prerequisite, application

## 입력 텍스트
${text}

## 응답 형식 (반드시 이 JSON 형식으로만 응답)
\`\`\`json
{
  "standards": [
    {
      "code": "[9과02-01]",
      "subject": "과학",
      "grade_group": "중1-3",
      "school_level": "중학교",
      "curriculum_category": "공통",
      "domain": "물질",
      "area": "물질의 성질",
      "content": "원소를 성질에 따라 분류하고 주기율표에서의 위치와 관련지을 수 있다.",
      "keywords": ["원소", "분류", "주기율표", "성질"],
      "explanation": "해설 텍스트 (없으면 빈 문자열)",
      "application_notes": "적용 시 고려사항 (없으면 빈 문자열)"
    }
  ],
  "links": [
    {
      "source": "[9과02-01]",
      "target": "[9수01-01]",
      "link_type": "cross_subject",
      "rationale": "연결 근거"
    }
  ]
}
\`\`\`

성취기준이 없는 텍스트라면 빈 배열을 반환하세요: \`{"standards":[],"links":[]}\``,
    }],
  })

  const aiText = response.content[0].text

  try {
    const jsonMatch = aiText.match(/```json\s*([\s\S]*?)\s*```/) || aiText.match(/(\{[\s\S]*\})/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1])
      return {
        standards: Array.isArray(parsed.standards) ? parsed.standards : [],
        links: Array.isArray(parsed.links) ? parsed.links : [],
      }
    }
  } catch {
    console.warn('성취기준 추출 JSON 파싱 실패, 원문:', aiText.slice(0, 200))
  }

  return { standards: [], links: [] }
}

/**
 * 긴 텍스트를 문단 단위로 분할
 */
function splitIntoChunks(text, maxLen) {
  if (text.length <= maxLen) return [text]

  const chunks = []
  const paragraphs = text.split(/\n{2,}/)
  let current = ''

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > maxLen && current) {
      chunks.push(current)
      current = para
    } else {
      current = current ? current + '\n\n' + para : para
    }
  }
  if (current) chunks.push(current)

  return chunks
}
