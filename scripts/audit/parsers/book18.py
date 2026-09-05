#!/usr/bin/env python3
"""별책18 「중학교 선택 교과 교육과정」(환경·보건·진로와 직업) → 원문 구조화 JSON (SPEC.md 스키마).

사용:
  python3 parsers/book18.py --pdf <PDF> [--hwp <HWP>] --out <JSON>      # exit 0/1
  from book18 import extract; d = extract(pdf_path, hwp_path=None)

소스 전략:
  * HWP가 있으면 hwp5html 렌더(xhtml)의 문단을 1차 소스로 쓴다. 성취기준이 표 안에 있는데
    hwp5txt는 표를 <표>로 생략하고, PDF 텍스트는 줄바꿈 위치의 띄어쓰기를 복원할 수 없기 때문이다
    (Hancom PDF는 단어 경계든 어절 중간이든 줄 끝에 공백 글리프를 넣어 구분 불가).
  * PDF는 항상 파싱해 교차검증(공백 제거 비교)에 쓰고, HWP가 없으면 PDF 문단이 그대로 출력된다
    (줄바꿈 위치는 공백으로 이어 붙임 → notes에 '띄어쓰기 불확실' 기록).
의존: poppler `pdftotext`, pyhwp `hwp5html`(HWP 사용 시), python3 표준 라이브러리만.
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile, unicodedata
from html.parser import HTMLParser

BYEOLCHAEK = '별책18'
SUBJECT_BY_PREFIX = {'환': '환경', '보': '보건', '진로': '진로와 직업'}
CODE_BODY = r'9(?:환|보|진로)\d{2}-\d{2}'
CODE_HEAD = re.compile(r'^(\[\s*)?\[(?P<code>' + CODE_BODY + r')\]\s*')      # "[[9환01-01]" 이중 괄호 오탈자 허용
AREA_RE = re.compile(r'^\((\d+)\)\s*(\S.*)$')
EXPL_HEAD = re.compile(r'^\(가\)\s*성취기준\s*해설\s*$')
NOTE_HEAD = re.compile(r'^\(나\)\s*성취기준\s*적용\s*시\s*고려\s*사항\s*$')  # 진로는 "고려사항"(붙여 씀)
BLOCK_START = '나. 성취기준'
END_RE = re.compile(r'^3\.\s*교수')
FOOTER_RE = re.compile(r'^(중학교 선택 교과 교육과정|.{0,12}교육과정 [-–] .+|\d{1,3})$')


# ---------------------------------------------------------------- 외부 도구
def _run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, **kw)
    if r.returncode != 0:
        raise RuntimeError(f'{cmd[0]} 실패(exit {r.returncode}): {r.stderr.decode("utf-8", "replace")[:300]}')
    return r.stdout


def pdf_text(pdf_path):
    exe = os.environ.get('PDFTOTEXT') or shutil.which('pdftotext')
    if not exe:
        raise RuntimeError('pdftotext를 찾을 수 없음 (poppler 설치 또는 PDFTOTEXT 환경변수)')
    return _run([exe, '-enc', 'UTF-8', pdf_path, '-']).decode('utf-8')


def _hwp5html_cmd():
    exe = os.environ.get('HWP5HTML') or shutil.which('hwp5html')
    if exe:
        return [exe]
    try:
        import hwp5.hwp5html  # noqa: F401
        return [sys.executable, '-m', 'hwp5.hwp5html']
    except Exception:
        raise RuntimeError('hwp5html을 찾을 수 없음 (pip install pyhwp 또는 HWP5HTML 환경변수)')


class _ParaCollector(HTMLParser):
    """hwp5html xhtml에서 <p> 리프 문단 텍스트를 문서 순서대로 수집(표 셀 안의 <p> 포함)."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.paras = [], []

    def handle_starttag(self, tag, attrs):
        if tag == 'p':
            self.stack.append([])

    def handle_endtag(self, tag):
        if tag == 'p' and self.stack:
            t = ''.join(self.stack.pop()).replace('\r', ' ').replace('\n', ' ')
            t = re.sub(r'[ \t　]+', ' ', t).strip()
            if t:
                self.paras.append(t)

    def handle_data(self, data):
        if self.stack:
            self.stack[-1].append(data)


def hwp_paragraphs(hwp_path):
    with tempfile.TemporaryDirectory(prefix='book18_hwp_') as td:
        _run(_hwp5html_cmd() + ['--output', td, hwp_path])
        xhtml = os.path.join(td, 'index.xhtml')
        if not os.path.exists(xhtml):
            raise RuntimeError('hwp5html 출력에 index.xhtml이 없음')
        pc = _ParaCollector()
        pc.feed(open(xhtml, encoding='utf-8').read())
    return pc.paras


