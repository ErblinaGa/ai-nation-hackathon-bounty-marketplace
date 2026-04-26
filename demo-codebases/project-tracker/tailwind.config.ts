import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["'DM Sans'", "system-ui", "sans-serif"],
        mono: ["'DM Mono'", "'Fira Code'", "monospace"],
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
      },
      colors: {
        accent: {
          DEFAULT: "#f97316", // orange-500
          light: "#fed7aa",   // orange-200
          dark: "#c2410c",    // orange-700
        },
      },
      borderWidth: {
        DEFAULT: "1px",
      },
    },
  },
  plugins: [],
};

export default config;
