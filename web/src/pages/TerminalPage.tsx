import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import TerminalEmulator from '../components/terminal/TerminalEmulator'
import { Terminal } from 'lucide-react'

export default function TerminalPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const handleNavigate = useCallback(
    (path: string) => {
      navigate(path)
    },
    [navigate],
  )

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Terminal className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">{t('terminal.title')}</h1>
      </div>
      <div className="flex-1 min-h-0 rounded-lg border border-border overflow-hidden bg-card">
        <TerminalEmulator onNavigate={handleNavigate} />
      </div>
    </div>
  )
}
