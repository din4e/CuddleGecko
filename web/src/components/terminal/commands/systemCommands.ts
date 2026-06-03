import type { AppAdapters } from '@/api/adapter'
import { commands } from '../CommandRegistry'
import { formatTable, formatSuccess, formatError } from '../formatters'

const BOLD = '\x1b[1m'
const CYAN = '\x1b[36m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

export async function executeHelp(
  args: Record<string, any>,
  _adapters: AppAdapters,
  t: (key: string) => string,
): Promise<string> {
  const commandName = args._pos0 || args.command
  if (commandName) {
    const cmd = commands.find(
      (c) => c.name === commandName || c.aliases.includes(commandName),
    )
    if (!cmd) return formatError(`Command not found: ${commandName}`)

    const lines = [
      `${BOLD}${cmd.name}${RESET}`,
      `  ${cmd.description}`,
      '',
      `${YELLOW}Usage:${RESET} ${cmd.usage}`,
    ]
    if (cmd.aliases.length > 0) {
      lines.push(`${YELLOW}Aliases:${RESET} ${cmd.aliases.join(', ')}`)
    }
    if (cmd.args.length > 0) {
      lines.push(`${YELLOW}Arguments:${RESET}`)
      for (const arg of cmd.args) {
        const flag = arg.flag ? `${arg.flag} ` : ''
        const req = arg.required ? '(required)' : '(optional)'
        lines.push(`  ${flag}<${arg.name}> ${req} - ${arg.description}`)
      }
    }
    return lines.join('\r\n')
  }

  const categories = new Map<string, typeof commands>()
  for (const cmd of commands) {
    const list = categories.get(cmd.category) || []
    list.push(cmd)
    categories.set(cmd.category, list)
  }

  const categoryOrder = [
    'system',
    'buddies',
    'events',
    'todos',
    'tags',
    'transactions',
    'interactions',
    'reminders',
    'graph',
    'ai',
    'workspace',
  ]

  const lines = [`${BOLD}${t('terminal.helpHeader')}${RESET}`, '']
  for (const cat of categoryOrder) {
    const cmds = categories.get(cat)
    if (!cmds) continue
    lines.push(`${CYAN}${BOLD}${cat.charAt(0).toUpperCase() + cat.slice(1)}:${RESET}`)
    for (const cmd of cmds) {
      lines.push(`  ${cmd.name.padEnd(24)} ${cmd.description}`)
    }
    lines.push('')
  }
  return lines.join('\r\n')
}

export function executeClear(): string {
  return '__CLEAR__'
}

export function executeHistory(history: string[]): string {
  if (history.length === 0) return `${YELLOW}No command history${RESET}`
  return history.map((cmd, i) => `  ${String(i + 1).padStart(4)}  ${cmd}`).join('\r\n')
}

export function executeOpen(args: Record<string, any>): { navigate: string } | string {
  const page = args._pos0 || args.page
  if (!page) return formatError('Usage: open <page> | open buddy <id>')

  // Resource-specific routes: open buddy 1203 → /buddies/1203
  const resourceMap: Record<string, string> = {
    buddy: '/buddies',
    contact: '/buddies',
    event: '/events',
    todo: '/todos',
    tag: '/tags',
    transaction: '/finance',
  }

  const resourceRoute = resourceMap[page.toLowerCase()]
  if (resourceRoute && args._pos1) {
    return { navigate: `${resourceRoute}/${args._pos1}` }
  }

  const pageMap: Record<string, string> = {
    '/': '/',
    home: '/',
    dashboard: '/',
    buddies: '/buddies',
    contacts: '/buddies',
    graph: '/graph',
    network: '/graph',
    events: '/events',
    todos: '/todos',
    finance: '/finance',
    tags: '/tags',
    reminders: '/reminders',
    ai: '/ai',
    settings: '/settings',
    terminal: '/terminal',
  }

  const path = pageMap[page.toLowerCase()] || (page.startsWith('/') ? page : `/${page}`)
  return { navigate: path }
}

export async function executeExport(adapters: AppAdapters): Promise<string> {
  try {
    const data = await adapters.export.exportJSON()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cuddlegecko-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    return formatSuccess('Data exported successfully')
  } catch (e: any) {
    return formatError(`Export failed: ${e.message}`)
  }
}
