#!/usr/bin/env python3
"""hwp_b: HWP5(.hwp) 레코드 직접 파싱 + 한글 수식 스크립트 렌더링 (별책7·8·9 담당 B 공용).

- HWP 본문 문단(표 셀 포함)을 문서 순서대로 선형화한다. 한 문단 = 한 줄.
- 수식(EQEDIT) 스크립트는 문단 안의 원래 위치에 ⟪script⟫ 마커로 삽입한다.
- 머리글/꼬리글/각주(head/foot/fn/en) 컨트롤은 건너뛴다.
의존: olefile (pip install olefile). pyhwp(hwp5txt)는 표 내용을 <표>로 대체하고 수식을 버리므로 쓰지 않는다.
"""
import re, struct, zlib
import olefile

HWPTAG_BEGIN = 0x10
T_PARA_HEADER = HWPTAG_BEGIN + 50
T_PARA_TEXT = HWPTAG_BEGIN + 51
T_CTRL_HEADER = HWPTAG_BEGIN + 55
T_LIST_HEADER = HWPTAG_BEGIN + 56
T_EQEDIT = HWPTAG_BEGIN + 72
CTRL_INLINE = {4, 5, 6, 7, 8, 9, 19, 20}
CTRL_EXT = {1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23}
SKIP_CTRL = ('head', 'foot', 'fn  ', 'en  ')

def _records(data):
    pos = 0; n = len(data); out = []
    while pos + 4 <= n:
        hdr = struct.unpack_from('<I', data, pos)[0]; pos += 4
        tag = hdr & 0x3FF; level = (hdr >> 10) & 0x3FF; size = (hdr >> 20) & 0xFFF
        if size == 0xFFF:
            size = struct.unpack_from('<I', data, pos)[0]; pos += 4
        out.append((tag, level, data[pos:pos + size])); pos += size
    return out

def _wstr(payload, pos):
    ln = struct.unpack_from('<H', payload, pos)[0]; pos += 2
    return payload[pos:pos + ln * 2].decode('utf-16le', errors='replace'), pos + ln * 2

def _eq_script(payload):
    script, _ = _wstr(payload, 4)
    return re.sub(r'\s+', ' ', script).strip()

def _tokens(payload):
    toks = []; buf = bytearray(); i = 0; n = len(payload) // 2
    def flush():
        if buf: toks.append(('t', bytes(buf).decode('utf-16le', errors='replace'))); buf.clear()
    while i < n:
        c = struct.unpack_from('<H', payload, i * 2)[0]
        if c < 32:
            flush()
            if c in CTRL_EXT: toks.append(('ext', c)); i += 8
            elif c in CTRL_INLINE: toks.append(('inl', c)); i += 8
            else: toks.append(('ch', c)); i += 1
        else:
            buf += payload[i * 2:i * 2 + 2]; i += 1
    flush(); return toks

class _Node:
    __slots__ = ('tag', 'level', 'payload', 'children')
    def __init__(self, tag, level, payload): self.tag, self.level, self.payload, self.children = tag, level, payload, []

def _tree(records):
    root = _Node(-1, -1, b''); stack = [root]
    for tag, level, payload in records:
        node = _Node(tag, level, payload)
        while stack and stack[-1].level >= level: stack.pop()
        stack[-1].children.append(node); stack.append(node)
    return root

def _ctrl_id(payload): return payload[:4][::-1].decode('latin1', errors='replace')

