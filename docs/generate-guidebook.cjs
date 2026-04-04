const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, ExternalHyperlink,
  HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, PageBreak,
} = require("docx");

// ── Color scheme ──
const PRIMARY = "1B4F72";
const SECONDARY = "2E86C1";
const ACCENT = "5DADE2";
const BG_LIGHT = "EBF5FB";
const GRAY = "666666";
const BLACK = "1A1A1A";
const WHITE = "FFFFFF";
const BORDER_COLOR = "B0C4DE";

// ── Reusable border ──
const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR };
const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

// ── Page dimensions (A4) ──
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 1440;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ── Helpers ──
function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}
function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] });
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    ...opts,
    children: [new TextRun({ text, size: 22, font: "Arial", color: BLACK })],
  });
}
function pBold(text) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 22, font: "Arial", bold: true, color: PRIMARY })],
  });
}
function bullet(text, ref = "bullets", level = 0) {
  return new Paragraph({
    numbering: { reference: ref, level },
    children: [new TextRun({ text, size: 22, font: "Arial", color: BLACK })],
  });
}
function numberedItem(text, ref = "numbers") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    children: [new TextRun({ text, size: 22, font: "Arial", color: BLACK })],
  });
}
function spacer(h = 120) {
  return new Paragraph({ spacing: { after: h }, children: [] });
}

// ── Table helpers ──
function headerCell(text, width) {
  return new TableCell({
    borders: cellBorders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: PRIMARY, type: ShadingType.CLEAR },
    margins: cellMargins,
    verticalAlign: "center",
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, size: 20, font: "Arial", color: WHITE })] })],
  });
}
function dataCell(text, width, opts = {}) {
  return new TableCell({
    borders: cellBorders,
    width: { size: width, type: WidthType.DXA },
    shading: opts.shading ? { fill: opts.shading, type: ShadingType.CLEAR } : undefined,
    margins: cellMargins,
    children: [new Paragraph({ children: [new TextRun({ text, size: 20, font: "Arial", color: BLACK })] })],
  });
}
function makeTable(headers, rows, colWidths) {
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: totalW, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({ children: headers.map((h, i) => headerCell(h, colWidths[i])) }),
      ...rows.map((row, ri) =>
        new TableRow({
          children: row.map((cell, ci) =>
            dataCell(cell, colWidths[ci], { shading: ri % 2 === 1 ? BG_LIGHT : undefined })
          ),
        })
      ),
    ],
  });
}

function procedureBlock(code, name, purpose, question, deliverable, extra) {
  const items = [
    pBold(`${code}. ${name}`),
    bullet(`\uBAA9\uC801: ${purpose}`),
  ];
  if (question) items.push(bullet(`\uD575\uC2EC \uC9C8\uBB38: \u201C${question}\u201D`));
  items.push(bullet(`\uC0B0\uCD9C\uBB3C: ${deliverable}`));
  if (extra) items.push(bullet(extra));
  items.push(spacer(80));
  return items;
}

// ── Numbering configs ──
function makeNumConfig(ref) {
  return {
    reference: ref,
    levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
  };
}

