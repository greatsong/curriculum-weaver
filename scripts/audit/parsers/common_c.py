#!/usr/bin/env python3
"""별책10·11·12·13·14·17(실과/기술가정/정보·체육·음악·미술·영어·한문) 공통 파서 (담당 C).

PDF → (PyMuPDF rawdict, 줄 끝 공백 글리프 보존) → 머리글/쪽번호 제거 → 상태 기계로
'나. 성취기준' 섹션의 영역/코드/해설/적용 고려사항을 SPEC.md 구조로 만든다.

공개 API
    extract_book(book_no, pdf_path, hwp_path=None, manual_notes=()) -> dict
    run_cli(book_no, manual_notes=()) -> int      # argparse CLI (--pdf/--hwp/--out)

의존: PyMuPDF(fitz). HWP는 이 6권에 2022 개정 원본이 없어 받기만 하고 쓰지 않는다.
결정적: 같은 PDF면 같은 출력(정렬·반올림 고정, 임시 파일 없음).
"""
import argparse
import collections
import json
import os
import re
import sys
import unicodedata

CODE_HEAD = re.compile(r'^(\[(?:\d{1,2}[가-힣A-Za-z0-9·⋅()ⅠⅡⅢⅣⅤ]+?-\d{2}(?:-\d{2})?|[가-힣]{2,4}\s?\d{2}-\d{2}(?:-\d{2})?)\])\s*(.*)$', re.S)
CODE_ANY = re.compile(r'\[(?:\d{1,2}[가-힣A-Za-z0-9·⋅()ⅠⅡⅢⅣⅤ]+?-\d{2}(?:-\d{2})?|[가-힣]{2,4}\s?\d{2}-\d{2}(?:-\d{2})?)\]')
BULLETS = '•●○◦▪■'   # 뒤 3개는 Wingdings 사설영역 글머리(체육)
HEADER_Y = 60      # 이보다 위(y0)에 있는 줄은 페이지 머리글
FOOTER_Y = 690     # 이보다 아래의 숫자만 있는 줄은 쪽번호


def nfc(s):
    return unicodedata.normalize('NFC', s)


# ---------------------------------------------------------------- 1. PDF → 줄
def load_lines(pdf_path):
    """fitz rawdict로 줄 단위 텍스트를 뽑는다. 문자 단위로 이어 붙이므로 줄 끝 공백 글리프가 보존된다.
    반환: [{p, y0, y1, x0, x1, size, font, text}] (페이지 내에서 y 3pt 버킷 → x0 순 정렬)"""
    import fitz  # PyMuPDF
    doc = fitz.open(pdf_path)
    out = []
    for pno, page in enumerate(doc):
        d = page.get_text('rawdict')
        lines = []
        for b in d['blocks']:
            if b['type'] != 0:
                continue
            for l in b['lines']:
                chars = [c for s in l['spans'] for c in s['chars']]
                if not chars:
                    continue
                txt = ''.join(c['c'] for c in chars)
                sizes = [s['size'] for s in l['spans'] if s['chars']]
                fonts = [s['font'] for s in l['spans'] if s['chars']]
                x0, y0, x1, y1 = l['bbox']
                lines.append({'p': pno + 1, 'y0': round(y0, 1), 'y1': round(y1, 1), 'x0': round(x0, 1),
                              'x1': round(x1, 1), 'size': round(max(sizes), 1), 'font': fonts[0], 'text': txt})
        lines.sort(key=lambda r: (round(r['y0'] / 3), r['x0']))
        out.extend(lines)
    doc.close()
    return out


def clean_rows(lines, diag):
    """머리글(y0<HEADER_Y)·쪽번호(y0>FOOTER_Y & 숫자만)·빈 줄 제거 후, 같은 y의 조각 줄을 x 순으로 병합."""
    rows = []
    for r in lines:
        t = r['text']
        if r['y0'] < HEADER_Y:
            continue
        if r['y0'] > FOOTER_Y and re.fullmatch(r'\s*\d+\s*', t):
            continue
        if not t.strip():
            continue
        rows.append(dict(r))
    merged = []
    for r in rows:
        if merged and merged[-1]['p'] == r['p'] and abs(merged[-1]['y0'] - r['y0']) < 3.0 and r['x0'] >= merged[-1]['x1'] - 1.0:
            m = merged[-1]
            gap = r['x0'] - m['x1']
            if not m['text'].endswith(' ') and gap > 2.0 and not r['text'].startswith(' '):
                m['text'] += ' '
            m['text'] += r['text']
            m['x1'] = max(m['x1'], r['x1'])
            diag['merged_same_line'] += 1
        else:
            merged.append(r)
    return merged