def pdf_paragraphs(text):
    """pdftotext 출력 → 문단 목록. 머리글/꼬리글/쪽번호 제거, 줄바꿈은 공백으로 이어 붙임.
    문단 시작 규칙: 영역 머리글 "(N) ", 불릿 "•", "(가)/(나)", "나. 성취기준", "3. 교수…",
    그리고 성취기준 표 안(영역 머리글 뒤 ~ (가) 전)에서는 "[9…]" 코드 줄."""
    NEWP = re.compile(r'^(\(\d+\)\s|•|\(가\)|\(나\)|나\. 성취기준|3\. 교수)')
    CODE_LINE = re.compile(r'^\[\s*\[?9')
    paras, buf, in_table = [], None, False
    for ln in text.split('\n'):
        s = ln.strip()
        if not s or FOOTER_RE.match(s):
            continue
        if re.match(r'^\(\d+\)\s', s):
            in_table = True
        elif re.match(r'^\((가|나)\)', s):
            in_table = False
        if NEWP.match(s) or (in_table and CODE_LINE.match(s)):
            if buf:
                paras.append(buf)
            buf = s
        else:
            buf = (buf + ' ' + s) if buf else s
    if buf:
        paras.append(buf)
    return paras


# ---------------------------------------------------------------- 문법 파서
def _leading_codes(t, notes):
    """문단 앞머리에 병기된 코드를 모두 뽑고 나머지 본문을 돌려준다.
    첫 코드는 무조건 소비, 이후 코드는 "] " 또는 "],"처럼 구분자가 뒤따를 때만 병기로 본다
    ("[9보02-01] [9보01-04]에서 학습한…"의 두 번째 코드는 본문 속 참조)."""
    codes = []
    while True:
        tail = r'\s*[,，]?\s*' if not codes else r'(?=\s|[,，])\s*[,，]?\s*'
        m = re.match(r'^(\[\s*)?\[(' + CODE_BODY + r')\]' + tail, t)
        if not m:
            break
        if m.group(1):
            notes.append(f'원문 오탈자: 해설 불릿이 "[[{m.group(2)}]"로 이중 괄호 표기 → [{m.group(2)}]로 매핑')
        codes.append('[' + m.group(2) + ']')
        t = t[m.end():]
    return codes, t


def parse_blocks(paras, notes, src):
    """문단 목록에서 '나. 성취기준' ~ '3. 교수⋅학습 및 평가' 블록을 과목별로 파싱."""
    subjects, i = [], 0
    while i < len(paras):
        if paras[i].strip() != BLOCK_START:
            i += 1
            continue
        i += 1
        areas, cur, state, last, prefix = [], None, 'codes', None, None
        while i < len(paras) and not END_RE.match(paras[i]):
            t = re.sub(r'^•\s*', '', paras[i]).strip()
            i += 1
            if AREA_RE.match(t) and not CODE_HEAD.match(t):
                cur = {'area': t, 'codes': [], '_notes': []}
                areas.append(cur); state, last = 'codes', None
                continue
            if EXPL_HEAD.match(t):
                state, last = 'expl', None
                continue
            if NOTE_HEAD.match(t):
                state = 'notes'
                continue
            if cur is None:
                notes.append(f'[{src}] 영역 머리글 전 문단 무시: {t[:60]}')
                continue
            if state == 'codes':
                m = CODE_HEAD.match(t)
                if m:
                    code = '[' + m.group('code') + ']'
                    prefix = re.match(r'9(환|보|진로)', m.group('code')).group(1)
                    cur['codes'].append({'code': code, 'content': t[m.end():].strip(), 'explanation': ''})
                    last = cur['codes'][-1]
                elif last is not None:
                    last['content'] += ' ' + t
                    notes.append(f'[{src}] {last["code"]} content가 두 문단으로 나뉘어 있어 이어 붙임')
                else:
                    notes.append(f'[{src}] 코드 앞 문단 무시({cur["area"]}): {t[:60]}')
            elif state == 'expl':
                codes, body = _leading_codes(t, notes)
                if codes:
                    body = '' if body.strip() in ('없음', '없음.') else body.strip()
                    if len(codes) > 1:
                        notes.append(f'해설 병기: {", ".join(codes)} 에 같은 해설 적용')
                    targets = []
                    for c in codes:
                        tgt = next((x for x in cur['codes'] if x['code'] == c), None)
                        if tgt is None:
                            notes.append(f'[{src}] 해설 코드 {c}가 영역 {cur["area"]} 코드 목록에 없음 → 무시')
                            continue
                        tgt['explanation'] = (tgt['explanation'] + ' ' + body).strip() if tgt['explanation'] else body
                        targets.append(tgt)
                    last = targets
                elif t in ('없음', '없음.'):
                    pass
                elif isinstance(last, list) and last:
                    for x in last:
                        x['explanation'] += ' ' + t
                    notes.append(f'[{src}] 해설 문단 연속: {[x["code"] for x in last]} 에 이어 붙임: {t[:40]}')
                else:
                    notes.append(f'[{src}] 해설 코드 없는 문단({cur["area"]}): {t[:60]}')
            elif state == 'notes':
                cur['_notes'].append(t)
        for a in areas:
            a['application_notes'] = '\n'.join(a.pop('_notes'))
        if prefix is None:
            notes.append(f'[{src}] 코드가 하나도 없는 성취기준 블록 무시')
            continue
        subjects.append({
            'subject': SUBJECT_BY_PREFIX[prefix], 'school_level': '중학교', 'grade_group': '중1-3',
            'curriculum_category': '공통', 'areas': areas,
        })
    return subjects


