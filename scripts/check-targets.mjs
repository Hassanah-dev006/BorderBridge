#!/usr/bin/env node
/**
 * NFR-CMP-01 — verify the built bundle against the floor in .browserslistrc.
 *
 *   npm run build && npm run verify:targets
 *
 * A browserslist file is a declaration of intent. This checks the artefact, because
 * the failure it guards against is specific and silent: Android 8 ships Chromium 61 as
 * its system WebView, which cannot parse optional chaining or nullish coalescing. A
 * bundle containing either does not degrade on the reference handset in Table 2.3 —
 * it throws on parse, and the trader sees a blank page.
 *
 * Deliberately a separate command rather than part of `npm run check`: it needs a
 * build, and a type-check that takes four minutes is a type-check nobody runs.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CHUNKS = '.next/static/chunks';

/**
 * Syntax Chromium 61 cannot parse.
 *
 * Matched on the minified output, so the patterns are written to tolerate single-letter
 * identifiers and no whitespace.
 */
const FORBIDDEN = [
  {
    name: 'optional chaining (?.)',
    // Preceded by an identifier, closing paren or bracket, and followed by something
    // that can be accessed — which excludes a bare `?.` inside a regular expression.
    pattern: /[\w$)\]]\?\.[\w$[(]/,
    supportedFrom: 'Chrome 80',
  },
  {
    name: 'nullish coalescing (??)',
    // `??=` is a different operator and is caught by its own rule below.
    pattern: /[\w$)\]]\s*\?\?[^?=]/,
    supportedFrom: 'Chrome 80',
  },
  {
    name: 'logical assignment (??= ||= &&=)',
    pattern: /[\w$)\]]\s*(?:\?\?|\|\||&&)=[^=]/,
    supportedFrom: 'Chrome 85',
  },
  {
    name: 'private class fields (#x)',
    // The prefix set is narrow on purpose. Allowing any non-word character matched
    // `color:#fff;` in an inlined stylesheet and reported a CSS colour as a syntax
    // error — a checker that cries wolf gets switched off, which costs more than the
    // check was worth. A private field only ever follows `{`, `;`, whitespace or a
    // dot, and a hex colour never follows any of those.
    pattern: /[{};\s.]#[a-zA-Z_$][\w$]*\s*[=;(]/,
    supportedFrom: 'Chrome 74',
  },
];

/**
 * core-js ships feature detection that contains the very syntax it polyfills, inside
 * strings and regular expressions. Scanning it reports the polyfill, not our code.
 */
const EXEMPT = /polyfills-/;

function jsFiles(dir) {
  let found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found = found.concat(jsFiles(full));
    else if (entry.endsWith('.js')) found.push(full);
  }
  return found;
}

let files;
try {
  files = jsFiles(CHUNKS);
} catch {
  console.error(`No build found at ${CHUNKS}. Run "npm run build" first.`);
  process.exit(2);
}

const scanned = files.filter((f) => !EXEMPT.test(f));
const failures = [];

for (const file of scanned) {
  const source = readFileSync(file, 'utf8');
  for (const rule of FORBIDDEN) {
    const match = source.match(rule.pattern);
    if (match) {
      failures.push({ file, rule, excerpt: match[0] });
    }
  }
}

if (scanned.length === 0) {
  console.error('No chunks to scan. That is a broken build, not a passing check.');
  process.exit(2);
}

if (failures.length > 0) {
  console.error(`\nNFR-CMP-01: the bundle ships syntax the declared floor cannot parse.\n`);
  for (const f of failures) {
    console.error(`  ${f.file}`);
    console.error(`    ${f.rule.name} — needs ${f.rule.supportedFrom}, found "${f.excerpt.trim()}"`);
  }
  console.error(`\nCheck .browserslistrc is being read, then rebuild.\n`);
  process.exit(1);
}

console.log(
  `NFR-CMP-01 ok — ${scanned.length} chunks contain no syntax above the Chromium 61 floor.`,
);
