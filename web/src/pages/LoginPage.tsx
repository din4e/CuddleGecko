import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { captchaApi } from '../api/captcha'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Sparkles } from 'lucide-react'
import GeckoIcon from '../components/GeckoIcon'
import { BrandWordmark } from '../components/BrandWordmark'
import { AuthScaffold } from '../components/AuthScaffold'

export default function LoginPage() {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [captchaEnabled, setCaptchaEnabled] = useState(false)
  const [captchaId, setCaptchaId] = useState('')
  const [captchaImage, setCaptchaImage] = useState('')
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const login = useAuthStore((s) => s.login)
  const isLoading = useAuthStore((s) => s.isLoading)
  const navigate = useNavigate()

  const loadCaptcha = useCallback(async () => {
    try {
      const { data } = await captchaApi.get()
      if (data.enabled) {
        setCaptchaEnabled(true)
        setCaptchaId(data.captcha_id || '')
        setCaptchaImage(data.captcha_image || '')
        setCaptchaAnswer('')
      }
    } catch {
      // captcha not available, proceed without
    }
  }, [])

  useEffect(() => { loadCaptcha() }, [loadCaptcha])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await login(username, password, captchaEnabled ? { captcha_id: captchaId, captcha_answer: captchaAnswer } : undefined)
      navigate('/')
    } catch {
      setError(t('auth.invalidCredentials'))
      if (captchaEnabled) loadCaptcha()
    }
  }

  return (
    <AuthScaffold>
      <Card className="w-full max-w-sm rounded-3xl border border-primary/15 bg-card/95 shadow-xl shadow-primary/10 backdrop-blur-sm dark:border-primary/25 dark:shadow-black/30">
        <CardHeader className="gap-2.5 pb-2 text-center">
          <div className="mx-auto flex justify-center">
            <GeckoIcon size={48} cute className="-translate-y-px" />
          </div>
          <CardTitle className="text-center">
            <BrandWordmark label={t('app.name')} />
          </CardTitle>
          <CardDescription className="flex items-center justify-center gap-1.5 text-pretty">
            <Sparkles className="size-3.5 shrink-0 text-primary/80" aria-hidden />
            <span>{t('auth.signInTo')}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">{t('auth.username')}</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {captchaEnabled && captchaImage && (
              <div className="space-y-2">
                <Label>{t('auth.captcha')}</Label>
                <div className="flex items-center gap-2">
                  <img src={captchaImage} alt="captcha" className="h-10 rounded border cursor-pointer" onClick={loadCaptcha} title={t('auth.captchaRefresh')} />
                  <Input value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value)} required placeholder={t('auth.captchaPlaceholder')} className="flex-1" />
                </div>
              </div>
            )}
            <Button type="submit" className="h-10 w-full rounded-2xl shadow-md shadow-primary/25" disabled={isLoading}>
              {isLoading ? t('auth.signingIn') : t('auth.signIn')}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {t('auth.noAccount')}{' '}
              <Link
                to="/register"
                className="font-medium text-primary underline decoration-primary/35 underline-offset-2 transition-colors hover:decoration-primary"
              >
                {t('auth.register')}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </AuthScaffold>
  )
}
