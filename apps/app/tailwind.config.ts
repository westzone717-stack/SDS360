import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#1e40af', light: '#3b82f6', dark: '#1e3a8a' },
        hazard: {
          extreme: '#DC2626',
          high: '#D97706',
          medium: '#2563EB',
          low: '#059669',
        },
      },
    },
  },
  plugins: [],
};

export default config;
