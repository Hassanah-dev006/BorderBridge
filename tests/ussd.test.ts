import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SMS_PART,
  USSD_LIMIT,
  fit,
  gsmLength,
  parts,
  render,
  serialise,
  stateFrom,
  summarise,
  toGsm,
  type Choice,
} from '../src/lib/ussd';

const corridors: Choice[] = [
  { id: 'rw-ug', label: 'Rwanda to Uganda' },
  { id: 'ug-rw', label: 'Uganda to Rwanda' },
];
const products: Choice[] = [
  { id: 'maize', label: 'Maize' },
  { id: 'beans', label: 'Dried beans' },
  { id: 'milk', label: 'Milk' },
];
const menu = { corridors, products };

describe('what a feature phone can actually display', () => {
  test('plain Latin text passes through unchanged', () => {
    // Kinyarwanda and Kiswahili are written in plain Latin letters, so neither pays
    // the UCS-2 penalty.
    const out = toGsm('Ikinyarwanda na Kiswahili');
    assert.equal(out.text, 'Ikinyarwanda na Kiswahili');
    assert.equal(out.lossy, false);
  });

  test('French accents outside the alphabet are transliterated, not dropped', () => {
    // Keeping them would force the message into UCS-2, halving a 160-character SMS to
    // 70 and costing the trader more per message. Lowercase ç is not in the alphabet;
    // è is, so "frontière" is left alone and only "Français" changes.
    assert.equal(toGsm('Français frontière').text, 'Francais frontière');
    assert.equal(toGsm('reçu contrôle').text, 'recu controle');
  });

  test('characters in the alphabet are kept as they are', () => {
    // à, é, ì, ò, ù and Ç are in GSM 03.38 basic. Transliterating them would be
    // damage for no benefit, and would make the French read worse than it needs to.
    assert.equal(toGsm('déjà Ça').text, 'déjà Ça');
  });

  test('a character with no mapping becomes a question mark rather than vanishing', () => {
    // A missing letter changes a word silently; a '?' shows the trader something was
    // lost.
    const out = toGsm('maize 🌽');
    assert.match(out.text, /\?/);
    assert.equal(out.lossy, true);
  });

  test('extended characters cost two septets', () => {
    assert.equal(gsmLength('abc'), 3);
    assert.equal(gsmLength('a{b'), 4);
  });

  test('smart punctuation is normalised', () => {
    assert.equal(toGsm('don’t — wait…').text, "don't - wait...");
  });
});

describe('truncation says that it truncated', () => {
  test('text within the limit is untouched', () => {
    assert.equal(fit('short', 100), 'short');
  });

  test('longer text is cut with a marker, not silently', () => {
    // The network truncates silently, usually mid-word. §3.4 requires a clear
    // continuation indicator instead.
    const out = fit('a'.repeat(100), 40);
    assert.ok(gsmLength(out) <= 40);
    assert.match(out, /\.\.\.$/);
  });

  test('the cut falls on a word boundary when one is near', () => {
    const original = 'the quick brown fox jumps over the lazy dog again and again';
    const out = fit(original, 30);
    const kept = out.replace(/\.\.\.$/, '');
    // Every retained word must be a whole word from the original, which is what
    // "boundary" has to mean: ending in "jum" would pass a naive regex.
    assert.ok(original.startsWith(kept), 'the kept text is not a prefix of the original');
    assert.ok(
      original[kept.length] === ' ' || kept.length === original.length,
      `cut mid-word: "${kept}"`,
    );
  });
});

