# scripts/legacy — 아카이브 전용 (실행 금지)

2026-07-12 데이터 파이프라인 감사에서 레거시로 분류된 스크립트 보관소.
**어떤 스크립트도 실행하지 말 것.**

- 이동만 했고 **상대 경로는 보정하지 않았다** — 실행하면 경로가 깨지거나,
  더 나쁘게는 정본 데이터를 덮어쓴다 (예: reparse_*·fix_*는 `server/data/standards.js`,
  `standards_social.js`를 직접 덮어쓰고, import-standards-*는 `standards_full.js`를 재생성).
- 현행 파이프라인은 `scripts/` 최상위에 있다:
  `parse-xlsx-to-standards.mjs`(정본 생성) → `seed-standards-from-canonical.mjs`(Supabase 재정합)
  → `verify-standards-supabase.mjs` / `report-standards-quality.mjs`(검증),
  `generateEmbeddings.js` → `generateLinksV2.mjs` → `promoteLinks.mjs`(링크),
  `sync-restored-standards.mjs` · `update-standards-pipeline.mjs`(유지보수).

## 보관 목록

| 스크립트 | 과거 역할 | 대체 |
|-----------|-----------|------|
| `reparse_*.js` (12개) | 교과별 성취기준 수작업 재파싱 | `parse-xlsx-to-standards.mjs` |
| `fix_social_area.mjs`, `fix_standards_final.mjs` | standards 파일 일회성 패치 | (완료된 일회성 작업) |
| `extractStandards.js` | standards+social → JSON 덤프 | 정본 `server/data/standards.js` 직접 사용 |
| `import-standards-full.mjs`, `import-standards-watch.mjs` | NCIC HTML → `standards_full.js` ETL | `parse-xlsx-to-standards.mjs` |
| `seed-standards-to-supabase.mjs` | standards_full.json → Supabase 시드 (DEPRECATED) | `seed-standards-from-canonical.mjs` |
| `generateLinks.js` | 링크 v0 (TF-IDF) | `generateLinksV2.mjs` |
| `generateLinksAI.js` (+`_progress.json`) | 링크 v1 (교과쌍 전수 프롬프트, 코드 할루시네이션 713개) | `generateLinksV2.mjs` |
| `generateLinksMission.js` | 링크 v1 미션 방식 (산출물 0개로 폐기) | `generateLinksV2.mjs` |
| `buildGeneratedLinks.js`, `validateAndBuild.js` | v0/v1 링크 검증·번들 | DB 단일 소스 + `promoteLinks.mjs` |
| `computeEmbeddings.py` | TF-IDF+UMAP 임베딩 (Python) | `generateEmbeddings.js` (OpenAI) + 서버 런타임 UMAP |
