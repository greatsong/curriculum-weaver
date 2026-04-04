#!/usr/bin/env python3
"""
교육과정 PDF → curriculum-weaver JSON 변환 스크립트

사용법:
  python3 scripts/parse-curriculum-pdf.py <PDF파일경로> [--output <출력파일경로>]

예시:
  python3 scripts/parse-curriculum-pdf.py "[별책7] 사회과 교육과정.pdf"
  python3 scripts/parse-curriculum-pdf.py "[별책9] 과학과 교육과정.pdf" --output science.json
  python3 scripts/parse-curriculum-pdf.py "[별책5] 수학과 교육과정.pdf" --js  # JS 모듈 출력

출력: curriculum-weaver 벌크 업로드 API 호환 JSON 또는 ES6 모듈
"""

import re
import sys
import json
import argparse
from collections import Counter

# ─── PDF 텍스트 추출 ───
def clean_pdf_text(text):
    """PDF 추출 텍스트에서 아티팩트를 제거합니다."""
    # PAGE 마커 제거: "--- PAGE 232 --- 사회과 교육과정" 등
    text = re.sub(r'---\s*PAGE\s*\d+\s*---[^\n]*', '', text)
    # 머리글/바닥글 제거: "135 과학과 교육과정", "258 선택 중심 교육과정 – 융합 선택 과목 -" 등
    text = re.sub(
        r'^\s*\d{1,3}\s+(?:공통 교육과정|선택 중심 교육과정[^\n]*|[가-힣]+과 교육과정)\s*$',
        '', text, flags=re.MULTILINE
    )
    # 연속 빈 줄 정리
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text


def extract_text_from_pdf(pdf_path):
    """PDF에서 전체 텍스트를 추출합니다."""
    try:
        import pdfplumber
        text = ''
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + '\n'
        return clean_pdf_text(text)
    except ImportError:
        print("❌ pdfplumber가 설치되어 있지 않습니다. 설치 중...")
        import subprocess
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pdfplumber', '--break-system-packages', '-q'])
        import pdfplumber
        text = ''
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + '\n'
        return clean_pdf_text(text)


# ─── 성취기준 코드 파싱 ───
CODE_PATTERN = re.compile(r'\[(\d{1,2}[가-힣()]+\d{2}-\d{2})\]')

