import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        feature: {
          seismic: "rgb(var(--feature-seismic) / <alpha-value>)",
          air: "rgb(var(--feature-air) / <alpha-value>)",
          building: "rgb(var(--feature-building) / <alpha-value>)",
          new: "rgb(var(--feature-new) / <alpha-value>)",
          genplan: "rgb(var(--feature-genplan) / <alpha-value>)",
        },
        problematic: {
          DEFAULT: "rgb(var(--problematic) / <alpha-value>)",
          surface: "rgb(var(--problematic-surface) / <alpha-value>)",
          marker: "rgb(var(--marker-problematic) / <alpha-value>)",
          ring: "rgb(var(--marker-problematic-ring) / <alpha-value>)",
        },
        construction: "rgb(var(--marker-building) / <alpha-value>)",
        risk: {
          safe: "rgb(var(--risk-safe) / <alpha-value>)",
          low: "rgb(var(--risk-low) / <alpha-value>)",
          moderate: "rgb(var(--risk-moderate) / <alpha-value>)",
          high: "rgb(var(--risk-high) / <alpha-value>)",
          critical: "rgb(var(--risk-critical) / <alpha-value>)",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        surface: {
          DEFAULT: "hsl(var(--surface))",
          elevated: "hsl(var(--surface-elevated))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};
export default config;
