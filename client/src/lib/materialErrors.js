import { MATERIAL_ERROR_CODES } from 'curriculum-weaver-shared/constants.js'

/**
 * 자료 업로드/분석 에러 코드 → 한국어 메시지 매핑.
 * (file-upload-redesign.md §9 에러 매핑 표 기반)
 */
const MATERIAL_ERROR_MESSAGES = {
  [MATERIAL_ERROR_CODES.FILE_REQUIRED]: '파일을 선택해주세요.',
  [MATERIAL_ERROR_CODES.FILE_TOO_LARGE]: '파일이 너무 큽니다. 20MB 이하로 올려주세요.',
  [MATERIAL_ERROR_CODES.UNSUPPORTED_TYPE]:
    '지원하지 않는 형식입니다. PDF, DOCX, PPTX, XLSX, TXT, CSV를 이용해주세요.',
  [MATERIAL_ERROR_CODES.MAGIC_BYTE_MISMATCH]:
    '파일 내용이 확장자와 일치하지 않아요. 올바른 파일을 선택해주세요.',
  [MATERIAL_ERROR_CODES.PROJECT_ID_REQUIRED]: '프로젝트 정보가 필요합니다.',
  [MATERIAL_ERROR_CODES.PROJECT_NOT_FOUND]: '프로젝트를 찾을 수 없습니다.',
  [MATERIAL_ERROR_CODES.FORBIDDEN]: '이 프로젝트에 접근 권한이 없습니다.',
  [MATERIAL_ERROR_CODES.UPLOAD_FAILED]:
    '업로드 서버에 일시적인 문제가 발생했어요. 다시 시도해주세요.',
  [MATERIAL_ERROR_CODES.STORAGE_QUOTA_EXCEEDED]:
    '프로젝트 저장 용량을 초과했습니다. 이전 자료를 정리해주세요.',
  [MATERIAL_ERROR_CODES.STORAGE_UPLOAD_WARNING]:
    'Storage 업로드가 지연되고 있어요. 분석은 계속 진행됩니다.',
  [MATERIAL_ERROR_CODES.STORAGE_NOT_AVAILABLE]:
    '원본 파일이 저장되지 않아 재분석할 수 없어요. 파일을 다시 업로드해주세요.',
  [MATERIAL_ERROR_CODES.NOT_FOUND]: '자료를 찾을 수 없습니다.',
  [MATERIAL_ERROR_CODES.AI_TIMEOUT]:
    "AI 분석이 지연되고 있어요. 잠시 뒤 '재분석'을 눌러주세요.",
  [MATERIAL_ERROR_CODES.PARSE_FAILED]:
    '파일 내용을 읽지 못했어요. 손상되었거나 보호된 파일일 수 있어요.',
  [MATERIAL_ERROR_CODES.AI_SCHEMA_INVALID]:
    'AI 분석 결과가 올바르지 않아요. 재분석을 시도해주세요.',
  [MATERIAL_ERROR_CODES.INVALID_INTENT]:
    '선택한 업로드 의도가 올바르지 않아요. 다시 선택해주세요.',
  [MATERIAL_ERROR_CODES.INTENT_NOTE_REQUIRED]:
    '"기타" 의도를 선택하면 메모를 입력해야 해요. (120자 이내)',
  [MATERIAL_ERROR_CODES.INTERNAL]: '서버 오류가 발생했어요. 잠시 후 다시 시도해주세요.',
}

/**
 * ApiError(또는 일반 Error)를 사용자용 한국어 메시지로 변환.
 */
export function materialErrorMessage(err, fallback = '알 수 없는 오류가 발생했어요.') {
  if (!err) return fallback
  const code = err.code
  if (code && MATERIAL_ERROR_MESSAGES[code]) return MATERIAL_ERROR_MESSAGES[code]
  if (err.message) return err.message
  return fallback
}

/**
 * 클라이언트 측 파일 검증. 유효하면 null, 아니면 { code, message } 반환.
 */
export function validateMaterialFile(file, { maxBytes, allowedExts }) {
  if (!file) return { code: MATERIAL_ERROR_CODES.FILE_REQUIRED, message: '파일을 선택해주세요.' }
  if (file.size === 0) {
    return { code: MATERIAL_ERROR_CODES.PARSE_FAILED, message: '빈 파일은 업로드할 수 없어요.' }
  }
  if (file.size > maxBytes) {
    return {
      code: MATERIAL_ERROR_CODES.FILE_TOO_LARGE,
      message: `파일이 너무 큽니다. ${Math.round(maxBytes / 1024 / 1024)}MB 이하로 올려주세요.`,
    }
  }
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (allowedExts && !allowedExts.includes(ext)) {
    return {
      code: MATERIAL_ERROR_CODES.UNSUPPORTED_TYPE,
      message: `지원하지 않는 형식입니다. (${allowedExts.join(', ').toUpperCase()})`,
    }
  }
  return null
}
