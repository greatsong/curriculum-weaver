/**
 * xlsx 종합분석표 → standards.js 변환 스크립트
 *
 * 입력: /tmp/curriculum_check/2022_개정_교육과정_종합분석표_최종/ (7시트 형식 xlsx)
 * 출력: server/data/standards.js (통합 성취기준 데이터)
 *
 * 과학과(별책09)는 xlsx 데이터가 불완전하므로 기존 standards.js에서 보존
 */

import XLSX from 'xlsx';
import { readdirSync, statSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_DIR = '/tmp/curriculum_check/2022_개정_교육과정_종합분석표_최종';

// ── 교과그룹 매핑 ──
const SUBJECT_GROUP_MAP = {
  // 별책02 초등 통합교과
  '바른 생활': '통합교과', '슬기로운 생활': '통합교과', '즐거운 생활': '통합교과',

  // 별책05 국어과
  '국어': '국어', '공통국어1': '국어', '공통국어2': '국어', '공통국어1, 공통국어2': '국어',
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

  // 별책08 수학과
  '수학': '수학', '공통수학1': '수학', '공통수학2': '수학', '공통수학1, 공통수학2': '수학',
  '기본수학1': '수학', '기본수학2': '수학', '기본수학1, 기본수학2': '수학', '대수': '수학',
  '미적분Ⅰ': '수학', '확률과 통계': '수학', '미적분Ⅱ': '수학',
  '기하': '수학', '경제 수학': '수학', '인공지능 수학': '수학',
  '직무 수학': '수학', '수학과 문화': '수학', '실용 통계': '수학',
  '수학과제 탐구': '수학',

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

// 별책22, 23은 과목이 너무 많아서 폴더 기반으로 매핑
const FOLDER_GROUP_MAP = {
  '별책22_예술계열전문교과': '예술계열전문',
  '별책23_산업수요전문교과': '산업수요전문',
};

// ── 학교급·학년군 추정 ──
function inferSchoolLevel(code, filePath) {
  if (filePath.includes('초등')) return { school_level: '초등학교', grade_group: '' };
  if (filePath.includes('중등')) return { school_level: '', grade_group: '' };

  // 코드에서 추정
  const m = code.match(/\[(\d+)/);
  if (!m) return { school_level: '', grade_group: '' };
  const num = parseInt(m[1]);

  if (num <= 6) return { school_level: '초등학교', grade_group: `${num}학년` };
  if (num === 9) return { school_level: '중학교', grade_group: '중1~3' };
  if (num === 10) return { school_level: '고등학교', grade_group: '고공통' };
  if (num === 12) return { school_level: '고등학교', grade_group: '고선택' };

  // 학년 번호 기반
  if (num >= 3 && num <= 6) return { school_level: '초등학교', grade_group: `${num}학년` };
  if (num >= 7 && num <= 9) return { school_level: '중학교', grade_group: '중1~3' };
  return { school_level: '고등학교', grade_group: '고선택' };
}

function inferGradeGroup(code, subject) {
  const m = code.match(/\[(\d+)/);
  if (!m) return '기타';
  const num = parseInt(m[1]);

  if (num >= 2 && num <= 6) return `초${num}`;
  if (num === 9) return '중1~3';
  if (num === 10) return '고공통';
  if (num === 12) return '고선택';
  return '기타';
}

// ── 키워드 추출 ──
const STOP_WORDS = new Set([
  '있다', '한다', '이해', '설명', '수', '것', '대한', '위해', '통해',
  '관련', '다양한', '활용', '과정', '바탕', '기반', '능력', '기르기',
  '위한', '대해', '등', '및', '또는', '이를', '함으로써', '하고',
  '하여', '하는', '것이다', '있는', '되는', '하기', '같은', '가지',
  '따라', '적절한', '적절히', '필요한', '중요한', '알고', '알아',
]);

function extractKeywords(text, maxCount = 5) {
  if (!text) return [];
  const tokens = text.match(/[가-힣]{2,}/g) || [];
  const filtered = tokens.filter(t => !STOP_WORDS.has(t));
  // 빈도순 상위 N개
  const freq = {};
  filtered.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCount)
    .map(([w]) => w);
}

// ── 헤더 행 찾기 (타이틀 행이 있는 파일 대응) ──
function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const first = String(rows[i][0] || '').trim();
    // "과목명" 또는 "과목" 으로 시작하는 행이 헤더
    if (first === '과목명' || first === '과목') return i;
  }
  return 0; // 못 찾으면 첫 행을 헤더로 간주
}

// ── 헤더 컬럼 인덱스 매핑 ──
function mapHeaderColumns(headerRow) {
  const map = {};
  headerRow.forEach((col, idx) => {
    const c = String(col).trim();
    if (c === '과목명' || c === '과목') map.subject = idx;
    if (c === '영역') map.area = idx;
    if (c.includes('성취기준') && c.includes('코드')) map.code = idx;
    if (c === '성취기준' || c === '성취기준 내용') map.content = idx;
    if (c.includes('해설') || c === '성취기준 해설') map.explanation = idx;
    if (c.includes('고려사항') || c.includes('적용')) map.appNotes = idx;
  });
  // "성취기준" 컬럼이 코드와 별도로 있는 경우 구분
  // 헤더에 "성취기준코드"와 "성취기준"이 따로 있으면 content 매핑 확인
  if (map.code !== undefined && map.content === undefined) {
    // 코드 다음 컬럼이 content일 가능성
    headerRow.forEach((col, idx) => {
      if (idx > map.code && String(col).trim() === '성취기준') map.content = idx;
    });
  }
  return map;
}

// ── 7시트 형식 파싱 ──
function parse7SheetFile(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['성취기준 상세'];
  if (!ws) return [];

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) return [];

  // 헤더 행 찾기 (타이틀 행이 있는 파일 대응)
  const headerIdx = findHeaderRow(rows);
  const headerRow = rows[headerIdx];
  const colMap = mapHeaderColumns(headerRow);

  // 표준 6열 형식 폴백 (과목명, 영역, 성취기준코드, 성취기준, 해설, 적용 시 고려사항)
  const iSubject = colMap.subject ?? 0;
  const iArea = colMap.area ?? 1;
  const iCode = colMap.code ?? 2;
  const iContent = colMap.content ?? 3;
  const iExplanation = colMap.explanation ?? 4;
  const iAppNotes = colMap.appNotes ?? 5;

  const results = [];
  const relPath = filePath.replace(BASE_DIR + '/', '');
  const folderName = relPath.split('/')[0];

  // 과목명이 비어있는 행은 직전 과목명 상속
  let lastSubject = '';

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const rawCode = row[iCode];
    if (!rawCode || !String(rawCode).trim().startsWith('[')) continue;

    let rawSubject = String(row[iSubject] || '').trim();
    if (rawSubject === '과목' || rawSubject === '과목명') continue;
    if (!rawSubject) rawSubject = lastSubject;
    else lastSubject = rawSubject;

    const cleanCode = String(rawCode).trim();
    const cleanContent = String(row[iContent] || '').trim();
    const cleanArea = String(row[iArea] || '').trim();
    const cleanExplanation = String(row[iExplanation] || '').trim();
    const cleanAppNotes = String(row[iAppNotes] || '').trim();

    if (!cleanContent) continue;

    // 교과그룹 결정
    let subjectGroup = SUBJECT_GROUP_MAP[rawSubject];
    if (!subjectGroup && FOLDER_GROUP_MAP[folderName]) {
      subjectGroup = FOLDER_GROUP_MAP[folderName];
    }
    if (!subjectGroup) {
      subjectGroup = '기타';
    }

    const { school_level } = inferSchoolLevel(cleanCode, filePath);
    const gradeGroup = inferGradeGroup(cleanCode, rawSubject);

    results.push({
      code: cleanCode,
      subject_group: subjectGroup,
      subject: rawSubject,
      grade_group: gradeGroup,
      school_level: school_level || (filePath.includes('초등') ? '초등학교' : filePath.includes('중등') ? '' : ''),
      curriculum_category: '',
      area: cleanArea,
      domain: '',
      content: cleanContent,
      keywords: extractKeywords(cleanContent + ' ' + cleanArea),
      explanation: cleanExplanation,
      application_notes: cleanAppNotes,
    });
  }

  return results;
}

