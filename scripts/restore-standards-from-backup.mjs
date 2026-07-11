/**
 * 정본 standards.js 오염 복원 스크립트 (2026-07-11 QA 심층 분석 후속)
 *
 * 배경: 3/27 xlsx 종합분석표 재파싱 때 xlsx 원본의 품질 문제가 정본에 유입됨.
 *  - 해설체 혼입: 영어("이 성취기준은 …") / 체육·음악("[코드]는 … 설정하였다"에서 코드 제거 후 조사 잔존 = 본문 유실)
 *  - 개행 유실: PDF→xlsx 개행 분절로 개행 뒤 문장 소실 (예: [12심독02-07])
 *  - 페이지 푸터 혼입: "78 선택 중심 교육과정" 류
 *
 * 복원 소스: server/data/backup_20260327/standards.js (재파싱 전 PDF 파싱본, 3,134개 — 본문 온전)
 *
 * 동작:
 *  1. 오염 코드 식별 (해설체 시작 / 조사 시작 / 푸터 혼입 / 마침표 미종결)
 *  2. backup에 온전본 있으면 content 교체 (개행→공백 정규화)
 *  3. 기존 해설체 content는 버리지 않고 explanation 필드로 이동 (비어 있을 때만)
 *  4. 푸터 혼입인데 backup 없으면 푸터 정규식 제거 폴백
 *  5. keywords 재추출 (parse-xlsx-to-standards.mjs 와 동일 로직)
 *  6. 복원 불가 건은 scripts/results/restore-exceptions-<date>.json 으로 출력
 *
 * 실행:
 *   node scripts/restore-standards-from-backup.mjs --dry-run   # 통계만
 *   node scripts/restore-standards-from-backup.mjs             # 실제 교체 (사전 백업 자동 생성)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CANONICAL = join(ROOT, 'server', 'data', 'standards.js');
const BACKUP = join(ROOT, 'server', 'data', 'backup_20260327', 'standards.js');
const DRY = process.argv.includes('--dry-run');

// ── parse-xlsx-to-standards.mjs 와 동일한 키워드 추출 ──
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
  const freq = {};
  filtered.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, maxCount).map(([w]) => w);
}

// ── 오염 판별 ──
const FOOTER_RE = /\d+\s*[가-힣]*\s*(교육과정|편제와|시간 배당)/;
function classify(content) {
  const c = (content || '').trim();
  if (!c) return null;
  const types = [];
  const firstSentence = c.split(/[.。]/)[0];
  if (/^(이\s*)?성취기준은\s/.test(c)) types.push('explanation_as_content');
  else if (/^(은|는|을|를|와|과)\s/.test(c)) types.push('headless_explanation');
  else if (/설정하였다$|설정한 것이다$/.test(firstSentence.trim())) types.push('explanation_as_content');
  if (FOOTER_RE.test(c)) types.push('page_tag_mixed');
  if (!/[.。!?]\s*$/.test(c)) types.push('unterminated');
  return types.length ? types : null;
}

// backup content 가 복원에 쓸 만큼 온전한지
function usableBackupContent(raw) {
  const c = (raw || '').replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (c.length < 10) return null;
  if (!/[.。]$/.test(c)) return null;
  if (/^(은|는|을|를|와|과)\s|^(이\s*)?성취기준은\s/.test(c)) return null;
  if (/설정하였다$|설정한 것이다$/.test(c.split(/[.。]/)[0].trim())) return null; // backup도 해설체면 사용 불가
  if (FOOTER_RE.test(c)) return null;
  return c;
}

// 해설체 → explanation 필드용 정리 (문두 조사 제거)
function asExplanation(content, types) {
  let c = (content || '').trim();
  if (types.includes('headless_explanation')) c = c.replace(/^(은|는|을|를|와|과)\s+/, '');
  c = c.replace(/^성취기준은\s+/, '이 성취기준은 '); // "성취기준은 …" 변종 → 자연스러운 해설문
  return c;
}

// ── 데이터 로드 ──
const { ALL_STANDARDS } = await import(CANONICAL);
const bkSrc = readFileSync(BACKUP, 'utf-8');
const bkMatch = bkSrc.match(/export const ALL_STANDARDS = (\[[\s\S]*\]);/);
if (!bkMatch) { console.error('backup 파싱 실패'); process.exit(1); }
const bkMap = new Map(JSON.parse(bkMatch[1]).map(s => [s.code, s]));

// ── 복원 ──
const stats = { total: 0, restored: 0, footerStripped: 0, explMoved: 0, exceptions: 0 };
const exceptions = [];
const changes = [];

const next = ALL_STANDARDS.map(s => {
  const types = classify(s.content);
  if (!types) return s;
  stats.total++;

  const out = { ...s };
  const bk = bkMap.get(s.code);
  const bkContent = bk ? usableBackupContent(bk.content) : null;
  let fixed = false;

  if (bkContent) {
    // 해설체였다면 기존 content를 explanation으로 보존
    if ((types.includes('explanation_as_content') || types.includes('headless_explanation')) && !(out.explanation || '').trim()) {
      out.explanation = asExplanation(s.content, types);
      stats.explMoved++;
    }
    out.content = bkContent;
    fixed = true;
    stats.restored++;
  } else if (types.includes('page_tag_mixed')) {
    // 푸터 제거 폴백: 마지막 문장 종결 이후의 푸터 꼬리를 자름
    const stripped = s.content.replace(/([.。])\s*\d+\s*[가-힣]*\s*(교육과정|편제와|시간 배당)[\s\S]*$/, '$1').trim();
    if (stripped !== s.content.trim() && /[.。]$/.test(stripped)) {
      out.content = stripped;
      fixed = true;
      stats.footerStripped++;
    }
  }

  if (fixed) {
    out.keywords = extractKeywords(out.content + ' ' + (out.area || ''));
    changes.push({ code: s.code, subject: s.subject, types, before: (s.content || '').slice(0, 60), after: out.content.slice(0, 60) });
    return out;
  }

  stats.exceptions++;
  exceptions.push({
    code: s.code, subject: s.subject, types,
    reason: bk ? 'backup도 불완전' : 'backup에 코드 없음',
    content: s.content,
  });
  return s;
});

console.log('=== 복원 통계 ===');
console.log(`오염 감지: ${stats.total}`);
console.log(`backup 복원: ${stats.restored} (해설→explanation 이동 ${stats.explMoved})`);
console.log(`푸터 제거 폴백: ${stats.footerStripped}`);
console.log(`예외(수동 보정 필요): ${stats.exceptions}`);
console.log('\n샘플 5건:');
changes.slice(0, 5).forEach(c => console.log(` ${c.code} [${c.types}]\n   전: ${c.before}\n   후: ${c.after}`));

const dateTag = '20260711';
const resultsDir = join(__dirname, 'results');
mkdirSync(resultsDir, { recursive: true });
writeFileSync(join(resultsDir, `restore-exceptions-${dateTag}.json`), JSON.stringify(exceptions, null, 2));
writeFileSync(join(resultsDir, `restore-changes-${dateTag}.json`), JSON.stringify(changes, null, 2));
console.log(`\n예외 목록: scripts/results/restore-exceptions-${dateTag}.json`);

if (DRY) { console.log('\n--dry-run: 파일 미변경'); process.exit(0); }

// ── 사전 백업 + 정본 재작성 ──
const preDir = join(ROOT, 'server', 'data', `backup_${dateTag}_prerestore`);
if (!existsSync(preDir)) {
  mkdirSync(preDir, { recursive: true });
  writeFileSync(join(preDir, 'standards.js'), readFileSync(CANONICAL, 'utf-8'));
  console.log(`사전 백업: server/data/backup_${dateTag}_prerestore/standards.js`);
}

const header = `/**
 * 교육과정 성취기준 데이터 (자동 생성 - 2022 개정 교육과정)
 * 총 ${next.length}개 성취기준
 * 생성일: 2026-03-27 (2026-07-11 오염 복원: 해설체/개행유실/푸터 ${stats.restored + stats.footerStripped}건 — restore-standards-from-backup.mjs)
 * 소스: 2022_개정_교육과정_종합분석표 xlsx + 기존 과학과 데이터 + backup_20260327 복원
 */

export const ALL_STANDARDS = `;
writeFileSync(CANONICAL, header + JSON.stringify(next, null, 2) + ';\n');
console.log(`\n정본 재작성 완료: server/data/standards.js (${next.length}개)`);
