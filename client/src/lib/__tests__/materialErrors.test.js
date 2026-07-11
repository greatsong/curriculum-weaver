/**
 * materialErrors — 업로드 사전 검증·실패 사유 변환 테스트
 */
import { describe, it, expect } from 'vitest'
import { validateMaterialFile, materialFailureMessage } from '../materialErrors'
import {
  MAX_MATERIAL_SIZE_BYTES,
  SUPPORTED_MATERIAL_EXTENSIONS,
} from 'curriculum-weaver-shared/constants.js'

const makeFile = (name, size) => ({ name, size })
const OPTS = { maxBytes: MAX_MATERIAL_SIZE_BYTES, allowedExts: SUPPORTED_MATERIAL_EXTENSIONS }

describe('validateMaterialFile — 업로드 전 사전 검증', () => {
  it('일반 문서는 통과', () => {
    expect(validateMaterialFile(makeFile('수업안.pdf', 1024 * 1024), OPTS)).toBeNull()
  })

  it('이미지 5MB 초과는 업로드 전에 거부 (실패 전 안내)', () => {
    const err = validateMaterialFile(makeFile('활동사진.jpg', 7 * 1024 * 1024), OPTS)
    expect(err).not.toBeNull()
    expect(err.message).toMatch(/이미지가 너무 큽니다/)
    expect(err.message).toMatch(/5MB/)
  })

  it('이미지 5MB 이하는 통과', () => {
    expect(validateMaterialFile(makeFile('활동사진.png', 3 * 1024 * 1024), OPTS)).toBeNull()
  })

  it('허용 목록 밖 확장자는 거부', () => {
    const err = validateMaterialFile(makeFile('문서.hwp', 1024), OPTS)
    expect(err.message).toMatch(/지원하지 않는 형식/)
  })
})

describe('materialFailureMessage — 실패 사유 사용자 문구 변환', () => {
  it('서버 안내문(CODE: 메시지)의 메시지 부분을 그대로 사용', () => {
    const msg = materialFailureMessage({
      processing_error: 'UNSUPPORTED_TYPE: 이미지가 너무 큽니다 (7MB). 5MB 이하로 줄여 올려주세요.',
    })
    expect(msg).toBe('이미지가 너무 큽니다 (7MB). 5MB 이하로 줄여 올려주세요.')
  })

  it('INTERNAL은 기술 원문 대신 매핑 문구로 대체', () => {
    const msg = materialFailureMessage({ processing_error: 'INTERNAL: ECONNRESET at socket.js:42' })
    expect(msg).toMatch(/서버 오류/)
    expect(msg).not.toMatch(/ECONNRESET/)
  })

  it('processing_error가 없으면 기본 문구', () => {
    expect(materialFailureMessage({})).toMatch(/서버 오류/)
    expect(materialFailureMessage(null)).toMatch(/서버 오류/)
  })
})
