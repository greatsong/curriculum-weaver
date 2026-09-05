#!/usr/bin/env python3
"""별책23 경영·금융 전문 교과 교육과정 → SPEC.md 구조 JSON.

CLI : python3 book23.py --pdf <PDF경로> [--hwp <HWP경로>] --out <출력JSON>
API : extract(pdf_path, hwp_path=None) -> dict
결정적(임의성·시간 의존 없음). HWP는 이 별책에 수식/PUA가 없어 받기만 하고 쓰지 않는다.
레이아웃 규칙은 README-E.md 참고.
"""
import collections, os, re, sys

try:
    from .common_e import read_pdf, join_text, clean, run_cli
except ImportError:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from common_e import read_pdf, join_text, clean, run_cli

BOOK = "별책23"

# ───────────────────────── 원문 오기 정정표 ─────────────────────────
# 성취기준 목록의 코드 오기. 키 = (과목명, 원문 코드, content 시작 구절) → 정정 코드.
# 정정된 항목은 _orig_code에 원문 표기를 보존한다. 표에 없는 이상 징후는 정정하지 않고 notes에만 남긴다.
CODE_CORRECTIONS = {
    # 근거: 부록 '과목명 축약 글자'표에서 노무 관리 = 노관, 같은 과목의 나머지 29개 코드가 모두 [노관 …],
    #       같은 영역 적용 고려사항 불릿이 '• [노관 02-01-04]'로 인용.
    ("노무 관리", "[노무 02-01-04]", "근로자 참여 및 협력 증진에 관한 법률에 따라 결"): "[노관 02-01-04]",
    # 근거: '2) FTA 원산지 판정 요소 관리 > 라) FTA BOM 구성하기'에 [원지 02-04-02]가 두 번 표기됨
    #       (첫째 'FTA BOM의 작성 원칙과 기준에 따라…', 둘째 'FTA BOM상의 항목별 입증 서류…').
    #       둘째는 직전 코드의 다음 번호이며 같은 영역 불릿이 '• [원지 02-04-03]'으로 인용.
    ("원산지 관리", "[원지 02-04-02]", "FTA BOM상의 항목별 입증 서류"): "[원지 02-04-03]",
}
# 적용 고려사항 불릿이 인용한 코드의 약어 오기. 키 = (과목명, 인용 코드[공백 제거]) → 실제 코드.
# 근거: 인용 번호가 같은 영역의 성취기준 번호와 1:1로 일치하고, 인용 약어는 해당 과목 약어가 아님.
CITE_CORRECTIONS = {
    ("유통 관리", "[유통05-01-01]"): "[유관 05-01-01]",   # '유통'은 어느 과목의 약어도 아님(유통 일반=유일, 유통 관리=유관)
    ("유통 관리", "[유통05-01-02]"): "[유관 05-01-02]",
    ("유통 관리", "[유통05-01-03]"): "[유관 05-01-03]",
    ("유통 관리", "[유통05-01-04]"): "[유관 05-01-04]",
}
# 정정하지 않는 인용 오기(기록용): 회계 정보 처리 시스템 '1) … > 나) 기업의 기초 정보 등록'의 불릿 '• [회원 04-02-01] 회계 프로그램의
#   기본 기능…기초 정보를 오류 없이 등록…'은 약어·번호가 모두 그 영역 코드([회정 01-02-01])와 다르다. 내용상 01-02-01 해설로 보이나
#   두 겹의 오기라 추정 매핑하지 않고 application_notes에만 둔다(과거 초안이 번호만 보고 다른 영역 [회정 04-02-01]에 붙였던 것은 제거).
# 부록 축약표와 본문 코드가 다른 과목 (정정하지 않음, 기록용): 전자 상거래 일반 — 부록 '전상', 본문 '[전일 …]'.

