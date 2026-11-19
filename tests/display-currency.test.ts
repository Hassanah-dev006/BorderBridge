import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedCurrencies,
  convertTable,
  currencyHref,
  rateFor,
  resolveDisplayCurrency,
} from '../src/lib/display-currency';

const RATES = { USD: 1, RWF: 1310, UGX: 3720, KES: 129 };

describe('which currencies a corridor offers', () => {
  test('USD, then origin, then destination', () => {
    // Order matters: it is the order of the buttons, and the second entry is the
    // default, which is the trader's own money.
    assert.deepEqual(allowedCurrencies('RWF', 'UGX'), ['USD', 'RWF', 'UGX']);
  });

  test('a corridor that trades in USD at one end does not list it twice', () => {
    assert.deepEqual(allowedCurrencies('USD', 'UGX'), ['USD', 'UGX']);
  });

  test('an unknown corridor still offers USD rather than nothing', () => {
    assert.deepEqual(allowedCurrencies(undefined, undefined), ['USD']);
  });
});

describe('choosing the currency to display', () => {
  const allowed = ['USD', 'RWF', 'UGX'];

  test('a valid request is honoured', () => {
    assert.equal(resolveDisplayCurrency('UGX', allowed), 'UGX');
  });

  test('case does not matter, because a URL gets typed by hand', () => {
    assert.equal(resolveDisplayCurrency('rwf', allowed), 'RWF');
  });

  test('the default is the origin currency, not USD', () => {
    // The whole reason this module exists: a Rwandan trader needs to know whether she
    // is looking at 1.8 million francs, not 1,385 dollars.
    assert.equal(resolveDisplayCurrency(undefined, allowed), 'RWF');
  });

  test('a currency this corridor does not use falls back rather than failing', () => {
    // A mistyped URL should show a trade plan in the wrong currency, not an error
    // page instead of a trade plan.
    assert.equal(resolveDisplayCurrency('KES', allowed), 'RWF');
    assert.equal(resolveDisplayCurrency('<script>', allowed), 'RWF');
  });

  test('USD is used when the corridor offers nothing else', () => {
    assert.equal(resolveDisplayCurrency(undefined, ['USD']), 'USD');
  });
});

describe('converting the table', () => {
  const lines = [1200, 180, 0, 5];
  const total = 1385;

  test('each line is converted and rounded to whole units', () => {
    const out = convertTable(lines, total, 1310, 'RWF');
    assert.deepEqual(out.lines, [1_572_000, 235_800, 0, 6_550]);
  });

  test('the column adds up to the total shown', () => {
    // A trader who adds the column and gets a different number from the one in bold
    // has been handed a reason to distrust the whole estimate. Arithmetic that does
    // not add up reads as a mistake even when it is only rounding.
    const out = convertTable(lines, total, 1310, 'RWF');
    assert.equal(out.lines.reduce((a, b) => a + b, 0), out.total);
  });

  test('it still adds up when every line has to be rounded', () => {
    const awkward = [10.37, 4.11, 0.55];
    const out = convertTable(awkward, 15.03, 1310, 'RWF');
    assert.equal(out.lines.reduce((a, b) => a + b, 0), out.total);
  });

  test('the rounding difference against a direct conversion is reported, not hidden', () => {
    const awkward = [10.37, 4.11, 0.55];
    const out = convertTable(awkward, 15.03, 1310, 'RWF');
    assert.equal(typeof out.rounding, 'number');
    assert.ok(Math.abs(out.rounding) <= awkward.length, 'rounding drifted further than one unit per line');
  });

  test('converting to USD at a rate of one changes nothing', () => {
    const out = convertTable(lines, total, 1, 'USD');
    assert.deepEqual(out.lines, [1200, 180, 0, 5]);
    assert.equal(out.total, 1385);
  });

  test('a zero line stays zero rather than becoming a rounding artefact', () => {
    // Import duty under the simplified regime is legitimately zero, and a trader
    // seeing "RWF 1" against it would reasonably ask what the franc was for.
    assert.equal(convertTable([0], 0, 3720, 'UGX').lines[0], 0);
  });

  test('an empty table does not produce NaN', () => {
    const out = convertTable([], 0, 1310, 'RWF');
    assert.equal(out.total, 0);
  });

  test('an unusable rate is refused rather than producing a confident wrong number', () => {
    assert.throws(() => convertTable(lines, total, 0, 'RWF'));
    assert.throws(() => convertTable(lines, total, -1310, 'RWF'));
    assert.throws(() => convertTable(lines, total, Number.NaN, 'RWF'));
  });
});

describe('reading the rate', () => {
  test('from the table the estimate already used', () => {
    assert.equal(rateFor(RATES, 'RWF'), 1310);
  });

  test('a missing rate is an error, not a silent 1:1', () => {
    // Defaulting to 1 would print Rwandan francs at dollar values — a wrong number
    // that looks entirely plausible.
    assert.throws(() => rateFor(RATES, 'TZS'));
  });
});

describe('the link to the same plan in another currency', () => {
  const params = {
    corridor: 'RW-UG',
    product: 'coffee-green',
    quantity: '200',
    currency: 'USD',
    value: '1200',
  };

  test('every parameter of the consignment survives the switch', () => {
    const href = currencyHref(params, 'UGX');
    for (const [key, value] of Object.entries(params)) {
      assert.match(href, new RegExp(`${key}=${value}`), `${key} was dropped`);
    }
  });

  test('the new currency is set', () => {
    assert.match(currencyHref(params, 'UGX'), /show=UGX/);
  });

  test('switching twice does not accumulate the parameter', () => {
    const once = currencyHref(params, 'RWF');
    const twice = currencyHref({ ...params, show: 'RWF' }, 'UGX');
    assert.equal((once.match(/show=/g) ?? []).length, 1);
    assert.equal((twice.match(/show=/g) ?? []).length, 1);
    assert.match(twice, /show=UGX/);
  });

  test('a repeated parameter takes its first value rather than becoming a list', () => {
    assert.match(currencyHref({ ...params, quantity: ['200', '400'] }, 'RWF'), /quantity=200/);
  });

  test('an empty parameter is left out rather than sent as blank', () => {
    assert.ok(!currencyHref({ ...params, note: '' }, 'RWF').includes('note='));
  });

  test('a value needing encoding is encoded', () => {
    const href = currencyHref({ product: 'dried beans & peas' }, 'RWF');
    assert.ok(!href.includes(' '), 'an unencoded space would truncate the parameter');
    assert.match(href, /dried\+beans|dried%20beans/);
  });
});
