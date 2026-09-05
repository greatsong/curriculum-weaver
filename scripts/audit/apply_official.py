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
head, rows, tail = load_canonical(); cmap = {codenorm(r['code']): r for r in rows}
official = load_official(); scope_prefixes = {code_prefix(cn) for cn in official}
changes = collections.Counter(); log = []
def pick(recs):
    """같은 코드가 여러 별책에 있으면 해설·고려사항이 더 풍부한 레코드 우선(초등은 교과 별책 > 별책2)."""
    return sorted(recs, key=lambda x: (x['byeolchaek'] == '별책2', -len(x['explanation']), -len(x['application_notes'])))[0]
for r in rows:
    cn = codenorm(r['code']); pre = code_number(cn)
    if pre:
        if r.get('school_level') != PREFIX_LEVEL[pre]: log.append(('school_level', r['code'], r.get('school_level'), PREFIX_LEVEL[pre])); r['school_level'] = PREFIX_LEVEL[pre]; changes['school_level'] += 1
        if r.get('grade_group') != PREFIX_GRADE[pre]: log.append(('grade_group', r['code'], r.get('grade_group'), PREFIX_GRADE[pre])); r['grade_group'] = PREFIX_GRADE[pre]; changes['grade_group'] += 1
    recs = official.get(cn)
    if not recs: continue
    o = pick(recs)
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
        if cn not in cmap: by_subject[(recs[0]['byeolchaek'], recs[0]['subject'])].append(pick(recs))
    for (b, subj), recs in by_subject.items():
        for o in recs:
            cn = codenorm(o['raw_code']); pre = code_number(cn); group = group_for(b, subj)
            # 같은 과목의 기존 정본 레코드가 있으면 과목명·학교급 표기를 그대로 따른다(명칭 일관성)
            sib = next((r for r in rows if r['subject_group'] == group and norm(r['subject']) == norm(subj)), None)
            rec = {'code': o['raw_code'], 'subject_group': group, 'subject': sib['subject'] if sib else subj,
                   'grade_group': PREFIX_GRADE.get(pre, '기타'), 'school_level': PREFIX_LEVEL.get(pre, sib['school_level'] if sib else ''),
                   'curriculum_category': o.get('curriculum_category', '') or (sib.get('curriculum_category', '') if sib else ''),
                   'area': area_std(o['area'], b), 'domain': '', 'content': one_line(o['content']), 'keywords': keywords_for(one_line(o['content'])),
                   'explanation': clean_text(o['explanation']), 'application_notes': bullets(o['application_notes'])}
            rows.append(rec); cmap[cn] = rec; added.append(rec['code']); changes['added'] += 1
if args.prune_unsourced:
    keep = []
    for r in rows:
        cn = codenorm(r['code'])
        if cn not in official and code_prefix(cn) in scope_prefixes: pruned.append(r['code']); changes['pruned'] += 1
        else: keep.append(r)
    rows = keep
print(json.dumps(changes, ensure_ascii=False))
if added: print('신규', len(added), added[:8], '…' if len(added) > 8 else '')
if pruned: print('제거(원문 근거 없음)', pruned)
os.makedirs(DATA, exist_ok=True)
json.dump({'changes': changes, 'added': added, 'pruned': pruned, 'log': log}, open(os.path.join(DATA, 'apply_log.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if args.dry_run: print('dry-run: 파일을 쓰지 않았습니다.')
else: write_canonical(args.out, head, rows, tail); print('written', args.out, len(rows))