def _emit_para(para, out, eqs):
    text_tok = []; ctrls = [c for c in para.children if c.tag == T_CTRL_HEADER]
    for c in para.children:
        if c.tag == T_PARA_TEXT: text_tok = _tokens(c.payload)
    parts = []; ci = 0; deferred = []
    for kind, val in text_tok:
        if kind == 't': parts.append(val)
        elif kind == 'ch':
            if val == 10: parts.append(' ')
        elif kind == 'inl':
            if val == 9: parts.append('\t')
        elif kind == 'ext':
            if ci >= len(ctrls): parts.append('⟪?⟫'); continue
            ctrl = ctrls[ci]; ci += 1; cid = _ctrl_id(ctrl.payload)
            if cid == 'eqed':
                eq = [x for x in ctrl.children if x.tag == T_EQEDIT]
                if eq:
                    script = _eq_script(eq[0].payload); eqs.append(script); parts.append('⟪' + script + '⟫')
                else: parts.append('⟪?⟫')
            elif cid in SKIP_CTRL: pass
            else: deferred.append(ctrl)
    out.append(''.join(parts))
    for ctrl in deferred:
        cid = _ctrl_id(ctrl.payload).strip()
        out.append(f'⟨{cid}⟩'); _walk(ctrl, out, eqs); out.append(f'⟨/{cid}⟩')

def _walk(node, out, eqs):
    for ch in node.children:
        if ch.tag == T_PARA_HEADER: _emit_para(ch, out, eqs)
        elif ch.tag == T_LIST_HEADER: out.append('⟨cell⟩'); _walk(ch, out, eqs)
        else: _walk(ch, out, eqs)

def hwp_paragraphs(path):
    """→ (lines, equation_scripts). lines: 문단/셀 문단 한 줄씩(⟨tbl⟩ 등 마커 줄 포함)."""
    ole = olefile.OleFileIO(path)
    hdr = ole.openstream('FileHeader').read()
    compressed = struct.unpack_from('<I', hdr, 36)[0] & 1
    secs = sorted([e for e in ole.listdir() if e[0] == 'BodyText'], key=lambda e: int(re.sub(r'\D', '', e[1]) or 0))
    out = []; eqs = []
    for e in secs:
        data = ole.openstream(e).read()
        if compressed: data = zlib.decompress(data, -15)
        _walk(_tree(_records(data)), out, eqs)
    ole.close()
    return out, eqs