# ───────────────────────── 정규식 ─────────────────────────
CODE_RE = re.compile(r"^\[([가-힣]{2,4})\s*(\d{2}-\d{2}(?:-\d{2})?)\]\s?(.*)$", re.S)
CITE_RE = re.compile(r"\[([가-힣]{2,4})\s*(\d{2}-\d{2}(?:-\d{2})?)\]")
CITE_PREFIX_RE = re.compile(r"^((?:\[[가-힣]{2,4}\s*\d{2}-\d{2}(?:-\d{2})?\]\s*[,，]?\s*)+)(.*)$", re.S)
BULLET_RE = re.compile(r"^[•∙‧ㆍ]\s*(.*)$", re.S)
H1_RE = re.compile(r"^\d+\)\s*\S")          # '1) 학습 영역'
H2_RE = re.compile(r"^[가-힣]\)\s*\S")       # '가) 학습 요소'
TITLE_RE = re.compile(r"^(\d+)\.\s+(.+?)\s*$")  # 21pt 과목 표제 '1. 총무'
MARKER_RE = re.compile(r"^<\s*성취기준\s*적용\s*시\s*고려\s*사항\s*>")
SEC_START_RE = re.compile(r"^나\.\s*성취기준")
SEC_END_RE = re.compile(r"^\d+\.\s*(교수|평가)")
HDR_RE = re.compile(r"^(전문 공통|전공 일반|전공 실무) 과목\s*[-–]\s*\d+\.\s*(.+?)\s*$")
CAT_MAP = {"전문 공통": "전문공통", "전공 일반": "전공일반", "전공 실무": "전공실무"}
CAT_SEQ = ["전문공통", "전공일반", "전공실무"]   # 표제 번호가 1로 되돌아갈 때마다 다음 구분(헤더 없을 때 폴백)


def _codenorm(c):
    return re.sub(r"\s", "", c)


