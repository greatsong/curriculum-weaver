/**
 * 미래 지도 배치 엔진 — 실제 성취기준·실제 연결 찾기 출력(표본 6종: 과목 2~6개, 연결 0~6개)으로 검증한다.
 * 글자 폭은 근사치(한글 1em, ASCII 0.56em)로 주입한다.
 */
import { describe, it, expect } from 'vitest'
import { ringLayout, overlap, shortSubject, SHAPES } from '../ringLayout'
import fixtures from './fixtures/bridges.json'

const measure = (t, font) => {
  const px = parseFloat(font.match(/(\d+(\.\d+)?)px/)[1])
  let w = 0
  for (const ch of String(t)) w += /[ㄱ-힝]/.test(ch) ? px : px * 0.56
  return w
}
const names = Object.keys(fixtures)
const run = (name, W = 1232) => ringLayout(fixtures[name].standards, fixtures[name].bridges, W, measure)

describe('ringLayout — 과목 원·키워드·연결 배치', () => {
  it('표본 6종이 1,232px에서 모두 품질 조건을 통과한다(겹침·강제 배치·화면 밖·선 침범·이름표 충돌 0)', () => {
    for (const name of names) {
      const L = run(name)
      expect(L.ok, `${name}: ${JSON.stringify(L.quality)}`).toBe(true)
    }
  })

  it('같은 과목의 성취기준은 원 하나로 묶이고, 코드마다 표식 모양이 다르다', () => {
    const L = run('music')
    expect(L.clusters).toHaveLength(3)
    const music = L.clusters.find((c) => c.name === '음악')
    expect(music.codes.map((c) => c.code)).toEqual(['[12음02-01]', '[12음03-03]'])
    expect(music.codes.map((c) => c.shape)).toEqual([SHAPES[0], SHAPES[1]])
    for (const kw of music.kws) expect(music.codes.find((c) => c.key === kw.stdKey).shape).toBe(kw.shape)
  })

  it('모든 원은 같은 크기이고, 연결 수와 무관하다', () => {
    const L = run('six')
    expect(new Set(L.clusters.map((c) => c.R)).size).toBe(1)
    expect(L.R).toBeGreaterThanOrEqual(46)
  })

  it('연결선은 서로 다른 과목의 키워드 알약 사이에만 있고, 같은 과목 안의 연결은 innerConcepts로 간다', () => {
    const L = run('music')
    for (const ch of L.chains) {
      expect(ch.p.nodeKey).not.toBe(ch.q.nodeKey)
      expect(ch.p.linked && ch.q.linked).toBe(true)
    }
    expect(L.chains).toHaveLength(2)
    expect(L.innerConcepts).toHaveLength(1)
    expect(L.innerConcepts[0].ends.map((e) => e.key)).toEqual(['[10공국1-06-01]', '[10공국1-06-02]'])
  })

  it('연결되지 않은 과목은 iso로 표시되고 키워드는 그대로 남는다', () => {
    const L = run('music')
    const kor = L.clusters.find((c) => c.name === '공통국어1')
    expect(kor.iso).toBe(true)
    expect(kor.kws.length).toBeGreaterThanOrEqual(5)
    expect(kor.kws.every((kw) => !kw.linked)).toBe(true)
  })

  it('연결 0개(two): 선과 이름표가 없고 과목 원 둘이 대각선으로 놓인다', () => {
    const L = run('two')
    expect(L.chains).toHaveLength(0)
    expect(L.empty).toBe(true)
    const [a, b] = L.clusters
    expect(Math.abs(a.y - b.y)).toBeGreaterThan(60)
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(L.W * 0.3)
  })

  it('키워드 상자끼리, 키워드 상자와 원이 겹치지 않는다(모든 표본)', () => {
    for (const name of names) {
      const L = run(name)
      const boxes = L.text
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        expect(overlap(boxes[i].b, boxes[j].b, 0), `${name}: ${boxes[i].id} × ${boxes[j].id}`).toBe(false)
      }
    }
  })

  it('모든 키워드는 자기 과목 원에 짧은 선으로 이어지고, 다른 과목 원보다 자기 원에 가깝다', () => {
    for (const name of names) {
      const L = run(name)
      for (const c of L.clusters) {
        expect(c.spokes).toHaveLength(c.kws.length)
        for (const kw of c.kws) {
          const own = Math.hypot(kw.x - c.x, kw.y - c.y)
          for (const o of L.clusters) if (o !== c) expect(Math.hypot(kw.x - o.x, kw.y - o.y), `${name} ${kw.word}`).toBeGreaterThan(own)
        }
      }
    }
  })

  it('연결된 과목끼리는 선이 가운데를 가로지른다(4과목 재난: 모든 연결선 길이 90px 이상)', () => {
    const L = run('disaster')
    expect(L.chains.length).toBeGreaterThanOrEqual(3)
    for (const ch of L.chains) expect(Math.hypot(ch.b0[0] - ch.a0[0], ch.b0[1] - ch.a0[1])).toBeGreaterThan(90)
  })

  it('입력 순서를 바꿔도 좌표가 같다(결정적)', () => {
    const f = fixtures.health
    const a = ringLayout(f.standards, f.bridges, 1232, measure)
    const b = ringLayout([...f.standards].reverse(), f.bridges, 1232, measure)
    expect(a.clusters.map((c) => [c.key, Math.round(c.x), Math.round(c.y)])).toEqual(b.clusters.map((c) => [c.key, Math.round(c.x), Math.round(c.y)]))
    expect(a.chains.map((ch) => ch.c.label)).toEqual(b.chains.map((ch) => ch.c.label))
  })

  it('연결 찾기 전(bridges 없음)에도 과목 원만으로 배치된다', () => {
    const L = ringLayout(fixtures.health.standards, null, 1232, measure)
    expect(L.clusters).toHaveLength(4)
    expect(L.clusters.every((c) => c.kws.length === 0)).toBe(true)
    expect(L.ok).toBe(true)
  })

  it('긴 연결 이름(11자 초과)은 이름표를 두 줄로 접는다', () => {
    const L = run('art')
    const long = L.chains.find((ch) => ch.c.label.length > 11)
    if (long) { expect(long.capLines.length).toBe(2); expect(long.ch).toBe(34) }
  })

  it('과목 이름은 괄호 앞까지 줄인다', () => {
    expect(shortSubject({ subject: '기술·가정(고등 일반선택)' })).toBe('기술·가정')
    expect(shortSubject({ subject: '공통수학1, 공통수학2' })).toBe('공통수학1')
  })

  it('6과목·연결 6개 배치가 400ms 안에 끝난다(단독 실측 약 25~60ms, 병렬 실행 시 느려짐)', () => {
    run('six')
    const t = performance.now()
    run('six')
    expect(performance.now() - t).toBeLessThan(400)
  })
})
