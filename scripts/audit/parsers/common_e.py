#!/usr/bin/env python3
"""공통 유틸 (E 담당: 별책23). fitz 줄 단위 추출·줄 결합·CLI 래퍼.

- read_pdf(): 페이지별로 텍스트 줄을 (y0, x0) 순으로 정렬하고 같은 y의 조각을 합쳐
  본문/헤더/푸터로 나눈다. 줄 텍스트는 PDF 글리프의 줄 끝 공백을 그대로 보존한다
  (HWP 출력 PDF는 어절 경계에서 줄이 바뀌면 끝에 공백 글리프가 남고, 어절 중간이면 없다).
- join_text(): 위 성질을 이용해 줄을 결합한다(끝 공백 있음→띄어쓰기, 없음→붙여쓰기).
"""
import argparse, json, os, re, sys, traceback

try:
    import fitz  # PyMuPDF
except ImportError as e:  # pragma: no cover
    raise SystemExit("PyMuPDF(fitz)가 필요합니다: pip install pymupdf") from e


def read_pdf(pdf_path, header_y=60.0, footer_y=770.0, same_line_tol=2.0):
    """PDF 전체를 읽어 페이지별 dict 리스트를 돌려준다.
    각 원소: {'page': int, 'headers': [str], 'footers': [str], 'body': [line]}
    line = {'page','y0','x0','x1','size','text','gap'} (gap: 같은 페이지 직전 본문 줄과의 y 간격, 첫 줄은 None)
    """
    if not os.path.isfile(pdf_path):
        raise FileNotFoundError(f"PDF 없음: {pdf_path}")
    doc = fitz.open(pdf_path)
    pages = []
    for pno in range(len(doc)):
        raw = []
        for b in doc[pno].get_text("dict")["blocks"]:
            if b["type"] != 0:
                continue
            for l in b["lines"]:
                x0, y0, x1, y1 = l["bbox"]
                txt = "".join(s["text"] for s in l["spans"])
                if not txt.strip():
                    continue
                size = max((s["size"] for s in l["spans"] if s["text"].strip()), default=l["spans"][0]["size"])
                raw.append(dict(page=pno, y0=y0, x0=x0, x1=x1, size=size, text=txt))
        raw.sort(key=lambda r: (round(r["y0"]), r["x0"]))
        merged = []
        for r in raw:
            if merged and abs(r["y0"] - merged[-1]["y0"]) < same_line_tol:
                m = merged[-1]
                gap = r["x0"] - m["x1"]
                sep = "" if (m["text"].endswith(" ") or r["text"].startswith(" ") or gap < 1.5) else " "
                m["text"] += sep + r["text"]
                m["x1"] = max(m["x1"], r["x1"])
            else:
                merged.append(r)
        headers, footers, body = [], [], []
        prev_y = None
        for r in merged:
            if r["y0"] < header_y:
                headers.append(r["text"].strip())
            elif r["y0"] > footer_y:
                footers.append(r["text"].strip())
            else:
                r["gap"] = None if prev_y is None else r["y0"] - prev_y
                prev_y = r["y0"]
                body.append(r)
        pages.append(dict(page=pno, headers=headers, footers=footers, body=body))
    doc.close()
    return pages


def join_text(a, b):
    """줄 결합: a의 끝 공백 유무를 그대로 살린다."""
    if a.endswith(" "):
        b = b.lstrip(" ")
    return a + b


def clean(s):
    """연속 공백 1개로 축약 + 양끝 공백 제거 (문장 부호·기호는 손대지 않음)."""
    return re.sub(r" {2,}", " ", s).strip()


def run_cli(extract_fn, description):
    """--pdf/--hwp/--out 공통 CLI. 성공 exit 0, 실패 메시지+exit 1."""
    ap = argparse.ArgumentParser(description=description)
    ap.add_argument("--pdf", required=True, help="별책 PDF 경로")
    ap.add_argument("--hwp", default=None, help="보조 HWP 경로(선택)")
    ap.add_argument("--out", required=True, help="출력 JSON 경로")
    args = ap.parse_args()
    try:
        data = extract_fn(args.pdf, args.hwp)
        if not data.get("subjects"):
            raise RuntimeError("추출된 과목이 없습니다 (PDF 레이아웃이 예상과 다름)")
        out_dir = os.path.dirname(os.path.abspath(args.out))
        os.makedirs(out_dir, exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        n_codes = sum(len(a["codes"]) for s in data["subjects"] for a in s["areas"])
        print(f"OK {data['byeolchaek']}: 과목 {len(data['subjects'])} · 코드 {n_codes} → {args.out}")
        return 0
    except Exception as e:
        print(f"FAIL: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return 1