# 고등학교 선택과목 매핑 (subject, curriculum_category, domain)
HIGH_SCHOOL_MAP = {
    # ── 사회과 ──
    '정치': ('정치', '일반선택', '일반사회'),
    '법과': ('법과사회', '일반선택', '일반사회'),
    '경제': ('경제', '일반선택', '일반사회'),
    '사회문화': ('사회와문화', '일반선택', '일반사회'),
    '사문': ('사회와문화', '일반선택', '일반사회'),
    '세계사': ('세계사', '일반선택', '역사'),
    '한국지리': ('한국지리탐구', '진로선택', '지리'),
    '세계시민': ('세계시민과지리', '진로선택', '지리'),
    '여행지리': ('여행지리', '융합선택', '지리'),
    '역사로': ('역사로탐구하는현대세계', '진로선택', '역사'),
    '역사탐구': ('역사로탐구하는현대세계', '진로선택', '역사'),
    '동아시아': ('동아시아역사기행', '진로선택', '역사'),
    '사회문제': ('사회문제탐구', '진로선택', '일반사회'),
    '금융': ('금융과경제생활', '융합선택', '일반사회'),
    '기후': ('기후변화와지속가능한세계', '융합선택', '지리'),
    '도시': ('도시의미래탐구', '융합선택', '지리'),
    '국제': ('국제관계의이해', '진로선택', '일반사회'),
    '한국사': ('한국사', '공통', '역사'),
    '통합사회': ('통합사회', '공통', '일반사회'),
    # ── 과학과 ──
    '통합과학': ('통합과학', '공통', ''),
    '물리': ('물리학', '일반선택', ''),
    '화학': ('화학', '일반선택', ''),
    '생명': ('생명과학', '일반선택', ''),
    '지구': ('지구과학', '일반선택', ''),
    # 진로선택 (긴 접두사)
    '전자기': ('전자기와 양자', '진로선택', ''),
    '물질과': ('물질과 에너지', '진로선택', ''),
    '화학반': ('화학 반응의 세계', '진로선택', ''),
    '세포와': ('세포와 물질대사', '진로선택', ''),
    '생물다': ('생물다양성과 환경', '진로선택', ''),
    '행성우': ('행성우주과학', '진로선택', ''),
    '지구시': ('지구시스템과학', '진로선택', ''),
    # 진로선택 (짧은 접두사 - PDF에서 실제 추출되는 코드)
    '역학': ('역학과 에너지', '진로선택', ''),
    '전자': ('전자기와 양자', '진로선택', ''),
    '물에': ('물질과 에너지', '진로선택', ''),
    '반응': ('화학 반응의 세계', '진로선택', ''),
    '세포': ('세포와 물질대사', '진로선택', ''),
    '생과': ('생물다양성과 환경', '진로선택', ''),
    '유전': ('유전', '진로선택', ''),
    '행우': ('행성우주과학', '진로선택', ''),
    '지시': ('지구시스템과학', '진로선택', ''),
    # 융합선택
    '과학실': ('과학의 역사와 문화', '융합선택', ''),
    '기후변': ('기후변화와 환경생태', '융합선택', ''),
    '융합과': ('융합과학 탐구', '융합선택', ''),
    '과사': ('과학의 역사와 문화', '융합선택', ''),
    '기환': ('기후변화와 환경생태', '융합선택', ''),
    '융탐': ('융합과학 탐구', '융합선택', ''),
    # ── 수학과 ──
    '확률과': ('확률과 통계', '일반선택', ''),
    '미적분': ('미적분', '일반선택', ''),
    '경제수': ('경제수학', '융합선택', ''),
    '인공지수': ('인공지능 수학', '융합선택', ''),
    '직무수': ('직무수학', '융합선택', ''),
    '수학과': ('수학과 문화', '융합선택', ''),
    '심화수': ('심화 수학', '진로선택', ''),
    '확통': ('확률과 통계', '일반선택', ''),
    '미적': ('미적분', '일반선택', ''),
    '기하': ('기하', '일반선택', ''),
    '대수': ('대수', '일반선택', ''),
    '경수': ('경제수학', '융합선택', ''),
    '인수': ('인공지능 수학', '융합선택', ''),
    '직수': ('직무수학', '융합선택', ''),
    '수문': ('수학과 문화', '융합선택', ''),
    '수과': ('수학과제 탐구', '진로선택', ''),
    '실통': ('실용 통계', '융합선택', ''),
    '심수': ('심화 수학', '진로선택', ''),
    # ── 국어 교과 ──
    '화언': ('화법과 언어', '일반선택', ''),
    '독작': ('독서와 작문', '일반선택', ''),
    '문학': ('문학', '일반선택', ''),
    '주탐': ('주제 탐구 독서', '진로선택', ''),
    '문영': ('문학과 영상', '진로선택', ''),
    '직의': ('직무 의사소통', '진로선택', ''),
    '매의': ('매체 의사소통', '융합선택', ''),
    '언탐': ('언어생활 탐구', '융합선택', ''),
    '독토': ('독서 토론과 글쓰기', '융합선택', ''),
    # ── 영어 교과 ──
    '영어Ⅰ': ('영어Ⅰ', '일반선택', ''),
    '영어Ⅱ': ('영어Ⅱ', '일반선택', ''),
    '영독작': ('영어 독해와 작문', '일반선택', ''),
    '영회화': ('영어 회화', '일반선택', ''),
    '심영독': ('심화 영어 독해와 작문', '진로선택', ''),
    '심영Ⅰ': ('심화 영어Ⅰ', '진로선택', ''),
    '심영Ⅱ': ('심화 영어Ⅱ', '진로선택', ''),
    '심영회': ('심화 영어 회화', '진로선택', ''),
    '영발프': ('영어 발표와 프레젠테이션', '진로선택', ''),
    '영미문': ('영미 문학 읽기', '융합선택', ''),
    '실생영': ('실생활 영어', '융합선택', ''),
    # 짧은 접두사 (PDF에서 실제 추출)
    '영독': ('영어 독해와 작문', '일반선택', ''),
    '영문': ('영미 문학 읽기', '융합선택', ''),
    '영발': ('영어 발표와 토론', '진로선택', ''),
    '심영': ('심화 영어', '진로선택', ''),
    '심독영': ('심화 영어 독해와 작문', '진로선택', ''),
    '실영': ('실생활 영어', '융합선택', ''),
    '미영': ('영미 문학 읽기', '융합선택', ''),
    '세영': ('세계문화와 영어', '융합선택', ''),
    '직영': ('직무 영어', '진로선택', ''),
    # ── 도덕 교과 ──
    '윤사': ('윤리와 사상', '일반선택', ''),
    '현윤': ('현대사회와 윤리', '일반선택', ''),
    '생윤': ('생활과 윤리', '일반선택', ''),
    '인윤': ('인간과 철학', '진로선택', ''),
    '인격': ('인격과 삶', '진로선택', ''),
    '윤문': ('윤리 문제 탐구', '진로선택', ''),
    '윤탐': ('윤리 탐구', '진로선택', ''),
    # ── 체육 교과 ──
    '운동': ('운동과 건강', '일반선택', ''),
    '운건': ('운동과 건강', '일반선택', ''),
    '스포츠': ('스포츠 생활', '일반선택', ''),
    '스생Ⅰ': ('스포츠 생활Ⅰ', '일반선택', ''),
    '스생Ⅱ': ('스포츠 생활Ⅱ', '일반선택', ''),
    '체탐': ('체육 탐구', '진로선택', ''),
    '스문': ('스포츠 문화', '진로선택', ''),
    '스과': ('스포츠 과학', '진로선택', ''),
    # ── 음악 교과 ──
    '음감': ('음악 감상과 비평', '일반선택', ''),
    '음연': ('음악 연주와 창작', '일반선택', ''),
    '음전': ('음악과 미디어', '진로선택', ''),
    '감비': ('음악 감상과 비평', '일반선택', ''),
    '연창': ('음악 연주와 창작', '일반선택', ''),
    '음미': ('음악과 미디어', '진로선택', ''),
    # ── 미술 교과 ──
    '미창': ('미술 창작', '일반선택', ''),
    '미감': ('미술 감상과 비평', '일반선택', ''),
    '미전': ('미술과 매체', '진로선택', ''),
    '미매': ('미술과 매체', '진로선택', ''),
    # ── 기술가정·정보 교과 ──
    '기가': ('기술·가정', '일반선택', ''),
    '인공지능': ('인공지능 기초', '진로선택', ''),
    '생활과': ('생활과 창의성', '진로선택', ''),
    '지식재': ('지식 재산 일반', '진로선택', ''),
    '데이터': ('데이터 과학', '진로선택', ''),
    '소프트': ('소프트웨어와 생활', '융합선택', ''),
    '로봇': ('로봇과 공학세계', '진로선택', ''),
    '데과': ('데이터 과학', '진로선택', ''),
    '소생': ('소프트웨어와 생활', '융합선택', ''),
    '인기': ('인공지능 기초', '진로선택', ''),
    '생활': ('생활과 창의성', '진로선택', ''),
    '아동': ('아동발달과 부모', '진로선택', ''),
    '자립': ('자립 생활과 진로', '진로선택', ''),
    '지재': ('지식 재산 일반', '진로선택', ''),
    '창공': ('창의 공학 설계', '진로선택', ''),
    # ── 한문 교과 ──
    '한문Ⅰ': ('한문Ⅰ', '일반선택', ''),
    '한문Ⅱ': ('한문Ⅱ', '진로선택', ''),
    '한고': ('한문 고전 읽기', '진로선택', ''),
    '언한': ('언어생활과 한자', '융합선택', ''),
    # ── 제2외국어: 독일어 ──
    '독일': ('독일어', '일반선택', ''),
    '독어': ('독일어', '일반선택', ''),
    '독회': ('독일어 회화', '진로선택', ''),
    '독문': ('독일어권 문화', '융합선택', ''),
    '생독': ('생활 독일어', '융합선택', ''),
    # ── 제2외국어: 러시아어 ──
    '러시': ('러시아어', '일반선택', ''),
    '러어': ('러시아어', '일반선택', ''),
    '러회': ('러시아어 회화', '진로선택', ''),
    '러문': ('러시아어권 문화', '융합선택', ''),
    '생러': ('생활 러시아어', '융합선택', ''),
    '심러': ('심화 러시아어', '진로선택', ''),
    # ── 제2외국어: 베트남어 ──
    '베트': ('베트남어', '일반선택', ''),
    '베어': ('베트남어', '일반선택', ''),
    '베회': ('베트남어 회화', '진로선택', ''),
    '베문': ('베트남어권 문화', '융합선택', ''),
    '생베': ('생활 베트남어', '융합선택', ''),
    '심베': ('심화 베트남어', '진로선택', ''),
    # ── 제2외국어: 스페인어 ──
    '스페': ('스페인어', '일반선택', ''),
    '스어': ('스페인어', '일반선택', ''),
    '스회': ('스페인어 회화', '진로선택', ''),
    '생스': ('생활 스페인어', '융합선택', ''),
    '심스': ('심화 스페인어', '진로선택', ''),
    # ── 제2외국어: 아랍어 ──
    '아랍': ('아랍어', '일반선택', ''),
    '아어': ('아랍어', '일반선택', ''),
    '아회': ('아랍어 회화', '진로선택', ''),
    '아문': ('아랍어권 문화', '융합선택', ''),
    '생아': ('생활 아랍어', '융합선택', ''),
    '심아': ('심화 아랍어', '진로선택', ''),
    # ── 제2외국어: 일본어 ──
    '일본': ('일본어', '일반선택', ''),
    '일어': ('일본어', '일반선택', ''),
    '일회': ('일본어 회화', '진로선택', ''),
    '일문': ('일본어권 문화', '융합선택', ''),
    '생일': ('생활 일본어', '융합선택', ''),
    '심일': ('심화 일본어', '진로선택', ''),
    # ── 제2외국어: 중국어 ──
    '중국': ('중국어', '일반선택', ''),
    '중어': ('중국어', '일반선택', ''),
    '중회': ('중국어 회화', '진로선택', ''),
    '중문': ('중국어권 문화', '융합선택', ''),
    '생중': ('생활 중국어', '융합선택', ''),
    '심중': ('심화 중국어', '진로선택', ''),
    # ── 제2외국어: 프랑스어 ──
    '프랑': ('프랑스어', '일반선택', ''),
    '프어': ('프랑스어', '일반선택', ''),
    '프회': ('프랑스어 회화', '진로선택', ''),
    '프문': ('프랑스어권 문화', '융합선택', ''),
    '생프': ('생활 프랑스어', '융합선택', ''),
    '심프': ('심화 프랑스어', '진로선택', ''),
    # ── 제2외국어: 심화 (심독 = 심화 독일어, 제2외국어 맥락) ──
    '심독': ('심화 독일어', '진로선택', ''),
}

