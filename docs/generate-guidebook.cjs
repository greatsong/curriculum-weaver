const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, Header, Footer,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType, PageNumber, PageBreak,
  LevelFormat } = require('docx')
const fs = require('fs')

const FONT = '맑은 고딕'
const PRIMARY = '3B82F6'
const ACCENT = '8B5CF6'
const EMERALD = '10B981'
const AMBER = 'F59E0B'
const ROSE = 'F43F5E'
const DARK = '111827'
const GRAY = '6B7280'
const LIGHT_BG = 'F8FAFC'
const BORDER = 'E2E8F0'

// 페이지 너비 (A4, 1인치 마진)
const PAGE_W = 11906
const PAGE_H = 16838
const MARGIN = 1440
const CONTENT_W = PAGE_W - MARGIN * 2 // 9026

const border = { style: BorderStyle.SINGLE, size: 1, color: BORDER }
const borders = { top: border, bottom: border, left: border, right: border }
const noBorders = { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }
const cellMargins = { top: 100, bottom: 100, left: 160, right: 160 }

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({ heading: level, spacing: { before: 360, after: 200 }, children: [new TextRun({ text, font: FONT, bold: true, color: DARK })] })
}

function body(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 160, line: 360 },
    ...opts.pOpts,
    children: [new TextRun({ text, font: FONT, size: 22, color: opts.color || '374151', ...opts.rOpts })]
  })
}

function bulletItem(text, bold = '') {
  const children = []
  if (bold) children.push(new TextRun({ text: bold, font: FONT, size: 22, bold: true, color: DARK }))
  children.push(new TextRun({ text, font: FONT, size: 22, color: '374151' }))
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { after: 80, line: 340 },
    children
  })
}

function numberItem(text, bold = '') {
  const children = []
  if (bold) children.push(new TextRun({ text: bold, font: FONT, size: 22, bold: true, color: DARK }))
  children.push(new TextRun({ text, font: FONT, size: 22, color: '374151' }))
  return new Paragraph({
    numbering: { reference: 'numbers', level: 0 },
    spacing: { after: 80, line: 340 },
    children
  })
}

function colorBar(text, color, bgColor) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [new TableRow({ children: [new TableCell({
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        left: { style: BorderStyle.SINGLE, size: 12, color } },
      shading: { fill: bgColor, type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 200, right: 200 },
      width: { size: CONTENT_W, type: WidthType.DXA },
      children: [new Paragraph({ children: [new TextRun({ text, font: FONT, size: 22, color: '374151' })] })]
    })]})],
  })
}

function phaseRow(code, name, desc, color) {
  return new TableRow({ children: [
    new TableCell({ borders, width: { size: 1800, type: WidthType.DXA }, margins: cellMargins,
      shading: { fill: color, type: ShadingType.CLEAR },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: code, font: FONT, size: 22, bold: true, color: 'FFFFFF' })] })] }),
    new TableCell({ borders, width: { size: 2200, type: WidthType.DXA }, margins: cellMargins,
      children: [new Paragraph({ children: [new TextRun({ text: name, font: FONT, size: 22, bold: true, color: DARK })] })] }),
    new TableCell({ borders, width: { size: CONTENT_W - 4000, type: WidthType.DXA }, margins: cellMargins,
      children: [new Paragraph({ children: [new TextRun({ text: desc, font: FONT, size: 20, color: GRAY })] })] }),
  ]})
}

