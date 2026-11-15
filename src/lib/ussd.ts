/**
 * The USSD fallback channel (NFR-USA-07, §3.4, Table 3.2).
 *
 * "The core checklist and cost-estimate functions shall be obtainable through a USSD
 * or SMS fallback for users without a data connection or a smartphone."
 *
 * This is not a lesser version of the product; for part of the population it is the
 * product. Table 2.7 lists "target traders have access to an internet-capable phone"
 * as an assumption, and names the consequence if it is false: this channel becomes the
 * primary one. It is also the only channel that works during the telecommunications
 * shutdowns the SRS cites around elections, since USSD rides the signalling network
 * rather than data.
 *
 * Three constraints shape every decision here, all from §3.4:
 *
 *   **No session persistence.** "The interface shall not depend on session persistence
 *   between dial-ins." Aggregators send the whole input history on every callback —
 *   "1*3*250" — so the state is *derived* from that string rather than stored. Nothing
 *   to expire, nothing to lose when a gateway load-balances mid-session, and no state
 *   to clean up when a trader walks out of coverage halfway through.
 *
 *   **A hard character budget.** A USSD response is 182 septets. Not "should be
 *   short" — longer is truncated by the network, silently, usually mid-word. So the
 *   renderer measures and the tests assert.
 *
 *   **Limited menu depth.** The core flow must complete inside a session timeout,
 *   which is often 20 seconds per step on these networks. Five steps, no optional
 *   ones, no confirmation screens.
 */

/** The hard limit on a single USSD response, in GSM 03.38 septets. */
export const USSD_LIMIT = 182;

/** A single-part SMS. Longer messages are split and cost the sender per part. */
export const SMS_PART = 160;

/**
 * The GSM 03.38 basic alphabet, which is all a feature phone is guaranteed to render.
 *
 * Anything outside it forces the message into UCS-2, which halves the capacity from
 * 160 characters to 70 and costs the trader more per message. Kinyarwanda and
 * Kiswahili are unaffected — both are written in plain Latin letters — but French is
 * not, so "Français" and "frontière" have to be transliterated rather than sent.
 */
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅå_ÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

/** Characters that cost two septets rather than one. */
const GSM_EXTENDED = '^{}\\[~]|€';

const TRANSLITERATE: Record<string, string> = {
  'â': 'a', 'ê': 'e', 'î': 'i', 'ô': 'o', 'û': 'u',
  'ë': 'e', 'ï': 'i', 'ç': 'c', 'œ': 'oe', 'Œ': 'OE',
  'À': 'A', 'È': 'E', 'Ù': 'U', 'Ò': 'O', 'Ì': 'I',
  '–': '-', '—': '-', '’': "'", '‘': "'", '“': '"', '”': '"', '…': '...',
  ' ': ' ',
};

/**
 * Force text into something a feature phone will display, and say what it cost.
 *
 * Unknown characters become '?' rather than being dropped: a missing letter changes a
 * word silently, and a '?' at least shows the trader that something did not survive.
 */
export function toGsm(text: string): { text: string; septets: number; lossy: boolean } {
  let lossy = false;
  let out = '';
  let septets = 0;

  for (const char of text) {
    let mapped = char;
    if (!GSM_BASIC.includes(char) && !GSM_EXTENDED.includes(char)) {
      mapped = TRANSLITERATE[char] ?? '?';
      if (mapped === '?') lossy = true;
    }
    for (const c of mapped) {
      out += c;
      septets += GSM_EXTENDED.includes(c) ? 2 : 1;
    }
  }

  return { text: out, septets, lossy };
}

export function gsmLength(text: string): number {
  return toGsm(text).septets;
}

/**
 * Trim to fit, on a word boundary, with a marker.
 *
 * §3.4: "Long content shall be truncated with a clear continuation indicator rather
 * than silently cut." The network truncates silently; this does not.
 */
export function fit(text: string, limit: number): string {
  const gsm = toGsm(text).text;
  if (gsmLength(gsm) <= limit) return gsm;

  const marker = '...';
  let cut = gsm.slice(0, limit - marker.length);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > limit * 0.6) cut = cut.slice(0, lastSpace);
  return `${cut.trimEnd()}${marker}`;
}

// --- the session ------------------------------------------------------------

export type Step = 'language' | 'direction' | 'product' | 'value' | 'result' | 'error';

export type UssdState = {
  step: Step;
  language: 'en' | 'fr' | 'sw' | 'rw';
  corridorId?: string;
  productId?: string;
  declaredValue?: number;
  error?: string;
};

export type Choice = { id: string; label: string };

