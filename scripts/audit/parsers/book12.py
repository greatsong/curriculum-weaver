#!/usr/bin/env python3
"""[별책12] 음악과 교육과정 PDF → 원문 구조화 JSON (SPEC.md 구조).

CLI : python3 book12.py --pdf <PDF경로> [--hwp <HWP경로>] --out <출력JSON>
API : extract(pdf_path, hwp_path=None) -> dict
공통 로직은 common_c.py. 이 별책 고유의 알려진 특이점은 MANUAL_NOTES로 출력 notes에 덧붙인다.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common_c  # noqa: E402

BOOK_NO = 12
MANUAL_NOTES = [
    "중학교 (3) 창작·고등학교 음악 (나) 고려사항 뒤의 '음악 요소' 표는 application_notes에 넣지 않음"
]


def extract(pdf_path: str, hwp_path: str | None = None) -> dict:
    return common_c.extract_book(BOOK_NO, pdf_path, hwp_path, MANUAL_NOTES)


if __name__ == '__main__':
    sys.exit(common_c.run_cli(BOOK_NO, MANUAL_NOTES))
