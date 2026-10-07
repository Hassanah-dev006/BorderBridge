import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1F2937',
        brand: { DEFAULT: '#1F4E79', light: '#DCE6F1', pale: '#F2F6FA' },
      },
    },
  },
  plugins: [],
};
export default config;
