import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { captchaApi } from '../api/captcha'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { AlertCircle, Loader2, Sparkles } from 'lucide-react'
import { BrandWordmark } from '../components/BrandWordmark'
import BrandIcon from '../components/BrandIcon'
import { AuthScaffold } from '../components/AuthScaffold'
import { CaptchaField } from '../components/auth/CaptchaField'
import { PasswordInput } from '../components/auth/PasswordInput'

export default function RegisterPage() {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [captchaEnabled, setCaptchaEnabled] = useState(false)
  const [captchaId, setCaptchaId] = useState('')
  const [captchaImage, setCaptchaImage] = useState('')
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const register = useAuthStore((s) => s.register)
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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadCaptcha() }, [loadCaptcha])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await register(username, email, password, captchaEnabled ? { captcha_id: captchaId, captcha_answer: captchaAnswer } : undefined)
      navigate('/')
    } catch {
      setError(t('auth.registerFailed'))
      if (captchaEnabled) loadCaptcha()
    }
  }

  return (
    <AuthScaffold>
      <Card className="w-full max-w-sm rounded-3xl border border-primary/15 bg-card/95 shadow-xl shadow-primary/10 backdrop-blur-sm animate-cg-card-in dark:border-primary/25 dark:shadow-black/30">
        <CardHeader className="gap-2.5 pb-2 text-center">
          <div className="mx-auto flex justify-center">
            <BrandIcon size={64} className="animate-cg-bob" />
          </div>
          <CardTitle className="text-center">
            <BrandWordmark label={t('app.name')} />
          </CardTitle>
          <CardDescription className="flex items-center justify-center gap-1.5 text-pretty">
            <Sparkles className="size-3.5 shrink-0 text-primary/80" aria-hidden />
            <span>{t('auth.createAccount')}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p role="alert" className="flex items-center justify-center gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0" aria-hidden />
                <span>{error}</span>
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">{t('auth.username')}</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} autoComplete="username" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" spellCheck={false} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                showLabel={t('auth.showPassword')}
                hideLabel={t('auth.hidePassword')}
              />
            </div>
            {captchaEnabled && captchaImage && (
              <CaptchaField
                image={captchaImage}
                answer={captchaAnswer}
                onAnswerChange={setCaptchaAnswer}
                onRefresh={loadCaptcha}
                labelText={t('auth.captcha')}
                placeholder={t('auth.captchaPlaceholder')}
                imageAlt={t('auth.captchaImage')}
                refreshLabel={t('auth.captchaRefresh')}
              />
            )}
            <Button type="submit" className="h-10 w-full rounded-2xl shadow-md shadow-primary/25" disabled={isLoading}>
              {isLoading && <Loader2 className="size-4 animate-spin" />}
              {isLoading ? t('auth.creatingAccount') : t('auth.register')}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {t('auth.hasAccount')}{' '}
              <Link
                to="/login"
                className="font-medium text-primary underline decoration-primary/35 underline-offset-2 transition-colors hover:decoration-primary"
              >
                {t('auth.signIn')}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </AuthScaffold>
  )
}
