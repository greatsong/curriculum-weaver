/**
 * 홈의 수업 아이디어 탐색 카드 — 밝은 카드 하나. 먼저 "결과를 넣을 곳"(새 수업 / 진행 중인 프로젝트)을
 * 고르게 하고, 도구를 아는 교사를 위해 바로 열기 링크를 둔다.
 */
import { Link } from 'react-router-dom'
import { Lightbulb, FolderOpen, ArrowRight, ChevronRight, Globe } from 'lucide-react'
import Button from './ui/Button'
import { EXPLORE_COPY } from '../lib/explorationCopy'

const H = EXPLORE_COPY.home

function Choice({ to, icon: Icon, tint, title, body }) {
  return (
    <Link to={to}
      className="group flex items-center gap-3.5 min-h-[76px] px-[18px] py-3.5 border border-border-strong rounded-lg bg-bg-secondary text-text-primary no-underline transition hover:border-text-secondary hover:bg-bg-primary">
      <span aria-hidden="true" className={`inline-flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${tint}`}>
        <Icon size={20} strokeWidth={2} />
      </span>
      <span className="flex flex-col gap-0.5 flex-1 min-w-0">
        <strong className="text-[15px] font-semibold">{title}</strong>
        <span className="text-[13px] leading-snug text-text-secondary">{body}</span>
      </span>
      <ArrowRight aria-hidden="true" size={18} className="text-text-secondary shrink-0 transition group-hover:translate-x-0.5" />
    </Link>
  )
}

export default function ExploreEntryCard() {
  return (
    <section id="exploration" aria-labelledby="explore-card-title"
      className="mb-10 bg-bg-secondary border border-border rounded-xl p-5 sm:p-7 grid gap-6 sm:gap-8 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start">
      <div className="flex flex-col gap-3.5 min-w-0">
        <h2 id="explore-card-title" className="m-0 text-xl font-bold text-text-primary">{H.cardTitle}</h2>
        <p className="m-0 text-sm leading-7 text-text-body max-w-[34em]">{H.cardBody}</p>
        <ol aria-label={H.stepsLabel} className="list-none m-0 p-0 flex flex-wrap items-center gap-2 text-[13px] text-text-body">
          {H.steps.map((step, i) => (
            <li key={step} className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full bg-bg-tertiary text-xs font-bold text-text-primary">{i + 1}</span>
              {step}
              {i < H.steps.length - 1 && <ChevronRight aria-hidden="true" size={14} className="text-text-secondary" />}
            </li>
          ))}
        </ol>
        <p className="m-0 text-[13px] leading-6 text-text-secondary">{H.cardNote}</p>
      </div>
      <div className="flex flex-col gap-2.5 min-w-0">
        {/* 탐색 결과를 넣을 곳을 먼저 고른다 — 아이콘 바탕은 공용 상태 색(정보·성공) 변수 */}
        <Choice to="/explore?for=new" icon={Lightbulb} tint="bg-[var(--ui-tone-info-bg)] text-[var(--ui-tone-info-fg)]"
          title={H.newChoiceTitle} body={H.newChoiceBody} />
        <Choice to="/explore?for=project" icon={FolderOpen} tint="bg-[var(--ui-tone-success-bg)] text-[var(--ui-tone-success-fg)]"
          title={H.projectChoiceTitle} body={H.projectChoiceBody} />
        <nav aria-label={H.directLabel} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          <span className="text-text-secondary mr-1">{H.directLabel}</span>
          <Button variant="link" size="sm" to="/graph?mode=explore" icon={Globe} title={H.directMapTitle}>{H.directMap}</Button>
          <Button variant="link" size="sm" to="/futures-lab">{H.directFutures}</Button>
          <Button variant="link" size="sm" to="/guide">{H.directGuide}</Button>
        </nav>
      </div>
    </section>
  )
}
