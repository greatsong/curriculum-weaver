import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiGet } from '../lib/api'

/**
 * 관리자 사용 현황 (DataManage "사용 현황" 탭, 2026-10-20)
 * GET /api/admin/overview?days=7|30|90 — 집계 규칙은 server/routes/adminOverview.js 머리 주석 참고.
 * 워크스페이스별·계정별 활동, 날짜별 교사 메시지, AI 비용(추정)을 보여 준다.
 */

const PERIODS = [7, 30, 90]
const TZ = 'Asia/Seoul'
const DAY_MS = 86_400_000

export const ROUTE_LABELS = {
  chat: '설계 채팅',
  demo_intro: '시연 안내',
  material_analysis: '자료 분석',
  link_scenario: '연결 시나리오',
  recommend_ai: '성취기준 추천',
  futures_lab: '미래보기',
  futures_lab_bridges: '미래보기 연결',
}

const APPROVAL_BADGES = {
  approved: { label: '승인', className: 'bg-gray-100 text-gray-600' },
  pending: { label: '승인 대기', className: 'bg-amber-100 text-amber-800' },
  rejected: { label: '거절', className: 'bg-red-100 text-red-700' },
  unknown: { label: '확인 불가', className: 'bg-gray-100 text-gray-500' },
}

/** 목록을 못 읽었을 때 안내 — 0은 연결 실패·시간 초과 */
export function overviewErrorMessage(status) {
  if (status === 403) return '관리자 권한이 필요합니다.'
  if (!status) return '서버에 연결하지 못했습니다. 잠시 후 다시 불러와 주세요.'
  return '사용 현황을 불러오지 못했습니다. 잠시 후 다시 불러와 주세요.'
}

const num = (n) => Number(n || 0).toLocaleString('ko-KR')
export const usd = (n) => {
  const v = Number(n || 0)
  if (v === 0) return '$0'
  return v < 0.01 ? '<$0.01' : `$${v.toFixed(2)}`
}

const kstDayKey = (ms) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10)

/** 마지막 활동 표시 — "10/19 (어제)" 형식, 한국 시간 기준 */
export function formatLastActivity(iso, now = Date.now()) {
  if (!iso) return { text: '없음', title: '' }
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return { text: '없음', title: '' }
  const diffDays = Math.round((Date.parse(kstDayKey(now)) - Date.parse(kstDayKey(t))) / DAY_MS)
  const md = new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, month: 'numeric', day: 'numeric' }).format(t)
  const rel = diffDays <= 0 ? '오늘' : diffDays === 1 ? '어제' : `${diffDays}일 전`
  return { text: `${md} (${rel})`, title: new Date(t).toLocaleString('ko-KR', { timeZone: TZ }) }
}

