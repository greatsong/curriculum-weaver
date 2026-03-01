import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * PDF/DOCX 파일에서 교육과정 성취기준을 추출하여 구조화된 JSON으로 변환
 *
 * @param {Buffer} fileBuffer - 업로드된 파일 버퍼
 * @param {string} fileType - 파일 확장자 (pdf, docx, doc)
 * @returns {{ standards: Array, links: Array, meta: object }}
 */
export async function extractStandardsFromFile(fileBuffer, fileType) {
  // 1. 텍스트 추출
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

  // 2. 긴 문서는 청크 분할하여 처리
  const MAX_CHUNK = 12000
  const chunks = splitIntoChunks(extractedText, MAX_CHUNK)
  const allStandards = []
  const allLinks = []

  for (const chunk of chunks) {
    const result = await extractWithAI(chunk)
    allStandards.push(...result.standards)
    allLinks.push(...result.links)
  }

  // 3. 중복 코드 제거
  const seen = new Set()
  const deduped = allStandards.filter(s => {
    if (seen.has(s.code)) return false
    seen.add(s.code)
    return true
  })

  return {
    standards: deduped,
    links: allLinks,
    meta: {
      source_type: fileType,
      extracted_chars: extractedText.length,
      chunks_processed: chunks.length,
      total_standards: deduped.length,
      total_links: allLinks.length,
    },
  }
}

/**
 * AI를 사용하여 텍스트에서 성취기준 구조화 추출
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

4. **keywords**: 성취기준 내용에서 핵심 명사 3~5개 추출

5. **교과 간 연결(links)**: 같은 문서 내에서 자연스럽게 연결되는 성취기준 쌍이 있으면 포함
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
      "area": "물질의 성질",
      "content": "원소를 성질에 따라 분류하고 주기율표에서의 위치와 관련지을 수 있다.",
      "keywords": ["원소", "분류", "주기율표", "성질"]
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