// ── 문서 빌드 ──
const doc = new Document({
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: FONT, color: DARK },
        paragraph: { spacing: { before: 480, after: 240 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: FONT, color: DARK },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: FONT, color: '1F2937' },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [
    // ── 표지 ──
    {
      properties: {
        page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } },
      },
      children: [
        new Paragraph({ spacing: { before: 3000 } }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
          children: [new TextRun({ text: '커리큘럼 위버', font: FONT, size: 52, bold: true, color: DARK })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 },
          children: [new TextRun({ text: '제품 가이드북', font: FONT, size: 36, color: PRIMARY })] }),
        new Paragraph({ spacing: { before: 400 } }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 },
          children: [new TextRun({ text: 'AI와 함께 융합 수업을 설계하세요', font: FONT, size: 24, color: GRAY })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 },
          children: [new TextRun({ text: '40가지 설계 원리 기반 협력적 수업 설계 플랫폼', font: FONT, size: 22, color: GRAY })] }),
        new Paragraph({ spacing: { before: 2000 } }),
        new Paragraph({ alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: '2026년 4월', font: FONT, size: 20, color: '9CA3AF' })] }),
      ],
    },

    // ── 본문 ──
    {
      properties: {
        page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } },
      },
      headers: { default: new Header({ children: [
        new Paragraph({ alignment: AlignmentType.RIGHT, border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: PRIMARY, space: 4 } },
          children: [new TextRun({ text: '커리큘럼 위버 가이드북', font: FONT, size: 16, color: '9CA3AF' })] })
      ]})},
      footers: { default: new Footer({ children: [
        new Paragraph({ alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: '- ', font: FONT, size: 16, color: '9CA3AF' }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '9CA3AF' }),
            new TextRun({ text: ' -', font: FONT, size: 16, color: '9CA3AF' })] })
      ]})},
      children: [
        // ── 1. 소개 ──
        heading('1. 커리큘럼 위버란?'),
        body('커리큘럼 위버는 교사 팀이 AI 공동설계자와 함께 융합 수업을 체계적으로 설계하는 플랫폼입니다.'),
        body('TADDs-DIE 모형에 기반한 19개 절차를 따라, 각 단계마다 AI가 안내하고 제안하며, 교사는 수락/편집/거부를 선택합니다.'),

        colorBar('핵심 가치: AI는 조력자, 교사가 주도합니다. 모든 설계 결정은 교사 팀이 내립니다.', PRIMARY, 'EFF6FF'),

        new Paragraph({ spacing: { before: 200 } }),
        heading('대상 사용자', HeadingLevel.HEADING_3),
        bulletItem(' 2명 이상의 교사 팀 (융합 수업 설계)', '교사 팀 —'),
        bulletItem(' AI와 1:1로 수업을 설계하는 개인 교사', '개인 교사 —'),
        bulletItem(' 교육과정 분석 및 수업 설계 연구', '교육 연구자 —'),

        // ── 2. 빠른 시작 ──
        new Paragraph({ children: [new PageBreak()] }),
        heading('2. 빠른 시작 가이드'),
        body('4단계로 시작할 수 있습니다.'),

        numberItem(' 워크스페이스를 만들고 팀 이름과 설명을 입력합니다.', '워크스페이스 만들기 —'),
        numberItem(' 함께 설계할 동료 교사의 이메일로 초대합니다.', '팀원 초대 —'),
        numberItem(' 수업 주제, 대상 학년, 참여 교과를 설정합니다.', '프로젝트 생성 —'),
        numberItem(' AI 위버가 첫 절차를 안내합니다. 대화를 시작하세요!', 'AI와 설계 시작 —'),

        colorBar('팁: 데모 모드에서 먼저 체험해보세요. 로그인 없이 AI가 19개 절차를 자동 생성합니다.', AMBER, 'FFFBEB'),

        // ── 3. 워크플로우 ──
        new Paragraph({ children: [new PageBreak()] }),
        heading('3. 수업설계 워크플로우'),
        body('TADDs-DIE 모형은 6개 Phase, 19개 절차로 구성됩니다. 각 절차마다 고유한 설계 보드가 있고, AI가 4가지 역할(안내/생성/점검/기록)을 수행합니다.'),

        new Paragraph({ spacing: { before: 200 } }),
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [1800, 2200, CONTENT_W - 4000],
          rows: [
            // 헤더
            new TableRow({ children: [
              new TableCell({ borders, width: { size: 1800, type: WidthType.DXA }, margins: cellMargins,
                shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Phase', font: FONT, size: 20, bold: true, color: DARK })] })] }),
              new TableCell({ borders, width: { size: 2200, type: WidthType.DXA }, margins: cellMargins,
                shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
                children: [new Paragraph({ children: [new TextRun({ text: '이름', font: FONT, size: 20, bold: true, color: DARK })] })] }),
              new TableCell({ borders, width: { size: CONTENT_W - 4000, type: WidthType.DXA }, margins: cellMargins,
                shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
                children: [new Paragraph({ children: [new TextRun({ text: '절차', font: FONT, size: 20, bold: true, color: DARK })] })] }),
            ]}),
            phaseRow('prep', '준비', '학습자/맥락 정보 입력', '64748B'),
            phaseRow('T', '팀준비', 'T-1-1 비전설정, T-1-2 방향수립, T-2-1 역할분담, T-2-2 팀규칙, T-2-3 팀일정', ACCENT),
            phaseRow('A', '분석', 'A-1-1 주제선정기준, A-1-2 주제선정, A-2-1 성취기준분석, A-2-2 통합목표', PRIMARY),
            phaseRow('Ds', '설계', 'Ds-1-1 평가계획, Ds-1-2 문제상황, Ds-1-3 학습활동, Ds-2-1 지원도구, Ds-2-2 스캐폴딩', EMERALD),
            phaseRow('DI', '개발/실행', 'DI-1-1 자료목록, DI-2-1 수업기록', AMBER),
            phaseRow('E', '평가', 'E-1-1 수업성찰, E-2-1 과정성찰', ROSE),
          ],
        }),

        // AI 4가지 역할
        new Paragraph({ spacing: { before: 300 } }),
        heading('AI의 4가지 역할', HeadingLevel.HEADING_3),
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [2250, 2250, 2250, 2276],
          rows: [new TableRow({ children:
            [
              { role: '안내 (Guide)', desc: '절차의 목적과 방법을 설명합니다', color: 'DBEAFE', w: 2250 },
              { role: '생성 (Generate)', desc: '초안, 예시, 후보를 제시합니다', color: 'EDE9FE', w: 2250 },
              { role: '점검 (Check)', desc: '이전 절차와의 정합성을 검토합니다', color: 'D1FAE5', w: 2250 },
              { role: '기록 (Record)', desc: '확정된 내용을 저장합니다', color: 'F1F5F9', w: 2276 },
            ].map((r) => new TableCell({
              borders, width: { size: r.w, type: WidthType.DXA }, margins: cellMargins,
              shading: { fill: r.color, type: ShadingType.CLEAR },
              children: [
                new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: r.role, font: FONT, size: 20, bold: true, color: DARK })] }),
                new Paragraph({ children: [new TextRun({ text: r.desc, font: FONT, size: 18, color: GRAY })] }),
              ]
            }))
          })],
        }),

        // ── 4. 핵심 기능 ──
        new Paragraph({ children: [new PageBreak()] }),
        heading('4. 핵심 기능'),

        heading('4-1. AI 공동설계자', HeadingLevel.HEADING_2),
        body('각 절차에서 AI 위버가 교사와 대화하며 수업 설계를 도와줍니다. AI가 제안하면 교사는 수락, 편집, 거부 중 선택합니다.'),

        colorBar('교사: "기후변화를 주제로 과학과 수학을 융합하고 싶어요. 고1 학생들이 데이터를 직접 분석하면서 기후 문제를 이해할 수 있는 수업을 설계하고 싶습니다."', PRIMARY, 'EFF6FF'),
        new Paragraph({ spacing: { before: 100 } }),
        colorBar('AI 위버: "좋은 방향이에요! 몇 가지 방향을 제안드릴게요: 1) 기온 변화 데이터의 추세선 분석, 2) 탄소 배출량과 기온 상관관계, 3) 지역별 기후 데이터 비교. 어떤 방향이 마음에 드시나요?"', ACCENT, 'F5F3FF'),

        new Paragraph({ spacing: { before: 200 } }),
        heading('4-2. 설계 보드', HeadingLevel.HEADING_2),
        body('19개 절차마다 고유한 설계 보드가 있습니다. AI와 대화하면 보드에 자동으로 내용이 채워지고, 교사가 직접 편집할 수도 있습니다.'),
        bulletItem(' T-1-1 팀 비전 → 교육 비전, 핵심 가치, 기대 역량', '비전 보드:'),
        bulletItem(' A-2-1 성취기준 분석 → 교과별 성취기준 매핑', '분석 보드:'),
        bulletItem(' Ds-1-3 학습 활동 → 차시별 활동 구조', '설계 보드:'),

        new Paragraph({ spacing: { before: 200 } }),
        heading('4-3. 40가지 설계 원리', HeadingLevel.HEADING_2),
        body('각 절차에 관련된 설계 원리가 화면 우측에 표시됩니다. 원리를 참고하며 설계하면 교육학적 근거가 탄탄한 수업을 만들 수 있습니다.'),
        bulletItem(' 팀원들의 지식을 사회적/물리적으로 분산한다', '인지 분산의 원리 —'),
        bulletItem(' 설계 과정에서 아이디어 생성을 활성화한다', '활성화의 원리 —'),
        bulletItem(' 목적을 공유하고 신뢰를 바탕으로 설계팀을 형성한다', '상호 의존의 원리 —'),

        new Paragraph({ spacing: { before: 200 } }),
        heading('4-4. 실시간 협업', HeadingLevel.HEADING_2),
        body('여러 교사가 동시에 같은 프로젝트에서 작업할 수 있습니다. 보드 변경사항이 실시간으로 동기화되고, 댓글과 피드백을 남길 수 있습니다.'),

        // ── 5. 데모 ──
        new Paragraph({ children: [new PageBreak()] }),
        heading('5. 데모 모드'),
        body('로그인한 사용자는 누구나 데모 모드를 체험할 수 있습니다. 대상 학년, 참여 교과, 주제 키워드를 입력하면 AI가 19개 절차의 수업 설계를 자동으로 생성합니다.'),
        bulletItem(' 학년: 초5~고3 (복수 선택 가능)'),
        bulletItem(' 교과: 12개 기본 교과 + 직접 입력 가능 (2개 이상)'),
        bulletItem(' 주제: 자유 입력 (예: 기후변화, AI 윤리, 지역사회 문제)'),
        bulletItem(' 약 1~3분 후 전체 설계 결과를 확인할 수 있습니다'),

        // ── 6. FAQ ──
        new Paragraph({ spacing: { before: 200 } }),
        heading('6. 자주 묻는 질문'),

        heading('Q. 커리큘럼 위버는 무료인가요?', HeadingLevel.HEADING_3),
        body('현재 베타 기간 중 무료로 제공됩니다.'),

        heading('Q. 어떤 AI를 사용하나요?', HeadingLevel.HEADING_3),
        body('Anthropic의 Claude API를 사용합니다. 호스트가 Sonnet(빠른 응답) 또는 Opus(최고 품질) 중 선택할 수 있습니다.'),

        heading('Q. 몇 명까지 함께 설계할 수 있나요?', HeadingLevel.HEADING_3),
        body('하나의 워크스페이스에 제한 없이 팀원을 초대할 수 있습니다. 실시간 동시 접속은 100명까지 지원합니다.'),

        heading('Q. 생성된 수업 설계를 다운로드할 수 있나요?', HeadingLevel.HEADING_3),
        body('프로젝트 페이지의 "보고서" 버튼으로 전체 설계안을 PDF로 다운로드할 수 있습니다.'),

        heading('Q. 교육과정 성취기준은 어떻게 활용되나요?', HeadingLevel.HEADING_3),
        body('2022 개정 교육과정의 4,484개 성취기준이 내장되어 있습니다. 주제를 입력하면 관련 성취기준을 자동으로 매칭하고, 교과 간 연결을 시각화합니다.'),

        // ── 접속 정보 ──
        new Paragraph({ spacing: { before: 400 } }),
        colorBar('접속: https://curriculum-weaver.vercel.app  |  가이드: /guide  |  데모: /demo', PRIMARY, 'EFF6FF'),
      ],
    },
  ],
})

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync('/Users/greatsong/greatsong-project/curriculum-weaver/docs/커리큘럼위버_제품가이드북.docx', buffer)
  console.log('DOCX 생성 완료:', buffer.length, 'bytes')
})
