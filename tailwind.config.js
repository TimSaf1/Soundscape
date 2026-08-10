/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // Позволяет переключать тему сайта
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}', // Где искать классы в коде (папка app)
    './components/**/*.{js,ts,jsx,tsx,mdx}', // Папка components
    './pages/**/*.{js,ts,jsx,tsx,mdx}', // Если используете старую папку pages
    './index.html' // Ваша главная страница
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
