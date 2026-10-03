import { describe, it, expect } from 'vitest'
import { nebulaLayout, overlap, segHitsBox } from '../nebulaLayout'

// 근사 글자 폭: 한글 1em, ASCII 0.56em (명세 2부 §3-3 단위 테스트 규칙)
const measure = (t, font) => {
  const size = parseFloat(String(font).match(/([\d.]+)px/)?.[1] || 14)
  return [...String(t)].reduce((w, ch) => w + (/[\x20-\x7e]/.test(ch) ? size * 0.56 : size), 0)
}
const C = (ends, label, kind = 'same', strength = 2) => ({ label, kind, strength, why: '…', ends: ends.map(([key, word]) => ({ key, word })) })

// 재난 조합(실제 성취기준 원문 키워드)
const disaster = {
  standards: [
    { key: '[12지구01-04]', code: '[12지구01-04]', subject: '지구과학' },
    { key: '[12한탐04-02]', code: '[12한탐04-02]', subject: '한국지리 탐구' },
    { key: '[12인수01-03]', code: '[12인수01-03]', subject: '인공지능 수학' },
    { key: '[12화언01-09]', code: '[12화언01-09]', subject: '화법과 언어' },
  ],
  bridges: {
    keywords: {
      '[12지구01-04]': ['태풍', '집중호우', '악기상', '대처 방안'],
      '[12한탐04-02]': ['도시화', '산지', '하천', '해안지역'],
      '[12인수01-03]': ['빅데이터', '인공지능'],
      '[12화언01-09]': ['준언어적·비언어적 표현', '정제된 언어적 표현', '발표'],
    },
    concepts: [
      C([['[12지구01-04]', '집중호우'], ['[12한탐04-02]', '도시화']], '도시 침수 위험', 'same', 3),
      C([['[12지구01-04]', '태풍'], ['[12인수01-03]', '빅데이터']], '기상 빅데이터', 'same', 2),
      C([['[12지구01-04]', '대처 방안'], ['[12화언01-09]', '발표']], '재해 대응 발표', 'method', 1),
    ],
  },
}
// 부하 자료: 6과목·연결 6
const six = {
  standards: ['A', 'B', 'C', 'D', 'E', 'F'].map((k, i) => ({ key: k, code: ['[10통과1-03-02]', '[10통사2-04-01]', '[12확통03-04]', '[12정보01-02]', '[12미술02-03]', '[12영01-07]'][i], subject: ['통합과학1', '통합사회2', '확률과 통계', '정보', '미술', '영어'][i] })),
  bridges: {
    keywords: { A: ['기후 변화', '탄소 중립', '에너지 전환'], B: ['지속가능한 발전', '국제 협력', '기후 정의'], C: ['통계적 추정', '표본', '신뢰구간'], D: ['데이터 시각화', '알고리즘', '자료 수집'], E: ['시각 문화', '공공 미술', '캠페인 포스터'], F: ['기사 읽기', '의견 표현', '토론'] },
    concepts: [
      C([['A', '탄소 중립'], ['C', '통계적 추정']], '탄소 배출 추정'), C([['A', '기후 변화'], ['D', '데이터 시각화']], '기후 데이터 지도'),
      C([['C', '표본'], ['D', '자료 수집']], '표본 조사 설계'), C([['B', '기후 정의'], ['E', '캠페인 포스터']], '기후 정의 캠페인', 'method'),
      C([['B', '국제 협력'], ['F', '기사 읽기']], '국제 기사 토론', 'method'), C([['A', '에너지 전환'], ['E', '공공 미술']], '에너지 공공 미술'),
    ],
  },
}
const two = {
  standards: [{ key: 'a', code: '[12물리02-01]', subject: '물리학' }, { key: 'b', code: '[12음감01-02]', subject: '음악 감상과 비평' }],
  bridges: { keywords: { a: ['파동', '진동수', '소리의 세기'], b: ['음색', '음악의 요소', '비평문'] }, concepts: [C([['a', '진동수'], ['b', '음악의 요소']], '소리의 높낮이'), C([['a', '파동'], ['b', '음색']], '악기 음색 분석')] },
}

