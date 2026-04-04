/**
 * standards.js 최종 품질 수정 스크립트
 * 감사 보고서에서 발견된 6개 이슈를 일괄 처리
 */
import fs from 'fs';

const BASE = '/Users/greatsong/greatsong-project/curriculum-weaver';
const filepath = BASE + '/server/data/standards.js';
let content = fs.readFileSync(filepath, 'utf8');

const stats = {};

// === 1. 줄바꿈(\n) 제거 ===
// JSON 문자열 내부의 리터럴 줄바꿈을 공백으로 치환
// "content": "...text\nmore text..." → "...text more text..."
let nlCount = 0;
content = content.replace(/"(?:content|explanation|application_notes)": "([^"]*)"/g, (match, inner) => {
    if (inner.includes('\n')) {
        nlCount++;
        const cleaned = inner.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ');
        return match.replace(inner, cleaned);
    }
    return match;
});
stats['줄바꿈 정리'] = nlCount;

// === 2. (cid:XXXXX) 아티팩트 제거 ===
// 수학: "(cid:49685) 두 자리 수 범위의 덧셈과 뺄셈" → 제거
// 일본어: "(cid:XXXXX)" → 제거
let cidCount = 0;
content = content.replace(/\(cid:\d+\)\s*[^"\\]*/g, (match) => {
    cidCount++;
    return '';
});
stats['(cid:) 아티팩트 제거'] = cidCount;

// === 3. explanation 끝의 불릿 "•" 제거 ===
// "explanation": "...설정하였다. •" → "...설정하였다."
let bulletCount = 0;
content = content.replace(/"explanation": "([^"]*)"/g, (match, inner) => {
    // 끝에 • 또는 •\s 제거
    if (inner.trimEnd().endsWith('•')) {
        bulletCount++;
        const cleaned = inner.replace(/\s*•\s*$/, '').trimEnd();
        return '"explanation": "' + cleaned + '"';
    }
    return match;
});
stats['explanation 끝 불릿 제거'] = bulletCount;

// === 4. 페이지번호 + 섹션 헤더 누출 제거 ===
// "...설정하였다. 145 제2외국어과 교육과정" → "...설정하였다."
let pageCount = 0;
const pageHeaderRe = /\s+\d{1,3}\s+(?:제2외국어과|과학과|수학과|국어과|영어과|체육과|음악과|미술과|도덕과|한문과|실과\(기술[·⋅]가정\)\/정보과|공통|선택 중심)[^\\"]*교육과정/g;
const matches = content.match(pageHeaderRe);
if (matches) {
    pageCount = matches.length;
    content = content.replace(pageHeaderRe, '');
}
stats['페이지번호/헤더 제거'] = pageCount;

// === 5. 단어 분리 수정 ===
const wordFixes = [
    // content
    ['해석 할', '해석할'],
    ['생물다 양성', '생물다양성'],
    ['경제 학', '경제학'],
    ['통화 정책', '통화정책'],
    ['필요 성', '필요성'],
    ['정당 성', '정당성'],
    // explanation
    ['타당 성', '타당성'],
    ['기르 기', '기르기'],
    ['객관 성', '객관성'],
    ['사고 력', '사고력'],
    ['학 습', '학습'],
    ['실 생활', '실생활'],
    ['생 태', '생태'],
    ['파 악', '파악'],
    ['갈 등', '갈등'],
    ['민 주주의', '민주주의'],
    ['사 회적', '사회적'],
    ['지 속가능', '지속가능'],
];

let wordFixTotal = 0;
for (const [from, to] of wordFixes) {
    const re = new RegExp(from, 'g');
    const m = content.match(re);
    if (m) {
        wordFixTotal += m.length;
        content = content.replace(re, to);
    }
}
stats['단어 분리 수정'] = wordFixTotal;

// === 6. 과목명 축약 확장 ===
const subjectFixes = {
    '국관': '국제 관계의 이해',
    '기지': '기후변화와 지속가능한 세계',
    '도탐': '도시의 미래 탐구',
    '동역': '동아시아 역사 기행',
    '법사': '법과 사회',
    '사탐': '사회문제 탐구',
    '세사': '세계사',
    '세지': '세계지리',
    '여지': '여행지리',
    '역현': '역사로 탐구하는 현대 세계',
    '한탐': '한국지리 탐구',
};

let subjectFixCount = 0;
for (const [abbr, full] of Object.entries(subjectFixes)) {
    // "subject": "축약명" 패턴만 교체 (다른 필드는 건드리지 않음)
    const re = new RegExp(`"subject": "${abbr}"`, 'g');
    const m = content.match(re);
    if (m) {
        subjectFixCount += m.length;
        content = content.replace(re, `"subject": "${full}"`);
    }
}
stats['과목명 축약 확장'] = subjectFixCount;

// === 7. 연속 공백 최종 정리 ===
content = content.replace(/  +/g, (match) => {
    // JSON 들여쓰기 보존 (줄 시작의 공백은 유지)
    return match;
});

// 저장
fs.writeFileSync(filepath, content);

console.log('=== standards.js 최종 수정 완료 ===');
for (const [k, v] of Object.entries(stats)) {
    console.log(`  ${k}: ${v}건`);
}
