#!/usr/bin/env python3
"""별책16·19·20·21·22 원문 구조화 추출 공통 로직 (담당 D).

PDF → PyMuPDF(fitz) 라인 좌표 덤프 → 머리글/꼬리글 제거 → 같은 기준선 조각 병합 →
"나. 성취기준" ~ "3. 교수·학습" 구간을 영역/코드/해설/적용고려사항으로 구조화.
정본(standards.json)은 전혀 참조하지 않는다(verbatim). 결정적(외부 상태·난수 없음).
"""
import argparse, collections, json, os, re, sys

try:
    import fitz  # PyMuPDF
except ImportError as e:  # pragma: no cover
    raise SystemExit('PyMuPDF(fitz)가 필요합니다: pip install pymupdf') from e

# ---------- 레이아웃 상수 (pt) ----------
HDR_Y = 65            # 이보다 위는 러닝 헤드(책 제목 / "진로 선택 과목 - 과목명")
FTR_Y_A4 = 740        # 페이지 높이 > 800(A4, 별책19)일 때 꼬리글(쪽번호) 경계
FTR_Y_B5 = 690        # 그 외(754pt 판형) 꼬리글 경계
AREA_MAX_X = 89       # "(n) 영역명" 소제목의 x0 상한 (본문 불릿 연속행과 구분)
CODE_MAX_X = 95       # "[코드] 본문" 행의 x0 상한

SUBJ_HDR = re.compile(r'^(.+?(?:선택|교육과정|공통).*?)\s*[-–—]\s*(.+?)\s*$')
NA = re.compile(r'^나\.\s*성취기준\s*$')
END = re.compile(r'^3\.\s*교수')
GA = re.compile(r'^\(가\)\s*(?:영역\s*)?성취기준\s*해설\s*$')
NAH = re.compile(r'^\(나\)\s*(?:영역\s*)?성취기준\s*적용\s*시\s*고려\s*사항\s*$')
AREA = re.compile(r'^\((\d+)\)\s*(\S.*)$')
CODE_LINE = re.compile(r'^(\[?\d{1,2}[가-힣A-Za-z0-9·()ⅠⅡⅢⅣⅤ]{1,12}\s?-?\d{2}-\d{2}\])\s*(.*)$')
CODES_LEAD = re.compile(r'^((?:\[[^\]]{3,40}\](?:\s*[,，]\s*|\s*[와과]\s+(?=\[)|\s*))+)(.*)$', re.S)
BULLET = '•'
PUA = re.compile('[\ue000-\uf8ff]')


def dump_lines(pdf_path):
    """fitz dict 모드로 페이지별 라인(텍스트+bbox)을 (y0, x0) 순으로 나열."""
    doc = fitz.open(pdf_path)
    out = []
    for pno in range(doc.page_count):
        page = doc[pno]
        H = page.rect.height
        lines = []
        for b in page.get_text('dict')['blocks']:
            if b['type'] != 0:
                continue
            for l in b['lines']:
                t = ''.join(s['text'] for s in l['spans'])
                x0, y0, x1, y1 = l['bbox']
                lines.append((round(y0, 1), round(x0, 1), round(y1, 1), round(x1, 1), t))
        lines.sort()
        for y0, x0, y1, x1, t in lines:
            out.append({'p': pno, 'y0': y0, 'x0': x0, 'y1': y1, 'x1': x1, 'H': H, 't': t})
    doc.close()
    return out


def is_hdr(o):
    return o['y0'] < HDR_Y


def is_ftr(o):
    return o['y0'] > (FTR_Y_A4 if o['H'] > 800 else FTR_Y_B5)


def merge_fragments(lines):
    """머리글/꼬리글 제거 후, 같은 페이지·같은 기준선(y 겹침)의 조각을 x 순으로 병합(수식/기호 span 분리 대응)."""
    body = []
    for o in lines:
        if is_hdr(o) or is_ftr(o):
            continue
        if body and body[-1]['p'] == o['p'] \
           and min(body[-1]['y1'], o['y1']) - max(body[-1]['y0'], o['y0']) > 0.5 * min(body[-1]['y1'] - body[-1]['y0'], o['y1'] - o['y0']) \
           and o['x0'] >= body[-1]['x1'] - 2:
            prev = body[-1]
            gap = o['x0'] - prev['x1']
            sep = '' if gap < 1.5 or prev['t'].endswith(' ') or o['t'].startswith(' ') else ' '
            prev['t'] = prev['t'].rstrip('\n') + sep + o['t']
            prev['x1'] = max(prev['x1'], o['x1']); prev['y1'] = max(prev['y1'], o['y1']); prev['y0'] = min(prev['y0'], o['y0'])
        else:
            body.append(dict(o))
    return body