SUBJECT_NAME_MAP = {
    '사': '사회', '과': '과학', '수': '수학', '국': '국어', '영': '영어',
    '도': '도덕', '음': '음악', '미': '미술', '체': '체육', '정': '정보',
    '기가': '기술·가정', '실': '실과', '역': '역사', '한': '한문',
}

# 교과목 → 교과군(subject_group) 매핑
# 교과군은 교육과정 문서에서 사용하는 상위 분류 단위
SUBJECT_GROUP_MAP = {
    # 국어 교과군
    '국어': '국어', '화법과 언어': '국어', '독서와 작문': '국어', '문학': '국어',
    '주제 탐구 독서': '국어', '문학과 영상': '국어', '직무 의사소통': '국어',
    '매체 의사소통': '국어', '언어생활 탐구': '국어', '독서 토론과 글쓰기': '국어',
    # 수학 교과군
    '수학': '수학', '대수': '수학', '기하': '수학', '미적분': '수학',
    '확률과 통계': '수학', '경제수학': '수학', '인공지능 수학': '수학',
    '직무수학': '수학', '수학과 문화': '수학', '수학과제 탐구': '수학',
    '실용 통계': '수학', '심화 수학': '수학',
    # 영어 교과군
    '영어': '영어', '영어Ⅰ': '영어', '영어Ⅱ': '영어',
    '영어 독해와 작문': '영어', '영어 회화': '영어',
    '심화 영어': '영어', '심화 영어 독해와 작문': '영어',
    '심화 영어Ⅰ': '영어', '심화 영어Ⅱ': '영어', '심화 영어 회화': '영어',
    '영어 발표와 토론': '영어', '영어 발표와 프레젠테이션': '영어',
    '영미 문학 읽기': '영어', '실생활 영어': '영어',
    '세계문화와 영어': '영어', '직무 영어': '영어',
    # 사회 교과군
    '사회': '사회', '통합사회': '사회', '한국사': '사회',
    '정치': '사회', '법과사회': '사회', '경제': '사회', '사회와문화': '사회',
    '세계사': '사회', '한국지리탐구': '사회', '세계시민과지리': '사회',
    '여행지리': '사회', '역사로탐구하는현대세계': '사회', '동아시아역사기행': '사회',
    '사회문제탐구': '사회', '금융과경제생활': '사회',
    '기후변화와지속가능한세계': '사회', '도시의미래탐구': '사회', '국제관계의이해': '사회',
    # 도덕 교과군
    '도덕': '도덕', '윤리와 사상': '도덕', '현대사회와 윤리': '도덕',
    '생활과 윤리': '도덕', '인간과 철학': '도덕', '인격과 삶': '도덕',
    '윤리 문제 탐구': '도덕', '윤리 탐구': '도덕',
    # 과학 교과군
    '과학': '과학', '통합과학': '과학', '물리학': '과학', '화학': '과학',
    '생명과학': '과학', '지구과학': '과학',
    '역학과 에너지': '과학', '전자기와 양자': '과학',
    '물질과 에너지': '과학', '화학 반응의 세계': '과학',
    '세포와 물질대사': '과학', '생물다양성과 환경': '과학', '유전': '과학',
    '행성우주과학': '과학', '지구시스템과학': '과학',
    '과학의 역사와 문화': '과학', '기후변화와 환경생태': '과학', '융합과학 탐구': '과학',
    # 정보 교과군 (중등 정보)
    '정보': '정보', '인공지능 기초': '정보', '데이터 과학': '정보',
    '소프트웨어와 생활': '정보',
    # 기술·가정 교과군
    '기술·가정': '기술·가정', '로봇과 공학세계': '기술·가정',
    '생활과 창의성': '기술·가정', '아동발달과 부모': '기술·가정',
    '자립 생활과 진로': '기술·가정', '지식 재산 일반': '기술·가정',
    '창의 공학 설계': '기술·가정',
    # 실과 (초등)
    '실과': '실과(기술·가정)/정보',
    # 체육 교과군
    '체육': '체육', '운동과 건강': '체육', '스포츠 생활': '체육',
    '스포츠 생활Ⅰ': '체육', '스포츠 생활Ⅱ': '체육',
    '체육 탐구': '체육', '스포츠 문화': '체육', '스포츠 과학': '체육',
    # 음악 교과군
    '음악': '음악', '음악 감상과 비평': '음악', '음악 연주와 창작': '음악',
    '음악과 미디어': '음악',
    # 미술 교과군
    '미술': '미술', '미술 창작': '미술', '미술 감상과 비평': '미술',
    '미술과 매체': '미술',
    # 한문 교과군
    '한문': '한문', '한문Ⅰ': '한문', '한문Ⅱ': '한문',
    '한문 고전 읽기': '한문', '언어생활과 한자': '한문',
    # 제2외국어 교과군
    '독일어': '제2외국어', '독일어 회화': '제2외국어', '독일어권 문화': '제2외국어',
    '심화 독일어': '제2외국어', '생활 독일어': '제2외국어',
    '러시아어': '제2외국어', '러시아어 회화': '제2외국어', '러시아어권 문화': '제2외국어',
    '심화 러시아어': '제2외국어', '생활 러시아어': '제2외국어',
    '베트남어': '제2외국어', '베트남어 회화': '제2외국어', '베트남어권 문화': '제2외국어',
    '심화 베트남어': '제2외국어', '생활 베트남어': '제2외국어',
    '스페인어': '제2외국어', '스페인어 회화': '제2외국어', '스페인어권 문화': '제2외국어',
    '심화 스페인어': '제2외국어', '생활 스페인어': '제2외국어',
    '아랍어': '제2외국어', '아랍어 회화': '제2외국어', '아랍어권 문화': '제2외국어',
    '심화 아랍어': '제2외국어', '생활 아랍어': '제2외국어',
    '일본어': '제2외국어', '일본어 회화': '제2외국어', '일본어권 문화': '제2외국어',
    '심화 일본어': '제2외국어', '생활 일본어': '제2외국어',
    '중국어': '제2외국어', '중국어 회화': '제2외국어', '중국어권 문화': '제2외국어',
    '심화 중국어': '제2외국어', '생활 중국어': '제2외국어',
    '프랑스어': '제2외국어', '프랑스어 회화': '제2외국어', '프랑스어권 문화': '제2외국어',
    '심화 프랑스어': '제2외국어', '생활 프랑스어': '제2외국어',
}

