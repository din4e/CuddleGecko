import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useModeStore } from '../stores/mode'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Download, Upload, Network, Bot, CheckCircle, Loader2, Settings2, Cable, Copy, ShieldCheck, ExternalLink, RefreshCw, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import { useGraphSettings } from '../stores/graphSettings'
import { settingsApi, type CaptchaConfig } from '../api/settings'
import { CUSTOMIZABLE_NAV } from '../lib/nav'
import { useNavConfigStore } from '../stores/navConfig'
import type { AIProvider, AIProviderPreset } from '../types'

const PROVIDER_ICONS: Record<string, string> = {
  deepseek: 'deepseek',
  glm: 'zhipu',
  minimax: 'minimax',
  kimi: 'moonshot',
  qwen: 'qwen',
  openai: 'openai',
}

function ProviderIcon({ type, size = 24 }: { type: string; size?: number }) {
  const slug = PROVIDER_ICONS[type]
  if (!slug) return <Bot className="text-muted-foreground" style={{ width: size, height: size }} />
  return (
    <img
      src={`https://unpkg.com/@lobehub/icons-static-svg@latest/icons/${slug}.svg`}
      alt={type}
      width={size}
      height={size}
      className="object-contain"
      style={{ minWidth: size, minHeight: size }}
    />
  )
}

// Current app version (web fallback; keep in sync with Git tags / package.json).
const APP_VERSION = '0.1.0'

// Every feature module with per-module import/export (CSV + JSON), backed by
// the unified /api/data/export|import/:module endpoints.
const DATA_MODULES = [
  'contacts', 'tags', 'interactions', 'relations', 'reminders',
  'todos', 'transactions', 'events', 'workouts', 'body-metrics',
  'habits', 'pomodoros', 'fitness',
] as const
type DataModule = (typeof DATA_MODULES)[number]

// Returns >0 if a>b, <0 if a<b, 0 if equal (simple numeric semver, ignores pre-release).
function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d
  }
  return 0
}

