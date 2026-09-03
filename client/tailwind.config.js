/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        // Cognitive Prism Icon Color System
        prism: {
          violet: '#7A22E8',
          'violet-dark': '#6918C8',
          'violet-deep': '#5A12B0',
          indigo: '#2E1D5E',
          'indigo-dark': '#1F1340',
          purple: '#521EA8',
          lavender: '#F3ECFF',
          'lavender-border': '#D8B4FE',
          canvas: '#FAF8FD',
        },
        deezer: {
          purple: '#7A22E8',
          'purple-dark': '#6918C8',
          'purple-light': '#F3ECFF',
          'purple-border': '#D8B4FE',
          canvas: '#FAF8FD',
        },
        brand: {
          blue: '#0284C7',
          'blue-light': '#0EA5E9',
          purple: '#7A22E8',
          'purple-light': '#F3ECFF',
          indigo: '#2E1D5E',
        },
      },
    },
  },
  plugins: [],
}
