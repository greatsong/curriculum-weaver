#!/usr/bin/env python3
"""스크린샷이 포함된 커리큘럼 위버 제품 가이드북 PDF — 이미지 잘림 방지"""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Image, Table, TableStyle
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

pdfmetrics.registerFont(TTFont('NG', '/Users/greatsong/Library/Fonts/NanumGothic.ttf'))
pdfmetrics.registerFont(TTFont('NGB', '/Users/greatsong/Library/Fonts/NanumGothicBold.ttf'))

PRIMARY = HexColor('#3B82F6')
DARK = HexColor('#111827')
GRAY = HexColor('#6B7280')
BLUE_BG = HexColor('#EFF6FF')
AMBER_BG = HexColor('#FFFBEB')

W, H = A4
M = 1.8 * cm
CW = W - 2 * M
# 페이지 콘텐츠 높이 (마진 제외)
CH = H - 2 * M

SCREENSHOTS = '/Users/greatsong/greatsong-project/curriculum-weaver/docs/screenshots'

S = {
    'title': ParagraphStyle('t', fontName='NGB', fontSize=28, leading=36, alignment=TA_CENTER, textColor=DARK),
    'subtitle': ParagraphStyle('st', fontName='NG', fontSize=14, leading=20, alignment=TA_CENTER, textColor=PRIMARY),
    'h1': ParagraphStyle('h1', fontName='NGB', fontSize=18, leading=26, textColor=DARK, spaceBefore=16, spaceAfter=8),
    'h3': ParagraphStyle('h3', fontName='NGB', fontSize=12, leading=17, textColor=HexColor('#1F2937'), spaceBefore=8, spaceAfter=4),
    'body': ParagraphStyle('b', fontName='NG', fontSize=10, leading=17, textColor=HexColor('#374151'), spaceAfter=6),
    'center': ParagraphStyle('c', fontName='NG', fontSize=10, leading=17, textColor=HexColor('#374151'), alignment=TA_CENTER),
    'small': ParagraphStyle('sm', fontName='NG', fontSize=9, leading=14, textColor=GRAY, alignment=TA_CENTER),
    'bullet': ParagraphStyle('bl', fontName='NG', fontSize=10, leading=17, textColor=HexColor('#374151'), spaceAfter=3, leftIndent=18, bulletIndent=6),
    'callout': ParagraphStyle('co', fontName='NG', fontSize=10, leading=16, textColor=HexColor('#374151')),
    'caption': ParagraphStyle('cap', fontName='NG', fontSize=9, leading=14, textColor=GRAY, alignment=TA_CENTER, spaceBefore=4, spaceAfter=4),
}

def fit_image(name):
    """이미지를 페이지에 꽉 맞게 (가로 꽉 채움, 비율 유지)"""
    p = os.path.join(SCREENSHOTS, name)
    if not os.path.exists(p):
        return Spacer(1, 20)
    ir = ImageReader(p)
    iw, ih = ir.getSize()
    ratio = ih / iw
    w = CW
    h = w * ratio
    return Image(p, width=w, height=h)

def color_box(text, border_color, bg_color):
    t = Table([[Paragraph(text, S['callout'])]], colWidths=[CW - 8])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), bg_color),
        ('LEFTPADDING', (0,0), (-1,-1), 14),
        ('RIGHTPADDING', (0,0), (-1,-1), 14),
        ('TOPPADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('LINEBEFORE', (0,0), (0,-1), 3, border_color),
    ]))
    return t

# ── 빌드 ──
output = '/Users/greatsong/greatsong-project/curriculum-weaver/docs/커리큘럼위버_제품가이드북.pdf'
doc = SimpleDocTemplate(output, pagesize=A4, leftMargin=M, rightMargin=M, topMargin=M, bottomMargin=M)

story = []

# ══════════════════════════════════════
# 표지
# ══════════════════════════════════════
story.append(Spacer(1, 50))
story.append(Paragraph('커리큘럼 위버', S['title']))
story.append(Spacer(1, 6))
story.append(Paragraph('제품 가이드북', S['subtitle']))
story.append(Spacer(1, 16))
story.append(Paragraph('AI와 함께 융합 수업을 설계하세요', S['center']))
story.append(Spacer(1, 4))
story.append(Paragraph('40가지 설계 원리 기반 협력적 수업 설계 플랫폼', S['small']))
story.append(Spacer(1, 16))
story.append(fit_image('01-hero.png'))
story.append(Spacer(1, 30))
story.append(Paragraph('2026년 4월', S['small']))

# ══════════════════════════════════════
# 1. 빠른 시작
# ══════════════════════════════════════
story.append(PageBreak())
story.append(Paragraph('1. 빠른 시작 가이드', S['h1']))
story.append(Paragraph('4단계로 시작할 수 있습니다.', S['body']))
story.append(Spacer(1, 6))
# 스크린샷 전용 — 페이지에 꽉 차게
story.append(fit_image('02-quickstart.png'))
story.append(Paragraph('① 워크스페이스 만들기 → ② 팀원 초대 → ③ 프로젝트 생성 → ④ AI와 설계 시작', S['caption']))

