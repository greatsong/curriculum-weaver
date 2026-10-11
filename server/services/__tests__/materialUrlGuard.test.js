/**
 * 참고 사이트 URL 가져오기 — 주소 검사 회귀 테스트
 * - 주소 표기 정규화(IPv6 대괄호, 끝의 점, 숫자 표기 IPv4)
 * - 사설·예약 대역(100.64/10, 0/8, 169.254/16, IPv4 매핑 IPv6 등)
 * - DNS 조회 결과 IP 전부 검사(조회 함수 모킹)
 * - 리디렉션 홉마다 재검사
 * - 검사한 IP로 연결 고정(이름을 다시 조회하지 않음), 압축 응답 해제
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import zlib from 'node:zlib'

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic { messages = { create: vi.fn() } },
}))
vi.mock('../../lib/supabaseAdmin.js', () => ({
  supabaseAdmin: { from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) },
}))
vi.mock('../../lib/standardsValidator.js', () => ({ validateCode: vi.fn() }))

const { _internal } = await import('../materialAnalyzer.js')
const { assertPublicUrl, resolvePublicTarget, isBlockedAddress, requestPinned, fetchUrlContent } = _internal

const lookupReturning = (...addresses) => vi.fn(async () => addresses.map((address) => ({
  address, family: address.includes(':') ? 6 : 4,
})))

describe('assertPublicUrl — 주소 표기 검사', () => {
  it.each([
    'http://[::1]/',
    'http://[::]/',
    'http://localhost./',
    'http://LOCALHOST../admin',
    'http://foo.localhost/',
    'http://printer.local/',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://router.home.arpa/',
    'http://intranet/', // 점 없는 한 단어 이름
    'http://127.0.0.1/',
    'http://127.1/',
    'http://2130706433/', // 127.0.0.1의 10진 표기
    'http://0x7f.1/',
    'http://0/',
    'http://0.0.0.0/',
    'http://10.1.2.3/',
    'http://100.64.0.1/', // CGNAT
    'http://100.127.255.254/',
    'http://169.254.169.254/latest/meta-data/',
    'http://172.16.0.1/',
    'http://192.168.0.1/',
    'http://198.18.0.1/',
    'http://224.0.0.1/',
    'http://255.255.255.255/',
    'http://[::ffff:127.0.0.1]/', // IPv4 매핑 IPv6
    'http://[::ffff:a9fe:a9fe]/', // ::ffff:169.254.169.254
    'http://[64:ff9b::a00:1]/', // NAT64로 품은 10.0.0.1
    'http://[fd00::1]/',
    'http://[fe80::1]/',
    'http://[ff02::1]/',
    'http://[2001:db8::1]/',
  ])('%s → 차단', (url) => {
    const r = assertPublicUrl(url)
    expect(r.ok).toBe(false)
    expect(r.message).toBe('내부 주소는 가져올 수 없습니다.')
  })

  it.each([
    'https://example.com/page',
    'https://www.moe.go.kr./', // 끝의 점은 지우고 통과
    'http://1.1.1.1/',
    'http://100.128.0.1/', // CGNAT 바로 바깥
    'http://[2606:4700:4700::1111]/',
    'http://[::ffff:8.8.8.8]/', // 매핑 주소라도 안의 IPv4가 공개면 통과
  ])('%s → 통과', (url) => {
    const r = assertPublicUrl(url)
    expect(r.ok).toBe(true)
    expect(r.host).not.toMatch(/^\[|\.$/)
  })

  it('http/https 외 프로토콜과 잘못된 형식은 거절', () => {
    expect(assertPublicUrl('ftp://example.com/').ok).toBe(false)
    expect(assertPublicUrl('file:///etc/passwd').ok).toBe(false)
    expect(assertPublicUrl('not a url').ok).toBe(false)
  })

  it('isBlockedAddress: IP가 아닌 값은 안전 쪽으로 차단', () => {
    expect(isBlockedAddress('example.com')).toBe(true)
    expect(isBlockedAddress('')).toBe(true)
    expect(isBlockedAddress('93.184.216.34')).toBe(false)
  })
})

describe('resolvePublicTarget — DNS 조회 결과 검사', () => {
  it('사설 IP로 풀리는 이름은 차단', async () => {
    const lookup = lookupReturning('10.0.0.5')
    const r = await resolvePublicTarget('https://rebind.example.com/', { lookup })
    expect(r).toEqual({ ok: false, message: '내부 주소는 가져올 수 없습니다.' })
    expect(lookup).toHaveBeenCalledWith('rebind.example.com', { all: true, verbatim: true })
  })

  it('공개 IP와 내부 IP를 섞어 돌려주면 차단 (하나라도 내부면 거절)', async () => {
    const r = await resolvePublicTarget('https://mixed.example.com/', { lookup: lookupReturning('93.184.216.34', '127.0.0.1') })
    expect(r.ok).toBe(false)
  })

  it('IPv4 매핑 IPv6·CGNAT·링크 로컬로 풀리는 이름도 차단', async () => {
    for (const addr of ['::ffff:192.168.1.1', '100.64.10.10', '169.254.169.254', 'fe80::1', '::1']) {
      const r = await resolvePublicTarget('https://x.example.com/', { lookup: lookupReturning(addr) })
      expect(r.ok, addr).toBe(false)
    }
  })

  it('공개 IP만 나오면 통과하고 연결에 쓸 IP 목록을 돌려준다', async () => {
    const r = await resolvePublicTarget('https://ok.example.com/a?b=1', { lookup: lookupReturning('93.184.216.34', '2606:2800:220:1::1') })
    expect(r.ok).toBe(true)
    expect(r.host).toBe('ok.example.com')
    expect(r.addresses).toEqual([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1::1', family: 6 },
    ])
  })

  it('끝의 점 이름은 점을 지운 이름으로 조회한다', async () => {
    const lookup = lookupReturning('93.184.216.34')
    await resolvePublicTarget('https://ok.example.com./', { lookup })
    expect(lookup.mock.calls[0][0]).toBe('ok.example.com')
  })

  it('조회 실패는 "주소를 찾을 수 없습니다"', async () => {
    const lookup = vi.fn(async () => { throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }) })
    const r = await resolvePublicTarget('https://nope.example.com/', { lookup })
    expect(r).toEqual({ ok: false, message: '주소를 찾을 수 없습니다.' })
  })

  it('IP 표기 URL은 DNS를 조회하지 않는다', async () => {
    const lookup = vi.fn()
    const r = await resolvePublicTarget('http://1.1.1.1/', { lookup })
    expect(r.ok).toBe(true)
    expect(lookup).not.toHaveBeenCalled()
  })
})

describe('fetchUrlContent — 홉마다 재검사', () => {
  const okResponse = (body, type = 'text/plain') => ({
    status: 200, ok: true,
    headers: { get: (n) => (n.toLowerCase() === 'content-type' ? type : null) },
    body: new Response(body).body,
  })
  const redirectTo = (location) => ({
    status: 302, ok: false,
    headers: { get: (n) => (n.toLowerCase() === 'location' ? location : null) },
    body: new Response('').body,
  })

  it('내부 IP로 풀리는 이름은 요청을 보내지 않는다', async () => {
    const request = vi.fn()
    const r = await fetchUrlContent('https://evil.example.com/', { lookup: lookupReturning('127.0.0.1'), request })
    expect(r.error).toBe('내부 주소는 가져올 수 없습니다.')
    expect(request).not.toHaveBeenCalled()
  })

  it('공개 페이지가 내부 주소로 리디렉션하면 두 번째 홉에서 막는다', async () => {
    const request = vi.fn(async () => redirectTo('http://169.254.169.254/latest/meta-data/'))
    const r = await fetchUrlContent('https://public.example.com/', { lookup: lookupReturning('93.184.216.34'), request })
    expect(r.error).toBe('내부 주소는 가져올 수 없습니다.')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('리디렉션 대상 이름도 DNS 조회 결과로 다시 검사한다', async () => {
    const lookup = vi.fn(async (host) => [{ address: host === 'first.example.com' ? '93.184.216.34' : '10.0.0.9', family: 4 }])
    const request = vi.fn(async () => redirectTo('https://second.example.com/'))
    const r = await fetchUrlContent('https://first.example.com/', { lookup, request })
    expect(r.error).toBe('내부 주소는 가져올 수 없습니다.')
    expect(lookup.mock.calls.map((c) => c[0])).toEqual(['first.example.com', 'second.example.com'])
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('검사한 대상(IP 목록 포함)을 요청 함수에 넘기고 본문을 읽는다', async () => {
    const request = vi.fn(async () => okResponse('안녕하세요 본문'))
    const r = await fetchUrlContent('https://public.example.com/doc', { lookup: lookupReturning('93.184.216.34'), request })
    expect(r.text).toContain('안녕하세요 본문')
    const target = request.mock.calls[0][0]
    expect(target.host).toBe('public.example.com')
    expect(target.addresses).toEqual([{ address: '93.184.216.34', family: 4 }])
  })
})

describe('requestPinned — 검사한 IP로 연결 고정', () => {
  let server
  let port
  const seen = []

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      seen.push({ host: req.headers.host, url: req.url, enc: req.headers['accept-encoding'] })
      if (req.url === '/gzip') {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'content-encoding': 'gzip' })
        res.end(zlib.gzipSync(Buffer.from('압축된 본문입니다')))
        return
      }
      if (req.url === '/redirect') {
        res.writeHead(302, { location: '/elsewhere' })
        res.end()
        return
      }
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html><title>t</title><body>pinned</body></html>')
    })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    port = server.address().port
  })
  afterAll(() => new Promise((r) => server.close(r)))

  const target = (path) => ({
    url: new URL(`http://rebind.test:${port}${path}`),
    host: 'rebind.test',
    addresses: [{ address: '127.0.0.1', family: 4 }],
  })

  it('이름(rebind.test)을 다시 조회하지 않고 검사한 IP로 연결한다', async () => {
    const res = await requestPinned(target('/page?q=1'))
    expect(res.status).toBe(200)
    expect(res.ok).toBe(true)
    const text = await new Response(res.body).text()
    expect(text).toContain('pinned')
    const last = seen.at(-1)
    expect(last.host).toBe(`rebind.test:${port}`)
    expect(last.url).toBe('/page?q=1')
  })

  it('gzip 응답을 풀어서 돌려준다', async () => {
    const res = await requestPinned(target('/gzip'))
    expect(seen.at(-1).enc).toContain('gzip')
    expect(await new Response(res.body).text()).toBe('압축된 본문입니다')
  })

  it('리디렉션은 따라가지 않고 Location을 그대로 돌려준다', async () => {
    const res = await requestPinned(target('/redirect'))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/elsewhere')
    await res.body.cancel()
  })

  it('검사한 IP 목록에 맞는 주소족이 없으면 연결하지 않는다', async () => {
    const t = { ...target('/page'), addresses: [] }
    await expect(requestPinned(t)).rejects.toThrow()
  })
})
