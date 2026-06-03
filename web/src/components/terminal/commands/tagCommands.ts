import type { AppAdapters } from '@/api/adapter'
import { formatTable, formatSuccess, formatError } from '../formatters'

export async function executeListTags(adapters: AppAdapters): Promise<string> {
  try {
    const tags = await adapters.tag.list()
    if (tags.length === 0) return formatError('No tags found')

    const rows = tags.map((t) => ({
      ID: t.id,
      Name: t.name,
      Color: t.color || '-',
    }))
    return formatTable(rows)
  } catch (e: any) {
    return formatError(`Failed to list tags: ${e.message}`)
  }
}

export async function executeCreateTag(
  args: Record<string, any>,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const name = args.name as string
    if (!name) return formatError('--name is required')

    const color = (args.color as string) || '#6366f1'
    const tag = await adapters.tag.create({ name, color })
    return formatSuccess(`Created tag (ID: ${tag.id})`)
  } catch (e: any) {
    return formatError(`Failed to create tag: ${e.message}`)
  }
}

export async function executeUpdateTag(
  args: Record<string, any>,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: update tag <id>')

    const name = (args.name as string) || 'unnamed'
    const color = (args.color as string) || '#6366f1'

    await adapters.tag.update(id, { name, color })
    return formatSuccess('Tag updated successfully')
  } catch (e: any) {
    return formatError(`Failed to update tag: ${e.message}`)
  }
}

export async function executeDeleteTag(
  args: Record<string, any>,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: delete tag <id>')

    await adapters.tag.delete(id)
    return formatSuccess('Tag deleted successfully')
  } catch (e: any) {
    return formatError(`Failed to delete tag: ${e.message}`)
  }
}
