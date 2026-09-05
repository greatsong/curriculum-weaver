"""성취기준 원문 대조 공통 유틸 (정본 로드, 정규화, 코드 규칙, 별책→교과군 매핑)."""
import json, os, re, unicodedata
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
DATA = os.environ.get('AUDIT_DATA_DIR') or os.path.join(HERE, 'data')
STANDARDS_JS = os.environ.get('STANDARDS_JS') or os.path.join(ROOT, 'server', 'data', 'standards.js')
OFFICIAL_DIR = os.path.join(DATA, 'official')

def load_canonical(path=None):
    """server/data/standards.js를 직접 파싱해 (헤더, 레코드 배열, 꼬리)를 돌려준다."""
    src = open(path or STANDARDS_JS, encoding='utf-8').read()
    m = re.search(r'^(.*?export const ALL_STANDARDS = )(\[.*\])(\s*;?\s*)$', src, re.S)
    if not m: raise SystemExit(f'ALL_STANDARDS 배열을 찾지 못함: {path or STANDARDS_JS}')
    return m.group(1), json.loads(m.group(2)), m.group(3)

def write_canonical(path, head, rows, tail):
    head = re.sub(r'\* 총 \d+개 성취기준', f'* 총 {len(rows)}개 성취기준', head)
    open(path, 'w', encoding='utf-8').write(head + json.dumps(rows, ensure_ascii=False, indent=2) + tail)

_PUNCT = [('⋅','·'),('･','·'),('•','·'),('‧','·'),('∙','·'),('–','-'),('—','-'),('－','-'),('～','~'),('∼','~'),('“',''),('”',''),('"',''),('’',"'"),('‘',"'"),('「',''),('」',''),('『',''),('』','')]
def norm(s):
    """비교용 정규화: NFKC, 공백 제거, 기호 통일, 끝 마침표 무시."""
    s = unicodedata.normalize('NFKC', s or ''); s = re.sub(r'\s+', '', s)
    for a, b in _PUNCT: s = s.replace(a, b)
    return s.rstrip('.')
def norm_bullets(s):
    """불릿 기호(•·▪-)까지 제거한 정규화 — 적용 고려사항 비교용."""
    return re.sub(r'[·▪\-◦○●]', '', norm(s))
def codenorm(c): return re.sub(r'\s+', '', unicodedata.normalize('NFKC', c or ''))
CODE_RE = re.compile(r'^\[(?:\d{1,2}[가-힣A-Za-z0-9·()ⅠⅡⅢⅣⅤ]+?-\d{2}(?:-\d{2})?|[가-힣]{2,4}\s?\d{2}-\d{2}(?:-\d{2})?)\]$')
def code_prefix(cn):
    m = re.match(r'\[(\d{1,2})?([가-힣A-Za-z]+)', cn)
    return ((m.group(1) or '') + m.group(2)) if m else ''
def code_number(cn):
    m = re.match(r'\[(\d{1,2})', cn); return m.group(1) if m else None
PREFIX_LEVEL = {'2':'초등학교','4':'초등학교','6':'초등학교','9':'중학교','10':'고등학교','12':'고등학교'}
PREFIX_GRADE = {'2':'초1-2','4':'초3-4','6':'초5-6','9':'중1-3','10':'고공통','12':'고선택'}
# 별책 번호 → 정본 subject_group (None이면 과목명으로 결정)
BYEOL_GROUP = {'별책2': None, '별책5': '국어', '별책6': '도덕', '별책7': '사회', '별책8': '수학', '별책9': '과학', '별책10': None, '별책11': '체육', '별책12': '음악', '별책13': '미술', '별책14': '영어', '별책16': '제2외국어', '별책17': '한문', '별책18': '교양', '별책19': '교양', '별책20': '과학계열전문', '별책21': '체육계열전문', '별책22': '예술계열전문', '별책23': '산업수요전문'}
BYEOL_GROUPS_ALLOWED = {'별책2': {'통합교과','국어','수학','사회','도덕','과학','실과','체육','음악','미술','영어'}, '별책10': {'실과','기술·가정','정보'}}
def group_for(byeolchaek, subject):
    g = BYEOL_GROUP.get(byeolchaek)
    if g: return g
    base = re.sub(r'\(.*?\)', '', subject or '').strip()
    if base in ('바른 생활', '슬기로운 생활', '즐거운 생활'): return '통합교과'
    if '정보' in base or base in ('인공지능 기초', '데이터 과학', '소프트웨어와 생활'): return '정보'
    if base == '실과' or base.startswith('실과'): return '실과'
    if byeolchaek == '별책10': return '기술·가정'
    return base