# 중학교 선택과목 매핑 (2글자 이상 복합 접두사)
MIDDLE_SCHOOL_MAP = {
    # 생활 외국어 (중학교 선택)
    '생독': ('생활 독일어', '선택'),
    '생러': ('생활 러시아어', '선택'),
    '생베': ('생활 베트남어', '선택'),
    '생스': ('생활 스페인어', '선택'),
    '생아': ('생활 아랍어', '선택'),
    '생일': ('생활 일본어', '선택'),
    '생중': ('생활 중국어', '선택'),
    '생프': ('생활 프랑스어', '선택'),
}

# source_family별 오버라이드 매핑 (동일 코드가 교과에 따라 다른 의미)
SOURCE_OVERRIDES = {
    '영어': {
        '심독': ('심화 영어 독해와 작문', '진로선택', ''),
    },
    '제2외국어': {
        '스문': ('스페인어권 문화', '융합선택', ''),
    },
}


def parse_code(code, source_family=''):
    """성취기준 코드를 분석하여 메타데이터를 반환합니다.
    source_family: PDF 소스 교과명 (예: '국어', '영어', '제2외국어' 등)
    """
    # 초등 1-2학년
    if code.startswith('2'):
        m = re.match(r'^2([가-힣()]+)', code)
        subj_raw = m.group(1) if m else ''
        return {
            'subject': SUBJECT_NAME_MAP.get(subj_raw, subj_raw),
            'grade_group': '초1-2',
            'school_level': '초등학교',
            'curriculum_category': '공통',
            'domain': guess_domain(code, subj_raw),
        }
    # 초등 3-4학년
    if code.startswith('4'):
        m = re.match(r'^4([가-힣()]+)', code)
        subj_raw = m.group(1) if m else ''
        return {
            'subject': SUBJECT_NAME_MAP.get(subj_raw, subj_raw),
            'grade_group': '초3-4',
            'school_level': '초등학교',
            'curriculum_category': '공통',
            'domain': guess_domain(code, subj_raw),
        }
    # 초등 5-6학년
    if code.startswith('6'):
        m = re.match(r'^6([가-힣()]+)', code)
        subj_raw = m.group(1) if m else ''
        return {
            'subject': SUBJECT_NAME_MAP.get(subj_raw, subj_raw),
            'grade_group': '초5-6',
            'school_level': '초등학교',
            'curriculum_category': '공통',
            'domain': guess_domain(code, subj_raw),
        }
    # 중학교
    if code.startswith('9'):
        m = re.match(r'^9([가-힣()]+)', code)
        subj_raw = m.group(1) if m else ''
        # 중학교 선택과목 (생활 외국어 등) 체크
        for prefix in sorted(MIDDLE_SCHOOL_MAP.keys(), key=len, reverse=True):
            if subj_raw.startswith(prefix):
                subject, category = MIDDLE_SCHOOL_MAP[prefix]
                return {
                    'subject': subject,
                    'grade_group': '중1-3',
                    'school_level': '중학교',
                    'curriculum_category': category,
                    'domain': '',
                }
        subject = SUBJECT_NAME_MAP.get(subj_raw, subj_raw)
        # 9사(지리), 9사(일반), 9사(역사) 등 처리
        if '(' in subj_raw:
            subject = SUBJECT_NAME_MAP.get(subj_raw.split('(')[0], subj_raw)
        return {
            'subject': subject,
            'grade_group': '중1-3',
            'school_level': '중학교',
            'curriculum_category': '공통',
            'domain': guess_domain(code, subj_raw),
        }
    # 고등학교
    if code.startswith('12'):
        m = re.match(r'^12([가-힣]+)', code)
        subj_raw = m.group(1) if m else ''
        # source_family 오버라이드 먼저 체크
        overrides = SOURCE_OVERRIDES.get(source_family, {})
        for prefix in sorted(overrides.keys(), key=len, reverse=True):
            if subj_raw.startswith(prefix):
                subject, category, domain = overrides[prefix]
                return {
                    'subject': subject,
                    'grade_group': '고선택',
                    'school_level': '고등학교',
                    'curriculum_category': category,
                    'domain': domain,
                }
        # 긴 접두사부터 매칭 (예: '통합사회' > '통합' > '통')
        for prefix in sorted(HIGH_SCHOOL_MAP.keys(), key=len, reverse=True):
            if subj_raw.startswith(prefix):
                subject, category, domain = HIGH_SCHOOL_MAP[prefix]
                return {
                    'subject': subject,
                    'grade_group': '고선택',
                    'school_level': '고등학교',
                    'curriculum_category': category,
                    'domain': domain,
                }
        # 단독 1글자 코드 (미, 음, 정, 한 등)
        if subj_raw in SUBJECT_NAME_MAP:
            return {
                'subject': SUBJECT_NAME_MAP[subj_raw],
                'grade_group': '고선택',
                'school_level': '고등학교',
                'curriculum_category': '일반선택',
                'domain': '',
            }
        return {
            'subject': subj_raw,
            'grade_group': '고선택',
            'school_level': '고등학교',
            'curriculum_category': '일반선택',
            'domain': '',
        }
    return None


