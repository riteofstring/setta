/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
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

      // typography: (theme) => {
      //   css: {

      //   }
      // }
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
