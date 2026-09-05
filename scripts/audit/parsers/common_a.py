#!/usr/bin/env python3
"""교육부 고시 2022 개정 교육과정 별책 PDF → 원문 구조화 JSON. 담당 A(별책2·5·6) 공통 로직.

레이아웃 전제(세 별책 공통, 교육부 별책 조판):
  - 페이지 머리글 y<62pt, 쪽번호 y>685pt (A4 변형 555×754pt 기준)
  - 절 표제 '나. 성취기준' → 성취기준 절 시작, '3. 교수…'·'가. 내용 체계' 등 큰 글꼴 절 표제 → 절 종료
  - 영역 소제목 '(n) 영역명': 글꼴 ≥11.2pt 이거나 왼쪽 여백(x0<88pt)에서 시작
  - 학년군 표제 '[초등학교 1∼2학년]' 등, 하위 과목 표제 '[공통국어2]' 등(큰 글꼴 대괄호 단독 줄)
  - 코드 줄 '[코드] 본문…', 불릿 줄(•, Ÿ, Wingdings PUA 등)
  - 줄 조립은 fitz rawdict 글자 좌표로 수행. 줄 끝 공백 글리프가 보존되므로 줄바꿈 이어붙이기 시
    띄어쓰기를 원문대로 복원할 수 있다(공백이 있으면 띄우고, 없으면 붙인다).
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile, unicodedata

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    fitz = None

HEADER_Y = 62
FOOTER_Y = 685
AREA_FS = 11.2
LINE_TOL = 7.0          # 같은 줄로 묶는 기준선 허용 오차(pt)
ATTACH_TOL = 12.0       # 공백·사설영역 글자를 가장 가까운 줄에 붙이는 허용 오차(pt)
GAP_SPACE = 0.4         # 글자 간격이 글꼴 크기의 이 배수를 넘으면 공백 삽입

BULLET_CHARS = '•∙●○◦▪■□Ÿ' + ''.join(chr(c) for c in (0xF09F, 0xF06C, 0xF0B7, 0xF0A7, 0xF076))
CODE_BODY = r'\d{1,2}[가-힣A-Za-z0-9·⋅()ⅠⅡⅢⅣⅤ]+?'
CODE_TOKEN = re.compile(r'\[\s*' + CODE_BODY + r'\s*[-–]\s*\d{2}(?:\s*[-–]\s*\d{2})?(?:\s*[∼~]\s*\d{2})?\s*\]')
GENERIC_HEADERS = {'초등학교 교육과정', '초⋅중등학교 교육과정 총론', '교육과정의 성격', '공통 교육과정',
                   '국어과 교육과정', '도덕과 교육과정'}

# 렌더링으로 확인한 HWP 수식 글꼴 사설영역 글리프 (별책2 수학)
PUA_MAP = {chr(0xE048): '+', chr(0xE046): '−', chr(0xE047): '='}
FRACTION_HALF = {chr(0xE034), chr(0xE06D), chr(0xE035)}   # 분자 1 / 가로줄 / 분모 2 → '1/2'
BOOK_BRACKET = chr(0xF000)                                  # 『 』 (별책2 사회, 여닫이 교대)

COMMON_NOTES = [
    'explanation은 "(가) 성취기준 해설" 불릿에서 맨 앞의 코드 라벨([코드], 쉼표·와/과 연결 포함)을 제거한 본문이다. 코드 뒤에 바로 조사가 붙는 경우("[코드]의 …")도 코드만 제거한다.',
    '줄바꿈 이어붙이기는 PDF 글리프 수준의 줄 끝 공백 유무를 근거로 한다(공백 있으면 띄우고 없으면 붙임). 연속 공백은 하나로 축약했다.',
    'application_notes는 "(나) 성취기준 적용 시 고려 사항"의 불릿 본문을 줄바꿈으로 이어 붙인 것이며 불릿 글리프는 제거했다.',
]


# ---------------------------------------------------------------- 기본 유틸
def norm_code(code):
    """코드 식별자 정규화: 대시류 → '-', 내부 공백 제거."""
    c = unicodedata.normalize('NFKC', code)
    c = c.replace('–', '-').replace('—', '-').replace('－', '-')
    return re.sub(r'\s+', '', c)


def expand_code_token(tok):
    """'[4과09-01∼02]' 같은 범위 표기를 개별 코드로 펼친다. 일반 코드는 1개 리스트."""
    c = norm_code(tok)
    m = re.match(r'^\[(.+?-\d{2}(?:-\d{2})?)\]$', c)
    if m:
        return [c]
    m = re.match(r'^\[(.+?-)(\d{2})[∼~](\d{2})\]$', c)
    if m:
        a, b = int(m.group(2)), int(m.group(3))
        return [f'[{m.group(1)}{i:02d}]' for i in range(a, b + 1)]
    return [c]


def grade_group_of(code):
    m = re.match(r'\[(\d{1,2})', code)
    if not m:
        return '기타'
    return {'2': '초1-2', '4': '초3-4', '6': '초5-6', '9': '중1-3', '10': '고공통', '12': '고선택'}.get(m.group(1), '기타')


def school_level_of(gg):
    if gg.startswith('초'): return '초등학교'
    if gg.startswith('중'): return '중학교'
    if gg.startswith('고'): return '고등학교'
    return ''


def category_of(header):
    h = header or ''
    if '일반 선택' in h: return '일반선택'
    if '진로 선택' in h: return '진로선택'
    if '융합 선택' in h: return '융합선택'
    if '공통 과목' in h: return '공통'
    if '공통 교육과정' in h or '초등학교 교육과정' in h: return '공통'
    return ''


# ---------------------------------------------------------------- 줄 조립
def page_lines(page):
    """글자 좌표 기반 줄 조립. (머리글, 본문, 쪽번호) 세 목록을 y 순으로 돌려준다.

    본문 글자(사설영역·공백 제외)를 기준선으로 군집하고, 공백·사설영역 글자(수식 조각)는 가장 가까운
    줄에 붙인 뒤 x 순으로 정렬한다. 분수처럼 기준선이 어긋난 조각도 제자리에 들어간다.
    """
    rd = page.get_text('rawdict')
    chars = []
    for b in rd['blocks']:
        if b.get('type', 0) != 0:
            continue
        for l in b.get('lines', []):
            for sp in l['spans']:
                for ch in sp['chars']:
                    x0, y0, x1, y1 = ch['bbox']
                    c = ch['c']
                    chars.append(dict(x0=x0, x1=x1, y0=y0, y1=y1, ym=(y0 + y1) / 2, c=c, fs=sp['size'],
                                      pua=0xE000 <= ord(c) <= 0xF8FF, sp=c.isspace()))
    main = sorted([c for c in chars if not c['pua'] and not c['sp']], key=lambda c: (c['ym'], c['x0']))
    clusters = []
    for c in main:
        if clusters and c['ym'] - clusters[-1]['ref'] <= LINE_TOL:
            clusters[-1]['chars'].append(c)
        else:
            clusters.append(dict(chars=[c], ref=c['ym']))
    for cl in clusters:
        cl['ym'] = sum(c['ym'] for c in cl['chars']) / len(cl['chars'])
    for c in sorted([c for c in chars if c['pua'] or c['sp']], key=lambda c: (c['ym'], c['x0'])):
        best, bd = None, 1e9
        for cl in clusters:
            d = abs(c['ym'] - cl['ym'])
            if d < bd:
                bd, best = d, cl
        if best is not None and bd <= ATTACH_TOL:
            best['chars'].append(c)
        else:
            clusters.append(dict(chars=[c], ref=c['ym'], ym=c['ym']))
    lines = []
    for cl in clusters:
        cs = sorted(cl['chars'], key=lambda c: (round(c['x0'], 1), c['ym']))
        s, prev = '', None
        for c in cs:
            if prev is not None and not prev['sp'] and not c['sp'] and c['x0'] - prev['x1'] > GAP_SPACE * c['fs']:
                s += ' '
            s += c['c']
            prev = c
        if not s.strip():
            continue
        body = [c for c in cs if not c['pua'] and not c['sp']] or cs
        lines.append(dict(y=min(c['y0'] for c in cs), ym=cl['ym'], x0=min(c['x0'] for c in cs),
                          x1=max(c['x1'] for c in cs), s=s, fs=max(c['fs'] for c in body)))
    lines.sort(key=lambda l: (l['ym'], l['x0']))
    header = [l for l in lines if l['y'] < HEADER_Y]
    footer = [l for l in lines if l['y'] > FOOTER_Y]
    body = [l for l in lines if HEADER_Y <= l['y'] <= FOOTER_Y]
    return header, body, footer


def join_text(parts):
    """줄 조각을 이어 붙인다. 앞 조각이 공백으로 끝나면 띄우고, 아니면 붙여 쓴다."""
    out = ''
    for p in parts:
        out += p.lstrip(' ')
    return re.sub(r'[ 　]+', ' ', out).strip()


def leading_codes(text):
    """불릿 본문 맨 앞의 코드 나열([A], [B] / [A]와 [B] / [A-01∼02] …)을 뽑고 나머지 본문을 돌려준다."""
    codes, pos = [], 0
    # 연결어(와/과/및/그리고)는 바로 뒤에 또 다른 코드가 올 때만 코드 나열의 일부로 본다("[A]과 [B]"). "[A] 과학자와…"는 본문.
    pat = re.compile(r'\s*(' + CODE_TOKEN.pattern + r')\s*(?:[,，]|(?:와|과|및|그리고)(?=\s*\[))?\s*')
    while True:
        m = pat.match(text, pos)
        if not m:
            break
        codes.extend(expand_code_token(m.group(1)))
        pos = m.end()
    rest = text[pos:].lstrip() if codes else text
    return codes, rest


# ---------------------------------------------------------------- PUA 복원
def hwp_text(hwp_path):
    """hwp5txt로 HWP 본문을 임시 파일에 뽑아 문자열로 돌려준다. 도구가 없으면 None."""
    if not hwp_path or not shutil.which('hwp5txt'):
        return None
    with tempfile.TemporaryDirectory() as td:
        out = os.path.join(td, 'hwp.txt')
        with open(out, 'w', encoding='utf-8') as fh:
            subprocess.run(['hwp5txt', hwp_path], stdout=fh, stderr=subprocess.DEVNULL, check=False)
        with open(out, encoding='utf-8', errors='replace') as fh:
            return fh.read()


def restore_pua(text, hwp, notes, where):
    """사설영역 글자 복원. ① HWP 본문에서 같은 문장을 찾아 그 위치의 글자를 쓴다(있을 때만)
    ② 렌더링으로 확인한 글리프 표(PUA_MAP·분수·겹낫표)를 적용한다. 남는 것은 원문대로 두고 notes에 기록."""
    if not any(0xE000 <= ord(c) <= 0xF8FF for c in text):
        return text
    if hwp:
        def sub_from_hwp(m):
            before = re.sub(r'\s+', '', text[max(0, m.start() - 12):m.start()])
            after = re.sub(r'\s+', '', text[m.end():m.end() + 12])
            if len(before) < 6 or len(after) < 6:
                return m.group()
            hm = re.search(re.escape(before) + r'(.{1,3}?)' + re.escape(after), re.sub(r'\s+', '', hwp))
            if hm and not any(0xE000 <= ord(c) <= 0xF8FF for c in hm.group(1)):
                notes.append(f'{where}: 사설영역 글자 {hex(ord(m.group()[0]))}를 HWP 본문의 {hm.group(1)!r}로 복원')
                return hm.group(1)
            return m.group()
        text = re.sub(r'[-]+', sub_from_hwp, text)
    # 분수 ½ (세 조각, 순서 무관)
    def frac(m):
        return '1/2' if set(m.group()) == FRACTION_HALF else m.group()
    new = re.sub(r'[]{3}', frac, text)
    if new != text:
        notes.append(f'{where}: 분수 글리프(분자·가로줄·분모 세 조각)를 렌더링 확인 후 "1/2"로 표기')
        text = new
    for k, v in PUA_MAP.items():
        if k in text:
            notes.append(f'{where}: 수식 글리프 {hex(ord(k))}를 렌더링 확인 후 {v!r}로 표기')
            text = text.replace(k, v)
    if BOOK_BRACKET in text:
        n = text.count(BOOK_BRACKET)
        if n % 2 == 0:
            parts = text.split(BOOK_BRACKET)
            text = ''.join(p + ('『' if i % 2 == 0 else '』') for i, p in enumerate(parts[:-1])) + parts[-1]
            notes.append(f'{where}: 겹낫표 글리프 {hex(ord(BOOK_BRACKET))} {n}개를 렌더링 확인 후 『 』로 표기')
    left = sorted({hex(ord(c)) for c in text if 0xE000 <= ord(c) <= 0xF8FF})
    if left:
        notes.append(f'{where}: 복원하지 못한 사설영역 글자 잔존 {left} (원문 그대로 둠)')
    return text


# ---------------------------------------------------------------- 본 추출기
def extract_book(pdf_path, cfg, hwp_path=None):
    """cfg: name(별책N), subject_mode('header'|'title'), static_notes(list). 결과 dict(스펙 스키마)."""
    if fitz is None:
        raise RuntimeError('PyMuPDF(fitz)가 필요합니다: pip install pymupdf')
    doc = fitz.open(pdf_path)
    hwp = hwp_text(hwp_path)
    notes, anomalies = [], []
    items, area_notes, area_order = [], {}, []
    subject_cat, subject_order = {}, []
    seen_notes = set()

    st_ = dict(state=None, in_section=False, subject=None, chapter=None, grade='', area=None,
               item=None, bullet=None, bullets=[], cat_header='', header_subject=None, prev=None)

    def flush_bullets():
        bullets = st_['bullets']
        if st_['state'] == 'expl':
            for parts in bullets:
                text = join_text(parts)
                if not text or text in ('없음', '해당 없음', '없음.'):
                    continue
                codes, rest = leading_codes(text)
                if not codes:
                    anomalies.append(f'[{st_["subject"]}/{st_["area"]}] 코드 없는 해설 불릿: {text[:60]}')
                    continue
                if len(codes) > 1:
                    notes.append(f'해설 불릿이 여러 코드를 병기하여 각 코드에 동일 해설 적용: {", ".join(codes)} ({st_["subject"]} {st_["area"]})')
                for c in codes:
                    targets = [it for it in items if it['subject'] == st_['subject'] and it['code'] == c]
                    if not targets:
                        anomalies.append(f'[{st_["subject"]}/{st_["area"]}] 해설이 가리키는 코드 미발견: {c}')
                        continue
                    it = targets[-1]
                    it['expl'] = (it['expl'] + '\n' + rest) if it['expl'] else rest
        elif st_['state'] == 'notes':
            key = (st_['subject'], st_['grade'], st_['area'])
            texts = [t for t in (join_text(p) for p in bullets) if t]
            area_notes.setdefault(key, []).extend(texts)
        st_['bullets'] = []
        st_['bullet'] = None

    def set_subject(name, cat):
        st_['subject'] = name
        if name not in subject_order:
            subject_order.append(name)
        subject_cat[name] = cat

    def end_section():
        flush_bullets()
        st_['in_section'] = False; st_['state'] = None; st_['item'] = None

    for pno in range(len(doc)):
        header, body, footer = page_lines(doc[pno])
        htext = ' '.join(h['s'].strip() for h in header)
        if header:
            if re.search(r'선택 중심 교육과정|^공통 교육과정|^초등학교 교육과정', htext):
                st_['cat_header'] = htext
            elif cfg['subject_mode'] == 'header' and htext not in GENERIC_HEADERS and len(htext) <= 10 and not htext.isdigit():
                st_['header_subject'] = htext
        for l in body:
            s = l['s']; st = s.strip()
            if not st:
                continue
            # --- 과목 제목 감지 ---
            if cfg['subject_mode'] == 'title':
                if re.match(r'^교육과정 설계의 개요$', st) or re.match(r'^1\.\s*성격\s*및\s*목표', st):
                    cand = st_['prev']
                    if cand and len(cand['s'].strip()) <= 30 and not cand['s'].strip().endswith(('.', '다')) and cand['s'].strip() not in GENERIC_HEADERS:
                        name = cand['s'].strip()
                        if name != st_['subject']:
                            if st_['in_section']:
                                end_section()
                            set_subject(name, category_of(st_['cat_header']))
                            st_['chapter'] = name
            else:
                if st_['header_subject'] and st_['header_subject'] != st_['subject'] and not st_['in_section']:
                    set_subject(st_['header_subject'], '공통')
            st_['prev'] = l

            # --- 성취기준 절 시작 ---
            if re.match(r'^나\.\s*성취기준\s*$', st):
                flush_bullets()
                st_.update(in_section=True, state='codes', area=None, item=None, grade='')
                if cfg['subject_mode'] == 'header' and st_['header_subject']:
                    set_subject(st_['header_subject'], '공통')
                continue
            # --- 하위 과목 표제 ([공통국어2] 등) ---
            msub = re.match(r'^\[([^\]]+)\]$', st)
            if msub and l['fs'] >= AREA_FS and not re.match(r'^\[(초등학교|중학교|고등학교)', st) \
                    and cfg['subject_mode'] == 'title' and st_['subject'] and not re.search(r'교육과정|과목', msub.group(1)):
                end_section()
                name = msub.group(1).strip()
                if name != st_['subject']:
                    if name not in subject_order:
                        notes.append(f'하위 과목 표제 {st}를 별도 과목 항목으로 분리 (장 제목: {st_["chapter"]})')
                    set_subject(name, subject_cat.get(st_['subject'], category_of(st_['cat_header'])))
                continue
            if not st_['in_section']:
                continue
            # --- 절 종료 ---
            if re.match(r'^3\.\s*교수', st) or (re.match(r'^(\d+\.|[가-힣]\.)\s', st) and l['fs'] >= AREA_FS):
                end_section()
                continue
            # --- 표 모드: 표 행(작은 글꼴)은 불릿 모양이라도 전부 건너뛰고, 본문 글꼴이 나오면 해제 ---
            if st_.get('skip_table'):
                if l['fs'] < 9.5:
                    continue
                st_['skip_table'] = False
            # --- 학년군 표제 ---
            if re.match(r'^\[(초등학교|중학교|고등학교)[^\]]*\]$', st):
                flush_bullets(); st_.update(grade=st, item=None, state='codes')
                continue
            # --- (가)/(나) ---
            if re.match(r'^\(가\)\s*성취기준\s*해설', st):
                flush_bullets(); st_.update(state='expl', item=None)
                continue
            if re.match(r'^\(나\)\s*성취기준\s*적용', st):
                flush_bullets(); st_.update(state='notes', item=None)
                continue
            # --- 영역 소제목 ---
            if re.match(r'^\(\d+\)\s*\S', st) and (l['fs'] >= AREA_FS or l['x0'] < 88):
                flush_bullets(); st_.update(state='codes', item=None, area=st)
                k = (st_['subject'], st_['grade'], st_['area'])
                if k not in area_order:
                    area_order.append(k)
                continue
            # --- 본문 안의 표(<표 n> …): 표 행(작은 글꼴)은 선형 텍스트로 옮길 수 없어 제외 ---
            if re.match(r'^<\s*표\s*\d*\s*>', st):
                st_['skip_table'] = True
                if ('table', st_['subject']) not in seen_notes:
                    seen_notes.add(('table', st_['subject']))
                    notes.append(f'{st_["subject"]}: 성취기준 절 안의 표({st[:30]} …)는 표 행을 선형 텍스트로 옮길 수 없어 application_notes에 넣지 않음(표 제목 포함)')
                continue
            # --- 과학 <탐구 활동> 블록 ---
            if re.match(r'^<\s*탐구\s*활동\s*>$', st):
                flush_bullets(); st_.update(state='inquiry', item=None)
                if ('inquiry', st_['subject']) not in seen_notes:
                    seen_notes.add(('inquiry', st_['subject']))
                    notes.append(f'{st_["subject"]}: 영역별 <탐구 활동> 블록은 성취기준 본문이 아니므로 수록하지 않음')
                continue
            # --- 사설영역 글리프로 시작하는 짧은 소제목 줄(수학) ---
            if 0xE000 <= ord(st[0]) <= 0xF8FF and st[0] not in BULLET_CHARS and len(st) < 40 and '[' not in st:
                if ('subhead', st_['subject']) not in seen_notes:
                    seen_notes.add(('subhead', st_['subject']))
                    notes.append(f'{st_["subject"]}: 영역 안의 소제목 줄(예: {st[1:].strip()!r})은 구조 표제로 보고 content에 포함하지 않음')
                st_['item'] = None
                continue
            sl = s.lstrip()
            mc = re.match(r'^(' + CODE_TOKEN.pattern + r')\s*(.*)$', sl)
            if st_['state'] == 'inquiry':
                if st[0] in BULLET_CHARS or not mc:
                    continue
                st_['state'] = 'codes'
            # --- 코드 줄 ---
            if mc and st_['state'] == 'codes':
                raw = mc.group(1); code = norm_code(raw)
                if raw != code:
                    notes.append(f'코드 표기 정규화: 원문 {raw!r} → {code} ({st_["subject"]} {st_["area"]})')
                if st_['area'] is None:
                    notes.append(f'{st_["subject"]}: 성취기준 절에 영역 소제목이 없어 area를 빈 문자열로 둠 (첫 코드 {code}, p{pno+1})')
                    st_['area'] = ''
                    k = (st_['subject'], st_['grade'], st_['area'])
                    if k not in area_order:
                        area_order.append(k)
                st_['item'] = dict(subject=st_['subject'], grade_label=st_['grade'], area=st_['area'], code=code,
                                   raw_code=raw, parts=[mc.group(2)], expl='', page=pno + 1)
                items.append(st_['item'])
                continue
            # --- 불릿 ---
            if st[0] in BULLET_CHARS:
                if st_['state'] not in ('expl', 'notes'):
                    anomalies.append(f'[{st_["subject"]}/{st_["area"]}] (가)/(나) 밖의 불릿: {st[:50]} (p{pno+1})')
                    st_['state'] = 'notes'
                st_['bullet'] = [sl[1:].lstrip()]
                st_['bullets'].append(st_['bullet'])
                continue
            if st_['state'] in ('expl', 'notes') and mc and st_['bullet'] is not None:
                anomalies.append(f'[{st_["subject"]}/{st_["area"]}] 불릿 없이 코드로 시작하는 줄을 새 불릿으로 처리: {st[:50]} (p{pno+1})')
                st_['bullet'] = [sl]
                st_['bullets'].append(st_['bullet'])
                continue
            # --- 이어지는 줄 ---
            if st_['state'] == 'codes' and st_['item'] is not None:
                st_['item']['parts'].append(s)
            elif st_['state'] in ('expl', 'notes') and st_['bullet'] is not None:
                st_['bullet'].append(s)
            else:
                anomalies.append(f'[{st_["subject"]}/{st_["area"]}] 소속 불명 줄(state={st_["state"]}): {st[:60]} (p{pno+1})')
    flush_bullets()

    # ---- 조립 ----
    for it in items:
        it['content'] = restore_pua(join_text(it['parts']), hwp, notes, f'{it["code"]} content')
        it['expl'] = restore_pua(it['expl'], hwp, notes, f'{it["code"]} explanation')
        it['grade_group'] = grade_group_of(it['code'])
    for k in list(area_notes):
        area_notes[k] = [restore_pua(t, hwp, notes, f'{k[0]} {k[2]} application_notes') for t in area_notes[k]]

    subjects, mixed_seen = [], set()
    for subj in subject_order:
        ggs = []
        for it in items:
            if it['subject'] == subj and it['grade_group'] not in ggs:
                ggs.append(it['grade_group'])
        for gg in ggs:
            entry = dict(subject=subj, school_level=school_level_of(gg), grade_group=gg,
                         curriculum_category=subject_cat.get(subj, ''), areas=[])
            for k in area_order:
                if k[0] != subj:
                    continue
                all_codes = [it for it in items if it['subject'] == subj and it['grade_label'] == k[1] and it['area'] == k[2]]
                codes = [it for it in all_codes if it['grade_group'] == gg]
                if not codes:
                    continue
                an = '\n'.join(area_notes.get(k, []))
                groups = sorted({it['grade_group'] for it in all_codes})
                if len(groups) > 1 and an and k not in mixed_seen:
                    mixed_seen.add(k)
                    notes.append(f'{subj} {k[2]} 영역은 학년군이 섞여 있어({", ".join(groups)}) 적용 시 고려 사항을 각 학년군 항목에 동일하게 수록')
                entry['areas'].append(dict(area=k[2],
                                           codes=[dict(code=it['code'], content=it['content'], explanation=it['expl']) for it in codes],
                                           application_notes=an))
            subjects.append(entry)

    all_notes = list(COMMON_NOTES) + list(cfg.get('static_notes', [])) + notes
    if hwp_path and hwp is None:
        all_notes.append('HWP 경로가 주어졌으나 hwp5txt를 찾지 못해 HWP 대조를 건너뜀')
    all_notes += [f'[추출 이상] {a}' for a in anomalies]
    return dict(byeolchaek=cfg['name'], source_file=os.path.basename(pdf_path), subjects=subjects, notes=all_notes)


# ---------------------------------------------------------------- CLI
def main(argv, cfg, extract_fn):
    ap = argparse.ArgumentParser(description=f'{cfg["name"]} 원문 구조화 추출')
    ap.add_argument('--pdf', required=True)
    ap.add_argument('--hwp', default=None)
    ap.add_argument('--out', required=True)
    a = ap.parse_args(argv)
    try:
        out = extract_fn(a.pdf, a.hwp)
    except Exception as e:  # noqa: BLE001
        print(f'추출 실패: {e}', file=sys.stderr)
        return 1
    n = sum(len(ar['codes']) for s in out['subjects'] for ar in s['areas'])
    os.makedirs(os.path.dirname(os.path.abspath(a.out)) or '.', exist_ok=True)
    with open(a.out, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    anomalies = [x for x in out['notes'] if x.startswith('[추출 이상]')]
    print(f'{cfg["name"]}: 과목 항목 {len(out["subjects"])}, 코드 {n}, notes {len(out["notes"])} (추출 이상 {len(anomalies)}) → {a.out}')
    for x in anomalies[:20]:
        print('  !', x, file=sys.stderr)
    return 0 if n > 0 else 1
