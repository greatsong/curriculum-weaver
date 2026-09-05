#!/usr/bin/env python3
"""원문 구조화 JSON을 근거로 정본(server/data/standards.js)을 결점 0 상태로 재작성한다.
원칙: 원문 verbatim. 정본에만 있는 필드(keywords)는 규칙으로 재생성. 기존 레코드 순서 유지, 신규는 뒤에 추가.
사용: python3 scripts/audit/apply_official.py [--dry-run] [--add-missing] [--prune-unsourced] [--out <standards.js>]
  --add-missing     원문에 있고 정본에 없는 코드를 추가 (과목·학년군·교과군은 별책/코드 규칙으로 결정)
  --prune-unsourced 원문 별책 범위 안인데 원문에 없는 정본 코드를 제거 (목록 출력; Supabase 삭제는 별도)
로그: data/apply_log.json
"""
import json, os, sys, collections, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
ap = argparse.ArgumentParser(); ap.add_argument('--dry-run', action='store_true'); ap.add_argument('--add-missing', action='store_true'); ap.add_argument('--prune-unsourced', action='store_true'); ap.add_argument('--out', default=STANDARDS_JS)
args = ap.parse_args()
head, rows, tail = load_canonical()
cmap = {}  # codenorm(code) → [정본 레코드...] (복합 키: 충돌 코드는 과목별로 여러 행)
for r in rows: cmap.setdefault(codenorm(r['code']), []).append(r)
official = load_official(); scope_prefixes = {code_prefix(cn) for cn in official}
changes = collections.Counter(); log = []
def distinct_contents(recs): return {norm(x['content']) for x in recs}
def pick(recs, canon_row=None):
    """같은 코드가 여러 별책에 있을 때 레코드 선택.
    1) 정본 과목(subject)과 같은 과목의 레코드 → 2) 정본 문장과 같은 문장의 레코드 → 3) 해설·고려사항이 풍부한 순(초등은 교과 별책 > 별책2).
    코드 충돌(서로 다른 과목이 같은 코드를 씀: 12심독·12스문)이면 정본 과목과 맞는 쪽만 고르고, 못 고르면 None."""
    pref = SOURCE_PREFERENCE.get(codenorm(recs[0]['raw_code']))
    if pref:
        chosen = [x for x in recs if x['byeolchaek'] == pref[0]]
        if chosen: recs = chosen
    if canon_row:
        same_subj = [x for x in recs if norm(x['subject']) == norm(canon_row.get('subject', ''))]
        if same_subj: recs = same_subj
        elif len(distinct_contents(recs)) > 1:
            same_content = [x for x in recs if norm(x['content']) == norm(canon_row.get('content', ''))]
            if not same_content: return None
            recs = same_content
    return sorted(recs, key=lambda x: (x['byeolchaek'] == '별책2', -len(x['explanation']), -len(x['application_notes'])))[0]
for r in rows:
    cn = codenorm(r['code']); pre = code_number(cn)
    if pre:
        if r.get('school_level') != PREFIX_LEVEL[pre]: log.append(('school_level', r['code'], r.get('school_level'), PREFIX_LEVEL[pre])); r['school_level'] = PREFIX_LEVEL[pre]; changes['school_level'] += 1
        if r.get('grade_group') != PREFIX_GRADE[pre]: log.append(('grade_group', r['code'], r.get('grade_group'), PREFIX_GRADE[pre])); r['grade_group'] = PREFIX_GRADE[pre]; changes['grade_group'] += 1
    recs = official.get(cn)
    if not recs: continue
    if r.get('key') and '|' in r['key']:  # 복합 키 레코드: 같은 과목의 원문만
        recs = [x for x in recs if norm(x['subject']) == norm(r.get('subject', ''))] or recs
    o = pick(recs, r)
    if o is None: changes['코드충돌_보류'] += 1; log.append(('collision', r['code'], r.get('subject'), sorted({x['subject'] for x in recs}))); continue
    for field, val in (('content', one_line(o['content'])), ('area', area_std(o['area'], o['byeolchaek'])), ('explanation', clean_text(o['explanation'])), ('application_notes', bullets(o['application_notes']))):
        if field == 'area' and not val: continue
        if val != (r.get(field) or ''): log.append((field, r['code'], (r.get(field) or '')[:100], val[:100])); r[field] = val; changes[field] += 1
    if o.get('curriculum_category') and not r.get('curriculum_category'): r['curriculum_category'] = o['curriculum_category']; changes['curriculum_category'] += 1
    kw = keywords_for(r['content'])
    if not r.get('keywords'): r['keywords'] = kw; changes['keywords'] += 1
