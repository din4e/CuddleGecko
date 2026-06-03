import type { AppAdapters } from '@/api/adapter'
import { formatTable, formatSuccess, formatError } from '../formatters'

export async function executeListWorkspaces(adapters: AppAdapters): Promise<string> {
  try {
    const workspaces = await adapters.workspace.list()
    if (workspaces.length === 0) return formatError('No workspaces found')

    const rows = workspaces.map((w) => ({
      ID: w.id,
      Name: w.name,
      Icon: w.icon || '-',
      Description: w.description || '-',
    }))
    return formatTable(rows)
  } catch (e: any) {
    return formatError(`Failed to list workspaces: ${e.message}`)
  }
}

export async function executeSwitchWorkspace(
  args: Record<string, any>,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: switch workspace <id>')

    const ws = await adapters.workspace.switch(id)
    return formatSuccess(`Switched to workspace: ${ws.name}`)
  } catch (e: any) {
    return formatError(`Failed to switch workspace: ${e.message}`)
  }
}
