#!/usr/bin/env python3
"""common_b: 교육부 고시 별책 PDF(+HWP) → 성취기준 구조화 JSON 공통 로직 (별책7 사회·8 수학·9 과학 담당 B).

흐름
1. pdftotext(-enc UTF-8, 비-layout)로 PDF 텍스트 추출(임시 디렉터리).
2. 줄 단위 상태기계: 과목 제목 → '나. 성취기준' 섹션 → 학년군/과목 표지 → 영역 '(n) …'(번호 연속성 검사) →
   코드 행 [코드] 본문(연속행 결합) → '(가) 성취기준 해설' 불릿(선행 코드 → 각 코드에 매핑) → '(나) 적용 시 고려 사항' 불릿.
   머리글/쪽번호/<탐구 활동> 블록 제거.
3. HWP가 있으면 hwp_b로 문단 선형화(표 셀 포함, 수식 ⟪script⟫) 후 같은 상태기계로 파싱해 병합:
   - PDF 텍스트가 1차 원문. HWP는 (a) 줄바꿈 지점의 띄어쓰기 판정, (b) 수식(사설영역 글리프) 복원에만 쓴다.
   - PDF·HWP가 공백 외 문자에서 다르면 PDF를 유지하고 notes에 기록.
4. SPEC 스키마로 출력. 정본은 참조하지 않는다(검증기에서만 사용).
"""
import os, re, sys, json, subprocess, tempfile, unicodedata, difflib

CODE_RE = re.compile(r'^\[(\d{1,2}[^\]\s]{0,14}?\d\d[-–]\d\d(?:[-–]\d\d)?)\]\s*(.*)$')
CODE_ANY = re.compile(r'\[(\d{1,2}[^\]\s]{0,14}?\d\d[-–]\d\d(?:[-–]\d\d)?)\]')
LEVEL_RE = re.compile(r'^\[(초등학교|중학교)\s*(\d)\s*[~∼]\s*(\d)학년\]$')
AREA_RE = re.compile(r'^\((\d{1,2})\)\s+(\S.*)$')
EXPL_RE = re.compile(r'^\(가\)\s*성취기준\s*해설\s*$')
NOTES_RE = re.compile(r'^\(나\)\s*성취기준\s*적용\s*시\s*고려\s*사항\s*$')
STD_START_RE = re.compile(r'^나\.\s*성취기준\s*$')
SECTION_END_RE = re.compile(r'^(3\.\s*교수|가\.\s*교수|가\.\s*내용 체계|나\.\s*평가|다\.\s*교수|4\.\s*)')
INTRO_RE = re.compile(r'^(1\.\s*성격 및 목표|교육과정 설계의 개요)\s*$')
HEADER_RE = re.compile(r'^([가-힣]+과 교육과정|공통 교육과정|선택 중심 교육과정\s*[–-].*)$')
PAGENUM_RE = re.compile(r'^\d{1,3}$')
BULLET_RE = re.compile(r'^[•●▪◦]\s*(.*)$')
INQUIRY_RE = re.compile(r'^<탐구 활동>\s*$')
SUBMARK_RE = re.compile(r'^[\[<]\s*([^\]>]{1,20}?)\s*[\]>]$')
GROUP_MARK_RE = re.compile(r'^<[^>]{1,20}>$')
TOC_MARK = {'[공통 교육과정]': '공통', '[공통 과목]': '공통', '[일반 선택 과목]': '일반선택', '[진로 선택 과목]': '진로선택', '[융합 선택 과목]': '융합선택'}
SENT_END_RE = re.compile(r'(다|음|것|함)\.\s*$')
EXPL_PREFIX_RE = re.compile(r'^((?:\[[^\]\s]{3,24}\](?:\s*(?:,|、|와|과|및|∼|~|·|⋅)?\s*(?=\[))?)+)')
PARTICLE_RE = re.compile(r'^(은|는|이|가|을|를|와|과|의|에서는|에서|에는|에|도|로|으로|처럼)\s+')
BRACKET_TYPO_RE = re.compile(r'\[(\d{1,2}[가-힣]+\([가-힣]+)\](?=\d)')  # "[9사(일사]11-01]" → "[9사(일사)11-01]"
PUA = re.compile(r'[-]')
NOSPACE_BEFORE = re.compile(r'^[\)\]\.,;:’”%!?]')
NOSPACE_AFTER = re.compile(r'[\(\[⋅·‘“/]$')

