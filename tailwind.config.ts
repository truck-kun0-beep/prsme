import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surface ladder
        ink: {
          950: "#07070B",
          900: "#0B0B10",
          800: "#101018",
          700: "#161622",
          600: "#1E1E2C",
          500: "#272738",
        },
        // Lavender accent
        iris: {
          50: "#F2EEFF",
          100: "#E4DCFF",
          200: "#C8B8FF",
          300: "#A892FF",
          400: "#8C6CFF",
          500: "#7350F0",
          600: "#5E3FD0",
          700: "#4730A0",
          800: "#2E1F6E",
          900: "#1A1244",
        },
        // Muted text
        muted: {
          50: "#F4F4F6",
          100: "#E6E6EC",
          200: "#C9C9D4",
          300: "#9A9AAA",
          400: "#6F6F80",
          500: "#4A4A5A",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: [
          "var(--display-family, var(--font-display))",
          "ui-serif",
          "Georgia",
          "serif",
        ],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        // Profile-scoped font roles. These resolve against `--pf-font-*`, which
        // the `.profile-scope` element sets per the active typography preset.
        // That is what makes the typography picker change real computed fonts
        // instead of only flipping a radio button.
        pfDisplay: ["var(--pf-font-display)", "ui-sans-serif", "serif"],
        pfBody: [
          "var(--pf-font-body)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        pfMeta: ["var(--pf-font-meta)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Fluid type scale
        "display-xl": ["clamp(2.75rem, 6.5vw, 5.25rem)", { lineHeight: "1.02", letterSpacing: "-0.03em" }],
        "display-lg": ["clamp(2.25rem, 4.5vw, 3.5rem)", { lineHeight: "1.05", letterSpacing: "-0.025em" }],
        "display-md": ["clamp(1.75rem, 3vw, 2.5rem)", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "20px",
        "2xl": "28px",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(140,108,255,0.18), 0 10px 40px -10px rgba(115,80,240,0.35)",
        card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 60px -28px rgba(0,0,0,0.6)",
        ring: "0 0 0 1px rgba(255,255,255,0.06), 0 8px 24px -12px rgba(0,0,0,0.6)",
      },
      transitionTimingFunction: {
        soft: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "iris-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(140,108,255,0.35)" },
          "50%": { boxShadow: "0 0 0 14px rgba(140,108,255,0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 0.8s ease both",
        "iris-pulse": "iris-pulse 3s ease-in-out infinite",
        shimmer: "shimmer 6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;