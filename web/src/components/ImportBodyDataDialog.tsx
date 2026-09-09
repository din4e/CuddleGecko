import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { useImportBodyMetrics } from '../hooks/api/useBodyMetrics'
import type { BodyMetricImportRecord } from '../types'

const SOURCES = ['garmin', 'apple', 'whoop', 'other']

const EXAMPLE = `{
  "records": [
    {
      "date": "2026-09-08",
      "bedtime": "2026-09-07T23:10:00+08:00",
      "wake_time": "2026-09-08T07:20:00+08:00",
      "sleep_hours": 8.2,
      "score_100": 86,
      "steps": 8500,
      "resting_hr": 52
    }
  ]
}`

/**
 * ImportBodyDataDialog pastes an external-platform export (Garmin Connect,
 * Apple Health, …) as JSON and posts it to the idempotent body-metric import
 * endpoint. Re-importing the same data skips existing records.
 */
export function ImportBodyDataDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const importMetrics = useImportBodyMetrics()
  const [source, setSource] = useState('garmin')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null)

  const cls = 'h-9 w-full rounded-md border bg-background px-2 text-sm'

  const handleImport = async () => {
    setError('')
    setResult(null)
    let records: BodyMetricImportRecord[]
    try {
      const parsed = JSON.parse(text)
      const arr = Array.isArray(parsed) ? parsed : parsed?.records
      if (!Array.isArray(arr) || arr.length === 0) {
        setError(t('fitness.importDataInvalid'))
        return
      }
      records = arr
    } catch {
      setError(t('fitness.importDataInvalid'))
      return
    }
    try {
      const res = await importMetrics.mutateAsync({ source, records })
      setResult(res.data)
      setText('')
    } catch {
      // mutation-level errors surface via the global toast
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('fitness.importDataTitle')}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t('fitness.importDataHint')}</p>
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="import-source">{t('fitness.importDataSource')}</label>
          <select id="import-source" className={cls} value={source} onChange={(e) => setSource(e.target.value)}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>{t(`fitness.importSource_${s}`)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="import-json">JSON</label>
          <Textarea
            id="import-json"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="font-mono text-xs"
            placeholder={EXAMPLE}
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        {result && (
          <p className="text-sm text-green-600 dark:text-green-400">
            {t('fitness.importDataDone', { created: result.created, skipped: result.skipped })}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.close')}</Button>
          <Button onClick={handleImport} disabled={importMetrics.isPending || text.trim() === ''}>
            {importMetrics.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {t('fitness.importDataSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
