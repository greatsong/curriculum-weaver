#!/usr/bin/env python3
"""별책7 사회과 교육과정 → 성취기준 구조화 JSON.
CLI: python3 book7.py --pdf <PDF> [--hwp <HWP>] --out <JSON>   (exit 0/1)
API: extract(pdf_path, hwp_path=None) -> dict
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common_b

VOLUME = 7

def extract(pdf_path, hwp_path=None):
    return common_b.extract_volume(VOLUME, pdf_path, hwp_path)

if __name__ == '__main__':
    sys.exit(common_b.cli(VOLUME))
