# 교육과정 성운(Curriculum Nebula) — /graph?mode=explore 쇼케이스 디자인 스펙

> 대상: 3D 그래프 발표·감상 전용 화면 재구축 구현 담당자
> 이 문서만 보고 구현 가능하도록 모든 수치(hex, ms, Tailwind 클래스, 셰이더 파라미터)를 명시했다.
> 기술 전제: React 19 + Tailwind CSS 4 + three.js 커스텀(Points 셰이더 + Lines), lucide-react, 한국어 UI.
> 캔버스는 풀블리드, UI는 전부 오버레이.

---

## 1. 아트 디렉션

**컨셉 선언 — "교육과정이라는 우주"**

4,856개의 성취기준은 별이고, 2,800여 개의 검증된 연결은 별과 별 사이를 잇는 빛의 실이다. 교과군은 각자의 색을 가진 성단(星團)으로 뭉치고, 그 사이를 가로지르는 융합의 연결선들이 이 우주를 하나의 성운으로 만든다. 관객(학부모·교사·학생)은 이 화면 앞에서 "교육과정이 과목별 칸막이가 아니라 서로 잇닿은 하나의 생태계"라는 것을 **설명 없이 눈으로** 느껴야 한다.

무드 키워드: **프리미엄 플라네타리움**. 어둡지만 검지 않고, 화려하지만 시끄럽지 않다. 참조 무드: 천체투영관의 개장 직전 조명, GitHub Globe, Apple 이벤트 인트로. 금지: 네온 사이버펑크, 과도한 렌즈플레어, 무지개 그라디언트 텍스트.

**배경 처리 — 순흑이 아닌 딥네이비 래디얼**

