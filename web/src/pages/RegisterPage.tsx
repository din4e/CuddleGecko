import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../stores/auth'
import { captchaApi } from '../api/captcha'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import GeckoIcon from '../components/GeckoIcon'

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
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <GeckoIcon size={48} />
          </div>
          <CardTitle className="text-2xl">{t('app.name')}</CardTitle>
          <CardDescription>{t('auth.createAccount')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="username">{t('auth.username')}</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
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
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? t('auth.creatingAccount') : t('auth.register')}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              {t('auth.hasAccount')} <Link to="/login" className="text-primary underline">{t('auth.signIn')}</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
