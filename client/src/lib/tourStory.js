// 교육과정 성운 투어 캡션 문장

// 받침 있는 말 뒤에는 withFinal, 없는 말 뒤에는 withoutFinal 조사를 붙인다.
// 한글로 끝나지 않으면(영문·숫자·기호) 받침 없음으로 본다.
export function josa(word, withFinal, withoutFinal) {
  const code = String(word || '').trim().slice(-1).charCodeAt(0) - 0xac00
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0
  return hasFinal ? withFinal : withoutFinal
}

// 투어 스토리 문장 (교과군 통계 기반 — 절제된 플라네타리움 내레이션)
// topThemes: 이 교과군 링크들의 실제 융합 주제 상위 빈도 — 템플릿을 데이터로 구체화
export function buildStory(group, topPartner, topThemes = []) {
  const wa = josa(topPartner, '과', '와')
  const reul = josa(topPartner, '을', '를')
  const lines = [
    `${group}의 별들은 ${topPartner}${wa} 가장 많이 이어져 있습니다 — 두 성단이 만나는 곳마다 융합 수업이 시작됩니다.`,
    `${group} 성단에서 뻗어 나간 빛의 실은 ${topPartner}에 가장 많이 닿습니다. 교과의 경계는 생각보다 얇습니다.`,
    `${group}의 지식은 ${topPartner}${reul} 만나 새로운 수업이 됩니다 — 연결선 하나가 곧 수업 아이디어 하나입니다.`,
  ]
  // 교과군명 기반 결정적 선택 (렌더마다 바뀌지 않게)
  let h = 0
  for (const ch of group) h = (h * 31 + ch.charCodeAt(0)) | 0
  const base = lines[Math.abs(h) % lines.length]
  const themes = topThemes.filter(Boolean).slice(0, 2)
  return themes.length > 0
    ? `${base} 이 성단의 대표 융합 주제는 ${themes.length === 2
        ? `'${themes[0]}'${josa(themes[0], '과', '와')} '${themes[1]}'`
        : `'${themes[0]}'`}입니다.`
    : base
}
