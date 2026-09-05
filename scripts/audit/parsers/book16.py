#!/usr/bin/env python3
"""[별책16] 제2외국어과 교육과정 추출기.

- 회화·문화 과목(16종)은 성취기준 소제목이 없어 area "" 단일 영역으로 기록된다(공통 로직).
- 일본어 과목의 가나·한자는 PDF 텍스트 레이어의 CID 폰트 ToUnicode 오류로 히브리 문자 등으로 깨진다.
  원문 PDF 렌더링을 육안 확인해 전사한 치환표(JP_FIX, 코드포인트 기준·긴 문자열 우선)로 복원한다.
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common_d

BYEOLCHAEK = '별책16'
JP_FIX = [
    ('杯♏\u05be\u05dd\u05d8\u05be\u05b7', '現代かなづかい'),
    ('二撶仼儖鏤䷷罫◄⪯', '新版日本語教育事典'),
    ('仼儖鏤乃嫎◄⪯', '日本語文法事典'),
    ('杯♏仼儖鏤乃嫎', '現代日本語文法'),
    ('䅻榫庣㰄', '常用漢字'),
    ('鴜\u05fd♞⺲\u05e1♀\u05c4亠', '送り仮名の付け方'),
    ('\u05c6\u0606\u05de\u05d4\u05e2', 'こんにちは'),
    ('\u05c8\u05fb\u05b9\u05dd\u05fc', 'さようなら'),
    ('\u05cf\u05e5、\u05f1\u05d2\u05c8\u05d0\u05d6\u05d9\u05c2\u05d3\u05c8\u05b7', 'ぜひ、またさそってください'),
    ('\u05bd\u05c5\u0606\u05c0\u05da\u05cc\u05be', 'おげんきですか'),
    ('\u05bd\u05c5\u0606\u05c0\u05da', 'おげんきで'),
    ('\u05bd\u05c0\u0605', 'おきを'),
    ('\u05bd妳\u0605\u05d7\u05c4\u05d9', 'お気をつけて'),
    ('\u05d7\u05c4\u05d9', 'つけて'),
    ('갹\u05bf䇶\u05b7', '顔が広い'),
    ('\u05db\u05dd\u05fd\u05e1菊\u05e2颋\u05b7', 'となりの花は赤い'),
    ('⮉\u05fe', '切る'), ('⮯\u05ff\u05fe', '別れる'), ('䢙\u05fe', '戻る'),
    ('\u05bd⩕妳\u05da\u05cc\u05be', 'お元気ですか'),
    ('\u05bd⩕妳\u05da', 'お元気で'),
    ('\u05b5\u05ff\u05c6\u05ff', 'あれこれ'),
    ('车\u05d6\u05d2\u05fd全\u05d2\u05fd', '行ったり来たり'),
    ('\u05f5\u05b9┉䈱', 'もう一度'),
]
GARBLE = re.compile('[\u0590-\u08ff⮉⮯⩕♏◄⪯♞⺲♀┉]')
EXTRA_NOTES = [
    '[12베문01-04] content "활용하여베트남" 띄어쓰기 없음은 원문 PDF 텍스트 레이어 그대로임(줄 병합 아님).',
    '정본 대조 불일치 11건은 모두 정본의 코드 접두 충돌 오류: [12심독01-01]~[12심독02-04] 8건은 정본이 "심화 영어 독해와 작문"(별책14)의 [12심독] 코드로 덮어써 심화 독일어 듣기·말하기 내용이 유실됨, [12스문01-01]~[12스문01-03] 3건은 정본이 "스포츠 문화"(체육)의 [12스문] 코드로 덮어써 스페인어권 문화 내용이 유실됨. 원문(본 JSON)이 맞음. 정본은 코드만으로 유일 키를 잡을 수 없으므로 (별책/과목, 코드) 복합 키 필요.',
]

def _jp_fix(text, where, notes):
    if not GARBLE.search(text):
        return text
    for old, new in JP_FIX:
        if old in text:
            text = text.replace(old, new)
            notes.append(f'{where}: 일본어 표기 깨짐(폰트 매핑 오류)을 PDF 렌더링 육안 확인으로 전사 복원: {new}')
    if GARBLE.search(text):
        notes.append(f'{where}: 복원표에 없는 깨진 글자가 남아 있음')
    return text

def post_fix(subjects, notes):
    for sbj in subjects:
        for a in sbj['areas']:
            for c in a['codes']:
                c['explanation'] = _jp_fix(c['explanation'], f'{sbj["subject"]} {c["code"]} explanation', notes)
            a['application_notes'] = _jp_fix(a['application_notes'], f'{sbj["subject"]} {a["area"]} application_notes', notes)

def extract(pdf_path, hwp_path=None, diag_out=None):
    return common_d.extract_book(pdf_path, BYEOLCHAEK, hwp_path, post_fix=post_fix, extra_notes=EXTRA_NOTES, diag_out=diag_out)

if __name__ == '__main__':
    sys.exit(common_d.run_cli(extract, BYEOLCHAEK))
