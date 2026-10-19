/**
 * 미래보기 색 — 검색 결과 점(교과군 색)과 넣은 성취기준 묶음(스톤 여섯 색).
 * 삭제한 옛 판(futures2Scene·timeStone2Visuals)에서 미래보기가 쓰던 두 함수만 옮겨 왔다(2026-10-19).
 */
export const GROUP_COLORS = {
  '국어': '#F87171', '수학': '#60A5FA', '영어': '#818CF8', '과학': '#4ADE80', '사회': '#FACC15', '도덕': '#FB923C', '정보': '#22D3EE',
  '기술·가정': '#C084FC', '체육': '#A3E635', '음악': '#A78BFA', '미술': '#F472B6', '한문': '#2DD4BF', '제2외국어': '#38BDF8', '교양': '#94A3B8',
}
export const colorOfStandard = (s) => GROUP_COLORS[s?.subject_group] || '#9CA3AF'

export const STONE_COLORS = ['#3D8BFF', '#FFD23F', '#FF3D52', '#A55BFF', '#FF8A2B', '#2BF59B']
export const colorOfStone = (index) => STONE_COLORS[((index % 6) + 6) % 6]
