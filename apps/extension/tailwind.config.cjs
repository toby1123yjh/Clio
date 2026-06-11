/** @type {import("tailwindcss").Config} */
module.exports = {
  content: ["./entrypoints/**/*.{html,ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--clio-border))",
        "border-strong": "hsl(var(--clio-border-strong))",
        background: "hsl(var(--clio-background))",
        foreground: "hsl(var(--clio-foreground))",
        "foreground-soft": "hsl(var(--clio-foreground-soft))",
        muted: "hsl(var(--clio-muted))",
        "muted-foreground": "hsl(var(--clio-muted-foreground))",
        primary: "hsl(var(--clio-primary))",
        "primary-hover": "hsl(var(--clio-primary-hover))",
        "primary-foreground": "hsl(var(--clio-primary-foreground))",
        surface: "hsl(var(--clio-surface))",
        "surface-hover": "hsl(var(--clio-surface-hover))",
        "surface-subtle": "hsl(var(--clio-surface-subtle))",
        "warning-background": "hsl(var(--clio-warning-background))",
        "warning-border": "hsl(var(--clio-warning-border))",
        "warning-foreground": "hsl(var(--clio-warning-foreground))",
        danger: "hsl(var(--clio-danger))",
      },
      boxShadow: {
        clio: "0 18px 48px rgba(15, 23, 42, 0.18)",
      },
    },
  },
  plugins: [],
};
