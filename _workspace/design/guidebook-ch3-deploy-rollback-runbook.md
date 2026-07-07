# 배포·롤백 런북 — 가이드북 3장 최종 정합 (guidebook-ch3-alignment)

> 작성 2026-07-08. 배포 전 최종 검증 워크플로우 통과 후 이 절차로 main 통합·배포한다.

## 1. 현재 상태 (git fetch 기준)
| 항목 | 값 |
|------|-----|
| 프로덕션 main | `origin/main = f92a555` ("Merge pull request #15 …guidebook-ch3-alignment") |
| 롤백 앵커 태그(로컬) | `rollback/pre-ch3-final-merge` → **f92a555** |
| 이번 머지 델타 | 로컬 `feat/guidebook-ch3-alignment`의 **2커밋** = `9f0a9ab`(콘텐츠 정합) + `32dc6da`(UI 정합), **13개 파일** (`git diff --stat origin/main...HEAD`) |
| 원격 브랜치 | `origin/feat/guidebook-ch3-alignment = 78db56f` → **내 2커밋 미푸시** |

**핵심**: 이 브랜치의 이전 작업(78db56f까지)은 **PR #15로 이미 프로덕션에 배포됨**. 이번 통합은 그 위에 콘텐츠·UI 정합 2커밋을 얹는 것뿐이다.

### ⚠️ 주의
- **local main(`2b51ca6`)은 74커밋 뒤처진 낡은 상태.** 절대 로컬 main으로 머지·푸시하지 말 것(프로덕션 퇴행 위험).
- 미커밋 워킹트리 변경(`launch.json`, `embeddings-cache.json`, `standards_new.js` 삭제, `scripts/*`, `supabase/.temp`, 미추적 파일)은 **머지에 포함되지 않음**(커밋된 것만 머지). `standards_new.js`는 어디서도 import 안 되어 삭제 무해.

## 2. DB/스키마 영향 = 없음 (롤백 안전성 근거)
- boardSchemas 필드 불변(`support_tools`의 experiencedTools/tools/environmentCheck 그대로), **board_type key `support_tools`·내부 절차코드 `Ds-2-1` 유지**.
- Ds-4는 **표시명만** '지원 도구 설계' → '자료와 도구 연결'로 변경. 기존 프로젝트 데이터 무손상.
- 변경 성격 = **순수 데이터(가이드 콘텐츠)+UI 카피**. 마이그레이션·백필 불필요. 롤백은 재배포만으로 즉시 원복.

## 3. 안전 머지 절차 (권장: GitHub PR)
```bash
# 1) 내 2커밋을 원격 브랜치로 푸시
git push origin feat/guidebook-ch3-alignment

# 2) GitHub에서 PR 생성: base=main, compare=feat/guidebook-ch3-alignment
#    → diff가 2커밋/13파일(origin/main...HEAD)인지 확인
# 3) 머지(Squash 또는 Merge commit)
```
- 머지 시 충돌은 거의 없음(브랜치가 가이드 파일의 정본이고 main은 78db56f 기반). 충돌 시 **가이드북 관련 파일은 브랜치 쪽 채택**.
- main 푸시 → **GitHub Actions `deploy-railway.yml`**가 서버 배포(`railway up --service curriculum-weaver-server`), **Vercel**이 client 빌드(`vite build`)·배포.

(비권장 — 로컬 머지 시: 반드시 먼저 `git checkout main && git fetch origin && git reset --hard origin/main`로 local main을 최신화한 뒤 머지)

## 4. 배포 후 스모크 체크
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://curriculum-weaver-server-production.up.railway.app/api/health   # 200 기대
```
- Vercel 프론트: `/guide`에 "5개 과정, 18개 세부활동" · "5가지 협력 원리" 노출, Ds-4 칩 "Ds-4 자료와 도구 연결".
- 실제 프로젝트에서 Ds-4(Ds-2-1) 절차 진입 → 인트로에 활동흐름 4스텝·활동사례가 뜨는지(과거 공백이었음).

## 5. 롤백 절차 (문제 발생 시)

### A. 플랫폼 즉시 롤백 (가장 빠름, git 불필요)
- **Vercel**: Dashboard → 프로젝트 → Deployments → 직전(f92a555 기반) 배포 → **Rollback / Promote to Production**. 수 초.
- **Railway**: 서비스 `curriculum-weaver-server` → Deployments → 직전 배포 → **Rollback / Redeploy**.

### B. Git revert (권장, 이력 보존)
```bash
git checkout main && git pull origin main
git revert -m 1 <머지커밋SHA>      # Merge commit인 경우. Squash 머지였다면: git revert <squash커밋SHA>
git push origin main                # → 자동 재배포(직전 상태 복원)
```

### C. Git 강제 리셋 (파괴적 — 최후수단, 다른 사람 작업 유실 주의)
```bash
git checkout main
git reset --hard rollback/pre-ch3-final-merge   # = f92a555
git push --force-with-lease origin main         # → 자동 재배포
```

### 롤백 후 검증
- `/api/health` 200 확인.
- `/guide`가 이전 카피(예: "40가지 설계 원리"/"19개 절차")로 복귀 = 롤백 정상.

## 6. 앵커/복원 지점 요약
- **되돌릴 지점(프로덕션 pre-merge)**: `f92a555` = 태그 `rollback/pre-ch3-final-merge`
- **적용할 지점(머지 대상)**: `32dc6da` (로컬 브랜치 tip)
- 원격에 앵커 태그도 두려면(선택): `git push origin rollback/pre-ch3-final-merge`
