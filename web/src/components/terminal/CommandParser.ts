import { findCommand } from './CommandRegistry'
import type { CommandArgs } from './types'

export interface ParsedCommand {
  command: string
  args: CommandArgs
  pipe?: string
  raw: string
}

// Index of the first '|' that sits OUTSIDE single/double quotes, or -1.
// Mirrors the quote state machine tokenize uses, so `--name "A | B"` keeps its
// pipe character inside the quoted value instead of truncating the command.
function findPipeOutsideQuotes(input: string): number {
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === "'" && !inDouble) inSingle = !inSingle
    else if (ch === '"' && !inSingle) inDouble = !inDouble
    else if (ch === '|' && !inSingle && !inDouble) return i
  }
  return -1
}

function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble
    } else if (ch === ' ' && !inSingle && !inDouble) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
    } else {
      current += ch
    }
  }
  if (current.length > 0) tokens.push(current)
  return tokens
}

export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  let pipeTarget: string | undefined
  let commandPart = trimmed

  // Pipe must be found OUTSIDE quotes: a plain indexOf('|') truncated
  // `create buddy --name "A | B"` at the pipe and mangled the name.
  const pipeIdx = findPipeOutsideQuotes(trimmed)
  if (pipeIdx !== -1) {
    commandPart = trimmed.slice(0, pipeIdx).trim()
    pipeTarget = trimmed.slice(pipeIdx + 1).trim().toLowerCase()
  }

  const tokens = tokenize(commandPart)
  if (tokens.length === 0) return null

  // Try to resolve the command by progressively joining tokens
  let resolvedCommand = ''
  let argStartIdx = 0

  for (let i = tokens.length; i >= 1; i--) {
    const candidate = tokens.slice(0, i).join(' ').toLowerCase()
    const cmd = findCommand(candidate)
    if (cmd) {
      resolvedCommand = cmd.name
      argStartIdx = i
      break
    }
  }

  if (!resolvedCommand) {
    // Store the raw first token as the command for "not found" handling
    resolvedCommand = tokens[0].toLowerCase()
    argStartIdx = 1
  }

  const args: CommandArgs = {}
  const remaining = tokens.slice(argStartIdx)

  // Parse flags and positional args
  let positionalIdx = 0
  for (let i = 0; i < remaining.length; i++) {
    const token = remaining[i]
    if (token.startsWith('--')) {
      const flagName = token.slice(2)
      // Convert kebab-case to camelCase
      const camelKey = flagName.replace(/-([a-z])/g, (_, c) => c.toUpperCase())

      // Check if next token is the value (not another flag)
      if (i + 1 < remaining.length && !remaining[i + 1].startsWith('--')) {
        args[camelKey] = remaining[i + 1]
        i++ // skip value
      } else {
        args[camelKey] = true
      }
    } else {
      // Positional argument
      args[`_pos${positionalIdx}`] = token
      if (positionalIdx === 0) args['id'] = Number(token) || token
      positionalIdx++
    }
  }

  return {
    command: resolvedCommand,
    args,
    pipe: pipeTarget,
    raw: trimmed,
  }
}
