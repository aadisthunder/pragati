/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#0284C7',
          'blue-light': '#0EA5E9',
          purple: '#7C3AED',
          'purple-light': '#8B5CF6',
        },
      },
    },
  },
  plugins: [],
}
