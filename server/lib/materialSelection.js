/**
 * 채팅 요청의 selected_material_ids를 서버 자료 목록 기준으로 정규화한다.
 *
 * undefined/null/배열 아님: 하위 호환을 위해 "전체 자료 포함"으로 해석(undefined 반환)
 * [] + explicit=false: 클라이언트 자료 목록이 아직 비어 있던 상태로 보고 전체 포함
 * [] + explicit=true: 교사가 자료 패널에서 "모두 제외"를 선택한 것으로 보고 빈 배열 유지
 */
export function resolveSelectedMaterialIds(selectedRaw, materials, opts = {}) {
  if (!Array.isArray(selectedRaw)) return undefined

  const explicit = opts.explicit === true
  const validSet = new Set(
    (Array.isArray(materials) ? materials : [])
      .map((m) => m?.id)
      .filter((id) => typeof id === 'string' && id.length > 0)
  )

  const selected = [
    ...new Set(
      selectedRaw.filter((v) => typeof v === 'string' && validSet.has(v))
    ),
  ]

  if (selected.length > 0) return selected

  // 빈 배열이 명시적으로 전송된 경우에만 "자료 전체 제외"로 처리한다.
  if (explicit && selectedRaw.length === 0) return []

  // selectedRaw에 값은 있었지만 모두 유효하지 않으면 stale/temp id로 보고 전체 포함한다.
  return undefined
}
