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
        // FAST-Assist Design System
        surface: {
          950: '#080a0c',
          900: '#0d1117',
          800: '#141920',
          700: '#1c2330',
          600: '#242d3d',
          500: '#2e3a4e',
        },
        teal: {
          50:  '#f0fdfb',
          100: '#ccfbf4',
          200: '#99f6e8',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        // Medical amber for warnings
        amber: {
          400: '#fbbf24',
          500: '#f59e0b',
        },
        // Status colors
        status: {
          live:    '#14b8a6',
          warning: '#f59e0b',
          error:   '#ef4444',
          neutral: '#64748b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ping-slow':  'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
        'fade-in':    'fadeIn 0.3s ease-in-out',
        'slide-up':   'slideUp 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'glow-teal': '0 0 20px -5px rgba(20, 184, 166, 0.4)',
        'glow-sm':   '0 0 10px -3px rgba(20, 184, 166, 0.3)',
        'card':      '0 1px 3px 0 rgba(0,0,0,0.4), 0 1px 2px -1px rgba(0,0,0,0.4)',
        'card-lg':   '0 4px 16px -2px rgba(0,0,0,0.5)',
      },
    },
  },
  plugins: [],
}
