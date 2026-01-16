import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// Import translation files
import en from '../locales/en.json'
import zhCN from '../locales/zh-CN.json'

// Configure i18next
i18n
  // Detect user language
  .use(LanguageDetector)
  // Pass i18n instance to react-i18next
  .use(initReactI18next)
  // Initialize i18next
  .init({
    // Fallback language when translation is missing
    fallbackLng: 'en',
    // Available languages
    supportedLngs: ['en', 'zh-CN'],
    // Debug mode (disable in production)
    debug: false,
    // Clean up language codes (e.g., en-US -> en)
    cleanCode: true,
    // Resources (translation files)
    resources: {
      en: { translation: en },
      'zh-CN': { translation: zhCN },
    },
    // Interpolation settings
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    // Detection options
    detection: {
      // Order of language detection (from highest to lowest priority)
      order: ['localStorage', 'navigator'],
      // Cache user language in localStorage
      caches: ['localStorage'],
      // Lookup keys in localStorage
      lookupLocalStorage: 'qurio_interface_language',
    },
  })

export default i18n
