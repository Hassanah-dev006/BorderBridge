/**
 * WCAG 2.2 contrast (NFR-USA-04).
 *
 * The requirement names a ratio, so the ratio should be computed rather than eyeballed.
 * These are the formulae from WCAG 2.2 §1.4.3 and §1.4.11, and the test beside them
 * runs every foreground/background pair the interface actually uses through them.
 *
 * This matters more here than on most products. The design reference in Table 2.4 is an
 * entry-level Android handset, frequently held in direct sun at a border post or a
 * market, which is the condition under which low-contrast text stops being a
 * preference and starts being unreadable.
 */

export type Rgb = { r: number; g: number; b: number };

/** '#1B5E3F' or '1B5E3F' or '#fff' → channels in 0–255. */
export function parseHex(hex: string): Rgb {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Not a colour: ${hex}`);
  }
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** One channel, linearised. WCAG 2.2, relative luminance. */
function channel(value8Bit: number): number {
  const c = value8Bit / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(colour: string | Rgb): number {
  const { r, g, b } = typeof colour === 'string' ? parseHex(colour) : colour;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * The ratio between two colours, from 1 (identical) to 21 (black on white).
 *
 * Order does not matter: the brighter of the two always goes on top of the fraction.
 */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The AA thresholds, by what the colour is being used for. */
export const AA = {
  /** Body text and anything under 18.66px, or under 24px if bold. */
  bodyText: 4.5,
  /** Large text: 24px, or 18.66px bold. */
  largeText: 3,
  /** Borders, icons and focus rings that carry meaning (WCAG 2.2 §1.4.11). */
  nonText: 3,
} as const;

export function meetsAA(
  foreground: string,
  background: string,
  use: keyof typeof AA = 'bodyText',
): boolean {
  return contrastRatio(foreground, background) >= AA[use];
}

/** Rounded the way an audit report states it, so a 4.496 never reads as a pass. */
export function ratioLabel(foreground: string, background: string): string {
  return `${Math.floor(contrastRatio(foreground, background) * 100) / 100}:1`;
}

/**
 * The palette, as the single source the stylesheet and the audit both read.
 *
 * Kept here rather than imported from tailwind.config.ts because that file is a build
 * artefact of a different toolchain; duplicating four hex values is cheaper than
 * loading a Tailwind config inside a unit test, and the test below fails if they drift.
 */
export const PALETTE = {
  ink: '#16281E',
  brand: '#1B5E3F',
  brandDark: '#134229',
  brandLight: '#D3E5D9',
  brandPale: '#EFF6F1',
  gold: '#8F6108',
  goldBright: '#F2C230',
  goldPale: '#FDF5E0',
  white: '#FFFFFF',
  /** The page background set in globals.css. */
  page: '#F6F8F4',
  /* Tailwind's own greys, at the steps this interface uses. */
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
} as const;