def guess_domain(code, subj_raw):
    """영역(domain) 추측"""
    if '지리' in subj_raw: return '지리'
    if '역사' in subj_raw or subj_raw == '역': return '역사'
    if '일반' in subj_raw: return '일반사회'
    # 초등 사회: 영역번호로 구분
    m = re.search(r'(\d{2})(?=-)', code)
    if m and ('사' in code[:5]):
        num = int(m.group(1))
        if code.startswith('4사'):
            if num in (1, 5, 10): return '지리'
            if num in (2, 3, 4, 6): return '역사'
            return '일반사회'
        if code.startswith('6사'):
            if num in (1, 2, 3, 5): return '지리'
            if num in (6, 7, 8): return '역사'
            return '일반사회'
    return ''


# ─── 영역명 추출 ───
def extract_topic_names(text):
    """PDF에서 '영역명'을 코드 접두사에 매핑합니다."""
    topics = {}
    # 패턴: (1) 우리가 사는 곳  또는  [4사01-01]~[4사01-05] 우리가 사는 곳
    patterns = [
        # "① 우리가 사는 곳" 스타일 (영역 소개)
        re.compile(r"\[(\d{1,2}[가-힣()]+\d{2})-\d{2}\].*?[\u2018\u2019\u201C\u201D'\"]+([가-힣\s\u00b7]+)[\u2018\u2019\u201C\u201D'\"]+"),
    ]

    # 코드 범위에서 영역명 추출 시도
    code_matches = list(CODE_PATTERN.finditer(text))
    for i, m in enumerate(code_matches):
        code = m.group(1)
        prefix = re.match(r'(\d{1,2}[가-힣()]+\d{2})', code)
        if prefix and prefix.group(1) not in topics:
            # 코드 앞뒤 텍스트에서 영역 제목 찾기
            before = text[max(0, m.start()-200):m.start()]
            # "가. 지리 인식" 등의 패턴
            title_match = re.search(r'[가-힣]\.\s*([가-힣\s·]+?)(?:\n|\r)', before)
            if title_match:
                topics[prefix.group(1)] = title_match.group(1).strip()

    return topics


# ─── 적용 시 고려 사항 영역 단위 추출 ───
def extract_application_notes_by_area(text):
    """'(나) 성취기준 적용 시 고려 사항' 섹션을 영역 단위로 추출하여
    해당 영역의 모든 성취기준 코드에 매핑합니다.

    교육과정 PDF 구조:
      (N) 영역명
        [코드] 성취기준 본문...
        (가) 성취기준 해설
        (나) 성취기준 적용 시 고려 사항
          • 불릿 1 (영역 전체 적용)
          • 불릿 2
      (N+1) 다음 영역

    반환: { code: notes_text } — 영역의 모든 코드에 동일한 notes_text 매핑
    """
    application_notes = {}

    # 모든 섹션 헤더 위치
    area_header_matches = list(re.finditer(
        r'^\s*\(\d+\)\s+[가-힣]', text, re.MULTILINE
    ))
    notes_header_matches = list(re.finditer(
        r'(?:㈏|\(나\))?\s*성취기준\s*적용\s*시\s*고려\s*사항', text
    ))
    explanation_header_matches = list(re.finditer(
        r'(?:㈎|\(가\))?\s*성취기준\s*해설', text
    ))

    if not notes_header_matches:
        return application_notes

    # 모든 헤더를 통합 정렬 (notes 섹션의 끝 경계를 결정하기 위함)
    all_headers = sorted(
        [(m.start(), 'area', m) for m in area_header_matches] +
        [(m.start(), 'notes', m) for m in notes_header_matches] +
        [(m.start(), 'explanation', m) for m in explanation_header_matches]
    )

    for notes_m in notes_header_matches:
        notes_start = notes_m.start()
        notes_text_start = notes_m.end()  # 헤더 텍스트 이후부터

        # 1) notes 섹션의 끝 찾기: 다음 헤더(영역/해설/적용사항)까지
        notes_end = len(text)
        for h_pos, h_type, h_m in all_headers:
            if h_pos > notes_start + 10:  # 자기 자신 제외
                notes_end = h_pos
                break

        # notes 본문 추출 (헤더 제외)
        notes_body = text[notes_text_start:notes_end].strip()

        # 머리글/바닥글 잔재 제거 (예: "13\n과학과 교육과정")
        notes_body = re.sub(
            r'\n\s*\d{1,3}\s*\n\s*(?:공통 교육과정|선택 중심 교육과정[^\n]*|[가-힣]+과 교육과정)\s*',
            '\n', notes_body
        )
        notes_body = notes_body.strip()

        if not notes_body or len(notes_body) < 10:
            continue

        # 2) 이 notes가 속한 영역의 코드 찾기
        #    notes 헤더 앞쪽에서 가장 가까운 영역 헤더를 찾고,
        #    그 영역 헤더와 notes 헤더 사이의 'content' 영역에서 코드를 수집
        parent_area_pos = None
        for h_pos, h_type, h_m in all_headers:
            if h_type == 'area' and h_pos < notes_start:
                parent_area_pos = h_pos
            elif h_pos >= notes_start:
                break

        if parent_area_pos is None:
            continue

        # 영역 헤더 ~ notes 헤더 사이에서 본문(content) 섹션의 코드 수집
        area_text = text[parent_area_pos:notes_start]
        area_codes = list(set(CODE_PATTERN.findall(area_text)))

        # 코드가 발견되지 않으면, 해설 섹션까지 포함해서 더 넓은 범위 탐색
        if not area_codes:
            # 영역 헤더 이전의 content 영역에서도 찾기 (간혹 순서가 다른 경우)
            for h_pos, h_type, h_m in all_headers:
                if h_type == 'area' and h_pos < parent_area_pos:
                    prev_area_pos = h_pos
            # 여전히 없으면 건너뜀
            continue

        area_codes.sort()

        # 3) 모든 영역 코드에 notes 매핑
        for code in area_codes:
            # 기존 값보다 긴 것을 우선 (여러 섹션에서 매칭되는 경우)
            if code not in application_notes or len(notes_body) > len(application_notes[code]):
                application_notes[code] = notes_body

    return application_notes


