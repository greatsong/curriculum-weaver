# scripts/audit — 성취기준 원문 대조·결점 0 파이프라인

교육부 고시 별책 PDF(원문)를 구조화해 정본 `server/data/standards.js`를 **전 필드**로 대조하고, 결점이 있으면 원문 기준으로 재작성한다. 성취기준이 추가·개정될 때마다 같은 절차를 반복하면 된다.

## 흐름
```
별책 PDF 폴더 ──extract_official.py──▶ data/official/별책N.json ──gate.py──▶ 결점 목록(data/gate_report.json)
                 (parsers/bookN.py)        (validate_official.py 필수 통과)         │
                                                                                 ▼ apply_official.py --add-missing
                                                                        server/data/standards.js 재작성 → gate.py = 0 → git 커밋
                                                                        → node scripts/update-standards-pipeline.mjs --apply (Supabase 시드)
```
오케스트레이터 한 줄: `node scripts/update-standards-pipeline.mjs --official-dir <PDF 폴더>` (검사) → `--apply-official` (재작성) → `--apply` (시드).

## 파일
| 파일 | 역할 |
|---|---|
| `SPEC.md` | 원문 구조화 JSON 스키마·규칙(verbatim, 해설 매핑, 학년군 규칙) |
| `parsers/bookN.py` | 별책 N 전용 파서. `extract(pdf_path, hwp_path=None) -> dict`, CLI `--pdf/--hwp/--out` |
| `extract_official.py` | 폴더에서 `[별책N]` PDF(+HWP)를 찾아 파서 실행 + 검증 |
| `validate_official.py` | 별책 JSON 스키마·정본 대비 content 일치율(99.5% 이상 PASS) |
| `gate.py` | 결점 0 게이트(A 완결성·B 문장·C 학교급/학년군·D 교과 귀속·E 영역·F 해설·G 적용 고려사항·H 형식) |
| `apply_official.py` | 정본 재작성(원문 verbatim, 줄바꿈 정리, 영역 표준형, 불릿 형식, 신규 추가, 근거 없는 코드 제거) |
| `common.py` | 정규화·코드 규칙·별책↔교과군 매핑·정본 로드/저장 |

## 정책(2026-09-05 확정)
- **content**: 원문 그대로. PDF 줄바꿈은 조사·어미로 시작하면 붙이고 아니면 띄운다. 정본 안 줄바꿈 금지.
- **school_level / grade_group**: 코드 접두로 결정(2/4/6 초, 9 중, 10 고공통, 12 고선택). 전문교과(한글 약어)는 기타·빈값 유지.
- **area**: 원문 성취기준 소제목(번호 제거). 별책23은 `학습 영역 > 학습 요소` 중 학습 영역. 원문에 소제목이 없는 단일 영역 과목은 정본 값을 유지하고 검사하지 않는다.
- **explanation**: 원문 "(가) 성취기준 해설"의 해당 코드 본문. 여러 코드가 병기된 해설은 각 코드에 동일 부여. 별책23은 코드가 명시된 적용 고려사항 불릿 본문.
- **application_notes**: 해당 영역의 "(나) 성취기준 적용 시 고려 사항" 불릿 전체, 줄마다 `• ` 접두.
- **keywords**: 없을 때만 content 앞 5어절로 생성(기존 값 유지).
- **원문 근거 없는 정본 코드**: `--prune-unsourced`로만 제거(예: [금일 04-03-04]). Supabase 행 삭제는 별도 수동.

## 원문 위치·확보
별책 PDF는 NCIC(우리나라 교육과정 > 원문 및 해설서 > 2022 개정 시기)에서 받는다. 2026-09-05 기준 사용 폴더: `~/Downloads/260720/` (별책 2·5~14·16~23). 같은 번호 파일이 여럿이면 가장 큰 파일을 쓴다.

## 의존
python3.11+, `pymupdf`(fitz). 수식 복원(별책8)은 HWP 원본과 `hwp5txt`(pyhwp)가 있으면 사용.
