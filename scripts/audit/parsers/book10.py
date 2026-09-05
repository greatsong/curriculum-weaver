#!/usr/bin/env python3
"""[별책10] 실과(기술·가정)/정보과 교육과정 PDF → 원문 구조화 JSON (SPEC.md 구조).

CLI : python3 book10.py --pdf <PDF경로> [--hwp <HWP경로>] --out <출력JSON>
API : extract(pdf_path, hwp_path=None) -> dict
공통 로직은 common_c.py. 이 별책 고유의 알려진 특이점은 MANUAL_NOTES로 출력 notes에 덧붙인다.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common_c  # noqa: E402

BOOK_NO = 10
MANUAL_NOTES = [
    "[부록] 학교자율시간 초등 '정보 교육'의 [06자율-1]~[06자율-7] 7개 성취기준·해설·고려사항은 정규 과목이 아니어서 subjects에서 제외(코드 형식도 스키마와 다름)",
    "생애 설계와 자립 (3) 일상생활 자립의 해설 4개는 원문 자체가 [12자립02-02/03/04]로 오기(내용은 03-02~03-05) — 원문대로 미배정 처리하고 area.unassigned_explanations에 보존"
]


def extract(pdf_path: str, hwp_path: str | None = None) -> dict:
    return common_c.extract_book(BOOK_NO, pdf_path, hwp_path, MANUAL_NOTES)


if __name__ == '__main__':
    sys.exit(common_c.run_cli(BOOK_NO, MANUAL_NOTES))
