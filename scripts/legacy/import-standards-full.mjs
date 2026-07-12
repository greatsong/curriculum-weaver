/**
 * import-standards-full.mjs
 *
 * 종합 ETL: 39개 xlsx (7시트 구조) → standards_full.js + standards_full.json
 *
 * 입력: /tmp/curriculum-data/2022_개정_교육과정_종합분석표_최종/
 * 출력:
 *   - server/data/standards_full.js  (JS export, 로컬 폴백)
 *   - scripts/results/standards_full.json (Supabase import용)
 *
 * 실행: node scripts/import-standards-full.mjs
 */

import XLSX from 'xlsx';
import { readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --input 플래그로 커스텀 입력 디렉토리 지정 가능
const inputFlagIdx = process.argv.indexOf('--input');
const BASE_DIR = (inputFlagIdx !== -1 && process.argv[inputFlagIdx + 1])
  ? process.argv[inputFlagIdx + 1]
  : '/tmp/curriculum-data/2022_개정_교육과정_종합분석표_최종';

// ═══════════════════════════════════════════════════
// 1. 매핑 테이블
// ═══════════════════════════════════════════════════

/** 교과그룹 매핑 (과목명 → 교과그룹) */
const SUBJECT_GROUP_MAP = {
  // 별책02 초등 통합교과
  '바른 생활': '통합교과', '슬기로운 생활': '통합교과', '즐거운 생활': '통합교과',
  // 별책05 국어과
  '국어': '국어', '공통국어1': '국어', '공통국어2': '국어',
  '공통국어1, 공통국어2': '국어',
  '화법과 언어': '국어', '독서와 작문': '국어', '문학': '국어',
  '주제 탐구 독서': '국어', '문학과 영상': '국어', '직무 의사소통': '국어',
  '독서 토론과 글쓰기': '국어', '매체 의사소통': '국어', '언어생활 탐구': '국어',
  // 별책06 도덕과
  '도덕': '도덕', '현대사회와 윤리': '도덕', '윤리와 사상': '도덕',
  '인문학과 윤리': '도덕', '윤리문제 탐구': '도덕',
  // 별책07 사회과
  '사회': '사회', '통합사회1': '사회', '통합사회2': '사회',
  '한국사1': '사회', '한국사2': '사회',
  '사회(4학년)': '사회', '사회(5~6학년)': '사회',
  '한국지리 탐구': '사회', '세계지리 탐구': '사회', '세계사': '사회',
  '동아시아 역사 기행': '사회', '정치': '사회', '법과 사회': '사회',
  '경제': '사회', '사회·문화': '사회', '현대사회와 윤리': '도덕',
  '사회문제 탐구': '사회', '금융과 경제생활': '사회', '기후변화와 지속가능한 세계': '사회',
  // 별책08 수학과
  '수학': '수학', '공통수학1': '수학', '공통수학2': '수학',
  '공통수학1, 공통수학2': '수학',
  '기본수학1': '수학', '기본수학2': '수학', '기본수학1, 기본수학2': '수학',
  '대수': '수학', '미적분Ⅰ': '수학', '확률과 통계': '수학', '미적분Ⅱ': '수학',
  '기하': '수학', '경제 수학': '수학', '인공지능 수학': '수학',
  '직무 수학': '수학', '수학과 문화': '수학', '실용 통계': '수학',
  '수학과제 탐구': '수학',
  // 별책09 과학과
  '과학': '과학', '통합과학1': '과학', '통합과학2': '과학',
  '과학탐구실험1': '과학', '과학탐구실험2': '과학',
  '물리학': '과학', '화학': '과학', '생명과학': '과학', '지구과학': '과학',
  '역학과 에너지': '과학', '전자기와 양자': '과학', '물질과 에너지': '과학',
  '화학 반응의 세계': '과학', '세포와 물질대사': '과학', '생물의 유전': '과학',
  '행성우주과학': '과학', '대기와 해양의 변화': '과학',
  '과학의 역사와 문화': '과학', '기후변화와 환경생태': '과학', '융합과학 탐구': '과학',
  // 별책10 실과·기술가정·정보
  '실과': '실과', '실과(초등 5~6학년)': '실과',
  '기술·가정': '기술·가정',
  '기술·가정(중학교 공통)': '기술·가정', '기술·가정(고등 일반선택)': '기술·가정',
  '로봇과 공학세계(진로선택)': '기술·가정', '생활과학 탐구(진로선택)': '기술·가정',
  '창의 공학 설계(융합선택)': '기술·가정', '지식 재산 일반(융합선택)': '기술·가정',
  '아동발달과 부모(융합선택)': '기술·가정', '생애 설계와 자립(융합선택)': '기술·가정',
  '정보': '정보', '정보(중학교 공통)': '정보', '정보(고등 일반선택)': '정보',
  '인공지능 기초(진로선택)': '정보', '데이터 과학(진로선택)': '정보',
  '소프트웨어와 생활(융합선택)': '정보',
  // 별책11 체육과
  '체육': '체육',
  // 별책12 음악과
  '음악': '음악',
  // 별책13 미술과
  '미술': '미술',
  // 별책14 영어과
  '영어': '영어', '공통영어1·2': '영어', '기본영어1·2': '영어',
  '영어Ⅰ': '영어', '영어Ⅱ': '영어', '영어 독해와 작문': '영어',
  '직무 영어': '영어', '영어 발표와 토론': '영어', '심화 영어': '영어',
  '영미 문학 읽기': '영어', '심화 영어 독해와 작문': '영어',
  '실생활 영어 회화': '영어', '미디어 영어': '영어', '세계 문화와 영어': '영어',
  // 별책16 제2외국어
  '생활 독일어': '제2외국어', '생활 프랑스어': '제2외국어',
  '생활 스페인어': '제2외국어', '생활 중국어': '제2외국어',
  '생활 일본어': '제2외국어', '생활 러시아어': '제2외국어',
  '생활 아랍어': '제2외국어', '생활 베트남어': '제2외국어',
  // 별책17 한문과
  '한문': '한문',
  // 별책19 교양교과
  '진로와 직업': '교양', '생태와 환경': '교양', '인간과 철학': '교양',
  '논리와 사고': '교양', '인간과 심리': '교양', '교육의 이해': '교양',
  '삶과 종교': '교양', '보건': '교양', '인간과 경제활동': '교양', '논술': '교양',
  // 별책20 과학계열전문교과
  '전문 수학': '과학계열전문', '이산 수학': '과학계열전문',
  '고급 대수': '과학계열전문', '고급 미적분': '과학계열전문', '고급 기하': '과학계열전문',
  '고급 물리학': '과학계열전문', '고급 화학': '과학계열전문',
  '고급 생명과학': '과학계열전문', '고급 지구과학': '과학계열전문',
  '과학과제 연구': '과학계열전문', '정보과학': '과학계열전문',
  '물리학 실험': '과학계열전문', '화학 실험': '과학계열전문',
  '생명과학 실험': '과학계열전문', '지구과학 실험': '과학계열전문',
  // 별책21 체육계열전문교과
  '스포츠 개론': '체육계열전문', '육상': '체육계열전문', '체조': '체육계열전문',
  '수상 스포츠': '체육계열전문', '기초 체육 전공 실기': '체육계열전문',
  '심화 체육 전공 실기': '체육계열전문', '고급 체육 전공 실기': '체육계열전문',
  '스포츠 경기 체력': '체육계열전문', '스포츠 경기 기술': '체육계열전문',
  '스포츠 경기 분석': '체육계열전문', '스포츠 교육': '체육계열전문',
  '스포츠 생리의학': '체육계열전문', '스포츠 행정 및 경영': '체육계열전문',
};

/** 폴더 이름 기반 교과그룹 폴백 */
const FOLDER_GROUP_MAP = {
  '별책02_초등학교': '통합교과',
  '별책09_과학과': '과학',
  '별책22_예술계열전문교과': '예술계열전문',
  '별책23_산업수요전문교과': '산업수요전문',
};

/** 학년군 코드 → grade_group */
const GRADE_GROUP_MAP = {
  2: '초1-2', 4: '초3-4', 6: '초5-6',
  9: '중', 10: '고공통', 12: '고선택',
};

/** grade_group → school_level (Supabase enum) */
const SCHOOL_LEVEL_MAP = {
  '초1-2': 'elementary', '초3-4': 'elementary', '초5-6': 'elementary',
  '중': 'middle',
  '고공통': 'high', '고선택': 'high',
};

// ═══════════════════════════════════════════════════
// 2. 유틸리티
// ═══════════════════════════════════════════════════

const STOP_WORDS = new Set([
  '있다', '한다', '이해', '설명', '수', '것', '대한', '위해', '통해',
  '관련', '다양한', '활용', '과정', '바탕', '기반', '능력', '기르기',
  '위한', '대해', '등', '및', '또는', '이를', '함으로써', '하고',
  '하여', '하는', '것이다', '있는', '되는', '하기', '같은', '가지',
  '따라', '적절한', '적절히', '필요한', '중요한', '알고', '알아',
  '대하여', '이해하고', '설명할', '있도록', '필요', '방법',
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

/** 코드에서 학년군 코드 숫자 추출 */
function parseGradeCode(code) {
  const m = code.match(/\[(\d+)/);
  if (!m) return null;
  return parseInt(m[1]);
}

/** 코드 → grade_group */
function deriveGradeGroup(code) {
  const num = parseGradeCode(code);
  if (num === null) {
    // 전문교과: 코드가 한글 약어로 시작 (예: [성직 01-01], [디직 01-01])
    // 모두 고등학교 선택과목
    return '고선택';
  }
  if (GRADE_GROUP_MAP[num]) return GRADE_GROUP_MAP[num];
  // 2자리로 시작하는 코드 중 매핑에 없는 것 → 고선택으로 처리
  if (num >= 10) return '고선택';
  return '기타';
}

/** grade_group → school_level */
function deriveSchoolLevel(gradeGroup) {
  return SCHOOL_LEVEL_MAP[gradeGroup] || 'high';
}

/** 텍스트 정리: 여러 줄 합치고 불필요한 공백 제거 */
function cleanText(val) {
  if (val === undefined || val === null) return '';
  return String(val).replace(/\n\s*/g, '\n').trim();
}

// ═══════════════════════════════════════════════════
// 3. 파일 탐색
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

/**
 * 파일 선택 전략:
 *   - 폴더별로 "교육과정_종합분석표" 이름 우선
 *   - 초등/중등 분리 파일이 있으면 둘 다 선택
 *   - 7시트 종합분석표 우선
 */
function selectFiles(allFiles) {
  const byFolder = {};
  for (const f of allFiles) {
    const rel = f.replace(BASE_DIR + '/', '');
    const folder = rel.split('/')[0];
    if (!byFolder[folder]) byFolder[folder] = [];
    byFolder[folder].push(f);
  }

  const selected = [];

  for (const [folder, files] of Object.entries(byFolder)) {
    // 초등/중등 분리 파일 확인
    const elemFiles = files.filter(f => f.includes('초등'));
    const secFiles = files.filter(f => f.includes('중등'));

    // 별책10 (실과/기술가정/정보)처럼 같은 학교급에 다른 과목 파일이 있으면 모두 선택
    if (folder.includes('별책10')) {
      selected.push(...files);
    } else if (elemFiles.length > 0 || secFiles.length > 0) {
      // 초등/중등 분리 파일이 있으면 각각 가장 좋은 것 선택
      for (const subset of [elemFiles, secFiles]) {
        if (subset.length === 0) continue;
        // 파일명만으로 우선순위 판별 (디렉토리명에 "종합분석표" 포함되므로)
        const byName = (fn) => (f) => f.split('/').pop().includes(fn);
        // 우선순위: "교육과정_종합분석표" > 일반 "종합분석표" (7시트 아닌) > "7시트" > 기타
        const pick =
          subset.find(byName('교육과정_종합분석표')) ||
          subset.find(f => byName('종합분석표')(f) && !byName('7시트')(f)) ||
          subset.find(byName('7시트')) ||
          subset[0];
        selected.push(pick);
      }
    } else {
      // 초등/중등 구분 없음 → 전체 파일 사용 (교양, 전문교과 등)
      // 중복 방지: 같은 폴더에 "종합분석표"와 "교육과정_종합분석표" 둘 다 있을 때
      if (files.length > 1) {
        const byName = (fn) => (f) => f.split('/').pop().includes(fn);
        const pick =
          files.find(byName('교육과정_종합분석표')) ||
          files.find(f => byName('종합분석표')(f) && !byName('7시트')(f)) ||
          files[0];
        // 별책10 (실과/기술가정/정보)은 파일이 3개 (실과, 기술가정, 정보)
        // 별책23은 2개 (산업수요, 산업수요맞춤형)
        // 이들은 과목이 다르므로 모두 포함
        const fileNames = files.map(f => f.split('/').pop());
        const areDistinctSubjects = !fileNames.some(
          (n, i) => fileNames.some((m, j) => i !== j && n.includes(m.slice(0, 4)))
        );
        if (areDistinctSubjects || folder.includes('별책10') || folder.includes('별책23')) {
          selected.push(...files);
        } else {
          selected.push(pick);
        }
      } else {
        selected.push(...files);
      }
    }
  }

  return selected.sort();
}

// ═══════════════════════════════════════════════════
// 4. 시트 파서들
// ═══════════════════════════════════════════════════

/** 시트에서 헤더 행 인덱스 탐색 */
function findHeaderRow(rows, targetCols) {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const cells = rows[i].map(c => String(c || '').trim());
    if (targetCols.some(col => cells.includes(col))) return i;
  }
  return 0;
}

/** 헤더 행에서 컬럼 인덱스 매핑 생성 */
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

// ── Sheet 4: 성취기준 상세 ──────────────────────────

/** 시트 이름 후보에서 존재하는 시트 찾기 */
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

  // "성취기준" 컬럼이 코드와 별도로 있을 때
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

    results.push({
      code: rawCode,
      subject: subj,
      area,
      content,
      explanation,
      considerations,
    });
  }

  return results;
}

// ── Sheet 2: 교과 역량 ──────────────────────────────

function parseSheet2(wb) {
  const ws = findSheet(wb, ['교과 역량', '2_교과역량']);
  if (!ws) return {};

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) return {};

  const headerIdx = findHeaderRow(rows, ['과목명', '과목']);

  // 과목별 역량 목록: { subject: [ { name, description } ] }
  const result = {};
  let lastSubject = '';

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    let subj = cleanText(row[0]);
    if (!subj || subj === '과목명' || subj === '과목') subj = lastSubject;
    else lastSubject = subj;
    if (!subj) continue;

    const name = cleanText(row[1]);
    const desc = cleanText(row[2]);
    if (!name) continue;

    if (!result[subj]) result[subj] = [];
    result[subj].push({ name, description: desc });
  }

  return result;
}

