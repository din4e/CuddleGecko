import type { AppAdapters } from '@/api/adapter'
import { formatTable, formatSuccess, formatError } from '../formatters'
import type { CommandArgs } from '../types'
import { getErrorMessage } from '../types'

const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

export async function executeGraph(adapters: AppAdapters): Promise<string> {
  try {
    const data = await adapters.graph.getGraph()
    if (data.nodes.length === 0) return formatError('Graph is empty. Add buddies and relations first.')

    const lines: string[] = []

    lines.push(`${BOLD}Nodes (${data.nodes.length}):${RESET}`)
    const nodeRows = data.nodes.map((n) => ({
      ID: n.id,
      Name: n.name,
      Labels: (n.relationship_labels || []).join(', ') || '-',
    }))
    lines.push(formatTable(nodeRows))

    if (data.edges.length > 0) {
      lines.push('')
      lines.push(`${BOLD}Edges (${data.edges.length}):${RESET}`)
      const edgeRows = data.edges.map((e, i) => ({
        '#': i + 1,
        Source: e.source,
        Target: e.target,
        Type: e.relation_type,
      }))
      lines.push(formatTable(edgeRows))
    }

    return lines.join('\r\n')
  } catch (e: unknown) {
    return formatError(`Failed to get graph: ${getErrorMessage(e)}`)
  }
}

export async function executeListRelations(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const buddy = Number(args.buddy)
    if (!buddy) return formatError('--buddy <id> is required')

    const relations = await adapters.graph.getRelations(buddy)
    if (relations.length === 0) return formatError('No relations found')

    const rows = relations.map((r) => ({
      ID: r.id,
      ContactA: r.contact_id_a,
      ContactB: r.contact_id_b,
      Type: r.relation_type,
    }))

    return formatTable(rows)
  } catch (e: unknown) {
    return formatError(`Failed to list relations: ${getErrorMessage(e)}`)
  }
}

export async function executeCreateRelation(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const from = Number(args.from)
    const to = Number(args.to)
    const type = args.type as string

    if (!from || !to || !type) return formatError('--from, --to, and --type are required')

    const relation = await adapters.graph.createRelation(from, {
      contact_id_b: to,
      relation_type: type,
    })
    return formatSuccess(`Created relation (ID: ${relation.id})`)
  } catch (e: unknown) {
    return formatError(`Failed to create relation: ${getErrorMessage(e)}`)
  }
}

export async function executeDeleteRelation(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: delete relation <id>')

    await adapters.graph.deleteRelation(id)
    return formatSuccess('Relation deleted successfully')
  } catch (e: unknown) {
    return formatError(`Failed to delete relation: ${getErrorMessage(e)}`)
  }
}
