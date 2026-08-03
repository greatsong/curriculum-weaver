/**
 * 협력적 수업설계 총괄 원리 (Layer 1)
 * 5개 원리 + 13개 지침 — 모든 단계에 공통 적용
 *
 * 이 원리들은 실제 연구에 기반하여 도출된 것으로,
 * 설계 전 과정에 걸쳐 일관되게 적용됩니다.
 */
export const GENERAL_PRINCIPLES = [
  {
    id: 'GP01',
    name: '상호 의존의 원리',
    description: '팀원의 역할과 결과가 서로 이어지도록 협력하는 방법의 원리.',
    guidelines: [
      {
        id: 'GP01-G1',
        content: '설계팀의 궁극적인 목적(비전)을 설정하고 공유하라.',
      },
      {
        id: 'GP01-G2',
        content: '설계팀 구성원들은 상호 간에 편안하고 안전하다고 믿을 정도로 서로 간에 신뢰를 형성하라.',
      },
      {
        id: 'GP01-G3',
        content: '설계팀 초기에 팀 구성원들의 인적 특성을 파악하고 공유하라.',
      },
    ],
  },
  {
    id: 'GP02',
    name: '인지 분산의 원리',
    description: '생각과 결정, 진행 상황을 표와 기록지, 각종 도구, 공유 문서에 나누어 담는 원리.',
    guidelines: [
      {
        id: 'GP02-G1',
        content: '새로운 활동을 시작하기 전에 촉진자를 비롯하여 설계팀 구성원에게 적절한 역할(권한)을 부여하라.',
      },
      {
        id: 'GP02-G2',
        content: '협력적 수업 설계 활동을 지원하는 인공물을 배치하고 활용하라.',
      },
    ],
  },
  {
    id: 'GP03',
    name: '활성화의 원리',
    description: '각자의 생각과 경험을 먼저 꺼내 논의의 재료를 충분히 마련하는 원리.',
    guidelines: [
      {
        id: 'GP03-G1',
        content: '구성원들이 설계 전 과정에서 자유롭게 발언하도록 하라.',
      },
      {
        id: 'GP03-G2',
        content: '교사들이 자유롭게 협력적 수업 설계할 시간과 공간을 확보하라.',
      },
    ],
  },
  {
    id: 'GP04',
    name: '외현화의 원리',
    description: '머릿속 생각을 키워드와 메모, 그림이나 표로 나타내어 함께 보는 원리.',
    guidelines: [
      {
        id: 'GP04-G1',
        content: '설계 팀 구성원들은 다른 사람들에게 자신의 내적인 인지(생각)를 외부적으로 표현하라.',
      },
      {
        id: 'GP04-G2',
        content: '설계과정에서 팀원들이 표현한 개념, 관점, 행동들 중 명확하지 않은 부분에 대해 질문하라.',
      },
    ],
  },
  {
    id: 'GP05',
    name: '조정의 원리',
    description: '여러 의견을 기준에 따라 묶고 비교해서 공동의 결론으로 다듬는 원리.',
    guidelines: [
      {
        id: 'GP05-G1',
        content: '구성원들의 다양한 의견들을 조직화하거나 논증함으로써 통합하라.',
      },
      {
        id: 'GP05-G2',
        content: '협력적 수업설계과정에서 도출된 구성원들의 아이디어와 산출물들을 목표와 비교하여 주기적으로 조정하라.',
      },
      {
        id: 'GP05-G3',
        content: '협력적 수업설계과정에서 상대방의 아이디어와 산출물들에 대해 교사 상호간 기술적(descriptive)이고 구체적인 피드백을 제공하라.',
      },
      {
        id: 'GP05-G4',
        content: '협력적 수업 설계과정에서 설계팀이 결정한 내용들을 전체 구성원들과 공유하고 개별 팀원들의 설계활동을 스스로 조정하라.',
      },
    ],
  },
]

/**
 * GP id → 원리 이름 조회 (activityFlow의 collaborationTag 표시에 사용)
 * short: true면 "~의 원리" 접미사를 뗀 짧은 형태(교사 대상 UI용)를 반환한다.
 * @param {string} id - GP01~GP05
 * @param {{ short?: boolean }} [opts]
 * @returns {string|null} 이름 또는 id가 유효하지 않으면 null
 */
export function getGeneralPrincipleName(id, { short = false } = {}) {
  const gp = GENERAL_PRINCIPLES.find((g) => g.id === id)
  if (!gp) return null
  return short ? gp.name.replace(/의 원리$/, '') : gp.name
}
