// Shared docx helpers for the BorderBridge deliverable.
const fs = require('fs');
const d = require('docx');
const {
  Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, convertInchesToTwip, Footer, PageNumber, ImageRun
} = d;

const ACCENT = '1F4E79';
const W = convertInchesToTwip;

const P = (text, o = {}) => new Paragraph({
  spacing: { after: o.after ?? 120, line: 276 }, alignment: o.align, indent: o.indent,
  children: [new TextRun({ text, size: o.size ?? 22, bold: o.bold, italics: o.italics, color: o.color, font: 'Calibri' })]
});

const PR = (runs, o = {}) => new Paragraph({
  spacing: { after: o.after ?? 120, line: 276 }, alignment: o.align,
  children: runs.map(r => new TextRun({ text: r[0], size: o.size ?? 22, bold: r[1] && r[1].b, italics: r[1] && r[1].i, font: 'Calibri' }))
});

const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 160 }, keepNext: true,
  children: [new TextRun({ text: t, size: 30, bold: true, color: ACCENT, font: 'Calibri' })] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 260, after: 120 }, keepNext: true,
  children: [new TextRun({ text: t, size: 25, bold: true, color: ACCENT, font: 'Calibri' })] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 }, keepNext: true,
  children: [new TextRun({ text: t, size: 23, bold: true, color: '2E74B5', font: 'Calibri' })] });
const H4 = (t) => new Paragraph({ spacing: { before: 180, after: 90 }, keepNext: true,
  children: [new TextRun({ text: t, size: 22, bold: true, color: '404040', font: 'Calibri' })] });

const BULLET = (t, lvl = 0) => new Paragraph({ numbering: { reference: 'bl', level: lvl }, spacing: { after: 60, line: 276 },
  children: [new TextRun({ text: t, size: 22, font: 'Calibri' })] });
const NUM = (t, lvl = 0) => new Paragraph({ numbering: { reference: 'nl', level: lvl }, spacing: { after: 60, line: 276 },
  children: [new TextRun({ text: t, size: 22, font: 'Calibri' })] });
// APA reference with a hanging indent. Any trailing URL becomes a clickable hyperlink.
const REF = (t) => {
  const m = t.match(/^(.*?)(https?:\/\/\S+)\s*$/);
  const kids = m
    ? [new TextRun({ text: m[1], size: 22, font: 'Calibri' }),
       new d.ExternalHyperlink({
         link: m[2],
         children: [new TextRun({ text: m[2], size: 22, font: 'Calibri', style: 'Hyperlink' })]
       })]
    : [new TextRun({ text: t, size: 22, font: 'Calibri' })];
  return new Paragraph({ spacing: { after: 140, line: 276 },
    indent: { left: W(0.5), hanging: W(0.5) }, children: kids });
};

function mkTable(cols, rows, o = {}) {
  const total = cols.reduce((a, b) => a + b, 0);
  return new Table({
    columnWidths: cols, width: { size: total, type: WidthType.DXA },
    rows: rows.map((cells, ri) => new TableRow({
      tableHeader: ri === 0, cantSplit: true,
      children: cells.map((c, ci) => new TableCell({
        width: { size: cols[ci], type: WidthType.DXA },
        shading: ri === 0 ? { type: ShadingType.CLEAR, fill: ACCENT }
                          : (ri % 2 === 0 ? { type: ShadingType.CLEAR, fill: 'F2F6FA' } : undefined),
        margins: { top: 80, bottom: 80, left: 110, right: 110 },
        children: String(c).split('\n').map(line => new Paragraph({
          spacing: { after: 40, line: 250 },
          children: [new TextRun({ text: line, size: o.size ?? 19, bold: ri === 0,
            color: ri === 0 ? 'FFFFFF' : undefined, font: 'Calibri' })]
        }))
      }))
    }))
  });
}

const CAP = (t) => new Paragraph({ spacing: { before: 80, after: 200 },
  children: [new TextRun({ text: t, size: 19, italics: true, color: '595959', font: 'Calibri' })] });

const RULE = () => new Paragraph({ spacing: { after: 160 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 4 } },
  children: [new TextRun({ text: '', size: 2 })] });

const NOTE = (t) => new Paragraph({
  spacing: { before: 140, after: 200, line: 290 }, indent: { left: W(0.3), right: W(0.3) },
  border: { left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT, space: 10 } },
  shading: { type: ShadingType.CLEAR, fill: 'F2F6FA' },
  children: [new TextRun({ text: t, size: 21, italics: true, font: 'Calibri' })] });

const QUOTE = (t) => new Paragraph({
  spacing: { before: 160, after: 200, line: 300 }, indent: { left: W(0.35), right: W(0.35) },
  border: { left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT, space: 10 } },
  shading: { type: ShadingType.CLEAR, fill: 'F2F6FA' },
  children: [new TextRun({ text: t, size: 22, italics: true, font: 'Calibri' })] });

// Requirement block (functional)
function FR(id, name, priority, actor, desc, inputs, processing, outputs, pre) {
  return [
    new Paragraph({ spacing: { before: 200, after: 60 }, keepNext: true, keepLines: true,
      children: [new TextRun({ text: `${id} — ${name}`, size: 22, bold: true, color: '2E74B5', font: 'Calibri' })] }),
    mkTable([1500, 7860], [
      ['Attribute', 'Specification'],
      ['Priority', priority], ['Primary actor', actor], ['Description', desc],
      ['Inputs', inputs], ['Processing', processing], ['Outputs', outputs], ['Pre-conditions', pre],
    ], { size: 19 }),
    new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: '', size: 10 })] })
  ];
}

const NFRTable = (rows) => mkTable([1560, 4400, 3400],
  [['ID', 'Requirement', 'Verification method'], ...rows], { size: 19 });

// Figure: fit a PNG into the printable area, preserving aspect ratio (px @96dpi)
function makeFig(diagDir) {
  return function fig(file, maxW = 624, maxH = 780, alt) {
    const buf = fs.readFileSync(`${diagDir}/${file}`);
    const w0 = buf.readUInt32BE(16), h0 = buf.readUInt32BE(20);
    let w = maxW, h = Math.round(maxW * h0 / w0);
    if (h > maxH) { h = maxH; w = Math.round(maxH * w0 / h0); }
    const opts = { type: 'png', data: buf, transformation: { width: w, height: h } };
    if (alt) opts.altText = { title: alt, description: alt, name: alt };
    return new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 160, after: 80 },
      children: [new ImageRun(opts)]
    });
  };
}

const FOOT = (label) => new Footer({ children: [new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: label + ' · Page ', size: 18, color: '808080', font: 'Calibri' }),
             new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '808080', font: 'Calibri' })]
})] });

const NUMBERING = {
  config: [
    { reference: 'bl', levels: [
      { level: 0, format: d.LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: W(0.35), hanging: W(0.22) } } } },
      { level: 1, format: d.LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: W(0.7), hanging: W(0.22) } } } },
    ]},
    { reference: 'nl', levels: [
      { level: 0, format: d.LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: W(0.4), hanging: W(0.25) } } } },
    ]},
  ]
};

module.exports = { d, P, PR, H1, H2, H3, H4, BULLET, NUM, REF, mkTable, CAP, RULE, NOTE, QUOTE,
                   FR, NFRTable, makeFig, FOOT, NUMBERING, ACCENT, W };
