import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "lens-bg": "#0a0a0f",
        "lens-surface": "#12121a",
        "lens-surface2": "#1a1a2e",
        "lens-border": "#2a2a3e",
        "lens-accent": "#6366f1",
        "lens-accent-hover": "#818cf8",
        "lens-text": "#e2e8f0",
        "lens-muted": "#94a3b8",
        "lens-user": "#1e293b",
        "lens-assistant": "#0f172a",
      },
    },
  },
  plugins: [],
};

export default config;
