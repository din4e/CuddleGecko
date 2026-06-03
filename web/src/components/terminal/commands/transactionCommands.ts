import type { AppAdapters } from '@/api/adapter'
import { formatTable, formatDetail, formatSuccess, formatError } from '../formatters'

const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

export async function executeListTransactions(
  args: Record<string, any>,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const page = Number(args.page) || 1
    const pageSize = Number(args.pageSize) || 20
    const type = (args.type as string) || undefined

    const result = await adapters.transaction.list({ page, page_size: pageSize, type })

    if (result.items.length === 0) return formatError('No transactions found')

    const rows = result.items.map((t) => ({
      ID: t.id,
      Title: t.title,
      Amount: `${t.type === 'expense' ? '-' : '+'}${t.amount}`,
      Type: t.type,
      Category: t.category || '-',
      Date: t.date,
    }))

    const table = formatTable(rows)
    return `${table}\r\n\r\nTotal: ${result.total} (Page ${result.page}/${Math.ceil(result.total / result.page_size)})`
  } catch (e: any) {
    return formatError(`Failed to list transactions: ${e.message}`)
  }
}

export async function executeSummary(adapters: AppAdapters): Promise<string> {
  try {
    const summary = await adapters.transaction.summary()
    return [
      `${BOLD}Transaction Summary${RESET}`,
      '',
      `  ${GREEN}Income:${RESET}  ${summary.income.toFixed(2)}`,
      `  ${RED}Expense:${RESET} ${summary.expense.toFixed(2)}`,
      `  ${CYAN}Balance:${RESET} ${summary.balance.toFixed(2)}`,
    ].join('\r\n')
  } catch (e: any) {
    return formatError(`Failed to get summary: ${e.message}`)
  }
}

export async function executeCreateTransaction(
  args: Record<string, any>,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const title = args.title as string
    const amount = Number(args.amount)
    const type = args.type as string

    if (!title || isNaN(amount) || !type) return formatError('--title, --amount, and --type are required')
    if (type !== 'income' && type !== 'expense') return formatError('--type must be income or expense')

    const data: Record<string, any> = { title, amount, type }
    if (args.category) data.category = args.category
    if (args.date) data.date = args.date
    if (args.notes) data.notes = args.notes

    const tx = await adapters.transaction.create(data)
    return formatSuccess(`Created transaction (ID: ${tx.id})`)
  } catch (e: any) {
    return formatError(`Failed to create transaction: ${e.message}`)
  }
}

export async function executeUpdateTransaction(
  args: Record<string, any>,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: update transaction <id>')

    const data: Record<string, any> = {}
    if (args.title) data.title = args.title
    if (args.amount !== undefined) data.amount = Number(args.amount)
    if (args.type) data.type = args.type
    if (args.category) data.category = args.category

    if (Object.keys(data).length === 0) return formatError('No fields to update.')

    await adapters.transaction.update(id, data)
    return formatSuccess('Transaction updated successfully')
  } catch (e: any) {
    return formatError(`Failed to update transaction: ${e.message}`)
  }
}

export async function executeDeleteTransaction(
  args: Record<string, any>,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: delete transaction <id>')

    await adapters.transaction.delete(id)
    return formatSuccess('Transaction deleted successfully')
  } catch (e: any) {
    return formatError(`Failed to delete transaction: ${e.message}`)
  }
}
