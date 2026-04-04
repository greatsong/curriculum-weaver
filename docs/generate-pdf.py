#!/usr/bin/env python3
"""커리큘럼 위버 제품 가이드북 PDF 생성 (한글 폰트 적용)"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.units import mm, cm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, HRFlowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ── 한글 폰트 등록 ──
pdfmetrics.registerFont(TTFont('NanumGothic', '/Users/greatsong/Library/Fonts/NanumGothic.ttf'))
pdfmetrics.registerFont(TTFont('NanumGothicBold', '/Users/greatsong/Library/Fonts/NanumGothicBold.ttf'))

# ── 색상 ──
PRIMARY = HexColor('#3B82F6')
ACCENT = HexColor('#8B5CF6')
EMERALD = HexColor('#10B981')
AMBER = HexColor('#F59E0B')
ROSE = HexColor('#F43F5E')
DARK = HexColor('#111827')
GRAY = HexColor('#6B7280')
LIGHT_GRAY = HexColor('#F1F5F9')
WHITE = HexColor('#FFFFFF')
BLUE_BG = HexColor('#EFF6FF')
VIOLET_BG = HexColor('#F5F3FF')
GREEN_BG = HexColor('#D1FAE5')
AMBER_BG = HexColor('#FFFBEB')
BORDER_COLOR = HexColor('#E2E8F0')

# ── 스타일 ──
styles = getSampleStyleSheet()

styles.add(ParagraphStyle(name='KTitle', fontName='NanumGothicBold', fontSize=28, leading=36,
    alignment=TA_CENTER, textColor=DARK, spaceAfter=8))
styles.add(ParagraphStyle(name='KSubtitle', fontName='NanumGothic', fontSize=14, leading=20,
    alignment=TA_CENTER, textColor=PRIMARY, spaceAfter=4))
styles.add(ParagraphStyle(name='KH1', fontName='NanumGothicBold', fontSize=18, leading=26,
    textColor=DARK, spaceBefore=24, spaceAfter=12))
styles.add(ParagraphStyle(name='KH2', fontName='NanumGothicBold', fontSize=14, leading=20,
    textColor=DARK, spaceBefore=18, spaceAfter=8))
styles.add(ParagraphStyle(name='KH3', fontName='NanumGothicBold', fontSize=12, leading=17,
    textColor=HexColor('#1F2937'), spaceBefore=12, spaceAfter=6))
styles.add(ParagraphStyle(name='KBody', fontName='NanumGothic', fontSize=10, leading=17,
    textColor=HexColor('#374151'), spaceAfter=8, alignment=TA_JUSTIFY))
styles.add(ParagraphStyle(name='KBodyCenter', fontName='NanumGothic', fontSize=10, leading=17,
    textColor=HexColor('#374151'), spaceAfter=8, alignment=TA_CENTER))
styles.add(ParagraphStyle(name='KSmall', fontName='NanumGothic', fontSize=9, leading=14,
    textColor=GRAY, spaceAfter=4))
styles.add(ParagraphStyle(name='KBullet', fontName='NanumGothic', fontSize=10, leading=17,
    textColor=HexColor('#374151'), spaceAfter=4, leftIndent=18, bulletIndent=6))
styles.add(ParagraphStyle(name='KNumber', fontName='NanumGothic', fontSize=10, leading=17,
    textColor=HexColor('#374151'), spaceAfter=4, leftIndent=18, bulletIndent=6))
styles.add(ParagraphStyle(name='KCallout', fontName='NanumGothic', fontSize=10, leading=16,
    textColor=HexColor('#374151'), spaceAfter=4))

W, H = A4
MARGIN = 2 * cm

def color_box(text, border_color, bg_color):
    """왼쪽 컬러바 + 배경색 박스"""
    t = Table([[Paragraph(text, styles['KCallout'])]], colWidths=[W - 2 * MARGIN - 10])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg_color),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('RIGHTPADDING', (0, 0), (-1, -1), 14),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LINEBEFOREBORDER', (0, 0), (0, -1), 3),
        ('LINEBEFORE', (0, 0), (0, -1), 3, border_color),
        ('ROUNDEDCORNERS', [4, 4, 4, 4]),
    ]))
    return t

def phase_table():
    """6 Phase 워크플로우 테이블"""
    data = [
        ['Phase', '이름', '절차'],
        ['prep', '준비', '학습자/맥락 정보 입력'],
        ['T', '팀준비', 'T-1-1 비전설정, T-1-2 방향수립, T-2-1 역할분담, T-2-2 팀규칙, T-2-3 팀일정'],
        ['A', '분석', 'A-1-1 주제선정기준, A-1-2 주제선정, A-2-1 성취기준분석, A-2-2 통합목표'],
        ['Ds', '설계', 'Ds-1-1 평가계획, Ds-1-2 문제상황, Ds-1-3 학습활동, Ds-2-1 지원도구, Ds-2-2 스캐폴딩'],
        ['DI', '개발/실행', 'DI-1-1 자료목록, DI-2-1 수업기록'],
        ['E', '평가', 'E-1-1 수업성찰, E-2-1 과정성찰'],
    ]
    phase_colors = [LIGHT_GRAY, HexColor('#64748B'), ACCENT, PRIMARY, EMERALD, AMBER, ROSE]

    # Paragraph으로 변환
    pdata = []
    for i, row in enumerate(data):
        prow = []
        for j, cell in enumerate(row):
            if i == 0:
                prow.append(Paragraph(f'<b>{cell}</b>', ParagraphStyle('tc', fontName='NanumGothicBold', fontSize=9, textColor=DARK, alignment=TA_CENTER)))
            elif j == 0:
                prow.append(Paragraph(f'<b>{cell}</b>', ParagraphStyle('tc', fontName='NanumGothicBold', fontSize=9, textColor=WHITE, alignment=TA_CENTER)))
            elif j == 1:
                prow.append(Paragraph(f'<b>{cell}</b>', ParagraphStyle('tc', fontName='NanumGothicBold', fontSize=9, textColor=DARK)))
            else:
                prow.append(Paragraph(cell, ParagraphStyle('tc', fontName='NanumGothic', fontSize=8, textColor=GRAY, leading=12)))
            pdata.append(prow) if False else None
        pdata.append(prow)

    t = Table(pdata, colWidths=[60, 70, W - 2*MARGIN - 140])
    style_cmds = [
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('BACKGROUND', (0, 0), (-1, 0), LIGHT_GRAY),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]
    # Phase 컬럼 색상
    for i in range(1, 7):
        style_cmds.append(('BACKGROUND', (0, i), (0, i), phase_colors[i]))
    t.setStyle(TableStyle(style_cmds))
    return t

def role_table():
    """AI 4가지 역할 테이블"""
    data = [
        ['안내 (Guide)', '생성 (Generate)', '점검 (Check)', '기록 (Record)'],
        ['절차의 목적과\n방법을 설명', '초안, 예시,\n후보를 제시', '이전 절차와의\n정합성 검토', '확정된 내용을\n저장'],
    ]
    colors = [BLUE_BG, VIOLET_BG, GREEN_BG, LIGHT_GRAY]
    cw = (W - 2*MARGIN) / 4

    pdata = []
    for i, row in enumerate(data):
        prow = []
        for cell in row:
            if i == 0:
                prow.append(Paragraph(f'<b>{cell}</b>', ParagraphStyle('rc', fontName='NanumGothicBold', fontSize=9, textColor=DARK, alignment=TA_CENTER)))
            else:
                prow.append(Paragraph(cell, ParagraphStyle('rc', fontName='NanumGothic', fontSize=8, textColor=GRAY, alignment=TA_CENTER, leading=12)))
        pdata.append(prow)

    t = Table(pdata, colWidths=[cw]*4)
    style_cmds = [
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]
    for i in range(4):
        style_cmds.append(('BACKGROUND', (i, 0), (i, -1), colors[i]))
    t.setStyle(TableStyle(style_cmds))
    return t

# ── 문서 생성 ──
output_path = '/Users/greatsong/greatsong-project/curriculum-weaver/docs/커리큘럼위버_제품가이드북.pdf'
doc = SimpleDocTemplate(output_path, pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN)

story = []

# ── 표지 ──
story.append(Spacer(1, 80))
story.append(Paragraph('커리큘럼 위버', styles['KTitle']))
story.append(Paragraph('제품 가이드북', styles['KSubtitle']))
story.append(Spacer(1, 30))
story.append(Paragraph('AI와 함께 융합 수업을 설계하세요', styles['KBodyCenter']))
story.append(Paragraph('40가지 설계 원리 기반 협력적 수업 설계 플랫폼', styles['KSmall']))
story.append(Spacer(1, 120))
story.append(Paragraph('2026년 4월', ParagraphStyle('date', fontName='NanumGothic', fontSize=10, textColor=GRAY, alignment=TA_CENTER)))
story.append(PageBreak())

# ── 1. 소개 ──
story.append(Paragraph('1. 커리큘럼 위버란?', styles['KH1']))
story.append(Paragraph('커리큘럼 위버는 교사 팀이 AI 공동설계자와 함께 융합 수업을 체계적으로 설계하는 플랫폼입니다.', styles['KBody']))
story.append(Paragraph('TADDs-DIE 모형에 기반한 19개 절차를 따라, 각 단계마다 AI가 안내하고 제안하며, 교사는 수락/편집/거부를 선택합니다.', styles['KBody']))
story.append(Spacer(1, 6))
story.append(color_box('핵심 가치: AI는 조력자, 교사가 주도합니다. 모든 설계 결정은 교사 팀이 내립니다.', PRIMARY, BLUE_BG))
story.append(Spacer(1, 12))
story.append(Paragraph('대상 사용자', styles['KH3']))
story.append(Paragraph('<bullet>&bull;</bullet> <b>교사 팀</b> — 2명 이상의 교사 팀 (융합 수업 설계)', styles['KBullet']))
story.append(Paragraph('<bullet>&bull;</bullet> <b>개인 교사</b> — AI와 1:1로 수업을 설계하는 개인 교사', styles['KBullet']))
story.append(Paragraph('<bullet>&bull;</bullet> <b>교육 연구자</b> — 교육과정 분석 및 수업 설계 연구', styles['KBullet']))

# ── 2. 빠른 시작 ──
story.append(Spacer(1, 16))
story.append(Paragraph('2. 빠른 시작 가이드', styles['KH1']))
story.append(Paragraph('4단계로 시작할 수 있습니다.', styles['KBody']))
for i, (title, desc) in enumerate([
    ('워크스페이스 만들기', '워크스페이스를 만들고 팀 이름과 설명을 입력합니다.'),
    ('팀원 초대', '함께 설계할 동료 교사의 이메일로 초대합니다.'),
    ('프로젝트 생성', '수업 주제, 대상 학년, 참여 교과를 설정합니다.'),
    ('AI와 설계 시작', 'AI 위버가 첫 절차를 안내합니다. 대화를 시작하세요!'),
], 1):
    story.append(Paragraph(f'<bullet>{i}.</bullet> <b>{title}</b> — {desc}', styles['KNumber']))

story.append(Spacer(1, 8))
story.append(color_box('팁: 데모 모드에서 먼저 체험해보세요. 로그인 없이 AI가 19개 절차를 자동 생성합니다.', AMBER, AMBER_BG))

# ── 3. 워크플로우 ──
story.append(PageBreak())
story.append(Paragraph('3. 수업설계 워크플로우', styles['KH1']))
story.append(Paragraph('TADDs-DIE 모형은 6개 Phase, 19개 절차로 구성됩니다.', styles['KBody']))
story.append(Spacer(1, 8))
story.append(phase_table())
story.append(Spacer(1, 16))
story.append(Paragraph('AI의 4가지 역할', styles['KH3']))
story.append(Spacer(1, 4))
story.append(role_table())

# ── 4. 핵심 기능 ──
story.append(PageBreak())
story.append(Paragraph('4. 핵심 기능', styles['KH1']))

story.append(Paragraph('4-1. AI 공동설계자', styles['KH2']))
story.append(Paragraph('각 절차에서 AI 위버가 교사와 대화하며 수업 설계를 도와줍니다.', styles['KBody']))
story.append(color_box(
    '<b>교사:</b> "기후변화를 주제로 과학과 수학을 융합하고 싶어요. 고1 학생들이 데이터를 직접 분석하면서 기후 문제를 이해할 수 있는 수업을 설계하고 싶습니다."',
    PRIMARY, BLUE_BG))
story.append(Spacer(1, 4))
story.append(color_box(
    '<b>AI 위버:</b> "좋은 방향이에요! 몇 가지 방향을 제안드릴게요: 1) 기온 변화 데이터의 추세선 분석, 2) 탄소 배출량과 기온 상관관계, 3) 지역별 기후 데이터 비교."',
    ACCENT, VIOLET_BG))

story.append(Spacer(1, 12))
story.append(Paragraph('4-2. 설계 보드', styles['KH2']))
story.append(Paragraph('19개 절차마다 고유한 설계 보드가 있습니다. AI 대화로 자동 채워지고, 직접 편집도 가능합니다.', styles['KBody']))
story.append(Paragraph('<bullet>&bull;</bullet> <b>비전 보드:</b> T-1-1 팀 비전 — 교육 비전, 핵심 가치, 기대 역량', styles['KBullet']))
story.append(Paragraph('<bullet>&bull;</bullet> <b>분석 보드:</b> A-2-1 성취기준 분석 — 교과별 성취기준 매핑', styles['KBullet']))
story.append(Paragraph('<bullet>&bull;</bullet> <b>설계 보드:</b> Ds-1-3 학습 활동 — 차시별 활동 구조', styles['KBullet']))

story.append(Spacer(1, 12))
story.append(Paragraph('4-3. 40가지 설계 원리', styles['KH2']))
story.append(Paragraph('각 절차에 관련된 설계 원리가 화면 우측에 표시됩니다.', styles['KBody']))
story.append(Paragraph('<bullet>&bull;</bullet> <b>인지 분산의 원리</b> — 팀원들의 지식을 사회적/물리적으로 분산한다', styles['KBullet']))
story.append(Paragraph('<bullet>&bull;</bullet> <b>활성화의 원리</b> — 설계 과정에서 아이디어 생성을 활성화한다', styles['KBullet']))
story.append(Paragraph('<bullet>&bull;</bullet> <b>상호 의존의 원리</b> — 목적을 공유하고 신뢰를 바탕으로 설계팀을 형성한다', styles['KBullet']))

story.append(Spacer(1, 12))
story.append(Paragraph('4-4. 실시간 협업', styles['KH2']))
story.append(Paragraph('여러 교사가 동시에 같은 프로젝트에서 작업할 수 있습니다. 보드 변경사항이 실시간으로 동기화되고, 댓글과 피드백을 남길 수 있습니다.', styles['KBody']))

# ── 5. 데모 ──
story.append(Spacer(1, 16))
story.append(Paragraph('5. 데모 모드', styles['KH1']))
story.append(Paragraph('로그인한 사용자는 누구나 데모 모드를 체험할 수 있습니다.', styles['KBody']))
story.append(Paragraph('<bullet>&bull;</bullet> 학년: 초5~고3 (복수 선택 가능)', styles['KBullet']))
story.append(Paragraph('<bullet>&bull;</bullet> 교과: 12개 기본 교과 + 직접 입력 가능 (2개 이상)', styles['KBullet']))
story.append(Paragraph('<bullet>&bull;</bullet> 주제: 자유 입력 (예: 기후변화, AI 윤리, 지역사회 문제)', styles['KBullet']))
story.append(Paragraph('<bullet>&bull;</bullet> 약 1~3분 후 전체 설계 결과를 확인할 수 있습니다', styles['KBullet']))

# ── 6. FAQ ──
story.append(Spacer(1, 16))
story.append(Paragraph('6. 자주 묻는 질문', styles['KH1']))

for q, a in [
    ('커리큘럼 위버는 무료인가요?', '현재 베타 기간 중 무료로 제공됩니다.'),
    ('어떤 AI를 사용하나요?', 'Anthropic의 Claude API를 사용합니다. Sonnet(빠른 응답) 또는 Opus(최고 품질) 중 선택 가능합니다.'),
    ('몇 명까지 함께 설계할 수 있나요?', '하나의 워크스페이스에 제한 없이 팀원을 초대할 수 있습니다. 실시간 동시 접속은 100명까지 지원합니다.'),
    ('생성된 수업 설계를 다운로드할 수 있나요?', '프로젝트 페이지의 "보고서" 버튼으로 전체 설계안을 PDF로 다운로드할 수 있습니다.'),
    ('교육과정 성취기준은 어떻게 활용되나요?', '2022 개정 교육과정의 4,484개 성취기준이 내장되어 있습니다. 주제를 입력하면 관련 성취기준을 자동으로 매칭합니다.'),
]:
    story.append(Paragraph(f'<b>Q. {q}</b>', styles['KH3']))
    story.append(Paragraph(a, styles['KBody']))

# ── 접속 정보 ──
story.append(Spacer(1, 24))
story.append(color_box('접속: https://curriculum-weaver.vercel.app  |  가이드: /guide  |  데모: /demo', PRIMARY, BLUE_BG))

# ── 빌드 ──
doc.build(story)
print(f'PDF 생성 완료: {output_path}')
