/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'media', // or 'class' or 'media'
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      minWidth: {
        container: '1200px', // 自定义最小容器宽度
      },
      maxWidth: {
        container: '1500px', // 最大宽度
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

