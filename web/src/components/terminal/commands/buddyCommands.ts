import type { AppAdapters } from '@/api/adapter'
import { nextBirthday, lunarFullText } from '@/lib/lunar'
import { formatTable, formatDetail, formatSuccess, formatError } from '../formatters'
import type { CommandArgs } from '../types'
import { getErrorMessage } from '../types'

export async function executeListBuddies(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const page = Number(args.page) || 1
    const pageSize = Number(args.pageSize) || 20
    const search = args.search as string | undefined
    const tagIdsStr = args.tagIds as string | undefined
    const tagIds = tagIdsStr
      ? tagIdsStr.split(',').map(Number).filter((n) => !isNaN(n))
      : undefined

    const result = await adapters.contact.list({
      page,
      page_size: pageSize,
      search,
      tag_ids: tagIds,
    })

    if (result.items.length === 0) return formatError('No buddies found')

    const rows = result.items.map((c) => ({
      ID: c.id,
      Name: c.name,
      Labels: (c.relationship_labels || []).join(', ') || '-',
      Tags: (c.tags || []).map((t) => t.name).join(', ') || '-',
    }))

    const table = formatTable(rows)
    return `${table}\r\n\r\nTotal: ${result.total} (Page ${result.page}/${Math.ceil(result.total / result.page_size)})`
  } catch (e: unknown) {
    return formatError(`Failed to list buddies: ${getErrorMessage(e)}`)
  }
}

export async function executeGetBuddy(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: get buddy <id>')

    const contact = await adapters.contact.getByID(id)
    return formatDetail({
      ID: contact.id,
      Name: contact.name,
      Nickname: contact.nickname || '-',
      Birthday: contact.birthday
        ? (contact.birthday_calendar === 'lunar'
            ? `Lunar ${lunarFullText(contact.birthday)}${nextBirthday(contact.birthday, 'lunar') ? ` (next: ${nextBirthday(contact.birthday, 'lunar')!.date.toLocaleDateString()})` : ''}`
            : contact.birthday)
        : '-',
      Phones: (contact.phones || []).join(', ') || '-',
      Emails: (contact.emails || []).join(', ') || '-',
      Labels: (contact.relationship_labels || []).join(', ') || '-',
      Tags: (contact.tags || []).map((t) => t.name).join(', ') || '-',
      Notes: contact.notes || '-',
      Created: contact.created_at,
      Updated: contact.updated_at,
    })
  } catch (e: unknown) {
    return formatError(`Failed to get buddy: ${getErrorMessage(e)}`)
  }
}

export async function executeCreateBuddy(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const name = args.name as string
    if (!name) return formatError('--name is required')

    const data: Record<string, unknown> = { name }
    if (args.nickname) data.nickname = args.nickname
    if (args.birthday) data.birthday = args.birthday
    if (args.calendar) data.birthday_calendar = args.calendar === 'lunar' ? 'lunar' : 'solar'
    if (args.notes) data.notes = args.notes
    if (args.phones) data.phones = (args.phones as string).split(',')
    if (args.emails) data.emails = (args.emails as string).split(',')
    if (args.labels) data.relationship_labels = (args.labels as string).split(',')

    const contact = await adapters.contact.create(data)
    return formatSuccess(`Created buddy (ID: ${contact.id})`)
  } catch (e: unknown) {
    return formatError(`Failed to create buddy: ${getErrorMessage(e)}`)
  }
}

export async function executeUpdateBuddy(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: update buddy <id>')

    const data: Record<string, unknown> = {}
    if (args.name) data.name = args.name
    if (args.nickname) data.nickname = args.nickname
    if (args.birthday) data.birthday = args.birthday
    if (args.calendar) data.birthday_calendar = args.calendar === 'lunar' ? 'lunar' : 'solar'
    if (args.notes) data.notes = args.notes
    if (args.phones) data.phones = (args.phones as string).split(',')
    if (args.emails) data.emails = (args.emails as string).split(',')
    if (args.labels) data.relationship_labels = (args.labels as string).split(',')

    if (Object.keys(data).length === 0) return formatError('No fields to update. Provide at least one flag.')

    await adapters.contact.update(id, data)
    return formatSuccess('Buddy updated successfully')
  } catch (e: unknown) {
    return formatError(`Failed to update buddy: ${getErrorMessage(e)}`)
  }
}

export async function executeDeleteBuddy(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: delete buddy <id>')

    await adapters.contact.delete(id)
    return formatSuccess('Buddy deleted successfully')
  } catch (e: unknown) {
    return formatError(`Failed to delete buddy: ${getErrorMessage(e)}`)
  }
}

export async function executeTagBuddy(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: tag buddy <id> --tag-ids <id1,id2>')
    const tagIdsStr = args.tagIds as string
    if (!tagIdsStr) return formatError('--tag-ids is required')

    const tagIds = tagIdsStr.split(',').map(Number).filter((n) => !isNaN(n))
    await adapters.contact.replaceTags(id, tagIds)
    return formatSuccess('Tags updated successfully')
  } catch (e: unknown) {
    return formatError(`Failed to tag buddy: ${getErrorMessage(e)}`)
  }
}
