import fs from 'fs';

const {SOCIAL_STANDARDS} = await import('./server/data/standards_social.js');

// 정상 area 값 목록
const validAreas = new Set([
    '', '성취기준',
    '경제적 사고와 합리적 선택', '시장 경제와 가격', '국가 경제와 경제 성장', '세계 경제와 국제 거래',
    '헌법의 의의와 기본권', '민법의 기초', '범죄와 형사 절차', '사회 생활과 법',
    '자연환경과 인간 생활', '인문환경과 인간 생활', '다양한 공간의 이해', '지속 가능한 세계',
    '사회·문화 현상의 탐구', '개인과 사회 구조', '문화와 일상생활', '사회 불평등과 사회 정의',
    '정치 과정과 참여', '헌법과 기본권', '정부 형태와 정치 제도', '국제 정치와 평화',
    '세계화 시대, 지리의 힘', '역사의 의미와 역사 탐구',
    '인간과 공동체', '사회 변화와 공공성',
]);

let cleaned = 0;
let fileContent = fs.readFileSync('./server/data/standards_social.js', 'utf8');

for (const std of SOCIAL_STANDARDS) {
    const area = std.area || '';
    if (area && !validAreas.has(area)) {
        const escaped = area.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`"area": "${escaped}"`, 'g');
        const before = fileContent.match(re);
        if (before) {
            fileContent = fileContent.replace(re, '"area": ""');
            cleaned += before.length;
        }
    }
}

fs.writeFileSync('./server/data/standards_social.js', fileContent);
console.log('area 오염 정리:', cleaned, '건');
