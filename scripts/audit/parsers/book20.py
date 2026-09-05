#!/usr/bin/env python3
"""[별책20] 과학 계열 선택 과목 교육과정 추출기.

수학 과목의 수식은 HWP 수식 폰트 사설영역(PUA) 글리프로 추출된다. HWP 원본이 없으므로
content/explanation 에 한해 원문 PDF 렌더링을 육안 확인해 확정한 치환표(PUA_FIX)로 복원한다.
적용 고려사항의 2차원 수식(분수 등)은 선형화가 불가능해 PUA 그대로 두고 notes에 남긴다.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common_d

BYEOLCHAEK = '별책20'
PUA_FIX = {
    ('[12고대01-01]', 'content'): [('\ue0f2차원', 'n차원')],
    ('[12고대01-06]', 'content'): [('\ue0f2차원', 'n차원')],
    ('[12이수02-04]', 'explanation'): [('\ue0f2\ue03e', 'n!')],
    ('[12고대02-02]', 'explanation'): [('\ue035× \ue035, \ue036× \ue036', '2×2, 3×3')],
    ('[12고대02-03]', 'explanation'): [('\ue035× \ue035, \ue036× \ue036', '2×2, 3×3')],
    ('[12고대03-01]', 'explanation'): [('\ue035× \ue035, \ue036× \ue036', '2×2, 3×3')],
    ('[12고대03-03]', 'explanation'): [('\ue035× \ue035, \ue036× \ue036', '2×2, 3×3')],
    ('[12고대02-05]', 'explanation'): [('\ue011\ue035→\ue011\ue035', 'R²→R²')],
    ('[12고미03-07]', 'explanation'): [('sin\ue035\ue03d°', 'sin20°')],
    ('[12고기01-02]', 'explanation'): [('\ue036\ue06d', '')],
    ('[12고기01-03]', 'explanation'): [('\ue05c\ue035, cos \ue035\ue03d°, \ue05c\ue06d\ue0ac와', '∛2, cos 20°, √π와')],
    ('[12고화04-05]', 'explanation'): [('(\ue00a\ue0e5)', '(Kₐ)')],
}

def post_fix(subjects, notes):
    for sbj in subjects:
        for a in sbj['areas']:
            for c in a['codes']:
                for fld in ('content', 'explanation'):
                    for old, new in PUA_FIX.get((c['code'], fld), []):
                        if old in c[fld]:
                            c[fld] = c[fld].replace(old, new)
                            notes.append(f'{sbj["subject"]} {c["code"]} {fld}: 수식 PUA 글리프를 PDF 렌더링 육안 확인으로 복원: {old!r} → {new!r}'
                                         + (' (다음 불릿 ∛2의 근호 지수 3이 줄 병합으로 딸려온 잔재 제거)' if new == '' else ''))
                        else:
                            notes.append(f'{sbj["subject"]} {c["code"]} {fld}: PUA_FIX 패턴 미발견 {old!r}')

def extract(pdf_path, hwp_path=None, diag_out=None):
    return common_d.extract_book(pdf_path, BYEOLCHAEK, hwp_path, post_fix=post_fix, diag_out=diag_out)

if __name__ == '__main__':
    sys.exit(common_d.run_cli(extract, BYEOLCHAEK))