// ── 메인 ──
function main() {
  console.log('=== xlsx → standards.js 변환 시작 ===\n');

  // 1. xlsx 파일 목록
  function walk(dir) {
    let results = [];
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) results = results.concat(walk(p));
      else if (f.endsWith('.xlsx') && !f.startsWith('~') && !f.startsWith('.~')) results.push(p);
    }
    return results;
  }

  const allXlsx = walk(BASE_DIR).sort();
  console.log(`총 xlsx 파일: ${allXlsx.length}개\n`);

  // 2. 파일별 필터: 중복 파일 제외 (가장 완전한 버전만 사용)
  // 같은 별책의 여러 버전 중 "교육과정_종합분석표" > "종합분석표" > 기타 우선
  const filesByFolder = {};
  for (const f of allXlsx) {
    const rel = f.replace(BASE_DIR + '/', '');
    const folder = rel.split('/')[0];
    if (!filesByFolder[folder]) filesByFolder[folder] = [];
    filesByFolder[folder].push(f);
  }

  // 우선순위: 초등/중등 구분된 파일 우선 사용
  const selectedFiles = [];
  for (const [folder, files] of Object.entries(filesByFolder)) {
    // 별책09 과학과 → 건너뛰기 (기존 데이터 사용)
    if (folder === '별책09_과학과') {
      console.log(`⏭  ${folder}: 기존 데이터 보존 (xlsx 불완전)`);
      continue;
    }

    // 별책10은 실과/기술가정/정보 3개를 모두 포함해야 함
    if (folder === '별책10_실과기술가정정보') {
      selectedFiles.push(...files);
      continue;
    }

    // 초등/중등 파일이 있으면 그것만 사용, 아니면 전체 사용
    const elemFiles = files.filter(f => f.includes('초등'));
    const secFiles = files.filter(f => f.includes('중등'));

    if (elemFiles.length > 0 || secFiles.length > 0) {
      // 초등/중등으로 구분된 파일이 있는 경우
      // "교육과정_종합분석표" 우선, 없으면 그냥 종합분석표
      for (const subFiles of [elemFiles, secFiles]) {
        if (subFiles.length === 0) continue;
        const preferred = subFiles.find(f => f.includes('교육과정_종합분석표')) || subFiles[0];
        selectedFiles.push(preferred);
      }
    } else {
      // 초등/중등 구분 없는 파일 (교양교과, 전문교과 등)
      selectedFiles.push(...files);
    }
  }

  console.log(`\n선택된 파일: ${selectedFiles.length}개\n`);

  // 3. 파싱
  let allStandards = [];
  for (const f of selectedFiles) {
    const rel = f.replace(BASE_DIR + '/', '');
    const standards = parse7SheetFile(f);
    console.log(`  ${rel}: ${standards.length}개`);
    allStandards.push(...standards);
  }

  console.log(`\nxlsx에서 파싱된 성취기준: ${allStandards.length}개`);

  // 4. 기존 과학 데이터 보존
  const backupPath = join(__dirname, '..', 'server', 'data', 'backup_20260327', 'standards.js');
  // dynamic import 대신 파일 내용에서 과학 데이터 추출
  const oldData = readFileSync(join(__dirname, '..', 'server', 'data', 'backup_20260327', 'standards.js'), 'utf-8');
  const match = oldData.match(/export const ALL_STANDARDS = (\[[\s\S]*\]);/);
  if (match) {
    const oldStandards = JSON.parse(match[1]);
    const scienceStandards = oldStandards.filter(s => s.subject_group === '과학');
    console.log(`\n기존 과학 데이터 보존: ${scienceStandards.length}개`);
    allStandards.push(...scienceStandards);
  }

  // 5. 중복 제거 (code 기준)
  const seen = new Map();
  for (const s of allStandards) {
    const existing = seen.get(s.code);
    if (!existing) {
      seen.set(s.code, s);
    } else {
      // content가 더 긴 쪽 우선
      if (s.content.length > existing.content.length) {
        seen.set(s.code, s);
      }
    }
  }

  const deduped = [...seen.values()];
  console.log(`중복 제거 후: ${deduped.length}개 (${allStandards.length - deduped.length}개 중복 제거)`);

  // 6. 교과그룹별 통계
  const stats = {};
  deduped.forEach(s => {
    stats[s.subject_group] = (stats[s.subject_group] || 0) + 1;
  });
  console.log('\n교과그룹별 성취기준 수:');
  Object.entries(stats).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`  ${k}: ${v}`);
  });

  // 7. 정렬 (교과그룹 → 코드)
  deduped.sort((a, b) => {
    if (a.subject_group !== b.subject_group) return a.subject_group.localeCompare(b.subject_group);
    return a.code.localeCompare(b.code);
  });

  // 8. 파일 출력
  const output = `/**
 * 교육과정 성취기준 데이터 (자동 생성 - 2022 개정 교육과정)
 * 총 ${deduped.length}개 성취기준
 * 생성일: ${new Date().toISOString().split('T')[0]}
 * 소스: 2022_개정_교육과정_종합분석표 xlsx + 기존 과학과 데이터
 */

export const ALL_STANDARDS = ${JSON.stringify(deduped, null, 2)};
`;

  const outPath = join(__dirname, '..', 'server', 'data', 'standards_new.js');
  writeFileSync(outPath, output, 'utf-8');
  console.log(`\n✅ 출력: ${outPath}`);
  console.log(`총 ${deduped.length}개 성취기준`);
}

main();
