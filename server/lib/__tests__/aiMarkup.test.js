import { describe, it, expect } from 'vitest'
import { stripLeftoverAiMarkup } from '../aiMarkup.js'

describe('stripLeftoverAiMarkup — 남은 제안 원문 지우기', () => {
  it('길이 한도에서 끊긴 제안 블록은 여는 태그부터 끝까지 지운다(운영 사례)', () => {
    const cut = '**반영 확인**: 9개 활동 초안이 저장되어 있습니다.\n\n<ai_suggestion type="board_update" procedure="Ds-3"> {"activities":[{"title":"활동 1"}],"note":"공동 65분으'
    expect(stripLeftoverAiMarkup(cut)).toBe('**반영 확인**: 9개 활동 초안이 저장되어 있습니다.')
  })
  it('짝 없는 닫는 태그만 남은 경우도 지운다', () => {
    expect(stripLeftoverAiMarkup('...}],"environmentCheck":"x"}\n</ai_suggestion>\n남은 안내')).toBe('...}],"environmentCheck":"x"}\n\n남은 안내')
  })
  it('완결 블록이 남아 있어도 그 뒤 본문은 지우지 않는다', () => {
    const t = '앞 문장\n<ai_suggestion>{"a":1}</ai_suggestion>\n뒤 문장'
    expect(stripLeftoverAiMarkup(t)).toBe('앞 문장\n\n뒤 문장')
  })
  it('self-closing 절차 이동 태그를 지운다', () => {
    expect(stripLeftoverAiMarkup('다음으로 갑니다.\n<procedure_advance current="Ds-2-1" suggested="Ds-2-2" />')).toBe('다음으로 갑니다.')
  })
  it('태그가 없으면 그대로, 빈 값은 빈 문자열', () => {
    expect(stripLeftoverAiMarkup('평범한 답 <b>강조</b>')).toBe('평범한 답 <b>강조</b>')
    expect(stripLeftoverAiMarkup(undefined)).toBe('')
  })
})
