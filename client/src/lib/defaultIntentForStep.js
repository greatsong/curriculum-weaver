/**
 * 현재 절차 코드 → 자료 업로드 기본 intent 매핑 유틸
 *
 * 채팅 인라인 업로드 시 IntentPopover의 기본값을 결정한다.
 * 교사가 `A-2-1` 단계에서 파일을 드롭하면 "교육과정 문서"로 추정하는 식.
 *
 * 관련 설계: _workspace/design/chat-inline-upload-phase1.md §7.2
 */

import { MATERIAL_INTENTS } from 'curriculum-weaver-shared/constants.js'

/**
 * 절차 코드 → intent 기본 매핑 테이블
 * @type {Record<string, string>}
 */
export const DEFAULT_INTENT_BY_PROCEDURE = {
  prep:     MATERIAL_INTENTS.LEARNER_CONTEXT,
  'A-1-2':  MATERIAL_INTENTS.GENERAL,
  'A-2-1':  MATERIAL_INTENTS.CURRICULUM_DOC,
  'A-2-2':  MATERIAL_INTENTS.CURRICULUM_DOC,
  'Ds-1-1': MATERIAL_INTENTS.ASSESSMENT,
  'Ds-1-3': MATERIAL_INTENTS.RESEARCH,
}

/**
 * 현 절차 코드에 맞는 기본 intent 반환.
 * 매핑에 없으면 GENERAL 반환.
 *
 * @param {string} procedureCode - 절차 코드 (예: 'A-2-1')
 * @returns {string}
 */
export function getDefaultIntent(procedureCode) {
  return DEFAULT_INTENT_BY_PROCEDURE[procedureCode] ?? MATERIAL_INTENTS.GENERAL
}
