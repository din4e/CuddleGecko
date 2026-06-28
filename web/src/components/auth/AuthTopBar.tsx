import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * 登录/注册页右上角：语言 + 主题切换。
 * 逻辑与 AppLayout 一致（localStorage 的 theme / language）。
 */
export function AuthTopBar() {
  const { t, i18n } = useTranslation()
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    document.documentElement.style.colorScheme = next ? 'dark' : 'light'
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  const toggleLang = () => {
    const next = i18n.language === 'zh' ? 'en' : 'zh'
    i18n.changeLanguage(next)
    localStorage.setItem('language', next)
  }

  return (
    <div className="absolute right-3 top-3 z-20 flex items-center gap-1 sm:right-4 sm:top-4">
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-foreground"
        onClick={toggleLang}
        title={i18n.language === 'zh' ? t('lang.en') : t('lang.zh')}
        aria-label={i18n.language === 'zh' ? t('lang.en') : t('lang.zh')}
      >
        <Globe className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-foreground"
        onClick={toggleTheme}
        title={dark ? t('theme.light') : t('theme.dark')}
        aria-label={dark ? t('theme.light') : t('theme.dark')}
      >
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    </div>
  )
}
