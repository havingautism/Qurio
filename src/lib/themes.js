/**
 * Theme Definitions
 *
 * Defines the color palettes for the application themes.
 * Each theme should define colors for 50-950 scales to match Tailwind's expectations
 * if we were using it fully dynamically, but here we primarily map them to the
 * --color-primary-* variables that the app currently uses as its primary/accent color.
 */

export const THEMES = {
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
}

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
