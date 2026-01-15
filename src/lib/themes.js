/**
 * Theme Definitions
 *
 * Defines the color palettes for the application themes.
 * Each theme should define colors for 50-950 scales to match Tailwind's expectations
 * if we were using it fully dynamically, but here we primarily map them to the
 * --color-primary-* variables that the app currently uses as its primary/accent color.
 */

/**
 * Helper to mix two hex colors with a weight (0-1).
 * @param {string} color1 - Base hex color.
 * @param {string} color2 - Mix hex color.
 * @param {number} weight - Weight of color2 (0 to 1).
 * @returns {string} - Resulting hex color.
 */
const mixColors = (color1, color2, weight) => {
  const hex = c => parseInt(c.replace('#', ''), 16)
  const pad = c => c.toString(16).padStart(2, '0')

  const c1 = hex(color1)
  const c2 = hex(color2)

  const r1 = (c1 >> 16) & 255
  const g1 = (c1 >> 8) & 255
  const b1 = c1 & 255

  const r2 = (c2 >> 16) & 255
  const g2 = (c2 >> 8) & 255
  const b2 = c2 & 255

  const r = Math.round(r1 * (1 - weight) + r2 * weight)
  const g = Math.round(g1 * (1 - weight) + g2 * weight)
  const b = Math.round(b1 * (1 - weight) + b2 * weight)

  return `#${pad(r)}${pad(g)}${pad(b)}`
}

/**
 * Convert hex to rgba string with an alpha channel.
 * @param {string} hex - Hex color (#rrggbb).
 * @param {number} alpha - Alpha between 0 and 1.
 * @returns {string}
 */