순흑(#000)은 값싸 보이고 글로우 대비가 과해진다. 미묘한 남색 기운이 도는 심연을 쓴다.

- three.js 씬 배경: 단색이 아닌 **CSS 레이어 그라디언트 위에 투명 캔버스**를 올리는 방식을 권장 (`renderer = new WebGLRenderer({ alpha: true })`, `scene.background = null`). CSS가 그라디언트·비네트를 담당하면 셰이더 비용 없이 품질이 나온다.
- 배경 컨테이너 (캔버스 뒤 z-0 레이어):

```jsx
<div className="absolute inset-0 z-0"
  style={{
    background: `
      radial-gradient(ellipse 120% 90% at 50% 35%, #0B1230 0%, #070B1D 45%, #04060F 100%)
    `,
  }}
/>
{/* 비네트 — 가장자리를 6% 더 어둡게 눌러 시선을 중앙으로 */}
<div className="pointer-events-none absolute inset-0 z-0"
  style={{ boxShadow: 'inset 0 0 180px 60px rgba(2,4,10,0.55)' }}
/>
```

- **스타필드**: 넣는다. 단, 아주 절제되게 — 데이터 노드와 혼동되면 안 된다.
  - 별도 `THREE.Points` 800개, 반지름 1800~2600 구면 셸에 랜덤 배치 (데이터 성운은 반경 ~600 내에 있으므로 항상 배경에 머묾)
  - 크기 0.8~1.6px 고정(비원근), 색 `#8B95B8`, 알파 0.12~0.35 랜덤, 개별 트윙클 없음(퍼포먼스·산만함 방지). 카메라 회전에만 시차로 반응
- **안개(fog)**: `scene.fog = new THREE.FogExp2(0x070B1D, 0.00055)` — 배경 그라디언트 중간톤과 동일 색. 원거리 노드가 배경으로 녹아들며 깊이감을 만든다. 링크 라인 셰이더에도 fog 적용 필수(라인만 안개를 무시하면 종이에 그린 선처럼 떠 보임).

---

## 2. 컬러 시스템

### 2-1. 교과군 노드 팔레트 (다크 + additive blending 보정)

기존 `SUBJECT_COLORS`(Graph3D.jsx)는 흰 배경용 Tailwind 500~600 단계다. 어두운 배경에서는 **한 단계 밝은 400 계열로 리프트**하되, additive blending에서 겹침이 흰색으로 뭉개지지 않도록 **채도를 HSL 기준 -8~-12%p 낮춘** 값을 쓴다. 아래가 최종 보정 팔레트(핵심 11 교과군 + 별칭):

| 교과군 | 기존(라이트) | **노드 core** | **글로우 halo** (스프라이트 외곽) | 비고 |
|---|---|---|---|---|
| 국어 | #ef4444 | **#F87171** | #FCA5A5 @ α0.35 | |
| 수학 | #3b82f6 | **#60A5FA** | #93C5FD @ α0.35 | 브랜드 파랑과 동계열 — 허브 연출에 활용 |
| 영어 | #6366f1 | **#818CF8** | #A5B4FC @ α0.35 | |
| 과학 | #22c55e | **#4ADE80** | #86EFAC @ α0.35 | |
| 사회 | #eab308 | **#FACC15** | #FDE047 @ α0.30 | 노랑은 원래 밝음 — halo 알파만 낮춤 |
| 도덕 | #f97316 | **#FB923C** | #FDBA74 @ α0.35 | |
| 정보 | #06b6d4 | **#22D3EE** | #67E8F9 @ α0.35 | |
| 기술·가정 (실과 계열 통합) | #a855f7 | **#C084FC** | #D8B4FE @ α0.35 | '실과(기술·가정)/정보' 별칭 동일 |
| 체육 | #84cc16 | **#A3E635** | #BEF264 @ α0.30 | |
| 음악 | #8b5cf6 | **#A78BFA** | #C4B5FD @ α0.35 | |
| 미술 | #ec4899 | **#F472B6** | #F9A8D4 @ α0.35 | |
| (제2외국어) | #0891b2 | **#38BDF8** | #7DD3FC @ α0.35 | 정보(#22D3EE)와 혼동 주의 — 존재 시 레전드에서 확인 |
| (한문·실과 별칭) | #14b8a6 | **#2DD4BF** | #5EEAD4 @ α0.35 | |

**additive blending 뭉개짐 방지 3원칙** (셰이더 구현 지침):

1. **포인트 텍스처 감쇠를 가파르게**: 스프라이트 알파 = `pow(1.0 - dist*2.0, 2.4)` (dist=중심으로부터 0~0.5). 중심만 밝고 외곽은 빠르게 죽어야 겹침 누적이 흰색까지 안 간다.
2. **per-point 최대 알파 0.85 캡**: vertex color에 곱하는 전역 계수 `uGlobalAlpha = 0.85`. 순수 1.0 알파 + additive는 3개만 겹쳐도 백색 포화.
3. **core를 순백으로 두지 않기**: 중심 하이라이트는 `mix(coreColor, #FFFFFF, 0.45)`까지만. 완전 흰 중심은 모든 교과가 같은 색으로 보이게 만든다.

### 2-2. 링크 타입 5종 (라인 색)

라인은 additive + 낮은 알파로 그리므로 노드보다 채도를 유지해도 안전하다. 기존 대비 한 단계 밝게:

| 타입 | 라벨 | 기존 | **다크용** |
|---|---|---|---|
| cross_subject | 교과연계 | #f59e0b | **#FBBF24** |
| same_concept | 동일개념 | #3b82f6 | **#60A5FA** |
| prerequisite | 선수학습 | #ef4444 | **#F87171** |
| application | 적용 | #22c55e | **#4ADE80** |
| extension | 확장 | #a855f7 | **#C084FC** |

기본(비선택) 상태의 라인은 타입 색이 아니라 **은은한 단일색 `#7C89B8`** 로 통일하는 것을 권장 — 2,800개 라인이 5색으로 섞이면 소음이 된다. 타입 색은 **노드 선택 시 하이라이트된 연결에만** 드러난다. (감상용 화면의 절제 원칙)

### 2-3. UI 크롬 — 글래스 패널

모든 오버레이 패널의 공통 표면. 유틸 조합을 고정해서 재사용:

```
글래스 표면(기본):  bg-[#0B1228]/70 backdrop-blur-xl border border-white/[0.08]
                    rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45)]
글래스 표면(강조):  bg-[#0E1633]/80 backdrop-blur-2xl border border-white/[0.12]
칩/버튼(유령):      bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08]
구분선:             border-white/[0.08]  (divide-white/[0.08])
포커스 링:          focus-visible:ring-2 ring-sky-400/60 ring-offset-0
```

텍스트 위계 3단계:

| 단계 | 용도 | 클래스 |
|---|---|---|
| 1차 | 제목, 성취기준 내용 | `text-slate-100` (#F1F5F9) |
| 2차 | 본문, 통계 값 | `text-slate-300/90` |
| 3차 | 캡션, 힌트, 단위 | `text-slate-400/70` |

브랜드 accent는 기존 앱과 동일 계열 유지하되 다크 보정: **`#60A5FA`(sky-blue 400)**. 주요 CTA(투어 시작 등)에만 사용.

---

## 3. 타이포그래피

폰트 스택은 기존 앱과 동일 (index.css `--font-sans`): `'Pretendard Variable', 'Pretendard', -apple-system, ...`. 코드 뱃지는 `--font-mono` (`'JetBrains Mono', 'Fira Code', monospace`).

| 역할 | 크기/굵기/자간 | Tailwind |
|---|---|---|
| 화면 타이틀 ("교육과정 성운") | 15px / 700 / -0.01em | `text-[15px] font-bold tracking-tight text-slate-100` |
| 통계 숫자 (노드/연결 카운트) | 13px / 600, 숫자는 tabular | `text-[13px] font-semibold tabular-nums text-slate-100` |
| 카드 제목 (성취기준 내용 첫 줄) | 14px / 600 / 행간 1.5 | `text-sm font-semibold leading-relaxed text-slate-100` |
| 본문 (내용, rationale) | 13px / 400 / 행간 1.6 | `text-[13px] leading-relaxed text-slate-300/90` |
| 캡션 (교과·학년군, 힌트) | 11px / 500 | `text-[11px] font-medium text-slate-400/70` |
| 코드 뱃지 ([9수03-01]) | 11px / 600 / mono | `font-mono text-[11px] font-semibold tracking-tight` |
| 투어 캡션 헤드 | 18px / 700 | `text-lg font-bold text-slate-100` |
| 3D 라벨(스프라이트) | 캔버스 렌더 12px 기준, 아래 §6-4 | — |

숫자가 나오는 곳(카운트, 진행 인디케이터)은 반드시 `tabular-nums` — 카운트업 애니메이션 시 흔들림 방지.

---

## 4. UI 크롬 컴포넌트 스펙

레이아웃 개요 (데스크톱):

```
┌──────────────────────────────────────────────────────┐
│ [상단 바]                                   (z-20)    │
│                                                       │
│ [레전드 - 좌하단]              [상세 카드 - 우측] (z-20) │
│                                                       │
│              [투어 캡션 - 하단 중앙] (z-30)             │
└──────────────────────────────────────────────────────┘
캔버스: absolute inset-0 z-10 (배경 그라디언트는 z-0)
```

### 4-1. 상단 바

풀폭 바가 아니라 **떠 있는 좌측 알약 + 우측 액션 묶음**. 우주 위에 문지방을 두르지 않는다.

```jsx
<div className="absolute top-4 inset-x-4 z-20 flex items-start justify-between pointer-events-none">
  {/* 좌: 로고 + 화면명 + 카운트 */}
  <div className="pointer-events-auto flex items-center gap-3 pl-3 pr-4 py-2
                  bg-[#0B1228]/70 backdrop-blur-xl border border-white/[0.08]
                  rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
    <a href="/" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
      <Logo size={20} />
      <span className="hidden sm:inline text-[13px] font-bold text-slate-100">커리큘럼 위버</span>
    </a>
    <span className="w-px h-4 bg-white/[0.12]" />
    <h1 className="text-[15px] font-bold tracking-tight text-slate-100">교육과정 성운</h1>
    <div className="hidden md:flex items-center gap-3 ml-1 text-[13px] tabular-nums">
      <span className="text-slate-400/70">성취기준 <b className="font-semibold text-slate-100">{nodeCount.toLocaleString()}</b></span>
      <span className="text-slate-400/70">연결 <b className="font-semibold text-sky-300">{linkCount.toLocaleString()}</b></span>
    </div>
  </div>

  {/* 우: 투어 + 설계 모드 복귀 */}
  <div className="pointer-events-auto flex items-center gap-2">
    <button onClick={startTour}
      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold
                 bg-sky-500/90 hover:bg-sky-400 text-white
                 shadow-[0_0_24px_rgba(56,189,248,0.35)] transition-colors duration-150">
      <Play size={14} /> 우주 여행
    </button>
    <button onClick={toDesign}
      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[13px] font-medium
                 bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08]
                 text-slate-300/90 hover:text-slate-100 transition-colors duration-150">
      <Compass size={14} /> 설계 모드
    </button>
  </div>
</div>
```

- 카운트 숫자는 첫 진입 시 0 → 실제 값 **카운트업 1200ms** (easeOutExpo, requestAnimationFrame). 진입 연출(§5-1)과 동기.
- lucide 아이콘: `Play`, `Compass`. 설계 모드 복귀는 기존 URL 파라미터 방식(`mode=design`) 유지.

### 4-2. 교과군 토글 칩 레전드 (좌하단)

교과군 11개 + 학교급 3개. **필터가 아니라 조명 스위치**라는 감각 — 끄면 사라지는 게 아니라 어두워진다(§6-2 dim 상태).

```jsx
<div className="absolute left-4 bottom-4 z-20 max-w-[380px]
                bg-[#0B1228]/70 backdrop-blur-xl border border-white/[0.08]
                rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45)] p-3">
  {/* 학교급 세그먼트 */}
  <div className="flex gap-1 mb-2.5">
    {['초등학교','중학교','고등학교'].map(lv => (
      <button key={lv} onClick={() => toggleLevel(lv)}
        className={`flex-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all duration-200 ${
          activeLevels.has(lv)
            ? 'bg-white/[0.14] text-slate-100'
            : 'text-slate-400/70 hover:text-slate-300 hover:bg-white/[0.06]'}`}>
        {lv.replace('학교','')}
      </button>
    ))}
  </div>
  <div className="h-px bg-white/[0.08] mb-2.5" />
  {/* 교과군 칩 그리드 */}
  <div className="flex flex-wrap gap-1.5">
    {subjectGroups.map(g => {
      const active = activeGroups.has(g.name)
      return (
        <button key={g.name} onClick={() => toggleGroup(g.name)}
          className={`flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full text-[11px] font-semibold
                      border transition-all duration-200 ${
            active
              ? 'border-white/[0.14] bg-white/[0.08] text-slate-100'
              : 'border-transparent bg-transparent text-slate-500/60 hover:text-slate-400'}`}>
          <span className="w-2 h-2 rounded-full transition-all duration-200"
            style={{
              backgroundColor: g.color,             // §2-1 core 색
              boxShadow: active ? `0 0 8px ${g.color}` : 'none',
              opacity: active ? 1 : 0.3,
            }} />
          {g.name}
          <span className="tabular-nums font-normal opacity-60">{g.count}</span>
        </button>
      )
    })}
  </div>
  {/* 전체 복원 */}
  {hasAnyDim && (
    <button onClick={resetAll}
      className="mt-2 text-[11px] text-sky-400/80 hover:text-sky-300 transition-colors">
      모두 켜기
    </button>
  )}
</div>
```

- **active 상태**: 색 점이 자체 글로우(`box-shadow: 0 0 8px {color}`)를 갖는다 — "이 별들이 켜져 있다"는 은유.
- **dim 상태**: 색 점 opacity 0.3, 텍스트 `text-slate-500/60`. 배경·보더는 투명(자리는 유지 — 레이아웃 점프 금지).
- 씬 반응은 §5-3 (400ms 알파 페이드).
- 기본 상태: 전부 active. "하나만 보기"는 색 점을 더블클릭 → 해당 교과군만 남기고 전부 dim (파워포인트 발표 시 유용). 툴팁 `title="더블클릭: 이 교과군만 보기"` 부여.

### 4-3. 노드 선택 상세 카드 (우측 패널)

선택 시 우측에서 등장. 폭 **360px** 고정, 최대 높이 `calc(100dvh - 120px)`, 내부 스크롤.

```jsx
<aside className="absolute right-4 top-[72px] bottom-4 z-20 w-[360px] max-w-[calc(100vw-32px)]
                  flex flex-col
                  bg-[#0E1633]/80 backdrop-blur-2xl border border-white/[0.12]
                  rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45)]
                  animate-card-in">
  {/* 헤더 */}
  <div className="flex items-start gap-2.5 p-4 pb-3">
    <span className="mt-0.5 shrink-0 px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold tracking-tight
                     border"
      style={{ color: groupColor, borderColor: `${groupColor}55`, backgroundColor: `${groupColor}1A` }}>
      {node.code}   {/* 예: [9수03-01] */}
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-[11px] font-medium text-slate-400/70">{node.subject} · {node.grade_group}</p>
    </div>
    <button onClick={close} className="shrink-0 p-1 -m-1 rounded-lg text-slate-400/70 hover:text-slate-100
                                       hover:bg-white/[0.08] transition-colors">
      <X size={16} />
    </button>
  </div>

  {/* 성취기준 내용 */}
  <p className="px-4 text-sm font-semibold leading-relaxed text-slate-100">{node.content}</p>

  {/* 연결 통계 줄 */}
  <div className="flex items-center gap-2 px-4 pt-3 pb-2">
    <span className="text-[11px] font-medium text-slate-400/70">
      연결 <b className="text-slate-100 tabular-nums">{connections.length}</b>개
    </span>
    <span className="h-px flex-1 bg-white/[0.08]" />
  </div>

  {/* 연결 목록 (스크롤 영역) */}
  <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-2">
    {connections.map(c => (
      <button key={c.id} onClick={() => flyTo(c.otherNode)}
        className="w-full text-left p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.09]
                   border border-white/[0.06] hover:border-white/[0.14]
                   transition-colors duration-150 group">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.typeColor }} />
          <span className="text-[11px] font-semibold" style={{ color: c.typeColor }}>{c.typeLabel}</span>
          <span className="font-mono text-[11px] text-slate-400/70">{c.otherNode.code}</span>
          <span className="ml-auto text-[11px] text-slate-400/70">{c.otherNode.subject}</span>
        </div>
        <p className="text-[13px] leading-relaxed text-slate-300/90 line-clamp-2">{c.otherNode.content}</p>
        {c.integration_theme && (
          <p className="mt-1.5 text-[11px] text-slate-400/70">🔗 {c.integration_theme}</p>
        )}
        {c.lesson_hook && (
          <p className="mt-0.5 text-[11px] text-slate-400/70 line-clamp-1">📝 {c.lesson_hook}</p>
        )}
      </button>
    ))}
  </div>

  {/* 푸터: 다음 연결로 여행 */}
  <div className="p-3 border-t border-white/[0.08]">
    <button onClick={travelNext}
      className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl
                 text-[13px] font-semibold text-white
                 bg-sky-500/90 hover:bg-sky-400
                 shadow-[0_0_24px_rgba(56,189,248,0.25)] transition-colors duration-150">
      <Rocket size={14} /> 다음 연결로 여행
    </button>
  </div>
</aside>
```

- 코드 뱃지는 **교과군 색으로 틴트** (`{color}1A` = 10% 배경, `{color}55` = 33% 보더) — 어느 성단에서 왔는지 즉시 인지.
- 연결 목록 정렬: quality_score 내림차순. 목록 항목 클릭 = 해당 노드로 플라이투(§5-2) + 카드 내용 교체(카드 자체는 유지, 내용만 120ms 크로스페이드).
- **"다음 연결로 여행"**: 현재 노드의 최고 품질 연결 중 아직 방문 안 한 노드로 플라이투. 관객 앞에서 "링크를 따라 우주를 항해"하는 핵심 발표 제스처. lucide `Rocket`.
- 등장/퇴장 애니메이션은 §5-4.

### 4-4. 자동 투어 모드

**진입**: 상단 바 "우주 여행" 버튼(§4-1). 투어 시작 시 레전드·상세 카드는 퇴장(각자 퇴장 모션), 상단 바는 유지하되 opacity 0.5로 감광.

**투어 시나리오**(구현 담당자용 데이터 계약): 교과군별 스톱 배열. 각 스톱 = `{ group, cameraTarget(성단 무게중심), stats: {nodes, links, topPartner}, story }`. story는 한 줄 스토리 문자열(서버 또는 상수로 준비, 예: "과학의 별들은 수학과 가장 많이 이어져 있습니다 — 데이터가 만나는 곳마다 융합이 시작됩니다."). 마지막 스톱은 전체 뷰로 줌아웃 + "이 모든 연결이, 하나의 교육과정입니다."

**투어 캡션 카드** (하단 중앙, z-30):

```jsx
<div className="absolute bottom-8 inset-x-0 z-30 flex justify-center pointer-events-none">
  <div key={stop.group} /* key 교체로 스톱마다 재등장 애니메이션 */
       className="pointer-events-auto w-[560px] max-w-[calc(100vw-32px)] px-6 py-5
                  bg-[#0E1633]/80 backdrop-blur-2xl border border-white/[0.12]
                  rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.45)]
                  animate-caption-in text-center">
    <div className="flex items-center justify-center gap-2 mb-1.5">
      <span className="w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: stop.color, boxShadow: `0 0 10px ${stop.color}` }} />
      <h2 className="text-lg font-bold text-slate-100">{stop.group}</h2>
    </div>
    <p className="text-[13px] tabular-nums text-slate-400/70 mb-2">
      성취기준 {stop.stats.nodes.toLocaleString()}개 · 연결 {stop.stats.links.toLocaleString()}개
      {stop.stats.topPartner && <> · 최다 연결 교과 <b className="text-slate-300/90">{stop.stats.topPartner}</b></>}
    </p>
    <p className="text-sm leading-relaxed text-slate-300/90">{stop.story}</p>
  </div>
</div>
```

**진행 인디케이터 + 종료 버튼** (캡션 카드 바로 위):

```jsx
<div className="absolute bottom-[168px] inset-x-0 z-30 flex justify-center">
  <div className="flex items-center gap-3 px-3 py-1.5 rounded-full
                  bg-[#0B1228]/70 backdrop-blur-xl border border-white/[0.08]">
    <div className="flex items-center gap-1.5">
      {stops.map((s, i) => (
        <button key={s.group} onClick={() => jumpToStop(i)}
          className={`rounded-full transition-all duration-300 ${
            i === current ? 'w-5 h-1.5' : 'w-1.5 h-1.5 hover:scale-125'}`}
          style={{ backgroundColor: i === current ? s.color : 'rgba(255,255,255,0.25)' }} />
      ))}
    </div>
    <span className="w-px h-3 bg-white/[0.12]" />
    <button onClick={endTour}
      className="flex items-center gap-1 text-[11px] font-medium text-slate-400/70 hover:text-slate-100 transition-colors">
      <X size={12} /> 투어 종료
    </button>
  </div>
</div>
```

- 현재 스톱 점은 해당 교과군 색으로 늘어난 알약(w-5), 나머지는 회색 점. 점 클릭으로 스톱 점프 가능.
- `Esc` 키·빈 우주 클릭도 투어 종료. 종료 시 전체 뷰로 1600ms 줌아웃 후 레전드 복귀.

### 4-5. 호버 툴팁 (노드 위 미니 라벨)

DOM 툴팁(캔버스 스프라이트 아님). 마우스 추적, 커서 우상단 +12/-12px 오프셋.

```jsx
<div className="pointer-events-none absolute z-40 px-2.5 py-1.5 rounded-lg
                bg-[#0B1228]/85 backdrop-blur-md border border-white/[0.12]
                shadow-[0_4px_16px_rgba(0,0,0,0.5)]
                transition-opacity duration-100"
     style={{ left: x + 12, top: y - 12, opacity: hovered ? 1 : 0 }}>
  <div className="flex items-center gap-1.5">
    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: groupColor }} />
    <span className="font-mono text-[11px] font-semibold text-slate-100">{node.code}</span>
    <span className="text-[11px] text-slate-400/70">{node.subject}</span>
  </div>
  <p className="mt-0.5 text-[11px] leading-snug text-slate-300/90 max-w-[240px] truncate">{node.content}</p>
</div>
```

호버 시 씬 반응: 해당 노드 크기 ×1.25로 150ms 러프(§6-2), 커서 `cursor-pointer`.

### 4-6. 로딩 상태 (첫 진입 연출과 연결)

로딩 = 연출의 1막. 스피너 대신 **"별이 태어나는 중"**.

- 배경 그라디언트(§1)는 즉시 표시. 중앙에:

```jsx
<div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5">
  {/* 맥동하는 씨앗 별 */}
  <div className="relative w-3 h-3">
    <span className="absolute inset-0 rounded-full bg-sky-300 animate-ping opacity-60" />
    <span className="absolute inset-0 rounded-full bg-sky-200 shadow-[0_0_24px_8px_rgba(125,211,252,0.5)]" />
  </div>
  <div className="text-center">
    <p className="text-sm font-semibold text-slate-100 tracking-wide">교육과정 우주를 그리는 중</p>
    <p className="mt-1 text-[11px] text-slate-400/70 tabular-nums">
      성취기준 {loaded.toLocaleString()} / {total > 0 ? total.toLocaleString() : '…'}
    </p>
  </div>
</div>
```

- 데이터 도착 → 이 레이어가 500ms 페이드아웃하며 **동시에** 진입 카메라 연출(§5-1) 시작. 씨앗 별의 위치에서 성운이 "피어나는" 것처럼 보이도록, 노드 알파를 0→1로 스태거 페이드(§5-1의 stage 2).
- 로딩이 300ms 미만이면 로딩 레이어를 아예 띄우지 않는다(깜빡임 방지).

### 4-7. 빈 상태 (데이터 0 또는 필터로 전멸)

```jsx
<div className="absolute inset-0 z-20 flex items-center justify-center">
  <div className="text-center px-8 py-7 bg-[#0B1228]/70 backdrop-blur-xl
                  border border-white/[0.08] rounded-2xl">
    <p className="text-2xl mb-3">🌑</p>
    <p className="text-sm font-semibold text-slate-100 mb-1">이 우주엔 아직 별이 없습니다</p>
    <p className="text-[13px] text-slate-400/70 mb-4">교과군을 켜거나 필터를 되돌려 보세요</p>
    <button onClick={resetAll}
      className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white bg-sky-500/90 hover:bg-sky-400 transition-colors">
      모두 켜기
    </button>
  </div>
</div>
```

---

## 5. 모션 디자인

이징 사전 (전 화면 공통):

| 이름 | 값 | 용도 |
|---|---|---|
| `easeOutCubic` | `1-(1-t)^3` / CSS `cubic-bezier(0.33,1,0.68,1)` | 등장, 카메라 감속 |
| `easeInOutCubic` | CSS `cubic-bezier(0.65,0,0.35,1)` | 플라이투, 투어 이동 |
| `easeOutExpo` | `1-2^(-10t)` | 카운트업 |
| UI 마이크로 | 기존 토큰 `--transition-fast`(150ms) 유지 | hover/색 전환 |

### 5-1. 첫 진입 카메라 연출 ("빅뱅" 시퀀스, 총 ~3.2s)

| 구간 | 시간 | 내용 |
|---|---|---|
| stage 0 | 0ms | 로딩 레이어 페이드아웃 시작 (500ms) |
| stage 1 | 0 → 2600ms | 카메라 dolly-in: 거리 **2200 → 850** (성운 전체가 프레임에 여백 12%로 담기는 거리), easeOutCubic. 동시에 카메라가 y축 기준 **-18° → 0°** 로 살짝 선회(도착 지점이 정면) — 직선 줌보다 훨씬 영화적 |
| stage 2 | 200 → 1800ms | 노드 알파 0 → 목표값. **교과군별 스태거**: 교과군 인덱스 × 120ms 지연으로 성단이 하나씩 점등. 각 노드 페이드는 600ms |
| stage 3 | 1400 → 2600ms | 링크 알파 0 → 0.10 일괄 페이드 — 별이 먼저, 실이 나중 |
| stage 4 | 2400ms | 상단 바·레전드 슬라이드 인 (translateY 8px + fade, 400ms, 스태거 80ms). 카운트업 시작 |
| stage 5 | 3200ms~ | idle 오토로테이트 시작(§5-6) |

reduced-motion(`prefers-reduced-motion: reduce`): stage 1을 0ms(즉시 850), stage 2·3을 400ms 단일 페이드로 축약.

### 5-2. 노드 선택 플라이투

- **duration 1100ms**, easeInOutCubic. 카메라 목표: 노드로부터 거리 **140** (노드 + 이웃 1-hop이 프레임에 들어오는 거리), 시선은 노드 중심.
- 경로: 현재→목표 직선 보간이 아니라 **중간점을 성운 중심 반대쪽으로 15% 밀어낸 quadratic bezier** — 성단을 뚫고 지나가지 않고 살짝 우회하는 곡선 항해감.
- 동시에 (같은 1100ms 동안): 선택 노드 크기 ×1.6 러프, 이웃 하이라이트 알파 상승, 비이웃 dim(§6-2). 상세 카드는 카메라 도착 **300ms 전**(t=800ms)에 등장 시작 — 도착과 카드 완성이 겹치는 리듬.
- 연속 클릭 시 진행 중 트윈은 현재 위치에서 새 목표로 재타겟(끊김 없이).

### 5-3. 칩 토글 씬 페이드

- 노드·링크 알파 러프 **400ms**, easeOutCubic. 셰이더 attribute를 프레임마다 러프(`current += (target-current) * (1-exp(-dt/130))` 방식 권장 — 중도 재토글에도 자연스러움).
- 칩 자체(색 점 글로우·텍스트 색)는 CSS `transition-all duration-200`.

### 5-4. 카드 등장/퇴장

index.css에 추가할 키프레임:

```css
@keyframes cardIn {
  from { transform: translateX(24px); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
@keyframes cardOut {
  from { transform: translateX(0);    opacity: 1; }
  to   { transform: translateX(24px); opacity: 0; }
}
@keyframes captionIn {
  from { transform: translateY(16px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
.animate-card-in    { animation: cardIn 280ms cubic-bezier(0.33,1,0.68,1) forwards; }
.animate-card-out   { animation: cardOut 200ms cubic-bezier(0.33,1,0.68,1) forwards; }
.animate-caption-in { animation: captionIn 400ms cubic-bezier(0.33,1,0.68,1) forwards; }
```

- 카드 내용 교체(같은 카드에서 다른 노드로): 컨테이너 유지, 내부만 opacity 0→1 **120ms** 크로스페이드.
- 툴팁: opacity만 100ms (transform 애니메이션 금지 — 마우스 추적과 충돌).

### 5-5. 투어 카메라 리듬

스톱당 **9초** 사이클:

| 구간 | 시간 | 내용 |
|---|---|---|
| 이동 | 0 → 2000ms | 이전 스톱 → 성단 무게중심, 거리 420(성단 전체 프레임), easeInOutCubic + §5-2 곡선 경로 |
| 정착·감상 | 2000 → 9000ms | 성단 중심 기준 **0.9°/s 저속 궤도 선회** (멈춰 있으면 죽은 화면). 해당 교과군 외 노드는 알파 ×0.35로 감광, 성단 내부 링크는 알파 0.3으로 상승 |
| 캡션 | 2000ms 시점 | 캡션 카드 등장(captionIn 400ms). 이동 시작 시(다음 스톱 0ms) 200ms 페이드아웃 |

- 마지막 스톱: 거리 850 전체 뷰로 **2400ms** 줌아웃, 전 교과군 알파 복원 — 피날레 "모든 성단이 다시 켜지는" 순간과 마무리 캡션.
- 투어 중 사용자가 드래그하면 즉시 일시정지(진행 인디케이터에 `Pause` 대신 재개 버튼 노출 — `<Play size={12}/>` 재개).

### 5-6. idle 오토로테이트

- 성운 중심 기준 **0.4°/s** (1회전 15분 — 존재감은 있되 인지되지 않는 속도). three.js OrbitControls 기준 `autoRotateSpeed = 0.133` (기본 2.0 = 30°/s 환산).
- 마지막 인터랙션 후 **8초** 무입력 시 시작, 시작 시 각속도 0→목표 2초 러프(덜컥거림 금지). 인터랙션 즉시 정지.
- 노드 선택 상태에서는 오토로테이트 하지 않는다(카드와 노드의 화면 관계 유지).

---

## 6. 씬 디자인 파라미터

### 6-1. 노드 크기 위계 (연결수 로그 스케일)

```
size(d) = S_MIN + (S_MAX - S_MIN) * log2(1 + d) / log2(1 + D_MAX)
S_MIN = 2.2   (연결 0~1개 일반 별, 화면픽셀 아님 — 월드 단위·원근 감쇠 적용)
S_MAX = 9.0   (최대 허브)
D_MAX = 전체 노드 degree 최대값 (클램프 상한 64 권장 — 극단 허브 1~2개가 태양이 되는 것 방지)
```

- 셰이더 `gl_PointSize = size * uPixelRatio * (280.0 / -mvPosition.z)` 형태, **최종 픽셀 크기 clamp(2.0, 56.0)**.
- 허브(상위 ~3%)는 halo 스프라이트 반경도 ×1.4 — 성단의 "일등성"이 시각적 앵커가 된다.

### 6-2. 상태별 크기·알파 매트릭스

| 상태 | 크기 배율 | 노드 알파 | 비고 |
|---|---|---|---|
| 기본 | ×1.0 | 0.85 | §2-1 core 색 |
| 호버 | ×1.25 | 1.0 | 150ms 러프 |
| **선택** | ×1.6 | 1.0 | + 펄스: scale 1.6↔1.75, 알파 1.0↔0.9, 주기 2000ms sine |
| 이웃(1-hop) | ×1.15 | 1.0 | |
| **딤(비이웃/꺼진 교과군)** | ×0.85 | **0.08** | 색상 유지 — 회색 전환 금지(성운의 색 지형은 유지된 채 어두워져야) |
| 투어 중 비대상 교과군 | ×1.0 | 기본×0.35 = 0.30 | 완전 소등 아님 |

### 6-3. 링크 라인 알파

| 상태 | 알파 | 색 | 폭 |
|---|---|---|---|
| 기본 | **0.10** | #7C89B8 단일색 | 1px |
| 선택 노드의 링크 | **0.85** | 링크 타입 색(§2-2) | 1.5px (LineWidth 미지원 환경에서는 밝기로 대체: 알파 0.95) |
| 딤 | **0.02** | #7C89B8 | 1px |
| 투어 성단 내부 | 0.30 | 타입 색 | 1px |

- 2,800개 라인 × 알파 0.10 additive가 성운의 "은하수 안개"를 만든다 — 이 은은한 잔광이 이 화면의 프로덕션 밸류 절반이다. 알파를 0.2 이상으로 올리면 즉시 싸구려 와이어볼이 되니 주의.
- 선택 시 하이라이트 링크는 **흐르는 대시 애니메이션**(dashOffset을 초당 -0.6 유닛) 적용 — "지식이 흐른다"는 은유. 기본 상태 라인에는 절대 적용 금지(전체가 꿈틀거리면 멀미).

### 6-4. 라벨 노출 정책

| 상황 | 노출 | 스타일 |
|---|---|---|
| 기본(전체 뷰) | **교과군 이름 라벨만 11개** — 각 성단 무게중심 상단에 | 캔버스 스프라이트, Pretendard 700 15px 기준 해상도 ×2, 색 = 교과군 core, 알파 0.75, 미세 글로우(shadowBlur 6, 동일색) |
| 카메라 거리 < 400 | + 프레임 내 **degree 상위 12개 노드 코드** | Pretendard 600 11px, #F1F5F9 @ α0.85, 배경 rgba(11,18,40,0.6) 라운드 4px 패딩 3×6px |
| 노드 선택 | 선택 노드 + 이웃 최대 10개(quality 상위순) 코드 라벨 | 동일, 선택 노드만 13px |
| 딤 노드 | 라벨 없음 | |

- 라벨 페이드 인/아웃 250ms. 거리 히스테리시스(진입 400/이탈 460)로 경계에서 깜빡임 방지.
- 성취기준 "내용" 전문은 3D 라벨로 올리지 않는다 — 툴팁·카드의 몫.

### 6-5. 성능 가드 (디자인 유지 조건)

- 노드 ~2,500 + 스타필드 800: Points 2 드로우콜, 링크는 LineSegments 1 드로우콜 유지.
- 알파·크기 상태 전환은 전부 attribute 러프(uniform 아닌 per-vertex) — 부분 하이라이트 때문.
- `devicePixelRatio` 상한 2. 60fps 미달 시 halo 스프라이트 해상도부터 낮출 것(색·알파 값은 불변).

---

## 7. 반응형 (<640px 모바일)

발표는 대개 데스크톱+빔이지만, 학부모가 QR로 열어보는 시나리오를 존중한다.

| 요소 | 모바일 처리 |
|---|---|
| 상단 바 | 좌측 알약: 로고+타이틀만(카운트 숨김 `hidden md:flex` 이미 반영). 우측: "우주 여행" 버튼은 아이콘만(`<Play/>`, px-2.5) |
| 레전드 | 좌하단 패널 대신 **하단 가로 스크롤 스트립**: `absolute bottom-0 inset-x-0 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 flex gap-1.5 overflow-x-auto` + 배경 `bg-gradient-to-t from-[#04060F] to-transparent`. 칩은 동일 스펙, 학교급 3칩을 맨 앞에 |
| 상세 카드 | 우측 패널 대신 **바텀 시트**: `fixed inset-x-0 bottom-0 rounded-t-2xl max-h-[62dvh]`, 등장은 translateY(100%)→0 300ms. 상단에 드래그 핸들 `w-9 h-1 rounded-full bg-white/20 mx-auto mt-2`. 아래로 스와이프 닫기. 시트가 열리면 레전드 스트립 숨김 |
| 투어 캡션 | 동일 하단 중앙, `w-full mx-4 px-4 py-4`, 스토리 문장 `text-[13px]`. 진행 인디케이터는 캡션 카드 **내부 상단**으로 이동(별도 알약 생략) |
| 툴팁 | 터치 환경에선 미표시(탭 = 즉시 선택) |
| 플라이투 거리 | 노드 140 → **180** (좁은 화면에서 이웃까지 담기 위해), 첫 진입 종착 거리 850 → **1000** |
| 성능 | 스타필드 800 → 400, `devicePixelRatio` 상한 1.5 |

---

## 부록 A. 구현 체크리스트 (디자인 수용 기준)

1. 첫 진입 3.2초 시퀀스가 로딩→점등→UI 순서로 이어지고, 어느 단계에서도 흰 화면·검은 정지 화면이 없다
2. 전체 뷰에서 교과군 성단이 색으로 구분되고, 어떤 두 성단도 겹침부에서 백색 포화되지 않는다 (additive 캡 확인)
3. 기본 상태 라인은 은은한 단일색 안개(α0.10), 타입 색은 선택 시에만 나타난다
4. 칩 off = 소멸이 아닌 감광(α0.08, 색 유지) — 400ms 페이드
5. 노드 선택 → 1.1초 곡선 플라이투 + 도착 직전 카드 등장의 리듬이 맞는다
6. "다음 연결로 여행" 연타로 우주 항해가 끊김 없이 이어진다
7. 투어: 9초/스톱, 정착 중 저속 궤도 선회, 캡션·인디케이터 동작, Esc/드래그 인터럽트
8. idle 8초 후 0.4°/s 오토로테이트가 2초에 걸쳐 부드럽게 시작된다
9. prefers-reduced-motion에서 진입·플라이투가 축약된다
10. 375px 폭에서 바텀 시트·레전드 스트립·safe-area가 정상 동작한다

## 부록 B. 코드 상수 제안 (구현 시 단일 소스로)

```js
// client/src/components/explore/nebulaTheme.js (신규 제안)
export const NEBULA_BG = { inner: '#0B1230', mid: '#070B1D', outer: '#04060F' }
export const NEBULA_FOG = { color: 0x070B1D, density: 0.00055 }
export const SUBJECT_COLORS_DARK = {
  '국어': '#F87171', '수학': '#60A5FA', '영어': '#818CF8', '과학': '#4ADE80',
  '사회': '#FACC15', '도덕': '#FB923C', '정보': '#22D3EE',
  '기술·가정': '#C084FC', '실과(기술·가정)/정보': '#C084FC', '실과': '#2DD4BF',
  '체육': '#A3E635', '음악': '#A78BFA', '미술': '#F472B6',
  '제2외국어': '#38BDF8', '한문': '#2DD4BF',
}
export const LINK_TYPE_COLORS_DARK = {
  cross_subject: '#FBBF24', same_concept: '#60A5FA', prerequisite: '#F87171',
  application: '#4ADE80', extension: '#C084FC',
}
export const LINK_BASE_COLOR = '#7C89B8'
export const ALPHA = { node: 0.85, nodeDim: 0.08, link: 0.10, linkHi: 0.85, linkDim: 0.02, tourOff: 0.30 }
export const SIZE = { min: 2.2, max: 9.0, degreeClamp: 64, hover: 1.25, selected: 1.6, neighbor: 1.15, dim: 0.85 }
export const TIMING = {
  entryDolly: 2600, entryStagger: 120, flyTo: 1100, chipFade: 400,
  cardIn: 280, cardOut: 200, tourMove: 2000, tourDwell: 7000, idleDelay: 8000,
}
export const CAMERA = { entryStart: 2200, overview: 850, nodeFocus: 140, clusterFocus: 420, mobileNodeFocus: 180 }
export const AUTOROTATE_DEG_PER_SEC = 0.4
```