# 팁 박스는 다음 페이지
story.append(PageBreak())
story.append(color_box('팁: 데모 모드(/demo)에서 먼저 체험해보세요. 학년, 교과, 주제만 입력하면 AI가 19개 절차를 자동 생성합니다.', HexColor('#F59E0B'), AMBER_BG))

# ══════════════════════════════════════
# 2. 워크플로우
# ══════════════════════════════════════
story.append(Spacer(1, 12))
story.append(Paragraph('2. 수업설계 워크플로우', S['h1']))
story.append(Paragraph('TADDs-DIE 모형의 5 Phase, 19개 절차를 따라 체계적으로 수업을 설계합니다.', S['body']))
story.append(Spacer(1, 6))
story.append(fit_image('03-workflow.png'))
story.append(Paragraph('Phase T(팀준비) → A(분석) → Ds(설계) → DI(개발/실행) → E(평가)', S['caption']))

# ══════════════════════════════════════
# 3. AI 공동설계자
# ══════════════════════════════════════
story.append(PageBreak())
story.append(Paragraph('3. AI 공동설계자, 위버', S['h1']))
story.append(Paragraph('교육과정 전문가로서 4가지 역할을 수행합니다.', S['body']))
story.append(Paragraph('<bullet>&bull;</bullet> <b>안내</b> — 절차의 목적과 방법을 설명', S['bullet']))
story.append(Paragraph('<bullet>&bull;</bullet> <b>생성</b> — 초안/예시/후보 제시 (수락/편집/거부)', S['bullet']))
story.append(Paragraph('<bullet>&bull;</bullet> <b>점검</b> — 이전 절차와의 정합성 검토', S['bullet']))
story.append(Paragraph('<bullet>&bull;</bullet> <b>기록</b> — 확정 내용을 보드에 저장', S['bullet']))
story.append(Spacer(1, 8))
story.append(fit_image('04-ai-chat.png'))
story.append(Paragraph('교사-AI 대화: 기후변화 주제로 과학×수학 융합 수업 설계', S['caption']))

# ══════════════════════════════════════
# 4. 설계 보드 & 원리
# ══════════════════════════════════════
story.append(PageBreak())
story.append(Paragraph('4. 설계 보드 & 40가지 설계 원리', S['h1']))
story.append(Paragraph('19개 절차마다 고유 보드 + 교육학 기반 설계 원리가 제시됩니다.', S['body']))
story.append(Paragraph('<bullet>&bull;</bullet> <b>상호 의존의 원리</b> — 목적 공유, 신뢰 바탕의 설계팀 형성', S['bullet']))
story.append(Paragraph('<bullet>&bull;</bullet> <b>인지 분산의 원리</b> — 정보/지식/부담을 팀원 간 효과적 분배', S['bullet']))
story.append(Paragraph('<bullet>&bull;</bullet> <b>활성화의 원리</b> — 사전 지식과 경험을 학습 출발점으로 활용', S['bullet']))
story.append(Spacer(1, 8))
story.append(fit_image('05-board-principles.png'))
story.append(Paragraph('좌: T-1-1 팀 비전 보드 | 우: 설계 원리 패널', S['caption']))

# ══════════════════════════════════════
# 5. 데모 & FAQ
# ══════════════════════════════════════
story.append(PageBreak())
story.append(Paragraph('5. 데모 체험 & 자주 묻는 질문', S['h1']))
story.append(Paragraph('학년/교과/주제만 입력하면 AI가 약 3분 만에 19개 절차의 수업 설계를 생성합니다.', S['body']))
story.append(Spacer(1, 6))
story.append(fit_image('06-demo-faq.png'))
story.append(Paragraph('데모 입력 폼 + FAQ 아코디언', S['caption']))

# FAQ 텍스트
story.append(PageBreak())
story.append(Paragraph('자주 묻는 질문', S['h1']))
for q, a in [
    ('커리큘럼 위버는 무료인가요?', '현재 베타 기간 중 무료로 제공됩니다.'),
    ('어떤 AI를 사용하나요?', 'Anthropic Claude API. Sonnet(빠른 응답) 또는 Opus(최고 품질) 선택 가능.'),
    ('몇 명까지 함께 설계할 수 있나요?', '워크스페이스에 제한 없이 초대 가능. 실시간 동시 접속 100명 지원.'),
    ('수업 설계를 다운로드할 수 있나요?', '"보고서" 버튼으로 전체 설계안을 PDF로 다운로드.'),
    ('성취기준은 어떻게 활용되나요?', '2022 개정 교육과정 4,484개 성취기준 내장. 주제 입력 시 자동 매칭.'),
]:
    story.append(Paragraph(f'<b>Q. {q}</b>', S['h3']))
    story.append(Paragraph(a, S['body']))

story.append(Spacer(1, 20))
story.append(color_box('접속: https://curriculum-weaver.vercel.app  |  가이드: /guide  |  데모: /demo', PRIMARY, BLUE_BG))

doc.build(story)
print(f'PDF 생성 완료: {output}')
print(f'파일 크기: {os.path.getsize(output) / 1024:.0f} KB')
