/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        white: '#FFFFFF',
        gray: {
          dark: '#4A4A4A',
          // Дополнительные оттенки из дизайна будут добавлены
        },
        blue: {
          primary: '#7DD3DC', // Обновлен для соответствия новому градиенту
          400: '#60A5FA', // Светло-синий для градиентов
          450: '#3B82F6', // Средний синий для градиентов
          500: '#2563EB', // Темно-синий для градиентов
        },
      },
      fontFamily: {
        sans: ['Fira Sans', 'sans-serif'],
        manrope: ['Manrope', 'sans-serif'],
      },
      screens: {
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
      },
    },
  },
  plugins: [],
}



