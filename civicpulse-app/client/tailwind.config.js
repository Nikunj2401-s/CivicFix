/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#16232e', 2: '#54646f', 3: '#8a9aa4' },
        paper: '#eef1f3',
        rule: { DEFAULT: '#d6dde1', 2: '#e7ecee' },
        signal: '#c7422f',
        amber: '#d9962b',
        forest: '#2f7d5b',
        ocean: '#2b6ca3',
        violet: '#6a5aa8'
      },
      fontFamily: {
        sans: ['"Helvetica Neue"', 'Helvetica', 'Arial', '"Segoe UI"', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
