#!/usr/bin/env python3
"""[별책22] 예술 계열 선택 교과 교육과정 추출기."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common_d

BYEOLCHAEK = '별책22'
EXTRA_NOTES = [
    '[12연몸02-03] 정본 대조 불일치 1건은 정본 오류: 원문 PDF 텍스트 레이어에서 다음 코드 [12연몸02-04]의 여는 대괄호가 빠져 있어("12연몸02-04]") 정본이 두 성취기준을 한 content로 병합함. 본 JSON은 분리해 기록(02-04는 code_as_printed 보존).',
]

def extract(pdf_path, hwp_path=None, diag_out=None):
    return common_d.extract_book(pdf_path, BYEOLCHAEK, hwp_path, extra_notes=EXTRA_NOTES, diag_out=diag_out)

if __name__ == '__main__':
    sys.exit(common_d.run_cli(extract, BYEOLCHAEK))