def norm_code(c): return unicodedata.normalize('NFKC', c).replace('–', '-').replace(' ', '')
def wsfree(s): return re.sub(r'\s+', '', unicodedata.normalize('NFKC', s or ''))
def korean_only(s): return re.sub(r'[^가-힣]', '', s or '')

def grade_from_code(code):
    m = re.match(r'\[(\d{1,2})', code)
    p = m.group(1) if m else ''
    return {'2': ('초1-2', '초등학교'), '4': ('초3-4', '초등학교'), '6': ('초5-6', '초등학교'), '9': ('중1-3', '중학교'), '10': ('고공통', '고등학교'), '12': ('고선택', '고등학교')}.get(p, ('기타', ''))

def run_pdftotext(pdf_path):
    with tempfile.TemporaryDirectory() as td:
        out = os.path.join(td, 'text.txt')
        subprocess.run(['pdftotext', '-enc', 'UTF-8', pdf_path, out], check=True)
        return open(out, encoding='utf-8').read().split('\n')

def parse_toc(lines):
    cat = None; m = {}
    for ln in lines[:120]:
        s = ln.strip()
        if s in TOC_MARK: cat = TOC_MARK[s]; continue
        if s == '[선택 중심 교육과정]': cat = None; continue
        if cat and '·' in s:
            name = re.sub(r'\s*[·⋅…\.]{3,}.*$', '', s).strip()
            for part in re.split(r'\s*,\s*', name):
                if part: m[part.replace(' ', '')] = cat
    return m

def clean_lines(raw_lines, mode):
    out = []; prev_header = False
    for i, ln in enumerate(raw_lines):
        s = ln.strip()
        if mode == 'pdf':
            if PAGENUM_RE.match(s): continue
            if HEADER_RE.match(s): prev_header = True; continue
            if prev_header and s == '-': prev_header = False; continue
            prev_header = False if s else prev_header
        if s.startswith('⟨') and s.endswith('⟩'): continue
        out.append((i + 1, s))
    return out

def expand_code_token(tok):
    t = tok.replace('–', '-')
    if '-' not in t: return [f'[{t}]']
    base, last = t.rsplit('-', 1)
    if re.search(r'[∼~]', last):
        a, b = re.split(r'[∼~]', last, 1)
        if a.isdigit() and b.isdigit(): return [f'[{base}-{i:02d}]' for i in range(int(a), int(b) + 1)]
        return [f'[{t}]']
    if ',' in last:
        return [f'[{base}-{int(x):02d}]' if x.strip().isdigit() else f'[{base}-{x.strip()}]' for x in last.split(',')]
    if last.isdigit() and len(last) == 1: last = '0' + last
    return [f'[{base}-{last}]']

def _loose(c):
    return re.sub(r'(?<=\D)0(?=\d)', '', re.sub(r'[^0-9가-힣A-Za-zⅠⅡⅢ]', '', c))

