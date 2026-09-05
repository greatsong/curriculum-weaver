#!/usr/bin/env python3
"""국어과 교육과정(별책5). 과목명은 '교육과정 설계의 개요' 또는 '1. 성격 및 목표' 바로 앞 줄에서 취한다.

사용: python3 book5.py --pdf <PDF> [--hwp <HWP>] --out <JSON>
API: extract(pdf_path, hwp_path=None) -> dict
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common_a

CFG = dict(name='별책5', subject_mode='title', static_notes=[
    '"공통국어1, 공통국어2" 장은 원문에 [공통국어1]·[공통국어2] 하위 표제로 내용 체계·성취기준이 각각 나뉘어 있어 과목 항목을 "공통국어1"·"공통국어2"로 분리했다(둘 다 고공통·공통).',
    '선택 과목(화법과 언어 등 9종)은 성취기준 절에 영역 소제목이 없어 area를 빈 문자열로 두었다.',
])


def extract(pdf_path, hwp_path=None):
    return common_a.extract_book(pdf_path, CFG, hwp_path)


if __name__ == '__main__':
    sys.exit(common_a.main(sys.argv[1:], CFG, extract))