# ---------------------------------------------------------------- 교차검증
def _nz(s):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', s or ''))


def cross_check(primary, secondary):
    """두 파싱 결과를 공백 제거 기준으로 비교. (종류, 키, 1차, 2차) 목록 반환."""
    sec = {}
    for si, s in enumerate(secondary):
        for a in s['areas']:
            sec[('notes', si, a['area'])] = a['application_notes']
            for c in a['codes']:
                sec[('content', c['code'])] = c['content']
                sec[('expl', c['code'])] = c['explanation']
    out = []
    for si, s in enumerate(primary):
        for a in s['areas']:
            for c in a['codes']:
                for kind, val in (('content', c['content']), ('expl', c['explanation'])):
                    if _nz(val) != _nz(sec.get((kind, c['code']), '')):
                        out.append((kind, c['code'], val, sec.get((kind, c['code']), '')))
            k = ('notes', si, a['area'])
            if _nz(a['application_notes']) != _nz(sec.get(k, '')):
                out.append(('notes', f'{s["subject"]} {a["area"]}', a['application_notes'], sec.get(k, '')))
    return out


# ---------------------------------------------------------------- 공개 API
def extract(pdf_path, hwp_path=None):
    notes = []
    pdf_subjects = parse_blocks(pdf_paragraphs(pdf_text(pdf_path)), notes, 'PDF')
    if hwp_path:
        hwp_notes = []
        subjects = parse_blocks(hwp_paragraphs(hwp_path), hwp_notes, 'HWP')
        mism = cross_check(subjects, pdf_subjects)
        notes = hwp_notes + [n for n in notes if n.startswith('[PDF]')]  # PDF 쪽 구조 경고만 남김
        notes.append(f'1차 소스=HWP(hwp5html 문단), PDF 교차검증 불일치 {len(mism)}건')
        for kind, key, h, p in mism:
            notes.append(f'PDF≠HWP {kind} {key}: HWP「{h[:80]}」 PDF「{p[:80]}」')
    else:
        subjects = pdf_subjects
        codes = [c['code'] for s in subjects for a in s['areas'] for c in a['codes']]
        notes.append('HWP 미제공: PDF 텍스트만 사용. 줄바꿈 위치는 공백으로 이어 붙였으므로 '
                     f'어절 중간 줄바꿈이 있던 곳의 띄어쓰기는 불확실 (코드 {len(codes)}건 전부 해당 가능)')
    seen, dedup = set(), []
    for n in notes:
        if n not in seen:
            seen.add(n); dedup.append(n)
    return {
        'byeolchaek': BYEOLCHAEK,
        'source_file': os.path.basename(pdf_path),
        'subjects': subjects,
        'notes': dedup,
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--pdf', required=True)
    ap.add_argument('--hwp')
    ap.add_argument('--out', required=True)
    a = ap.parse_args(argv)
    try:
        d = extract(a.pdf, a.hwp)
    except Exception as e:  # 도구 부재·변환 실패 등
        print(f'ERROR: {e}', file=sys.stderr)
        return 1
    n = sum(len(x['codes']) for s in d['subjects'] for x in s['areas'])
    if n == 0:
        print('ERROR: 추출된 성취기준 코드가 0건', file=sys.stderr)
        return 1
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    for s in d['subjects']:
        k = sum(len(x['codes']) for x in s['areas'])
        e = sum(1 for x in s['areas'] for c in x['codes'] if c['explanation'])
        print(f'{s["subject"]}: 영역 {len(s["areas"])}, 코드 {k}, 해설 {e}, 고려사항 {sum(1 for x in s["areas"] if x["application_notes"])}/{len(s["areas"])}')
    bad = [x for x in d['notes'] if x.startswith('PDF≠HWP')]
    print(f'코드 {n}건 → {a.out} | notes {len(d["notes"])}건 (PDF≠HWP {len(bad)}건)')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
