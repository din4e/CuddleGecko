import type { AppAdapters } from '@/api/adapter'
import { formatTable, formatSuccess, formatError } from '../formatters'
import type { CommandArgs } from '../types'
import { getErrorMessage } from '../types'

export async function executeListReminders(
  args: CommandArgs,
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
  } catch (e: unknown) {
    return formatError(`Failed to list reminders: ${getErrorMessage(e)}`)
  }
}

export async function executeCreateReminder(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const buddy = Number(args.buddy)
    const title = args.title as string
    const time = args.time as string

    if (!buddy || !title || !time) return formatError('--buddy, --title, and --time are required')

    const data: Record<string, unknown> = { title, remind_at: time }
    if (args.description) data.description = args.description

    const reminder = await adapters.reminder.create(buddy, data)
    return formatSuccess(`Created reminder (ID: ${reminder.id})`)
  } catch (e: unknown) {
    return formatError(`Failed to create reminder: ${getErrorMessage(e)}`)
  }
}

export async function executeUpdateReminder(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: update reminder <id>')

    const data: Record<string, unknown> = {}
    if (args.title) data.title = args.title
    if (args.time) data.remind_at = args.time
    if (args.description) data.description = args.description
    if (args.status) data.status = args.status

    if (Object.keys(data).length === 0) return formatError('No fields to update.')

    await adapters.reminder.update(id, data)
    return formatSuccess('Reminder updated successfully')
  } catch (e: unknown) {
    return formatError(`Failed to update reminder: ${getErrorMessage(e)}`)
  }
}

export async function executeDeleteReminder(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: delete reminder <id>')

    await adapters.reminder.delete(id)
    return formatSuccess('Reminder deleted successfully')
  } catch (e: unknown) {
    return formatError(`Failed to delete reminder: ${getErrorMessage(e)}`)
  }
}
