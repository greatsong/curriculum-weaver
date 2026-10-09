/**
 * 타임 스톤 문장 — 미래보기 머리의 빛의 중심. 닥터 스트레인지의 주문 원처럼
 * 겹친 기하 무늬 고리(팔각 별·육각 별·눈금 고리)가 서로 반대 방향으로 천천히 돈다.
 * 눈동자 같은 형태는 두지 않고, 가운데는 부드러운 초록빛만 둔다(사용자 결정, 2026-10-09).
 * 바깥 고리의 점 여덟 개 = 여덟 관점. 장식 전용(aria-hidden). 모션 줄이기 설정이면 멈춘다(futuresLab.css).
 */
const C = 160
const polygon = (n, r, phase = -Math.PI / 2) => Array.from({ length: n }, (_, i) => {
  const a = phase + (i * 2 * Math.PI) / n
  return `${(C + r * Math.cos(a)).toFixed(2)},${(C + r * Math.sin(a)).toFixed(2)}`
}).join(' ')

export default function TimeStoneEmblem({ size = 300, className = '' }) {
  const dots = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4 - Math.PI / 2
    return { x: C + 138 * Math.cos(a), y: C + 138 * Math.sin(a) }
  })
  return (
    <svg className={`lab-emblem ${className}`} width={size} height={size} viewBox="0 0 320 320" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="lab-stone-core" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#F2FFF8" stopOpacity=".95" />
          <stop offset=".28" stopColor="#9DF7CF" stopOpacity=".75" />
          <stop offset=".62" stopColor="#34D399" stopOpacity=".28" />
          <stop offset="1" stopColor="#34D399" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lab-stone-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#5CF0B0" stopOpacity=".40" />
          <stop offset=".6" stopColor="#34D399" stopOpacity=".12" />
          <stop offset="1" stopColor="#34D399" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* 바깥 빛 */}
      <circle className="lab-emblem-halo" cx={C} cy={C} r="156" fill="url(#lab-stone-halo)" />
      {/* 고리 1 — 눈금과 여덟 점 (느리게) */}
      <g className="lab-emblem-ring lab-emblem-ring--a">
        <circle cx={C} cy={C} r="138" fill="none" stroke="#86EFC3" strokeOpacity=".45" strokeWidth="1" strokeDasharray="1.5 7.5" />
        <circle cx={C} cy={C} r="146" fill="none" stroke="#D4B274" strokeOpacity=".28" strokeWidth=".8" strokeDasharray="22 14" />
        {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r="3" fill="#C9FFE6" fillOpacity=".9" />)}
      </g>
      {/* 고리 2 — 팔각 별(정사각형 둘) (반대 방향) */}
      <g className="lab-emblem-ring lab-emblem-ring--b">
        <circle cx={C} cy={C} r="118" fill="none" stroke="#86EFC3" strokeOpacity=".5" strokeWidth="1" />
        <polygon points={polygon(4, 118)} fill="none" stroke="#86EFC3" strokeOpacity=".42" strokeWidth=".9" />
        <polygon points={polygon(4, 118, -Math.PI / 4)} fill="none" stroke="#86EFC3" strokeOpacity=".42" strokeWidth=".9" />
        <circle cx={C} cy={C} r="104" fill="none" stroke="#86EFC3" strokeOpacity=".22" strokeWidth=".8" strokeDasharray="10 6" />
      </g>
      {/* 고리 3 — 육각 별(삼각형 둘) */}
      <g className="lab-emblem-ring lab-emblem-ring--c">
        <circle cx={C} cy={C} r="84" fill="none" stroke="#86EFC3" strokeOpacity=".5" strokeWidth="1" />
        <polygon points={polygon(3, 84)} fill="none" stroke="#B9FFE0" strokeOpacity=".5" strokeWidth=".9" />
        <polygon points={polygon(3, 84, Math.PI / 2)} fill="none" stroke="#B9FFE0" strokeOpacity=".5" strokeWidth=".9" />
        <circle cx={C} cy={C} r="62" fill="none" stroke="#86EFC3" strokeOpacity=".3" strokeWidth=".8" strokeDasharray="3 5" />
      </g>
      {/* 가운데 빛 — 돌이 아니라 빛 */}
      <circle className="lab-emblem-stone" cx={C} cy={C} r="46" fill="url(#lab-stone-core)" />
      <circle cx={C} cy={C} r="20" fill="none" stroke="#DDFFF0" strokeOpacity=".35" strokeWidth=".8" />
    </svg>
  )
}
