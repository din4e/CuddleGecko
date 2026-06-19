import type { AppAdapters } from '@/api/adapter'
import { formatError } from '../formatters'
import type { CommandArgs } from '../types'
import { getErrorMessage } from '../types'

export async function executeAnalyzeRelationship(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: analyze relationship <id>')

    const result = await adapters.ai.analyzeRelationship(id)
    return result.analysis
  } catch (e: unknown) {
    return formatError(`AI analysis failed: ${getErrorMessage(e)}`)
  }
}

export async function executeAnalyzeEvent(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: analyze event <id>')

    const result = await adapters.ai.analyzeEvent(id)
    return result.analysis
  } catch (e: unknown) {
    return formatError(`AI analysis failed: ${getErrorMessage(e)}`)
  }
}

export async function executeAnalyzeComprehensive(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const contactsStr = args.contacts as string | undefined
    const eventsStr = args.events as string | undefined
    const question = args.question as string | undefined

    const contactIds = contactsStr
      ? contactsStr.split(',').map(Number).filter((n) => !isNaN(n))
      : undefined
    const eventIds = eventsStr
      ? eventsStr.split(',').map(Number).filter((n) => !isNaN(n))
      : undefined

    const result = await adapters.ai.analyzeComprehensive({
      type: 'comprehensive',
      contact_ids: contactIds,
      event_ids: eventIds,
      question,
    })
    return result.analysis
  } catch (e: unknown) {
    return formatError(`AI analysis failed: ${getErrorMessage(e)}`)
  }
}