def join(acc, t):
    """줄바꿈 결합: 앞 줄이 공백으로 끝나면 공백 유지(HWP→PDF는 어절 경계 줄바꿈 시 끝공백 보존),
    아니면 글자 단위 줄바꿈이므로 그대로 붙임. 라틴/숫자로 시작하는 줄은 공백."""
    if not acc:
        return t.lstrip()
    if acc.endswith(' ') or acc.endswith('　'):
        return acc.rstrip() + ' ' + t.lstrip()
    if re.match(r'^[A-Za-zÀ-ɏ0-9(]', t.lstrip()) and not acc.endswith(('(', '-', '/', '‘', '“', '「', '<')):
        return acc + ' ' + t.lstrip()
    return acc + t.lstrip()


def cat_of(left):
    s = left.replace(' ', '')
    if '공통' in s: return '공통'
    if '일반선택' in s: return '일반선택'
    if '진로선택' in s: return '진로선택'
    if '융합선택' in s: return '융합선택'
    return ''


def level_of(code):
    m = re.match(r'^\[(\d{1,2})', code)
    if not m:
        return ('', '기타')
    return {'2': ('초등학교', '초1-2'), '4': ('초등학교', '초3-4'), '6': ('초등학교', '초5-6'),
            '9': ('중학교', '중1-3'), '10': ('고등학교', '고공통'), '12': ('고등학교', '고선택')}.get(m.group(1), ('', '기타'))


def _codekey(c):
    return re.sub(r'\s+', '', c)


def parse_subjects(lines, notes, diag):
    hdr_by_page = collections.defaultdict(list)
    for o in lines:
        if is_hdr(o):
            m = SUBJ_HDR.match(o['t'].strip())
            if m:
                hdr_by_page[o['p']].append((m.group(1).strip(), m.group(2).strip()))
    body = merge_fragments(lines)
    starts = [i for i, o in enumerate(body) if NA.match(o['t'].strip())]
    subjects = []
    for si, s in enumerate(starts):
        e = next((j for j in range(s + 1, len(body)) if END.match(body[j]['t'].strip())), None)
        nxt = starts[si + 1] if si + 1 < len(starts) else len(body)
        if e is None or e > nxt:
            e = nxt; diag.append(f'section{si}: 3.교수 heading not found before next section (p{body[s]["p"]})')
        pages = sorted(set(o['p'] for o in body[s:e]))
        c = collections.Counter(h for p in pages for h in hdr_by_page.get(p, []))
        if not c:
            for p in (pages[0] - 1, pages[-1] + 1):
                for h in hdr_by_page.get(p, []):
                    c[h] += 1
        if not c:
            diag.append(f'section{si} p{pages[0]}: no subject header'); left, subj = '', f'UNKNOWN{si}'
        else:
            (left, subj), _ = c.most_common(1)[0]
        if len(c) > 1:
            diag.append(f'section{si} p{pages[0]}-{pages[-1]} headers {c.most_common()} → {subj}')
        subj_out = _parse_one(subj, left, body[s + 1:e], notes, diag)
        if subj_out is None:
            diag.append(f'section{si} {subj}: no areas'); continue
        subjects.append(subj_out)
    return subjects


