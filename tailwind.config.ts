import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * ROUGE — "Velvet & Laser" Dark UI
 * Paleta semántica pensada para pantallas OLED y entornos nocturnos.
 * Ver CLAUDE.md → "Sistema de diseño" antes de agregar colores nuevos.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem" },
    extend: {
      colors: {
        background: "#070709", // Obsidian Black — fondo base
        surface: {
          DEFAULT: "#121216", // Charcoal Glass
          raised: "#1A1A20",
          sunken: "#0C0C0F",
        },
        // rouge y vip son variables CSS: cada marca puede reemplazarlas (ver lib/engine/branding.ts y globals.css).
        rouge: {
          DEFAULT: "rgb(var(--c-rouge) / <alpha-value>)", // Electric Rouge — matches, rompehielos
          hover: "rgb(var(--c-rouge-hover) / <alpha-value>)",
          soft: "rgb(var(--c-rouge) / 0.12)",
        },
        // Rescate 🚨: SIEMPRE el rojo de ROUGE, aunque la marca cambie sus colores (señal de seguridad).
        sos: "rgb(255 30 86 / <alpha-value>)",
        squad: {
          DEFAULT: "#00F0FF", // Cyber Cyan — amigos, pines de squad
          hover: "#00C8D6",
          soft: "#00F0FF1F",
        },
        vip: {
          DEFAULT: "rgb(var(--c-vip) / <alpha-value>)", // Amber Gold — monetización, perks, punto base
          hover: "rgb(var(--c-vip-hover) / <alpha-value>)",
          soft: "rgb(var(--c-vip) / 0.12)",
        },
        primary: "#F8FAFC", // text-primary
        muted: "#94A3B8", // text-muted
        border: "rgba(255,255,255,0.10)",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "glow-rouge": "0 0 20px rgb(var(--c-rouge) / 0.35)",
        "glow-sos": "0 0 20px rgba(255,30,86,0.45)",
        "glow-squad": "0 0 15px rgba(0,240,255,0.3)",
        "glow-vip": "0 0 18px rgb(var(--c-vip) / 0.3)",
        sheet: "0 -12px 40px rgba(0,0,0,0.6)",
      },
      minHeight: { touch: "44px" },
      minWidth: { touch: "44px" },
      aspectRatio: { card: "3 / 4" },
      keyframes: {
        "pin-pulse": {
          "0%": { transform: "scale(1)", opacity: "0.7" },
          "100%": { transform: "scale(2.6)", opacity: "0" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "neon-flicker": {
          "0%, 19%, 21%, 23%, 25%, 54%, 56%, 100%": { opacity: "1" },
          "20%, 24%, 55%": { opacity: "0.55" },
        },
        "sheet-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "toast-in": {
          from: { transform: "translateY(-120%)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "eq-bar": {
          "0%, 100%": { transform: "scaleY(0.3)" },
          "50%": { transform: "scaleY(1)" },
        },
      },
      animation: {
        "pin-pulse": "pin-pulse 1.8s cubic-bezier(0,0,0.2,1) infinite",
        marquee: "marquee 22s linear infinite",
        "neon-flicker": "neon-flicker 4s linear infinite",
        "sheet-up": "sheet-up 280ms cubic-bezier(0.32,0.72,0,1)",
        "toast-in": "toast-in 320ms cubic-bezier(0.32,0.72,0,1)",
        "eq-bar": "eq-bar 0.9s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
};

export default config;
