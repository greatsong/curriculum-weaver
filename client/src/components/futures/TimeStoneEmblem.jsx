/**
 * 타임 스톤 문장 — 미래보기 머리의 빛의 중심. 아가모토의 눈을 추상화한 형태:
 * 눈 모양 테두리(황동) 안에 천천히 도는 고리 두 개, 고리 위의 점 여덟 개(= 여덟 관점), 가운데 초록 돌.
 * 장식 전용(aria-hidden). 움직임은 느린 회전과 숨쉬기뿐이고, 모션 줄이기 설정이면 멈춘다(futuresLab.css).
 */
export default function TimeStoneEmblem({ size = 300, className = '' }) {
  const dots = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4 - Math.PI / 2
    return { x: 160 + 112 * Math.cos(a), y: 160 + 112 * Math.sin(a) }
  })
  return (
    <svg className={`lab-emblem ${className}`} width={size} height={size} viewBox="0 0 320 320" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="lab-stone-fill" cx="38%" cy="32%" r="70%">
          <stop offset="0" stopColor="#F0FFF8" />
          <stop offset=".22" stopColor="#8DF5C6" />
          <stop offset=".58" stopColor="#1FB97E" />
          <stop offset="1" stopColor="#063D2B" />
        </radialGradient>
        <radialGradient id="lab-stone-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#5CF0B0" stopOpacity=".55" />
          <stop offset=".55" stopColor="#34D399" stopOpacity=".16" />
          <stop offset="1" stopColor="#34D399" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* 바깥 빛 */}
      <circle className="lab-emblem-halo" cx="160" cy="160" r="150" fill="url(#lab-stone-halo)" />
      {/* 눈 모양 테두리 — 황동 */}
      <path d="M14,160 Q160,16 306,160 Q160,304 14,160 Z" fill="none" stroke="#D4B274" strokeOpacity=".55" strokeWidth="1.6" />
      <path d="M38,160 Q160,52 282,160 Q160,268 38,160 Z" fill="none" stroke="#D4B274" strokeOpacity=".22" strokeWidth="1" />
      {/* 도는 고리 — 눈금 */}
      <g className="lab-emblem-ring lab-emblem-ring--a">
        <circle cx="160" cy="160" r="112" fill="none" stroke="#86EFC3" strokeOpacity=".55" strokeWidth="1.2" strokeDasharray="2 9" />
        {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r="3.2" fill="#B9FFE0" />)}
      </g>
      <g className="lab-emblem-ring lab-emblem-ring--b">
        <circle cx="160" cy="160" r="92" fill="none" stroke="#86EFC3" strokeOpacity=".35" strokeWidth="1" strokeDasharray="16 7" />
      </g>
      <circle cx="160" cy="160" r="74" fill="none" stroke="#86EFC3" strokeOpacity=".18" strokeWidth="1" />
      {/* 돌 */}
      <circle className="lab-emblem-stone" cx="160" cy="160" r="56" fill="url(#lab-stone-fill)" />
      <circle cx="160" cy="160" r="56" fill="none" stroke="#DDFFF0" strokeOpacity=".45" strokeWidth="1" />
      <ellipse cx="142" cy="138" rx="16" ry="9" fill="#FFFFFF" fillOpacity=".35" transform="rotate(-30 142 138)" />
    </svg>
  )
}
