#!/usr/bin/env python3
"""[별책14] 영어과 교육과정 PDF → 원문 구조화 JSON (SPEC.md 구조).

CLI : python3 book14.py --pdf <PDF경로> [--hwp <HWP경로>] --out <출력JSON>
API : extract(pdf_path, hwp_path=None) -> dict
공통 로직은 common_c.py. 이 별책 고유의 알려진 특이점은 MANUAL_NOTES로 출력 notes에 덧붙인다.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common_c  # noqa: E402

BOOK_NO = 14
MANUAL_NOTES = [
    "과목 표제 '영어 I'는 원문 글리프가 라틴 대문자 I, '영어 Ⅱ'는 로마숫자 Ⅱ — 원문 그대로 수록(코드는 [12영Ⅰ-…]/[12영Ⅱ-…])",
    "공통영어1·2, 기본영어1·2는 표제가 '공통영어1, 공통영어2' 등 병기이나 본문 '[공통영어 1]' 하위 머리글 기준으로 과목을 분리함",
    "(나) 고려사항의 '최소 성취수준 보장을 위한 고려사항' 하위 항목(―)은 해당 불릿 뒤에 줄바꿈으로 이어 붙임"
]


def extract(pdf_path: str, hwp_path: str | None = None) -> dict:
    return common_c.extract_book(BOOK_NO, pdf_path, hwp_path, MANUAL_NOTES)


if __name__ == '__main__':
    sys.exit(common_c.run_cli(BOOK_NO, MANUAL_NOTES))