# ---------------------------------------------------------------- 2. 보조 함수
def join_cont(acc, nxt):
    """줄바꿈으로 끊긴 텍스트 이어 붙이기. 앞 줄 끝에 공백 글리프가 있으면 그대로, 없으면 붙여 쓴다."""
    if not acc:
        return nxt.lstrip()
    if acc.endswith(' '):
        return acc + nxt.lstrip()
    if nxt.startswith(' '):
        return acc + nxt
    return acc + nxt


def category_of(text):
    t = re.sub(r'\s+', '', text)
    if '일반선택' in t: return '일반선택'
    if '진로선택' in t: return '진로선택'
    if '융합선택' in t: return '융합선택'
    if '공통과목' in t or '공통교육과정' in t: return '공통'
    if '전문공통' in t: return '전문공통'
    if '전공일반' in t: return '전공일반'
    if '전공실무' in t: return '전공실무'
    return None


def level_of(code):
    m = re.match(r'^\[(\d{1,2})', code)
    if not m:
        return '고등학교', '기타'
    n = int(m.group(1))
    return {2: ('초등학교', '초1-2'), 4: ('초등학교', '초3-4'), 6: ('초등학교', '초5-6'),
            9: ('중학교', '중1-3'), 10: ('고등학교', '고공통'), 12: ('고등학교', '고선택')}.get(n, ('', '기타'))


def expand_codes(head):
    """해설 불릿 머리의 병기 코드 → 코드 목록.
    '[A], [B]' / '[A]~[B]'(같은 영역이면 범위 확장) / '[9체02-01, 04, 07]'(축약형)"""
    ab = re.match(r'^\[([^\]]*?-)(\d{2})((?:\s*,\s*\d{2})+)\]$', head.strip())
    if ab:
        nums = [ab.group(2)] + re.findall(r'\d{2}', ab.group(3))
        return [f'[{ab.group(1)}{x}]' for x in nums], 'abbrev-list'
    codes = CODE_ANY.findall(head)
    if '~' in head or '∼' in head:
        if len(codes) == 2:
            a, b = codes
            ma = re.match(r'^(\[.*-)(\d{2})\]$', a); mb = re.match(r'^(\[.*-)(\d{2})\]$', b)
            if ma and mb and ma.group(1) == mb.group(1):
                lo, hi = int(ma.group(2)), int(mb.group(2))
                return [f'{ma.group(1)}{i:02d}]' for i in range(lo, hi + 1)], 'range'
        return codes, 'range-unexpanded'
    return codes, 'list' if len(codes) > 1 else 'single'


def strip_all(s):
    return re.sub(r'[ \t]+\n', '\n', s).strip()