describe('the session is derived, never stored (§3.4)', () => {
  test('an empty history is the first screen', () => {
    assert.equal(stateFrom({ text: '', ...menu }).step, 'language');
  });

  test('each choice advances exactly one step', () => {
    assert.equal(stateFrom({ text: '1', ...menu }).step, 'direction');
    assert.equal(stateFrom({ text: '1*1', ...menu }).step, 'product');
    assert.equal(stateFrom({ text: '1*1*2', ...menu }).step, 'value');
    assert.equal(stateFrom({ text: '1*1*2*1500', ...menu }).step, 'result');
  });

  test('the same history always gives the same state', () => {
    // This is the property that lets the channel keep no session: a restart, a second
    // aggregator or a load-balanced callback all reconstruct the same thing.
    assert.deepEqual(
      stateFrom({ text: '2*1*1*800', ...menu }),
      stateFrom({ text: '2*1*1*800', ...menu }),
    );
  });

  test('the choices are carried through', () => {
    const state = stateFrom({ text: '3*2*2*1200', ...menu });
    assert.equal(state.language, 'sw');
    assert.equal(state.corridorId, 'ug-rw');
    assert.equal(state.productId, 'beans');
    assert.equal(state.declaredValue, 1200);
  });

  test('a choice outside the menu is refused rather than guessed', () => {
    assert.equal(stateFrom({ text: '9', ...menu }).step, 'error');
    assert.equal(stateFrom({ text: '1*7', ...menu }).step, 'error');
    assert.equal(stateFrom({ text: '1*1*99', ...menu }).step, 'error');
  });

  test('zero and negative indexes do not wrap round the list', () => {
    assert.equal(stateFrom({ text: '0', ...menu }).step, 'error');
    assert.equal(stateFrom({ text: '-1', ...menu }).step, 'error');
  });

  test('a non-numeric choice is refused', () => {
    assert.equal(stateFrom({ text: 'abc', ...menu }).step, 'error');
  });

  test('separators a trader keys into a value are tolerated', () => {
    // A numeric keypad invites '1,500' and '1 500'.
    assert.equal(stateFrom({ text: '1*1*1*1,500', ...menu }).declaredValue, 1500);
  });

  test('a value of zero or a non-number is refused with a usable message', () => {
    const zero = stateFrom({ text: '1*1*1*0', ...menu });
    assert.equal(zero.step, 'error');
    assert.match(zero.error!, /digits only/);
    assert.equal(stateFrom({ text: '1*1*1*lots', ...menu }).step, 'error');
  });

  test('empty segments from a double separator do not shift the steps', () => {
    assert.deepEqual(parts('1**2'), ['1', '2']);
  });
});

describe('every response fits the network limit', () => {
  const steps = ['', '1', '1*1', '1*1*2'];

  for (const text of steps) {
    test(`the screen after "${text || '(dial)'}" fits in ${USSD_LIMIT} septets`, () => {
      // Longer and the network truncates it mid-word, silently, which is the failure
      // this whole module is shaped around.
      const state = stateFrom({ text, ...menu });
      const wire = serialise(render(state, menu));
      assert.ok(gsmLength(wire) <= USSD_LIMIT, `${gsmLength(wire)} septets: ${wire}`);
    });
  }

  test('a long result is cut to fit rather than lost', () => {
    const state = stateFrom({ text: '1*1*1*900', ...menu });
    const wire = serialise(render(state, { ...menu, result: 'x '.repeat(300) }));
    assert.ok(gsmLength(wire) <= USSD_LIMIT);
  });

  test('a menu longer than one page is capped, not paged', () => {
    // A trader on a twenty-second step timeout should not be paging a menu.
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, label: `Product ${i}` }));
    const wire = serialise(render(stateFrom({ text: '1*1', ...menu }), { corridors, products: many }));
    assert.ok(gsmLength(wire) <= USSD_LIMIT);
  });
});

describe('the protocol the aggregator expects', () => {
  test('a screen that needs an answer keeps the session open', () => {
    assert.match(serialise(render(stateFrom({ text: '', ...menu }), menu)), /^CON /);
  });

  test('the answer closes it', () => {
    // END, not CON: leaving it open keeps a trader paying airtime to read a result.
    const state = stateFrom({ text: '1*1*1*900', ...menu });
    assert.match(serialise(render(state, { ...menu, result: '2 documents needed.' })), /^END /);
  });

  test('an error closes it with something a person can act on', () => {
    assert.match(serialise(render(stateFrom({ text: '9', ...menu }), menu)), /^END .*number from the list/);
  });
});

describe('what survives the compression', () => {
  const text = summarise({
    documents: 3,
    firstDocument: 'Certificate of Origin',
    simplified: true,
    totalUsd: 412.4,
    crossing: 'Gatuna',
  });

  test('the limitation statement is never the thing that gets cut (FR-CST-04)', () => {
    assert.match(text, /not a customs decision/i);
  });

  test('the count, the first document and the total are all there', () => {
    assert.match(text, /3 documents needed/);
    assert.match(text, /Certificate of Origin/);
    assert.match(text, /USD 412/);
  });

  test('the simplified-regime answer is stated either way (FR-REQ-03)', () => {
    assert.match(text, /Simplified regime applies/);
    assert.match(
      summarise({ documents: 7, simplified: false, totalUsd: 900 }),
      /Full customs process/,
    );
  });

  test('one document is not "1 documents"', () => {
    assert.match(summarise({ documents: 1, simplified: false, totalUsd: 10 }), /1 document needed/);
  });

  test('the whole summary fits a single SMS part', () => {
    // A second part doubles what the trader pays to receive it.
    assert.ok(gsmLength(text) <= SMS_PART, `${gsmLength(text)} septets`);
  });
});
