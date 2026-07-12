/**
 * nebulaTheme — 3D 쇼케이스(교육과정 성운) 디자인 상수 단일 소스
 * 근거: _workspace/design/graph3d-showcase-spec.md
 * 카메라 거리는 사전계산 레이아웃 반경(p95≈170)에 맞게 스케일 조정됨.
 */
export const NEBULA_BG = { inner: '#0B1230', mid: '#070B1D', outer: '#04060F' }
export const NEBULA_FOG = { color: 0x070b1d, density: 0.00055 }

// 다크 + additive blending 보정 팔레트 (라이트 500~600 → 400 리프트, 채도 -10%p)
export const SUBJECT_COLORS_DARK = {
  '국어': '#F87171', '수학': '#60A5FA', '영어': '#818CF8', '과학': '#4ADE80',
  '사회': '#FACC15', '도덕': '#FB923C', '정보': '#22D3EE',
  '기술·가정': '#C084FC', '실과(기술·가정)/정보': '#C084FC', '실과': '#2DD4BF',
  '체육': '#A3E635', '음악': '#A78BFA', '미술': '#F472B6',
  '제2외국어': '#38BDF8', '한문': '#2DD4BF',
  // 데이터에 존재하는 확장 교과군 (graph3d 실측 19종 대응)
  '과학계열전문': '#34D399', '예술계열전문': '#E879F9',
  '체육계열전문': '#BEF264', '산업수요전문': '#FB7185', '교양': '#94A3B8',
}
export const FALLBACK_NODE_COLOR = '#9CA3AF'

export const LINK_TYPE_COLORS_DARK = {
  cross_subject: '#FBBF24', same_concept: '#60A5FA', prerequisite: '#F87171',
  application: '#4ADE80', extension: '#C084FC',
}
export const LINK_TYPE_LABELS = {
  cross_subject: '교과연계', same_concept: '동일개념', prerequisite: '선수학습',
  application: '적용', extension: '확장',
}
export const LINK_BASE_COLOR = '#7C89B8'

export const ALPHA = {
  node: 0.85, nodeDim: 0.08,
  link: 0.08, linkHi: 0.85, linkDim: 0.02,
  tourOff: 0.35, // 투어 중 비대상 교과군 배율
  tourLink: 0.30,
}
export const SIZE = {
  min: 2.6, max: 9.5, degreeClamp: 64,
  hover: 1.25, selected: 1.6, neighbor: 1.15, dim: 0.85,
}
export const TIMING = {
  entryDolly: 2600, entryStagger: 120, entryNodeFade: 600,
  entryLinkStart: 1400, entryLinkFade: 1200,
  flyTo: 1100, chipFade: 400, cardIn: 280, cardOut: 200,
  tourMove: 2000, tourDwell: 7000, idleDelay: 8000, autoRotateRamp: 2000,
}
// 레이아웃 반경 ~170 기준 (스펙 원안은 반경 ~600 기준 → 비율 유지 축소)
export const CAMERA = {
  entryStart: 1300, overview: 430, nodeFocus: 95, clusterFocus: 250,
  mobileNodeFocus: 125, mobileOverview: 540,
}
export const AUTOROTATE = { idleDegPerSec: 0.4, tourDegPerSec: 0.9 }
