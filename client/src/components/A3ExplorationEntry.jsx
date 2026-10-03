import React from 'react'
import { A3_PROCEDURE, handoffPolicy, projectExplorationUrl } from '../lib/futuresProjectHandoff'

export default function A3ExplorationEntry({ project, procedure }) {
  if (!project || project.learner_context?.demo || procedure !== A3_PROCEDURE) return null
  const policy = handoffPolicy(project)
  return <aside style={{ padding: '10px 16px', background: '#eef6ff', borderBottom: '1px solid #cbdff4', display: 'flex', flexWrap: 'wrap', gap: '8px 18px', alignItems: 'center', flexShrink: 0 }} aria-label="A-3 연결 아이디어 탐색">
    <div style={{ flex: '1 1 280px', fontSize: 12, color: '#334e68' }}>
      <strong>{project.title} · A-3 아이디어 검토</strong>
      <div>{policy.blocked ? policy.note : '미래보기에서 탐색한 결과는 검토용 초안입니다. 복사 후 이 A-3 대화창에서 검토하고 보드에 저장해야 반영됩니다.'}</div>
      {!policy.blocked && (project.status === 'simulation' || project.title?.startsWith('[시뮬레이션]')) && <div>{policy.note}</div>}
    </div>
    {policy.blocked ? <button type="button" disabled>미래보기로 연결 아이디어 검토</button> :
      <a href={projectExplorationUrl(project.id)} target="_blank" rel="noopener noreferrer" style={{ color: '#245b8a', fontSize: 13, fontWeight: 700 }}>미래보기로 연결 아이디어 검토 ↗</a>}
  </aside>
}
