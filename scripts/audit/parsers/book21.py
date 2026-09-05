#!/usr/bin/env python3
"""[별책21] 체육 계열 선택 과목 교육과정 추출기. (신체활동 예시 <표>는 공통 로직이 자동 제외)"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common_d

BYEOLCHAEK = '별책21'

def extract(pdf_path, hwp_path=None, diag_out=None):
    return common_d.extract_book(pdf_path, BYEOLCHAEK, hwp_path, diag_out=diag_out)

if __name__ == '__main__':
    sys.exit(common_d.run_cli(extract, BYEOLCHAEK))
