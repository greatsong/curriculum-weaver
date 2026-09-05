#!/usr/bin/env python3
"""도덕과 교육과정(별책6). 과목명은 '교육과정 설계의 개요' 또는 '1. 성격 및 목표' 바로 앞 줄에서 취한다.

사용: python3 book6.py --pdf <PDF> [--hwp <HWP>] --out <JSON>
API: extract(pdf_path, hwp_path=None) -> dict
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common_a

CFG = dict(name='별책6', subject_mode='title', static_notes=[
    '초등학교 도덕은 원문이 [초등학교] 한 묶음 아래 3∼4학년군·5∼6학년군 코드를 같은 영역에 함께 배치하므로, 과목 항목은 코드 접두(4→초3-4, 6→초5-6)로 나누고 영역별 적용 시 고려 사항은 두 항목에 동일하게 수록했다.',
])


def extract(pdf_path, hwp_path=None):
    return common_a.extract_book(pdf_path, CFG, hwp_path)


if __name__ == '__main__':
    sys.exit(common_a.main(sys.argv[1:], CFG, extract))
