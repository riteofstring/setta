/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        body: ["Inter", "sans-serif"],
        heading: ["Work Sans", "sans-serif"],
        logo: ["JetBrains Mono", "sans-serif"],
        code: ["Source Code Pro", "monospace"],
      },
      keyframes: {
        dash: {
          to: { backgroundPosition: "100% 0%, 0% 100%, 0% 0%, 100% 100%" },
        },
        slideDown: {
          from: { maxHeight: 0, opacity: 0 },
          to: { maxHeight: "400px", opacity: 1 },
        },
        slideUp: {
          from: { maxHeight: "400px", opacity: 1 },
          to: { maxHeight: 0, opacity: 0 },
        },
      },
      animation: {
        "slow-dash": "animation: dash 40s linear infinite",
        slideDown: "slideDown 200ms cubic-bezier(0.87, 0, 0.13, 1)",
        slideUp: "slideUp 200ms cubic-bezier(0.87, 0, 0.13, 1)",
      },

      // typography: (theme) => {
      //   css: {

      //   }
      // }
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
