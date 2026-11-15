/**
 * FR-LOC-01 — English, French, Kiswahili or Kinyarwanda, persisted across sessions.
 *
 * ## An honest note about coverage
 *
 * The machinery here is complete: every string the interface shows is a key, a
 * missing translation falls back to English, and the coverage per language is
 * measurable and shown to the user.
 *
 * The *content* is not complete, deliberately. English and French are translated
 * throughout. Kiswahili and Kinyarwanda cover navigation and general interface text
 * but not regulatory or customs terminology, because a mistranslated document name
 * or legal term is worse than English a trader can ask someone about — they might
 * present the wrong thing at a border on the strength of it.
 *
 * So those two languages fall back to English for the regulatory vocabulary, the
 * interface says so, and the gap is a task for a fluent reviewer rather than
 * something to paper over. `needsReview` below is what the settings page reports.
 */
import type { Language } from './types';

export const LANGUAGES: { code: Language; name: string; endonym: string }[] = [
  { code: 'en', name: 'English', endonym: 'English' },
  { code: 'fr', name: 'French', endonym: 'Français' },
  { code: 'sw', name: 'Kiswahili', endonym: 'Kiswahili' },
  { code: 'rw', name: 'Kinyarwanda', endonym: 'Ikinyarwanda' },
];

export const LANGUAGE_COOKIE = 'bb_lang';

export function isLanguage(v: string | undefined | null): v is Language {
  return v === 'en' || v === 'fr' || v === 'sw' || v === 'rw';
}

/** Languages whose regulatory vocabulary has not been reviewed by a fluent speaker. */
export const needsReview: Language[] = ['sw', 'rw'];

type Entry = { en: string; fr?: string; sw?: string; rw?: string };

/**
 * Every string the interface shows, keyed.
 *
 * Grouped by where it appears. A key with no entry for a language falls back to
 * English — which is the designed behaviour, not an oversight.
 */
