import type { AppAdapters } from '@/api/adapter'
import { formatTable, formatDetail, formatSuccess, formatError } from '../formatters'

export async function executeListEvents(
  args: Record<string, any>,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const page = Number(args.page) || 1
    const pageSize = Number(args.pageSize) || 20

    const result = await adapters.event.list({ page, page_size: pageSize })

    if (result.items.length === 0) return formatError('No events found')

    const rows = result.items.map((e) => ({
      ID: e.id,
      Title: e.title,
      Start: e.start_time,
      End: e.end_time || '-',
      Location: e.location || '-',
    }))

    const table = formatTable(rows)
    return `${table}\r\n\r\nTotal: ${result.total} (Page ${result.page}/${Math.ceil(result.total / result.page_size)})`
  } catch (e: any) {
    return formatError(`Failed to list events: ${e.message}`)
  }
}

export async function executeCreateEvent(
  args: Record<string, any>,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const title = args.title as string
    const start = args.start as string
    if (!title || !start) return formatError('--title and --start are required')

    const data: Record<string, any> = { title, start_time: start }
    if (args.end) data.end_time = args.end
    if (args.location) data.location = args.location
    if (args.description) data.description = args.description
    if (args.color) data.color = args.color

    const event = await adapters.event.create(data)
    return formatSuccess(`Created event (ID: ${event.id})`)
  } catch (e: any) {
    return formatError(`Failed to create event: ${e.message}`)
  }
}

export async function executeUpdateEvent(
  args: Record<string, any>,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: update event <id>')

    const data: Record<string, any> = {}
    if (args.title) data.title = args.title
    if (args.start) data.start_time = args.start
    if (args.end) data.end_time = args.end
    if (args.location) data.location = args.location
    if (args.description) data.description = args.description

    if (Object.keys(data).length === 0) return formatError('No fields to update.')

    await adapters.event.update(id, data)
    return formatSuccess('Event updated successfully')
  } catch (e: any) {
    return formatError(`Failed to update event: ${e.message}`)
  }
}

export async function executeDeleteEvent(
  args: Record<string, any>,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: delete event <id>')

    await adapters.event.delete(id)
    return formatSuccess('Event deleted successfully')
  } catch (e: any) {
    return formatError(`Failed to delete event: ${e.message}`)
  }
}
