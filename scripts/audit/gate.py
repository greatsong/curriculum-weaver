#!/usr/bin/env python3
"""결점 0 게이트: 별책 원문 구조화 JSON(data/official/*.json)과 정본(server/data/standards.js)을 전 필드 대조.
차원: A 완결성(원문↔정본 코드), B content verbatim, C 학교급·학년군(코드 접두), D 교과 귀속(별책↔교과군),
      E 영역, F 해설, G 적용 고려사항, H 형식(중복·줄바꿈·코드 형식). 결점이 하나라도 있으면 exit 1.
사용: python3 scripts/audit/gate.py [--report data/gate_report.json] [--allow-missing-official]  (환경변수 AUDIT_DATA_DIR, STANDARDS_JS)
"""
import json, os, sys, collections, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
ap = argparse.ArgumentParser(); ap.add_argument('--report', default=os.path.join(DATA, 'gate_report.json')); ap.add_argument('--allow-missing-official', action='store_true', help='원문 JSON이 없는 별책 범위의 정본 코드는 결점으로 세지 않음(항상 정보성)')
args = ap.parse_args()
_, canon, _ = load_canonical(); cmap = {codenorm(r['code']): r for r in canon}
official = load_official()
scope_prefixes = {code_prefix(cn) for cn in official}
D = collections.defaultdict(list)
for cn, recs in official.items():
    if cn not in cmap: D['A_정본누락'].append({'code': recs[0]['raw_code'], 'subject': recs[0]['subject'], 'byeolchaek': recs[0]['byeolchaek'], 'content': recs[0]['content']})
for cn, r in cmap.items():
    if cn not in official:
        D['A_원문미확인' if code_prefix(cn) in scope_prefixes else 'A_원문범위밖'].append({'code': r['code'], 'subject': f"{r['subject_group']}/{r['subject']}"})
        continue
    recs = official[cn]
    if not any(norm(x['content']) == norm(r['content']) for x in recs): D['B_content불일치'].append({'code': r['code'], '정본': r['content'], '원문': recs[0]['content'], 'byeolchaek': recs[0]['byeolchaek']})
    pre = code_number(cn)
    if pre:
        if (r.get('school_level') or '') != PREFIX_LEVEL[pre]: D['C_학교급'].append({'code': r['code'], '정본': r.get('school_level'), '기대': PREFIX_LEVEL[pre]})
        if (r.get('grade_group') or '') != PREFIX_GRADE[pre]: D['C_학년군'].append({'code': r['code'], '정본': r.get('grade_group'), '기대': PREFIX_GRADE[pre]})
    groups = {group_for(x['byeolchaek'], x['subject']) for x in recs} | set().union(*(BYEOL_GROUPS_ALLOWED.get(x['byeolchaek'], set()) for x in recs))
    if r['subject_group'] not in groups: D['D_교과귀속'].append({'code': r['code'], '정본': r['subject_group'], '원문': sorted(groups)})
    ca = norm(area_std(r.get('area', '')))
    oas = {norm(area_std(x['area'], x['byeolchaek'])) for x in recs}
    # 원문에 영역 소제목이 없는 과목(oas == {''})은 정본 영역을 검사하지 않는다(단일 영역 과목).
    if not ca and any(oas): D['E_영역비어있음'].append({'code': r['code'], '원문': sorted(area_std(x['area'], x['byeolchaek']) for x in recs)})
    elif ca and any(oas) and ca not in oas: D['E_영역불일치'].append({'code': r['code'], '정본': r.get('area'), '원문': sorted(area_std(x['area'], x['byeolchaek']) for x in recs)})
    ce = norm(r.get('explanation', '')); oes = [norm(x['explanation']) for x in recs]
    if ce and ce not in oes: D['F_해설불일치'].append({'code': r['code'], '정본': (r.get('explanation') or '')[:200], '원문': (recs[0]['explanation'] or '')[:200]})
    if not ce and any(oes): D['F_해설누락'].append({'code': r['code'], '원문': (recs[0]['explanation'] or '')[:200]})
    cg = norm_bullets(r.get('application_notes', '')); ogs = [norm_bullets(x['application_notes']) for x in recs]
    if cg and cg not in ogs: D['G_적용고려사항불일치'].append({'code': r['code'], '정본': (r.get('application_notes') or '')[:160], '원문': (recs[0]['application_notes'] or '')[:160]})
    if not cg and any(ogs): D['G_적용고려사항누락'].append({'code': r['code']})
    if '\n' in (r.get('content') or ''): D['H_content줄바꿈'].append(r['code'])
    if not CODE_RE.match(cn): D['H_코드형식'].append(r['code'])
    if not (r.get('keywords') or []): D['H_키워드없음'].append(r['code'])
codes = [r['code'] for r in canon]
D['H_중복코드'].extend([c for c, n in collections.Counter(codes).items() if n > 1])
D = {k: v for k, v in D.items() if v}
summary = {k: len(v) for k, v in D.items()}
os.makedirs(os.path.dirname(args.report), exist_ok=True)
json.dump({'summary': summary, 'defects': D, 'official_codes': len(official), 'canonical_codes': len(cmap)}, open(args.report, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'원문 코드 {len(official)} | 정본 코드 {len(cmap)} | 원문 별책 범위 접두 {len(scope_prefixes)}')
info = {'A_원문범위밖'} | ({'A_원문미확인'} if args.allow_missing_official else set())
for k in sorted(summary): print(f'  {"(정보) " if k in info else ""}{k:22s} {summary[k]}')
total = sum(v for k, v in summary.items() if k not in info)
print('RESULT', 'PASS' if total == 0 else f'FAIL ({total} defects) → {args.report}')
sys.exit(0 if total == 0 else 1)
