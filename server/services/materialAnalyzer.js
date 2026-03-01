import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * 업로드된 자료를 분석하는 비동기 파이프라인
 */
export async function analyzeMaterial(materialId, fileBuffer, fileType) {
  // 처리 중 상태로 변경
  await supabaseAdmin
    .from('materials')
    .update({ processing_status: 'processing' })
    .eq('id', materialId)

  try {
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
    } else if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileType)) {
      // 이미지는 텍스트 추출 불가 → AI에게 이미지 설명 요청 (향후 구현)
      extractedText = '[이미지 파일 — AI 분석 필요]'
    } else {
      extractedText = '[지원하지 않는 파일 형식]'
    }

    // 텍스트가 너무 길면 앞부분만 사용
    const truncatedText = extractedText.slice(0, 10000)

    // 2. AI 분석
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `다음은 교사가 융합 수업 설계 과정에서 업로드한 자료의 텍스트입니다. 분석해주세요.

## 자료 내용
${truncatedText}

## 분석 요청
다음을 JSON으로 응답해주세요:
{
  "material_type": "교과서단원 | 수업지도안 | 활동지 | 뉴스기사 | 학교문서 | 학생결과물 | 기타",
  "summary": "자료의 핵심 내용 2~3줄 요약",
  "curriculum_connections": ["관련될 수 있는 성취기준 코드 (있는 경우)"],
  "design_suggestions": ["현재 설계에 이 자료를 활용할 수 있는 구체적 제안"],
  "key_insights": ["이 자료에서 발견한 수업 설계에 유용한 인사이트"]
}`,
      }],
    })

    const aiText = response.content[0].text
    let aiAnalysis = {}
    let aiSummary = ''

    try {
      // JSON 블록 추출
      const jsonMatch = aiText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        aiAnalysis = JSON.parse(jsonMatch[0])
        aiSummary = aiAnalysis.summary || ''
      }
    } catch {
      aiSummary = aiText.slice(0, 500)
      aiAnalysis = { raw: aiText }
    }

    // 3. DB 업데이트
    await supabaseAdmin
      .from('materials')
      .update({
        extracted_text: truncatedText,
        ai_summary: aiSummary,
        ai_analysis: aiAnalysis,
        processing_status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', materialId)

  } catch (error) {
    console.error('자료 분석 실패:', error)
    await supabaseAdmin
      .from('materials')
      .update({
        processing_status: 'failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', materialId)
  }
}
