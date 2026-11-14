/**
 * Unit tests for the checklist export (FR-REQ-05).
 *
 * The export is the artefact most likely to be forwarded to someone who never saw
 * the application — so the things that must travel with it are what these tests
 * guard: the citations, the verification dates, and the statement that this is not
 * a binding determination.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { plainTextChecklist, plainTextDocumentsOnly, exportFilename } from '../src/lib/export';
import type { TradePlan } from '../src/lib/types';

const NOW = new Date('2026-11-15T10:00:00Z');

const plan = (over: Partial<TradePlan> = {}): TradePlan =>
  ({
    corridor: {
      id: 'RW-UG', originCountry: 'RW', originName: 'Rwanda',
      destinationCountry: 'UG', destinationName: 'Uganda',
      originCurrency: 'RWF', destinationCurrency: 'UGX', isSupported: true, crossings: [],
    },
    product: {
      id: 'coffee-green', name: 'Coffee, green (unroasted)', hsCode: '0901.11',
      category: 'Agricultural', unit: 'kg', strListed: true, eacOrigin: true,
    },
    intention: { corridorId: 'RW-UG', productId: 'coffee-green', quantity: 200, declaredValue: 1400, currency: 'USD' },
    eligibility: {
      eligible: true, thresholdValue: 2000, thresholdCurrency: 'USD', declaredValueUsd: 1400,
      reasons: ['Declared value is below the threshold.', 'Coffee appears on the common list.'],
      sourceCitation: 'EAC Simplified Trade Regime', lastVerifiedDate: '2026-08-14',
    },
    checklist: [
      {
        ruleId: 'DOC-1', name: 'National identity card', issuingAuthority: 'Immigration',
        mandatory: true, reason: 'Proof of identity.', estimatedProcessingTime: 'Already held',
        sourceCitation: 'EAC Common Market Protocol, Article 7',
        lastVerifiedDate: '2026-08-14', verificationStatus: 'verified',
      },
      {
        ruleId: 'DOC-2', name: 'Coffee export licence', issuingAuthority: 'NAEB',
        mandatory: true, reason: 'Coffee is a controlled export.', estimatedProcessingTime: '3–7 working days',
        sourceCitation: 'NAEB export procedures',
        lastVerifiedDate: '2026-05-02', verificationStatus: 'needs-verification',
      },
    ],
    cost: {
      lines: [
        { ruleId: null, description: 'Product value', detail: '200 kg as declared', amountUsd: 1400, sourceCitation: 'Trader-declared', lastVerifiedDate: '—', verificationStatus: 'verified' },
        { ruleId: 'RATE-5', description: 'Transport', detail: '200 kg at USD 0.90/kg', amountUsd: 180, sourceCitation: 'Indicative market rate', lastVerifiedDate: '2026-05-02', verificationStatus: 'needs-verification' },
      ],
      totalUsd: 1580, confidencePercent: 20,
      conversions: [{ currency: 'RWF', amount: 2069800 }, { currency: 'UGX', amount: 5877600 }],
      exchangeRateRetrievedAt: '2026-10-05T06:00:00Z', exchangeRateAgeHours: 12,
    },
    crossingRanking: { ranked: [], recommended: null, decidedBy: '', excluded: [], windowHours: 6 },
    recommendedCrossing: 'Gatuna / Katuna',
    hasUnverifiedContent: true,
    generatedAt: '2026-11-15T10:00:00Z',
    ...over,
  }) as TradePlan;

describe('what must travel with the export', () => {
  const text = plainTextChecklist(plan(), 'en', NOW);

  test('every document carries its issuing authority', () => {
    assert.match(text, /Immigration/);
    assert.match(text, /NAEB/);
  });

  test('every document carries its legal instrument', () => {
    assert.match(text, /EAC Common Market Protocol, Article 7/);
    assert.match(text, /NAEB export procedures/);
  });

  test('every document carries its verification date', () => {
    assert.match(text, /2026-08-14/);
    assert.match(text, /2026-05-02/);
  });

  test('an unverified item is marked, not quietly included', () => {
    assert.match(text, /pending re-verification/i);
  });

  test('the limitation statement travels with the numbers (FR-CST-04)', () => {
    assert.match(text, /not a binding determination/i);
  });

  test('the confidence range is stated, not just the total', () => {
    assert.match(text, /1,580\.00/);
    assert.match(text, /\+\/- 20%/);
  });

  test('local currency conversions are included', () => {
    assert.match(text, /RWF/);
    assert.match(text, /UGX/);
  });

  test('the recommended crossing is named', () => {
    assert.match(text, /Gatuna \/ Katuna/);
  });

  test('the date it was prepared is on it', () => {
    assert.match(text, /2026-11-15/);
  });
});

describe('fit for a message', () => {
  const text = plainTextChecklist(plan(), 'en', NOW);

  test('no markdown, tables or box-drawing a basic phone would mangle', () => {
    assert.ok(!text.includes('|'), 'a pipe table would wrap badly');
    assert.ok(!text.includes('**'), 'markdown bold shows as asterisks in a message');
    assert.ok(!/[─│┌┐└┘├┤]/.test(text), 'box-drawing characters do not survive every keyboard');
  });

  test('an arrow is written in ASCII, not a glyph', () => {
    assert.match(text, /Rwanda -> Uganda/);
  });

  test('lines stay short enough for a phone screen', () => {
    const tooLong = text.split('\n').filter((l) => l.length > 78);
    // Only the limitation statement and the fallback note are allowed to run long;
    // they are prose, not a list a trader scans.
    assert.ok(tooLong.length <= 2, `${tooLong.length} lines over 78 characters`);
  });

  test('items are numbered so they can be referred to in a reply', () => {
    assert.match(text, /^1\. National identity card/m);
    assert.match(text, /^2\. Coffee export licence/m);
  });
});

describe('translation of the export (FR-REQ-05 in the selected language)', () => {
  test('the French export uses French headings', () => {
    const fr = plainTextChecklist(plan(), 'fr', NOW);
    assert.match(fr, /DOCUMENTS NÉCESSAIRES/i);
    assert.match(fr, /Coût attendu/i);
  });

  test('the French export keeps the French limitation statement', () => {
    assert.match(plainTextChecklist(plan(), 'fr', NOW), /décision contraignante/i);
  });

  test('a language without the regulatory wording still produces a usable document', () => {
    const rw = plainTextChecklist(plan(), 'rw', NOW);
    assert.match(rw, /National identity card/, 'the document names are still there');
    assert.match(rw, /not a binding determination/i, 'falling back to English, never omitted');
  });
});

describe('the short version', () => {
  test('lists the documents and who issues them, and nothing else', () => {
    const short = plainTextDocumentsOnly(plan(), 'en');
    assert.match(short, /National identity card/);
    assert.match(short, /Immigration/);
    assert.ok(!short.includes('1,580'), 'the short version is for documents, not cost');
  });
});

describe('the filename', () => {
  test('names the product and the date, so it is findable later', () => {
    assert.equal(exportFilename(plan(), NOW), 'borderbridge-coffee-green-unroasted-2026-11-15.pdf');
  });

  test('contains nothing a filesystem would refuse', () => {
    assert.match(exportFilename(plan(), NOW), /^[a-z0-9.-]+$/);
  });
});
