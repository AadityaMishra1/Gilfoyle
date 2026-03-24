import type { Config } from "tailwindcss";

export default {
  content: ["./src/renderer/**/*.{tsx,ts,html}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: {
          primary: "#1c1917",
          secondary: "#171412",
          elevated: "#292524",
          hover: "#3a3533",
        },
        accent: {
          DEFAULT: "#e8a872",
          light: "#f0c59c",
          muted: "#7c4a1e",
          glow: "rgba(232, 168, 114, 0.15)",
        },
      },
      fontFamily: {
        sans: ["Geist", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "JetBrains Mono", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        glow: "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px rgba(232, 168, 114, 0.2)" },
          "100%": { boxShadow: "0 0 20px rgba(232, 168, 114, 0.4)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
