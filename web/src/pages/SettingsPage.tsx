import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useModeStore } from '../stores/mode'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { setBaseURL } from '../api/client'
import { Download, Upload, Monitor, Globe, Network } from 'lucide-react'
import { toast } from 'sonner'
import { useGraphSettings } from '../stores/graphSettings'

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

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold">{t('settings.title')}</h2>

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
              <span>v0.1.0</span>
            </div>
            {isWails && mode === 'local' && (
              <div className="flex justify-between">
                <span>{t('settings.dataPath')}</span>
                <span className="text-xs">~/CuddleGecko/</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
