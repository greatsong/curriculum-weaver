#!/usr/bin/env python3
"""초등학교 교육과정(별책2). 과목명은 홀수 쪽 머리글(바른 생활·국어·사회 …)에서 취한다.

사용: python3 book2.py --pdf <PDF> [--hwp <HWP>] --out <JSON>
API: extract(pdf_path, hwp_path=None) -> dict
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common_a

CFG = dict(name='별책2', subject_mode='header', static_notes=[
    '사회 [4사01-01]·[4사01-02]는 원문 코드가 en-dash(–)로 인쇄되어 있어 식별자만 하이픈으로 정규화했다(원문 표기는 notes의 정규화 항목 참조).',
    '수학 성취기준 절의 사설영역 글리프(U+F000)로 시작하는 짧은 줄은 영역 안 소제목(예: 네 자리 이하의 수)이며 content에 넣지 않았다.',
    '과학 각 영역의 <탐구 활동> 블록(불릿 목록)은 성취기준 본문이 아니므로 수록하지 않았다.',
    '별책2에는 대응 HWP가 없어 수식 글리프는 PDF 렌더링으로 확인해 표기했다(e048=+, e046=−, e047==, 분수 세 조각=1/2, F000=『 』).',
    '[6실04-06] 원문은 "동작시키는 … 인식한다."이며, 정본(standards.js)의 "동작 시키는 … 인식하다."는 정본 쪽 오탈자로 판단한다(원문 JSON은 원문 그대로).',
])


def extract(pdf_path, hwp_path=None):
    return common_a.extract_book(pdf_path, CFG, hwp_path)


if __name__ == '__main__':
    sys.exit(common_a.main(sys.argv[1:], CFG, extract))
