import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#15131C",
          soft: "#413B4E",
          muted: "#7B7488",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          sunken: "#F8F7FB",
          raised: "#FFFFFF",
        },
        border: {
          DEFAULT: "#E6E2EF",
          strong: "#D4CEE1",
        },
        brand: {
          50: "#F4F1FE",
          100: "#EAE4FD",
          200: "#D3C6FB",
          300: "#B29FF5",
          400: "#8E72EC",
          500: "#6D4CE0",
          600: "#5936C9",
          700: "#472AA3",
          800: "#392381",
          900: "#2E1D67",
        },
        confidence: {
          high: "#1D9A6C",
          "high-bg": "#E5F6EE",
          medium: "#C4790A",
          "medium-bg": "#FBF0DF",
          low: "#B3403C",
          "low-bg": "#FBEAE9",
        },
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
      },
      borderRadius: {
        xl: "14px",
        "2xl": "20px",
      },
      boxShadow: {
        panel: "0 1px 2px rgba(21, 19, 28, 0.04), 0 8px 24px -12px rgba(21, 19, 28, 0.10)",
        pop: "0 2px 6px rgba(21, 19, 28, 0.06), 0 16px 32px -16px rgba(89, 54, 201, 0.24)",
      },
      maxWidth: {
        content: "1180px",
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
      },
      animation: {
        pulseDot: "pulseDot 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
