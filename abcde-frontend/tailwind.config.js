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
      },
      animation: {
        "slow-dash": "animation: dash 40s linear infinite",
      },
      // typography: (theme) => {
      //   css: {

      //   }
      // }
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
