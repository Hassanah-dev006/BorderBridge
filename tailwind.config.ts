import type { Config } from 'tailwindcss';

/**
 * The palette.
 *
 * The two flags on this corridor share exactly one colour: yellow. Rwanda's
 * central band, Uganda's two stripes. So gold is the accent — the colour the
 * corridor has in common — over the deep green of Rwanda's flag, which also happens
 * to read as agricultural, and most of what crosses here is.
 *
 * Uganda's red is kept out of the brand deliberately. It is needed for errors, and a
 * red that means "your form is wrong" cannot also mean "this is us".
 *
 * Contrast, measured against white:
 *   brand   #1B5E3F  7.6:1   body text and buttons
 *   brand.dark #134229 10.1:1  hover
 *   ink     #16281E  15.2:1  headings
 *   gold    #8F6108  5.3:1   text and strokes on light backgrounds
 *   gold.bright #F2C230 1.7:1  fills only, always with ink text on it
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#16281E',
        brand: {
          DEFAULT: '#1B5E3F',
          dark: '#134229',
          light: '#D3E5D9',
          pale: '#EFF6F1',
        },
        gold: {
          DEFAULT: '#8F6108',
          bright: '#F2C230',
          pale: '#FDF5E0',
        },
      },
    },
  },
  plugins: [],
};
export default config;