export const DICT: Record<string, Entry> = {
  // --- navigation and shell ------------------------------------------------
  'nav.plan': { en: 'Plan', fr: 'Planifier', sw: 'Panga', rw: 'Tegura' },
  'nav.shipments': { en: 'Shipments', fr: 'Expéditions', sw: 'Mizigo', rw: 'Imizigo' },
  'nav.reports': { en: 'Border reports', fr: 'Rapports frontaliers', sw: 'Taarifa za mpaka' },
  'nav.market': { en: 'Marketplace', fr: 'Place de marché', sw: 'Soko', rw: 'Isoko' },
  'nav.alerts': { en: 'Alerts', fr: 'Alertes', sw: 'Arifa', rw: 'Imenyesha' },
  'nav.offering': { en: 'My offering', fr: 'Mon offre', sw: 'Huduma yangu' },
  'nav.requests': { en: 'Requests', fr: 'Demandes', sw: 'Maombi' },
  'nav.admin': { en: 'Admin', fr: 'Administration', sw: 'Utawala' },
  'nav.signin': { en: 'Sign in', fr: 'Se connecter', sw: 'Ingia', rw: 'Injira' },
  'app.tagline': {
    en: 'Rwanda – Uganda pilot',
    fr: 'Pilote Rwanda – Ouganda',
    sw: 'Majaribio Rwanda – Uganda',
    rw: 'Igeragezwa Rwanda – Uganda',
  },
  'app.disclaimer': {
    // Rewritten for NFR-USA-03: three short sentences instead of one long one, and
    // "only an officer can decide what you owe" in place of "not binding
    // determinations by any customs authority". Grade 10.7 → 5.5, same meaning.
    en: 'BorderBridge gives guidance based on published trade rules. It is not a licensed customs agent. Only an officer at the border can decide what you owe.',
    fr: "BorderBridge donne des conseils fondés sur les règles commerciales publiées. Ce n'est pas un agent en douane agréé. Seul un agent à la frontière peut décider de ce que vous devez.",
  },

  // --- the planning form ---------------------------------------------------
  'home.title': { en: 'What are you moving?', fr: 'Que transportez-vous ?', sw: 'Unasafirisha nini?', rw: 'Utwara iki?' },
  'home.titleNamed': { en: 'What are you moving, {name}?', fr: 'Que transportez-vous, {name} ?', sw: 'Unasafirisha nini, {name}?' },
  'home.lede': {
    en: 'Tell us the route, the goods and the value. We will tell you which documents you need, what it should cost, and which crossing to use.',
    fr: "Indiquez l'itinéraire, les marchandises et la valeur. Nous vous dirons quels documents sont nécessaires, le coût attendu et quel poste-frontière utiliser.",
  },
  'form.route': { en: 'Route', fr: 'Itinéraire', sw: 'Njia', rw: 'Inzira' },
  'form.product': { en: 'Product', fr: 'Produit', sw: 'Bidhaa', rw: 'Igicuruzwa' },
  'form.quantity': { en: 'Quantity', fr: 'Quantité', sw: 'Kiasi', rw: 'Ingano' },
  'form.value': { en: 'Value of goods', fr: 'Valeur des marchandises', sw: 'Thamani ya bidhaa' },
  'form.submit': { en: 'Show me what I need', fr: "Montrez-moi ce qu'il me faut", sw: 'Nionyeshe ninachohitaji' },
  'form.unitHint': { en: 'in kg, litres or pieces', fr: 'en kg, litres ou pièces', sw: 'kwa kg, lita au vipande' },

  // --- the plan ------------------------------------------------------------
  'plan.documents': { en: 'Documents you need', fr: 'Documents nécessaires', sw: 'Nyaraka unazohitaji' },
  'plan.cost': { en: 'What it should cost', fr: 'Coût attendu', sw: 'Gharama inayotarajiwa' },
  'plan.crossing': { en: 'Which crossing to use', fr: 'Quel poste-frontière utiliser', sw: 'Mpaka wa kutumia' },
  'plan.total': { en: 'Estimated total', fr: 'Total estimé', sw: 'Jumla inayokadiriwa' },
  'plan.qualifies': { en: 'Qualifies for the Simplified Trade Regime', fr: 'Éligible au Régime commercial simplifié' },
  'plan.notQualifies': { en: 'Full customs procedure applies', fr: 'Procédure douanière complète applicable' },
  'plan.issuedBy': { en: 'Issued by', fr: 'Délivré par', sw: 'Imetolewa na' },
  'plan.takes': { en: 'Typically takes', fr: 'Délai habituel', sw: 'Huchukua' },
  'plan.source': { en: 'Source', fr: 'Source', sw: 'Chanzo' },
  'plan.verified': { en: 'verified', fr: 'vérifié', sw: 'imethibitishwa' },
  'plan.required': { en: 'required', fr: 'obligatoire', sw: 'inahitajika' },
  'plan.pendingReview': { en: 'pending re-verification', fr: 'en attente de revérification' },
  'plan.notBinding': {
    // "Not a binding determination" is kept word for word — FR-CST-04 requires it and
    // tests/export.test.ts asserts it travels with every export. The sentences around
    // it carry the reading level: grade 9.7 → 6.2.
    en: 'This is an estimate, not a binding determination. The officer at the border sets the final duties, taxes and fees. The figure may differ.',
    fr: "Ceci est une estimation, pas une décision contraignante. L'agent à la frontière fixe les droits, taxes et frais définitifs. Le montant peut différer.",
  },

  // --- shipment milestones -------------------------------------------------
  'status.planned': { en: 'Planned', fr: 'Planifié', sw: 'Imepangwa', rw: 'Byateguwe' },
  'status.documents-ready': { en: 'Documents ready', fr: 'Documents prêts', sw: 'Nyaraka tayari' },
  'status.in-transit': { en: 'In transit', fr: 'En transit', sw: 'Njiani', rw: 'Mu nzira' },
  'status.at-border': { en: 'At the border', fr: 'À la frontière', sw: 'Mpakani', rw: "Ku mupaka" },
  'status.cleared': { en: 'Cleared', fr: 'Dédouané', sw: 'Imeidhinishwa' },
  'status.delivered': { en: 'Delivered', fr: 'Livré', sw: 'Imefikishwa', rw: 'Byatanzwe' },
  'status.cancelled': { en: 'Cancelled', fr: 'Annulé', sw: 'Imeghairiwa', rw: 'Byahagaritswe' },

  // --- common actions ------------------------------------------------------
  'action.save': { en: 'Save', fr: 'Enregistrer', sw: 'Hifadhi', rw: 'Bika' },
  'action.back': { en: 'Back', fr: 'Retour', sw: 'Rudi', rw: 'Subira' },
  'action.print': { en: 'Print or save as PDF', fr: 'Imprimer ou enregistrer en PDF', sw: 'Chapisha au hifadhi kama PDF' },
  'action.copy': { en: 'Copy as text', fr: 'Copier en texte', sw: 'Nakili kama maandishi' },
  'action.changeDetails': { en: 'Change details', fr: 'Modifier les détails', sw: 'Badilisha maelezo' },

  // --- the export (FR-REQ-05) ---------------------------------------------
  'export.title': { en: 'Checklist to take with you', fr: 'Liste à emporter', sw: 'Orodha ya kuchukua' },
  'export.lede': {
    en: 'Print this, or save it as a PDF. The plain-text version below can be sent by message.',
    fr: 'Imprimez ceci ou enregistrez-le en PDF. La version texte ci-dessous peut être envoyée par message.',
  },
  'export.plainText': { en: 'Plain text, to send by message', fr: 'Texte brut, à envoyer par message', sw: 'Maandishi, ya kutuma kwa ujumbe' },
  'export.generated': { en: 'Prepared', fr: 'Préparé le', sw: 'Imeandaliwa' },

  // --- language settings ---------------------------------------------------
  'lang.title': { en: 'Language', fr: 'Langue', sw: 'Lugha', rw: 'Ururimi' },
  'lang.choose': { en: 'Choose your language', fr: 'Choisissez votre langue', sw: 'Chagua lugha yako', rw: 'Hitamo ururimi' },
  'lang.saved': { en: 'Language saved.', fr: 'Langue enregistrée.', sw: 'Lugha imehifadhiwa.' },
  'lang.fallbackNote': {
    en: 'Anything not yet translated is shown in English. In Kiswahili and Kinyarwanda, customs wording stays in English until a fluent speaker has checked it. A wrong word for a document could send you to the border with the wrong paper.',
    fr: "Tout ce qui n'est pas encore traduit s'affiche en anglais. En kiswahili et en kinyarwanda, la terminologie douanière reste en anglais jusqu'à vérification par un locuteur natif. Un mauvais mot pour un document pourrait vous envoyer à la frontière avec le mauvais papier.",
  },
};

/**
 * Translate a key. Falls back to English, then to the key itself — which makes a
 * missing key visible in development rather than rendering an empty box.
 */
export function t(key: string, lang: Language = 'en', vars?: Record<string, string>): string {
  const entry = DICT[key];
  if (!entry) return key;
  const raw = entry[lang] ?? entry.en;
  if (!vars) return raw;
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), raw);
}

/** A translator bound to one language, so a page calls `tr('nav.plan')`. */
export function translator(lang: Language) {
  return (key: string, vars?: Record<string, string>) => t(key, lang, vars);
}

/** How much of the interface exists in a language. Reported to the user, not hidden. */
export function coverage(lang: Language): { translated: number; total: number; percent: number } {
  const keys = Object.keys(DICT);
  const translated = lang === 'en'
    ? keys.length
    : keys.filter((k) => DICT[k][lang] !== undefined).length;
  return {
    translated,
    total: keys.length,
    percent: Math.round((translated / keys.length) * 100),
  };
}

export function languageName(lang: Language): string {
  return LANGUAGES.find((l) => l.code === lang)?.endonym ?? 'English';
}
