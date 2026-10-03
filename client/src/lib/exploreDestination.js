/**
 * 수업 아이디어 탐색의 "보낼 곳"과 목적지별 담기 저장소.
 *
 * 보낼 곳은 URL의 ?project=<id>로 이어진다(없으면 새 프로젝트).
 * 담기는 목적지마다 sessionStorage 키를 나눈다:
 *   - 새 프로젝트: cw_explore_basket:new  (기존 cw_design_basket과 함께 읽고 함께 쓴다)
 *   - 진행 중인 프로젝트: cw_explore_basket:project:<id>
 * 기존 cw_design_basket은 프로젝트 만들기(WorkspaceDetailPage)와 옛 화면들이 읽고 쓰므로
 * 새 프로젝트 담기는 두 키를 같은 값으로 유지한다(호환). 읽을 때는 두 키를 합친다.
 * 저장소 접근은 모두 try/catch로 감싼다(사생활 보호 모드·차단 환경).
 */
import { buildFuturesSearch, FUTURE_MAX, FUTURE_MIN } from './futures2'

export const LEGACY_BASKET_KEY = 'cw_design_basket'
export const BASKET_META_KEY = 'cw_design_basket_meta'
export const NEW_BASKET_KEY = 'cw_explore_basket:new'
const PROJECT_BASKET_PREFIX = 'cw_explore_basket:project:'
const MAX_ID_LENGTH = 200

/** 보낼 곳 객체 */
export const NEW_DESTINATION = Object.freeze({ type: 'new', projectId: '' })

export function projectDestination(projectId) {
  const id = cleanId(projectId)
  return id ? { type: 'project', projectId: id } : NEW_DESTINATION
}

function cleanId(value) {
  if (typeof value !== 'string') return ''
  const id = value.trim()
  if (!id || id.length > MAX_ID_LENGTH) return ''
  return id
}

/** URL 검색 문자열(또는 URLSearchParams) → 보낼 곳 */
export function parseDestination(search) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search || '')
  return projectDestination(params.get('project') || '')
}

/** 보낼 곳을 URLSearchParams에 기록(새 객체 반환) */
export function withDestination(params, destination) {
  const next = new URLSearchParams(params)
  if (destination?.type === 'project' && destination.projectId) next.set('project', destination.projectId)
  else next.delete('project')
  return next
}

export function isSameDestination(a, b) {
  return (a?.type || 'new') === (b?.type || 'new') && (a?.projectId || '') === (b?.projectId || '')
}

export function basketStorageKey(destination) {
  return destination?.type === 'project' && destination.projectId
    ? `${PROJECT_BASKET_PREFIX}${destination.projectId}`
    : NEW_BASKET_KEY
}

function readList(storage, key) {
  try {
    const raw = storage?.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string' && k) : []
  } catch {
    return []
  }
}

/** 목적지의 담은 성취기준 key 목록(순서 유지, 중복 제거) */
export function readBasket(storage, destination) {
  const own = readList(storage, basketStorageKey(destination))
  if (destination?.type === 'project') return [...new Set(own)]
  return [...new Set([...own, ...readList(storage, LEGACY_BASKET_KEY)])]
}

/** 목적지 담기를 통째로 저장. 성공 여부를 돌려준다. */
export function writeBasket(storage, destination, keys) {
  const list = [...new Set((keys || []).filter((k) => typeof k === 'string' && k))]
  try {
    const value = JSON.stringify(list)
    storage.setItem(basketStorageKey(destination), value)
    if (destination?.type !== 'project') storage.setItem(LEGACY_BASKET_KEY, value)
    return true
  } catch {
    return false
  }
}

export function clearBasket(storage, destination) {
  try {
    storage.removeItem(basketStorageKey(destination))
    if (destination?.type !== 'project') storage.removeItem(LEGACY_BASKET_KEY)
    return true
  } catch {
    return false
  }
}

/** 담기 key → 교과군 메타(프로젝트 만들기 모달의 교과 자동 선택용). 목적지와 무관하게 하나만 둔다. */
export function readBasketMeta(storage) {
  try {
    const meta = JSON.parse(storage?.getItem(BASKET_META_KEY) || '{}')
    return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {}
  } catch {
    return {}
  }
}

export function mergeBasketMeta(storage, entries) {
  try {
    const meta = readBasketMeta(storage)
    for (const [key, group] of entries) if (key && group) meta[key] = group
    storage.setItem(BASKET_META_KEY, JSON.stringify(meta))
    return true
  } catch {
    return false
  }
}

/** 미래보기 비교 가능 여부 — 2~7개. 넘치면 임의로 자르지 않고 막는다. */
export function compareAvailability(count) {
  if (count < FUTURE_MIN) return { ok: false, reason: 'tooFew' }
  if (count > FUTURE_MAX) return { ok: false, reason: 'tooMany' }
  return { ok: true, reason: '' }
}

/** 탐색 화면 주소 모음 — 보낼 곳을 항상 함께 넘긴다 */
export function exploreHubUrl(destination, { preferNew = false } = {}) {
  if (destination?.type === 'project' && destination.projectId) return `/explore?project=${encodeURIComponent(destination.projectId)}`
  return preferNew ? '/explore?for=new' : '/explore'
}

export function graphUrl({ mode = 'design', lens = '', destination } = {}) {
  const params = new URLSearchParams()
  params.set('mode', mode)
  if (lens) params.set('lens', lens)
  return `/graph?${withDestination(params, destination).toString()}`
}

export function futuresUrl({ keys = [], model, destination } = {}) {
  const params = new URLSearchParams(buildFuturesSearch(keys, model))
  const next = withDestination(params, destination)
  const s = next.toString()
  return `/futures-lab${s ? `?${s}` : ''}`
}

export function projectPath(project) {
  if (!project?.id || !project?.workspace_id) return ''
  return `/workspaces/${encodeURIComponent(project.workspace_id)}/projects/${encodeURIComponent(project.id)}`
}

/** 보낼 곳 프로젝트의 쓰기 가능 여부 — 읽기 전용·차단 상태를 한 곳에서 판정한다. */
export function destinationAccess(project) {
  if (!project) return { canSend: false, readOnly: false, blocked: false }
  const demo = project.learner_context?.demo === true
  const blocked = demo || project.status === 'generating' || project.status === 'failed'
  const readOnly = !blocked && (project.status === 'simulation' || String(project.title || '').startsWith('[시뮬레이션]') || project.my_role === 'viewer')
  return { canSend: !blocked && !readOnly, readOnly, blocked }
}
