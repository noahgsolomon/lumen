/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    fontFamily: {
      body: ['"iA Writer Quattro"', "system-ui", "sans-serif"],
      mono: ['"iA Writer Mono"', "monospace"],
    },
    colors: {
      transparent: "transparent",
      text: "var(--color-text)",
      "text-muted": "var(--color-text-muted)",
      bg: "var(--color-bg)",
      "bg-inset": "var(--color-bg-inset)",
      border: "var(--color-border)",
    },
  },
  plugins: [],
};