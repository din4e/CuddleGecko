import type { AppAdapters } from '@/api/adapter'
import { formatTable, formatSuccess, formatError } from '../formatters'
import type { CommandArgs } from '../types'
import { getErrorMessage } from '../types'

export async function executeListTodos(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const status = (args.status as string) || undefined
    const todos = await adapters.todo.list(status)

    if (todos.length === 0) return formatError('No todos found')

    const rows = todos.map((t) => ({
      ID: t.id,
      Title: t.title,
      Status: t.status,
      Priority: t.priority,
      Due: t.due_time || '-',
    }))

    return formatTable(rows)
  } catch (e: unknown) {
    return formatError(`Failed to list todos: ${getErrorMessage(e)}`)
  }
}

export async function executeCreateTodo(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const title = args.title as string
    if (!title) return formatError('--title is required')

    const data: Record<string, unknown> = { title }
    if (args.description) data.description = args.description
    if (args.priority) data.priority = args.priority
    if (args.due) data.due_time = args.due

    const todo = await adapters.todo.create(data)
    return formatSuccess(`Created todo (ID: ${todo.id})`)
  } catch (e: unknown) {
    return formatError(`Failed to create todo: ${getErrorMessage(e)}`)
  }
}

export async function executeUpdateTodo(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: update todo <id>')

    const data: Record<string, unknown> = {}
    if (args.title) data.title = args.title
    if (args.description) data.description = args.description
    if (args.priority) data.priority = args.priority
    if (args.due) data.due_time = args.due

    if (Object.keys(data).length === 0) return formatError('No fields to update.')

    await adapters.todo.update(id, data)
    return formatSuccess('Todo updated successfully')
  } catch (e: unknown) {
    return formatError(`Failed to update todo: ${getErrorMessage(e)}`)
  }
}

export async function executeToggleTodo(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: toggle todo <id>')

    const todo = await adapters.todo.toggleStatus(id)
    return formatSuccess(`Todo toggled to: ${todo.status}`)
  } catch (e: unknown) {
    return formatError(`Failed to toggle todo: ${getErrorMessage(e)}`)
  }
}

export async function executeSyncTodo(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: sync todo <id>')

    const event = await adapters.todo.syncToEvent(id)
    return formatSuccess(`Todo synced to event (ID: ${event.id})`)
  } catch (e: unknown) {
    return formatError(`Failed to sync todo: ${getErrorMessage(e)}`)
  }
}

export async function executeDeleteTodo(
  args: CommandArgs,
  adapters: AppAdapters,
): Promise<string> {
  try {
    const id = Number(args.id)
    if (!id) return formatError('Usage: delete todo <id>')

    await adapters.todo.delete(id)
    return formatSuccess('Todo deleted successfully')
  } catch (e: unknown) {
    return formatError(`Failed to delete todo: ${getErrorMessage(e)}`)
  }
}