# ─── 성취기준 추출 ───
def extract_standards(text):
    """텍스트에서 성취기준, 해설, 적용시 고려사항을 추출합니다."""
    standards = {}
    explanations = {}
    application_notes = {}

    # ── 1단계: 적용 시 고려 사항을 영역 단위로 추출 (새 로직) ──
    application_notes = extract_application_notes_by_area(text)

    # 섹션 헤더 위치 사전 추적 (해설/적용사항 영역 판별용)
    # "(가) 성취기준 해설" 또는 "성취기준 해설" 패턴
    explanation_headers = sorted([m.start() for m in re.finditer(
        r'(?:㈎|\(가\))?\s*성취기준\s*해설', text
    )])
    # "(나) 성취기준 적용 시 고려 사항" 패턴
    notes_headers = sorted([m.start() for m in re.finditer(
        r'(?:㈏|\(나\))?\s*성취기준\s*적용\s*시\s*고려\s*사항', text
    )])
    # 영역 제목 패턴: "(1) 힘과 운동", "(2) 물질의 성질" 등 — 본문으로 돌아가는 경계
    area_headers = sorted([m.start() for m in re.finditer(
        r'^\s*\(\d+\)\s+[가-힣]', text, re.MULTILINE
    )])

    # 모든 섹션 헤더를 통합 정렬: (위치, 타입)
    all_section_headers = sorted(
        [(pos, 'explanation') for pos in explanation_headers] +
        [(pos, 'notes') for pos in notes_headers] +
        [(pos, 'content') for pos in area_headers]
    )

    # 각 섹션의 유효 범위 계산
    section_ranges = []  # (start, end, type)
    for idx, (pos, typ) in enumerate(all_section_headers):
        if idx + 1 < len(all_section_headers):
            end = all_section_headers[idx + 1][0]
        else:
            end = len(text)
        section_ranges.append((pos, end, typ))

    def find_section(pos):
        """코드 위치가 어느 섹션에 속하는지 판별합니다.
        해설/적용사항/영역제목 헤더의 유효 범위 기반으로 판단.
        영역 제목 이후 ~ 다음 해설 헤더까지는 'content' (본문).
        """
        for s_start, s_end, s_type in section_ranges:
            if s_start <= pos < s_end:
                return s_type
        return 'content'

    # ── 2단계: 성취기준 본문 + 해설 추출 (기존 로직 유지) ──
    # 모든 코드 위치 찾기
    matches = list(CODE_PATTERN.finditer(text))

    for i, m in enumerate(matches):
        code = m.group(1)
        full_code = m.group(0)
        start = m.start()

        # 다음 코드까지의 텍스트 (마지막 코드는 최대 5000자까지 허용)
        if i + 1 < len(matches):
            next_start = matches[i+1].start()
        else:
            next_start = min(start + 5000, len(text))
        text_after = text[start + len(full_code):next_start].strip()

        # 섹션 판별 (사전 추적된 헤더 위치 기반)
        section = find_section(start)
        is_explanation = section == 'explanation'
        is_notes = section == 'notes'

        # notes 섹션의 코드는 무시 (영역 단위 추출에서 이미 처리됨)
        if is_notes:
            continue

        # 본문 추출 (다음 성취기준 코드, 빈 줄 2개, 또는 섹션 경계까지)
        # - \[\d{1,2}[가-힣(] : 실제 코드 패턴만 감지 (본문 내 [3단계] 등 오인식 방지)
        # - <탐구 활동> : 탐구 활동 섹션 시작 (content에 포함하지 않음)
        # - (가) 성취기준 해설 / (나) 성취기준 적용 시 고려 사항 : 메타 섹션 시작
        content = re.split(
            r'\n{2,}|\[\d{1,2}[가-힣(]|<탐구\s*활동>|[㈎㈏]|\(가\)\s*성취기준|'
            r'\(나\)\s*성취기준|성취기준\s*해설|성취기준\s*적용\s*시',
            text_after
        )[0].strip()

        if is_explanation and content and len(content) > 10:
            # 해설: 더 긴 것을 우선 저장
            if code not in explanations or len(content) > len(explanations[code]):
                explanations[code] = content
        elif content and len(content) > 5:
            # 본문: 더 긴 content를 우선 (요약 표의 짧은 설명보다 상세 본문 우선)
            if code not in standards or len(content) > len(standards[code]):
                standards[code] = content

    return standards, explanations, application_notes


