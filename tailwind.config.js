/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  /**
   * 主题不走 Tailwind class 切换 —— 我们用 CSS 变量在运行时切。
   * 但保留 darkMode='class' 兜底:body.is-dark 由 ThemeProvider 自动加,
   * 以防某些 Tailwind 实用类需要响应暗色。
   */
  darkMode: ['class', 'body.is-dark'],
  theme: {
    extend: {},
  },
  plugins: [],
}
