#!/usr/bin/env node
/**
 * 교과 간 연결 대규모 생성 미션 스크립트
 *
 * TIER 1~4 우선순위에 따라 교과 쌍별 링크를 생성하고,
 * 평가 기준에 도달하지 못하면 최대 10회 반복 개선한다.
 * 각 라운드마다 중간 보고서를 작성한다.
 *
 * 사용법: node scripts/generateLinksMission.js
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── 설정 ───
const MODEL = 'claude-sonnet-4-20250514';
const CONCURRENCY = 5;
const OUTPUT_DIR = path.join(__dirname, 'mission_output');
const REPORT_DIR = path.join(__dirname, 'mission_reports');
const PROGRESS_FILE = path.join(OUTPUT_DIR, 'progress.json');
const FINAL_OUTPUT = path.join(__dirname, '..', 'server', 'data', 'generatedLinksMission.js');
const MAX_ITERATIONS = 10;

// ─── 평가 기준 ───
const EVALUATION_CRITERIA = {
  // 1. 커버리지: TIER1 교과 중 링크 ≥5개인 비율
  tier1CoverageTarget: 1.0,      // 100%
  // 2. 커버리지: TIER2 교과 중 링크 ≥3개인 비율
  tier2CoverageTarget: 0.9,      // 90%
  // 3. 전체 새 링크 수
  minTotalLinks: 2000,
  // 4. 교과당 최소 연결 파트너 교과 수 (TIER1)
  minPartnerSubjects: 3,
  // 5. 연결 유형 다양성: cross_subject 비율 < 90%
  maxCrossSubjectRatio: 0.90,
  // 6. rationale 최소 길이 (자)
  minRationaleLength: 30,
  // 7. 통과 기준 (전체 점수 0~100)
  passScore: 75,
};

// ─── TIER 정의 ───
const TIER1_SUBJECTS = [
  '통합과학1', '통합과학2', '과학탐구실험1', '과학탐구실험2',
  '공통국어1, 공통국어2', '공통수학1, 공통수학2',
  '공통영어1·2', '기본수학1, 기본수학2', '기본영어1·2',
  '통합사회1', '통합사회2', '한국사1', '한국사2'
];

const TIER2_SUBJECTS = [
  '미적분Ⅰ', '미적분Ⅱ', '영어Ⅰ', '영어Ⅱ',
  '생태와 환경', '보건', '논리와 사고', '인간과 심리',
  '인간과 철학', '인간과 경제활동', '진로와 직업',
  '교육의 이해', '논술', '삶과 종교', '고급 미적분'
];

const TIER3_SUBJECTS = [
  '고급 물리학', '고급 화학', '고급 생명과학', '고급 지구과학',
  '고급 대수', '고급 기하', '이산 수학', '전문 수학',
  '정보과학', '과학과제 연구', '물리학 실험', '화학 실험',
  '생명과학 실험', '지구과학 실험'
];

const TIER4_SUBJECTS = [
  '화학', '생활 일본어', '생활 베트남어', '아동발달과 부모(융합선택)',
  '한문', '실생활 영어 회화', '지구시스템과학', '행성우주과학',
  '세포와 물질대사', '직무 수학', '수학과제 탐구', '주제 탐구 독서'
];

// 풍부한 링크를 가진 파트너 교과군 (subject_group 기준)
const RICH_PARTNER_GROUPS = [
  '국어', '수학', '과학', '기술·가정', '도덕', '체육', '미술', '정보', '실과', '음악', '사회', '영어'
];

// ─── 유틸리티 ───
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function linkTypeAbbrev(lt) {
  const map = { cross_subject: 'cs', same_concept: 'sc', prerequisite: 'pr', application: 'ap', extension: 'ex' };
  return map[lt] || 'cs';
}

function linkTypeFromAbbrev(abbrev) {
  const map = { cs: 'cross_subject', sc: 'same_concept', pr: 'prerequisite', ap: 'application', ex: 'extension' };
  return map[abbrev] || 'cross_subject';
}

function normalizeSourceTarget(source, target) {
  return source < target ? [source, target] : [target, source];
}

// ─── 데이터 로드 ───
async function loadAllData() {
  const { ALL_STANDARDS } = await import('../server/data/standards.js');
  const { GENERATED_LINKS } = await import('../server/data/generatedLinks.js');

  // 코드 → 교과 매핑
  const codeToStandard = new Map();
  const subjectToStandards = new Map();
  const subjectGroupToSubjects = new Map();

  ALL_STANDARDS.forEach(s => {
    codeToStandard.set(s.code, s);
    if (!subjectToStandards.has(s.subject)) subjectToStandards.set(s.subject, []);
    subjectToStandards.get(s.subject).push(s);
    if (!subjectGroupToSubjects.has(s.subject_group)) subjectGroupToSubjects.set(s.subject_group, new Set());
    subjectGroupToSubjects.get(s.subject_group).add(s.subject);
  });

  // 기존 링크를 Set으로
  const existingLinkKeys = new Set();
  GENERATED_LINKS.forEach(([src, tgt]) => {
    const [a, b] = normalizeSourceTarget(src, tgt);
    existingLinkKeys.add(`${a}|${b}`);
  });

  return {
    standards: ALL_STANDARDS,
    existingLinks: GENERATED_LINKS,
    codeToStandard,
    subjectToStandards,
    subjectGroupToSubjects,
    existingLinkKeys,
    validCodes: new Set(ALL_STANDARDS.map(s => s.code)),
  };
}

// ─── 교과 쌍 매칭 전략 ───
function buildSubjectPairs(targetSubjects, data) {
  const pairs = [];

  for (const subjectName of targetSubjects) {
    const standards = data.subjectToStandards.get(subjectName);
    if (!standards || standards.length === 0) continue;

    const subjectGroup = standards[0].subject_group;

    // 파트너 교과군에서 개별 교과를 선택
    for (const partnerGroup of RICH_PARTNER_GROUPS) {
      if (partnerGroup === subjectGroup) continue; // 같은 교과군 제외

      const partnerSubjects = data.subjectGroupToSubjects.get(partnerGroup);
      if (!partnerSubjects) continue;

      // 파트너 교과군 내의 각 교과 중 성취기준이 5개 이상인 것
      for (const partnerSubject of partnerSubjects) {
        const partnerStandards = data.subjectToStandards.get(partnerSubject);
        if (!partnerStandards || partnerStandards.length < 5) continue;

        // 학교급 인접 필터링
        const schoolLevels = new Set(standards.map(s => s.school_level).filter(Boolean));
        const partnerSchoolLevels = new Set(partnerStandards.map(s => s.school_level).filter(Boolean));

        // 학교급 정보가 없으면 매칭 허용, 있으면 인접만 허용
        if (schoolLevels.size > 0 && partnerSchoolLevels.size > 0) {
          const levels = ['초등학교', '중학교', '고등학교'];
          const minA = Math.min(...[...schoolLevels].map(l => levels.indexOf(l)).filter(i => i >= 0));
          const maxA = Math.max(...[...schoolLevels].map(l => levels.indexOf(l)).filter(i => i >= 0));
          const minB = Math.min(...[...partnerSchoolLevels].map(l => levels.indexOf(l)).filter(i => i >= 0));
          const maxB = Math.max(...[...partnerSchoolLevels].map(l => levels.indexOf(l)).filter(i => i >= 0));

          if (minA >= 0 && minB >= 0) {
            // 인접 학교급: 차이가 1 이하
            if (Math.abs(minA - maxB) > 1 && Math.abs(maxA - minB) > 1) continue;
          }
        }

        pairs.push({
          subject: subjectName,
          partner: partnerSubject,
          subjectStandards: standards,
          partnerStandards: partnerStandards,
        });
      }
    }
  }

  return pairs;
}

// ─── Claude API 호출 ───
async function generateLinksForPair(client, pair, existingLinkKeys) {
  const { subject, partner, subjectStandards, partnerStandards } = pair;

  const formatStandards = (stds) => stds.map(s => {
    const parts = [`${s.code} [${s.subject}] ${s.content}`];
    if (s.explanation) parts.push(`  해설: ${s.explanation.substring(0, 150)}`);
    return parts.join('\n');
  }).join('\n');

  const prompt = `당신은 2022 개정 교육과정 전문가입니다. 아래 두 교과의 성취기준을 분석하여 교육적으로 의미 있는 교차 교과 연결을 찾아주세요.

## 규칙
1. 키워드가 겹치는 것이 아니라, **실제 교실에서 융합 수업으로 구현할 수 있는 연결**만 제안하세요.
2. 연결 유형:
   - cross_subject (cs): 서로 다른 관점에서 같은 현상/주제를 다룸
   - same_concept (sc): 본질적으로 동일한 개념을 두 교과에서 다룸
   - application (ap): 한 교과의 내용이 다른 교과에서 직접 활용됨
   - prerequisite (pr): 한쪽을 먼저 배워야 다른 쪽을 이해할 수 있음
   - extension (ex): 기본 학습을 심화·확장하는 관계
3. rationale은 **왜 이 두 성취기준을 함께 다루면 교육적으로 의미 있는지** 2~3문장으로 설명하세요. 교사가 읽고 "이걸로 융합 수업 해볼 수 있겠다"라고 느낄 수 있어야 합니다.
4. 무리한 연결은 만들지 마세요. 연결이 없으면 빈 배열을 반환하세요.
5. integration_theme이 자연스러운 경우 융합 주제를 제안하세요.
6. lesson_hook이 떠오르면 수업 아이디어를 한 줄로 제안하세요.

## 교과A: ${subject}
${formatStandards(subjectStandards)}

## 교과B: ${partner}
${formatStandards(partnerStandards)}

## 출력 형식 (JSON 배열)
\`\`\`json
[
  {
    "source": "[성취기준코드A]",
    "target": "[성취기준코드B]",
    "link_type": "cs|sc|ap|pr|ex",
    "rationale": "교육적 연결 근거 2~3문장",
    "integration_theme": "융합 주제 (선택)",
    "lesson_hook": "수업 아이디어 한 줄 (선택)"
  }
]
\`\`\`

존재하지 않는 코드를 만들지 마세요. 위에 나열된 코드만 사용하세요.`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text;
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\[[\s\S]*?\])/);

    if (jsonMatch) {
      const rawLinks = JSON.parse(jsonMatch[1]);
      if (!Array.isArray(rawLinks)) return [];

      // 검증 + 정규화 + 중복 제거
      return rawLinks.filter(l => {
        if (!l.source || !l.target || !l.rationale) return false;
        const [a, b] = normalizeSourceTarget(l.source, l.target);
        const key = `${a}|${b}`;
        if (existingLinkKeys.has(key)) return false;
        l.source = a;
        l.target = b;
        return true;
      });
    }
  } catch (e) {
    console.error(`  API 오류 (${subject}×${partner}):`, e.message);
  }
  return [];
}

// ─── 평가 함수 ───
function evaluate(newLinks, data) {
  const scores = {};
  const details = {};

  // 새 링크의 교과별 카운트
  const linksBySubject = new Map();
  const partnersBySubject = new Map();

  newLinks.forEach(l => {
    const srcStd = data.codeToStandard.get(l.source);
    const tgtStd = data.codeToStandard.get(l.target);
    if (!srcStd || !tgtStd) return;

    [srcStd.subject, tgtStd.subject].forEach(subj => {
      linksBySubject.set(subj, (linksBySubject.get(subj) || 0) + 1);
    });

    if (!partnersBySubject.has(srcStd.subject)) partnersBySubject.set(srcStd.subject, new Set());
    if (!partnersBySubject.has(tgtStd.subject)) partnersBySubject.set(tgtStd.subject, new Set());
    partnersBySubject.get(srcStd.subject).add(tgtStd.subject);
    partnersBySubject.get(tgtStd.subject).add(srcStd.subject);
  });

  // 1. TIER1 커버리지 (링크 ≥5인 교과 비율)
  const tier1WithLinks = TIER1_SUBJECTS.filter(s => (linksBySubject.get(s) || 0) >= 5);
  const tier1Coverage = TIER1_SUBJECTS.length > 0 ? tier1WithLinks.length / TIER1_SUBJECTS.length : 0;
  scores.tier1Coverage = tier1Coverage;
  details.tier1Coverage = {
    covered: tier1WithLinks,
    uncovered: TIER1_SUBJECTS.filter(s => (linksBySubject.get(s) || 0) < 5),
    target: EVALUATION_CRITERIA.tier1CoverageTarget,
  };

  // 2. TIER2 커버리지 (링크 ≥3인 교과 비율)
  const tier2WithLinks = TIER2_SUBJECTS.filter(s => (linksBySubject.get(s) || 0) >= 3);
  const tier2Coverage = TIER2_SUBJECTS.length > 0 ? tier2WithLinks.length / TIER2_SUBJECTS.length : 0;
  scores.tier2Coverage = tier2Coverage;
  details.tier2Coverage = {
    covered: tier2WithLinks,
    uncovered: TIER2_SUBJECTS.filter(s => (linksBySubject.get(s) || 0) < 3),
    target: EVALUATION_CRITERIA.tier2CoverageTarget,
  };

  // 3. 총 링크 수
  scores.totalLinks = newLinks.length;
  details.totalLinks = { current: newLinks.length, target: EVALUATION_CRITERIA.minTotalLinks };

  // 4. TIER1 교과의 파트너 다양성
  const tier1PartnerDiversity = TIER1_SUBJECTS.map(s => ({
    subject: s,
    partners: partnersBySubject.get(s)?.size || 0,
  }));
  const avgPartners = tier1PartnerDiversity.reduce((sum, p) => sum + p.partners, 0) / TIER1_SUBJECTS.length;
  scores.partnerDiversity = Math.min(avgPartners / EVALUATION_CRITERIA.minPartnerSubjects, 1);
  details.partnerDiversity = { avg: avgPartners, target: EVALUATION_CRITERIA.minPartnerSubjects, perSubject: tier1PartnerDiversity };

  // 5. 연결 유형 다양성
  const typeCounts = {};
  newLinks.forEach(l => typeCounts[l.link_type] = (typeCounts[l.link_type] || 0) + 1);
  const csRatio = (typeCounts.cross_subject || 0) / Math.max(newLinks.length, 1);
  scores.typeDiversity = csRatio <= EVALUATION_CRITERIA.maxCrossSubjectRatio ? 1 : (1 - csRatio) / (1 - EVALUATION_CRITERIA.maxCrossSubjectRatio);
  details.typeDiversity = { distribution: typeCounts, csRatio, target: `< ${EVALUATION_CRITERIA.maxCrossSubjectRatio * 100}%` };

  // 6. Rationale 품질 (길이 기준)
  const shortRationales = newLinks.filter(l => (l.rationale || '').length < EVALUATION_CRITERIA.minRationaleLength);
  scores.rationaleQuality = 1 - (shortRationales.length / Math.max(newLinks.length, 1));
  details.rationaleQuality = { shortCount: shortRationales.length, total: newLinks.length, minLength: EVALUATION_CRITERIA.minRationaleLength };

  // 종합 점수 (가중 평균)
  const weights = {
    tier1Coverage: 30,
    tier2Coverage: 15,
    totalLinks: 20,
    partnerDiversity: 15,
    typeDiversity: 10,
    rationaleQuality: 10,
  };

  let totalScore = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const rawScore = key === 'totalLinks'
      ? Math.min(scores[key] / EVALUATION_CRITERIA.minTotalLinks, 1)
      : scores[key];
    totalScore += rawScore * weight;
    totalWeight += weight;
  }

  const finalScore = Math.round((totalScore / totalWeight) * 100);

  return {
    score: finalScore,
    pass: finalScore >= EVALUATION_CRITERIA.passScore,
    scores,
    details,
    summary: {
      totalNewLinks: newLinks.length,
      tier1Coverage: `${tier1WithLinks.length}/${TIER1_SUBJECTS.length} (${Math.round(tier1Coverage * 100)}%)`,
      tier2Coverage: `${tier2WithLinks.length}/${TIER2_SUBJECTS.length} (${Math.round(tier2Coverage * 100)}%)`,
      avgPartners: avgPartners.toFixed(1),
      csRatio: `${Math.round(csRatio * 100)}%`,
      shortRationales: shortRationales.length,
    }
  };
}

// ─── 중간 보고서 작성 ───
function writeReport(iteration, evaluation, newLinksThisRound, totalNewLinks, elapsed) {
  const timestamp = new Date().toISOString();
  const report = `# 중간 보고서 — 라운드 ${iteration}

## 메타정보
- 생성 시각: ${timestamp}
- 소요 시간: ${elapsed}분
- 라운드: ${iteration}/${MAX_ITERATIONS}

## 종합 점수: ${evaluation.score}/100 ${evaluation.pass ? '✅ 통과' : '❌ 미달'}
- 통과 기준: ${EVALUATION_CRITERIA.passScore}점

## 세부 평가

### 1. TIER1 커버리지 (가중치 30%)
- 현재: ${evaluation.summary.tier1Coverage}
- 목표: 100%
- 커버된 교과: ${evaluation.details.tier1Coverage.covered.join(', ') || '없음'}
- 미커버 교과: ${evaluation.details.tier1Coverage.uncovered.join(', ') || '없음'}

### 2. TIER2 커버리지 (가중치 15%)
- 현재: ${evaluation.summary.tier2Coverage}
- 목표: 90%
- 미커버 교과: ${evaluation.details.tier2Coverage.uncovered.join(', ') || '없음'}

### 3. 총 링크 수 (가중치 20%)
- 이번 라운드 생성: ${newLinksThisRound}개
- 누적 총 링크: ${totalNewLinks}개
- 목표: ${EVALUATION_CRITERIA.minTotalLinks}개

### 4. 파트너 다양성 (가중치 15%)
- TIER1 평균 파트너 교과 수: ${evaluation.summary.avgPartners}
- 목표: ${EVALUATION_CRITERIA.minPartnerSubjects}개 이상

### 5. 연결 유형 다양성 (가중치 10%)
- cross_subject 비율: ${evaluation.summary.csRatio}
- 목표: < ${EVALUATION_CRITERIA.maxCrossSubjectRatio * 100}%
- 분포: ${JSON.stringify(evaluation.details.typeDiversity.distribution)}

### 6. Rationale 품질 (가중치 10%)
- 짧은 rationale (< ${EVALUATION_CRITERIA.minRationaleLength}자): ${evaluation.summary.shortRationales}개

## 다음 라운드 전략
${evaluation.pass ? '평가 기준 통과! 추가 라운드 불필요.' : generateNextStrategy(evaluation)}
`;

  const reportPath = path.join(REPORT_DIR, `round_${String(iteration).padStart(2, '0')}_report.md`);
  fs.writeFileSync(reportPath, report);
  console.log(`📝 보고서 저장: ${reportPath}`);
  return reportPath;
}

// ─── 다음 라운드 전략 결정 ───
function generateNextStrategy(evaluation) {
  const strategies = [];

  if (evaluation.details.tier1Coverage.uncovered.length > 0) {
    strategies.push(`- TIER1 미커버 교과 집중 공략: ${evaluation.details.tier1Coverage.uncovered.join(', ')}`);
  }
  if (evaluation.details.tier2Coverage.uncovered.length > 0) {
    strategies.push(`- TIER2 미커버 교과 보강: ${evaluation.details.tier2Coverage.uncovered.join(', ')}`);
  }
  if (evaluation.scores.totalLinks < EVALUATION_CRITERIA.minTotalLinks) {
    strategies.push(`- 링크 수 부족 (${evaluation.scores.totalLinks}/${EVALUATION_CRITERIA.minTotalLinks}): 추가 교과 쌍 투입`);
  }
  if (evaluation.scores.partnerDiversity < 1) {
    const lowPartner = evaluation.details.partnerDiversity.perSubject.filter(p => p.partners < EVALUATION_CRITERIA.minPartnerSubjects);
    if (lowPartner.length > 0) {
      strategies.push(`- 파트너 부족 교과: ${lowPartner.map(p => `${p.subject}(${p.partners}개)`).join(', ')}`);
    }
  }

  return strategies.length > 0 ? strategies.join('\n') : '- 전반적 보강 필요';
}

// ─── 병렬 실행 (간단한 p-limit 구현) ───
async function pLimit(concurrency, tasks) {
  const results = [];
  let index = 0;

  async function runNext() {
    while (index < tasks.length) {
      const currentIndex = index++;
      results[currentIndex] = await tasks[currentIndex]();
    }
  }

  const workers = Array(Math.min(concurrency, tasks.length)).fill(null).map(() => runNext());
  await Promise.all(workers);
  return results;
}

// ─── 메인 실행 ───
async function main() {
  ensureDir(OUTPUT_DIR);
  ensureDir(REPORT_DIR);

  console.log('=== 교과 간 연결 대규모 생성 미션 시작 ===');
  console.log(`모델: ${MODEL}`);
  console.log(`동시 처리: ${CONCURRENCY}`);
  console.log(`최대 반복: ${MAX_ITERATIONS}`);
  console.log(`통과 기준: ${EVALUATION_CRITERIA.passScore}점\n`);

  // 데이터 로드
  const data = await loadAllData();
  console.log(`성취기준: ${data.standards.length}개`);
  console.log(`기존 링크: ${data.existingLinks.length}개`);
  console.log(`교과 수: ${data.subjectToStandards.size}개\n`);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // 기존 진행 로드
  let allNewLinks = [];
  let allNewLinkKeys = new Set();

  if (fs.existsSync(PROGRESS_FILE)) {
    const saved = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    allNewLinks = saved.links || [];
    allNewLinks.forEach(l => {
      const key = `${l.source}|${l.target}`;
      allNewLinkKeys.add(key);
      data.existingLinkKeys.add(key);
    });
    console.log(`이전 진행 복원: ${allNewLinks.length}개 링크\n`);
  }

  // ─── 반복 루프 ───
  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const iterStart = Date.now();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`라운드 ${iteration}/${MAX_ITERATIONS} 시작`);
    console.log(`${'='.repeat(60)}\n`);

    // 현재 평가로 어떤 교과가 부족한지 파악
    const preEval = evaluate(allNewLinks, data);

    // 이번 라운드에서 공략할 교과 결정
    let targetSubjects = [];

    if (iteration === 1) {
      // 라운드 1: TIER 1 전체
      targetSubjects = [...TIER1_SUBJECTS];
    } else if (iteration === 2) {
      // 라운드 2: TIER 2 전체
      targetSubjects = [...TIER2_SUBJECTS];
    } else if (iteration === 3) {
      // 라운드 3: TIER 3 전체
      targetSubjects = [...TIER3_SUBJECTS];
    } else if (iteration === 4) {
      // 라운드 4: TIER 4 보강
      targetSubjects = [...TIER4_SUBJECTS];
    } else {
      // 라운드 5+: 미커버/부족 교과만 집중 공략
      const uncoveredTier1 = preEval.details.tier1Coverage.uncovered;
      const uncoveredTier2 = preEval.details.tier2Coverage.uncovered;
      const lowPartner = preEval.details.partnerDiversity.perSubject
        .filter(p => p.partners < EVALUATION_CRITERIA.minPartnerSubjects)
        .map(p => p.subject);

      targetSubjects = [...new Set([...uncoveredTier1, ...uncoveredTier2, ...lowPartner])];

      if (targetSubjects.length === 0) {
        // 전체 TIER 1~3에서 링크 부족한 것 찾기
        const linksBySubject = new Map();
        allNewLinks.forEach(l => {
          const srcStd = data.codeToStandard.get(l.source);
          const tgtStd = data.codeToStandard.get(l.target);
          if (srcStd) linksBySubject.set(srcStd.subject, (linksBySubject.get(srcStd.subject) || 0) + 1);
          if (tgtStd) linksBySubject.set(tgtStd.subject, (linksBySubject.get(tgtStd.subject) || 0) + 1);
        });

        const allTargets = [...TIER1_SUBJECTS, ...TIER2_SUBJECTS, ...TIER3_SUBJECTS];
        targetSubjects = allTargets
          .filter(s => (linksBySubject.get(s) || 0) < 10)
          .slice(0, 20); // 한 라운드에 최대 20개 교과
      }
    }

    if (targetSubjects.length === 0) {
      console.log('모든 교과 충분히 커버됨. 조기 종료.');
      break;
    }

    console.log(`이번 라운드 대상 교과 (${targetSubjects.length}개):`);
    targetSubjects.forEach(s => console.log(`  - ${s}`));

    // 교과 쌍 생성
    const pairs = buildSubjectPairs(targetSubjects, data);
    console.log(`\n교과 쌍 ${pairs.length}개 생성됨`);

    // 병렬 생성
    let completedPairs = 0;
    let roundNewLinks = [];

    const tasks = pairs.map(pair => async () => {
      const links = await generateLinksForPair(client, pair, data.existingLinkKeys);

      // 코드 검증
      const validated = links.filter(l => {
        if (!data.validCodes.has(l.source) || !data.validCodes.has(l.target)) return false;
        if (l.source === l.target) return false;
        const key = `${l.source}|${l.target}`;
        if (allNewLinkKeys.has(key) || data.existingLinkKeys.has(key)) return false;
        if (!['cross_subject', 'same_concept', 'prerequisite', 'application', 'extension'].includes(l.link_type)) {
          l.link_type = 'cross_subject';
        }
        return true;
      });

      completedPairs++;
      if (validated.length > 0) {
        validated.forEach(l => {
          const key = `${l.source}|${l.target}`;
          allNewLinkKeys.add(key);
          data.existingLinkKeys.add(key);
        });
        roundNewLinks.push(...validated);
      }

      if (completedPairs % 10 === 0 || completedPairs === pairs.length) {
        console.log(`  진행: ${completedPairs}/${pairs.length} 쌍, 이번 라운드 ${roundNewLinks.length}개 링크`);
      }

      return validated;
    });

    await pLimit(CONCURRENCY, tasks);

    // 이번 라운드 결과 합산
    allNewLinks.push(...roundNewLinks);

    // 진행 저장
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
      links: allNewLinks,
      iteration,
      timestamp: new Date().toISOString()
    }));

    // 평가
    const elapsed = ((Date.now() - iterStart) / 1000 / 60).toFixed(1);
    const evaluation = evaluate(allNewLinks, data);

    console.log(`\n--- 라운드 ${iteration} 결과 ---`);
    console.log(`이번 라운드: +${roundNewLinks.length}개 링크`);
    console.log(`누적 총: ${allNewLinks.length}개 링크`);
    console.log(`종합 점수: ${evaluation.score}/100 ${evaluation.pass ? '✅ 통과' : '❌ 미달'}`);
    console.log(`TIER1 커버: ${evaluation.summary.tier1Coverage}`);
    console.log(`TIER2 커버: ${evaluation.summary.tier2Coverage}`);
    console.log(`소요 시간: ${elapsed}분`);

    // 보고서 작성
    writeReport(iteration, evaluation, roundNewLinks.length, allNewLinks.length, elapsed);

    if (evaluation.pass) {
      console.log(`\n🎉 평가 기준 통과! (${evaluation.score}점 >= ${EVALUATION_CRITERIA.passScore}점)`);
      break;
    }

    console.log(`\n⏭️ 기준 미달 (${evaluation.score}점 < ${EVALUATION_CRITERIA.passScore}점), 다음 라운드로...`);
  }

  // ─── 최종 저장 ───
  console.log(`\n${'='.repeat(60)}`);
  console.log('최종 결과 저장');
  console.log(`${'='.repeat(60)}\n`);

  // 압축 포맷으로 변환
  const compressed = allNewLinks.map(l =>
    `["${l.source}","${l.target}","${linkTypeAbbrev(l.link_type)}","${(l.rationale || '').replace(/"/g, '\\"').replace(/\n/g, ' ')}"]`
  );

  const output = `// AI 기반 교차 교과 연결 ${allNewLinks.length}개 (Mission Script 생성)
// 생성일: ${new Date().toISOString()}
// 형식: [source, target, link_type, rationale]
// link_type: cs=cross_subject, sc=same_concept, pr=prerequisite, ap=application, ex=extension
export const MISSION_LINKS = [
${compressed.join(',\n')}
];
`;

  fs.writeFileSync(FINAL_OUTPUT, output);
  console.log(`저장 완료: ${FINAL_OUTPUT}`);
  console.log(`총 새 링크: ${allNewLinks.length}개`);

  // 최종 평가
  const finalEval = evaluate(allNewLinks, data);
  console.log(`\n=== 최종 평가 ===`);
  console.log(`종합 점수: ${finalEval.score}/100`);
  console.log(`TIER1 커버: ${finalEval.summary.tier1Coverage}`);
  console.log(`TIER2 커버: ${finalEval.summary.tier2Coverage}`);
  console.log(`파트너 다양성: ${finalEval.summary.avgPartners}`);
  console.log(`유형 분포: ${JSON.stringify(finalEval.details.typeDiversity.distribution)}`);
}

main().catch(e => {
  console.error('치명적 오류:', e);
  process.exit(1);
});