# 같은 코드가 두 별책에 다르게 인쇄된 경우 우선할 별책(원문 오식 판단 근거를 함께 기록)
SOURCE_PREFERENCE = {
    '[6실04-06]': ('별책2', '별책10 본문은 "인식하다."(비종결형 오식), 별책2는 "인식한다."'),
}
def area_std(a, byeolchaek=None):
    """영역 표준형: 앞 번호((1)·1)·가)) 제거, 별책23은 '학습 영역 > 학습 요소' 중 학습 영역만."""
    a = (a or '').strip()
    if byeolchaek == '별책23' and ' > ' in a: a = a.split(' > ')[0]
    a = re.sub(r'^[\(（]?\s*\d+\s*[\)）.]\s*', '', a)
    a = re.sub(r'^[가-힣]\)\s*', '', a)
    return re.sub(r'\s+', ' ', a).strip()
# HWP 특수 글리프(사설영역) → 유니코드. 파서가 못 잡은 잔여분을 정본 적용 단계에서 마지막으로 치환한다.
PUA_MAP = {
    '\U000f0854': '『', '\U000f0855': '』',   # HWP 겹낫표(별책6 인문학과 윤리 해설)
}
def fix_pua(s):
    for k, v in PUA_MAP.items(): s = s.replace(k, v)
    return s
def ensure_period(s):
    """성취기준 문장은 마침표로 끝난다(원문 인쇄 누락 2건: [6도03-03]·[12심러01-02])."""
    s = s.rstrip()
    return s + '.' if s and s[-1] == '다' else s
def clean_text(s):
    """원문 텍스트 정리: 줄 끝 공백·과잉 빈 줄·연속 공백 축약(문단 줄바꿈은 유지)."""
    s = fix_pua((s or '').replace('\r', ''))
    s = re.sub(r'[ \t]+\n', '\n', s); s = re.sub(r'\n{3,}', '\n\n', s); s = re.sub(r'[ \t]{2,}', ' ', s)
    return s.strip()
_JOSA = r'(에서|에게|에|을|를|이|가|은|는|의|으로|로|과|와|도|만|까지|부터|이나|나|처럼|한다|하고|하여|하는|할|함|하도록|된다|되는|되어|될|시킨다|시키고|시키는|다\.|\.|,|\))'
def one_line(s):
    """성취기준 문장용: 문장 내부 줄바꿈 제거(조사·어미로 시작하면 붙이고 아니면 공백)."""
    s = clean_text(s)
    return ensure_period(re.sub(r'\n(\S+)', lambda m: (m.group(1) if re.match(_JOSA, m.group(1)) else ' ' + m.group(1)), s))
def bullets(s):
    """적용 고려사항 표준형: 줄마다 '• ' 접두, 빈 줄 제거."""
    lines = [re.sub(r'^[•·▪◦○●\-]\s*', '', l.strip()) for l in clean_text(s).split('\n')]
    return '\n'.join('• ' + l for l in lines if l)
def keywords_for(content):
    toks = [t for t in re.split(r'\s+', re.sub(r'[,.()·⋅‘’“”\'"]', ' ', content or '')) if len(t) >= 2]
    return toks[:5]
def category_std(byeolchaek, value):
    """교육과정 구분 표준형: 별책18(중학교 선택 교과)은 '선택', 그 외는 원문 값. 정본 어휘: 공통·일반선택·진로선택·융합선택·선택·전문공통·전공일반·전공실무."""
    if byeolchaek == '별책18': return '선택'
    return (value or '').strip()

def load_official(official_dir=None):
    """official/별책*.json 전부 → {codenorm: [record...]} (record에 byeolchaek·subject·area·content·explanation·application_notes·raw_code)."""
    import glob
    official = {}
    for p in sorted(glob.glob(os.path.join(official_dir or OFFICIAL_DIR, '별책*.json'))):
        d = json.load(open(p, encoding='utf-8')); b = d['byeolchaek']
        for s in d['subjects']:
            for a in s['areas']:
                for c in a['codes']:
                    official.setdefault(codenorm(c['code']), []).append(dict(byeolchaek=b, subject=s['subject'], school_level=s.get('school_level',''), grade_group=s.get('grade_group',''), curriculum_category=category_std(b, s.get('curriculum_category','')), area=a.get('area',''), content=c.get('content',''), explanation=c.get('explanation','') or '', application_notes=a.get('application_notes','') or '', raw_code=c['code']))
    return official
