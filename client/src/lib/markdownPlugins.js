import remarkGfm from 'remark-gfm'

/**
 * 채팅·안내문 마크다운 공용 remark 플러그인.
 *
 * 물결표 하나(~)로 감싼 글자를 취소선으로 바꾸지 않는다. GFM 기본값은 ~a~ 도 취소선이라
 * "4.1~4.7 … 4.8~4.21"처럼 기간·범위를 쓴 문장 사이가 통째로 줄이 그어졌다(2026-10-03 제보).
 * 한국어 문장은 범위에 물결표를 흔히 쓰므로, 의도한 취소선은 ~~두 개~~로만 표시한다.
 */
export const REMARK_PLUGINS = [[remarkGfm, { singleTilde: false }]]