added, pruned = [], []
if args.add_missing:
    by_subject = collections.defaultdict(list)
    for cn, recs in official.items():
        have = cmap.get(cn, [])
        if have and len(distinct_contents(recs)) <= 1: continue  # 이미 수록(단일 문장)
        if cn in SOURCE_PREFERENCE and have: continue
        if not have:
            by_subject[(recs[0]['byeolchaek'], recs[0]['subject'])].append(pick(recs)); continue
        # 코드 충돌: 정본에 없는 과목의 원문 레코드를 복합 키로 추가
        for x in recs:
            if any(norm(x['content']) == norm(h['content']) or norm(x['subject']) == norm(h.get('subject', '')) for h in have): continue
            if any(norm(x['content']) == norm(y['content']) for y in recs if y is not x and any(norm(y['content']) == norm(h['content']) for h in have)): continue
            x = dict(x, _composite=True); by_subject[(x['byeolchaek'], x['subject'])].append(x)
            changes['코드충돌_복합키추가'] += 1
    for (b, subj), recs in by_subject.items():
        for o in recs:
            cn = codenorm(o['raw_code']); pre = code_number(cn); group = group_for(b, subj)
            # 같은 과목의 기존 정본 레코드가 있으면 과목명·학교급 표기를 그대로 따른다(명칭 일관성)
            sib = next((r for r in rows if r['subject_group'] == group and norm(r['subject']) == norm(subj)), None)
            rec = {'code': o['raw_code'], **({'key': composite_key(o['raw_code'], sib['subject'] if sib else subj)} if o.get('_composite') else {}), 'subject_group': group, 'subject': sib['subject'] if sib else subj,
                   'grade_group': PREFIX_GRADE.get(pre, '기타'), 'school_level': PREFIX_LEVEL.get(pre, sib['school_level'] if sib else ''),
                   'curriculum_category': o.get('curriculum_category', '') or (sib.get('curriculum_category', '') if sib else ''),
                   'area': area_std(o['area'], b), 'domain': '', 'content': one_line(o['content']), 'keywords': keywords_for(one_line(o['content'])),
                   'explanation': clean_text(o['explanation']), 'application_notes': bullets(o['application_notes'])}
            rows.append(rec); cmap.setdefault(cn, []).append(rec); added.append(rec.get('key') or rec['code']); changes['added'] += 1
if args.prune_unsourced:
    keep = []
    for r in rows:
        cn = codenorm(r['code'])
        if cn not in official and code_prefix(cn) in scope_prefixes: pruned.append(standard_key(r)); changes['pruned'] += 1
        else: keep.append(r)
    rows = keep
print(json.dumps(changes, ensure_ascii=False))
if added: print('신규', len(added), added[:8], '…' if len(added) > 8 else '')
if pruned: print('제거(원문 근거 없음)', pruned)
os.makedirs(DATA, exist_ok=True)
json.dump({'changes': changes, 'added': added, 'pruned': pruned, 'log': log}, open(os.path.join(DATA, 'apply_log.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if args.dry_run: print('dry-run: 파일을 쓰지 않았습니다.')
else: write_canonical(args.out, head, rows, tail); print('written', args.out, len(rows))