# ---------------------------------------------------------------- 3. 상태 기계
def parse_lines(rows, notes, diag):
    """정리된 줄 목록 → subjects 리스트. notes/diag는 호출자가 넘긴 리스트/카운터에 누적."""
    subjects = []
    subj_index = {}
    state = dict(category='', title='', main_title='', in_std=False, mode=None, area=None, cur=None,
                 bullets=None, cur_bullet=None, appendix=False)
    pending_areas = []
    small_seen = {}
    particle_counts = {}

    def flush_bullet():
        if state['cur_bullet'] is not None:
            state['bullets'].append(state['cur_bullet'].rstrip())
            state['cur_bullet'] = None

    def finish_mode():
        flush_bullet()
        a = state['area']
        if a is None or state['bullets'] is None:
            return
        if state['mode'] == 'expl':
            for b in state['bullets']:
                m = re.match(r'^((?:\[[^\]]+\]\s*[,~∼]?\s*)+)(.*)$', b, re.S)
                if not m or not (CODE_ANY.search(m.group(1)) or re.match(r'^\[[^\]]*?-\d{2}(?:\s*,\s*\d{2})+\]', m.group(1))):
                    a.setdefault('_orphan_expl', []).append(b)
                    continue
                codes, kind = expand_codes(m.group(1))
                body = m.group(2)
                # 체육형 '[코드]은/는 …'(조사가 ] 바로 뒤에 붙음) → 조사 제거
                if not m.group(1).endswith((' ', '\n')):
                    pm = re.match(r'^(은|는|이|가|을|를|의)\s+(.*)$', body, re.S)
                    if pm:
                        body = pm.group(2); diag['particle_stripped'] += 1
                        a.setdefault('_particle', set()).add(codes[0])
                body = body.strip()
                if kind != 'single':
                    notes.append(f"해설 병기 {kind}: {m.group(1).strip()} → {len(codes)}개 코드에 동일 해설 배정 ({state['title']} / {a['area']})")
                for c in codes:
                    tgt = next((x for x in a['codes'] if x['code'].replace(' ', '') == c.replace(' ', '')), None)
                    if tgt is None:
                        a.setdefault('_orphan_expl', []).append(b)
                        notes.append(f"해설의 코드 {c}가 영역 '{a['area']}'({state['title']}) 코드 목록에 없음 → 미배정")
                        continue
                    if tgt['explanation']:
                        tgt['explanation'] += '\n' + body
                        notes.append(f"{c}: 해설 불릿 2개 이상 → '\\n'으로 이어 붙임")
                    else:
                        tgt['explanation'] = body
        elif state['mode'] == 'notes':
            a['application_notes'] = '\n'.join(x.strip() for x in state['bullets'] if x.strip())
        state['bullets'] = None

    def close_area():
        finish_mode()
        state['mode'] = None
        state['cur'] = None
        state['area'] = None

    def new_area(name):
        close_area()
        a = {'area': name.strip(), 'codes': [], 'application_notes': ''}
        pending_areas.append(a)
        state['area'] = a
        state['mode'] = 'codes'

    def end_subject():
        close_area()
        for a in pending_areas:
            part = a.pop('_particle', None)
            if part:
                particle_counts[state['title']] = particle_counts.get(state['title'], 0) + len(part)
            orphan = a.pop('_orphan_expl', None)
            if orphan:
                a['unassigned_explanations'] = []
                for o in orphan:
                    om = re.match(r'^((?:\[[^\]]+\]\s*[,~∼]?\s*)+)(.*)$', o, re.S)
                    a['unassigned_explanations'].append({'label': om.group(1).strip() if om else '', 'text': (om.group(2) if om else o).strip()})
                    notes.append(f"코드 미배정 해설 불릿 → area.unassigned_explanations 보존 ({state['title']} / {a['area']}): {o[:60]}")
            if not a['codes']:
                notes.append(f"코드 없는 영역 제외: {state['title']} / {a['area']}")
                continue
            levels = collections.Counter(level_of(c['code']) for c in a['codes'])
            (lvl, gg), _ = levels.most_common(1)[0]
            if len(levels) > 1:
                notes.append(f"영역 '{a['area']}'({state['title']})에 학년군 혼재: {dict(levels)}")
            key = (state['title'], gg)
            if key not in subj_index:
                s = {'subject': state['title'], 'school_level': lvl, 'grade_group': gg,
                     'curriculum_category': state['category'], 'areas': []}
                subjects.append(s); subj_index[key] = s
            subj_index[key]['areas'].append(a)
        pending_areas.clear()
        state['in_std'] = False

    for i, r in enumerate(rows):
        t = r['text']
        ts = t.strip()
        x0 = r['x0']; size = r['size']

        # --- 구분 페이지(26pt+: '공통 교육과정', '- 일반 선택 과목 -') / 과목 표제(21pt, 페이지 상단) ---
        if size >= 25:
            end_subject()
            c = category_of(ts)
            if c:
                state['category'] = c
            continue
        if 19 <= size <= 23 and r['y0'] < 130:
            end_subject()
            state['title'] = nfc(ts)
            state['main_title'] = state['title']
            state['appendix'] = False
            continue
        if ts.startswith('[부록]') or ts.startswith('[별표]'):
            end_subject()
            state['appendix'] = True
            notes.append(f"부록/별표 섹션 제외: '{ts[:40]}' (p{r['p']})")
            continue
        if state['appendix']:
            continue

        # --- 하위 과목 머리글 ([공통영어 1], [기본영어 2]) ---
        sm = re.match(r'^\[([가-힣]+)\s*(\d)\]$', ts)
        if sm and size >= 11.5 and x0 < 90:
            end_subject()
            state['title'] = sm.group(1) + sm.group(2)
            notes.append(f"하위 과목 머리글 '{ts}'(p{r['p']}) → subject '{state['title']}'로 분리 (표제는 '{state.get('main_title','')}')")
            continue
        # --- 성취기준 섹션 진입/이탈 ---
        if re.match(r'^나\.\s*성취기준\s*$', ts):
            close_area()
            state['in_std'] = True
            continue
        if re.match(r'^가\.\s*내용\s*체계', ts):
            end_subject()
            continue
        if state['in_std'] and (re.match(r'^3\.\s*교수', ts) or (size >= 13 and re.match(r'^\d+\.\s', ts))):
            end_subject()
            state['in_std'] = False
            continue
        if not state['in_std']:
            continue

        # --- 섹션 내부 ---
        if re.match(r'^\((가|1)\)\s*성취기준\s*해설', ts):
            if ts.startswith('(1)'): notes.append(f"해설 머리글 변형 '(1) 성취기준 해설' (p{r['p']}, {state['title']})")
            finish_mode(); state['mode'] = 'expl'; state['bullets'] = []; state['cur'] = None
            continue
        if re.match(r'^\((나|2)\)\s*성취기준\s*적용', ts):
            if ts.startswith('(2)'): notes.append(f"적용 머리글 변형 '(2) 성취기준 적용 시 고려사항' (p{r['p']}, {state['title']})")
            finish_mode(); state['mode'] = 'notes'; state['bullets'] = []; state['cur'] = None
            continue
        nxt = rows[i + 1]['text'].strip() if i + 1 < len(rows) else ''
        if x0 < 100 and re.match(r'^\((\d+)\)\s*[^.。]{1,40}$', ts) and size >= 10.3 and not CODE_ANY.match(ts) and (x0 < 85 or CODE_HEAD.match(nxt)):
            if x0 >= 85: notes.append(f"영역 머리글 들여쓰기 이상(x0={x0:.0f}) '{ts}' (p{r['p']}, {state['title']})")
            new_area(ts)
            continue
        if x0 < 85 and re.match(r'^\[(초등학교|중학교|고등학교)', ts) and size >= 11:
            close_area()          # 학년군 머리글 — 학년군은 코드 접두로 결정하므로 스킵
            continue
        if size < 9.3:
            diag['small_font_in_std'] += 1
            key = (state['title'], state['area']['area'] if state['area'] else '?', state['mode'])
            if key not in small_seen:
                small_seen[key] = ts
                notes.append(f"{key[0]} / {key[1]} {key[2]} 섹션 안의 표(작은 글꼴) 생략 (p{r['p']}): '{ts[:40]}' …")
            continue

        mode = state['mode']
        if mode is None and x0 < 90 and CODE_HEAD.match(ts):
            new_area('')          # 영역 머리글 없이 코드가 바로 나오는 단일 영역 과목
            notes.append(f"영역 머리글 없이 코드 시작 → area '' (p{r['p']}, {state['title']})")
            mode = 'codes'
        if mode == 'codes':
            m = CODE_HEAD.match(ts) if x0 < 90 else None
            if m:
                code = nfc(m.group(1))
                cur = {'code': code, 'content': nfc(m.group(2)), 'explanation': ''}
                state['area']['codes'].append(cur)
                state['cur'] = cur
                if t.endswith(' ') and not cur['content'].endswith(' '):
                    cur['content'] += ' '
            elif state['cur'] is not None and x0 >= 90:
                state['cur']['content'] = join_cont(state['cur']['content'], nfc(t))
            else:
                diag['unparsed_in_codes'] += 1
                notes.append(f"코드 모드에서 해석 못 한 줄 (p{r['p']} x{x0:.0f}): {ts[:70]}")
        elif mode in ('expl', 'notes'):
            first = ts[0] if ts else ''
            if first in BULLETS and x0 < 95:
                flush_bullet()
                body = ts[1:]
                state['cur_bullet'] = nfc(body.lstrip()) + (' ' if t.endswith(' ') and not body.endswith(' ') else '')
            elif state['cur_bullet'] is not None:
                if 92 < x0 < 101 and first and not re.match(r'[가-힣A-Za-z0-9‘“(\[]', first):
                    # 하위 항목(―, ①, ⋅ 등, 들여쓰기 얕음) → 줄바꿈으로 구분
                    state['cur_bullet'] = state['cur_bullet'].rstrip() + '\n' + nfc(t.strip()) + (' ' if t.endswith(' ') else '')
                    diag['subitem'] += 1
                else:
                    state['cur_bullet'] = join_cont(state['cur_bullet'], nfc(t))
            else:
                state['cur_bullet'] = nfc(t.strip()) + (' ' if t.endswith(' ') else '')
                diag['nonbullet_para'] += 1
                notes.append(f"불릿 없이 시작한 {mode} 문단 (p{r['p']}, {state['title']} / {state['area']['area'] if state['area'] else '?'}): {ts[:60]}")
        else:
            diag['line_outside_mode'] += 1
            notes.append(f"영역 밖 줄 무시 (p{r['p']}): {ts[:60]}")

    end_subject()
    for k, v in particle_counts.items():
        notes.append(f"{k}: 해설 불릿이 '[코드]은/는 …' 형태({v}건) → 코드와 바로 붙은 조사를 제거한 본문을 explanation에 수록")
    return subjects


