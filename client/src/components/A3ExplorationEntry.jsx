import React from 'react'
import { A3_PROCEDURE, handoffPolicy, projectExplorationUrl } from '../lib/futuresProjectHandoff'

export default function A3ExplorationEntry({ project, procedure }) {
  if (!project || project.learner_context?.demo || procedure !== A3_PROCEDURE) return null
  const policy = handoffPolicy(project)
  return <aside style={{ padding: '10px 16px', background: '#eef6ff', borderBottom: '1px solid #cbdff4', display: 'flex', flexWrap: 'wrap', gap: '8px 18px', alignItems: 'center', flexShrink: 0 }} aria-label="A-3 연결 아이디어 탐색">
    <div style={{ flex: '1 1 280px', fontSize: 12, color: '#334e68' }}>
      <strong>교과 사이의 연결을 살펴보세요.</strong>
      <div>{policy.blocked ? policy.note : '현재 성취기준으로 새 탭에서 탐색합니다. 결과를 복사해 이 A-3 대화창에서 검토하세요.'}</div>
      {!policy.blocked && (project.status === 'simulation' || project.title?.startsWith('[시뮬레이션]')) && <div>{policy.note}</div>}
    </div>
    {policy.blocked ? <button type="button" disabled>연결 아이디어 탐색</button> :
      <a href={projectExplorationUrl(project.id)} target="_blank" rel="noopener noreferrer" style={{ color: '#245b8a', fontSize: 13, fontWeight: 700 }}>연결 아이디어 탐색 ↗</a>}
  </aside>
}