// ── Sheet 3: 내용 체계 ──────────────────────────────

function parseSheet3(wb) {
  const ws = findSheet(wb, ['내용 체계', '3_내용체계']);
  if (!ws) return {};

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) return {};

  const headerIdx = findHeaderRow(rows, ['과목명', '과목']);
  const headerRow = rows[headerIdx];

  // 컬럼 매핑
  const colMap = mapColumns(headerRow, {
    subject: ['과목명', '과목'],
    area: ['영역'],
    coreIdea: [c => c.includes('핵심') && c.includes('아이디어'), '핵심아이디어', '핵심 아이디어'],
    knowledge: [c => c.includes('지식'), '지식·이해', '지식・이해'],
    process: [c => c.includes('과정'), '과정·기능', '과정・기능'],
    values: [c => c.includes('가치'), '가치·태도', '가치・태도'],
  });

  const iSubj = colMap.subject ?? 0;
  const iArea = colMap.area ?? 1;
  const iCore = colMap.coreIdea ?? 2;
  const iKnow = colMap.knowledge ?? 3;
  const iProc = colMap.process ?? 4;
  const iVal = colMap.values ?? 5;

  // { subject_area: { coreIdea, knowledge, process, values } }
  const result = {};
  let lastSubject = '';

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    let subj = cleanText(row[iSubj]);
    if (!subj || subj === '과목명' || subj === '과목') subj = lastSubject;
    else lastSubject = subj;
    if (!subj) continue;

    const area = cleanText(row[iArea]);
    if (!area) continue;

    const key = `${subj}::${area}`;
    result[key] = {
      coreIdea: cleanText(row[iCore]),
      knowledge: cleanText(row[iKnow]),
      process: cleanText(row[iProc]),
      values: cleanText(row[iVal]),
    };
  }

  return result;
}

