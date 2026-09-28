import { formatMoney } from '../lib/utils'
import type { Transaction } from '../types'

// Category chip colors, mirroring finance-web's AnnualCard: 我的 → brand green
// family, 爸妈 → amber family (money-from-parents), unknown → muted. Matches
// the income-circle palette already used across the finance page.
const categoryChipClass: Record<string, string> = {
  我的: 'bg-green-100 text-green-600 dark:bg-green-950',
  爸妈: 'bg-amber-100 text-amber-600 dark:bg-amber-950',
}

function chipClass(category: string): string {
  return categoryChipClass[category] ?? 'bg-muted text-muted-foreground'
}

/** Compact one-line transaction record shared by AnnualView / MonthDetailView. */
export function TxRow({ tx }: { tx: Transaction }) {
  return (
    <div className="flex items-center gap-2 py-1.5" title={tx.category ? `${tx.category} · ¥${formatMoney(tx.amount)}` : `¥${formatMoney(tx.amount)}`}>
      {tx.category && (
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] leading-none ${chipClass(tx.category)}`}>{tx.category}</span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm">{tx.title}</span>
      <span className={`shrink-0 text-sm font-semibold tabular-nums ${tx.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
        {tx.type === 'income' ? '+' : '-'}¥{formatMoney(tx.amount)}
      </span>
    </div>
  )
}

export default TxRow