describe('행성과 위성 그래프 배치', () => {
  // 6과목·연결 6은 1,232px(1,280px 노트북의 패널 폭)에서 반드시 통과. 1,100px는 그래프 최소 폭 근처라
  // 품질을 못 채우면 ok=false로 알려 화면이 목록 모드로 바뀐다(명세 2부 §3-8) — 겹친 그림을 내보내지 않는 것이 요건
  it('6과목·연결 6 · 1,100px: 그래프로 그리거나, 품질 미달이면 ok=false로 알린다(겹친 그림을 숨기지 않음)', () => {
    const L = nebulaLayout(six.standards, six.bridges, 1100, measure)
    const clean = !L.quality.clusterOv && !L.quality.forced && !L.quality.lineHit && !L.quality.capHit
    expect(L.ok).toBe(clean)
  })
  for (const [name, d, widths] of [['재난 4과목', disaster, [1100, 1232]], ['6과목·연결 6', six, [1232]], ['2과목', two, [1100, 1232]]]) {
    for (const W of widths) {
      it(`${name} · ${W}px: 글자 겹침·선 침범·이름표 충돌 0, 키워드 누락 0`, () => {
        const L = nebulaLayout(d.standards, d.bridges, W, measure)
        expect(L.ok).toBe(true)
        expect(L.quality).toEqual({ clusterOv: 0, forced: 0, lineHit: 0, capHit: 0 })
        const boxes = L.text.map((o) => o.b)
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j])).toBe(false)
        const shown = new Set(L.clusters.flatMap((c) => [...c.pills.map((p) => `${c.key}|${p.word}`), ...c.stars.map((s) => `${c.key}|${s.w}`)]))
        const subjOf = new Map(d.standards.map((s) => [s.key, s.subject]))
        for (const [k, words] of Object.entries(d.bridges.keywords)) for (const w of words) expect(shown.has(`${subjOf.get(k)}|${w}`)).toBe(true)
        for (const b of boxes) { expect(b[0]).toBeGreaterThanOrEqual(0); expect(b[2]).toBeLessThanOrEqual(W) }
      })
    }
  }

  it('같은 성취기준 집합이면 입력 순서와 관계없이 같은 좌표', () => {
    const a = nebulaLayout(disaster.standards, disaster.bridges, 1232, measure)
    const b = nebulaLayout([...disaster.standards].reverse(), disaster.bridges, 1232, measure)
    expect(b.clusters.map((c) => [c.key, Math.round(c.x), Math.round(c.y)])).toEqual(a.clusters.map((c) => [c.key, Math.round(c.x), Math.round(c.y)]))
  })

  it('행성↔위성 선은 이름 글자·다른 키워드를 지나지 않고, 모든 위성에 선이 하나씩 있다', () => {
    const L = nebulaLayout(disaster.standards, disaster.bridges, 1232, measure)
    for (const c of L.clusters) {
      expect(c.spokes).toHaveLength(c.pills.length + c.stars.length)
      for (const sp of c.spokes) {
        const [x1, y1, x2, y2] = [c.x + sp[0], c.y + sp[1], c.x + sp[2], c.y + sp[3]]
        for (const o of L.text) {
          if (o.k === c.key && (o.t === 'name' || (o.t === 'pill' && o.id === sp[5]))) continue
          if (o.k === c.key && o.t === 'star') {
            const star = c.stars.find((s) => s.w === sp[5])
            if (star && Math.abs(o.b[0] - (c.x + star.b[0])) < 0.01 && Math.abs(o.b[1] - (c.y + star.b[1])) < 0.01) continue
          }
          expect(segHitsBox(x1, y1, x2, y2, o.b), `${c.key} 선이 ${o.t} 상자를 지남`).toBe(false)
        }
      }
    }
  })

  it('가운데는 비우고(글자 0), 모든 행성은 같은 크기·바깥 링, 연결선은 서로 다른 과목의 알약끼리', () => {
    const W = 1232, L = nebulaLayout(six.standards, six.bridges, W, measure)
    const inCenter = L.text.filter((o) => {
      const gx = Math.max(o.b[0], Math.min(W / 2, o.b[2])), gy = Math.max(o.b[1], Math.min(L.H / 2, o.b[3]))
      return ((gx - W / 2) / (W * 0.15)) ** 2 + ((gy - L.H / 2) / (L.H * 0.15)) ** 2 < 1
    })
    expect(inCenter).toHaveLength(0)
    expect(new Set(L.clusters.map((c) => c.Rn)).size).toBe(1) // 모든 과목 원은 같은 크기
    for (const ch of L.chains) expect(ch.p.key).not.toBe(ch.q.key)
    // 같은 과목의 성취기준 2개는 원 하나로 묶인다
    const same = nebulaLayout([...two.standards, { key: 'c', code: '[12물리02-02]', subject: '물리학' }], two.bridges, 1232, measure)
    expect(same.clusters).toHaveLength(2)
    expect(same.clusters.find((c) => c.key === '물리학').codes).toEqual(['[12물리02-01]', '[12물리02-02]'])
    for (const ch of L.chains) expect(Math.hypot(ch.b0[0] - ch.a0[0], ch.b0[1] - ch.a0[1])).toBeGreaterThan(80) // 6과목에서 이웃한 과목 사이 최소 연결선(설계 수용 기준 근처)
  })

  it('2과목은 대각선(세로 차이가 높이의 25% 이상)', () => {
    const L = nebulaLayout(two.standards, two.bridges, 1232, measure)
    expect(Math.abs(L.clusters[0].y - L.clusters[1].y)).toBeGreaterThanOrEqual(L.H * 0.25)
  })

  it('연결 지도가 없으면 행성만(이름·코드), 연결선·위성 없음', () => {
    const L = nebulaLayout(disaster.standards, null, 1232, measure)
    expect(L.chains).toHaveLength(0)
    expect(L.clusters.every((c) => c.pills.length === 0 && c.stars.length === 0 && !c.iso)).toBe(true)
  })

  it('연결된 성취기준이 하나도 없는 과목은 "연결된 키워드 없음" 대상(iso)', () => {
    const b = { ...disaster.bridges, concepts: disaster.bridges.concepts.filter((c) => !c.ends.some((e) => e.key === '[12화언01-09]')) }
    const L = nebulaLayout(disaster.standards, b, 1232, measure)
    expect(L.clusters.find((c) => c.key === '화법과 언어').iso).toBe(true)
    expect(L.clusters.find((c) => c.key === '지구과학').iso).toBe(false)
  })
})