class Parser:
    """mode: 'pdf'(연속행 결합) | 'para'(HWP, 한 줄=한 문단)"""
    def __init__(self, mode, toc, volume, notes):
        self.mode, self.toc, self.volume, self.notes = mode, toc, volume, notes
        self.subjects = []; self.units = {}
        self.cur_title = None; self.cur_sub = None; self.cur_level = None
        self.in_std = False; self.state = None; self.area = None
        self.cur_unit = None; self.cur_parts = []; self.last_plain = None; self.expected_area = 1

    def get_subject(self):
        name = self.cur_sub or self.cur_title; key = (name, self.cur_level)
        for s in self.subjects:
            if s['_key'] == key: return s
        s = {'_key': key, 'subject': name, 'school_level': '', 'grade_group': '', 'curriculum_category': self.toc.get((name or '').replace(' ', ''), ''), 'areas': []}
        m = LEVEL_RE.match(self.cur_level) if self.cur_level else None
        if m:
            s['school_level'] = m.group(1)
            s['grade_group'] = {('초등학교', '1'): '초1-2', ('초등학교', '3'): '초3-4', ('초등학교', '5'): '초5-6', ('중학교', '1'): '중1-3'}.get((m.group(1), m.group(2)), '')
        self.subjects.append(s); return s

    def new_area(self, title):
        self.flush_unit(); s = self.get_subject()
        self.area = {'area': title, 'codes': [], '_expl': {}, '_notes': [], '_area_expl': []}
        s['areas'].append(self.area); self.state = 'codes'

    def start_unit(self, kind, key, text):
        self.flush_unit(); self.cur_unit = (kind, key); self.cur_parts = [text]

    def add_cont(self, text):
        if self.cur_unit is None or self.mode == 'para': return False
        if self.volume == 8 and self.cur_unit[0] == 'code' and self.cur_parts and SENT_END_RE.search(self.cur_parts[-1]): return False
        self.cur_parts.append(text); return True

    def resolve_code(self, code):
        area_codes = [norm_code(c['code']) for c in self.area['codes']]; nc = norm_code(code)
        if nc in area_codes: return nc
        cands = [ac for ac in area_codes if _loose(ac) == _loose(nc)]
        if len(cands) == 1: self.notes.append(f'해설 코드 표기 오류 보정: {code} → {cands[0]}'); return cands[0]
        return nc

    def flush_unit(self):
        if self.cur_unit is None: return
        kind, key = self.cur_unit; parts = self.cur_parts; self.cur_unit = None; self.cur_parts = []
        if self.area is None: return
        txt = ' '.join(p.strip() for p in parts).strip()
        if kind == 'code':
            item = {'code': key, 'content': txt, 'explanation': '', '_parts': parts}
            self.area['codes'].append(item); self.units[('code', norm_code(key))] = item
        elif kind == 'expl':
            if txt in ('없음', '• 없음', '해당 없음', '없음.'): return
            t2 = BRACKET_TYPO_RE.sub(r'[\1)', txt)
            if t2 != txt: self.notes.append(f'해설 코드 괄호 오타 보정: {txt[:24]} → {t2[:24]}'); txt = t2
            m = EXPL_PREFIX_RE.match(txt)
            if not m:
                self.area['_area_expl'].append(txt); self.notes.append(f'코드 없는 해설(영역 수준, area_explanation에 보존): {txt[:50]}…'); return
            prefix = m.group(1); body = txt[m.end():].strip()
            pm = PARTICLE_RE.match(body)
            if pm: body = body[pm.end():]
            codes = []
            for t in re.findall(r'\[([^\]\s]{3,24})\]', prefix):
                ex = expand_code_token(t)
                if len(ex) > 1 or ex[0] != f'[{t}]': self.notes.append(f'해설 코드 표기 확장/보정: [{t}] → {", ".join(ex)}')
                codes += ex
            if re.search(r'\]\s*[∼~]\s*\[', prefix) and len(codes) == 2:
                codes = self.expand_range(codes[0], codes[1]); self.notes.append(f'해설 범위 표기 확장: {prefix.strip()} → {len(codes)}개')
            codes = [self.resolve_code(c) for c in codes]
            if len(codes) > 1: self.notes.append(f'해설 병기: {prefix.strip()} → 각 코드({len(codes)}개)에 동일 해설 적용')
            for c in codes:
                self.area['_expl'].setdefault(c, []).append({'text': body, 'parts': parts})
                self.units.setdefault(('expl', c), []).append({'text': body, 'parts': parts})
        elif kind == 'notes':
            if txt in ('없음', '해당 없음', '없음.'): return
            self.area['_notes'].append({'text': txt, 'parts': parts})

    def expand_range(self, a, b):
        codes = [norm_code(c['code']) for c in self.area['codes']]; a, b = norm_code(a), norm_code(b)
        if a in codes and b in codes and codes.index(a) <= codes.index(b): return codes[codes.index(a):codes.index(b) + 1]
        return [a, b]

    def feed(self, lines):
        for ln_no, s in lines: self.handle(ln_no, s)
        self.flush_unit()

    def handle(self, ln_no, s):
        if not s: return
        if INTRO_RE.match(s):
            lp = self.last_plain
            if lp and len(lp) <= 30 and not re.search(r'[.。다]$', lp) and not re.match(r'^[\(\[<\d]', lp):
                if s.startswith('교육과정 설계') or self.cur_title != lp:
                    self.cur_title = lp; self.cur_sub = None; self.cur_level = None
            self.end_section(); self.last_plain = None; return
        if STD_START_RE.match(s):
            self.flush_unit(); self.in_std = True; self.state = None; self.area = None; self.expected_area = 1; return
        m = SUBMARK_RE.match(s)
        if m and not LEVEL_RE.match(s) and s not in TOC_MARK and s != '[선택 중심 교육과정]':
            name = m.group(1).replace(' ', '')
            if name in self.toc:
                self.flush_unit(); self.cur_sub = name; self.cur_level = None; self.area = None; self.expected_area = 1
                if self.in_std: self.state = None
                return
        if LEVEL_RE.match(s):
            self.flush_unit(); self.cur_level = s; self.area = None; self.state = None; self.expected_area = 1; return
        if not self.in_std: self.last_plain = s; return
        if SECTION_END_RE.match(s): self.end_section(); self.last_plain = s; return
        if INQUIRY_RE.match(s): self.flush_unit(); self.state = 'skip'; return
        if EXPL_RE.match(s): self.flush_unit(); self.state = 'expl'; return
        if NOTES_RE.match(s): self.flush_unit(); self.state = 'notes'; return
        if GROUP_MARK_RE.match(s):  # <지리 영역>/<일반사회 영역> 등 영역 그룹 표시 → 영역 번호 재시작 (PDF·HWP 공통)
            self.flush_unit(); self.expected_area = 1; self.state = None; return
        am = AREA_RE.match(s)
        if am and not CODE_RE.match(s):
            n = int(am.group(1))
            if n == self.expected_area or (self.state is None and n == 1):
                self.new_area(s); self.expected_area = n + 1; return
            if self.state in (None, 'codes') and self.cur_unit is None:
                self.notes.append(f'영역 번호 불연속으로 무시된 소제목 후보: {s[:40]} (line {ln_no}, 기대 {self.expected_area})')
        if self.state in (None, 'codes'):
            cm = CODE_RE.match(s)
            if cm:
                if self.area is None: self.new_area('(영역 미상)'); self.notes.append(f'영역 제목 없이 코드 등장: {s[:40]} (line {ln_no})')
                self.state = 'codes'; code = '[' + cm.group(1) + ']'
                if '–' in code: self.notes.append(f'코드 엔대시 표기 정규화: {code} → {code.replace("–", "-")} (line {ln_no})'); code = code.replace('–', '-')
                self.start_unit('code', code, cm.group(2)); return
            if self.area is None: return
            if not self.add_cont(s) and self.mode == 'pdf' and self.cur_unit is not None and self.volume != 8:
                self.notes.append(f'연속행 버림(문장 종결 후): {s[:40]} (line {ln_no})')
            return
        if self.state in ('expl', 'notes'):
            bm = BULLET_RE.match(s)
            if bm: self.start_unit(self.state, None, bm.group(1)); return
            if self.mode == 'para': self.start_unit(self.state, None, s); return
            if not self.add_cont(s) and not PUA.fullmatch(s.replace(' ', '')): self.notes.append(f'{"해설" if self.state == "expl" else "고려사항"} 연속행 버림: {s[:40]} (line {ln_no})')
            return

    def end_section(self):
        self.flush_unit(); self.in_std = False; self.state = None; self.area = None

    def finalize(self):
        for s in self.subjects:
            for a in s['areas']:
                for c in a['codes']:
                    g, lvl = grade_from_code(c['code'])
                    if not s['grade_group']: s['grade_group'] = g
                    if not s['school_level']: s['school_level'] = lvl
                for k in a['_expl']:
                    if k not in [norm_code(c['code']) for c in a['codes']]: self.notes.append(f'해설 코드가 영역 코드 목록에 없음: {k} (영역 {a["area"]})')
            del s['_key']
        self.subjects = [s for s in self.subjects if any(a['codes'] for a in s['areas'])]
        return self.subjects