// ── Sheet 5: 교수·학습 ──────────────────────────────

function parseSheet5(wb) {
  const ws = findSheet(wb, ['교수·학습', '교수\u00B7학습', '5_교수학습']);
  if (!ws) return {};

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) return {};

  const headerIdx = findHeaderRow(rows, ['과목명', '과목']);

  // { subject: text }
  const result = {};
  let lastSubject = '';

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    let subj = cleanText(row[0]);
    if (!subj || subj === '과목명' || subj === '과목') subj = lastSubject;
    else lastSubject = subj;
    if (!subj) continue;

    const text = cleanText(row[1]);
    if (!text) continue;

    // 같은 과목의 여러 행은 합침
    if (result[subj]) {
      result[subj] += '\n\n' + text;
    } else {
      result[subj] = text;
    }
  }

  return result;
}

// ── Sheet 6: 평가 ──────────────────────────────────

function parseSheet6(wb) {
  const ws = findSheet(wb, ['평가', '6_평가']);
  if (!ws) return {};

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) return {};

  const headerIdx = findHeaderRow(rows, ['과목명', '과목']);

  const result = {};
  let lastSubject = '';

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    let subj = cleanText(row[0]);
    if (!subj || subj === '과목명' || subj === '과목') subj = lastSubject;
    else lastSubject = subj;
    if (!subj) continue;

    const text = cleanText(row[1]);
    if (!text) continue;

    if (result[subj]) {
      result[subj] += '\n\n' + text;
    } else {
      result[subj] = text;
    }
  }

  return result;
}

