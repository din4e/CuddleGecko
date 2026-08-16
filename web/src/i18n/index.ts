import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en'
import zh from './locales/zh'

// Guarded: in some test environments (jsdom without a populated window) this
// module is evaluated before localStorage exists; fall back to 'zh' there.
function initialLang(): string {
  try {
    return localStorage.getItem('language') || 'zh'
  } catch {
    return 'zh'
  }
}

const savedLang = initialLang()

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
