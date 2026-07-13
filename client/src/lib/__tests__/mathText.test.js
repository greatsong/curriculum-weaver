import { describe, it, expect } from 'vitest'
import { segmentText, unicodeRunToLatex, isMathRun } from '../../components/MathText.jsx'

function mathRuns(text) {
  return segmentText(text).filter((s) => s.math).map((s) => s.raw)
}

describe('unicodeRunToLatex', () => {
  it('√(...) → \\sqrt{...}', () => {
    expect(unicodeRunToLatex('y=√(ax+b)+c')).toBe('y=\\sqrt{ax+b}+c')
    expect(unicodeRunToLatex('y=√(kx)')).toBe('y=\\sqrt{kx}')
  })
  it('위첨자 → ^{...}', () => {
    expect(unicodeRunToLatex('y=xⁿ')).toBe('y=x^{n}')
    expect(unicodeRunToLatex('xⁿ')).toBe('x^{n}')
  })
  it('× → \\times, ÷ → \\div', () => {
    expect(unicodeRunToLatex('2×2')).toBe('2\\times 2')
  })
  it('분수 (A)/(B) → \\dfrac', () => {
    expect(unicodeRunToLatex('y=(ax+b)/(cx+d)')).toBe('y=\\dfrac{ax+b}{cx+d}')
  })
  it('∑ → \\sum', () => {
    expect(unicodeRunToLatex('∑')).toBe('\\sum ')
  })
})

describe('segmentText: 실제 성취기준 문자열', () => {
  it('무리함수 √ 렌더', () => {
    expect(mathRuns('무리함수 y=√(ax+b)+c의 그래프를 그릴 수 있고,')).toEqual(['y=√(ax+b)+c'])
  })
  it('무리함수 √(kx)', () => {
    expect(mathRuns('무리함수 y=√(kx)의 그래프를')).toEqual(['y=√(kx)'])
  })
  it('2×2 행렬', () => {
    expect(mathRuns('역행렬의 뜻을 알고, 2×2 행렬의 역행렬을')).toEqual(['2×2'])
  })
  it('∑ 단독 기호', () => {
    expect(mathRuns('∑ 의 뜻과 성질을 이해하고,')).toEqual(['∑'])
  })
  it('xⁿ 도함수 — 뒤 한글 괄호절은 평문', () => {
    expect(mathRuns('함수 y=xⁿ (n은 양의 정수)의 도함수를')).toEqual(['y=xⁿ'])
  })
  it('xⁿ(n은 실수) — 괄호 안 한글은 평문', () => {
    expect(mathRuns('xⁿ(n은 실수), 지수함수, 삼각함수의 부정적분과')).toEqual(['xⁿ'])
  })
  it('직선 y=x 대칭이동', () => {
    expect(mathRuns('원점, x축, y축, 직선 y=x에 대한 대칭이동')).toEqual(['y=x'])
  })
  it('유리함수 분수', () => {
    expect(mathRuns('유리함수 y=(ax+b)/(cx+d)의 그래프')).toEqual(['y=(ax+b)/(cx+d)'])
  })
})

describe('오탐 방지: [2수04-03] 기호 열거', () => {
  it('○, ×, / 는 수식으로 렌더하지 않는다', () => {
    const text = '자료를 분류하여 ○, ×, / 등을 이용한 그래프로'
    expect(mathRuns(text)).toEqual([])
  })
  it('(자연수) ÷ (자연수) 는 한글이라 평문', () => {
    const text = "'(자연수) ÷ (자연수)'에서 나눗셈의 몫을 분수로"
    expect(mathRuns(text)).toEqual([])
  })
  it('단독 라틴 문자 x축/y축은 평문', () => {
    // 강한 신호도 이항연산자도 없는 단일 문자는 수식 아님
    expect(isMathRun('x')).toBe(false)
    expect(isMathRun('y')).toBe(false)
  })
  it('평범한 숫자는 수식 아님', () => {
    expect(isMathRun('2022')).toBe(false)
    expect(isMathRun('10')).toBe(false)
  })
})