// ── Build ──
async function build() {
  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 22, color: BLACK } } },
      paragraphStyles: [
        {
          id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 36, bold: true, font: "Arial", color: PRIMARY },
          paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 },
        },
        {
          id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 30, bold: true, font: "Arial", color: SECONDARY },
          paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 },
        },
        {
          id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 26, bold: true, font: "Arial", color: PRIMARY },
          paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
            { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
          ],
        },
        makeNumConfig("numbers"),
        makeNumConfig("numbers2"),
        makeNumConfig("numbers3"),
        makeNumConfig("numbers4"),
        makeNumConfig("numbers5"),
      ],
    },
    sections: [
      // ════════════ COVER PAGE ════════════
      {
        properties: {
          page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } },
        },
        children: [
          spacer(2400),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "CURRICULUM WEAVER", size: 28, font: "Arial", color: SECONDARY, bold: true })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: "\uCEE4\uB9AC\uD050\uB7FC \uC704\uBC84", size: 56, font: "Arial", bold: true, color: PRIMARY })] }),
          new Paragraph({
            alignment: AlignmentType.CENTER, spacing: { after: 100 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 8 } },
            children: [new TextRun({ text: "\uC81C\uD488 \uAC00\uC774\uB4DC\uBD81", size: 40, font: "Arial", color: SECONDARY })],
          }),
          spacer(600),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: "AI\uC640 \uD568\uAED8\uD558\uB294 \uD611\uB825\uC801 \uC218\uC5C5\uC124\uACC4 \uD50C\uB7AB\uD3FC", size: 24, font: "Arial", color: GRAY })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: "TADDs-DIE \uBAA8\uD615 \uAE30\uBC18 | 6\uB2E8\uACC4 19\uC808\uCC28 128\uC2A4\uD15D", size: 22, font: "Arial", color: GRAY })] }),
          spacer(1200),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "https://curriculum-weaver.vercel.app", size: 22, font: "Arial", color: SECONDARY })] }),
          spacer(200),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "2026\uB144 4\uC6D4", size: 22, font: "Arial", color: GRAY })] }),
        ],
      },

      // ════════════ MAIN CONTENT ════════════
      {
        properties: {
          page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ACCENT, space: 4 } },
              children: [new TextRun({ text: "\uCEE4\uB9AC\uD050\uB7FC \uC704\uBC84 \uC81C\uD488 \uAC00\uC774\uB4DC\uBD81", size: 18, font: "Arial", color: SECONDARY })],
            })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "- ", size: 18, color: GRAY }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: GRAY }), new TextRun({ text: " -", size: 18, color: GRAY })],
            })],
          }),
        },
        children: [
          // ── 목차 ──
          h1("\uBAA9\uCC28"),
          spacer(200),
          p("1. \uC18C\uAC1C"),
          p("2. \uC2DC\uC791\uD558\uAE30"),
          p("3. \uC218\uC5C5\uC124\uACC4 \uC6CC\uD06C\uD50C\uB85C\uC6B0 (6 Phase \u00D7 19 Procedure)"),
          p("4. \uC8FC\uC694 \uAE30\uB2A5 \uC548\uB0B4"),
          p("5. \uB370\uBAA8 \uBAA8\uB4DC"),
          p("6. FAQ / \uBB38\uC81C \uD574\uACB0"),

          // ── 1. 소개 ──
          new Paragraph({ children: [new PageBreak()] }),
          h1("1. \uC18C\uAC1C"),
          h2("\uCEE4\uB9AC\uD050\uB7FC \uC704\uBC84\uB780?"),
          p("\uCEE4\uB9AC\uD050\uB7FC \uC704\uBC84(Curriculum Weaver)\uB294 \uAD50\uC0AC \uD300\uC774 AI \uACF5\uB3D9\uC124\uACC4\uC790\uC640 \uD568\uAED8 TADDs-DIE \uBAA8\uD615 \uAE30\uBC18\uC73C\uB85C \uAD50\uACFC \uC735\uD569 \uC218\uC5C5\uC744 \uD611\uB825 \uC124\uACC4\uD558\uB294 \uD50C\uB7AB\uD3FC\uC785\uB2C8\uB2E4."),
          p("\uAD50\uC0AC\uB4E4\uC774 \uBE44\uC804 \uC124\uC815\uBD80\uD130 \uC218\uC5C5 \uC131\uCC30\uAE4C\uC9C0, \uCCB4\uACC4\uC801\uC778 19\uAC1C \uC808\uCC28\uB97C \uB530\uB77C \uD568\uAED8 \uC218\uC5C5\uC744 \uB9CC\uB4E4\uC5B4\uAC00\uB294 \uACFC\uC815\uC744 AI\uAC00 \uC548\uB0B4, \uC0DD\uC131, \uC810\uAC80, \uAE30\uB85D\uC758 4\uAC00\uC9C0 \uC5ED\uD560\uB85C \uC9C0\uC6D0\uD569\uB2C8\uB2E4."),
          spacer(100),

          h2("\uB300\uC0C1 \uC0AC\uC6A9\uC790"),
          bullet("\uAD50\uACFC \uC735\uD569 \uC218\uC5C5\uC744 \uC124\uACC4\uD558\uB824\uB294 \uAD50\uC0AC \uD300 (2\uC778 \uC774\uC0C1)"),
          bullet("\uAD50\uC721\uACFC\uC815 \uC7AC\uAD6C\uC131\uC5D0 \uAD00\uC2EC \uC788\uB294 \uAD50\uC0AC"),
          bullet("AI\uB97C \uC218\uC5C5 \uC124\uACC4 \uB3C4\uAD6C\uB85C \uD65C\uC6A9\uD558\uACE0 \uC2F6\uC740 \uAD50\uC0AC"),
          spacer(100),

          h2("\uD575\uC2EC \uAC00\uCE58"),
          makeTable(
            ["\uD575\uC2EC \uAC00\uCE58", "\uC124\uBA85"],
            [
              ["AI \uD611\uB825 \uC124\uACC4", "AI\uAC00 \uC548\uB0B4, \uC0DD\uC131, \uC810\uAC80, \uAE30\uB85D\uC758 4\uAC00\uC9C0 \uC5ED\uD560\uB85C \uC218\uC5C5\uC124\uACC4\uB97C \uC9C0\uC6D0\uD569\uB2C8\uB2E4"],
              ["\uCCB4\uACC4\uC801 \uC6CC\uD06C\uD50C\uB85C\uC6B0", "TADDs-DIE \uBAA8\uD615\uC758 6\uB2E8\uACC4 19\uC808\uCC28 128\uC2A4\uD15D\uC744 \uB530\uB77C \uCCB4\uACC4\uC801\uC73C\uB85C \uC9C4\uD589\uD569\uB2C8\uB2E4"],
              ["\uC2E4\uC2DC\uAC04 \uD611\uC5C5", "\uD300\uC6D0\uB4E4\uC774 \uB3D9\uC2DC\uC5D0 \uC811\uC18D\uD558\uC5EC \uBCF4\uB4DC\uC5D0 \uC758\uACAC\uC744 \uACF5\uC720\uD558\uACE0 \uD569\uC758\uD569\uB2C8\uB2E4"],
              ["\uAD6C\uC870\uD654\uB41C \uC0B0\uCD9C\uBB3C", "\uAC01 \uC808\uCC28\uB9C8\uB2E4 \uBCF4\uB4DC\uC5D0 \uC0B0\uCD9C\uBB3C\uC774 \uCD95\uC801\uB418\uC5B4 \uCD5C\uC885 \uBCF4\uACE0\uC11C\uB85C \uC815\uB9AC\uB429\uB2C8\uB2E4"],
            ],
            [2500, 6526]
          ),

          // ── 2. 시작하기 ──
          new Paragraph({ children: [new PageBreak()] }),
          h1("2. \uC2DC\uC791\uD558\uAE30"),

          h2("2.1 \uC811\uC18D \uBC0F \uB85C\uADF8\uC778"),
          numberedItem("\uC6F9 \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C curriculum-weaver.vercel.app \uC5D0 \uC811\uC18D\uD569\uB2C8\uB2E4.", "numbers"),
          numberedItem('"Google \uB85C\uADF8\uC778" \uBC84\uD2BC\uC744 \uD074\uB9AD\uD558\uC5EC Google \uACC4\uC815\uC73C\uB85C \uB85C\uADF8\uC778\uD569\uB2C8\uB2E4.', "numbers"),
          numberedItem("\uCD5C\uCD08 \uB85C\uADF8\uC778 \uC2DC \uD504\uB85C\uD544 \uC815\uBCF4\uAC00 \uC790\uB3D9\uC73C\uB85C \uC0DD\uC131\uB429\uB2C8\uB2E4.", "numbers"),
          spacer(100),

          h2("2.2 \uC6CC\uD06C\uC2A4\uD398\uC774\uC2A4 \uB9CC\uB4E4\uAE30"),
          numberedItem('\uB85C\uADF8\uC778 \uD6C4 "\uC6CC\uD06C\uC2A4\uD398\uC774\uC2A4" \uD398\uC774\uC9C0\uC5D0\uC11C "+ \uC0C8 \uC6CC\uD06C\uC2A4\uD398\uC774\uC2A4" \uBC84\uD2BC\uC744 \uD074\uB9AD\uD569\uB2C8\uB2E4.', "numbers2"),
          numberedItem("\uC6CC\uD06C\uC2A4\uD398\uC774\uC2A4 \uC774\uB984\uACFC \uC124\uBA85\uC744 \uC785\uB825\uD569\uB2C8\uB2E4.", "numbers2"),
          numberedItem('"\uB9CC\uB4E4\uAE30"\uB97C \uD074\uB9AD\uD558\uBA74 \uC6CC\uD06C\uC2A4\uD398\uC774\uC2A4\uAC00 \uC0DD\uC131\uB429\uB2C8\uB2E4.', "numbers2"),
          spacer(100),

          h2("2.3 \uD300\uC6D0 \uCD08\uB300"),
          numberedItem('\uC6CC\uD06C\uC2A4\uD398\uC774\uC2A4 \uC124\uC815\uC5D0\uC11C "\uD300\uC6D0 \uCD08\uB300"\uB97C \uC120\uD0DD\uD569\uB2C8\uB2E4.', "numbers3"),
          numberedItem("\uCD08\uB300\uD560 \uAD50\uC0AC\uC758 \uC774\uBA54\uC77C \uC8FC\uC18C\uB97C \uC785\uB825\uD569\uB2C8\uB2E4.", "numbers3"),
          numberedItem("\uCD08\uB300 \uB9C1\uD06C\uAC00 \uC774\uBA54\uC77C\uB85C \uBC1C\uC1A1\uB429\uB2C8\uB2E4.", "numbers3"),
          spacer(100),

          h2("2.4 \uD504\uB85C\uC81D\uD2B8 \uC0DD\uC131"),
          numberedItem('\uC6CC\uD06C\uC2A4\uD398\uC774\uC2A4 \uC548\uC5D0\uC11C "+ \uC0C8 \uD504\uB85C\uC81D\uD2B8" \uBC84\uD2BC\uC744 \uD074\uB9AD\uD569\uB2C8\uB2E4.', "numbers4"),
          numberedItem("\uD504\uB85C\uC81D\uD2B8\uBA85, \uB300\uC0C1 \uD559\uB144, \uCC38\uC5EC \uAD50\uACFC\uB97C \uC124\uC815\uD569\uB2C8\uB2E4.", "numbers4"),
          numberedItem("\uD504\uB85C\uC81D\uD2B8\uAC00 \uC0DD\uC131\uB418\uBA74 \uC218\uC5C5\uC124\uACC4 \uC6CC\uD06C\uD50C\uB85C\uC6B0\uAC00 \uC2DC\uC791\uB429\uB2C8\uB2E4.", "numbers4"),

          // ── 3. 워크플로우 ──
          new Paragraph({ children: [new PageBreak()] }),
          h1("3. \uC218\uC5C5\uC124\uACC4 \uC6CC\uD06C\uD50C\uB85C\uC6B0"),

          h2("3.1 TADDs-DIE \uBAA8\uD615 \uAC1C\uC694"),
          p("\uCEE4\uB9AC\uD050\uB7FC \uC704\uBC84\uB294 TADDs-DIE \uBAA8\uD615\uC5D0 \uAE30\uBC18\uD55C 6\uB2E8\uACC4(Phase) 19\uC808\uCC28(Procedure)\uC758 \uCCB4\uACC4\uC801 \uC218\uC5C5\uC124\uACC4 \uC6CC\uD06C\uD50C\uB85C\uC6B0\uB97C \uC81C\uACF5\uD569\uB2C8\uB2E4."),
          spacer(100),

          h3("6\uB2E8\uACC4 \uAC1C\uC694"),
          makeTable(
            ["\uC21C\uC11C", "Phase", "\uC774\uB984", "\uC124\uBA85", "\uC808\uCC28 \uC218"],
            [
              ["0", "prep", "\uC900\uBE44", "\uD559\uC2B5\uC790/\uB9E5\uB77D \uC815\uBCF4 \uC81C\uACF5", "1\uAC1C"],
              ["1", "T (Team)", "\uD300\uC900\uBE44", "\uBE44\uC804 \uC124\uC815, \uC218\uC5C5\uC124\uACC4 \uBC29\uD5A5, \uC5ED\uD560/\uADDC\uCE59/\uC77C\uC815", "5\uAC1C"],
              ["2", "A (Analysis)", "\uBD84\uC11D", "\uC8FC\uC81C \uC120\uC815, \uC131\uCDE8\uAE30\uC900 \uBD84\uC11D, \uD1B5\uD569 \uBAA9\uD45C", "4\uAC1C"],
              ["3", "Ds (Design)", "\uC124\uACC4", "\uD3C9\uAC00, \uBB38\uC81C\uC0C1\uD669, \uD559\uC2B5\uD65C\uB3D9, \uB3C4\uAD6C, \uC2A4\uCE90\uD3F4\uB529", "5\uAC1C"],
              ["4", "DI (Dev/Impl)", "\uAC1C\uBC1C/\uC2E4\uD589", "\uC790\uB8CC \uAC1C\uBC1C, \uC218\uC5C5 \uAE30\uB85D", "2\uAC1C"],
              ["5", "E (Evaluate)", "\uD3C9\uAC00", "\uC218\uC5C5 \uC131\uCC30, \uC124\uACC4 \uACFC\uC815 \uC131\uCC30", "2\uAC1C"],
            ],
            [800, 1600, 1200, 3626, 1800]
          ),
          spacer(200),

          h2("3.2 19\uAC1C \uC808\uCC28 \uC0C1\uC138"),

          // Phase T
          h3("Phase T: \uD300\uC900\uBE44"),
          ...procedureBlock("T-1-1", "\uBE44\uC804\uC124\uC815", "\uD300\uC6D0\uB4E4\uC774 \uACF5\uD1B5 \uBE44\uC804\uC744 \uC124\uC815\uD558\uC5EC \uC124\uACC4\uC758 \uBC29\uD5A5\uC131\uC744 \uD655\uB9BD\uD569\uB2C8\uB2E4.",
            "\uC6B0\uB9AC \uD300\uC774 \uD611\uB825\uC801 \uC218\uC5C5\uC124\uACC4\uB97C \uD1B5\uD574 \uC2E4\uD604\uD558\uACE0\uC790 \uD558\uB294 \uAD81\uADF9\uC801\uC778 \uAD50\uC721 \uBAA9\uC801\uC740 \uBB34\uC5C7\uC778\uAC00?",
            "\uD300 \uACF5\uD1B5 \uBE44\uC804 \uBB38\uC7A5", "\uC9C4\uD589: \uAC1C\uC778 \uBE44\uC804 \uAD6C\uC0C1 \u2192 AI \uC815\uAD50\uD654 \u2192 \uD300 \uB17C\uC758 \u2192 \uACF5\uD1B5 \uBE44\uC804 \uD6C4\uBCF4 \uC0DD\uC131 \u2192 \uCD5C\uC885 \uD569\uC758"),
          ...procedureBlock("T-1-2", "\uC218\uC5C5\uC124\uACC4 \uBC29\uD5A5 \uC218\uB9BD", "\uBE44\uC804\uC744 \uAE30\uBC18\uC73C\uB85C \uD575\uC2EC \uD0A4\uC6CC\uB4DC\uB97C \uB3C4\uCD9C\uD558\uACE0 \uC124\uACC4\uC758 \uAD6C\uCCB4\uC801 \uBC29\uD5A5\uC744 \uD569\uC758\uD569\uB2C8\uB2E4.",
            "\uC124\uACC4\uC758 \uBAA9\uC801\uC744 \uB2EC\uC131\uD558\uAE30 \uC704\uD574 \uC9C0\uD5A5\uD574\uC57C \uD560 \uC218\uC5C5\uC124\uACC4\uC758 \uBC29\uD5A5\uC740 \uBB34\uC5C7\uC778\uAC00?",
            "\uD575\uC2EC \uD0A4\uC6CC\uB4DC \uBAA9\uB85D + \uC218\uC5C5\uC124\uACC4 \uBC29\uD5A5 \uC9C4\uC220\uBB38",
            "\uC815\uD569\uC131 \uC810\uAC80: AI\uAC00 \uC218\uC5C5\uC124\uACC4 \uBC29\uD5A5\uC774 \uD300 \uBE44\uC804(T-1-1)\uACFC \uC815\uD569\uD558\uB294\uC9C0 \uC790\uB3D9 \uC810\uAC80"),
          ...procedureBlock("T-2-1", "\uC5ED\uD560 \uBD84\uB2F4", "\uD300\uC6D0\uBCC4 \uAC15\uC810\uC744 \uD30C\uC545\uD558\uACE0 \uC5ED\uD560\uC744 \uBC30\uBD84\uD569\uB2C8\uB2E4.", null, "\uD300\uC6D0\uBCC4 \uC5ED\uD560 \uBD84\uB2F4\uD45C", null),
          ...procedureBlock("T-2-2", "\uD300 \uADDC\uCE59", "Ground Rule\uC744 \uBE0C\uB808\uC778\uC2A4\uD1A0\uBC0D\uD558\uACE0 \uD575\uC2EC \uADDC\uCE59\uC744 \uD655\uC815\uD569\uB2C8\uB2E4.", null, "\uD300 \uD575\uC2EC \uADDC\uCE59 \uBAA9\uB85D", null),
          ...procedureBlock("T-2-3", "\uD300 \uC77C\uC815", "\uAC1C\uC778 \uC77C\uC815\uC744 \uACF5\uC720\uD558\uACE0 \uD300 \uC77C\uC815\uD45C\uB97C \uC218\uB9BD\uD569\uB2C8\uB2E4.", null, "\uD300 \uD65C\uB3D9 \uC77C\uC815\uD45C", null),

          // Phase A
          h3("Phase A: \uBD84\uC11D"),
          ...procedureBlock("A-1-1", "\uC8FC\uC81C \uC120\uC815 \uAE30\uC900", "\uC735\uD569 \uC218\uC5C5 \uC8FC\uC81C\uB97C \uC120\uC815\uD558\uAE30 \uC704\uD55C \uAE30\uC900\uC744 \uB17C\uC758\uD558\uACE0 \uD655\uC815\uD569\uB2C8\uB2E4.", null, "\uC8FC\uC81C \uC120\uC815 \uAE30\uC900 \uBAA9\uB85D (\uAE30\uC900\uBA85, \uC124\uBA85, \uAC00\uC911\uCE58)", null),
          ...procedureBlock("A-1-2", "\uC8FC\uC81C \uC120\uC815", "\uAD50\uACFC \uC5F0\uACC4 \uC8FC\uC81C\uB97C \uAD6C\uC0C1\uD558\uACE0 \uBE44\uAD50/\uD3C9\uAC00\uB97C \uAC70\uCCD0 \uCD5C\uC885 \uC8FC\uC81C\uB97C \uC120\uC815\uD569\uB2C8\uB2E4.", null, "\uCD5C\uC885 \uC120\uC815 \uC8FC\uC81C + \uC120\uC815 \uADFC\uAC70",
            "\uC815\uD569\uC131 \uC810\uAC80: \uC120\uC815 \uC8FC\uC81C\uAC00 \uBE44\uC804 \uBC0F \uC120\uC815 \uAE30\uC900\uC5D0 \uBD80\uD569\uD558\uB294\uC9C0 AI\uAC00 \uAC80\uD1A0"),
          ...procedureBlock("A-2-1", "\uD575\uC2EC \uC544\uC774\uB514\uC5B4 \uBC0F \uC131\uCDE8\uAE30\uC900 \uBD84\uC11D", "\uAD50\uACFC\uBCC4 \uC131\uCDE8\uAE30\uC900\uC758 \uC9C0\uC2DD/\uC774\uD574, \uACFC\uC815/\uAE30\uB2A5, \uAC00\uCE58/\uD0DC\uB3C4\uB97C \uBD84\uC11D\uD558\uACE0 \uC5F0\uACB0\uB9F5\uC744 \uC791\uC131\uD569\uB2C8\uB2E4.", null, "\uC131\uCDE8\uAE30\uC900 \uBD84\uC11D\uD45C + \uAD50\uACFC \uAC04 \uC5F0\uACB0\uB9F5", null),
          ...procedureBlock("A-2-2", "\uD1B5\uD569\uB41C \uC218\uC5C5 \uBAA9\uD45C", "\uAD50\uACFC\uBCC4 \uC138\uBD80\uD559\uC2B5\uBAA9\uD45C\uB97C \uD1B5\uD569\uD558\uC5EC \uC735\uD569 \uC218\uC5C5\uC758 \uD1B5\uD569\uD559\uC2B5\uBAA9\uD45C\uB97C \uC218\uB9BD\uD569\uB2C8\uB2E4.", null, "\uD1B5\uD569 \uD559\uC2B5\uBAA9\uD45C \uC9C4\uC220\uBB38",
            "\uC815\uD569\uC131 \uC810\uAC80: \uBE44\uC804, \uC131\uCDE8\uAE30\uC900, \uC218\uC5C5\uBAA9\uD45C \uAC04\uC758 \uC815\uD569\uC131 AI \uAC80\uD1A0"),

          // Phase Ds
          new Paragraph({ children: [new PageBreak()] }),
          h3("Phase Ds: \uC124\uACC4"),
          ...procedureBlock("Ds-1-1", "\uD3C9\uAC00 \uACC4\uD68D", "\uAD50\uACFC\uBCC4 \uD3C9\uAC00 \uB0B4\uC6A9\uACFC \uBC29\uBC95\uC744 \uAD6C\uC0C1\uD558\uACE0 \uC218\uC5C5\uBAA9\uD45C-\uD3C9\uAC00 \uC815\uD569\uC131\uC744 \uAC80\uD1A0\uD569\uB2C8\uB2E4.", null, "\uD3C9\uAC00 \uD56D\uBAA9\uD45C (\uD65C\uB3D9\uBCC4 \uD3C9\uAC00 \uB0B4\uC6A9, \uBC29\uBC95, \uB8E8\uBE0C\uB9AD)", null),
          ...procedureBlock("Ds-1-2", "\uBB38\uC81C \uC0C1\uD669", "\uC2E4\uC81C \uB370\uC774\uD130 \uAE30\uBC18\uC758 \uBB38\uC81C \uC0C1\uD669 \uCD08\uC548\uC744 \uC0DD\uC131\uD558\uACE0 \uD1B5\uD569 \uBB38\uC81C \uC0C1\uD669\uC744 \uACB0\uC815\uD569\uB2C8\uB2E4.", null, "\uD1B5\uD569 \uBB38\uC81C \uC0C1\uD669 + \uC2E4\uC81C \uB370\uC774\uD130 \uCD9C\uCC98", null),
          ...procedureBlock("Ds-1-3", "\uD559\uC2B5 \uD65C\uB3D9 \uC124\uACC4", "\uBB38\uC81C \uD574\uACB0 \uC808\uCC28\uC5D0 \uB530\uB978 \uD559\uC2B5 \uD65C\uB3D9\uC744 \uC124\uACC4\uD558\uACE0 \uAD50\uACFC/\uC2DC\uAC04 \uBC30\uBD84\uC744 \uACB0\uC815\uD569\uB2C8\uB2E4.", null, "\uD559\uC2B5 \uD65C\uB3D9 \uACC4\uD68D\uD45C (\uC21C\uC11C, \uD65C\uB3D9\uBA85, \uC124\uBA85, \uAD50\uACFC, \uCC28\uC2DC)", null),
          ...procedureBlock("Ds-2-1", "\uC9C0\uC6D0 \uB3C4\uAD6C \uC124\uACC4", "\uD559\uC2B5 \uD65C\uB3D9\uC5D0 \uD544\uC694\uD55C \uB3C4\uAD6C\uB97C \uC120\uC815\uD558\uACE0 \uD65C\uC6A9 \uBC29\uC548\uC744 \uB9E4\uCE6D\uD569\uB2C8\uB2E4.", null, "\uD559\uC2B5\uD65C\uB3D9-\uB3C4\uAD6C \uB9E4\uCE6D\uD45C", null),
          ...procedureBlock("Ds-2-2", "\uC2A4\uCE90\uD3F4\uB529 \uC124\uACC4", "\uD559\uC2B5\uC790 \uAD00\uC810\uC5D0\uC11C \uC2A4\uCE90\uD3F4\uB529 \uBC29\uC548\uC744 \uC124\uACC4\uD558\uACE0 \uC801\uC808\uC131\uC744 \uAC80\uD1A0\uD569\uB2C8\uB2E4.", null, "\uC2A4\uCE90\uD3F4\uB529 \uACC4\uD68D\uD45C", null),

          // Phase DI
          h3("Phase DI: \uAC1C\uBC1C/\uC2E4\uD589"),
          ...procedureBlock("DI-1-1", "\uAC1C\uBC1C \uC790\uB8CC \uBAA9\uB85D", "\uAD50\uACFC\uBCC4 \uAC1C\uBC1C/\uD0D0\uC0C9 \uC790\uB8CC\uB97C \uAD6C\uBD84\uD558\uACE0 \uC81C\uC791 \uC5ED\uD560/\uC77C\uC815/\uC6B0\uC120\uC21C\uC704\uB97C \uC870\uC815\uD569\uB2C8\uB2E4.", null, "\uAC1C\uBC1C \uC790\uB8CC \uBAA9\uB85D\uD45C", null),
          ...procedureBlock("DI-2-1", "\uC218\uC5C5 \uAE30\uB85D", "\uC218\uC5C5 \uC2E4\uD589 \uC911 \uC8FC\uC694 \uC0C1\uD669\uC744 \uAE30\uB85D\uD558\uACE0 \uC804\uC0AC/\uBD84\uC11D\uC744 \uD1B5\uD574 \uC2DC\uC0AC\uC810\uC744 \uB3C4\uCD9C\uD569\uB2C8\uB2E4.", null, "\uC218\uC5C5 \uAE30\uB85D + \uC885\uD569 \uC2DC\uC0AC\uC810", null),

          // Phase E
          h3("Phase E: \uD3C9\uAC00"),
          ...procedureBlock("E-1-1", "\uC218\uC5C5 \uC131\uCC30", "\uC218\uC5C5 \uACFC\uC815\uACFC \uACB0\uACFC\uB97C \uACF5\uC720\uD558\uACE0 \uAC1C\uC120\uC0AC\uD56D\uC744 \uB3C4\uCD9C\uD569\uB2C8\uB2E4.", null, "\uAC1C\uC120\uC0AC\uD56D \uBAA9\uB85D + \uC218\uC5C5 \uAC1C\uC120 \uC544\uC774\uB514\uC5B4", null),
          ...procedureBlock("E-2-1", "\uC218\uC5C5\uC124\uACC4 \uACFC\uC815 \uC131\uCC30", "\uD611\uB825\uC801 \uC218\uC5C5\uC124\uACC4 \uC804\uCCB4 \uACFC\uC815\uC744 \uC131\uCC30\uD558\uACE0 \uAC1C\uC120\uC0AC\uD56D\uC744 \uB3C4\uCD9C/\uC218\uC815/\uBCF4\uC644\uD569\uB2C8\uB2E4.", null, "\uCD5C\uC885 \uAC1C\uC120\uC0AC\uD56D + \uC218\uC815/\uBCF4\uC644 \uACC4\uD68D", null),

          spacer(200),
          h2("3.3 AI\uC758 4\uAC00\uC9C0 \uC5ED\uD560"),
          p("\uAC01 \uC808\uCC28\uC5D0\uC11C AI\uB294 \uB2E4\uC74C 4\uAC00\uC9C0 \uC5ED\uD560\uC744 \uC218\uD589\uD569\uB2C8\uB2E4:"),
          makeTable(
            ["\uC5ED\uD560", "\uC124\uBA85", "\uC608\uC2DC"],
            [
              ["\uC548\uB0B4(Guide)", "\uD65C\uB3D9\uC758 \uC758\uBBF8, \uBC29\uBC95, \uC88B\uC740 \uACB0\uACFC\uC758 \uC694\uAC74\uC744 \uC124\uBA85", "\uBE44\uC804 \uC124\uC815\uC758 \uC758\uBBF8\uC640 \uBC29\uBC95 \uC548\uB0B4"],
              ["\uC0DD\uC131(Generate)", "\uD300\uC758 \uB17C\uC758\uB97C \uBC14\uD0D5\uC73C\uB85C \uCD08\uC548, \uC608\uC2DC, \uD6C4\uBCF4 \uC0DD\uC131", "\uACF5\uD1B5 \uBE44\uC804 \uD6C4\uBCF4 3\uAC1C \uC0DD\uC131"],
              ["\uC810\uAC80(Check)", "\uC774\uC804 \uB2E8\uACC4\uC640\uC758 \uC815\uD569\uC131, \uC801\uC808\uC131\uC744 \uAC80\uD1A0", "\uBE44\uC804-\uBC29\uD5A5 \uC815\uD569\uC131 \uC810\uAC80"],
              ["\uAE30\uB85D(Record)", "\uD655\uC815\uB41C \uB0B4\uC6A9\uC744 \uBCF4\uB4DC\uC5D0 \uC800\uC7A5\uD558\uACE0 \uC694\uC57D \uB9AC\uD3EC\uD2B8 \uC0DD\uC131", "\uBCF4\uB4DC \uC790\uB3D9 \uC800\uC7A5, \uC694\uC57D \uB9AC\uD3EC\uD2B8"],
            ],
            [1800, 4226, 3000]
          ),
          spacer(200),

          h2("3.4 8\uAC00\uC9C0 \uC561\uC158 \uD0C0\uC785"),
          p("\uAC01 \uC2A4\uD15D\uC740 \uC544\uB798 8\uAC00\uC9C0 \uC561\uC158 \uD0C0\uC785 \uC911 \uD558\uB098\uB85C \uBD84\uB958\uB429\uB2C8\uB2E4:"),
          makeTable(
            ["\uC561\uC158", "\uC124\uBA85"],
            [
              ["\uC548\uB0B4(guide)", "\uB2E8\uACC4\uBCC4 \uD65C\uB3D9 \uBC29\uBC95 \uC124\uBA85"],
              ["\uD310\uB2E8(judge)", "\uAC1C\uC778 \uC758\uACAC \uAD6C\uC0C1/\uACB0\uC815"],
              ["\uC0DD\uC131(generate)", "\uCD08\uC548/\uC608\uC2DC/\uD6C4\uBCF4 \uC0DD\uC131"],
              ["\uD611\uC758(discuss)", "\uD300 \uB17C\uC758/\uBE0C\uB808\uC778\uC2A4\uD1A0\uBC0D"],
              ["\uACF5\uC720(share)", "\uAC1C\uC778 \uACB0\uACFC\uBB3C \uD300 \uACF5\uC720"],
              ["\uC870\uC815(adjust)", "\uC758\uACAC \uD1B5\uD569/\uC6B0\uC120\uC21C\uC704 \uC870\uC815"],
              ["\uC810\uAC80(check)", "\uC815\uD569\uC131/\uC801\uC808\uC131 \uAC80\uD1A0"],
              ["\uAE30\uB85D(record)", "\uD655\uC815 \uB0B4\uC6A9 \uC800\uC7A5/\uB9AC\uD3EC\uD2B8"],
            ],
            [2500, 6526]
          ),
          spacer(200),

          h2("3.5 \uD589\uC704 \uC8FC\uCCB4 (5\uC885)"),
          makeTable(
            ["\uD589\uC704\uC790", "\uC124\uBA85"],
            [
              ["\uAC1C\uC778\uAD50\uC0AC", "\uAD50\uC0AC \uD63C\uC790 \uC218\uD589"],
              ["\uAC1C\uC778\uAD50\uC0AC+AI", "\uAD50\uC0AC\uAC00 AI \uB3C4\uC6C0 \uBC1B\uC544 \uC218\uD589"],
              ["\uAD50\uC0AC\uD300", "\uD300\uC6D0\uB4E4\uC774 \uD568\uAED8 \uB17C\uC758"],
              ["\uAD50\uC0AC\uD300+AI", "\uD300\uC774 AI \uB3C4\uC6C0 \uBC1B\uC544 \uC218\uD589"],
              ["AI \uB2E8\uB3C5", "AI\uAC00 \uC790\uB3D9 \uC218\uD589"],
            ],
            [2500, 6526]
          ),

          // ── 4. 주요 기능 ──
          new Paragraph({ children: [new PageBreak()] }),
          h1("4. \uC8FC\uC694 \uAE30\uB2A5 \uC548\uB0B4"),

          h2("4.1 \uC124\uACC4 \uBCF4\uB4DC"),
          bullet("\uAC01 \uC808\uCC28(Procedure)\uB9C8\uB2E4 \uD558\uB098\uC758 \uC124\uACC4 \uBCF4\uB4DC\uAC00 \uB300\uC751\uB429\uB2C8\uB2E4."),
          bullet("\uBCF4\uB4DC\uB294 \uC808\uCC28\uC758 \uC0B0\uCD9C\uBB3C\uC744 \uAD6C\uC870\uD654\uB41C \uD615\uD0DC\uB85C \uC800\uC7A5\uD569\uB2C8\uB2E4."),
          bullet("\uD14D\uC2A4\uD2B8 \uC785\uB825, \uBAA9\uB85D, \uD0DC\uADF8, \uD14C\uC774\uBE14 \uB4F1 \uB2E4\uC591\uD55C \uC785\uB825 \uD615\uD0DC\uB97C \uC9C0\uC6D0\uD569\uB2C8\uB2E4."),
          bullet("\uD300\uC6D0\uC774 \uB3D9\uC2DC\uC5D0 \uBCF4\uB4DC\uB97C \uD3B8\uC9D1\uD558\uBA74 \uC2E4\uC2DC\uAC04\uC73C\uB85C \uBCC0\uACBD \uC0AC\uD56D\uC774 \uBC18\uC601\uB429\uB2C8\uB2E4."),
          spacer(100),

          h3("\uBCF4\uB4DC \uD0C0\uC785 \uBAA9\uB85D"),
          makeTable(
            ["\uC808\uCC28", "\uBCF4\uB4DC \uC774\uB984", "\uC8FC\uC694 \uD544\uB4DC"],
            [
              ["prep", "\uD559\uC2B5\uC790 \uB9E5\uB77D", "\uD559\uB144, \uD559\uC0DD \uC218, \uB514\uC9C0\uD138 \uB9AC\uD130\uB7EC\uC2DC"],
              ["T-1-1", "\uD300 \uBE44\uC804", "\uAC1C\uC778 \uBE44\uC804, \uACF5\uD1B5 \uBE44\uC804 \uD6C4\uBCF4, \uD300 \uACF5\uD1B5 \uBE44\uC804"],
              ["T-1-2", "\uC218\uC5C5\uC124\uACC4 \uBC29\uD5A5", "\uD575\uC2EC \uD0A4\uC6CC\uB4DC, \uC124\uACC4 \uBC29\uD5A5, \uC815\uD569\uC131"],
              ["T-2-1", "\uC5ED\uD560 \uBD84\uB2F4", "\uAD50\uC0AC\uBA85, \uB2F4\uB2F9 \uAD50\uACFC, \uAC15\uC810, \uC5ED\uD560"],
              ["T-2-2", "\uD300 \uADDC\uCE59", "\uBE0C\uB808\uC778\uC2A4\uD1A0\uBC0D \uADDC\uCE59, \uD575\uC2EC \uADDC\uCE59"],
              ["T-2-3", "\uD300 \uC77C\uC815", "\uB0A0\uC9DC, \uD65C\uB3D9 \uB0B4\uC6A9, \uB9C8\uAC10/\uC0B0\uCD9C\uBB3C"],
              ["A-1-1", "\uC8FC\uC81C \uC120\uC815 \uAE30\uC900", "\uAE30\uC900\uBA85, \uC124\uBA85, \uAC00\uC911\uCE58"],
              ["A-1-2", "\uC120\uC815 \uC8FC\uC81C", "\uC8FC\uC81C \uD6C4\uBCF4, \uBE44\uAD50\uD45C, \uCD5C\uC885 \uC8FC\uC81C"],
              ["A-2-1", "\uC131\uCDE8\uAE30\uC900 \uBD84\uC11D", "\uAD50\uACFC, \uC131\uCDE8\uAE30\uC900, \uC9C0\uC2DD/\uACFC\uC815/\uAC00\uCE58"],
              ["A-2-2", "\uD1B5\uD569 \uC218\uC5C5\uBAA9\uD45C", "\uC138\uBD80 \uD559\uC2B5\uBAA9\uD45C, \uD1B5\uD569 \uD559\uC2B5\uBAA9\uD45C"],
              ["Ds-1-1", "\uD3C9\uAC00 \uACC4\uD68D", "\uB300\uC0C1 \uD65C\uB3D9, \uD3C9\uAC00 \uB0B4\uC6A9/\uBC29\uBC95, \uB8E8\uBE0C\uB9AD"],
              ["Ds-1-2", "\uBB38\uC81C \uC0C1\uD669", "\uBB38\uC81C \uC0C1\uD669 \uD6C4\uBCF4, \uC120\uC815 \uBB38\uC81C \uC0C1\uD669"],
              ["Ds-1-3", "\uD559\uC2B5 \uD65C\uB3D9", "\uC21C\uC11C, \uD65C\uB3D9\uBA85, \uC124\uBA85, \uAD50\uACFC, \uCC28\uC2DC"],
              ["Ds-2-1", "\uC9C0\uC6D0 \uB3C4\uAD6C", "\uB300\uC0C1 \uD65C\uB3D9, \uB3C4\uAD6C\uBA85, \uD65C\uC6A9 \uBC29\uC548"],
              ["Ds-2-2", "\uC2A4\uCE90\uD3F4\uB529 \uC124\uACC4", "\uD65C\uB3D9, \uC720\uD615, \uB0B4\uC6A9, \uB300\uC0C1 \uC218\uC900"],
              ["DI-1-1", "\uAC1C\uBC1C \uC790\uB8CC \uBAA9\uB85D", "\uC790\uB8CC \uC720\uD615/\uBA85, \uAD50\uACFC, \uB2F4\uB2F9\uC790"],
              ["DI-2-1", "\uC218\uC5C5 \uAE30\uB85D", "\uC2DC\uC810, \uC0C1\uD669, \uD559\uC0DD \uBC18\uC751, \uC2DC\uC0AC\uC810"],
              ["E-1-1", "\uC218\uC5C5 \uC131\uCC30", "\uD559\uC2B5 \uACFC\uC815/\uACB0\uACFC, \uAC1C\uC120\uC0AC\uD56D"],
              ["E-2-1", "\uACFC\uC815 \uC131\uCC30", "\uB2E8\uACC4\uBCC4 \uC131\uCC30, \uCD5C\uC885 \uAC1C\uC120\uC0AC\uD56D"],
            ],
            [1200, 2400, 5426]
          ),
          spacer(200),

          h2("4.2 AI \uCC44\uD305 \uD328\uB110"),
          bullet("\uD654\uBA74 \uC6B0\uCE21\uC5D0 \uC704\uCE58\uD55C AI \uCC44\uD305 \uD328\uB110\uC744 \uD1B5\uD574 AI \uACF5\uB3D9\uC124\uACC4\uC790\uC640 \uB300\uD654\uD569\uB2C8\uB2E4."),
          bullet("AI\uB294 \uD604\uC7AC \uC808\uCC28\uC5D0 \uB9DE\uB294 \uC5ED\uD560(\uC548\uB0B4/\uC0DD\uC131/\uC810\uAC80/\uAE30\uB85D)\uC744 \uC790\uB3D9\uC73C\uB85C \uC218\uD589\uD569\uB2C8\uB2E4."),
          bullet('AI\uAC00 \uC0DD\uC131\uD55C \uB0B4\uC6A9\uC740 "\uC218\uB77D", "\uD3B8\uC9D1", "\uAC70\uBD80" \uC911 \uC120\uD0DD\uD558\uC5EC \uBCF4\uB4DC\uC5D0 \uBC18\uC601\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.'),
          bullet("\uC2A4\uD2B8\uB9AC\uBC0D \uBC29\uC2DD\uC73C\uB85C \uC751\uB2F5\uC774 \uC2E4\uC2DC\uAC04 \uCD9C\uB825\uB429\uB2C8\uB2E4."),
          spacer(100),

          h2("4.3 \uC131\uCDE8\uAE30\uC900 \uAC80\uC0C9/\uBD84\uC11D"),
          bullet("2022 \uAC1C\uC815 \uAD50\uC721\uACFC\uC815\uC758 \uC131\uCDE8\uAE30\uC900 \uB370\uC774\uD130\uAC00 \uB0B4\uC7A5\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4."),
          bullet("\uAD50\uACFC, \uD559\uB144\uAD70, \uC601\uC5ED\uBCC4\uB85C \uC131\uCDE8\uAE30\uC900\uC744 \uAC80\uC0C9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."),
          bullet("\uAD50\uACFC \uAC04 \uC131\uCDE8\uAE30\uC900 \uC5F0\uACB0 \uAD00\uACC4\uB97C \uC2DC\uAC01\uC801\uC73C\uB85C \uD0D0\uC0C9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."),
          bullet("\uADF8\uB798\uD504 \uC2DC\uAC01\uD654\uB97C \uD1B5\uD574 \uAD50\uACFC \uAC04 \uC735\uD569 \uAC00\uB2A5\uC131\uC744 \uD30C\uC545\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."),
          spacer(100),

          h2("4.4 \uD30C\uC77C \uC5C5\uB85C\uB4DC"),
          bullet("\uAD50\uACFC\uC11C, \uC9C0\uB3C4\uC11C, \uCC38\uACE0\uC790\uB8CC \uB4F1\uC744 \uC5C5\uB85C\uB4DC\uD558\uC5EC AI \uBD84\uC11D\uC5D0 \uD65C\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."),
          bullet("\uC9C0\uC6D0 \uD30C\uC77C \uD615\uC2DD: PDF, Word(docx/doc), HWP, \uC774\uBBF8\uC9C0(PNG, JPG), \uC2A4\uD504\uB808\uB4DC\uC2DC\uD2B8(xlsx, csv)"),
          bullet("\uCD5C\uB300 \uD30C\uC77C \uD06C\uAE30: 50MB"),
          bullet("\uC5C5\uB85C\uB4DC\uB41C \uD30C\uC77C\uC740 AI\uAC00 \uB0B4\uC6A9\uC744 \uBD84\uC11D\uD558\uC5EC \uC218\uC5C5\uC124\uACC4\uC5D0 \uCC38\uACE0\uD569\uB2C8\uB2E4."),
          spacer(100),

          h2("4.5 \uC124\uACC4 \uC6D0\uB9AC \uD328\uB110"),
          bullet("AI\uAC00 \uD604\uC7AC \uC808\uCC28\uC640 \uAD00\uB828\uB41C \uC124\uACC4 \uC6D0\uB9AC\uB97C \uC2E4\uC2DC\uAC04\uC73C\uB85C \uC81C\uC2DC\uD569\uB2C8\uB2E4."),
          bullet("40\uAC00\uC9C0 \uC124\uACC4 \uC6D0\uB9AC\uC5D0\uC11C \uB9E5\uB77D\uC5D0 \uB9DE\uB294 \uC6D0\uB9AC\uB97C \uC790\uB3D9 \uCD94\uCC9C\uD569\uB2C8\uB2E4."),
          spacer(100),

          h2("4.6 \uB313\uAE00/\uD53C\uB4DC\uBC31"),
          bullet("\uBCF4\uB4DC\uC758 \uAC01 \uD56D\uBAA9\uC5D0 \uD300\uC6D0\uC774 \uB313\uAE00\uC744 \uB0A8\uAE38 \uC218 \uC788\uC2B5\uB2C8\uB2E4."),
          bullet("AI\uB3C4 \uD53C\uB4DC\uBC31\uC744 \uC81C\uACF5\uD558\uC5EC \uAC1C\uC120\uC810\uC744 \uC81C\uC548\uD569\uB2C8\uB2E4."),
          spacer(100),

          h2("4.7 \uBCF4\uACE0\uC11C \uB2E4\uC6B4\uB85C\uB4DC"),
          bullet("\uC218\uC5C5\uC124\uACC4\uAC00 \uC644\uB8CC\uB418\uBA74 \uC804\uCCB4 \uBCF4\uB4DC \uB0B4\uC6A9\uC744 \uC885\uD569\uD55C \uBCF4\uACE0\uC11C\uB97C \uB2E4\uC6B4\uB85C\uB4DC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."),
          bullet("19\uAC1C \uC808\uCC28\uC758 \uC0B0\uCD9C\uBB3C\uC774 \uCCB4\uACC4\uC801\uC73C\uB85C \uC815\uB9AC\uB41C \uD615\uD0DC\uB85C \uC81C\uACF5\uB429\uB2C8\uB2E4."),

          // ── 5. 데모 모드 ──
          new Paragraph({ children: [new PageBreak()] }),
          h1("5. \uB370\uBAA8 \uBAA8\uB4DC"),

          h2("5.1 \uB85C\uADF8\uC778 \uC5C6\uC774 \uCCB4\uD5D8\uD558\uAE30"),
          p("\uB370\uBAA8 \uBAA8\uB4DC\uB294 \uACC4\uC815 \uC5C6\uC774\uB3C4 \uCEE4\uB9AC\uD050\uB7FC \uC704\uBC84\uC758 \uD575\uC2EC \uAE30\uB2A5\uC744 \uCCB4\uD5D8\uD560 \uC218 \uC788\uB294 \uBAA8\uB4DC\uC785\uB2C8\uB2E4."),
          numberedItem('\uBA54\uC778 \uD398\uC774\uC9C0\uC5D0\uC11C "\uB370\uBAA8 \uCCB4\uD5D8\uD558\uAE30" \uBC84\uD2BC\uC744 \uD074\uB9AD\uD569\uB2C8\uB2E4.', "numbers5"),
          numberedItem("\uAE30\uCD08 \uC815\uBCF4\uB97C \uC785\uB825\uD569\uB2C8\uB2E4:", "numbers5"),
          bullet("\uB300\uC0C1 \uD559\uB144 \uC120\uD0DD (\uCD08\uB4F1 5-6\uD559\uB144 / \uC911\uD559\uAD50 / \uACE0\uB4F1\uD559\uAD50 1-2\uD559\uB144)", "bullets", 1),
          bullet("\uCC38\uC5EC \uAD50\uACFC \uC120\uD0DD (2\uAC1C \uC774\uC0C1)", "bullets", 1),
          bullet("\uC735\uD569 \uC8FC\uC81C \uC785\uB825", "bullets", 1),
          bullet("\uCD94\uAC00 \uC124\uBA85 (\uC120\uD0DD)", "bullets", 1),
          numberedItem('"AI \uC2DC\uBBAC\uB808\uC774\uC158 \uC2DC\uC791" \uBC84\uD2BC\uC744 \uD074\uB9AD\uD569\uB2C8\uB2E4.', "numbers5"),
          spacer(100),

          h2("5.2 \uC2DC\uBBAC\uB808\uC774\uC158 \uACB0\uACFC \uD655\uC778"),
          bullet("AI\uAC00 \uC785\uB825\uB41C \uC815\uBCF4\uB97C \uBC14\uD0D5\uC73C\uB85C 19\uAC1C \uC808\uCC28\uC758 \uBCF4\uB4DC\uB97C \uC790\uB3D9 \uC0DD\uC131\uD569\uB2C8\uB2E4."),
          bullet("\uC0DD\uC131 \uACFC\uC815\uC5D0\uC11C \uC9C4\uD589 \uC0C1\uD669\uC774 \uC2E4\uC2DC\uAC04\uC73C\uB85C \uD45C\uC2DC\uB429\uB2C8\uB2E4."),
          bullet("\uC644\uB8CC \uD6C4 \uAC01 \uC808\uCC28\uBCC4 \uBCF4\uB4DC \uACB0\uACFC\uB97C \uC5F4\uB78C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."),
          bullet("\uC2DC\uBBAC\uB808\uC774\uC158 \uACB0\uACFC\uB97C \uCC38\uACE0\uD558\uC5EC \uC2E4\uC81C \uC218\uC5C5\uC124\uACC4\uC758 \uCC38\uACE0\uC790\uB8CC\uB85C \uD65C\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."),

          // ── 6. FAQ ──
          new Paragraph({ children: [new PageBreak()] }),
          h1("6. FAQ / \uBB38\uC81C \uD574\uACB0"),
          spacer(100),

          pBold("Q: \uC5B4\uB5A4 \uBE0C\uB77C\uC6B0\uC800\uB97C \uC0AC\uC6A9\uD574\uC57C \uD558\uB098\uC694?"),
          p("A: Chrome, Safari, Edge \uB4F1 \uCD5C\uC2E0 \uBE0C\uB77C\uC6B0\uC800\uB97C \uAD8C\uC7A5\uD569\uB2C8\uB2E4. \uBAA8\uBC14\uC77C\uC5D0\uC11C\uB3C4 \uC811\uC18D \uAC00\uB2A5\uD558\uB098, PC \uD658\uACBD\uC744 \uAD8C\uC7A5\uD569\uB2C8\uB2E4."),
          spacer(80),
          pBold("Q: \uD300\uC6D0\uC740 \uCD5C\uC18C \uBA87 \uBA85\uC774 \uD544\uC694\uD55C\uAC00\uC694?"),
          p("A: 2\uBA85 \uC774\uC0C1\uC758 \uAD50\uC0AC\uAC00 \uCC38\uC5EC\uD558\uB294 \uAC83\uC744 \uAD8C\uC7A5\uD569\uB2C8\uB2E4. \uC11C\uB85C \uB2E4\uB978 \uAD50\uACFC \uC804\uBB38\uC131\uC744 \uAC00\uC9C4 \uAD50\uC0AC\uB4E4\uC774 \uD568\uAED8\uD560 \uB54C \uC735\uD569 \uC218\uC5C5 \uC124\uACC4\uC758 \uD6A8\uACFC\uAC00 \uADF9\uB300\uD654\uB429\uB2C8\uB2E4."),
          spacer(80),
          pBold("Q: AI\uAC00 \uC0DD\uC131\uD55C \uB0B4\uC6A9\uC744 \uAF2D \uC0AC\uC6A9\uD574\uC57C \uD558\uB098\uC694?"),
          p("A: \uC544\uB2D9\uB2C8\uB2E4. AI\uC758 \uC81C\uC548\uC740 \uCC38\uACE0\uC6A9\uC774\uBA70, \uD300\uC6D0\uB4E4\uC774 \uC790\uC720\uB86D\uAC8C \uC218\uC815, \uAC70\uBD80\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. AI\uB294 \uBCF4\uC870 \uC5ED\uD560\uC774\uBA70, \uCD5C\uC885 \uC758\uC0AC\uACB0\uC815\uC740 \uD56D\uC0C1 \uAD50\uC0AC \uD300\uC774 \uD569\uB2C8\uB2E4."),
          spacer(80),
          pBold("Q: \uB370\uC774\uD130\uB294 \uC5B4\uB514\uC5D0 \uC800\uC7A5\uB418\uB098\uC694?"),
          p("A: \uBAA8\uB4E0 \uB370\uC774\uD130\uB294 Supabase \uD074\uB77C\uC6B0\uB4DC \uC11C\uBC84\uC5D0 \uC548\uC804\uD558\uAC8C \uC800\uC7A5\uB429\uB2C8\uB2E4. \uD504\uB85C\uC81D\uD2B8\uBCC4\uB85C \uB3C5\uB9BD\uC801\uC73C\uB85C \uAD00\uB9AC\uB418\uBA70, \uD300 \uBA64\uBC84\uB9CC \uC811\uADFC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."),
          spacer(80),
          pBold("Q: \uC911\uAC04\uC5D0 \uC800\uC7A5\uD558\uACE0 \uB098\uC911\uC5D0 \uC774\uC5B4\uC11C \uD560 \uC218 \uC788\uB098\uC694?"),
          p("A: \uB124, \uAC01 \uC808\uCC28\uC758 \uBCF4\uB4DC\uB294 \uC790\uB3D9\uC73C\uB85C \uC800\uC7A5\uB429\uB2C8\uB2E4. \uC5B8\uC81C\uB4E0 \uB85C\uADF8\uC778\uD558\uC5EC \uC774\uC804 \uC9C4\uD589 \uC0C1\uD669\uC5D0\uC11C \uC774\uC5B4\uAC08 \uC218 \uC788\uC2B5\uB2C8\uB2E4."),
          spacer(80),
          pBold("Q: \uC778\uD130\uB137 \uC5F0\uACB0\uC774 \uB04A\uAE30\uBA74 \uC5B4\uB5BB\uAC8C \uB418\uB098\uC694?"),
          p("A: AI \uCC44\uD305\uACFC \uC2E4\uC2DC\uAC04 \uD611\uC5C5\uC5D0\uB294 \uC778\uD130\uB137 \uC5F0\uACB0\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uC5F0\uACB0\uC774 \uBCF5\uAD6C\uB418\uBA74 \uC790\uB3D9\uC73C\uB85C \uB3D9\uAE30\uD654\uB429\uB2C8\uB2E4."),
          spacer(80),
          pBold("Q: \uC9C0\uC6D0 \uAD50\uACFC\uB294 \uC5B4\uB5A4 \uAC83\uC774 \uC788\uB098\uC694?"),
          p("A: \uAD6D\uC5B4, \uC218\uD559, \uC0AC\uD68C, \uACFC\uD559, \uC601\uC5B4, \uB3C4\uB355, \uC815\uBCF4, \uC74C\uC545, \uBBF8\uC220, \uCCB4\uC721, \uAE30\uC220\uAC00\uC815, \uD55C\uBB38 \uB4F1 2022 \uAC1C\uC815 \uAD50\uC721\uACFC\uC815\uC758 \uC8FC\uC694 \uAD50\uACFC\uB97C \uC9C0\uC6D0\uD569\uB2C8\uB2E4."),
          spacer(80),
          pBold("Q: \uC131\uCDE8\uAE30\uC900 \uB370\uC774\uD130\uB294 \uCD5C\uC2E0\uC778\uAC00\uC694?"),
          p("A: 2022 \uAC1C\uC815 \uAD50\uC721\uACFC\uC815 \uAE30\uBC18 \uC131\uCDE8\uAE30\uC900 \uB370\uC774\uD130\uB97C \uB0B4\uC7A5\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4."),

          spacer(400),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: ACCENT, space: 8 } },
            spacing: { before: 200 },
            children: [new TextRun({ text: "\uBB38\uC758: \uCEE4\uB9AC\uD050\uB7FC \uC704\uBC84 \uC9C0\uC6D0\uD300", size: 20, color: GRAY, font: "Arial" })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new ExternalHyperlink({
              children: [new TextRun({ text: "https://curriculum-weaver.vercel.app", size: 20, style: "Hyperlink", font: "Arial" })],
              link: "https://curriculum-weaver.vercel.app",
            })],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const outPath = "/Users/greatsong/greatsong-project/curriculum-weaver/docs/\uCEE4\uB9AC\uD050\uB7FC\uC704\uBC84_\uC81C\uD488\uAC00\uC774\uB4DC\uBD81.docx";
  fs.writeFileSync(outPath, buffer);
  console.log("DOCX created:", outPath);
}

build().catch(console.error);