def parse_lines(raw_lines, mode, volume, notes, toc=None):
    toc = toc if toc is not None else parse_toc(raw_lines)
    p = Parser(mode, toc, volume, notes); p.feed(clean_lines(raw_lines, mode))
    return {'subjects': p.finalize(), 'units': p.units, 'toc': toc}

# ------------------------------------------------------------------ 줄바꿈 결합
def build_corpus(raw_lines, hwp_lines=None):
    """띄어쓰기 판정용 토큰 집합: 행 내부 토큰(행 첫/끝 토큰 제외) + HWP 문단 토큰 전체"""
    toks = set()
    for ln in raw_lines:
        parts = ln.split()
        for t in parts[1:-1]: toks.add(t.strip('.,;:)(‘’“”\'"'))
    for ln in hwp_lines or []:
        for t in ln.split(): toks.add(t.strip('.,;:)(‘’“”\'"'))
    return toks

def join_parts(parts, corpus, ref=None):
    """PDF 연속행 결합. ref(HWP 문단 텍스트)가 있으면 접합 지점의 띄어쓰기를 ref로 판정, 없으면 코퍼스 휴리스틱."""
    txt = parts[0].strip()
    for p in parts[1:]:
        p = p.strip()
        if not p: continue
        if not txt: txt = p; continue
        la = txt.split()[-1]; fb = p.split()[0]
        if la.endswith('-') and re.match(r'[A-Za-z]', fb): txt = txt[:-1] + p; continue
        if NOSPACE_AFTER.search(la) or NOSPACE_BEFORE.match(fb): txt = txt + p; continue
        if ref is not None:
            ns, sp = la + fb, la + ' ' + fb
            has_ns, has_sp = ns in ref, sp in ref
            if has_ns and not has_sp: txt = txt + p; continue
            if has_sp and not has_ns: txt = txt + ' ' + p; continue
        core_b = fb.rstrip('.,;:)’”\'"')
        if re.search(r'[가-힣]$', la) and re.match(r'[가-힣]', fb) and (la + core_b) in corpus: txt = txt + p; continue
        txt = txt + ' ' + p
    return txt

