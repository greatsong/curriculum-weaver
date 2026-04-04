# 교육과정 종합분석표 데이터 스펙

## 데이터 소스
- 위치: `/Users/greatsong/Downloads/outputs/2022_개정_교육과정_종합분석표_최종_final.zip`
- 39개 xlsx 파일, 18개 교과영역 디렉토리
- 5,146개 성취기준, ~208개 과목

## xlsx 7-시트 구조

| 시트 | 내용 | DB 매핑 |
|------|------|---------|
| 1. 성격 및 목표 | 과목별 성격, 목표 | 참조용 (AI 컨텍스트) |
| 2. 교과 역량 | 역량명, 역량 설명 | curriculum_standards.competencies |
| 3. 내용 체계 | 핵심아이디어, 지식/이해, 과정/기능, 가치/태도 | curriculum_standards.content_system |
| 4. 성취기준 상세 | 코드, 본문, 해설, 고려사항 | curriculum_standards 핵심 필드 |
| 5. 교수/학습 | 교수학습 방향/방법 | curriculum_standards.teaching_learning |
| 6. 평가 | 평가 방향/방법 | curriculum_standards.assessment_guide |
| 7. 영역별 요약 | 영역별 성취기준 수, 키워드 | curriculum_standards.keywords |

## 성취기준 코드 형식

`[{학년군}{교과약어}{영역번호}-{성취기준번호}]`

| 학년군 코드 | 학년 | school_level | grade_group |
|------------|------|-------------|-------------|
| 2 | 초등 1-2학년 | elementary | 초1-2 |
| 4 | 초등 3-4학년 | elementary | 초3-4 |
| 6 | 초등 5-6학년 | elementary | 초5-6 |
| 9 | 중학교 | middle | 중 |
| 10 | 고등 공통 | high | 고공통 |
| 12 | 고등 선택 | high | 고선택 |

## ETL 파이프라인

### Step 1: xlsx 파싱
기존 `scripts/parse-xlsx-to-standards.mjs` 확장:
- 시트 4 (성취기준 상세)를 기본 파싱 (현재 구현됨)
- 시트 2 (교과 역량)를 과목별로 묶어 competencies JSONB 생성
- 시트 3 (내용 체계)를 영역별로 묶어 content_system JSONB 생성
- 시트 5, 6을 과목별로 묶어 teaching_learning, assessment_guide 텍스트 생성
- 시트 7에서 keywords 배열 추출

### Step 2: 데이터 정규화
- 성취기준 코드에서 학년군, 교과, 영역 파싱
- 2가지 헤더 형식 대응 (표준 6컬럼 vs 확장 8컬럼+타이틀행)
- 전문교과 특수 코드 처리 (공백 포함: `[성직 01-01]`)

### Step 3: Supabase 적재
- curriculum_standards 테이블에 upsert (code 기준)
- 기존 4,856개 → 5,146개로 업데이트
- 메타데이터 필드 채우기

## 현재 데이터 vs 목표 데이터 비교

| 항목 | 현재 (standards.js) | 목표 (Supabase) |
|------|-------------------|----------------|
| 성취기준 수 | 4,856 | 5,146+ |
| 필드 | code, subject, grade_group, area, content, explanation, considerations, keywords | + competencies, content_system, teaching_learning, assessment_guide |
| 저장 | JS 파일 하드코딩 | PostgreSQL |
| 검색 | 인메모리 필터 | SQL ILIKE + Full-text + pgvector |
| 그래프 | TF-IDF + UMAP 3D | 유지 (캐시 기반) |