const hexToRgba = (hex, alpha = 1) => {
  const normalized = hex.replace('#', '')
  const value = parseInt(normalized, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Base background colors from index.css
// const BASE_BG_LIGHT = '#F6F5F0'
const BASE_BG_LIGHT = '#ffffff'
// const BASE_BG_DARK = '#1c1917'
const BASE_BG_DARK = '#1d1d1d'

// Tint weights
const TINT_WEIGHT_LIGHT = 0.02 // 2%
const TINT_WEIGHT_DARK = 0.02 // 2%

export const THEMES = {
  violet: {
    label: 'Royal Violet',
    colors: {
      '--color-primary-50': '#f5f3ff',
      '--color-primary-100': '#ede9fe',
      '--color-primary-200': '#ddd6fe',
      '--color-primary-300': '#c4b5fd',
      '--color-primary-400': '#a78bfa',
      '--color-primary-500': '#8b5cf6',
      '--color-primary-600': '#7c3aed',
      '--color-primary-700': '#6d28d9',
      '--color-primary-800': '#5b21b6',
      '--color-primary-900': '#4c1d95',
      '--color-primary-950': '#2e1065',
      '--user-bubble': '#f5f3ff',
    },
  },
  ocean: {
    label: 'Ocean Blue',
    colors: {
      '--color-primary-50': '#f0f9ff',
      '--color-primary-100': '#e0f2fe',
      '--color-primary-200': '#bae6fd',
      '--color-primary-300': '#7dd3fc',
      '--color-primary-400': '#38bdf8',
      '--color-primary-500': '#0ea5e9',
      '--color-primary-600': '#0284c7',
      '--color-primary-700': '#0369a1',
      '--color-primary-800': '#075985',
      '--color-primary-900': '#0c4a6e',
      '--color-primary-950': '#082f49',
      '--user-bubble': '#f0f9ff',
    },
  },
  emerald: {
    label: 'Emerald Green',
    colors: {
      '--color-primary-50': '#ecfdf5',
      '--color-primary-100': '#d1fae5',
      '--color-primary-200': '#a7f3d0',
      '--color-primary-300': '#6ee7b7',
      '--color-primary-400': '#34d399',
      '--color-primary-500': '#10b981',
      '--color-primary-600': '#059669',
      '--color-primary-700': '#047857',
      '--color-primary-800': '#065f46',
      '--color-primary-900': '#064e3b',
      '--color-primary-950': '#022c22',
      '--user-bubble': '#ecfdf5',
    },
  },
  charcoal: {
    label: 'Charcoal Gray',
    colors: {
      '--color-primary-50': '#f9fafb',
      '--color-primary-100': '#f3f4f6',
      '--color-primary-200': '#e5e7eb',
      '--color-primary-300': '#d1d5db',
      '--color-primary-400': '#9ca3af',
      '--color-primary-500': '#6b7280',
      '--color-primary-600': '#4b5563',
      '--color-primary-700': '#374151',
      '--color-primary-800': '#1f2937',
      '--color-primary-900': '#111827',
      '--color-primary-950': '#030712',
      '--user-bubble': '#f9fafb',
    },
  },
  fox: {
    label: 'Fox Rust',
    colors: {
      '--color-primary-50': '#FCF9F7',
      '--color-primary-100': '#F6ECE8',
      '--color-primary-200': '#EDD4CC',
      '--color-primary-300': '#E0B4A6',
      '--color-primary-400': '#D0907C',
      '--color-primary-500': '#BF6E4E',
      '--color-primary-600': '#A65234',
      '--color-primary-700': '#8A4028',
      '--color-primary-800': '#703322',
      '--color-primary-900': '#592B1E',
      '--color-primary-950': '#33160F',
      '--user-bubble': '#f7f2f1',
    },
  },
  // New modern themes
  sunset: {
    label: 'Sunset',
    colors: {
      '--color-primary-50': '#fff7ed',
      '--color-primary-100': '#ffedd5',
      '--color-primary-200': '#fed7aa',
      '--color-primary-300': '#fdba74',
      '--color-primary-400': '#fb923c',
      '--color-primary-500': '#f97316',
      '--color-primary-600': '#ea580c',
      '--color-primary-700': '#c2410c',
      '--color-primary-800': '#9a3412',
      '--color-primary-900': '#7c2d12',
      '--color-primary-950': '#431407',
      '--user-bubble': '#fff7ed',
    },
  },
  rose: {
    label: 'Rose',
    colors: {
      '--color-primary-50': '#fff1f2',
      '--color-primary-100': '#ffe4e6',
      '--color-primary-200': '#fecdd3',
      '--color-primary-300': '#fda4af',
      '--color-primary-400': '#fb7185',
      '--color-primary-500': '#f43f5e',
      '--color-primary-600': '#e11d48',
      '--color-primary-700': '#be123c',
      '--color-primary-800': '#9f1239',
      '--color-primary-900': '#881337',
      '--color-primary-950': '#4c0519',
      '--user-bubble': '#fff1f2',
    },
  },
  indigo: {
    label: 'Indigo',
    colors: {
      '--color-primary-50': '#eef2ff',
      '--color-primary-100': '#e0e7ff',
      '--color-primary-200': '#c7d2fe',
      '--color-primary-300': '#a5b4fc',
      '--color-primary-400': '#818cf8',
      '--color-primary-500': '#6366f1',
      '--color-primary-600': '#4f46e5',
      '--color-primary-700': '#4338ca',
      '--color-primary-800': '#3730a3',
      '--color-primary-900': '#312e81',
      '--color-primary-950': '#1e1b4b',
      '--user-bubble': '#eef2ff',
    },
  },
}

// Pre-calculate tinted backgrounds for each theme
Object.keys(THEMES).forEach(key => {
  const theme = THEMES[key]
  const primary500 = theme.colors['--color-primary-500']

  theme.colors['--theme-bg-light'] = mixColors(BASE_BG_LIGHT, primary500, TINT_WEIGHT_LIGHT)
  theme.colors['--theme-bg-dark'] = mixColors(BASE_BG_DARK, primary500, TINT_WEIGHT_DARK)
  // Use the same tint for sidebar for now
  theme.colors['--theme-sidebar-light'] = mixColors(BASE_BG_LIGHT, primary500, TINT_WEIGHT_LIGHT)
  theme.colors['--theme-sidebar-dark'] = mixColors(BASE_BG_DARK, primary500, TINT_WEIGHT_DARK)

  // Soft glow palette for focus rings/halos
  const glowStart = mixColors(theme.colors['--color-primary-400'], '#ffffff', 0.55)
  const glowMid = mixColors(primary500, '#ffffff', 0.25)
  const glowEnd = mixColors(theme.colors['--color-primary-600'], '#000000', 0.08)
  theme.colors['--theme-glow-1'] = hexToRgba(glowStart, 0.35)
  theme.colors['--theme-glow-2'] = hexToRgba(glowMid, 0.28)
  theme.colors['--theme-glow-3'] = hexToRgba(glowEnd, 0.32)
})

/**
 * Applies the selected theme to the document root.
 * @param {string} themeKey - The key of the theme to apply (e.g., 'fox', 'ocean').
 */
// ... (existing code)

/**
 * Applies the selected theme to the document root.
 * @param {string} themeKey - The key of the theme to apply (e.g., 'fox', 'ocean').
 */
export const applyTheme = themeKey => {
  const root = document.documentElement
  const theme = THEMES[themeKey] || THEMES['fox'] // Default to fox if invalid

  Object.entries(theme.colors).forEach(([property, value]) => {
    // We expect property to be --color-primary-*, which is correct after sed
    root.style.setProperty(property, value)
  })
}