# ------------------------------------------------------------------ 병합/출력
def _align(pdf_items, hwp_items):
    """불릿 정렬: 한글만 남긴 텍스트의 유사도(>0.8)로 단조 매칭. → [hwp index or None]"""
    res = []; j0 = 0
    for x in pdf_items:
        kx = korean_only(x); best = None; best_r = 0.0
        for j in range(j0, len(hwp_items)):
            r = difflib.SequenceMatcher(None, kx, korean_only(hwp_items[j])).ratio()
            if r > best_r: best_r, best = r, j
            if r > 0.98: break
        if best is not None and best_r > 0.8: res.append(best); j0 = best + 1
        else: res.append(None)
    return res

def assemble(pdf, hwp, corpus, notes, volume):
    """pdf/hwp: parse_lines 결과. 반환: subjects(스키마), diff 통계"""
    from hwp_b import render_inline
    hunits = hwp['units'] if hwp else {}
    hnotes = {}
    if hwp:
        for s in hwp['subjects']:
            for a in s['areas']: hnotes.setdefault(wsfree(a['area']), []).append([b['text'] for b in a['_notes']])
    stats = {'version_diff': [], 'eq_units': 0, 'hwp_guided': 0, 'heuristic': 0}
    def finish(parts, ref_text):
        """PDF 부분행 → 최종 텍스트. ref_text: 대응 HWP 문단(없으면 None)"""
        if ref_text is not None and '⟪' not in ref_text and wsfree(ref_text) == wsfree(' '.join(parts)):
            out = join_parts(parts, corpus, ref=ref_text); stats['hwp_guided'] += 1
            if re.sub(r'\s+', ' ', out) != re.sub(r'\s+', ' ', ref_text).strip(): stats['version_diff'].append((out, ref_text.strip()))
            return out, None
        pdf_txt = join_parts(parts, corpus); stats['heuristic'] += 1
        if ref_text is not None and ('⟪' in ref_text or PUA.search(pdf_txt)):
            rendered, scripts = render_inline(ref_text); stats['eq_units'] += 1
            return rendered, scripts
        return pdf_txt, None
    subjects = []
    for s in pdf['subjects']:
        areas = []
        for a in s['areas']:
            codes = []
            for c in a['codes']:
                nc = norm_code(c['code']); h = hunits.get(('code', nc))
                content, scripts = finish(c['_parts'], h['content'] if h else None)
                if h is None and hwp: stats.setdefault('pdf_only_code', []).append(c['code'])
                elif h and scripts is None and wsfree(content) != wsfree(h['content']): stats.setdefault('text_diff', []).append((c['code'], content, h['content']))
                if scripts: notes.append(f'{c["code"]} content 수식 복원(HWP 스크립트): ' + ' | '.join(scripts))
                ex_items = a['_expl'].get(nc, [])
                hx = hunits.get(('expl', nc), []) if hwp else []
                ex_texts = []
                for i, e in enumerate(ex_items):
                    ref = hx[i]['text'] if i < len(hx) else None
                    t, sc = finish(e['parts'], ref)
                    # 해설 본문: 선행 코드 표기 제거 후의 텍스트만 남긴다
                    t = _strip_prefix(t)
                    if sc: notes.append(f'{c["code"]} explanation 수식 복원(HWP 스크립트): ' + ' | '.join(sc))
                    ex_texts.append(t)
                codes.append({'code': c['code'], 'content': content, 'explanation': '\n'.join(ex_texts)})
            pb = [b['parts'] for b in a['_notes']]; pt = [b['text'] for b in a['_notes']]
            cands = hnotes.get(wsfree(a['area']), []); best = None
            if cands and pt:
                scored = sorted(cands, key=lambda cand: -sum(1 for i in _align(pt, cand) if i is not None))
                best = scored[0]
            newb = []
            if best is not None:
                al = _align(pt, best)
                for parts, j in zip(pb, al):
                    t, sc = finish(parts, best[j] if j is not None else None)
                    if sc: notes.append(f'{s["subject"]} {a["area"]} 고려사항 수식 복원(HWP 스크립트): ' + ' | '.join(sc))
                    newb.append(t)
            else:
                for parts in pb: newb.append(finish(parts, None)[0])
            area_out = {'area': a['area'], 'codes': codes, 'application_notes': '\n'.join(newb)}
            if a['_area_expl']: area_out['area_explanation'] = '\n'.join(a['_area_expl'])
            areas.append(area_out)
        subjects.append({'subject': s['subject'], 'school_level': s['school_level'], 'grade_group': s['grade_group'], 'curriculum_category': s['curriculum_category'], 'areas': areas})
    return subjects, stats

