/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        radiant: {
          darkest: '#0B0F17',
          dark: '#111827',
          panel: '#151D2A',
          card: '#1C2638',
          border: '#2A374D',
          hover: '#26344A',
          accent: '#00B4D8',
          accentLight: '#90E0EF',
          accentDark: '#0077B6',
          warning: '#F59E0B',
          danger: '#EF4444',
          success: '#10B981',
          textMuted: '#94A3B8',
          overlayText: '#E2E8F0',
          yellowOverlay: '#FDE047'
        }
      },
      fontFamily: {
        mono: ['Consolas', 'Fira Code', 'Monaco', 'Courier New', 'monospace'],
        sans: ['Inter', 'Segoe UI', 'Roboto', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
