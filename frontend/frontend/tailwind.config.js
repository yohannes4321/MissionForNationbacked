/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        forest: "#1a3c34",
        gold: "#d4af37",
        lightGold: "#f0d082",
        offWhite: "#f5f5f5",
      },
    },
  },
  plugins: [],
}