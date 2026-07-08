/**
 * curriculum_links DB 서비스 레이어
 *
 * 링크의 단일 소스는 Supabase `curriculum_links` 테이블이다.
 * - 부팅 시: hydrateLinksFromDB()가 DB 전체를 읽어 인메모리 스토어를 교체
 * - 쓰기: persistLinks() / persistLinkStatus()가 DB에 영속화
 * - Supabase 미설정(로컬 dev placeholder) 또는 장애 시: 정적 파일 기반
 *   인메모리 링크(generatedLinks.js)가 그대로 유지된다 (폴백).
 */
import { supabaseAdmin } from './supabaseAdmin.js'
import { StandardLinks } from './store.js'

const PAGE_SIZE = 1000

/** Supabase가 실제로 구성되었는지 (placeholder dev 모드 제외) */
export function isSupabaseReady() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return Boolean(url && key && !url.includes('placeholder'))
}

/** curriculum_links 전체 조회 (페이지네이션 — Supabase 기본 1,000행 제한 대응) */
export async function fetchAllCurriculumLinks() {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('curriculum_links')
      .select('id, source_code, target_code, link_type, rationale, integration_theme, lesson_hook, semantic_score, quality_score, status, generation_method, created_at')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`curriculum_links 조회 실패: ${error.message}`)
    rows.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return rows
}

/**
 * 부팅 시 DB → 인메모리 하이드레이션.
 * 실패하거나 DB가 비어 있으면 정적 파일 링크를 유지한다 (비파괴 폴백).
 */
export async function hydrateLinksFromDB() {
  if (!isSupabaseReady()) {
    console.log('[links] Supabase 미설정 — 정적 파일 링크 유지 (dev 모드)')
    return { hydrated: false, reason: 'not_configured' }
  }
  try {
    const rows = await fetchAllCurriculumLinks()
    if (rows.length === 0) {
      console.warn('[links] curriculum_links 테이블이 비어 있음 — 정적 파일 링크 유지')
      return { hydrated: false, reason: 'empty_table' }
    }
    const stats = StandardLinks.replaceAll(rows)
    console.log(`[links] DB 하이드레이션 완료: ${stats.loaded}개 로드, ${stats.skipped}개 스킵(미등재 코드)`)
    return { hydrated: true, ...stats }
  } catch (err) {
    console.error('[links] DB 하이드레이션 실패 — 정적 파일 링크 유지:', err.message)
    return { hydrated: false, reason: 'error', error: err.message }
  }
}

/**
 * 링크 목록을 DB에 영속화 (add-links 등 런타임 추가분).
 * onConflict(source_code, target_code)로 멱등 — 기존 행은 건드리지 않는다.
 *
 * @param {object[]} links - 인메모리 링크 객체 배열 (source_code/target_code 필수)
 * @returns {{ persisted: boolean, count?: number, error?: string }}
 */
export async function persistLinks(links) {
  if (!isSupabaseReady()) return { persisted: false, error: 'not_configured' }
  const rows = links.map(l => ({
    // 스키마 제약(source_code < target_code)에 맞춰 정규화
    source_code: l.source_code < l.target_code ? l.source_code : l.target_code,
    target_code: l.source_code < l.target_code ? l.target_code : l.source_code,
    link_type: l.link_type,
    rationale: l.rationale || null,
    integration_theme: l.integration_theme || null,
    lesson_hook: l.lesson_hook || null,
    semantic_score: l.semantic_score ?? null,
    quality_score: l.quality_score ?? null,
    status: l.status || 'candidate',
    generation_method: l.generation_method || 'ai',
  }))
  try {
    const { error } = await supabaseAdmin
      .from('curriculum_links')
      .upsert(rows, { onConflict: 'source_code,target_code', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
    return { persisted: true, count: rows.length }
  } catch (err) {
    console.error('[links] DB 영속화 실패:', err.message)
    return { persisted: false, error: err.message }
  }
}

/**
 * 링크 상태 변경을 DB에 영속화.
 * 인메모리 링크 id와 DB id가 다를 수 있으므로 (source_code, target_code) 쌍으로 매칭.
 */
export async function persistLinkStatus(sourceCode, targetCode, status) {
  if (!isSupabaseReady()) return { persisted: false, error: 'not_configured' }
  // DB는 source < target으로 정규화 저장 — 조회 키도 동일하게 정규화
  if (sourceCode > targetCode) [sourceCode, targetCode] = [targetCode, sourceCode]
  const patch = { status }
  if (status === 'reviewed' || status === 'published') {
    patch.reviewed_at = new Date().toISOString()
  }
  try {
    const { error } = await supabaseAdmin
      .from('curriculum_links')
      .update(patch)
      .eq('source_code', sourceCode)
      .eq('target_code', targetCode)
    if (error) throw new Error(error.message)
    return { persisted: true }
  } catch (err) {
    console.error('[links] 상태 영속화 실패:', err.message)
    return { persisted: false, error: err.message }
  }
}