class _Parser:
    def __init__(self):
        self.subjects, self.notes = [], []
        self.cur = None          # 현재 과목
        self.in_sec = False      # '나. 성취기준' 안인가
        self.cur_area = None
        self.area1 = None
        self.para = None         # 진행 중 문단 {'kind': 'code'|'bullet', ...}
        self.title_resets = 0

    # ── 문단/영역/과목 마감 ──
    def flush_para(self):
        if self.para is None:
            return
        txt = clean(self.para["text"])
        if self.para["kind"] == "code":
            self.cur_area["codes"].append({"code": self.para["code"], "content": txt, "explanation": ""})
        else:
            self.cur_area["bullets"].append(txt)
        self.para = None

    def new_area(self, name):
        self.flush_area()
        self.cur_area = {"area": name, "codes": [], "bullets": []}

    def flush_area(self):
        if self.cur_area and (self.cur_area["codes"] or self.cur_area["bullets"]):
            self.cur["_areas"].append(self.cur_area)
        self.cur_area = None

    def ensure_area(self, where):
        if self.cur_area is None:
            self.notes.append(f"{self.cur['subject']}: 영역 소제목 없이 {where} 등장 → '(영역 미상)'으로 수용")
            self.new_area(self.area1 or "(영역 미상)")

    def finish_subject(self):
        self.flush_para(); self.flush_area()
        cur, notes = self.cur, self.notes
        if cur is None:
            return
        subj = cur["subject"]
        # 1) 코드 오기 정정표 적용 + 표 밖 이상 징후 기록
        for a in cur["_areas"]:
            for c in a["codes"]:
                for (s_, orig, prefix), fixed in CODE_CORRECTIONS.items():
                    if s_ == subj and c["code"] == orig and c["content"].startswith(prefix):
                        c["_orig_code"] = c["code"]; c["code"] = fixed
                        notes.append(f"{subj} '{a['area']}' 코드 {orig}('{prefix[:20]}…')를 정정표에 따라 {fixed}로 정정. 원문 표기는 _orig_code 참고")
        all_codes = {}
        abbrs = collections.Counter()
        for a in cur["_areas"]:
            for c in a["codes"]:
                k = _codenorm(c["code"])
                if k in all_codes:
                    notes.append(f"{subj} 코드 {c['code']}가 중복 표기됨(정정표에 없어 원문 그대로 둠 — 확인 필요)")
                all_codes[k] = c
                abbrs[re.match(r"\[([가-힣]+)", c["code"]).group(1)] += 1
        if abbrs:
            dom = sorted(abbrs.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
            for ab, n in sorted(abbrs.items()):
                if ab != dom:
                    notes.append(f"{subj}: 과목 약어({dom})와 다른 약어 {ab} 코드 {n}개가 정정표 밖에 있음 — 원문 그대로 둠, 확인 필요")
        # 2) 적용 고려사항 불릿 → explanation 매핑
        for a in cur["_areas"]:
            area_codes = {_codenorm(c["code"]): c for c in a["codes"]}
            for btxt in a["bullets"]:
                m = CITE_PREFIX_RE.match(btxt)
                if not m:
                    notes.append(f"{subj} '{a['area']}' 불릿 1개는 코드 없이 시작('{btxt[:25]}…') → application_notes에만 수록")
                    continue
                cites = CITE_RE.findall(m.group(1)); rest = m.group(2).strip()
                if not m.group(1)[-1].isspace():
                    # '[A], [B]는 …'처럼 코드 뒤에 조사가 바로 붙어 코드가 문장 성분인 경우 → 전문 유지
                    rest = btxt.strip()
                    notes.append(f"{subj} '{a['area']}' 불릿 '{btxt[:30]}…'은 코드 뒤에 조사가 바로 붙어 explanation에 코드 접두를 포함한 전문을 넣음")
                targets = []
                for ab, num in cites:
                    key = f"[{ab}{num}]"
                    if key in area_codes:
                        targets.append(area_codes[key]); continue
                    fixed = CITE_CORRECTIONS.get((subj, key))
                    if fixed and _codenorm(fixed) in area_codes:
                        targets.append(area_codes[_codenorm(fixed)])
                        notes.append(f"{subj} '{a['area']}' 불릿의 [{ab} {num}]은(는) 약어 오기 → 정정표에 따라 {fixed}에 매핑")
                        continue
                    if key in all_codes:
                        notes.append(f"{subj} '{a['area']}' 불릿이 다른 영역의 {all_codes[key]['code']}을(를) 인용(원문 코드 오기로 추정) → 해설 매핑하지 않고 application_notes에만 둠")
                        continue
                    notes.append(f"{subj} '{a['area']}' 불릿이 인용한 [{ab} {num}]에 해당하는 성취기준이 이 과목에 없어 해설 매핑 생략")
                if len(cites) > 1:
                    notes.append(f"{subj} '{a['area']}' 불릿 1개가 {len(cites)}개 코드를 병기({', '.join('[' + x + ' ' + y + ']' for x, y in cites)}) → 각 코드 explanation에 동일 해설 삽입")
                for c in targets:
                    if c["explanation"]:
                        c["explanation"] += "\n" + rest
                        notes.append(f"{c['code']} 불릿이 2개 이상 → explanation에 줄바꿈으로 이어 붙임")
                    else:
                        c["explanation"] = rest
        cur["areas"] = [{"area": a["area"], "codes": a["codes"], "application_notes": "\n".join(a["bullets"])} for a in cur["_areas"]]
        del cur["_areas"]
        self.subjects.append(cur); self.cur = None

    # ── 줄 단위 상태 기계 ──
    def feed(self, body):
        N = len(body)
        for i, r in enumerate(body):
            t = r["text"].strip(); x0 = r["x0"]; size = r["size"]
            if size >= 20:                                  # 21pt 표제
                tm = TITLE_RE.match(t)
                self.finish_subject()
                if not tm:                                  # '과목명 축약 글자' 등 → 과목 구간 밖
                    continue
                num = int(tm.group(1))
                if num == 1:
                    self.title_resets += 1
                self.cur = {"subject": tm.group(2), "school_level": "고등학교", "grade_group": "기타",
                            "curriculum_category": CAT_SEQ[min(self.title_resets, 3) - 1], "_areas": []}
                self.in_sec = False; self.cur_area = None; self.area1 = None; self.para = None
                continue
            if self.cur is None:
                continue
            if not self.in_sec:
                if size >= 11.5 and SEC_START_RE.match(t):
                    self.in_sec = True
                continue
            if size >= 13 and SEC_END_RE.match(t):          # '3. 교수·학습' → 절 종료
                self.flush_para(); self.flush_area(); self.in_sec = False
                continue
            if MARKER_RE.match(t):
                self.flush_para(); self.ensure_area("적용 고려사항 표식")
                continue
            cm = CODE_RE.match(t)
            if cm:
                self.flush_para(); self.ensure_area("성취기준 코드")
                self.para = {"kind": "code", "code": f"[{cm.group(1)} {cm.group(2)}]",
                             "text": cm.group(3) + (" " if r["text"].endswith(" ") else "")}
                continue
            bm = BULLET_RE.match(t)
            if bm and x0 < 95:
                self.flush_para(); self.ensure_area("불릿")
                self.para = {"kind": "bullet", "text": bm.group(1) + (" " if r["text"].endswith(" ") else "")}
                continue
            if H1_RE.match(t) and x0 < 92 and size > 10.5:
                self.flush_para(); self.area1 = t; self.new_area(t)
                continue
            if H2_RE.match(t) and 92 <= x0 < 110 and size > 10.5:
                # 불릿 이어짐 줄(x0≈98)과 같은 위치이므로: 직전 문단이 불릿이면 줄 간격·다음 줄이 코드인지로 판별
                nxt = body[i + 1]["text"].strip() if i + 1 < N else ""
                next_is_code = bool(CODE_RE.match(nxt)); gap = r["gap"]
                is_heading = (self.para is None) or self.para["kind"] == "code" or next_is_code or gap is None or gap > 26
                if is_heading:
                    self.flush_para(); self.new_area(f"{self.area1} > {t}" if self.area1 else t)
                    continue
            if self.para is not None:                       # 이어지는 줄
                self.para["text"] = join_text(self.para["text"], r["text"])
            else:
                self.notes.append(f"{self.cur['subject']} p{r['page'] + 1}: 소속 불명 줄 '{t[:40]}…' (무시)")
        self.finish_subject()


def extract(pdf_path, hwp_path=None):
    """SPEC.md 구조의 dict 반환. hwp_path는 인터페이스 호환용(이 별책은 미사용)."""
    pages = read_pdf(pdf_path)
    header_cat = {}
    body = []
    for p in pages:
        for h in p["headers"]:
            hm = HDR_RE.match(h)
            if hm:
                header_cat.setdefault(hm.group(2), CAT_MAP[hm.group(1)])
        body.extend(p["body"])
    ps = _Parser()
    ps.feed(body)
    for s in ps.subjects:                                   # 구분: 페이지 헤더가 우선
        hc = header_cat.get(s["subject"])
        if hc and hc != s["curriculum_category"]:
            ps.notes.append(f"{s['subject']}: 표제 순서 기반 구분({s['curriculum_category']})과 페이지 헤더({hc})가 달라 헤더를 채택")
            s["curriculum_category"] = hc
        elif not hc:
            ps.notes.append(f"{s['subject']}: 페이지 헤더에서 구분을 찾지 못해 표제 순서 기반 구분 사용")
    no_expl = collections.Counter(s["subject"] for s in ps.subjects for a in s["areas"] for c in a["codes"] if not c["explanation"])
    head = [
        "이 별책에는 '(가) 성취기준 해설' 절이 없고 '<성취기준 적용 시 고려 사항>'만 있으며, 그 불릿은 대부분 '• [코드] …' 형태로 개별 성취기준에 붙어 있음. 스펙의 explanation 정의는 (가) 해설이나, 정본(standards.json)의 explanation이 이 불릿 본문과 동일하므로 코드가 명시된 불릿 본문(코드 접두 제거)을 해당 코드 explanation에 넣었고, 영역별 application_notes에도 불릿 전체(불릿 기호 제거, 코드 접두 유지)를 줄바꿈으로 이어 넣음. explanation을 비워야 한다면 후처리로 제거 가능",
        "area 표기: '나. 성취기준' 아래 '1) 학습 영역'과 하위 '가) 학습 요소' 소제목이 모두 있으면 '1) 영역 > 가) 요소'로 결합(적용 고려사항 블록이 학습 요소 단위로 붙기 때문), 하위 소제목이 없으면 '1) 영역'만 사용",
        "줄바꿈 결합: PDF(fitz) 줄 끝의 공백 유무를 그대로 살려 결합(줄 끝 공백 있음→띄어쓰기, 없음→붙여쓰기). 연속 공백은 1개로 축약",
        "과목 수는 원문 목차 기준 41개(전문 공통 3·전공 일반 16·전공 실무 22). 부록 '과목명 축약 글자'표는 성취기준 목록이 아니므로 추출 범위 밖(부록 예시 코드 [관일 05-02] 미포함)",
        "부록 축약 글자표는 '전자 상거래 일반'의 약어를 '전상'으로 적었으나 본문 성취기준 코드는 전부 [전일 …]이므로 본문 표기를 그대로 둠",
        "금융 일반 '4) 증권 > 다) 증권 거래 절차'의 성취기준 목록은 [금일 04-03-01]~[금일 04-03-03] 3개뿐이며, 적용 고려사항 불릿만 [금일 04-03-04]를 인용함(원문에 04-03-04 성취기준 문장 없음)",
        "적용 고려사항 불릿이 없는 성취기준은 원문 자체에 해당 코드 불릿이 없어 explanation을 비움(파싱 누락 아님): " + ", ".join(f"{k} {v}" for k, v in sorted(no_expl.items(), key=lambda kv: (-kv[1], kv[0]))),
        "비즈니스 커뮤니케이션 [비커 03-01-02]는 원문 불릿 2개가 모두 03-01-02를 인용(첫 불릿은 문맥상 03-01-01 해설로 보이나 원문 그대로 두 불릿을 03-01-02 explanation에 이어 붙임, 03-01-01은 비움)",
    ]
    return {"byeolchaek": BOOK, "source_file": os.path.basename(pdf_path), "subjects": ps.subjects, "notes": head + ps.notes}


if __name__ == "__main__":
    sys.exit(run_cli(extract, "별책23 경영·금융 전문 교과 교육과정 성취기준 구조화 추출"))
