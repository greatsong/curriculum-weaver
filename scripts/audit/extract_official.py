#!/usr/bin/env python3
"""교육부 고시 별책 PDF → 구조화 JSON 일괄 추출 (별책별 파서 디스패처).

사용:
  python3 scripts/audit/extract_official.py --pdf-dir <별책 PDF 폴더> [--books 2,5,8] [--out-dir scripts/audit/data/official]
  - 폴더에서 "[별책N]" 패턴의 PDF(같은 번호가 여럿이면 가장 큰 파일)와 같은 번호의 .hwp를 찾아 parsers/bookN.py의 extract()를 호출한다.
  - 각 결과는 validate_official.py로 검증하며, 하나라도 FAIL이면 exit 1.
파서 규격: parsers/bookN.py 가 extract(pdf_path, hwp_path=None) -> dict (SPEC.md 구조)를 export.
"""
import argparse, glob, importlib.util, json, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('--pdf-dir', required=True)
ap.add_argument('--books', default='', help='쉼표 구분 별책 번호. 비우면 parsers/에 파서가 있는 별책 전부')
ap.add_argument('--out-dir', default=os.path.join(HERE, 'data', 'official'))
args = ap.parse_args()
os.makedirs(args.out_dir, exist_ok=True)
parsers = {int(m.group(1)): p for p in glob.glob(os.path.join(HERE, 'parsers', 'book*.py')) if (m := re.search(r'book(\d+)\.py$', p))}
books = [int(b) for b in args.books.split(',') if b.strip()] or sorted(parsers)
def find_source(n, ext):
    cands = [p for p in glob.glob(os.path.join(args.pdf_dir, f'*별책{n}]*.{ext}')) + glob.glob(os.path.join(args.pdf_dir, f'*별책{n} *.{ext}'))]
    cands = [p for p in cands if re.search(rf'별책\s?{n}\]', os.path.basename(p))]
    return max(cands, key=os.path.getsize) if cands else None
failed = []
for n in books:
    if n not in parsers: print(f'별책{n}: 파서 없음(parsers/book{n}.py) — 건너뜀'); failed.append(n); continue
    pdf, hwp = find_source(n, 'pdf'), find_source(n, 'hwp')
    if not pdf: print(f'별책{n}: PDF 없음 — 건너뜀'); failed.append(n); continue
    spec = importlib.util.spec_from_file_location(f'book{n}', parsers[n]); mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    out = os.path.join(args.out_dir, f'별책{n}.json')
    data = mod.extract(pdf, hwp)
    json.dump(data, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    r = subprocess.run([sys.executable, os.path.join(HERE, 'validate_official.py'), out], capture_output=True, text=True)
    print(r.stdout.strip().splitlines()[0] if r.stdout.strip() else '', '|', 'PASS' if r.returncode == 0 else 'FAIL')
    if r.returncode != 0: failed.append(n); print(r.stdout)
print('RESULT', 'PASS' if not failed else f'FAIL {failed}')
sys.exit(0 if not failed else 1)
