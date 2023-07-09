/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        rc: {
          50: "#f5f7fa",
          100: "#ebeef3",
          200: "#d2d9e5",
          300: "#abbace",
          400: "#7d94b3",
          500: "#5d779a",
          600: "#495e80",
          700: "#3c4c68",
          800: "#344158",
          900: "#2f3a4b",
          950: "#1a1f29",
        },
      },
      fontFamily: {
        body: ["Inter", "sans-serif"],
        heading: ["Work Sans", "sans-serif"],
        code: ["Source Code Pro", "monospace"],
        fancy: ["Cormorant Garamond", "serif"],
      },
      keyframes: {
        dash: {
          to: { backgroundPosition: "100% 0%, 0% 100%, 0% 0%, 100% 100%" },
        },
        slideDown: {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        slideUp: {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "slow-dash": "animation: dash 40s linear infinite",
        slideDown: "slideDown 200ms cubic-bezier(0.87, 0, 0.13, 1)",
        slideUp: "slideUp 200ms cubic-bezier(0.87, 0, 0.13, 1)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