# ─── 키워드 추출 ───
STOP_WORDS = {
    # 기능어 / 관형어
    '할', '수', '있다', '한다', '등', '및', '또는', '그리고', '이를', '것을',
    '통해', '위한', '대한', '대해', '관한', '바탕', '위해', '가지', '대하여',
    '있는', '하는', '되는', '것이', '하여', '하고', '한다', '된다', '이다',
    '따른', '위하여', '이상', '이하', '대하', '같은', '다른', '다양한',
    '적합한', '필요한', '가능한', '올바른', '복잡한',
    # 성취기준에서 반복되는 기능적 표현 (내용 키워드가 아닌 것)
    '중심', '중심으로', '바탕으로', '활용', '이해', '분석', '설명',
    '비교', '탐색', '탐구', '인식', '판단', '평가', '공유',
    '실천', '설계', '구성', '구현', '작성', '수행', '적용',
    '해결', '발견', '수집', '관리', '해석', '구별', '구분',
    '수립', '예측', '선택', '개발', '수정', '표현', '제시',
    '개념', '특성', '특징', '종류', '방법', '방안', '과정',
    '사례', '문제', '상황', '결과', '영향', '변화', '가치',
    '필요성', '중요성', '역할',
}

# 다음절 조사/어미를 길이순으로 제거 (긴 것부터 매칭)
SUFFIX_PATTERNS = [
    # 복합 조사 (3글자 이상)
    '에서는', '으로서', '으로써', '에서의', '로부터', '이라는', '에게서',
    '만으로', '과의', '와의',
    # 복합 조사 (2글자)
    '으로', '에서', '에게', '까지', '부터', '에는', '에도', '으며',
    '하고', '하며', '하여', '해서', '에의', '와는', '과는',
    '이며', '이고', '이나', '라는', '라고', '에서', '에게',
    # 동사/형용사 어미 (성취기준에 자주 등장)
    '한다', '된다', '있다', '없다', '않다',
    '하고', '되고', '하며', '되며', '하여', '되어',
    '해야', '하기', '하는', '되는', '있는', '없는',
    '하도록', '함으로써',
    # 단일 조사 (1글자)
    '은', '는', '이', '가', '을', '를', '에', '서', '의', '로',
    '와', '과', '도', '만', '며', '고', '나',
]

def strip_particles(word, max_rounds=3):
    """단어에서 조사와 어미를 반복 제거합니다.
    복합 조사("에서는" 등)도 처리하기 위해 최대 max_rounds번 반복.
    """
    for _ in range(max_rounds):
        changed = False
        for suffix in SUFFIX_PATTERNS:
            if word.endswith(suffix) and len(word) > len(suffix) + 1:
                word = word[:-len(suffix)]
                changed = True
                break  # 한 라운드에서 가장 긴 매칭만 제거 후 재시도
        if not changed:
            break
    return word

def extract_keywords(content, n=5):
    """텍스트에서 핵심 명사구 키워드를 추출합니다.
    단어 빈도가 아닌, 교육과정 성취기준에서 의미 있는 명사구를 추출합니다.
    """
    # 구두점/줄바꿈 정리
    text = re.sub(r'[.,;:!?""''()[\]⋅·\-•\n\r]', ' ', content)
    text = re.sub(r'\s+', ' ', text).strip()

    # 1단계: 서술어(동사/형용사) 종결부 제거하여 핵심 명사구 영역만 남기기
    #   "사례를 중심으로 디지털 공간에서 함께 살아가기 위해 개인 정보 및 권리와 저작권을 보호하는 실천 방법을 탐구한다"
    #   → 핵심 명사구: 사례, 디지털 공간, 개인 정보, 권리, 저작권, 실천 방법
    # 조사/어미 기준으로 절 경계를 만들어 명사구 추출
    # 2글자 이상 조사는 직접 매칭, 1글자 조사는 한글 뒤에만 매칭 (단어 내부 오분리 방지)
    # "도형" → "형"으로 잘리는 문제 방지: 1글자 조사는 앞에 한글이 있어야만 매칭
    CLAUSE_SPLITTERS = re.compile(
        r'(?:에서|으로|및)\s+|(?<=[가-힣])(?:을|를|은|는|이|가|에|로|와|과|의|도)\s+'
    )
    chunks = CLAUSE_SPLITTERS.split(text)

    # 2단계: 각 청크에서 명사구 추출 (마지막 서술어 부분 제거)
    VERB_ENDINGS = re.compile(
        r'(?:한다|된다|있다|없다|않다|하고|되고|하며|되며|한|된|하여|되어|해야|하기|하는|되는|있는|없는|'
        r'이해하고|분석하고|탐구하고|설명하고|비교하고|수행하고|'
        r'분석한다|탐구한다|설명한다|비교한다|실천한다|설계한다|구성한다|작성한다|'
        r'활용하여|바탕으로|중심으로|위하여|통하여|'
        r'살아가기|보호하는|발견하고|수집하고|관리한다|해석한다|'
        r'구별한다|구분하고|수립한다|예측한다|판단한다|평가한다|공유한다|'
        r'탐색한다|선택하여|적용한다|수정한다|개발한다|'
        r'위해|통해|대해|함께).*$'
    )

    noun_phrases = []
    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk or len(chunk) < 2:
            continue
        # 서술어 이후 제거
        chunk = VERB_ENDINGS.sub('', chunk).strip()
        # 남은 부분에서 조사 제거
        chunk = strip_particles(chunk)
        if len(chunk) >= 2 and chunk not in STOP_WORDS:
            # 순수 한글+영문+숫자+공백만
            if re.match(r'^[가-힣a-zA-Z0-9\s]+$', chunk):
                noun_phrases.append(chunk)

    # 3단계: 빈도 기반 순위 + 중복 제거
    freq = Counter(noun_phrases)
    # 짧은 키워드가 긴 키워드에 포함되면 긴 것 우선
    result = []
    seen = set()
    for phrase, _ in freq.most_common(n * 3):
        # 이미 더 긴 키워드에 포함된 경우 스킵
        skip = False
        for existing in result:
            if phrase in existing:
                skip = True
                break
        if not skip and phrase not in seen:
            result.append(phrase)
            seen.add(phrase)
        if len(result) >= n:
            break

    # 결과가 부족하면 단어 단위 폴백
    if len(result) < n:
        words = text.split()
        for w in words:
            w = strip_particles(w)
            if len(w) >= 2 and w not in STOP_WORDS and w not in seen:
                if re.match(r'^[가-힣a-zA-Z0-9]+$', w):
                    result.append(w)
                    seen.add(w)
            if len(result) >= n:
                break

    return result


