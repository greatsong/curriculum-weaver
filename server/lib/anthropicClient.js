import Anthropic from '@anthropic-ai/sdk'

/**
 * Anthropic 클라이언트 lazy 싱글턴
 *
 * 모듈 스코프에서 `new Anthropic(...)`을 만들면 ESM import 호이스팅 때문에
 * index.js의 dotenv 로드보다 먼저 실행되어, 셸에 키가 없거나 빈 문자열로
 * 주입된 환경(로컬 dev)에서는 무키 클라이언트가 고정된다.
 * 첫 호출 시점(= dotenv 로드 후)에 생성해 이 문제를 원천 차단한다.
 */
let _client = null

export function getAnthropic() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}
