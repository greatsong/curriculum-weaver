import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import { REMARK_PLUGINS } from '../markdownPlugins'

const render = (md) => renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: REMARK_PLUGINS }, md))

describe('채팅 마크다운 물결표 처리', () => {
  it('기간·범위의 물결표 사이를 취소선으로 바꾸지 않는다 (2026-10-03 제보 문장)', () => {
    const html = render('[1주차] 분석 및 비전 수립(4.1~4.7): 주제 확정. · [2~3주차] 설계 및 활동 기획(4.8~4.21)')
    expect(html).not.toContain('<del>')
    expect(html).toContain('4.1~4.7')
    expect(html).toContain('[2~3주차]')
  })

  it('물결표 두 개로 쓴 의도한 취소선은 유지한다', () => {
    expect(render('~~삭제된 안~~ 확정안')).toContain('<del>삭제된 안</del>')
  })

  it('표 등 다른 GFM 기능은 그대로 동작한다', () => {
    expect(render('| 항목 | 내용 |\n|---|---|\n| 기간 | 3~4학년 |')).toContain('<table>')
  })
})