const formatDate = (iso) => (iso ? new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, year: '2-digit', month: 'numeric', day: 'numeric' }).format(Date.parse(iso)) : '')
const formatLongDate = (iso) => (iso ? new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, year: 'numeric', month: 'long', day: 'numeric' }).format(Date.parse(iso)) : '')
const shortDay = (day) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`

function StatTile({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-400">{sub}</div>}
    </div>
  )
}

/** 날짜별 교사 메시지 막대 — 막대 위에 올리면 그날 활동 계정·AI 호출을 보여 준다 */
function DailyChart({ daily }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...daily.map((d) => d.teacher_messages))
  const peakIdx = daily.findIndex((d) => d.teacher_messages === max && max > 0)
  const tickEvery = daily.length <= 7 ? 1 : daily.length <= 30 ? 7 : 15
  const H = 140
  return (
    <div className="relative" data-testid="daily-chart">
      <div className="relative" style={{ height: H }}>
        {/* 기준선 3개 — 0·중간·최대 */}
        {[0, 0.5, 1].map((f) => (
          <div key={f} className="absolute left-8 right-0 border-t border-gray-100" style={{ bottom: f * H }}>
            <span className="absolute -left-8 -top-2 w-7 text-right text-[10px] text-gray-400 tabular-nums">{num(Math.round(max * f))}</span>
          </div>
        ))}
        <div className="absolute left-8 right-0 bottom-0 top-0 flex items-end" style={{ gap: 2 }}>
          {daily.map((d, i) => {
            const h = d.teacher_messages ? Math.max(2, Math.round((d.teacher_messages / max) * H)) : 0
            return (
              <div
                key={d.day}
                className="relative flex-1 h-full flex items-end justify-center cursor-default"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((v) => (v === i ? null : v))}
              >
                {i === peakIdx && (
                  <span className="absolute text-[10px] text-gray-600 tabular-nums whitespace-nowrap" style={{ bottom: h + 2 }}>{num(d.teacher_messages)}</span>
                )}
                <div
                  className={`w-full ${hover === i ? 'bg-blue-600' : 'bg-blue-500'}`}
                  style={{ height: h, maxWidth: 24, borderRadius: '4px 4px 0 0' }}
                />
              </div>
            )
          })}
        </div>
        {hover != null && daily[hover] && (
          <div
            className="absolute z-10 pointer-events-none rounded-lg border border-gray-200 bg-white shadow-md px-3 py-2 text-xs text-gray-700 whitespace-nowrap"
            style={hover / daily.length < 0.6
              // 막대 오른쪽 옆에 띄운다(오른쪽 끝 가까이면 왼쪽 옆). 막대와 위쪽 요약 칸을 가리지 않게
              ? { top: 0, left: `calc(2rem + (100% - 2rem) * ${(hover + 1) / daily.length} + 6px)` }
              : { top: 0, left: `calc(2rem + (100% - 2rem) * ${hover / daily.length} - 6px)`, transform: 'translateX(-100%)' }}
            role="tooltip"
          >
            <div className="font-semibold text-gray-900 mb-0.5">{daily[hover].day}</div>
            <div>교사 메시지 <strong className="tabular-nums">{num(daily[hover].teacher_messages)}</strong></div>
            <div>활동 계정 <strong className="tabular-nums">{num(daily[hover].active_accounts)}</strong></div>
            <div>AI 호출 <strong className="tabular-nums">{num(daily[hover].ai_calls)}</strong> · {usd(daily[hover].ai_cost)}</div>
          </div>
        )}
      </div>
      <div className="ml-8 mt-1 flex" style={{ gap: 2 }}>
        {daily.map((d, i) => (
          <div key={d.day} className="flex-1 text-center text-[10px] text-gray-400 tabular-nums whitespace-nowrap overflow-visible">
            {(i % tickEvery === 0 || i === daily.length - 1) && (i === daily.length - 1 || daily.length - 1 - i >= tickEvery / 2) ? shortDay(d.day) : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

function Section({ title, right, children }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-gray-800">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

const th = 'px-3 py-2 text-left text-xs font-medium text-gray-500 whitespace-nowrap'
const td = 'px-3 py-2 align-top'

function WorkspaceTable({ workspaces, steps, now }) {
  const [onlyActive, setOnlyActive] = useState(false)
  const [open, setOpen] = useState(() => new Set())
  const rows = onlyActive ? workspaces.filter((w) => w.active_members_window > 0) : workspaces
  const toggle = (id) => setOpen((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  return (
    <Section
      title={`워크스페이스 ${num(rows.length)}곳`}
      right={(
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
          기간 안에 활동한 곳만
        </label>
      )}
    >
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full text-sm min-w-[760px]" data-testid="workspace-table">
          <thead className="bg-gray-50">
            <tr>
              <th className={th}>워크스페이스</th>
              <th className={`${th} text-right`}>팀원</th>
              <th className={`${th} text-right`}>프로젝트</th>
              <th className={th}>가장 앞선 절차</th>
              <th className={`${th} text-right`}>교사 메시지<br /><span className="font-normal">기간 / 전체</span></th>
              <th className={th}>마지막 활동</th>
              <th className={`${th} text-right`}>AI 비용<br /><span className="font-normal">기간</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((w) => {
              const last = formatLastActivity(w.last_activity_at, now)
              const isOpen = open.has(w.id)
              return (
                <Fragment key={w.id}>
                <tr className="hover:bg-gray-50">
                  <td className={td}>
                    <button
                      type="button"
                      onClick={() => toggle(w.id)}
                      className="text-left font-medium text-gray-900 hover:underline disabled:no-underline disabled:cursor-default"
                      disabled={w.projects === 0}
                      aria-expanded={isOpen}
                    >
                      {w.projects > 0 && <span className="inline-block w-3 text-gray-400">{isOpen ? '▾' : '▸'}</span>}
                      {w.name || '(이름 없음)'}
                    </button>
                    <div className="text-xs text-gray-400">{w.owner_name || '소유자 정보 없음'} · {formatDate(w.created_at)} 생성</div>
                  </td>
                  <td className={`${td} text-right tabular-nums whitespace-nowrap`}>
                    {num(w.members)}
                    {w.active_members_window > 0 && <div className="text-xs text-gray-400">활동 {num(w.active_members_window)}</div>}
                  </td>
                  <td className={`${td} text-right tabular-nums whitespace-nowrap`}>
                    {num(w.projects)}
                    {w.simulations > 0 && <div className="text-xs text-gray-400">시뮬레이션 {num(w.simulations)}</div>}
                  </td>
                  <td className={td}>
                    {w.furthest ? (
                      <>
                        <div className="text-gray-700">{w.furthest.label}</div>
                        {w.furthest.step > 0 && <div className="text-xs text-gray-400 tabular-nums">{w.furthest.step}/{steps} 단계</div>}
                      </>
                    ) : <span className="text-gray-300">-</span>}
                  </td>
                  <td className={`${td} text-right tabular-nums whitespace-nowrap`}>
                    <span className={w.teacher_messages_window ? 'text-gray-900 font-medium' : 'text-gray-400'}>{num(w.teacher_messages_window)}</span>
                    <span className="text-gray-400"> / {num(w.teacher_messages)}</span>
                  </td>
                  <td className={`${td} whitespace-nowrap text-gray-600`} title={last.title}>{last.text}</td>
                  <td className={`${td} text-right tabular-nums text-gray-600 whitespace-nowrap`}>{w.ai_calls_window ? usd(w.ai_cost_window) : <span className="text-gray-300">-</span>}</td>
                </tr>
                {isOpen && (
                  <tr className="bg-gray-50/60">
                    <td colSpan={7} className="px-3 pb-3 pt-1">
                      <ul className="space-y-1 text-xs text-gray-600">
                        {w.project_list.map((p) => (
                          <li key={p.id} className="flex flex-wrap gap-x-3 pl-4">
                            <span className="font-medium text-gray-800">{p.title || '(제목 없음)'}</span>
                            <span>{p.procedure.label}</span>
                            <span className="tabular-nums">교사 메시지 {num(p.teacher_messages)}</span>
                            <span>{formatLastActivity(p.last_activity_at, now).text}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
                </Fragment>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="py-10 text-center text-sm text-gray-400">해당하는 워크스페이스가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function AccountTable({ accounts, now }) {
  const [query, setQuery] = useState('')
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return accounts
    return accounts.filter((a) => [a.name, a.email, a.school_name].some((v) => String(v || '').toLowerCase().includes(q)))
  }, [accounts, query])
  return (
    <Section
      title={`계정 ${num(rows.length)}개`}
      right={(
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름·이메일·학교 검색"
          className="w-full sm:w-56 px-3 py-1.5 rounded-lg border border-gray-200 text-sm"
          aria-label="계정 검색"
        />
      )}
    >
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full text-sm min-w-[820px]" data-testid="account-table">
          <thead className="bg-gray-50">
            <tr>
              <th className={th}>계정</th>
              <th className={th}>상태</th>
              <th className={th}>가입</th>
              <th className={`${th} text-right`}>워크스페이스</th>
              <th className={`${th} text-right`}>교사 메시지<br /><span className="font-normal">기간 / 전체</span></th>
              <th className={`${th} text-right`}>보드 저장<br /><span className="font-normal">기간</span></th>
              <th className={th}>마지막 활동</th>
              <th className={`${th} text-right`}>AI 호출·비용<br /><span className="font-normal">기간</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((a) => {
              const last = formatLastActivity(a.last_activity_at, now)
              const badge = APPROVAL_BADGES[a.approval]
              return (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className={td}>
                    <div className="font-medium text-gray-900">{a.name || '(이름 없음)'}</div>
                    <div className="text-xs text-gray-400 break-all">{a.email}{a.school_name ? ` · ${a.school_name}` : ''}</div>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {a.role === 'admin' && <span className="mr-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] font-semibold">관리자</span>}
                    {a.role !== 'admin' && badge && <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>}
                  </td>
                  <td className={`${td} whitespace-nowrap text-gray-600 tabular-nums`}>{formatDate(a.joined_at)}</td>
                  <td className={`${td} text-right tabular-nums`}>{num(a.workspaces)}</td>
                  <td className={`${td} text-right tabular-nums whitespace-nowrap`}>
                    <span className={a.teacher_messages_window ? 'text-gray-900 font-medium' : 'text-gray-400'}>{num(a.teacher_messages_window)}</span>
                    <span className="text-gray-400"> / {num(a.teacher_messages)}</span>
                  </td>
                  <td className={`${td} text-right tabular-nums ${a.board_saves_window ? 'text-gray-700' : 'text-gray-300'}`}>{num(a.board_saves_window)}</td>
                  <td className={`${td} whitespace-nowrap text-gray-600`} title={last.title}>{last.text}</td>
                  <td className={`${td} text-right tabular-nums text-gray-600 whitespace-nowrap`}>
                    {a.ai_calls_window ? <>{num(a.ai_calls_window)}회 · {usd(a.ai_cost_window)}</> : <span className="text-gray-300">-</span>}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="py-10 text-center text-sm text-gray-400">검색 결과가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function AiCostSection({ ai, days }) {
  const since = ai.tracking_since ? formatLongDate(ai.tracking_since) : null
  return (
    <Section title={`AI 비용 추정 (최근 ${days}일)`}>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mb-3">
        <div className="text-2xl font-semibold text-gray-900 tabular-nums">{usd(ai.cost_window)}</div>
        <div className="text-sm text-gray-600">교사 사용 <strong className="tabular-nums">{usd(ai.teacher_cost_window)}</strong></div>
        <div className="text-sm text-gray-600">관리자 사용 <strong className="tabular-nums">{usd(ai.admin_cost_window)}</strong></div>
        <div className="text-sm text-gray-600">호출 <strong className="tabular-nums">{num(ai.calls_window)}</strong>회{ai.errors_window > 0 && <> · 오류 {num(ai.errors_window)}회</>}</div>
      </div>
      {ai.by_model_route.length > 0 ? (
        <div className="overflow-x-auto -mx-4 sm:mx-0 mb-3">
          <table className="w-full text-sm min-w-[480px]" data-testid="ai-cost-table">
            <thead className="bg-gray-50">
              <tr>
                <th className={th}>기능</th>
                <th className={th}>모델</th>
                <th className={`${th} text-right`}>호출</th>
                <th className={`${th} text-right`}>비용</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ai.by_model_route.map((r) => (
                <tr key={`${r.model}|${r.route}`}>
                  <td className={td}>{ROUTE_LABELS[r.route] || r.route}</td>
                  <td className={`${td} text-gray-500`}>{r.model || '-'}</td>
                  <td className={`${td} text-right tabular-nums`}>{num(r.calls)}{r.errors > 0 && <span className="text-xs text-red-600"> (오류 {num(r.errors)})</span>}</td>
                  <td className={`${td} text-right tabular-nums`}>{r.unpriced ? '단가 없음' : usd(r.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-400 mb-3">이 기간에 기록된 AI 호출이 없습니다.</p>
      )}
      <p className="text-xs text-gray-400 leading-relaxed">
        단가표로 계산한 추정치입니다. 실제 청구액은{' '}
        <a href="https://console.anthropic.com/settings/usage" target="_blank" rel="noreferrer" className="underline hover:text-gray-600">Anthropic 콘솔</a>과{' '}
        <a href="https://platform.openai.com/usage" target="_blank" rel="noreferrer" className="underline hover:text-gray-600">OpenAI 사용량 화면</a>에서 확인합니다.
        {since ? ` AI 사용 기록은 ${since}부터 남아 있어 그 전 비용은 포함되지 않습니다.` : ' 아직 AI 사용 기록이 없습니다.'}
        {' '}관리자 사용분은 하루 사용 한도 계산에서 빠집니다.
      </p>
    </Section>
  )
}

export default function UsageOverview() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null) // null=로딩 전 | 응답 | { error, status }
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)

  const load = useCallback(async (period, fresh = false) => {
    const id = ++reqId.current
    setLoading(true)
    try {
      const res = await apiGet('/api/admin/overview', fresh ? { days: period, fresh: 1 } : { days: period })
      if (id === reqId.current) setData(res)
    } catch (err) {
      if (id === reqId.current) setData({ error: err?.message || '불러오지 못했습니다.', status: err?.status || 0 })
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [])

  useEffect(() => { load(days) }, [days, load])

  if (!data) return <div className="py-16 text-center text-sm text-gray-400">불러오는 중…</div>
  if (data.error) {
    return (
      <div className="py-16 text-center text-sm space-y-3">
        <p className="text-red-500">{overviewErrorMessage(data.status)}</p>
        {data.status !== 403 && (
          <button onClick={() => load(days, true)} className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 border border-gray-200">
            다시 불러오기
          </button>
        )}
      </div>
    )
  }

  const { totals, ai, daily, workspaces, accounts } = data
  const now = Date.parse(data.generated_at) || Date.now()
  const generated = new Date(now).toLocaleTimeString('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`space-y-4 ${loading ? 'opacity-60 transition-opacity' : ''}`} data-testid="usage-overview">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg" role="group" aria-label="기간">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setDays(p)}
              aria-pressed={days === p}
              className={`px-3 py-1.5 rounded-md text-sm font-medium min-h-[36px] ${days === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              최근 {p}일
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{generated} 기준</span>
          <button onClick={() => load(days, true)} disabled={loading} className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 border border-gray-200 disabled:opacity-50">
            새로고침
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="계정"
          value={num(totals.accounts)}
          sub={[
            totals.approval?.pending ? `승인 대기 ${num(totals.approval.pending)}` : null,
            `활동 기록 없음 ${num(totals.never_active_accounts)}`,
          ].filter(Boolean).join(' · ')}
        />
        <StatTile label={`최근 ${days}일 활동 계정`} value={num(totals.active_accounts_window)} sub={`전체 ${num(totals.accounts)}개 중`} />
        <StatTile label={`최근 ${days}일 활동 워크스페이스`} value={num(totals.active_workspaces_window)} sub={`전체 ${num(totals.workspaces)}곳 중`} />
        <StatTile label={`최근 ${days}일 교사 메시지`} value={num(totals.teacher_messages_window)} sub={`전체 ${num(totals.teacher_messages)}건`} />
      </div>

      <Section title="날짜별 교사 메시지">
        <DailyChart daily={daily} />
        <details className="mt-3">
          <summary className="text-xs text-gray-500 cursor-pointer select-none">표로 보기</summary>
          <div className="overflow-x-auto mt-2 max-h-64 overflow-y-auto">
            <table className="w-full text-xs" data-testid="daily-table">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className={th}>날짜</th>
                  <th className={`${th} text-right`}>교사 메시지</th>
                  <th className={`${th} text-right`}>활동 계정</th>
                  <th className={`${th} text-right`}>AI 호출</th>
                  <th className={`${th} text-right`}>AI 비용</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...daily].reverse().map((d) => (
                  <tr key={d.day}>
                    <td className="px-3 py-1.5 tabular-nums">{d.day}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{num(d.teacher_messages)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{num(d.active_accounts)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{num(d.ai_calls)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{usd(d.ai_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Section>

      <AiCostSection ai={ai} days={days} />
      <WorkspaceTable workspaces={workspaces} steps={data.procedure_steps} now={now} />
      <AccountTable accounts={accounts} now={now} />

      <div className="text-xs text-gray-400 leading-relaxed space-y-1" data-testid="usage-notes">
        <p>활동은 교사 메시지, 보드 저장, AI 호출을 기준으로 계산합니다. 로그인만 하고 아무것도 하지 않은 경우는 활동에 들어가지 않습니다.</p>
        {totals.simulation_teacher_messages > 0 && (
          <p>시뮬레이션 프로젝트 {num(totals.simulations)}개의 가상 교사 메시지 {num(totals.simulation_teacher_messages)}건은 집계에서 뺐습니다.</p>
        )}
        {totals.unattributed_teacher_messages > 0 && (
          <p>작성자가 기록되지 않은 예전 교사 메시지 {num(totals.unattributed_teacher_messages)}건은 워크스페이스 수에는 들어가고 계정 수에는 들어가지 않습니다.</p>
        )}
        {data.approval_loaded === false && <p>승인 상태를 불러오지 못해 상태 칸을 비워 두었습니다.</p>}
        {data.truncated?.length > 0 && <p className="text-amber-700">일부 기록이 너무 많아 끝까지 읽지 못했습니다({data.truncated.join(', ')}).</p>}
      </div>
    </div>
  )
}
