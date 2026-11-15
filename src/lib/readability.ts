/**
 * Reading level (NFR-USA-03).
 *
 * "Trader-facing text shall be written at a reading level no higher than that
 * appropriate to a 12-year-old reader in each supported language, and shall avoid
 * untranslated legal terminology without explanation."
 *
 * Two honest limits on what this module can do, stated here rather than discovered
 * later. Flesch–Kincaid is calibrated on English; the French, Kiswahili and
 * Kinyarwanda halves of the requirement need a fluent reader, not an algorithm. And
 * syllable counting by rule is approximate — good enough to catch a sentence that has
 * drifted into officialese, not good enough to argue about a tenth of a grade.
 *
 * What it is good for is holding a line. Interface copy decays towards the language of
 * the domain it describes, one well-meant edit at a time, and a measurement in the
 * test suite is the only thing that reliably stops it.
 */

/** Sentence-ending punctuation, including the ones a list item ends with. */
const SENTENCE_END = /[.!?؟]+(?:\s|$)/g;

export function countSentences(text: string): number {
  const matches = text.match(SENTENCE_END);
  // A label with no full stop is still one unit of reading.
  return Math.max(1, matches ? matches.length : 1);
}

export function words(text: string): string[] {
  return text
    // Placeholders such as {name} are filled at runtime and are not words to read.
    .replace(/\{[^}]*\}/g, '')
    .split(/[\s—–-]+/)
    .map((w) => w.replace(/[^A-Za-z'’]/g, ''))
    .filter(Boolean);
}

/**
 * Syllables in an English word, by the usual heuristic: count vowel groups, drop a
 * silent terminal 'e', and never return zero.
 */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;

  const trimmed = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '');

  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/**
 * Flesch–Kincaid grade level: roughly the US school year at which a reader handles
 * this text. A 12-year-old is in grade 6 or 7, so that is the line the test holds.
 */
export function gradeLevel(text: string): number {
  const ws = words(text);
  if (ws.length === 0) return 0;

  const sentences = countSentences(text);
  const syllables = ws.reduce((sum, w) => sum + countSyllables(w), 0);

  const grade = 0.39 * (ws.length / sentences) + 11.8 * (syllables / ws.length) - 15.59;
  return Math.round(grade * 10) / 10;
}

/**
 * Terms of art this product cannot avoid, each explained where it first appears.
 *
 * The requirement forbids untranslated legal terminology *without explanation*, not
 * terminology as such. A trader who will be asked for a phytosanitary certificate at
 * the counter is served by learning the word here, with its meaning beside it, rather
 * than by reading a paraphrase and being surprised at the border.
 */
export const EXPLAINED_TERMS = [
  'phytosanitary',
  'certificate',
  'simplified',
  'consignment',
  'declaration',
  'customs',
  'regulatory',
  'verification',
  'documentation',
  'authority',
  'eligibility',
  'currency',
  'estimate',
  'notification',
  'identification',
] as const;

const EXPLAINED = new Set<string>(EXPLAINED_TERMS);

/**
 * Long words that are not terms of art — the ones that make a sentence hard for no
 * benefit to the reader. "Subsequently" and "utilise" belong here; "phytosanitary"
 * does not, because no shorter word means it.
 */
export function unexplainedHardWords(text: string): string[] {
  const seen = new Set<string>();
  return words(text).filter((w, index) => {
    const lower = w.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    if (EXPLAINED.has(lower)) return false;
    // A proper noun is long because it is a name. Kinyarwanda and the East African
    // Community cannot be simplified, and flagging them would train the reader of
    // this report to ignore it.
    if (index > 0 && /^[A-Z]/.test(w)) return false;
    return countSyllables(lower) >= 4;
  });
}

/** Below this many words, a grade score is noise rather than a measurement. */
export const MEASURABLE_FROM_WORDS = 12;

export function isMeasurable(text: string): boolean {
  return words(text).length >= MEASURABLE_FROM_WORDS;
}

/** The ceiling NFR-USA-03 implies: a reader of about twelve. */
export const MAX_GRADE = 9;
