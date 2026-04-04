/**
 * import-standards-watch.mjs
 *
 * 유연한 성취기준 데이터 임포트 파이프라인
 *
 * 기능:
 *   1. 지정 디렉토리의 xlsx 파일을 재귀 탐색
 *   2. 7시트 구조로 파싱 (import-standards-full.mjs 동일 로직)
 *   3. 기존 standards_full.js와 upsert 병합 (code 기준)
 *   4. JS + JSON 출력
 *   5. diff 요약 출력: N new, N updated, N unchanged
 *
 * 사용법:
 *   node scripts/import-standards-watch.mjs /path/to/new/data/
 *
 * 출력:
 *   - server/data/standards_full.js  (기존 + 새 데이터 병합)
 *   - scripts/results/standards_full.json
 */

import XLSX from 'xlsx';
import { readdirSync, statSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════
// 인자 파싱
// ═══════════════════════════════════════════════════

const inputDir = process.argv[2];
if (!inputDir) {
  console.error('사용법: node scripts/import-standards-watch.mjs <디렉토리 경로>');
  console.error('예시:   node scripts/import-standards-watch.mjs /Users/greatsong/Downloads/new-data/');
  process.exit(1);
}

const resolvedInput = resolve(inputDir);
if (!existsSync(resolvedInput)) {
  console.error(`ERROR: 디렉토리 없음: ${resolvedInput}`);
  process.exit(1);
}

// ═══════════════════════════════════════════════════
// 매핑 테이블 (import-standards-full.mjs에서 가져옴)
// ═══════════════════════════════════════════════════

/** 교과그룹 매핑 (과목명 → 교과그룹) */
const SUBJECT_GROUP_MAP = {
  '바른 생활': '통합교과', '슬기로운 생활': '통합교과', '즐거운 생활': '통합교과',
  '국어': '국어', '공통국어1': '국어', '공통국어2': '국어',
  '공통국어1, 공통국어2': '국어',
  '화법과 언어': '국어', '독서와 작문': '국어', '문학': '국어',
  '주제 탐구 독서': '국어', '문학과 영상': '국어', '직무 의사소통': '국어',
  '독서 토론과 글쓰기': '국어', '매체 의사소통': '국어', '언어생활 탐구': '국어',
  '도덕': '도덕', '현대사회와 윤리': '도덕', '윤리와 사상': '도덕',
  '인문학과 윤리': '도덕', '윤리문제 탐구': '도덕',
  '사회': '사회', '통합사회1': '사회', '통합사회2': '사회',
  '한국사1': '사회', '한국사2': '사회',
  '수학': '수학', '공통수학1': '수학', '공통수학2': '수학',
  '과학': '과학', '통합과학1': '과학', '통합과학2': '과학',
  '물리학': '과학', '화학': '과학', '생명과학': '과학', '지구과학': '과학',
  '실과': '실과', '기술·가정': '기술·가정',
  '정보': '정보', '체육': '체육', '음악': '음악', '미술': '미술',
  '영어': '영어', '영어Ⅰ': '영어', '영어Ⅱ': '영어',
  '한문': '한문',
  '진로와 직업': '교양', '생태와 환경': '교양', '보건': '교양',
};

/** 학년군 코드 → grade_group */
const GRADE_GROUP_MAP = {
  2: '초1-2', 4: '초3-4', 6: '초5-6',
  9: '중', 10: '고공통', 12: '고선택',
};

/** grade_group → school_level */
const SCHOOL_LEVEL_MAP = {
  '초1-2': 'elementary', '초3-4': 'elementary', '초5-6': 'elementary',
  '중': 'middle',
  '고공통': 'high', '고선택': 'high',
};

// ═══════════════════════════════════════════════════
// 유틸리티
// ═══════════════════════════════════════════════════

const STOP_WORDS = new Set([
  '있다', '한다', '이해', '설명', '수', '것', '대한', '위해', '통해',
  '관련', '다양한', '활용', '과정', '바탕', '기반', '능력', '기르기',
  '위한', '대해', '등', '및', '또는', '이를', '함으로써', '하고',
  '하여', '하는', '것이다', '있는', '되는', '하기', '같은', '가지',
]);

function extractKeywords(text, maxCount = 5) {
  if (!text) return [];
  const tokens = text.match(/[가-힣]{2,}/g) || [];
  const filtered = tokens.filter(t => !STOP_WORDS.has(t));
  const freq = {};
  filtered.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCount)
    .map(([w]) => w);
}