# ---------------------------------------------------------------- 수식 렌더링
SUP = {'0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', 'n': 'ⁿ', 'i': 'ⁱ', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'k': 'ᵏ', 'm': 'ᵐ', 'x': 'ˣ', 'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'C': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'p': 'ᵖ', 't': 'ᵗ', 'r': 'ʳ', 's': 'ˢ', 'l': 'ˡ', 'o': 'ᵒ', 'u': 'ᵘ', 'v': 'ᵛ', 'h': 'ʰ', 'j': 'ʲ', 'g': 'ᵍ', 'f': 'ᶠ', 'y': 'ʸ', 'z': 'ᶻ', 'w': 'ʷ', '∞': '^∞'}
SUB = {'0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', 'n': 'ₙ', 'i': 'ᵢ', 'k': 'ₖ', 'm': 'ₘ', 'x': 'ₓ', 'a': 'ₐ', 'e': 'ₑ', 'o': 'ₒ', 'r': 'ᵣ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'h': 'ₕ', 'l': 'ₗ', 'p': 'ₚ', 's': 'ₛ', 'j': 'ⱼ', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎'}
SYMBOLS = [
    (r'\bTIMES\b', '×'), (r'\btimes\b', '×'), (r'\bDIV\b', '÷'), (r'\bdiv\b', '÷'), (r'\bcdot\b', '·'), (r'\bCDOT\b', '·'), ('‧', '·'),
    (r'\bINF\b', '∞'), (r'\binf\b', '∞'), (r'\bINFTY\b', '∞'), (r'\binfty\b', '∞'),
    (r'\bPLUSMINUS\b', '±'), (r'\+-', '±'), (r'-\+', '∓'), (r'\bLEQ\b', '≤'), (r'\bleq\b', '≤'), (r'\bGEQ\b', '≥'), (r'\bgeq\b', '≥'), (r'\ble\b', '≤'), (r'\bge\b', '≥'),
    (r'<=', '≤'), (r'>=', '≥'), (r'\bNEQ\b', '≠'), (r'\bneq\b', '≠'), (r'!=', '≠'), (r'\bNE\b', '≠'), (r'==', '≡'), (r'//', '∥'),
    (r'\bRARROW\b', '→'), (r'\brarrow\b', '→'), (r'->', '→'), (r'\bLARROW\b', '←'), (r'\blarrow\b', '←'), (r'\bLRARROW\b', '↔'), (r'\blrarrow\b', '↔'),
    (r'\bSMALLSUM\b', '∑'), (r'\bSUM\b', '∑'), (r'\bsum\b', '∑'), (r'\bSMALLPROD\b', '∏'), (r'\bPROD\b', '∏'), (r'\bprod\b', '∏'), (r'\bINT\b', '∫'), (r'\bint\b', '∫'),
    (r'\bALPHA\b', 'Α'), (r'\balpha\b', 'α'), (r'\bBETA\b', 'Β'), (r'\bbeta\b', 'β'), (r'\bGAMMA\b', 'Γ'), (r'\bgamma\b', 'γ'),
    (r'\bDELTA\b', 'Δ'), (r'\bdelta\b', 'δ'), (r'\bTHETA\b', 'Θ'), (r'\btheta\b', 'θ'), (r'\bLAMBDA\b', 'Λ'), (r'\blambda\b', 'λ'),
    (r'\bMU\b', 'Μ'), (r'\bmu\b', 'μ'), (r'\bPI\b', 'Π'), (r'\bpi\b', 'π'), (r'\bSIGMA\b', 'Σ'), (r'\bsigma\b', 'σ'), (r'\bPHI\b', 'Φ'), (r'\bphi\b', 'φ'),
    (r'\bOMEGA\b', 'Ω'), (r'\bomega\b', 'ω'), (r'\bEPSILON\b', 'Ε'), (r'\bepsilon\b', 'ε'), (r'\bRHO\b', 'Ρ'), (r'\brho\b', 'ρ'), (r'\bTAU\b', 'Τ'), (r'\btau\b', 'τ'),
    (r'\bDEG\b', '°'), (r'\bdeg\b', '°'), (r'\bPERP\b', '⊥'), (r'\bperp\b', '⊥'), (r'\bBOT\b', '⊥'), (r'\bbot\b', '⊥'), (r'\bPARALLEL\b', '∥'), (r'\bparallel\b', '∥'),
    (r'\bIN\b', '∈'), (r'\bin\b', '∈'), (r'\bNOTIN\b', '∉'), (r'\bnotin\b', '∉'), (r'\bNSUBSET\b', '⊄'), (r'\bnsubset\b', '⊄'), (r'\bSUBSET\b', '⊂'), (r'\bsubset\b', '⊂'), (r'\bSUPSET\b', '⊃'), (r'\bsupset\b', '⊃'),
    (r'\bCUP\b', '∪'), (r'\bcup\b', '∪'), (r'\bSMALLINTER\b', '∩'), (r'\bINTER\b', '∩'), (r'\bCAP\b', '∩'), (r'\bcap\b', '∩'), (r'\bEMPTYSET\b', '∅'), (r'\bemptyset\b', '∅'),
    (r'\bTHEREFORE\b', '∴'), (r'\btherefore\b', '∴'), (r'\bDOTS\b', '…'), (r'\bdots\b', '…'), (r'\bCDOTS\b', '⋯'), (r'\bcdots\b', '⋯'), (r'\bLDOTS\b', '…'), (r'\bldots\b', '…'),
    (r'\bANGLE\b', '∠'), (r'\bangle\b', '∠'), (r'\bTRIANGLE\b', '△'), (r'\btriangle\b', '△'), (r'\bPARTIAL\b', '∂'), (r'\bpartial\b', '∂'), (r'\bNABLA\b', '∇'),
    (r'\bSQUARE\b', '□'), (r'\bsquare\b', '□'), (r'\bCIRCLE\b', '○'), (r'\bCIRC\b', '∘'), (r'\bcirc\b', '∘'), (r'\bEQUIV\b', '≡'), (r'\bequiv\b', '≡'), (r'\bAPPROX\b', '≈'), (r'\bapprox\b', '≈'),
    (r'\bSIM\b', '∼'), (r'\bsim\b', '∼'), (r'\bLLL\b', '≪'), (r'\bGGG\b', '≫'), (r'\bPRIME\b', '′'), (r'\bprime\b', '′'), (r'\bLOG\b', 'log'), (r'\bLN\b', 'ln'),
    (r'\bSIN\b', 'sin'), (r'\bCOS\b', 'cos'), (r'\bTAN\b', 'tan'), (r'\bLIM\b', 'lim'), (r'\bEXP\b', 'exp'),
]
FONT_CMDS = re.compile(r'\b(rm|it|bold|bf|sf|tt|Bold|Italic|BOLD|ITALIC|RM|IT)\b')
FUNC_RE = re.compile(r'\b(sin|cos|tan|sec|csc|cot|ln|log|lim|exp)(?=[A-Za-z(])')
BIGOP_RE = re.compile(r'([∑∏∫]|lim)([₀-₉ₐ-ₜ₊₋₌₍₎ᵢⱼₖₗₘₙₚₛₕᵣᵤᵥₓ⁰-⁹ⁿⁱ⁺⁻⁼⁽⁾ᵏᵐˣᵃᵇᶜᵈᵉᵖᵗʳˢˡᵒᵘᵛʰʲᵍᶠʸᶻʷ]+|_\([^)]*\)|\^\([^)]*\)|\^∞)+(?=\S)')
ACCENT = {'bar': '̅', 'overline': '̅', 'vec': '⃗', 'hat': '̂', 'dot': '̇', 'ddot': '̈', 'tilde': '̃', 'underline': '̲', 'dyad': '⃡', 'arch': '̑'}

def _matching(s, i):
    d = 0
    for j in range(i, len(s)):
        if s[j] == '{': d += 1
        elif s[j] == '}':
            d -= 1
            if d == 0: return j
    return len(s) - 1

def _split(s):
    toks = []; i = 0
    while i < len(s):
        c = s[i]
        if c.isspace(): i += 1; continue
        if c == '{':
            j = _matching(s, i); toks.append(s[i:j + 1]); i = j + 1
        elif c.isalnum() or c == '.':
            j = i
            while j < len(s) and (s[j].isalnum() or s[j] == '.'): j += 1
            toks.append(s[i:j]); i = j
        else: toks.append(c); i += 1
    return toks

def _sb(g): return g[1:-1] if g.startswith('{') and g.endswith('}') else g
def _sup(t): return ''.join(SUP[ch] for ch in t) if all(ch in SUP for ch in t) else ('^(' + t + ')' if len(t) > 1 else '^' + t)
def _sub(t): return ''.join(SUB[ch] for ch in t) if all(ch in SUB for ch in t) else ('_(' + t + ')' if len(t) > 1 else '_' + t)
def _paren(t): return bool(re.search(r'[+\-=<>±×÷ ,]', t)) and not (t.startswith('(') and t.endswith(')'))

def _glue(parts):
    s = ''
    for p in parts:
        if not p: continue
        if s and re.search(r'[A-Za-z0-9\)⁰-₟²³¹ⁿ]$', s) and re.match(r'[A-Za-z0-9\(√]', p) and not re.search(r'[a-z]{2,}$', s): s += p
        elif s and re.search(r'[a-z]{2,}$', s) and re.match(r'[A-Za-z0-9\(]', p): s += ' ' + p
        else: s += p
    return s

def _expr(s):
    toks = _split(s); out = []; i = 0
    while i < len(toks):
        t = toks[i]; tl = t.lower()
        if t.startswith('{'):
            inner = _expr(_sb(t))
            if i + 2 < len(toks) and toks[i + 1].lower() == 'over':
                den = _expr(_sb(toks[i + 2]))
                out.append(('(' + inner + ')' if _paren(inner) else inner) + '/' + ('(' + den + ')' if _paren(den) else den)); i += 3; continue
            out.append(inner); i += 1; continue
        if tl == 'sqrt':
            if i + 1 < len(toks) and toks[i + 1].startswith('{'):
                inner = _expr(_sb(toks[i + 1]))
                out.append('√' if not inner else ('√(' + inner + ')' if len(inner) > 1 else '√' + inner)); i += 2; continue
            out.append('√'); i += 1; continue
        if tl == 'root' and i + 3 < len(toks) and toks[i + 2].lower() == 'of':
            idx = _expr(_sb(toks[i + 1])); inner = _expr(_sb(toks[i + 3]))
            out.append(_sup(idx) + ('√(' + inner + ')' if len(inner) > 1 else '√' + inner)); i += 4; continue
        if t == '^' and i + 1 < len(toks): out.append(_sup(_expr(_sb(toks[i + 1])))); i += 2; continue
        if t == '_' and i + 1 < len(toks): out.append(_sub(_expr(_sb(toks[i + 1])))); i += 2; continue
        if tl == 'over' and out and i + 1 < len(toks):
            num = out.pop(); den = _expr(_sb(toks[i + 1]))
            out.append(('(' + num + ')' if _paren(num) else num) + '/' + ('(' + den + ')' if _paren(den) else den)); i += 2; continue
        if tl in ACCENT and i + 1 < len(toks):
            inner = _expr(_sb(toks[i + 1])).strip(); mark = ACCENT[tl]
            if tl == 'arch' and len(inner) == 2: out.append(inner[0] + '͡' + inner[1]); i += 2; continue
            out.append(''.join(ch + mark for ch in inner) if len(inner) <= 6 else '‾' + inner); i += 2; continue
        if tl in ('matrix', 'pmatrix', 'bmatrix', 'dmatrix', 'cases', 'eqalign', 'pile', 'lpile', 'rpile') and i + 1 < len(toks):
            rows = [' '.join(_expr(c).strip() for c in r.split('&')) for r in re.split(r'#', _sb(toks[i + 1]))]
            out.append(('(' if tl == 'pmatrix' else '') + '; '.join(r.strip() for r in rows) + (')' if tl == 'pmatrix' else '')); i += 2; continue
        out.append(t); i += 1
    return _glue(out)

def render_equation(script):
    """한글 수식 스크립트 → 1줄 표기. 의미 보존 우선(분수 a/b, 근호 √( ), 첨자 유니코드, ×, ∑ 등)."""
    s = script.replace('\n', ' ').replace('`', ' ').replace('~', ' ')
    s = FONT_CMDS.sub('', s)
    for pat, rep in SYMBOLS: s = re.sub(pat, rep, s)
    s = re.sub(r'\b(LEFT|left)\s*\{', '⦃', s); s = re.sub(r'\b(RIGHT|right)\s*\}', '⦄', s)
    s = re.sub(r'\b(LEFT|left|RIGHT|right)\s*', '', s)
    out = _expr(s).strip().replace('⦃', '{').replace('⦄', '}')
    out = FUNC_RE.sub(lambda m: m.group(1) + ' ', out)
    out = BIGOP_RE.sub(lambda m: m.group(0) + ' ', out)
    if out.strip() == '||': out = '| |'
    return out.strip()

EQ_MARK = re.compile(r'⟪(.*?)⟫')

def render_inline(text):
    """⟪script⟫ 마커를 렌더링 결과로 치환. → (text, [scripts])"""
    scripts = EQ_MARK.findall(text)
    out = EQ_MARK.sub(lambda m: render_equation(m.group(1)), text)
    out = re.sub(r' {2,}', ' ', out)
    return out.strip(), scripts