// ── Sheet 7: 영역별 요약 ──────────────────────────────

function parseSheet7(wb) {
  const ws = findSheet(wb, ['영역별 요약', '7_영역요약']);
  if (!ws) return {};

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) return {};

  const headerIdx = findHeaderRow(rows, ['과목명', '과목']);

  // { "subject::area": keywords[] }
  const result = {};
  let lastSubject = '';

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    let subj = cleanText(row[0]);
    if (!subj || subj === '과목명' || subj === '과목') subj = lastSubject;
    else lastSubject = subj;
    if (!subj) continue;

    const area = cleanText(row[1]);
    if (!area) continue;

    // 키워드는 쉼표 구분 문자열 or 이미 배열일 수 있음
    const raw = cleanText(row[3]);
    const keywords = raw
      ? raw.split(/[,，、\s]+/).map(k => k.trim()).filter(Boolean)
      : [];

    const key = `${subj}::${area}`;
    result[key] = keywords;
  }

  return result;
}

// ═══════════════════════════════════════════════════
// 5. 통합 파서 (7시트 전체)
// ═══════════════════════════════════════════════════

function parseFullFile(filePath) {
  const wb = XLSX.readFile(filePath);
  const relPath = filePath.replace(BASE_DIR + '/', '');
  const folderName = relPath.split('/')[0];

  // Sheet 4: 성취기준 상세 (핵심)
  const standards = parseSheet4(wb);
  if (standards.length === 0) {
    console.log(`    [SKIP] 성취기준 없음: ${relPath}`);
    return [];
  }

  // Sheet 2~7: 부가 메타데이터
  const competenciesMap = parseSheet2(wb);
  const contentSystemMap = parseSheet3(wb);
  const teachingMap = parseSheet5(wb);
  const assessmentMap = parseSheet6(wb);
  const keywordsMap = parseSheet7(wb);

  // 성취기준에 메타데이터 병합
  return standards.map(s => {
    const gradeGroup = deriveGradeGroup(s.code);
    const schoolLevel = deriveSchoolLevel(gradeGroup);

    // 교과그룹 결정
    let subjectGroup = SUBJECT_GROUP_MAP[s.subject];
    if (!subjectGroup && FOLDER_GROUP_MAP[folderName]) {
      subjectGroup = FOLDER_GROUP_MAP[folderName];
    }
    if (!subjectGroup) subjectGroup = '기타';

    // content_system: subject + area 키로 조회
    const csKey = `${s.subject}::${s.area}`;
    const contentSystem = contentSystemMap[csKey] || null;

    // keywords: Sheet 7의 영역별 키워드, 없으면 content에서 추출
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
      competencies: competenciesMap[s.subject] || null,
      content_system: contentSystem,
      teaching_learning: teachingMap[s.subject] || null,
      assessment_guide: assessmentMap[s.subject] || null,
      keywords,
    };
  });
}