# ─── 파일명에서 교과 패밀리 추출 ───
FILENAME_TO_FAMILY = {
    '국어': '국어', '도덕': '도덕', '수학': '수학', '과학': '과학',
    '사회': '사회', '영어': '영어', '체육': '체육', '음악': '음악',
    '미술': '미술', '한문': '한문',
    '실과': '실과기술가정정보',
    '기술가정': '실과기술가정정보',
    '정보': '실과기술가정정보',
    '제2외국어': '제2외국어',
    '외국어': '제2외국어',
}

def detect_source_family(pdf_path):
    """PDF 파일명에서 교과 패밀리를 추출합니다."""
    import os
    basename = os.path.basename(pdf_path)
    for keyword, family in sorted(FILENAME_TO_FAMILY.items(), key=lambda x: len(x[0]), reverse=True):
        if keyword in basename:
            return family
    return ''


# ─── JSON 출력 ───
def build_output(standards_dict, explanations, application_notes, topics, text, source_family=''):
    """curriculum-weaver 호환 JSON을 생성합니다."""
    results = []

    for code, content in sorted(standards_dict.items()):
        parsed = parse_code(code, source_family)
        if not parsed:
            print(f"  ⚠️ 코드 파싱 실패: [{code}]")
            continue

        # 영역명 매핑
        prefix = re.match(r'(\d{1,2}[가-힣()]+\d{2})', code)
        area = topics.get(prefix.group(1), '') if prefix else ''

        subject = parsed['subject']
        subject_group = SUBJECT_GROUP_MAP.get(subject, '')
        # 교과군 미매핑 시 source_family로 추정
        if not subject_group and source_family:
            family_to_group = {
                '국어': '국어', '수학': '수학', '영어': '영어', '사회': '사회',
                '도덕': '도덕', '과학': '과학', '체육': '체육', '음악': '음악',
                '미술': '미술', '한문': '한문', '제2외국어': '제2외국어',
                '실과기술가정정보': '실과(기술·가정)/정보',
            }
            subject_group = family_to_group.get(source_family, '')

        results.append({
            'code': f'[{code}]',
            'subject_group': subject_group,
            'subject': subject,
            'grade_group': parsed['grade_group'],
            'school_level': parsed['school_level'],
            'curriculum_category': parsed['curriculum_category'],
            'area': area,
            'domain': parsed['domain'],
            'content': content,
            'keywords': extract_keywords(content),
            'explanation': explanations.get(code, ''),
            'application_notes': application_notes.get(code, ''),
        })

    return results


def output_json(standards, output_path):
    """curriculum-weaver 벌크 업로드 API 호환 JSON 출력"""
    data = {
        'standards': standards,
        'links': [],
    }
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return output_path


def output_js_module(standards, output_path):
    """ES6 모듈 파일 출력 (server/data/ 직접 배치용)"""
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('/**\n')
        f.write(f' * 교육과정 성취기준 데이터 (자동 생성)\n')
        f.write(f' * 총 {len(standards)}개 성취기준\n')
        f.write(f' * 생성 스크립트: scripts/parse-curriculum-pdf.py\n')
        f.write(' */\n\n')
        f.write('export const PARSED_STANDARDS = ')
        f.write(json.dumps(standards, ensure_ascii=False, indent=2))
        f.write('\n\nexport const PARSED_LINKS = []\n')
    return output_path


# ─── 메인 ───
def main():
    parser = argparse.ArgumentParser(description='교육과정 PDF → curriculum-weaver JSON 변환')
    parser.add_argument('pdf_path', help='교육과정 PDF 파일 경로')
    parser.add_argument('--output', '-o', help='출력 파일 경로 (기본: <PDF이름>_standards.json)')
    parser.add_argument('--js', action='store_true', help='ES6 모듈 형식으로 출력')
    args = parser.parse_args()

    print(f'📄 PDF 읽는 중: {args.pdf_path}')
    text = extract_text_from_pdf(args.pdf_path)
    print(f'  추출 텍스트: {len(text):,}자')

    print('🔍 성취기준 추출 중...')
    standards_dict, explanations, application_notes = extract_standards(text)
    print(f'  성취기준: {len(standards_dict)}개')
    print(f'  해설: {len(explanations)}개')
    print(f'  적용시 고려사항: {len(application_notes)}개')

    print('📂 영역명 추출 중...')
    topics = extract_topic_names(text)
    print(f'  영역: {len(topics)}개')

    source_family = detect_source_family(args.pdf_path)
    print(f'📌 교과 패밀리: {source_family or "(자동감지 실패)"}')

    print('🔧 curriculum-weaver 형식으로 변환 중...')
    results = build_output(standards_dict, explanations, application_notes, topics, text, source_family)

    # 통계 출력
    by_level = Counter(s['school_level'] for s in results)
    by_domain = Counter(s['domain'] for s in results if s['domain'])
    by_category = Counter(s['curriculum_category'] for s in results)
    by_subject = Counter(s['subject'] for s in results)

    print(f'\n📊 결과 요약:')
    print(f'  총 성취기준: {len(results)}개')
    print(f'  학교급: {dict(by_level)}')
    print(f'  영역: {dict(by_domain)}')
    print(f'  교육과정구분: {dict(by_category)}')
    print(f'  교과: {dict(by_subject)}')

    # 출력
    if args.output:
        output_path = args.output
    else:
        import os
        base = os.path.splitext(os.path.basename(args.pdf_path))[0]
        ext = '.js' if args.js else '.json'
        output_path = f'{base}_standards{ext}'

    if args.js or output_path.endswith('.js'):
        output_js_module(results, output_path)
    else:
        output_json(results, output_path)

    print(f'\n✅ 출력 완료: {output_path}')
    print(f'\ncurriculum-weaver에 업로드하려면:')
    print(f'  curl -X POST http://localhost:PORT/api/standards/upload \\')
    print(f'    -H "Content-Type: application/json" \\')
    print(f'    -d @{output_path}')


if __name__ == '__main__':
    main()
