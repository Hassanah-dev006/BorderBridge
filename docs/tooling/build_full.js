// Assembles the complete BorderBridge deliverable in the ALU template structure.
const fs = require('fs');
const L = require('./lib_doc');
const { d, P, H1, mkTable, CAP, NOTE, makeFig, FOOT, NUMBERING, ACCENT, W } = L;
const { Document, Packer, Paragraph, TextRun, AlignmentType, PageBreak, TableOfContents, PageOrientation } = d;

const DIAG = process.env.DIAG_DIR || '/tmp/dg';
const fig = makeFig(DIAG);

const S1 = [];   // portrait: proposal, revision history, TOC, sections 1-4, Appendix A, B.0-B.2
const S2 = [];   // landscape: Appendix B.3
const S3 = [];   // portrait: Appendix B.4 onwards

// ---- Proposal ----
require('./part_proposal')(S1);

// ---- Revision history + TOC ----
S1.push(H1('Document Control'));
S1.push(mkTable([1400, 1800, 3560, 2600], [
  ['Version', 'Date', 'Description', 'Author'],
  ['0.1', '—', 'Initial outline derived from field research and the mission statement', '[Your Name]'],
  ['1.0', '—', 'Project proposal and first draft of the requirement specification completed for Assignment 1', '[Your Name]'],
  ['1.1', '—', 'Appendix B added for Assignment 2: four UML diagram types', '[Your Name]'],
  ['2.0', '[INSERT DATE]', 'Restructured to the ALU proposal and SRS template. Added a competitive gap analysis against existing solutions; re-framed the problem statement against WHO/WHAT/WHEN/WHERE/WHY/HOW; re-angled the development model section to relevance and process steps; added Section 2 (Overall Description), Section 3 (External Interface Requirements), Section 4.1 (Stakeholder Requirements Specification), Section 5 (Other Nonfunctional Requirements) under the template’s four headings, and Section 6 (Appendix)', '[Your Name]'],
], { size: 20 }));

S1.push(H1('Table of Contents'));
S1.push(new TableOfContents('Contents', { hyperlinks: true, headingStyleRange: '1-3' }));
S1.push(new Paragraph({ spacing: { before: 200 },
  children: [new TextRun({ text: 'To populate: open in Word or Google Docs, right-click the field and choose “Update field”.', size: 19, italics: true, color: '808080', font: 'Calibri' })] }));
S1.push(new Paragraph({ children: [new PageBreak()] }));

// ---- SRS ----
require('./part_srs13')(S1);
require('./part_srs4')(S1);
require('./part_srs5')(S1);

// ---- Appendices ----
require('./part_appendix')(S1, S2, S3, fig);

const LABEL = 'BorderBridge · Proposal & SRS v2.0';

const doc = new Document({
  creator: 'BorderBridge Project',
  title: 'BorderBridge — Project Proposal and Software Requirements Specification v2.0',
  description: 'ALU Software Engineering: proposal, SRS and UML models',
  numbering: NUMBERING,
  styles: {
    characterStyles: [{
      id: 'Hyperlink', name: 'Hyperlink', basedOn: 'DefaultParagraphFont',
      run: { color: '0563C1', underline: { type: d.UnderlineType.SINGLE } }
    }]
  },
  sections: [
    { properties: { page: { size: { width: 12240, height: 15840 },
                            margin: { top: W(1), bottom: W(1), left: W(1), right: W(1) } } },
      footers: { default: FOOT(LABEL) }, children: S1 },
    { properties: { page: { size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE },
                            margin: { top: W(0.75), bottom: W(0.75), left: W(0.75), right: W(0.75) } } },
      footers: { default: FOOT(LABEL) }, children: S2 },
    { properties: { page: { size: { width: 12240, height: 15840 },
                            margin: { top: W(1), bottom: W(1), left: W(1), right: W(1) } } },
      footers: { default: FOOT(LABEL) }, children: S3 },
  ]
});

Packer.toBuffer(doc).then(b => {
  fs.writeFileSync(process.argv[2], b);
  console.log('written', process.argv[2], b.length, 'bytes');
});