export type UssdInput = {
  /** The aggregator's cumulative history, "1*3*250". Empty on the first callback. */
  text: string;
  corridors: Choice[];
  products: Choice[];
};

const LANGUAGES: UssdState['language'][] = ['en', 'fr', 'sw', 'rw'];

/** Split the aggregator's cumulative string into the choices made so far. */
export function parts(text: string): string[] {
  return text.split('*').filter((p) => p !== '');
}

/**
 * Derive the whole session from the input history.
 *
 * Pure, and the reason the channel needs no session store: two aggregators, a restart
 * or a load-balanced callback all produce the same state from the same string.
 */
export function stateFrom({ text, corridors, products }: UssdInput): UssdState {
  const chosen = parts(text);
  const state: UssdState = { step: 'language', language: 'en' };

  const pick = <T>(list: T[], raw: string): T | undefined => {
    const index = Number(raw);
    if (!Number.isInteger(index) || index < 1 || index > list.length) return undefined;
    return list[index - 1];
  };

  if (chosen.length === 0) return state;

  const language = pick(LANGUAGES, chosen[0]);
  if (!language) return { ...state, step: 'error', error: 'Choose a number from the list.' };
  state.language = language;
  state.step = 'direction';
  if (chosen.length === 1) return state;

  const corridor = pick(corridors, chosen[1]);
  if (!corridor) return { ...state, step: 'error', error: 'Choose a number from the list.' };
  state.corridorId = corridor.id;
  state.step = 'product';
  if (chosen.length === 2) return state;

  const product = pick(products, chosen[2]);
  if (!product) return { ...state, step: 'error', error: 'Choose a number from the list.' };
  state.productId = product.id;
  state.step = 'value';
  if (chosen.length === 3) return state;

  // A trader keying a value on a numeric keypad will sometimes include separators.
  const value = Number(chosen[3].replace(/[^\d.]/g, ''));
  if (!Number.isFinite(value) || value <= 0) {
    return { ...state, step: 'error', error: 'Enter the value in USD, digits only.' };
  }
  state.declaredValue = value;
  state.step = 'result';
  return state;
}

// --- rendering --------------------------------------------------------------

/** USSD replies are prefixed: CON keeps the session open, END closes it. */
export type UssdReply = { kind: 'CON' | 'END'; body: string };

export function serialise(reply: UssdReply): string {
  return `${reply.kind} ${fit(reply.body, USSD_LIMIT - 4)}`;
}

function numbered(items: Choice[], limit: number): string {
  // More than `limit` options cannot fit in a USSD page, so the list is capped rather
  // than paginated: a trader on a 20-second timeout should not be paging a menu.
  return items.slice(0, limit).map((c, i) => `${i + 1}. ${c.label}`).join('\n');
}

export function render(
  state: UssdState,
  options: { corridors: Choice[]; products: Choice[]; result?: string },
): UssdReply {
  switch (state.step) {
    case 'language':
      return { kind: 'CON', body: 'BorderBridge\n1. English\n2. Francais\n3. Kiswahili\n4. Ikinyarwanda' };

    case 'direction':
      return { kind: 'CON', body: `Route:\n${numbered(options.corridors, 5)}` };

    case 'product':
      return { kind: 'CON', body: `Goods:\n${numbered(options.products, 6)}` };

    case 'value':
      return { kind: 'CON', body: 'Value of goods in USD:' };

    case 'result':
      // END, not CON: the answer is the end of the session. Leaving it open would
      // keep a trader paying for airtime to read it.
      return { kind: 'END', body: options.result ?? 'No rules loaded for that route.' };

    case 'error':
    default:
      return { kind: 'END', body: state.error ?? 'Something went wrong. Dial again.' };
  }
}

/**
 * The checklist and cost, compressed into one USSD page.
 *
 * What survives the cut is chosen by what a trader cannot find out at the border: the
 * number of documents and the one most often missing, the total, and the fact that it
 * is guidance. What goes is every citation and explanation — not because they matter
 * less, but because a truncated citation is worse than none, and the SMS carries them.
 */
export function summarise(input: {
  documents: number;
  firstDocument?: string;
  simplified: boolean;
  totalUsd: number;
  crossing?: string;
}): string {
  const lines = [
    `${input.documents} document${input.documents === 1 ? '' : 's'} needed.`,
    input.firstDocument ? `First: ${input.firstDocument}.` : '',
    input.simplified ? 'Simplified regime applies.' : 'Full customs process.',
    `Est. USD ${input.totalUsd.toFixed(0)}.`,
    input.crossing ? `Use ${input.crossing}.` : '',
    'Guidance only, not a customs decision.',
  ].filter(Boolean);

  return lines.join('\n');
}
