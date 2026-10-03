import { Link } from 'react-router-dom'
import './explorationLaunchpad.css'

const ENTRIES = [
  { to: '/graph?mode=explore', situation: '아직 방향을 찾고 있다면', title: '3D 자유 탐색', description: '교과 사이를 자유롭게 둘러보며 수업의 실마리를 발견하세요.' },
  { to: '/graph?mode=design&lens=pair', situation: '함께할 과목이 정해졌다면', title: '과목 중심 탐색', description: '우리 과목들이 만날 수 있는 성취기준을 찾아보세요.' },
  { to: '/futures-lab', situation: '사용할 성취기준을 골랐다면', title: '미래보기', description: '같은 기준에서 펼쳐지는 다양한 수업을 만나보세요.' },
]

export default function ExplorationLaunchpad() {
  return <section id="exploration" aria-labelledby="exploration-title" className="exploration-launchpad">
    <div className="exploration-launchpad__surface">
      <header className="exploration-launchpad__intro">
        <p className="exploration-launchpad__kicker">서로 다른 교과가 만나는 곳</p>
        <h2 id="exploration-title">수업 아이디어 탐색</h2>
        <p className="exploration-launchpad__description">지금 우리 팀의 상황에 맞는 방법으로 시작해 보세요.</p>
      </header>
      <nav aria-label="새 수업의 탐색 방법" className="exploration-launchpad__entries">
        {ENTRIES.map(entry => <Link key={entry.to} to={entry.to} className="exploration-launchpad__entry">
          <span className="exploration-launchpad__situation">{entry.situation}</span>
          <span className="exploration-launchpad__entry-title">{entry.title}<span aria-hidden="true">→</span></span>
          <span className="exploration-launchpad__entry-description">{entry.description}</span>
        </Link>)}
      </nav>
    </div>
    <div className="exploration-launchpad__project">
      <strong>진행 중인 프로젝트가 있나요?</strong>
      <p>해당 프로젝트의 <b>A-3 성취기준 분석</b>에서 미래보기를 열고, 찾은 아이디어를 기존 설계와 비교해 보세요.</p>
      <span>탐색 결과는 검토용 초안입니다. 프로젝트에서 제안을 수락하거나 보드를 저장해야 반영됩니다.</span>
    </div>
    <div className="exploration-launchpad__links">
      <Link to="/graph?mode=design&lens=theme">주제로 성취기준 찾기 <span aria-hidden="true">→</span></Link>
      <Link to="/guide">사용 안내</Link>
    </div>
  </section>
}