def _strip_prefix(t):
    t2 = BRACKET_TYPO_RE.sub(r'[\1)', t)
    m = EXPL_PREFIX_RE.match(t2)
    if not m: return t
    body = t2[m.end():].strip(); pm = PARTICLE_RE.match(body)
    return body[pm.end():] if pm else body

def extract_volume(volume, pdf_path, hwp_path=None):
    """별책 PDF(+HWP) → SPEC JSON dict. 결정적."""
    notes = []
    raw = run_pdftotext(pdf_path)
    hwp_lines = None; hwp = None
    if hwp_path:
        from hwp_b import hwp_paragraphs
        hwp_lines, _eqs = hwp_paragraphs(hwp_path)
    corpus = build_corpus(raw, hwp_lines)
    pdf = parse_lines(raw, 'pdf', volume, notes)
    if hwp_lines is not None:
        hwp = parse_lines(hwp_lines, 'para', volume, [], toc=pdf['toc'])
    subjects, stats = assemble(pdf, hwp, corpus, notes, volume)
    # 요약 노트
    notes.insert(0, '해설(explanation)은 불릿 선두의 코드 표기와 그에 직결된 조사(은/는/이/가 등)를 제거한 본문. 병기·범위 표기는 각 코드에 복제.')
    notes.insert(1, 'application_notes는 (나) 불릿을 불릿 글리프 없이 줄바꿈(\\n)으로 연결. 코드 없는 (가) 불릿은 area_explanation에 보존.')
    if hwp_lines is not None:
        notes.insert(2, f'HWP 병합: 줄바꿈 접합 띄어쓰기를 HWP로 판정한 단위 {stats["hwp_guided"]}, 휴리스틱 {stats["heuristic"]}, 수식 복원 단위 {stats["eq_units"]}. 공백 외 문자 차이는 PDF 우선.')
        vd = stats['version_diff']
        if vd:
            notes.append(f'PDF·HWP 띄어쓰기/판본 차이 {len(vd)}건(PDF 유지). 예: ' + ' ‖ '.join(_diff_snip(p, h) for p, h in vd[:12]))
        for code, p, h in stats.get('text_diff', [])[:20]: notes.append(f'{code} PDF·HWP 본문 문자 차이(PDF 유지): PDF「{p[:60]}」 HWP「{h[:60]}」')
        if stats.get('pdf_only_code'): notes.append('HWP에 없는 코드(PDF만): ' + ', '.join(stats['pdf_only_code'][:30]))
    else:
        notes.insert(2, '줄바꿈 접합 띄어쓰기는 문서 내 토큰 코퍼스 휴리스틱(HWP 없음).')
    # 잔존 사설영역 문자 점검
    for s in subjects:
        for a in s['areas']:
            for c in a['codes']:
                for f in ('content', 'explanation'):
                    if PUA.search(c[f]): notes.append(f'{c["code"]} {f}에 사설영역 문자 잔존: ' + repr(PUA.findall(c[f])[:6]))
                    if re.search(r'[\U000f0000-\U000ffffd]', c[f]): notes.append(f'{c["code"]} {f}에 HWP 특수기호(보조 사설영역) 잔존: 원문 그대로 둠')
            if PUA.search(a['application_notes']): notes.append(f'{s["subject"]} {a["area"]} application_notes에 사설영역 문자 잔존: ' + repr(PUA.findall(a['application_notes'])[:6]))
            if re.search(r'[\U000f0000-\U000ffffd]', a['application_notes']): notes.append(f'{s["subject"]} {a["area"]} application_notes에 HWP 특수기호(보조 사설영역 U+F0040 등, PDF는 HyhwpEQ 글리프) 잔존: 원문 그대로 둠(닮음 기호로 추정되나 미확정)')
    seen = set(); uniq = []
    for n in notes:
        if n not in seen: seen.add(n); uniq.append(n)
    return {'byeolchaek': f'별책{volume}', 'source_file': os.path.basename(pdf_path), 'subjects': subjects, 'notes': uniq}