def postprocess(subjects, notes):
    """앞뒤 공백 정리 + 사설영역(PUA) 문자 잔존 검사."""
    pua = []
    for s in subjects:
        for a in s['areas']:
            for c in a['codes']:
                c['content'] = strip_all(c['content'])
                c['explanation'] = strip_all(c['explanation'])
                for f in ('content', 'explanation'):
                    bad = [ch for ch in c[f] if 0xE000 <= ord(ch) <= 0xF8FF]
                    if bad:
                        pua.append((c['code'], f, [hex(ord(b)) for b in bad]))
            a['application_notes'] = strip_all(a['application_notes'])
            bad = [ch for ch in a['application_notes'] if 0xE000 <= ord(ch) <= 0xF8FF]
            if bad:
                pua.append((s['subject'] + '/' + a['area'], 'application_notes', sorted(set(hex(ord(b)) for b in bad))))
    for p in pua:
        notes.append(f"사설영역(PUA) 문자 잔존: {p[0]} {p[1]} {p[2]}")


# ---------------------------------------------------------------- 4. 공개 API
def extract_book(book_no, pdf_path, hwp_path=None, manual_notes=()):
    """별책 PDF → SPEC.md 구조 dict. hwp_path는 인터페이스 호환용(이 6권은 2022 개정 HWP 원본이 없어 사용하지 않음)."""
    if not os.path.isfile(pdf_path):
        raise FileNotFoundError(f'PDF 없음: {pdf_path}')
    notes = []
    diag = collections.Counter()
    lines = load_lines(pdf_path)
    rows = clean_rows(lines, diag)
    subjects = parse_lines(rows, notes, diag)
    postprocess(subjects, notes)
    for x in manual_notes:
        if x not in notes:
            notes.append(x)
    if not subjects:
        raise ValueError(f'성취기준을 하나도 찾지 못함: {pdf_path}')
    return {'byeolchaek': f'별책{book_no}', 'source_file': os.path.basename(pdf_path),
            'subjects': subjects, 'notes': notes}


