import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7ff",
          100: "#d9eaff",
          200: "#b0d3ff",
          300: "#7ab4ff",
          400: "#458eff",
          500: "#1f6aff",
          600: "#124fe6",
          700: "#0e3bb4",
          800: "#0c318f",
          900: "#0b2a73"
        }
      }
    }
  },
  plugins: []
};

export default config;
