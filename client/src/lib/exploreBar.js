/**
 * 탐색 화면 머리 줄의 표시 모델 — 보낼 곳과 프로젝트 조회 상태를 머리 줄 속성으로 바꾼다(순수 함수).
 */
import { getProcedureDisplayCode } from 'curriculum-weaver-shared/constants.js'
import { EXPLORE_COPY } from './explorationCopy'
import { A3_PROCEDURE } from './futuresProjectHandoff'
import { destinationAccess, exploreHubUrl } from './exploreDestination'

const C = EXPLORE_COPY.common
const S = EXPLORE_COPY.status

export function a3DisplayCode() {
  return getProcedureDisplayCode(A3_PROCEDURE)
}

/**
 * @param destination { type, projectId }
 * @param projectState { status: 'none'|'loading'|'ready'|'error', project }
 * @returns { icon, target, status:{tone,text}, note, changeHref, access }
 */
export function destinationBarModel(destination, projectState = { status: 'none' }) {
  if (destination?.type !== 'project') {
    return {
      icon: 'new', target: C.newProject, status: { tone: 'neutral', text: S.exploring }, note: S.exploringNote,
      changeHref: exploreHubUrl(destination, { preferNew: true }), access: { canSend: true, readOnly: false, blocked: false },
    }
  }
  const changeHref = exploreHubUrl(destination)
  if (projectState.status === 'error') {
    return {
      icon: 'project', target: C.unknownProject, status: { tone: 'warning', text: S.loadFailed }, note: S.loadFailedNote,
      changeHref, access: { canSend: false, readOnly: false, blocked: false },
    }
  }
  if (projectState.status !== 'ready' || !projectState.project) {
    return { icon: 'project', target: C.loadingProject, status: { tone: 'neutral', text: S.loading }, note: '', changeHref, access: { canSend: false, readOnly: false, blocked: false } }
  }
  const project = projectState.project
  const access = destinationAccess(project)
  const target = C.projectAtA3(project.title || C.unknownProject, a3DisplayCode())
  if (access.blocked) return { icon: 'lock', target, status: { tone: 'warning', text: S.blocked }, note: '', changeHref, access }
  if (access.readOnly) return { icon: 'lock', target, status: { tone: 'warning', text: S.readOnly }, note: S.readOnlyNote, changeHref, access }
  return { icon: 'project', target, status: { tone: 'neutral', text: S.exploring }, note: S.exploringNote, changeHref, access }
}