def _parse_one(subj, left, seg, notes, diag):
    areas = []
    state = {'cur_area': None, 'mode': 'codes', 'cur': None, 'bullet_x': None}

    def flush():
        cur = state['cur']
        if cur is None:
            return
        kind, payload = cur
        a = state['cur_area']
        if kind == 'code':
            item = {'code': payload[0], 'content': payload[1].strip(), 'explanation': ''}
            if len(payload) > 2:
                item['code_as_printed'] = payload[2]
            a['codes'].append(item)
        elif kind == 'ga':
            a['_ga'].append(payload.strip())
        elif kind == 'na':
            a['_na'].append(payload.strip())
        state['cur'] = None

    def new_area(name):
        flush()
        a = {'area': name, 'codes': [], '_ga': [], '_na': []}
        areas.append(a); state['cur_area'] = a; state['mode'] = 'codes'

    for o in seg:
        t = o['t'].rstrip('\n'); ts = t.strip(); x = o['x0']
        if not ts or ts in ('<없음>', '없음'):
            continue
        m = AREA.match(ts)
        if m and x < AREA_MAX_X and not ts.startswith('(가)'):
            new_area(ts); continue
        if GA.match(ts):
            flush(); state['mode'] = 'ga'; continue
        if NAH.match(ts):
            flush(); state['mode'] = 'na'; continue
        if state['cur_area'] is None:
            if CODE_LINE.match(t.lstrip()) and x < CODE_MAX_X:
                # 영역 소제목 없이 성취기준이 바로 시작하는 과목(단일 영역) → area "" 로 기록
                new_area('')
                notes.append(f'{subj}: 성취기준 소제목(영역명)이 원문에 없어 단일 영역을 area="" 로 기록')
            else:
                diag.append(f'{subj}: line before first area ignored: {ts[:60]!r}'); continue
        cur_area = state['cur_area']; mode = state['mode']; cur = state['cur']
        if mode == 'codes':
            m = CODE_LINE.match(t.lstrip())
            if m and x < CODE_MAX_X:
                flush()
                if m.group(1).startswith('['):
                    state['cur'] = ('code', [m.group(1), m.group(2)])
                else:
                    fixed = '[' + m.group(1)
                    notes.append(f'{subj} {cur_area["area"]}: 원문 텍스트에 여는 대괄호가 없는 코드 표기 {m.group(1)!r} → {fixed} 로 기록(code_as_printed에 원문 보존)')
                    state['cur'] = ('code', [fixed, m.group(2), m.group(1)])
                continue
            if cur and cur[0] == 'code':
                cur[1][1] = join(cur[1][1], t); continue
            diag.append(f'{subj}/{cur_area["area"]}: stray line in codes: {ts[:60]!r}'); continue
        # (가)/(나) 불릿 모드
        if ts.startswith(BULLET) and mode != 'skip':
            if state['bullet_x'] is None:
                state['bullet_x'] = x
            flush(); state['cur'] = (mode, t.lstrip()[1:].lstrip()); continue
        if ts.startswith('<표') or ts.startswith('[그림') or re.match(r'^<표\s*\d', ts):
            flush(); state['mode'] = 'skip'
            diag.append(f'{subj}/{cur_area["area"]}: section terminated at {ts[:40]!r} (x={x})'); continue
        if mode == 'skip':
            diag.append(f'{subj}/{cur_area["area"]}: skipped: {ts[:50]!r}'); continue
        if state['bullet_x'] is not None and x > state['bullet_x'] + 40:
            diag.append(f'{subj}/{cur_area["area"]}: far-x fragment appended (x={x}): {ts[:40]!r}')
        if cur is None:
            diag.append(f'{subj}/{cur_area["area"]}: stray line in {mode}: {ts[:60]!r}'); continue
        state['cur'] = (cur[0], join(cur[1], t))
    flush()

    # 원문 오식: 같은 영역에서 직전 코드와 동일 코드 반복(일련번호 +1이 비어 있을 때) → 보정 + 원문 표기 보존
    for a in areas:
        seen = set()
        for c in a['codes']:
            key = _codekey(c['code'])
            if key in seen:
                r = re.match(r'^(\[.+?-)(\d{2})\]$', c['code'])
                if r:
                    cand = f'{r.group(1)}{int(r.group(2)) + 1:02d}]'
                    if _codekey(cand) not in seen and not any(_codekey(x['code']) == _codekey(cand) for x in a['codes']):
                        notes.append(f'{subj} {a["area"]}: 원문에 코드 {c["code"]}가 중복 인쇄됨(오식). 두 번째 항목을 {cand}로 보정하고 code_as_printed에 원문 표기 보존: {c["content"][:40]}')
                        c['code_as_printed'] = c['code']; c['code'] = cand; key = _codekey(cand)
            seen.add(key)

    # (가) 해설 → 코드 매핑
    for a in areas:
        idx = {_codekey(c['code']): c for c in a['codes']}
        for g in a['_ga']:
            if g.strip().strip('<>') in ('없음', '없음.'):
                continue
            m = CODES_LEAD.match(g)
            if not m:
                notes.append(f'{subj} {a["area"]}: 코드 없는 해설 불릿(매핑 불가, 전문): {g}'); continue
            codes = []
            for cc in re.findall(r'\[[^\]]+\]', m.group(1)):
                r = re.match(r'^\[(.+?)(\d{2})-(\d{2})\s*[∼~～–\-]\s*(\d{2})\]$', cc)
                r2 = re.match(r'^\[(.+?)(\d{2})-(\d{2}(?:/\d{2})+)\]$', cc)
                if r:
                    ex = [f'[{r.group(1)}{r.group(2)}-{i:02d}]' for i in range(int(r.group(3)), int(r.group(4)) + 1)]
                    notes.append(f'{subj} {a["area"]}: 해설 코드 범위 표기 {cc} → {", ".join(ex)} 로 전개'); codes += ex
                elif r2:
                    ex = [f'[{r2.group(1)}{r2.group(2)}-{n}]' for n in r2.group(3).split('/')]
                    notes.append(f'{subj} {a["area"]}: 해설 코드 병기 표기 {cc} → {", ".join(ex)} 로 전개'); codes += ex
                else:
                    codes.append(cc)
            text = m.group(2).strip()
            for cc in codes:
                key = _codekey(cc).replace('–', '-').replace('−', '-')
                if key not in idx:
                    sm = re.search(r'(\d{2})[-–](\d{1,2})\]$', key)
                    cand = [k for k in idx if sm and k.endswith(f'{sm.group(1)}-{int(sm.group(2)):02d}]')] if sm else []
                    if len(cand) == 1:
                        notes.append(f'{subj} {a["area"]}: 해설의 코드 표기 {cc}가 성취기준 코드와 불일치(오식) → {cand[0]}에 매핑')
                        key = cand[0]
                if key in idx:
                    c = idx[key]
                    c['explanation'] = (c['explanation'] + '\n' + text).strip() if c['explanation'] else text
                else:
                    notes.append(f'{subj} {a["area"]}: 해설의 코드 {cc}가 이 영역 성취기준에 없음(매핑 안 함): {text[:60]}')
            if len(codes) > 1:
                notes.append(f'{subj} {a["area"]}: 해설 1건이 코드 {len(codes)}개에 병기되어 각 코드에 동일 삽입: {", ".join(codes)}')
        a['application_notes'] = '\n'.join(a['_na'])
        del a['_ga']; del a['_na']
    if not areas:
        return None
    first_code = areas[0]['codes'][0]['code'] if areas[0]['codes'] else ''
    lvl, gg = level_of(first_code)
    return {'subject': subj, 'school_level': lvl, 'grade_group': gg, 'curriculum_category': cat_of(left), 'areas': areas}


