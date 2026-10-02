/**
 * 미래 마방진 — 3×3 칸의 가운데는 타임스톤 별, 둘레 8칸이 관점 8개의 미래.
 * 별의 꼭지 k(스톤 색)는 자기 칸을 가리키고, 미래가 준비되면 꼭지가 켜진다. 카드는 제목 + 2~3문장.
 */
import { useState } from 'react'
import { FUTURE_TIPS, LENS_SHORT, SQUARE_AREAS, TIP_STONE, tipAngle } from '../../lib/futures'

// 문양 띠(원 둘레에 짧은 획)
function glyphPath(r, count, size) {
  let d = ''
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2, long = i % 4 === 0
    const r2 = r + (long ? size : size * .5)
    d += `M${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}L${(r2 * Math.cos(a)).toFixed(1)},${(r2 * Math.sin(a)).toFixed(1)}`
  }
  return d
}
function starPath(r, n, step, rot = 0) {
  const pts = []
  for (let i = 0; i < n; i++) { const a = rot + ((i * step) / n) * Math.PI * 2; pts.push(`${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`) }
  return `M${pts.join('L')}Z`
}
const R = 96 // 꼭지 반지름
const ROT = (-135 * Math.PI) / 180 // 꼭지 0이 왼쪽 위를 가리키게

function TimeStar({ states, hovered, onHover }) {
  return (
    <svg className="fu-star" viewBox="-150 -150 300 300" aria-hidden="true">
      <defs>
        <filter id="fu-star-glow" filterUnits="userSpaceOnUse" x="-150" y="-150" width="300" height="300"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <radialGradient id="fu-star-core"><stop offset="0%" stopColor="#F4FFF9" /><stop offset="40%" stopColor="#7CFFC6" stopOpacity=".8" /><stop offset="100%" stopColor="#17C97A" stopOpacity="0" /></radialGradient>
      </defs>
      <g className="fu-star-lines" filter="url(#fu-star-glow)">
        <g className="fu-star-ring"><circle r="138" /><path d={glyphPath(124, 96, 10)} /><circle r="122" className="thin" /></g>
        <g className="fu-star-ring rev"><circle r="112" className="dash" /></g>
        <path d={starPath(R, FUTURE_TIPS, 3, ROT)} />
        <path d={starPath(R * .6, FUTURE_TIPS, 2, ROT + Math.PI / FUTURE_TIPS)} className="thin" />
        <circle r={R * .6} className="thin" />
      </g>
      <circle r="34" fill="url(#fu-star-core)" className="fu-star-core" />
      {Array.from({ length: FUTURE_TIPS }, (_, k) => {
        const a = (tipAngle(k) * Math.PI) / 180, x = R * Math.cos(a), y = R * Math.sin(a)
        const st = states[k]?.status
        return (
          <g key={k} className={`fu-star-tip ${st || ''}${hovered === k ? ' on' : ''}`} style={{ '--stone': TIP_STONE[k] }}
            onMouseEnter={() => onHover(k)} onMouseLeave={() => onHover(null)}>
            <circle cx={x} cy={y} r="13" className="halo" />
            <circle cx={x} cy={y} r="6" className="gem" />
          </g>
        )
      })}
    </svg>
  )
}

function FutureCard({ k, state, axisOf, onBasket, onStart, onRetry, onHover, hovered, modelLabel }) {
  const [basketed, setBasketed] = useState(false)
  const f = state?.status === 'ready' ? state.data : null
  const head = (
    <div className="fu-fcard-head" style={{ '--stone': TIP_STONE[k] }}>
      <span className="fu-gem" />{LENS_SHORT[k]}
    </div>
  )
  return (
    <article className={`fu-fcard ${state?.status || 'idle'}${hovered === k ? ' on' : ''}`} style={{ gridArea: SQUARE_AREAS[k] }}
      onMouseEnter={() => onHover(k)} onMouseLeave={() => onHover(null)}>
      {head}
      {f ? (
        <>
          <h3>{f.title}</h3>
          <p className="fu-pitch">{f.pitch}</p>
          <div className="fu-fcard-foot">
            {axisOf(f).length > 0 && <span className="fu-meet" title="이 수업이 축으로 삼은 만나는 키워드">{axisOf(f).join(' · ')}</span>}
            {f.honesty_note && <span className="fu-honest-i" tabIndex={0} title={f.honesty_note} aria-label={`솔직한 메모: ${f.honesty_note}`}>ⓘ</span>}
            <span className="fu-fcard-actions">
              <button type="button" onClick={() => { onBasket(); setBasketed(true) }} disabled={basketed}>{basketed ? '담음 ✓' : '담기'}</button>
              <button type="button" className="go" onClick={() => onStart(f)}>이 수업으로 시작</button>
            </span>
          </div>
        </>
      ) : state?.status === 'error' ? (
        <div className="fu-fcard-msg">
          <p>{state.error}</p>
          <button type="button" onClick={onRetry}>다시 그리기</button>
        </div>
      ) : (
        <div className="fu-skeleton" aria-label={`${LENS_SHORT[k]} 미래를 그리는 중`}>
          <i style={{ width: '70%' }} /><i /><i /><i style={{ width: '55%' }} />
          {state?.status === 'loading' && <small>{modelLabel} · {Math.max(0, Math.round((Date.now() - state.startedAt) / 1000))}초</small>}
        </div>
      )}
    </article>
  )
}

export default function FuturesSquare({ states, bridges, onBasket, onStart, onRetry, modelLabel }) {
  const [hovered, setHovered] = useState(null)
  // 이 미래가 축으로 삼은 연결 → 만나는 키워드 쌍
  const axisOf = (f) => (f.axis || []).map((label) => {
    const c = (bridges?.concepts || []).find((x) => x.label === label)
    return c ? c.ends.map((e) => e.word).join('×') : label
  })
  const readyCount = Object.values(states).filter((s) => s?.status === 'ready').length
  return (
    <section className="fu-square-wrap" aria-label="여덟 갈래 수업의 미래">
      <div className="fu-section-head">
        <h2>여덟 갈래의 미래</h2>
        <span className="fu-section-sub">{readyCount < FUTURE_TIPS ? `${readyCount} / ${FUTURE_TIPS} 그리는 중…` : '카드를 눌러 프로젝트로 이어 갈 수 있습니다.'}</span>
      </div>
      <div className="fu-square">
        <div className="fu-square-mid"><TimeStar states={states} hovered={hovered} onHover={setHovered} /></div>
        {Array.from({ length: FUTURE_TIPS }, (_, k) => (
          <FutureCard key={k} k={k} state={states[k]} axisOf={axisOf} hovered={hovered} onHover={setHovered} modelLabel={modelLabel}
            onBasket={onBasket} onStart={onStart} onRetry={() => onRetry(k)} />
        ))}
      </div>
    </section>
  )
}
