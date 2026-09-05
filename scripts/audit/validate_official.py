#!/usr/bin/env python3
"""원문 구조화 JSON 검증기: 스키마 + 정본 대조(content 일치율) + 커버리지."""
import json, re, os, sys, glob, unicodedata, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import load_canonical as _lc
# 데이터 디렉터리: scripts/audit/data (환경변수 AUDIT_DATA_DIR로 변경 가능)
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
DATA = os.environ.get('AUDIT_DATA_DIR') or os.path.join(HERE, 'data')
STANDARDS_JS = os.environ.get('STANDARDS_JS') or os.path.join(ROOT, 'server', 'data', 'standards.js')
def load_canonical(path=None):
    return _lc(path)[1]
def norm(s):
    s = unicodedata.normalize('NFKC', s or ''); s = re.sub(r'\s+', '', s)
    for a, b in [('⋅','·'),('･','·'),('•','·'),('‧','·'),('∙','·'),('–','-'),('—','-'),('－','-'),('～','~'),('∼','~'),('“',''),('”',''),('"',''),('’',"'"),('‘',"'")]: s = s.replace(a, b)
    return s.rstrip('.')
def codenorm(c): return re.sub(r'\s+', '', unicodedata.normalize('NFKC', c or ''))
CODE_RE = re.compile(r'^\[(?:\d{1,2}[가-힣A-Za-z0-9·()ⅠⅡⅢⅣⅤ]+?-\d{2}(?:-\d{2})?|[가-힣]{2,4}\s?\d{2}-\d{2}(?:-\d{2})?)\]$')
path = sys.argv[1]
d = json.load(open(path, encoding='utf-8'))
canon = {codenorm(r['code']): r for r in load_canonical()}
errors = []; codes = {}
for s in d.get('subjects', []):
    for k in ('subject', 'school_level', 'grade_group', 'areas'):
        if k not in s: errors.append(f'subject missing field {k}: {s.get("subject")}')
    for a in s.get('areas', []):
        if 'area' not in a or 'codes' not in a: errors.append(f'area missing field in {s.get("subject")}')
        for c in a.get('codes', []):
            code = c.get('code', '')
            if not CODE_RE.match(codenorm(code)): errors.append(f'bad code format: {code!r}')
            if not (c.get('content') or '').strip(): errors.append(f'empty content: {code}')
            cn = codenorm(code)
            if cn in codes: errors.append(f'duplicate code: {code}')
            codes[cn] = (s['subject'], a.get('area'), c)
n_codes = len(codes)
matched = [cn for cn in codes if cn in canon]
exact = [cn for cn in matched if norm(codes[cn][2]['content']) == norm(canon[cn]['content'])]
mism = [cn for cn in matched if cn not in set(exact)]
new = [cn for cn in codes if cn not in canon]
expl = sum(1 for cn in codes if (codes[cn][2].get('explanation') or '').strip())
notes = sum(1 for s in d.get('subjects', []) for a in s.get('areas', []) if (a.get('application_notes') or '').strip())
rate = (len(exact) / len(matched) * 100) if matched else 0
print(f'{os.path.basename(path)}: 코드 {n_codes} | 정본에 있음 {len(matched)} | content 일치 {len(exact)} ({rate:.2f}%) | 불일치 {len(mism)} | 정본에 없음(신규) {len(new)} | 해설 보유 {expl} | 적용고려사항 보유 영역 {notes}')
for cn in mism[:15]:
    print(f'  ✗ {cn}\n     원문: {codes[cn][2]["content"][:110]}\n     정본: {canon[cn]["content"][:110]}')
if new: print('  신규(정본에 없음) 예:', new[:15])
for e in errors[:20]: print('  스키마 오류:', e)
ok = not errors and rate >= 99.5
print('RESULT', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
