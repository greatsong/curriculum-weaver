#!/usr/bin/env python3
"""[별책17] 한문과 교육과정 PDF → 원문 구조화 JSON (SPEC.md 구조).

CLI : python3 book17.py --pdf <PDF경로> [--hwp <HWP경로>] --out <출력JSON>
API : extract(pdf_path, hwp_path=None) -> dict
공통 로직은 common_c.py. 이 별책 고유의 알려진 특이점은 MANUAL_NOTES로 출력 notes에 덧붙인다.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common_c  # noqa: E402

BOOK_NO = 17
MANUAL_NOTES = []


def extract(pdf_path: str, hwp_path: str | None = None) -> dict:
    return common_c.extract_book(BOOK_NO, pdf_path, hwp_path, MANUAL_NOTES)


if __name__ == '__main__':
    sys.exit(common_c.run_cli(BOOK_NO, MANUAL_NOTES))
