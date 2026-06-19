import type { AppAdapters } from '@/api/adapter'
import { formatTable, formatSuccess, formatError } from '../formatters'
import type { CommandArgs } from '../types'
import { getErrorMessage } from '../types'

export async function executeListInteractions(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const buddy = Number(args.buddy)
    if (!buddy) return formatError('--buddy <id> is required')

    const page = Number(args.page) || 1
    const pageSize = Number(args.pageSize) || 20

    const result = await adapters.interaction.listByContact(buddy, page, pageSize)

    if (result.items.length === 0) return formatError('No interactions found')

    const rows = result.items.map((i) => ({
      ID: i.id,
      Title: i.title,
      Type: i.type,
      Occurred: i.occurred_at,
    }))

    const table = formatTable(rows)
    return `${table}\r\n\r\nTotal: ${result.total}`
  } catch (e: unknown) {
    return formatError(`Failed to list interactions: ${getErrorMessage(e)}`)
  }
}

export async function executeCreateInteraction(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const buddy = Number(args.buddy)
    const title = args.title as string
    const type = args.type as string

    if (!buddy || !title || !type) return formatError('--buddy, --title, and --type are required')

    const data: Record<string, unknown> = { title, type }
    if (args.content) data.content = args.content
    if (args.occurred) data.occurred_at = args.occurred

    const interaction = await adapters.interaction.create(buddy, data)
    return formatSuccess(`Created interaction (ID: ${interaction.id})`)
  } catch (e: unknown) {
    return formatError(`Failed to create interaction: ${getErrorMessage(e)}`)
  }
}

export async function executeUpdateInteraction(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: update interaction <id>')

    const data: Record<string, unknown> = {}
    if (args.title) data.title = args.title
    if (args.type) data.type = args.type
    if (args.content) data.content = args.content

    if (Object.keys(data).length === 0) return formatError('No fields to update.')

    await adapters.interaction.update(id, data)
    return formatSuccess('Interaction updated successfully')
  } catch (e: unknown) {
    return formatError(`Failed to update interaction: ${getErrorMessage(e)}`)
  }
}

export async function executeDeleteInteraction(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: delete interaction <id>')

    await adapters.interaction.delete(id)
    return formatSuccess('Interaction deleted successfully')
  } catch (e: unknown) {
    return formatError(`Failed to delete interaction: ${getErrorMessage(e)}`)
  }
}
