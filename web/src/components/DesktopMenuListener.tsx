import { useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useModeStore } from '@/stores/mode'
import { toast } from 'sonner'

export default function DesktopMenuListener() {
  const navigate = useNavigate()
  const adapters = useModeStore((s) => s.adapters)
  const isWails = typeof window !== 'undefined' && !!(window as any).__WAILS__

  const handleExport = useCallback(async () => {
    if (!adapters?.export) return
    try {
      const json = await adapters.export.exportJSON()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cuddlegecko-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Export failed')
    }
  }, [adapters?.export])

  const handleImport = useCallback(async () => {
    if (!adapters?.export) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        await adapters.export!.importJSON(text)
        toast.success('Import successful')
      } catch {
        toast.error('Import failed')
      }
    }
    input.click()
  }, [adapters?.export])

  useEffect(() => {
    if (!isWails) return

    let offFns: (() => void)[] = []

    ;(async () => {
      const { EventsOn } = await import('@/wailsjs/runtime/runtime')

      offFns.push(
        EventsOn('menu:export', handleExport),
        EventsOn('menu:import', handleImport),
        EventsOn('menu:settings', () => navigate('/settings')),
        EventsOn('menu:about', () => navigate('/settings')),
      )
    })()

    return () => offFns.forEach((fn) => fn())
  }, [isWails, handleExport, handleImport, navigate])

  return null
}
