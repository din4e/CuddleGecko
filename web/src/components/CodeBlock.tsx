import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy } from 'lucide-react'

/**
 * CodeBlock wraps markdown <pre> content with a header bar (language label
 * when detectable + copy button). Keeps the raw pre styling from Markdown.tsx
 * while making code answers actionable.
 */
export function CodeBlock({ children }: { children?: ReactNode }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const onCopy = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Walk up from the button to the wrapping pre and grab its text content.
    const pre = e.currentTarget.closest('pre')
    const text = pre?.textContent ?? ''
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="group/code relative my-2">
      <pre className="overflow-x-auto rounded-lg border border-border bg-background/50 p-3 pr-12 text-xs">{children}</pre>
      <button
        type="button"
        onClick={onCopy}
        aria-label={t('common.copy')}
        title={t('common.copy')}
        className="absolute right-2 top-2 rounded-md border border-border bg-background/80 p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/code:opacity-100"
      >
        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  )
}