function deriveGradeGroup(code) {
  const m = code.match(/\[(\d+)/);
  if (!m) return '고선택';
  const num = parseInt(m[1]);
  if (GRADE_GROUP_MAP[num]) return GRADE_GROUP_MAP[num];
  if (num >= 10) return '고선택';
  return '기타';
}

function deriveSchoolLevel(gradeGroup) {
  return SCHOOL_LEVEL_MAP[gradeGroup] || 'high';
}

function cleanText(val) {
  if (val === undefined || val === null) return '';
  return String(val).replace(/\n\s*/g, '\n').trim();
}

// ═══════════════════════════════════════════════════
// 파일 탐색
// ═══════════════════════════════════════════════════

function walkXlsx(dir) {
  let results = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      results = results.concat(walkXlsx(p));
    } else if (f.endsWith('.xlsx') && !f.startsWith('~') && !f.startsWith('.~')) {
      results.push(p);
    }
  }
  return results;
}

// ═══════════════════════════════════════════════════
// 시트 파서 (Sheet 4: 성취기준 상세 — 핵심)
// ═══════════════════════════════════════════════════

function findHeaderRow(rows, targetCols) {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const cells = rows[i].map(c => String(c || '').trim());
    if (targetCols.some(col => cells.includes(col))) return i;
  }
  return 0;
}

function mapColumns(headerRow, mapping) {
  const result = {};
  headerRow.forEach((col, idx) => {
    const c = String(col).trim();
    for (const [key, matchers] of Object.entries(mapping)) {
      if (result[key] !== undefined) continue;
      for (const m of matchers) {
        if (typeof m === 'string' ? c === m : m(c)) {
          result[key] = idx;
          break;
        }
      }
    }
  });
  return result;
}

function findSheet(wb, candidates) {
  for (const name of candidates) {
    if (wb.Sheets[name]) return wb.Sheets[name];
  }
  return null;
}

function parseSheet4(wb) {
  const ws = findSheet(wb, ['성취기준 상세', '4_성취기준']);
  if (!ws) return [];

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) return [];

  const headerIdx = findHeaderRow(rows, ['과목명', '과목']);
  const headerRow = rows[headerIdx];

  const colMap = mapColumns(headerRow, {
    subject: ['과목명', '과목'],
    area: ['영역'],
    code: [c => c.includes('성취기준') && c.includes('코드'), '성취기준코드'],
    content: ['성취기준 내용', '성취기준', c => c === '성취기준'],
    explanation: [c => c.includes('해설'), '성취기준 해설'],
    appNotes: [c => c.includes('고려사항') || c.includes('적용')],
  });

  if (colMap.code !== undefined && colMap.content === undefined) {
    headerRow.forEach((col, idx) => {
      if (idx > colMap.code && String(col).trim() === '성취기준') {
        colMap.content = idx;
      }
    });
  }

  const iSubject = colMap.subject ?? 0;
  const iArea = colMap.area ?? 1;
  const iCode = colMap.code ?? 2;
  const iContent = colMap.content ?? 3;
  const iExplanation = colMap.explanation ?? 4;
  const iAppNotes = colMap.appNotes ?? 5;

  const results = [];
  let lastSubject = '';
  let lastArea = '';

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const rawCode = String(row[iCode] || '').trim();
    if (!rawCode.startsWith('[')) continue;

    let subj = cleanText(row[iSubject]);
    if (!subj || subj === '과목' || subj === '과목명') subj = lastSubject;
    else lastSubject = subj;

    let area = cleanText(row[iArea]);
    if (!area) area = lastArea;
    else lastArea = area;

    const content = cleanText(row[iContent]);
    if (!content) continue;

    const explanation = cleanText(row[iExplanation]);
    const considerations = cleanText(row[iAppNotes]);

    results.push({ code: rawCode, subject: subj, area, content, explanation, considerations });
  }

  return results;
}

