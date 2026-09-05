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

# 적용 고려사항 '용어와 기호' 불릿의 수식 PUA 글리프 → 선형 표기 (원문 PDF 3배 렌더링을 육안 확인해 전사; 키는 글리프 시퀀스 원문 그대로)
# page는 PDF 페이지 인덱스(0부터), bbox는 렌더링 클립 [x0, y0, x1, y1] (pt). 규칙: 유니코드 수학기호·첨자 우선, 없으면 ASCII(x^n, a_n, ∫_a^b), 분수는 a/b, 벡터는 →AB.
NOTES_FIX = [
    # p11 bbox[75, 549.4, 495, 653.9] — sin^-1 x … 분수 d²y/dx² 등 2행 수식 선형화
    ('전문 수학', '(1) 삼각함수와 미적분', 'sin\ue046\ue034\ue0fc, arcsin \ue0fc, \ue0e8\ue035\ue0fd. \ue06d\ue0e8\ue035 cos\ue046\ue034\ue0fc, arccos \ue0fc, tan\ue046\ue034\ue0fc, arctan \ue0fc, \ue0fd″ , \ue0ea″\ue044\ue0fc\ue045, \ue06d \ue0ea\ue044\ue0fc\ue045, \ue0fd\ue044\ue0f2\ue045, \ue0ea\ue044\ue0f2\ue045\ue044\ue0fc\ue045, \ue0e8\ue0fc\ue035 \ue0e8\ue0fc\ue035\ue0e8\ue0f2\ue0fd, \ue06d\ue0e8\ue0f2\ue0ea\ue044\ue0fc\ue045’을 다룬다.\ue06d\ue0e8\ue0fc\ue0f2 \ue0e8\ue0fc\ue0f2', 'sin⁻¹x, arcsin x, cos⁻¹x, arccos x, tan⁻¹x, arctan x, y″, f″(x), d²y/dx², d²/dx² f(x), y⁽ⁿ⁾, f⁽ⁿ⁾(x), dⁿy/dxⁿ, dⁿ/dxⁿ f(x)’을 다룬다.'),
    # p12 bbox[75, 384.4, 495, 485.7] — 좌표 P(x, y, z)
    ('전문 수학', '(2) 기하', 'P\ue044\ue0fc\ue052\ue0fd\ue052\ue0fe\ue045', 'P(x, y, z)'),
    # p12 bbox[75, 384.4, 495, 485.7] — 벡터 화살표는 →AB 형식
    ('전문 수학', '(2) 기하', '\ue06d\ue06e AB , \ue06d\ue0e5, \ue101\ue06d\ue06e \ue0e5\ue101, \ue06d\ue06e \ue0e5‧\ue06d\ue06e \ue0e6, \ue06d\ue06e \ue0e5× \ue06d\ue06e \ue06e\ue0e6’를 다룬다.', '→AB, →a, |→a|, →a·→b, →a×→b’를 다룬다.'),
    # p13 bbox[75, 414.2, 495, 556.1] — 순열 ₙΠᵣ(원문 글리프 Π), X̄·p̂은 결합 기호
    ('전문 수학', '(3) 확률과 통계', '\ue0f2∏\ue0f6, \ue0f2H\ue0f6, P\ue044\ue000\ue045, P\ue044\ue001\ue04d\ue000\ue045, P\ue044\ue017\ue047\ue0fc\ue045, E\ue044\ue017\ue045, V\ue044\ue017\ue045, \ue0ae\ue044\ue017\ue045, B\ue044\ue0f2\ue052\ue0f4\ue045, N \ue044\ue0f1\ue052\ue0ae\ue035\ue045, N\ue044\ue03d\ue052\ue034\ue045, \ue06d\ue017, \ue012\ue035, \ue012, \ue063\ue0f4’을 다룬다.', 'ₙΠᵣ, ₙHᵣ, P(A), P(B|A), P(X=x), E(X), V(X), σ(X), B(n, p), N(m, σ²), N(0, 1), X̄, S², S, p̂’을 다룬다.'),
    # p25 bbox[75, 360.9, 495, 405.0] — 원문은 S(n,k), P(n,k) 붙여씀
    ('이산 수학', '(1) 선택과 배열', '\ue0f2∏\ue0f6, \ue0f2H\ue0f6, \ue012\ue044\ue0f2\ue052\ue0ef\ue045, \ue00f\ue044\ue0f2\ue052\ue0ef\ue045’를 다룬다.', 'ₙΠᵣ, ₙHᵣ, S(n,k), P(n,k)’를 다룬다.'),
    # p38 bbox[75, 382.9, 495, 427.4] — n차원
    ('고급 대수', '(1) 벡터공간', '\ue0f2차원 벡터', 'n차원 벡터'),
    # p38 bbox[75, 382.9, 495, 427.4] — R^n
    ('고급 대수', '(1) 벡터공간', 'R \ue0f2', 'Rⁿ'),
    # p39 bbox[75, 119.8, 495, 183.0] — 줄 병합으로 "가우스" 뒤에 붙었던 A⁻¹를 원래 자리(역변환, O 다음)로
    ('고급 대수', '(2) 행렬과 선형변환', '가우스 \ue000\ue046\ue034, 소거법, 행렬식, 선형변환, 대칭변환, 닮음변환, 회전변환, 역변환, \ue00e, \ue0ea\ue04f\ue044\ue0fc\ue052\ue0fd\ue045→\ue044\ue0fc′\ue052\ue0fd′\ue045, \ue0ea′ \ue04f\ue044\ue0fc\ue052\ue0fd\ue052\ue0fe\ue045→\ue044\ue0fc′\ue052\ue0fd′\ue052\ue0fe′\ue045’을 다룬다.', '가우스 소거법, 행렬식, 선형변환, 대칭변환, 닮음변환, 회전변환, 역변환, O, A⁻¹, f:(x, y)→(x′, y′), f′:(x, y, z)→(x′, y′, z′)’을 다룬다.'),
    # p39 bbox[75, 515.8, 495, 560.3] — 전치행렬 A^T
    ('고급 대수', '(3) 행렬의 대각화', '\ue000\ue013', 'Aᵀ'),
    # p51 bbox[75, 344.0, 495, 431.8] — 적분 상·하한은 유니코드 첨자 없음 → ASCII ∫_a^∞; "이상적분" 앞 ∞는 상한이 줄 병합으로 딸려온 것
    ('고급 미적분', '(1) 미적분의 활용', '∞이상적분, sinh \ue0fc, cosh \ue0fc, tanh \ue0fc, sinh\ue046\ue034\ue0fc, cosh\ue046\ue034\ue0fc, tanh\ue046\ue034\ue0fc, \ue05b \ue0ea\ue044\ue0fc\ue045\ue0e8\ue0fc, \ue0e5\ue0e5 ∞\ue05b \ue0ea\ue044\ue0fc\ue045\ue0e8\ue0fc, \ue05b \ue0ea\ue044\ue0fc\ue045\ue0e8\ue0fc’를 다룬다.\ue046∞ \ue046∞', '이상적분, sinh x, cosh x, tanh x, sinh⁻¹x, cosh⁻¹x, tanh⁻¹x, ∫_a^∞ f(x)dx, ∫_(-∞)^a f(x)dx, ∫_(-∞)^∞ f(x)dx’를 다룬다.'),
    # p52 bbox[75, 450.0, 495, 530.9] — p−급수
    ('고급 미적분', '(3) 급수', '\ue0f4\ue046급수', 'p-급수'),
]

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
    for subj, area, old, new in NOTES_FIX:
        for sbj in subjects:
            if sbj['subject'] != subj:
                continue
            for a in sbj['areas']:
                if a['area'] != area:
                    continue
                if old in a['application_notes']:
                    a['application_notes'] = a['application_notes'].replace(old, new)
                    notes.append(f'{subj} {area} application_notes: 용어·기호 수식 PUA 글리프를 PDF 렌더링 육안 확인으로 선형 표기 복원: → {new!r}')
                else:
                    notes.append(f'{subj} {area} application_notes: NOTES_FIX 패턴 미발견 {old[:30]!r}')

def extract(pdf_path, hwp_path=None, diag_out=None):
    return common_d.extract_book(pdf_path, BYEOLCHAEK, hwp_path, post_fix=post_fix, diag_out=diag_out)

if __name__ == '__main__':
    sys.exit(common_d.run_cli(extract, BYEOLCHAEK))