def append_pua_notes(subjects, notes):
    for sbj in subjects:
        for a in sbj['areas']:
            for c in a['codes']:
                if PUA.search(c['content']):
                    notes.append(f'{sbj["subject"]} {c["code"]}: content에 사설영역(PUA) 수식 글리프 잔존(HWP 원본 없어 복원 불가)')
                if PUA.search(c['explanation']):
                    notes.append(f'{sbj["subject"]} {c["code"]}: explanation에 PUA 글리프 잔존')
            if PUA.search(a['application_notes']):
                notes.append(f'{sbj["subject"]} {a["area"]}: application_notes에 PUA 글리프 잔존')


def extract_book(pdf_path, byeolchaek, hwp_path=None, post_fix=None, extra_notes=None, diag_out=None):
    """공통 추출. post_fix(subjects, notes)는 책별 후처리(PUA/글리프 복원 등). hwp_path는 인터페이스 호환용(본 담당 별책은 HWP 미제공)."""
    notes, diag = [], []
    lines = dump_lines(pdf_path)
    subjects = parse_subjects(lines, notes, diag)
    if post_fix:
        post_fix(subjects, notes)
    for n in (extra_notes or []):
        notes.append(n)
    append_pua_notes(subjects, notes)
    if hwp_path:
        notes.append(f'hwp_path가 주어졌으나 이 별책 파서는 HWP를 사용하지 않음: {os.path.basename(hwp_path)}')
    if diag_out:
        with open(diag_out, 'w', encoding='utf-8') as f:
            f.write('\n'.join(diag) + '\n---notes---\n' + '\n'.join(notes) + '\n')
    return {'byeolchaek': byeolchaek, 'source_file': os.path.basename(pdf_path), 'subjects': subjects, 'notes': notes}


def run_cli(extract_fn, byeolchaek, argv=None):
    ap = argparse.ArgumentParser(description=f'{byeolchaek} 원문 구조화 추출')
    ap.add_argument('--pdf', required=True)
    ap.add_argument('--hwp', default=None)
    ap.add_argument('--out', required=True)
    ap.add_argument('--diag', default=None, help='진단 로그 저장 경로(선택)')
    a = ap.parse_args(argv)
    try:
        d = extract_fn(a.pdf, a.hwp, diag_out=a.diag) if a.diag else extract_fn(a.pdf, a.hwp)
    except Exception as e:  # noqa
        print(f'ERROR: {e}', file=sys.stderr); return 1
    n = sum(len(x['codes']) for s in d['subjects'] for x in s['areas'])
    if n == 0:
        print('ERROR: 추출된 코드 0건', file=sys.stderr); return 1
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    print(f'{byeolchaek}: subjects {len(d["subjects"])} codes {n} notes {len(d["notes"])} → {a.out}')
    return 0
