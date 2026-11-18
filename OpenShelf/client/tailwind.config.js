/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        midnight: "#FFFFFF", navy: "#F5F5F7", panel: "#F5F5F7",
        electric: "#0071E3", violet: "#0066CC", mint: "#0071E3",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        display: ["Space Grotesk", "Inter", "sans-serif"],
      },
      boxShadow: { glow: "0 0 35px rgba(0,113,227,.14)" },
    },
  },
  plugins: [],
};
