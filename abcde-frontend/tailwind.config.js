/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        body: ["Inter", "sans-serif"],
        heading: ["Work Sans", "sans-serif"],
        logo: ["JetBrains Mono", "sans-serif"],
      },
    },
  },
  plugins: [],
};
