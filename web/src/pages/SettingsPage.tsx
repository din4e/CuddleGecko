import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useModeStore } from '../stores/mode'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { setBaseURL } from '../api/client'
import { Download, Upload, Monitor, Globe, Network, Bot, CheckCircle, Loader2, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { useGraphSettings } from '../stores/graphSettings'
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

export default function SettingsPage() {
  const { t } = useTranslation()
  const mode = useModeStore((s) => s.mode)
  const remoteUrl = useModeStore((s) => s.remoteUrl)
  const adapters = useModeStore((s) => s.adapters)
  const setMode = useModeStore((s) => s.setMode)
  const setRemoteUrl = useModeStore((s) => s.setRemoteUrl)
  const [urlInput, setUrlInput] = useState(remoteUrl)
  const isWails = typeof window !== 'undefined' && !!(window as any).__WAILS__
  const nodeRadius = useGraphSettings((s) => s.nodeRadius)
  const emojiSize = useGraphSettings((s) => s.emojiSize)
  const setNodeRadius = useGraphSettings((s) => s.setNodeRadius)
  const setEmojiSize = useGraphSettings((s) => s.setEmojiSize)
  const resetGraphSettings = useGraphSettings((s) => s.reset)

  // Desktop info
  const [desktopVersion, setDesktopVersion] = useState('')
  const [desktopPlatform, setDesktopPlatform] = useState('')
  const [desktopDataDir, setDesktopDataDir] = useState('')
  const [desktopDbPath, setDesktopDbPath] = useState('')

  // AI provider state
  const [presets, setPresets] = useState<AIProviderPreset[]>([])
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [selectedType, setSelectedType] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [modelName, setModelName] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [testingId, setTestingId] = useState<number | null>(null)

  const loadAIProviders = useCallback(async () => {
    if (!adapters?.ai) return
    try {
      const [p, prov] = await Promise.all([adapters.ai.listPresets(), adapters.ai.listProviders()])
      setPresets(p || [])
      setProviders(prov || [])
    } catch {}
  }, [adapters?.ai])

  useEffect(() => {
    loadAIProviders()
  }, [loadAIProviders])

  // Load desktop info
  useEffect(() => {
    if (!adapters?.desktop) return
    adapters.desktop.version().then(v => setDesktopVersion(v))
    adapters.desktop.platform().then(p => setDesktopPlatform(p))
    adapters.desktop.dataDir().then(d => setDesktopDataDir(d))
    adapters.desktop.databasePath().then(d => setDesktopDbPath(d))
  }, [adapters?.desktop])

  const handleModeChange = (newMode: 'local' | 'remote') => {
    setMode(newMode)
    if (newMode === 'remote') {
      setBaseURL(remoteUrl)
    }
  }

  const handleSaveUrl = () => {
    const url = urlInput.replace(/\/+$/, '')
    setRemoteUrl(url)
    setBaseURL(url)
    toast.success(t('settings.saveUrl'))
  }

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

  const handleSaveAIProvider = async () => {
    if (!adapters?.ai || !selectedType || !apiKey) return
    try {
      await adapters.ai.saveProvider({ provider_type: selectedType, api_key: apiKey, model: modelName, base_url: customBaseUrl })
      toast.success(t('ai.save'))
      setApiKey('')
      loadAIProviders()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save provider')
    }
  }

  const handleActivateAI = async (id: number) => {
    if (!adapters?.ai) return
    try {
      await adapters.ai.activateProvider(id)
      loadAIProviders()
    } catch {}
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

      {/* Connection Mode */}
      {isWails && (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.connectionMode')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => handleModeChange('local')}
                className={`flex flex-col items-start gap-1 rounded-lg border-2 p-4 text-left transition-colors ${
                  mode === 'local'
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/30'
                }`}
              >
                <div className="flex items-center gap-2 font-medium">
                  <Monitor className="h-4 w-4" />
                  {t('settings.localMode')}
                </div>
                <p className="text-sm text-muted-foreground">{t('settings.localModeDesc')}</p>
              </button>
              <button
                onClick={() => handleModeChange('remote')}
                className={`flex flex-col items-start gap-1 rounded-lg border-2 p-4 text-left transition-colors ${
                  mode === 'remote'
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/30'
                }`}
              >
                <div className="flex items-center gap-2 font-medium">
                  <Globe className="h-4 w-4" />
                  {t('settings.remoteMode')}
                </div>
                <p className="text-sm text-muted-foreground">{t('settings.remoteModeDesc')}</p>
              </button>
            </div>

            {mode === 'remote' && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>{t('settings.serverUrl')}</Label>
                  <Input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="http://localhost:8080"
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={handleSaveUrl} size="sm">{t('settings.saveUrl')}</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
        </CardContent>
      </Card>

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
          <Button variant="outline" size="sm" onClick={resetGraphSettings}>
            {t('settings.resetDefaults')}
          </Button>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.about')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex justify-between">
              <span>{t('settings.version')}</span>
              <span>v{desktopVersion || '0.1.0'}</span>
            </div>
            {isWails && mode === 'local' && desktopPlatform && (
              <div className="flex justify-between">
                <span>Platform</span>
                <span className="text-xs">{desktopPlatform}</span>
              </div>
            )}
            {isWails && mode === 'local' && desktopDataDir && (
              <div className="flex items-center justify-between gap-4">
                <span>{t('settings.dataPath')}</span>
                <span className="max-w-[200px] truncate text-xs" title={desktopDataDir}>{desktopDataDir}</span>
              </div>
            )}
            {isWails && mode === 'local' && desktopDbPath && (
              <div className="flex items-center justify-between gap-4">
                <span>Database</span>
                <span className="max-w-[200px] truncate text-xs" title={desktopDbPath}>{desktopDbPath}</span>
              </div>
            )}
            {isWails && mode === 'local' && adapters?.desktop && (
              <div className="pt-2">
                <Button variant="outline" size="sm" onClick={() => adapters.desktop?.openDataDir()}>
                  Open Data Folder
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