def summary(d):
    subjects = d['subjects']
    ncodes = sum(len(a['codes']) for s in subjects for a in s['areas'])
    nexpl = sum(1 for s in subjects for a in s['areas'] for c in a['codes'] if c['explanation'])
    nareas = sum(len(s['areas']) for s in subjects)
    nnotes = sum(1 for s in subjects for a in s['areas'] if a['application_notes'])
    return f"{d['byeolchaek']}: subjects {len(subjects)} | areas {nareas} | codes {ncodes} | expl {nexpl} | notes-areas {nnotes} | notes {len(d['notes'])}"


def run_cli(book_no, manual_notes=(), argv=None):
    ap = argparse.ArgumentParser(description=f'별책{book_no} 교육과정 PDF → 원문 구조화 JSON')
    ap.add_argument('--pdf', required=True, help='별책 PDF 경로')
    ap.add_argument('--hwp', default=None, help='(선택) HWP 경로 — 이 별책에서는 사용하지 않음')
    ap.add_argument('--out', required=True, help='출력 JSON 경로')
    args = ap.parse_args(argv)
    try:
        d = extract_book(book_no, args.pdf, args.hwp, manual_notes)
        os.makedirs(os.path.dirname(os.path.abspath(args.out)) or '.', exist_ok=True)
        with open(args.out, 'w', encoding='utf-8') as fh:
            json.dump(d, fh, ensure_ascii=False, indent=1)
        print(summary(d))
        return 0
    except Exception as e:  # noqa: BLE001
        print(f'[별책{book_no}] 실패: {type(e).__name__}: {e}', file=sys.stderr)
        return 1
