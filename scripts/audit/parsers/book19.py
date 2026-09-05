#!/usr/bin/env python3
"""[별책19] 고등학교 교양 교과 교육과정 추출기."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common_d

BYEOLCHAEK = '별책19'

def extract(pdf_path, hwp_path=None, diag_out=None):
    return common_d.extract_book(pdf_path, BYEOLCHAEK, hwp_path, diag_out=diag_out)

if __name__ == '__main__':
    sys.exit(common_d.run_cli(extract, BYEOLCHAEK))