export default function SettingsPage() {
  const { t } = useTranslation()
  const adapters = useModeStore((s) => s.adapters)
  const nodeRadius = useGraphSettings((s) => s.nodeRadius)
  const emojiSize = useGraphSettings((s) => s.emojiSize)
  const showLabels = useGraphSettings((s) => s.showLabels)
  const linkDistance = useGraphSettings((s) => s.linkDistance)
  const chargeStrength = useGraphSettings((s) => s.chargeStrength)
  const setNodeRadius = useGraphSettings((s) => s.setNodeRadius)
  const setEmojiSize = useGraphSettings((s) => s.setEmojiSize)
  const setShowLabels = useGraphSettings((s) => s.setShowLabels)
  const setLinkDistance = useGraphSettings((s) => s.setLinkDistance)
  const setChargeStrength = useGraphSettings((s) => s.setChargeStrength)
  const resetGraphSettings = useGraphSettings((s) => s.reset)

  // AI provider state
  const [presets, setPresets] = useState<AIProviderPreset[]>([])
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [selectedType, setSelectedType] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [modelName, setModelName] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [testingId, setTestingId] = useState<number | null>(null)
  const [envAI, setEnvAI] = useState<{ configured: boolean; provider_type: string; model: string; base_url: string } | null>(null)
  const [mcpCopied, setMcpCopied] = useState(false)
  const [captchaCfg, setCaptchaCfg] = useState<CaptchaConfig | null>(null)
  const [captchaSaving, setCaptchaSaving] = useState(false)
  const [update, setUpdate] = useState<{ status: 'idle' | 'checking' | 'latest' | 'available' | 'error'; latest?: string; url?: string }>({ status: 'idle' })
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const navOrder = useNavConfigStore((s) => s.order)
  const navHidden = useNavConfigStore((s) => s.hidden)
  const setNavConfig = useNavConfigStore((s) => s.setConfig)

  const loadAIProviders = useCallback(async () => {
    if (!adapters?.ai) return
    try {
      const [p, prov, env] = await Promise.all([
        adapters.ai.listPresets(),
        adapters.ai.listProviders(),
        adapters.ai.envProviderStatus(),
      ])
      setPresets(p || [])
      setProviders(prov || [])
      setEnvAI(env || null)
    } catch {
      /* ignore */
    }
  }, [adapters])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAIProviders()
  }, [loadAIProviders])

  // Load captcha config (served by the backend)
  useEffect(() => {
    settingsApi.getCaptcha().then(setCaptchaCfg).catch(() => {})
  }, [])

  // Check for a newer release via the GitHub releases API.
  const handleCheckUpdate = useCallback(async () => {
    setUpdate({ status: 'checking' })
    try {
      const res = await fetch('https://api.github.com/repos/din4e/CuddleGecko/releases/latest')
      if (res.status === 404) {
        setUpdate({ status: 'latest' })
        return
      }
      if (!res.ok) throw new Error('GitHub API ' + res.status)
      const data = await res.json()
      const latest = String(data.tag_name || '').replace(/^v/, '')
      const current = APP_VERSION.replace(/^v/, '')
      if (latest && compareVersions(latest, current) > 0) {
        setUpdate({ status: 'available', latest, url: data.html_url as string })
      } else {
        setUpdate({ status: 'latest', latest })
      }
    } catch {
      setUpdate({ status: 'error' })
    }
  }, [])

  const orderedNavItems = [...CUSTOMIZABLE_NAV].sort((a, b) => {
    const ia = navOrder.indexOf(a.to)
    const ib = navOrder.indexOf(b.to)
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
  })

  const persistNav = async (cfg: { order: string[]; hidden: string[] }) => {
    setNavConfig(cfg)
    try {
      await settingsApi.updateNav(cfg)
    } catch {
      toast.error(t('settings.navSaveFailed'))
    }
  }

  const handleNavDrop = async (targetIdx: number) => {
    if (dragIndex === null || dragIndex === targetIdx) {
      setDragIndex(null)
      return
    }
    const next = [...navOrder]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(targetIdx, 0, moved)
    setDragIndex(null)
    await persistNav({ order: next, hidden: navHidden })
  }

  const toggleNavVisible = async (to: string) => {
    const hidden = navHidden.includes(to) ? navHidden.filter((x) => x !== to) : [...navHidden, to]
    await persistNav({ order: navOrder, hidden })
  }

  // Auto-check once on mount (deferred a tick to satisfy set-state-in-effect).
  useEffect(() => {
    const timer = window.setTimeout(() => void handleCheckUpdate(), 0)
    return () => window.clearTimeout(timer)
  }, [handleCheckUpdate])

  const handleExport = async () => {
    if (!adapters) return
    try {
      const json = await adapters.export.exportJSON()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cuddlegecko-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t('settings.exportSuccess'))
    } catch {
      toast.error(t('settings.exportFailed'))
    }
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file || !adapters) return
      try {
        const text = await file.text()
        await adapters.export.importJSON(text)
        toast.success(t('settings.importSuccess'))
      } catch {
        toast.error(t('settings.importFailed'))
      }
    }
    input.click()
  }

  // External-platform todo import. Currently 滴答清单 (TickTick) CSV backups;
  // new platforms only need a backend parser + an entry here.
  const handleImportDida = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file || !adapters) return
      try {
        const text = await file.text()
        const res = await adapters.export.importTodosFromPlatform('dida', text)
        toast.success(t('settings.importedPlatform', { imported: res.imported, skipped: res.skipped }))
      } catch {
        toast.error(t('settings.importFailed'))
      }
    }
    input.click()
  }

  // Per-module import/export (all feature modules, CSV + JSON).

  const handleModuleExport = async (module: DataModule, format: 'csv' | 'json') => {
    if (!adapters) return
    try {
      const content = await adapters.export.exportModule(module, format)
      // BOM so spreadsheet apps detect UTF-8 (CJK text renders correctly).
      const body = format === 'csv' ? '\ufeff' + content : content
      const blob = new Blob([body], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cuddlegecko-${module}-${new Date().toISOString().slice(0, 10)}.${format}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t('settings.exportSuccess'))
    } catch {
      toast.error(t('settings.exportFailed'))
    }
  }

  const handleModuleImport = (module: DataModule, format: 'csv' | 'json') => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = format === 'csv' ? '.csv' : '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file || !adapters) return
      try {
        const text = await file.text()
        const res = await adapters.export.importModule(module, format, text)
        toast.success(t('settings.importedStats', { imported: res.imported, skipped: res.skipped }))
      } catch {
        toast.error(t('settings.importFailed'))
      }
    }
    input.click()
  }

  const handleSaveCaptcha = async () => {
    if (!captchaCfg) return
    setCaptchaSaving(true)
    try {
      const updated = await settingsApi.updateCaptcha({ enabled: captchaCfg.enabled, length: captchaCfg.length })
      setCaptchaCfg(updated)
      toast.success(t('settings.captchaSaved'))
    } catch {
      toast.error(t('settings.captchaSaveFailed'))
    } finally {
      setCaptchaSaving(false)
    }
  }

  const handleSaveAIProvider = async () => {
    if (!adapters?.ai || !selectedType || !apiKey) return
    try {
      await adapters.ai.saveProvider({ provider_type: selectedType, api_key: apiKey, model: modelName, base_url: customBaseUrl })
      toast.success(t('ai.save'))
      setApiKey('')
      loadAIProviders()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      toast.error(message || 'Failed to save provider')
    }
  }

  const handleActivateAI = async (id: number) => {
    if (!adapters?.ai) return
    try {
      await adapters.ai.activateProvider(id)
      loadAIProviders()
    } catch {
      /* ignore */
    }
  }

  const handleTestAI = async (id: number) => {
    if (!adapters?.ai) return
    setTestingId(id)
    try {
      const result = await adapters.ai.testConnection(id)
      if (result.success) toast.success(t('ai.testSuccess'))
      else toast.error(t('ai.testFailed') + ': ' + (result.error || ''))
    } catch {
      toast.error(t('ai.testFailed'))
    } finally {
      setTestingId(null)
    }
  }

  return (
    <div className="w-full max-w-full space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Settings2 className="h-5 w-5 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">{t('settings.title')}</h2>
      </div>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.dataManagement')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <div className="font-medium flex items-center gap-2">
                <Download className="h-4 w-4" />
                {t('settings.exportJSON')}
              </div>
              <p className="text-sm text-muted-foreground">{t('settings.exportDesc')}</p>
            </div>
            <Button variant="outline" onClick={handleExport} disabled={!adapters}>
              {t('settings.exportJSON')}
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <div className="font-medium flex items-center gap-2">
                <Upload className="h-4 w-4" />
                {t('settings.importJSON')}
              </div>
              <p className="text-sm text-muted-foreground">{t('settings.importDesc')}</p>
            </div>
            <Button variant="outline" onClick={handleImport} disabled={!adapters}>
              {t('settings.importJSON')}
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <div className="font-medium flex items-center gap-2">
                <Upload className="h-4 w-4" />
                {t('settings.importDida')}
              </div>
              <p className="text-sm text-muted-foreground">{t('settings.importDidaDesc')}</p>
            </div>
            <Button variant="outline" onClick={handleImportDida} disabled={!adapters}>
              {t('settings.importDida')}
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t('settings.dataModulesDesc')}</p>
            {DATA_MODULES.map((m) => (
              <div key={m} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <span className="text-sm font-medium">{t(`settings.moduleNames.${m}`)}</span>
                <div className="flex flex-wrap gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void handleModuleExport(m, 'csv')} disabled={!adapters}>
                    <Download className="size-3" />
                    {t('settings.exportModuleCSV')}
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void handleModuleExport(m, 'json')} disabled={!adapters}>
                    <Download className="size-3" />
                    {t('settings.exportModuleJSON')}
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleModuleImport(m, 'csv')} disabled={!adapters}>
                    <Upload className="size-3" />
                    {t('settings.importModuleCSV')}
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleModuleImport(m, 'json')} disabled={!adapters}>
                    <Upload className="size-3" />
                    {t('settings.importModuleJSON')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Captcha Settings */}
      {captchaCfg && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              {t('settings.captchaTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex cursor-pointer select-none items-center justify-between gap-4">
              <span>
                <span className="font-medium">{t('settings.captchaEnable')}</span>
                <p className="text-sm text-muted-foreground">{t('settings.captchaEnableDesc')}</p>
              </span>
              <input
                type="checkbox"
                checked={captchaCfg.enabled}
                onChange={(e) => setCaptchaCfg({ ...captchaCfg, enabled: e.target.checked })}
                className="size-4 rounded border-input accent-primary"
              />
            </label>
            <div className="space-y-2">
              <Label>{t('settings.captchaLength')} ({captchaCfg.length})</Label>
              <input
                type="range"
                min={4}
                max={8}
                step={1}
                value={captchaCfg.length}
                onChange={(e) => setCaptchaCfg({ ...captchaCfg, length: Number(e.target.value) })}
                className="w-full accent-primary"
              />
            </div>
            <Button size="sm" onClick={handleSaveCaptcha} disabled={captchaSaving}>
              {captchaSaving && <Loader2 className="size-4 animate-spin" />}
              {t('settings.captchaSave')}
            </Button>
            <p className="text-xs text-muted-foreground">{t('settings.captchaHint')}</p>
          </CardContent>
        </Card>
      )}

      {/* AI Provider Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            {t('ai.providers')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Provider selector */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {presets.map((p) => {
              const saved = providers.find((pr) => pr.provider_type === p.Type)
              const isActive = saved?.is_active
              return (
                <button
                  key={p.Type}
                  onClick={() => { setSelectedType(p.Type); setModelName(p.DefaultModel); setCustomBaseUrl(p.BaseURL) }}
                  className={`group relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-sm transition-all ${
                    selectedType === p.Type
                      ? 'border-primary bg-primary/10 shadow-sm'
                      : 'border-border hover:border-primary/40 hover:shadow-sm'
                  }`}
                >
                  {isActive && (
                    <span className="absolute top-1.5 right-1.5 flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400">
                      <CheckCircle className="h-3 w-3" />
                    </span>
                  )}
                  <div className={`rounded-lg p-2 transition-colors ${selectedType === p.Type ? 'bg-primary/10' : 'bg-muted/50 group-hover:bg-muted'}`}>
                    <ProviderIcon type={p.Type} size={28} />
                  </div>
                  <span className="font-medium leading-tight">{p.Name}</span>
                  {saved && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{saved.model}</Badge>
                  )}
                </button>
              )
            })}
          </div>

          {/* Config form */}
          {selectedType && (
            <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <ProviderIcon type={selectedType} size={18} />
                {presets.find((p) => p.Type === selectedType)?.Name || selectedType}
              </div>
              <div>
                <Label>{t('ai.apiKey')}</Label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t('ai.apiKeyPlaceholder')}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>{t('ai.model')}</Label>
                <Input value={modelName} onChange={(e) => setModelName(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label>{t('ai.baseUrl')}</Label>
                <Input
                  value={customBaseUrl}
                  onChange={(e) => setCustomBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  className="mt-1.5"
                />
              </div>
              <Button onClick={handleSaveAIProvider} disabled={!apiKey} size="sm">
                {t('ai.save')}
              </Button>
            </div>
          )}

          {/* Saved providers */}
          {providers.length > 0 && (
            <div className="space-y-2">
              {providers.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <ProviderIcon type={p.provider_type} size={20} />
                    <span className="text-sm font-medium">{p.name}</span>
                    <Badge variant="outline" className="text-xs">{p.model}</Badge>
                    {p.is_active && <Badge className="text-xs bg-green-600 hover:bg-green-700">{t('ai.active')}</Badge>}
                  </div>
                  <div className="flex gap-1">
                    {!p.is_active && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleActivateAI(p.id)}>
                        {t('ai.activate')}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleTestAI(p.id)} disabled={testingId === p.id}>
                      {testingId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : t('ai.testConnection')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* MCP Server */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cable className="h-5 w-5" />
            {t('settings.mcpTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('settings.mcpDesc')}</p>
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">{t('settings.mcpEndpoint')}</Label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 rounded bg-background px-3 py-2 text-sm font-mono border">
                  {window.location.origin}/api/mcp
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/api/mcp`)
                    setMcpCopied(true)
                    setTimeout(() => setMcpCopied(false), 2000)
                  }}
                >
                  {mcpCopied ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  <span className="ml-1">{mcpCopied ? t('settings.mcpCopied') : t('settings.mcpCopyEndpoint')}</span>
                </Button>
              </div>
            </div>
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-primary hover:underline">
                {t('settings.mcpHowToConnect')}
              </summary>
              <div className="mt-2 rounded-lg border bg-background p-3 text-xs text-muted-foreground space-y-2">
                <p>{t('settings.mcpHowToDesc')}</p>
                <pre className="rounded bg-muted p-2 overflow-x-auto">
{`# Example: Claude Code MCP config
# Add to .claude/settings.json:

{
  "mcpServers": {
    "cuddlegecko": {
      "url": "${window.location.origin}/api/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_JWT_TOKEN>",
        "X-Workspace-ID": "2"
      }
    }
  }
}`}
                </pre>
              </div>
            </details>
          </div>
        </CardContent>
      </Card>

      {/* Environment AI Config */}
      {envAI && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              {t('settings.aiEnvTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              {envAI.configured ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-600 dark:text-green-400">{t('settings.aiEnvConfigured')}</span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">{t('settings.aiEnvNotConfigured')}</span>
              )}
            </div>
            {envAI.configured && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
                {envAI.provider_type && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('settings.aiEnvProviderType')}</span>
                    <span>{envAI.provider_type}</span>
                  </div>
                )}
                {envAI.model && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('settings.aiEnvModel')}</span>
                    <span>{envAI.model}</span>
                  </div>
                )}
                {envAI.base_url && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('settings.aiEnvBaseUrl')}</span>
                    <span className="text-xs truncate max-w-[250px]">{envAI.base_url}</span>
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t('settings.aiEnvHint')}</p>
          </CardContent>
        </Card>
      )}

      {/* Graph Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            {t('settings.graphTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>{t('settings.nodeRadius')} ({nodeRadius}px)</Label>
            <input
              type="range"
              min={10}
              max={40}
              step={1}
              value={nodeRadius}
              onChange={(e) => setNodeRadius(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <div className="space-y-2">
            <Label>{t('settings.emojiSize')} ({emojiSize}px)</Label>
            <input
              type="range"
              min={12}
              max={48}
              step={1}
              value={emojiSize}
              onChange={(e) => setEmojiSize(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <label className="flex cursor-pointer select-none items-center justify-between gap-4">
            <span className="font-medium">{t('settings.showLabels')}</span>
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="size-4 rounded border-input accent-primary"
            />
          </label>
          <div className="space-y-2">
            <Label>{t('settings.linkDistance')} ({linkDistance})</Label>
            <input
              type="range"
              min={10}
              max={200}
              step={5}
              value={linkDistance}
              onChange={(e) => setLinkDistance(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <div className="space-y-2">
            <Label>{t('settings.chargeStrength')} ({chargeStrength})</Label>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={chargeStrength}
              onChange={(e) => setChargeStrength(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <Button variant="outline" size="sm" onClick={resetGraphSettings}>
            {t('settings.resetDefaults')}
          </Button>
        </CardContent>
      </Card>

      {/* Sidebar Navigation */}
      {(
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GripVertical className="h-5 w-5" />
              {t('settings.navTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('settings.navHint')}</p>
            <div className="space-y-1">
              {orderedNavItems.map((item, idx) => {
                const Icon = item.icon
                const visible = !navHidden.includes(item.to)
                return (
                  <div
                    key={item.to}
                    draggable
                    onDragStart={() => setDragIndex(idx)}
                    onDragOver={(e) => { e.preventDefault() }}
                    onDrop={() => void handleNavDrop(idx)}
                    className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 transition-colors cursor-grab hover:bg-muted/40 active:cursor-grabbing"
                  >
                    <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className={`flex-1 text-sm ${visible ? '' : 'text-muted-foreground/50 line-through'}`}>{t(item.label)}</span>
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => void toggleNavVisible(item.to)}
                      className="size-4 rounded border-input accent-primary"
                      aria-label={t(item.label)}
                    />
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* About */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>{t('settings.about')}</CardTitle>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={handleCheckUpdate} disabled={update.status === 'checking'}>
              {update.status === 'checking' ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              {t('settings.checkUpdate')}
            </Button>
            {update.status === 'latest' && (
              <span className="text-xs text-muted-foreground">{t('settings.updateLatest')}</span>
            )}
            {update.status === 'available' && update.url && (
              <a href={update.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                {t('settings.updateAvailable', { version: update.latest })} →
              </a>
            )}
            {update.status === 'error' && (
              <span className="text-xs text-destructive">{t('settings.updateError')}</span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex justify-between">
              <span>{t('settings.version')}</span>
              <span>v{APP_VERSION}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t('settings.author')}</span>
              <a
                href="https://github.com/din4e"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-foreground transition-colors hover:text-primary"
              >
                <ExternalLink className="size-3.5" />
                din4e
              </a>
            </div>
            <div className="flex items-center justify-between">
              <span>{t('settings.repository')}</span>
              <a
                href="https://github.com/din4e/CuddleGecko"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-foreground transition-colors hover:text-primary"
              >
                <ExternalLink className="size-3.5" />
                GitHub
              </a>
            </div>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-2 self-center sm:self-start">
              <img src="/wechat-qr.jpg" alt={t('settings.wechatQr')} className="size-32 rounded-lg border bg-white object-contain p-1.5" />
              <span className="text-xs">{t('settings.wechatQr')}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