// ═══════════════════════════════════════════════════
// 6. 메인
// ═══════════════════════════════════════════════════

function main() {
  console.log('=== 교육과정 종합 ETL 시작 ===\n');

  if (!existsSync(BASE_DIR)) {
    console.error(`ERROR: 데이터 디렉토리 없음: ${BASE_DIR}`);
    console.error('먼저 압축을 풀어주세요:');
    console.error('  unzip -o "/Users/greatsong/Downloads/outputs/2022_개정_교육과정_종합분석표_최종_final.zip" -d /tmp/curriculum-data/');
    process.exit(1);
  }

  // 1. 파일 탐색 및 선택
  const allFiles = walkXlsx(BASE_DIR);
  console.log(`총 xlsx 파일 발견: ${allFiles.length}개`);

  const selected = selectFiles(allFiles);
  console.log(`선택된 파일: ${selected.length}개\n`);

  // 2. 파일별 파싱
  let allStandards = [];
  const fileStats = [];

  for (const f of selected) {
    const rel = f.replace(BASE_DIR + '/', '');
    try {
      const standards = parseFullFile(f);
      fileStats.push({ file: rel, count: standards.length });
      console.log(`  ${rel}: ${standards.length}개`);
      allStandards.push(...standards);
    } catch (err) {
      console.error(`  ERROR: ${rel}: ${err.message}`);
    }
  }

  console.log(`\n파싱 합계: ${allStandards.length}개`);

  // 3. 중복 제거 (code 기준, content가 더 긴 쪽 우선)
  const seen = new Map();
  for (const s of allStandards) {
    const existing = seen.get(s.code);
    if (!existing) {
      seen.set(s.code, s);
    } else {
      // 더 완전한 데이터 우선: explanation이 있는 쪽, content가 긴 쪽
      const score = (item) =>
        (item.explanation ? 10 : 0) +
        (item.content_system ? 5 : 0) +
        item.content.length;
      if (score(s) > score(existing)) {
        seen.set(s.code, s);
      }
    }
  }

  const deduped = [...seen.values()];
  const dupCount = allStandards.length - deduped.length;
  console.log(`중복 제거 후: ${deduped.length}개 (${dupCount}개 중복)`);

  // 4. 정렬 (교과그룹 → 코드)
  deduped.sort((a, b) => {
    if (a.subject_group !== b.subject_group) return a.subject_group.localeCompare(b.subject_group);
    return a.code.localeCompare(b.code);
  });

  // 5. 통계 출력
  printStats(deduped);

  // 6. JS 파일 출력 (로컬 폴백용)
  const jsOutPath = join(__dirname, '..', 'server', 'data', 'standards_full.js');
  const jsContent = `/**
 * 교육과정 성취기준 데이터 (자동 생성 - 2022 개정 교육과정 종합 ETL)
 * 총 ${deduped.length}개 성취기준, 7시트 확장 메타데이터 포함
 * 생성일: ${new Date().toISOString().split('T')[0]}
 * 소스: 2022_개정_교육과정_종합분석표_최종 (${selected.length}개 xlsx)
 */

export const ALL_STANDARDS = ${JSON.stringify(deduped, null, 2)};
`;
  writeFileSync(jsOutPath, jsContent, 'utf-8');
  console.log(`\nJS 출력: ${jsOutPath}`);

  // 7. JSON 파일 출력 (Supabase import용)
  const resultsDir = join(__dirname, 'results');
  if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });

  const jsonOutPath = join(resultsDir, 'standards_full.json');
  writeFileSync(jsonOutPath, JSON.stringify(deduped, null, 2), 'utf-8');
  console.log(`JSON 출력: ${jsonOutPath}`);

  console.log(`\n=== 완료: ${deduped.length}개 성취기준 ===`);
}

