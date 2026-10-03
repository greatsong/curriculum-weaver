import { Link } from 'react-router-dom'
import { Orbit, Columns2, Lightbulb, ArrowRight } from 'lucide-react'
import './explorationLaunchpad.css'

// 홈의 수업 아이디어 탐색 카드.
// 앱의 밝은 카드·토큰을 그대로 쓰고(어두운 별도 판 없음), 높이를 줄여 내 워크스페이스가
// 첫 화면에 보이게 한다. 링크 주소와 순서는 기존과 같다(explorationStatus.test가 검사).
const ENTRIES = [
  {
    to: '/graph?mode=explore',
    title: '전체 지도(3D)',
    description: '방향을 정하기 전에 교과 사이 연결을 전체 지도에서 둘러봅니다.',
    Icon: Orbit,
    tone: 'blue',
  },
  {
    to: '/graph?mode=design&lens=pair',
    title: '두 과목으로 찾기',
    description: '함께할 과목이 정해졌을 때 두 과목의 성취기준 연결을 찾습니다.',
    Icon: Columns2,
    tone: 'green',
  },
  {
    to: '/futures-lab',
    title: '미래보기',
    description: '고른 성취기준으로 만들 수 있는 수업 아이디어를 비교합니다.',
    Icon: Lightbulb,
    tone: 'amber',
  },
]

const STEPS = ['성취기준 고르기', '수업 아이디어 비교', '프로젝트에 반영']

export default function ExplorationLaunchpad() {
  return (
    <section id="exploration" aria-labelledby="exploration-title" className="exploration-card">
      <div className="exploration-card__intro">
        <h2 id="exploration-title">수업 아이디어 탐색</h2>
        <p className="exploration-card__description">
          성취기준을 고르고, 고른 성취기준으로 만들 수 있는 수업 아이디어를 비교합니다.
        </p>
        <ol aria-label="탐색 순서" className="exploration-card__steps">
          {STEPS.map((step, i) => (
            <li key={step}>
              <span className="exploration-card__step-no" aria-hidden="true">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
        <p className="exploration-card__note">
          탐색 결과는 프로젝트에서 제안을 수락하거나 보드를 저장해야 반영됩니다.
          진행 중인 프로젝트는 그 프로젝트의 A-3 절차에서 미래보기를 엽니다.
        </p>
      </div>

      <div className="exploration-card__side">
        <nav aria-label="수업 아이디어 탐색 방법" className="exploration-card__entries">
          {ENTRIES.map(({ to, title, description, Icon, tone }) => (
            <Link key={to} to={to} className="exploration-card__entry">
              <span className={`exploration-card__icon exploration-card__icon--${tone}`} aria-hidden="true">
                <Icon size={20} strokeWidth={2} />
              </span>
              <span className="exploration-card__entry-text">
                <strong>{title}</strong>
                <span>{description}</span>
              </span>
              <ArrowRight size={18} className="exploration-card__arrow" aria-hidden="true" />
            </Link>
          ))}
        </nav>
        <div className="exploration-card__links">
          <Link to="/graph?mode=design&lens=theme">주제로 성취기준 찾기</Link>
          <Link to="/guide">사용 안내</Link>
        </div>
      </div>
    </section>
  )
}