// Sheet 3: 내용 체계
function parseSheet3(wb) {
  const ws = findSheet(wb, ['내용 체계', '3_내용체계']);
  if (!ws) return {};
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) return {};
  const headerIdx = findHeaderRow(rows, ['과목명', '과목']);
  const headerRow = rows[headerIdx];
  const colMap = mapColumns(headerRow, {
    subject: ['과목명', '과목'],
    area: ['영역'],
    coreIdea: [c => c.includes('핵심') && c.includes('아이디어'), '핵심아이디어', '핵심 아이디어'],
    knowledge: [c => c.includes('지식'), '지식·이해'],
    process: [c => c.includes('과정'), '과정·기능'],
    values: [c => c.includes('가치'), '가치·태도'],
  });
  const result = {};
  let lastSubject = '';
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    let subj = cleanText(row[colMap.subject ?? 0]);
    if (!subj || subj === '과목명') subj = lastSubject; else lastSubject = subj;
    if (!subj) continue;
    const area = cleanText(row[colMap.area ?? 1]);
    if (!area) continue;
    result[`${subj}::${area}`] = {
      coreIdea: cleanText(row[colMap.coreIdea ?? 2]),
      knowledge: cleanText(row[colMap.knowledge ?? 3]),
      process: cleanText(row[colMap.process ?? 4]),
      values: cleanText(row[colMap.values ?? 5]),
    };
  }
  return result;
}

// Sheet 7: 영역별 키워드
function parseSheet7(wb) {
  const ws = findSheet(wb, ['영역별 요약', '7_영역요약']);
  if (!ws) return {};
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) return {};
  const headerIdx = findHeaderRow(rows, ['과목명', '과목']);
  const result = {};
  let lastSubject = '';
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    let subj = cleanText(row[0]);
    if (!subj || subj === '과목명') subj = lastSubject; else lastSubject = subj;
    if (!subj) continue;
    const area = cleanText(row[1]);
    if (!area) continue;
    const raw = cleanText(row[3]);
    const keywords = raw ? raw.split(/[,，、\s]+/).map(k => k.trim()).filter(Boolean) : [];
    result[`${subj}::${area}`] = keywords;
  }
  return result;
}

// ═══════════════════════════════════════════════════
// 통합 파서
// ═══════════════════════════════════════════════════

function parseFullFile(filePath) {
  const wb = XLSX.readFile(filePath);
  const relPath = filePath.replace(resolvedInput + '/', '');
  const folderName = relPath.split('/')[0];

  const standards = parseSheet4(wb);
  if (standards.length === 0) {
    console.log(`    [SKIP] 성취기준 없음: ${relPath}`);
    return [];
  }

  const contentSystemMap = parseSheet3(wb);
  const keywordsMap = parseSheet7(wb);

  return standards.map(s => {
    const gradeGroup = deriveGradeGroup(s.code);
    const schoolLevel = deriveSchoolLevel(gradeGroup);
    let subjectGroup = SUBJECT_GROUP_MAP[s.subject] || '기타';

    const csKey = `${s.subject}::${s.area}`;
    const contentSystem = contentSystemMap[csKey] || null;
    const areaKeywords = keywordsMap[csKey];
    const keywords = (areaKeywords && areaKeywords.length > 0)
      ? areaKeywords
      : extractKeywords(s.content + ' ' + s.area);

    return {
      code: s.code,
      subject: s.subject,
      subject_group: subjectGroup,
      grade_group: gradeGroup,
      school_level: schoolLevel,
      area: s.area,
      content: s.content,
      explanation: s.explanation,
      considerations: s.considerations,
      content_system: contentSystem,
      keywords,
    };
  });
}

// ═══════════════════════════════════════════════════
// 기존 데이터 로드
// ═══════════════════════════════════════════════════

function loadExistingStandards() {
  const jsPath = join(__dirname, '..', 'server', 'data', 'standards_full.js');
  const jsonPath = join(__dirname, 'results', 'standards_full.json');

  // JSON 파일 우선 (JS 파일은 ESM dynamic import가 캐싱됨)
  if (existsSync(jsonPath)) {
    try {
      const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
      console.log(`기존 데이터 로드: ${jsonPath} (${data.length}개)`);
      return data;
    } catch (e) {
      console.warn(`JSON 로드 실패: ${e.message}`);
    }
  }

  // JS export에서 추출 시도
  if (existsSync(jsPath)) {
    try {
      const raw = readFileSync(jsPath, 'utf-8');
      const match = raw.match(/export const ALL_STANDARDS = (\[[\s\S]*\]);/);
      if (match) {
        const data = JSON.parse(match[1]);
        console.log(`기존 데이터 로드: ${jsPath} (${data.length}개)`);
        return data;
      }
    } catch (e) {
      console.warn(`JS 로드 실패: ${e.message}`);
    }
  }

  console.log('기존 데이터 없음 — 새로 생성합니다.');
  return [];
}