function printStats(standards) {
  console.log('\n────── 통계 ──────');

  // 교과그룹별
  const byGroup = {};
  standards.forEach(s => {
    byGroup[s.subject_group] = (byGroup[s.subject_group] || 0) + 1;
  });
  console.log('\n[교과그룹별]');
  Object.entries(byGroup)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  // 학년군별
  const byGrade = {};
  standards.forEach(s => {
    byGrade[s.grade_group] = (byGrade[s.grade_group] || 0) + 1;
  });
  console.log('\n[학년군별]');
  Object.entries(byGrade)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  // 학교급별
  const bySchool = {};
  standards.forEach(s => {
    bySchool[s.school_level] = (bySchool[s.school_level] || 0) + 1;
  });
  console.log('\n[학교급별]');
  Object.entries(bySchool)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  // 과목 수
  const subjects = new Set(standards.map(s => s.subject));
  console.log(`\n총 과목: ${subjects.size}개`);

  // 확장 메타데이터 커버리지
  const withExplanation = standards.filter(s => s.explanation).length;
  const withContentSystem = standards.filter(s => s.content_system).length;
  const withCompetencies = standards.filter(s => s.competencies).length;
  const withTeaching = standards.filter(s => s.teaching_learning).length;
  const withAssessment = standards.filter(s => s.assessment_guide).length;

  console.log('\n[확장 메타데이터 커버리지]');
  console.log(`  explanation:       ${withExplanation}/${standards.length} (${pct(withExplanation, standards.length)})`);
  console.log(`  content_system:    ${withContentSystem}/${standards.length} (${pct(withContentSystem, standards.length)})`);
  console.log(`  competencies:      ${withCompetencies}/${standards.length} (${pct(withCompetencies, standards.length)})`);
  console.log(`  teaching_learning: ${withTeaching}/${standards.length} (${pct(withTeaching, standards.length)})`);
  console.log(`  assessment_guide:  ${withAssessment}/${standards.length} (${pct(withAssessment, standards.length)})`);
}

function pct(n, total) {
  return total === 0 ? '0%' : (n / total * 100).toFixed(1) + '%';
}

main();
