import { describe, it, expect } from 'vitest'
import { micromark } from 'micromark'
import { fixEmphasisFlanking } from '../markdownFix'

// micromark(ReactMarkdown의 내부 파서)로 렌더해 <strong>이 생기고 '**'가 남지 않는지 확인
function rendersBold(text) {
  const html = micromark(fixEmphasisFlanking(text))
  return html.includes('<strong>') && !html.includes('**')
}

describe('fixEmphasisFlanking', () => {
  // 실제 DB에서 파싱 실패했던 AI 답변 패턴들
  it.each([
    '이 부분이 E-2의 **"팀 규칙이 실제로 제 역할을 했는가"**를 보여주는 사례',
    '실제 **보드 반영 제안(XML)**을 빠뜨렸네요',
    '**『어린 왕자』**가 핵심 텍스트로 활용',
    '**AI 관련 질문(Option 4)**에 대한 학생 반응',
    '다음 절차 **E-2-2 (수업 결과 성찰)**로 이동할까요?',
    '일시가 **7월 8일(수)**로 업데이트됐네요',
    '- 역량으로 **"질문 설계 능력"**, **"발표 및 전달력"**을 꼽음',
    '수업은 **2026년 7월 10일(금) 2교시**에 실행될 예정',
  ])('실패 패턴을 굵게 렌더링: %s', (text) => {
    expect(rendersBold(text)).toBe(true)
  })

  it('정상 볼드는 그대로 유지된다', () => {
    expect(rendersBold('정상 케이스 **굵게** 그대로')).toBe(true)
    expect(rendersBold('숫자 **1.5배** 유지')).toBe(true)
  })

  it('볼드가 없는 텍스트는 원본 그대로 반환한다', () => {
    const text = '그냥 평범한 문장입니다.'
    expect(fixEmphasisFlanking(text)).toBe(text)
  })

  it('코드 펜스 내부는 건드리지 않는다', () => {
    const text = '설명 **제안(A)**을 보세요\n```\n**"코드(x)"**를 그대로\n```\n끝'
    const fixed = fixEmphasisFlanking(text)
    expect(fixed).toContain('\n**"코드(x)"**를 그대로\n')
    // 펜스 밖은 보정됨
    expect(micromark(fixed)).toContain('<strong>')
  })

  it('인라인 코드 내부는 건드리지 않는다', () => {
    const text = '문서의 `**원본(a)**을` 표기와 **실제(b)**를 비교'
    const fixed = fixEmphasisFlanking(text)
    expect(fixed).toContain('`**원본(a)**을`')
    const html = micromark(fixed)
    // 코드 안의 **는 그대로, 코드 밖의 **는 <strong>으로
    expect(html).toContain('<code>**원본(a)**을</code>')
    expect(html).toContain('<strong>')
  })

  it('빈 값과 null을 안전하게 처리한다', () => {
    expect(fixEmphasisFlanking('')).toBe('')
    expect(fixEmphasisFlanking(null)).toBe(null)
    expect(fixEmphasisFlanking(undefined)).toBe(undefined)
  })
})
