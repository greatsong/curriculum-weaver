/**
 * 융합 넛지 — "X의 렌즈로 Y를 본다면?" 질문형 프리셋.
 *
 * 강요가 아니라 영감. 이웃 렌즈 빈 화면에서 교사가 당길 때만 노출하고,
 * 매번 섞어서 "정답 목록"이 아니라 "이런 것도 되네" 하는 넛지로 읽히게 한다.
 * 클릭하면 concept 성취기준으로 진입 + 그 자리에서 3개짜리 실생활 시나리오를 연다.
 * (concept = 문제를 보는 렌즈/도구, contexts = 함께 엮는 다른 교과 맥락)
 */
export const FUSION_NUDGES = [
  {
    id: 'confucius-ai',
    question: '논어의 렌즈로 AI 윤리를 본다면?',
    concept: '[12한고01-07]',
    contexts: ['[12인기01-01]', '[12윤탐03-03]'],
    subjects: ['한문 고전', '인공지능', '윤리'],
  },
  {
    id: 'stats-poll',
    question: '통계의 렌즈로 여론조사를 본다면, 왜 예측은 빗나갈까?',
    concept: '[12실통01-03]',
    contexts: ['[12정치02-01]', '[12데과01-01]'],
    subjects: ['실용 통계', '정치', '데이터 과학'],
  },
  {
    id: 'physics-war',
    question: '물리학의 렌즈로 세계대전을 다시 읽는다면?',
    concept: '[10통과2-02-04]',
    contexts: ['[12세사04-01]', '[12영독01-02]'],
    subjects: ['과학', '세계사', '영어'],
  },
]

/** 표시용: 매번 순서를 섞어 "고정 목록"이 아니라 영감으로 읽히게 한다 (index 시드로 결정적) */
export function shuffledNudges(seed = 0) {
  const arr = [...FUSION_NUDGES]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (seed * 9301 + 49297 + i * 233) % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