// ═══════════════════════════════════════════════════
// 데이터 완성도 점수 (upsert 시 더 좋은 데이터 선택)
// ═══════════════════════════════════════════════════

function richness(item) {
  return (item.explanation ? 10 : 0) +
    (item.content_system ? 5 : 0) +
    (item.considerations ? 3 : 0) +
    (item.keywords?.length || 0) +
    item.content.length;
}

// ═══════════════════════════════════════════════════
// 메인
// ═══════════════════════════════════════════════════

function main() {
  console.log('=== 성취기준 Upsert 임포트 ===\n');
  console.log(`입력 디렉토리: ${resolvedInput}\n`);

  // 1. xlsx 파일 탐색
  const files = walkXlsx(resolvedInput);
  if (files.length === 0) {
    console.error('xlsx 파일을 찾을 수 없습니다.');
    process.exit(1);
  }
  console.log(`발견된 xlsx: ${files.length}개\n`);

  // 2. 파싱
  let newStandards = [];
  for (const f of files) {
    const rel = f.replace(resolvedInput + '/', '');
    try {
      const parsed = parseFullFile(f);
      console.log(`  ${rel}: ${parsed.length}개`);
      newStandards.push(...parsed);
    } catch (err) {
      console.error(`  ERROR: ${rel}: ${err.message}`);
    }
  }
  console.log(`\n새 데이터 파싱: ${newStandards.length}개`);

  // 3. 기존 데이터 로드
  const existing = loadExistingStandards();
  const existingMap = new Map();
  for (const s of existing) {
    existingMap.set(s.code, s);
  }

  // 4. Upsert 병합
  let countNew = 0;
  let countUpdated = 0;
  let countUnchanged = 0;

  for (const s of newStandards) {
    const prev = existingMap.get(s.code);
    if (!prev) {
      // 새 코드 추가
      existingMap.set(s.code, s);
      countNew++;
    } else {
      // 기존 코드 — 더 풍부한 데이터로 업데이트
      if (richness(s) > richness(prev)) {
        existingMap.set(s.code, { ...prev, ...s });
        countUpdated++;
      } else {
        countUnchanged++;
      }
    }
  }

  // 5. 결과 정렬
  const merged = [...existingMap.values()].sort((a, b) => {
    if (a.subject_group !== b.subject_group) return a.subject_group.localeCompare(b.subject_group);
    return a.code.localeCompare(b.code);
  });

  // 6. diff 요약
  console.log(`\n────── Upsert 결과 ──────`);
  console.log(`  신규 추가: ${countNew}개`);
  console.log(`  업데이트:  ${countUpdated}개`);
  console.log(`  변경 없음: ${countUnchanged}개`);
  console.log(`  최종 합계: ${merged.length}개 (기존 ${existing.length}개 + 신규 ${countNew}개)`);

  // 7. JS 출력
  const jsOutPath = join(__dirname, '..', 'server', 'data', 'standards_full.js');
  const jsContent = `/**
 * 교육과정 성취기준 데이터 (자동 생성 - Upsert 임포트)
 * 총 ${merged.length}개 성취기준
 * 생성일: ${new Date().toISOString().split('T')[0]}
 */

export const ALL_STANDARDS = ${JSON.stringify(merged, null, 2)};
`;
  writeFileSync(jsOutPath, jsContent, 'utf-8');
  console.log(`\nJS 출력: ${jsOutPath}`);

  // 8. JSON 출력
  const resultsDir = join(__dirname, 'results');
  if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });
  const jsonOutPath = join(resultsDir, 'standards_full.json');
  writeFileSync(jsonOutPath, JSON.stringify(merged, null, 2), 'utf-8');
  console.log(`JSON 출력: ${jsonOutPath}`);

  console.log(`\n=== 완료: ${merged.length}개 성취기준 ===`);
}

main();
