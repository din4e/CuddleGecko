import type { AppAdapters } from '@/api/adapter'
import { formatTable, formatSuccess, formatError } from '../formatters'

export async function executeListReminders(
  args: Record<string, any>,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const status = (args.status as string) || undefined
    const reminders = await adapters.reminder.list(status)

    if (reminders.length === 0) return formatError('No reminders found')

    const rows = reminders.map((r) => ({
      ID: r.id,
      Title: r.title,
      Status: r.status,
      Time: r.remind_at,
      Contact: r.contact_id,
    }))

    return formatTable(rows)
  } catch (e: any) {
    return formatError(`Failed to list reminders: ${e.message}`)
  }
}

export async function executeCreateReminder(
  args: Record<string, any>,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const buddy = Number(args.buddy)
    const title = args.title as string
    const time = args.time as string

    if (!buddy || !title || !time) return formatError('--buddy, --title, and --time are required')

    const data: Record<string, any> = { title, remind_at: time }
    if (args.description) data.description = args.description

    const reminder = await adapters.reminder.create(buddy, data)
    return formatSuccess(`Created reminder (ID: ${reminder.id})`)
  } catch (e: any) {
    return formatError(`Failed to create reminder: ${e.message}`)
  }
}

export async function executeUpdateReminder(
  args: Record<string, any>,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: update reminder <id>')

    const data: Record<string, any> = {}
    if (args.title) data.title = args.title
    if (args.time) data.remind_at = args.time
    if (args.description) data.description = args.description
    if (args.status) data.status = args.status

    if (Object.keys(data).length === 0) return formatError('No fields to update.')

    await adapters.reminder.update(id, data)
    return formatSuccess('Reminder updated successfully')
  } catch (e: any) {
    return formatError(`Failed to update reminder: ${e.message}`)
  }
}

export async function executeDeleteReminder(
  args: Record<string, any>,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: delete reminder <id>')

    await adapters.reminder.delete(id)
    return formatSuccess('Reminder deleted successfully')
  } catch (e: any) {
    return formatError(`Failed to delete reminder: ${e.message}`)
  }
}
