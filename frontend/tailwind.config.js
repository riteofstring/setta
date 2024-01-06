/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        runcoder: {
          50: "#EFF1F6",
          100: "#DCE1EA",
          200: "#B8C2D5",
          300: "#98A6C2",
          400: "#7588AE",
          500: "#576B93",
          600: "#425270",
          700: "#2D384D",
          800: "#1A202C",
          850: "#161b25",
          900: "#0D1016",
          950: "#06070A",
        },
        rcbg: {
          light: "#94a3b8",
          dark: "#14161F",
        },
      },
      fontFamily: {
        heading: ["Work Sans", "sans-serif"],
        // fancy: ["Cormorant Garamond", "serif"],
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
  plugins: [
    require("@tailwindcss/typography"),
    require("@tailwindcss/container-queries"),
  ],
};