def _diff_snip(p, h):
    p1 = re.sub(r'\s+', ' ', p).strip(); h1 = re.sub(r'\s+', ' ', h).strip()
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, p1, h1).get_opcodes():
        if op != 'equal': return f'PDF「{p1[max(0, i1 - 5):i2 + 5]}」/HWP「{h1[max(0, j1 - 5):j2 + 5]}」'
    return ''

def cli(volume, argv=None):
    import argparse
    ap = argparse.ArgumentParser(description=f'별책{volume} 성취기준 구조화 추출')
    ap.add_argument('--pdf', required=True); ap.add_argument('--hwp'); ap.add_argument('--out', required=True)
    a = ap.parse_args(argv)
    try:
        if not os.path.isfile(a.pdf): raise FileNotFoundError(a.pdf)
        if a.hwp and not os.path.isfile(a.hwp): raise FileNotFoundError(a.hwp)
        d = extract_volume(volume, a.pdf, a.hwp)
        n = sum(len(ar['codes']) for s in d['subjects'] for ar in s['areas'])
        if n == 0: raise RuntimeError('추출된 성취기준 코드가 없습니다')
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        with open(a.out, 'w', encoding='utf-8') as f: json.dump(d, f, ensure_ascii=False, indent=1)
        print(f'별책{volume}: subjects {len(d["subjects"])}, codes {n}, notes {len(d["notes"])} → {a.out}')
        return 0
    except Exception as e:
        print(f'ERROR: {type(e).__name__}: {e}', file=sys.stderr); return 1
