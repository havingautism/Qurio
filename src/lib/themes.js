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
  denim: {
    label: 'Denim Ink',
    colors: {
      '--color-primary-50': '#f4f7fb',
      '--color-primary-100': '#e9eef7',
      '--color-primary-200': '#d3dfef',
      '--color-primary-300': '#b0c5e2',
      '--color-primary-400': '#85a4d1',
      '--color-primary-500': '#577fb9',
      '--color-primary-600': '#476aa6',
      '--color-primary-700': '#3e588a',
      '--color-primary-800': '#374b73',
      '--color-primary-900': '#32405f',
      '--color-primary-950': '#22293f',
      '--user-bubble': '#edf2fa',
    },
  },
  mauve: {
    label: 'Mauve Mist',
    colors: {
      '--color-primary-50': '#faf7fb',
      '--color-primary-100': '#f2ecf7',
      '--color-primary-200': '#e5dcef',
      '--color-primary-300': '#d2c4e1',
      '--color-primary-400': '#b8a3cf',
      '--color-primary-500': '#9b7bb8',
      '--color-primary-600': '#8663a3',
      '--color-primary-700': '#6f5287',
      '--color-primary-800': '#5e466f',
      '--color-primary-900': '#503d5c',
      '--color-primary-950': '#33253c',
      '--user-bubble': '#f4eff8',
    },
  },
  midnight: {
    label: 'Midnight Blue',
    colors: {
      '--color-primary-50': '#f2f5fa',
      '--color-primary-100': '#e7ecf6',
      '--color-primary-200': '#d0daec',
      '--color-primary-300': '#adbfdf',
      '--color-primary-400': '#819ccc',
      '--color-primary-500': '#5b79b6',
      '--color-primary-600': '#4a639c',
      '--color-primary-700': '#3f5280',
      '--color-primary-800': '#39466b',
      '--color-primary-900': '#333c5a',
      '--color-primary-950': '#202639',
      '--user-bubble': '#eaf0f8',
    },
  },
  ocean: {
    label: 'Aegean Blue',
    colors: {
      '--color-primary-50': '#f2f9fa',
      '--color-primary-100': '#dff1f4',
      '--color-primary-200': '#b9e2e8',
      '--color-primary-300': '#88ccd7',
      '--color-primary-400': '#52b0c2',
      '--color-primary-500': '#2e96ad',
      '--color-primary-600': '#267b91',
      '--color-primary-700': '#236477',
      '--color-primary-800': '#235362',
      '--color-primary-900': '#214755',
      '--color-primary-950': '#102f3a',
      '--user-bubble': '#e8f4f6',
    },
  },
  slate: {
    label: 'Slate Calm',
    colors: {
      '--color-primary-50': '#f6f7f9',
      '--color-primary-100': '#edeff3',
      '--color-primary-200': '#dde1e8',
      '--color-primary-300': '#c5ccd8',
      '--color-primary-400': '#a7b2c3',
      '--color-primary-500': '#7d8ca3',
      '--color-primary-600': '#647389',
      '--color-primary-700': '#536073',
      '--color-primary-800': '#485265',
      '--color-primary-900': '#404958',
      '--color-primary-950': '#2a303b',
      '--user-bubble': '#f0f2f6',
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
  indigo: {
    label: 'Indigo',
    colors: {
      '--color-primary-50': '#eff1ff',
      '--color-primary-100': '#e2e6ff',
      '--color-primary-200': '#cacfef',
      '--color-primary-300': '#a8b1f2',
      '--color-primary-400': '#848ef0',
      '--color-primary-500': '#5c67dd',
      '--color-primary-600': '#4f59c9',
      '--color-primary-700': '#434ca7',
      '--color-primary-800': '#3a4188',
      '--color-primary-900': '#343b70',
      '--color-primary-950': '#232749',
      '--user-bubble': '#eceffd',
    },
  },
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
  const theme = THEMES[themeKey] || THEMES['midnight'] // Default to midnight if invalid

  Object.entries(theme.colors).forEach(([property, value]) => {
    // We expect property to be --color-primary-*, which is correct after sed
    root.style.setProperty(property, value)
  })
}
