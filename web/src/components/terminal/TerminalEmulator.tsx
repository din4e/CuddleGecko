import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useModeStore } from '@/stores/mode'
import { useTerminalStore } from '@/stores/terminal-store'
import { parseCommand } from './CommandParser'
import { getAutocompleteCandidates } from './CommandRegistry'
import { formatJSON, formatError, formatCount } from './formatters'
import {
  executeHelp,
  executeClear,
  executeHistory,
  executeOpen,
  executeExport,
} from './commands/systemCommands'
import {
  executeListBuddies,
  executeGetBuddy,
  executeCreateBuddy,
  executeUpdateBuddy,
  executeDeleteBuddy,
  executeTagBuddy,
} from './commands/buddyCommands'
import {
  executeListEvents,
  executeCreateEvent,
  executeUpdateEvent,
  executeDeleteEvent,
} from './commands/eventCommands'
import {
  executeListTodos,
  executeCreateTodo,
  executeUpdateTodo,
  executeToggleTodo,
  executeSyncTodo,
  executeDeleteTodo,
} from './commands/todoCommands'
import {
  executeListTags,
  executeCreateTag,
  executeUpdateTag,
  executeDeleteTag,
} from './commands/tagCommands'
import {
  executeListTransactions,
  executeSummary,
  executeCreateTransaction,
  executeUpdateTransaction,
  executeDeleteTransaction,
} from './commands/transactionCommands'
import {
  executeListInteractions,
  executeCreateInteraction,
  executeUpdateInteraction,
  executeDeleteInteraction,
} from './commands/interactionCommands'
import {
  executeListReminders,
  executeCreateReminder,
  executeUpdateReminder,
  executeDeleteReminder,
} from './commands/reminderCommands'
import {
  executeGraph,
  executeListRelations,
  executeCreateRelation,
  executeDeleteRelation,
} from './commands/graphCommands'
import {
  executeAnalyzeRelationship,
  executeAnalyzeEvent,
  executeAnalyzeComprehensive,
} from './commands/aiCommands'
import {
  executeListWorkspaces,
  executeSwitchWorkspace,
} from './commands/workspaceCommands'
import { useTranslation } from 'react-i18next'
import type { CommandArgs } from './types'

const PROMPT = '\r\n\x1b[32mgecko\x1b[0m> '

// The visible prompt is "gecko> " (7 chars), so typed input starts at column 8.
// All cursor-column math must agree on this: clearCurrentLine/Ctrl+A previously
// used column 7 (the prompt's trailing space), which clobbered the ">" spacing
// and disagreed with the backspace math (7 + pos ⇒ column 8 for pos = 1).
const INPUT_START_COL = 8

interface TerminalEmulatorProps {
  onNavigate?: (path: string) => void
}

export default function TerminalEmulator({ onNavigate }: TerminalEmulatorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const inputRef = useRef('')
  const cursorPosRef = useRef(0)
  const { t } = useTranslation()
  const tRef = useRef(t)
  useEffect(() => { tRef.current = t }, [t])

  const dispatchCommand = useCallback(
    async (
      command: string,
      args: CommandArgs,
      adapters: ReturnType<typeof useModeStore.getState>['adapters'],
    ): Promise<string | { navigate: string }> => {
      switch (command) {
        case 'help':
          return executeHelp(args, adapters, tRef.current)
        case 'clear':
          return executeClear()
        case 'history':
          return executeHistory(useTerminalStore.getState().history)
        case 'open':
          return executeOpen(args)
        case 'export':
          return executeExport(adapters)

        case 'list buddies':
          return executeListBuddies(args, adapters)
        case 'get buddy':
          return executeGetBuddy(args, adapters)
        case 'create buddy':
          return executeCreateBuddy(args, adapters)
        case 'update buddy':
          return executeUpdateBuddy(args, adapters)
        case 'delete buddy':
          return executeDeleteBuddy(args, adapters)
        case 'tag buddy':
          return executeTagBuddy(args, adapters)

        case 'list events':
          return executeListEvents(args, adapters)
        case 'create event':
          return executeCreateEvent(args, adapters)
        case 'update event':
          return executeUpdateEvent(args, adapters)
        case 'delete event':
          return executeDeleteEvent(args, adapters)

        case 'list todos':
          return executeListTodos(args, adapters)
        case 'create todo':
          return executeCreateTodo(args, adapters)
        case 'update todo':
          return executeUpdateTodo(args, adapters)
        case 'toggle todo':
          return executeToggleTodo(args, adapters)
        case 'sync todo':
          return executeSyncTodo(args, adapters)
        case 'delete todo':
          return executeDeleteTodo(args, adapters)

        case 'list tags':
          return executeListTags(adapters)
        case 'create tag':
          return executeCreateTag(args, adapters)
        case 'update tag':
          return executeUpdateTag(args, adapters)
        case 'delete tag':
          return executeDeleteTag(args, adapters)

        case 'list transactions':
          return executeListTransactions(args, adapters)
        case 'summary':
          return executeSummary(adapters)
        case 'create transaction':
          return executeCreateTransaction(args, adapters)
        case 'update transaction':
          return executeUpdateTransaction(args, adapters)
        case 'delete transaction':
          return executeDeleteTransaction(args, adapters)

        case 'list interactions':
          return executeListInteractions(args, adapters)
        case 'create interaction':
          return executeCreateInteraction(args, adapters)
        case 'update interaction':
          return executeUpdateInteraction(args, adapters)
        case 'delete interaction':
          return executeDeleteInteraction(args, adapters)

        case 'list reminders':
          return executeListReminders(args, adapters)
        case 'create reminder':
          return executeCreateReminder(args, adapters)
        case 'update reminder':
          return executeUpdateReminder(args, adapters)
        case 'delete reminder':
          return executeDeleteReminder(args, adapters)

        case 'graph':
          return executeGraph(adapters)
        case 'list relations':
          return executeListRelations(args, adapters)
        case 'create relation':
          return executeCreateRelation(args, adapters)
        case 'delete relation':
          return executeDeleteRelation(args, adapters)

        case 'analyze relationship':
          return executeAnalyzeRelationship(args, adapters)
        case 'analyze event':
          return executeAnalyzeEvent(args, adapters)
        case 'analyze comprehensive':
          return executeAnalyzeComprehensive(args, adapters)

        case 'list workspaces':
          return executeListWorkspaces(adapters)
        case 'switch workspace':
          return executeSwitchWorkspace(args, adapters)

        default:
          return formatError(`Command not found: ${command}`)
      }
    },
    [],
  )

  useEffect(() => {
    if (!containerRef.current) return

    const isDark = document.documentElement.classList.contains('dark')

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace",
      theme: {
        background: isDark ? '#0f1117' : '#fafafa',
        foreground: isDark ? '#e4e4e7' : '#18181b',
        cursor: isDark ? '#a78bfa' : '#6d28d9',
        selectionBackground: isDark ? 'rgba(167, 139, 250, 0.3)' : 'rgba(109, 40, 217, 0.2)',
        black: isDark ? '#18181b' : '#fafafa',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#d946ef',
        cyan: '#06b6d4',
        white: isDark ? '#e4e4e7' : '#18181b',
        brightBlack: isDark ? '#71717a' : '#a1a1aa',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#e879f9',
        brightCyan: '#22d3ee',
        brightWhite: isDark ? '#f4f4f5' : '#09090b',
      },
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)

    try {
      fitAddon.fit()
    } catch {
      /* ignore fit error on first render */
    }

    termRef.current = term
    fitRef.current = fitAddon

    term.writeln(`\x1b[1m\x1b[36mCuddleGecko Terminal\x1b[0m`)
    term.writeln(tRef.current('terminal.welcome'))
    term.write(PROMPT)

    // Theme observer
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains('dark')
      term.options.theme = {
        background: dark ? '#0f1117' : '#fafafa',
        foreground: dark ? '#e4e4e7' : '#18181b',
        cursor: dark ? '#a78bfa' : '#6d28d9',
        selectionBackground: dark ? 'rgba(167, 139, 250, 0.3)' : 'rgba(109, 40, 217, 0.2)',
        black: dark ? '#18181b' : '#fafafa',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#d946ef',
        cyan: '#06b6d4',
        white: dark ? '#e4e4e7' : '#18181b',
        brightBlack: dark ? '#71717a' : '#a1a1aa',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#e879f9',
        brightCyan: '#22d3ee',
        brightWhite: dark ? '#f4f4f5' : '#09090b',
      }
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
      } catch {
        /* ignore */
      }
    })
    resizeObserver.observe(containerRef.current)

    // Input handler
    const input = term.onData((data: string) => {
      const store = useTerminalStore.getState()

      if (store.isProcessing) return

      // Handle special keys
      if (data === '\r') {
        // Enter
        const line = inputRef.current
        term.writeln('')
        inputRef.current = ''
        cursorPosRef.current = 0

        if (line.trim()) {
          store.addHistory(line.trim())
          store.resetHistoryIndex()
          store.setProcessing(true)

          const parsed = parseCommand(line)
          if (parsed) {
            const adapters = useModeStore.getState().adapters
            if (!adapters) {
              term.writeln(formatError('Adapters not available. Check your connection settings.'))
              term.write(PROMPT)
              store.setProcessing(false)
              return
            }

            dispatchCommand(parsed.command, parsed.args, adapters)
              .then((result) => {
                if (typeof result === 'object' && 'navigate' in result) {
                  if (onNavigate) onNavigate(result.navigate)
                  term.writeln(`\x1b[36mNavigating to ${result.navigate}\x1b[0m`)
                } else if (result === '__CLEAR__') {
                  term.clear()
                } else {
                  let output: string = result
                  if (parsed.pipe) {
                    output = applyPipe(result, parsed.pipe)
                  }
                  term.writeln(output)
                }
                term.write(PROMPT)
                store.setProcessing(false)
              })
              .catch((err) => {
                term.writeln(formatError(`Unexpected error: ${err.message}`))
                term.write(PROMPT)
                store.setProcessing(false)
              })
          } else {
            term.write(PROMPT)
          }
        } else {
          term.write(PROMPT)
        }
      } else if (data === '\x7f') {
        // Backspace
        if (cursorPosRef.current > 0) {
          const pos = cursorPosRef.current
          const line = inputRef.current
          inputRef.current = line.slice(0, pos - 1) + line.slice(pos)
          cursorPosRef.current = pos - 1
          // Rewrite the line
          term.write(`\x1b[${7 + pos}G`) // move to position
          term.write(`\x1b[K`) // clear to end
          term.write(inputRef.current.slice(pos - 1))
          term.write(`\x1b[${7 + pos - 1}G`) // move cursor back
        }
      } else if (data === '\x1b[A') {
        // Up arrow
        const prev = store.navigateHistory('up')
        if (prev !== undefined) {
          clearCurrentLine(term)
          inputRef.current = prev
          cursorPosRef.current = prev.length
          term.write(prev)
        }
      } else if (data === '\x1b[B') {
        // Down arrow
        const next = store.navigateHistory('down')
        if (next !== undefined) {
          clearCurrentLine(term)
          inputRef.current = next
          cursorPosRef.current = next.length
          term.write(next)
        }
      } else if (data === '\t') {
        // Tab autocomplete
        const partial = inputRef.current
        const candidates = getAutocompleteCandidates(partial)
        if (candidates.length === 1) {
          clearCurrentLine(term)
          inputRef.current = candidates[0] + ' '
          cursorPosRef.current = inputRef.current.length
          term.write(inputRef.current)
        } else if (candidates.length > 1) {
          term.writeln('')
          term.writeln(candidates.join('  '))
          term.write(PROMPT.slice(2)) // skip leading \r\n
          term.write(inputRef.current)
        }
      } else if (data === '\x03') {
        // Ctrl+C
        term.writeln('^C')
        inputRef.current = ''
        cursorPosRef.current = 0
        term.write(PROMPT)
      } else if (data === '\x0c') {
        // Ctrl+L
        term.clear()
        term.write(PROMPT.slice(2))
        term.write(inputRef.current)
      } else if (data === '\x1b[D') {
        // Left arrow
        if (cursorPosRef.current > 0) {
          cursorPosRef.current--
          term.write('\x1b[D')
        }
      } else if (data === '\x1b[C') {
        // Right arrow
        if (cursorPosRef.current < inputRef.current.length) {
          cursorPosRef.current++
          term.write('\x1b[C')
        }
      } else if (data === '\x01') {
        // Ctrl+A - move to start (column of the first input char, not the
        // prompt's trailing space)
        const moveBack = cursorPosRef.current
        if (moveBack > 0) {
          cursorPosRef.current = 0
          term.write(`\x1b[${INPUT_START_COL}G`)
        }
      } else if (data === '\x05') {
        // Ctrl+E - move to end
        const moveForward = inputRef.current.length - cursorPosRef.current
        if (moveForward > 0) {
          cursorPosRef.current = inputRef.current.length
          term.write(`\x1b[${moveForward}C`)
        }
      } else if (data.startsWith('\x1b[')) {
        // Ignore other escape sequences
      } else if (data.charCodeAt(0) >= 32) {
        // Printable character
        const pos = cursorPosRef.current
        const line = inputRef.current
        inputRef.current = line.slice(0, pos) + data + line.slice(pos)
        cursorPosRef.current = pos + data.length
        // Rewrite from cursor position
        term.write(data + line.slice(pos))
        if (line.length > pos) {
          // Move cursor back to correct position
          term.write(`\x1b[${line.length - pos}D`)
        }
      }
    })

    return () => {
      input.dispose()
      observer.disconnect()
      resizeObserver.disconnect()
      term.dispose()
    }
  }, [dispatchCommand, onNavigate])

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ minHeight: '200px' }}
    />
  )
}

function clearCurrentLine(term: Terminal) {
  // Clear back to the FIRST input column (8) — not 7 — so a rewritten line
  // (history recall, autocomplete) never clobbers the prompt's trailing space.
  term.write(`\r\x1b[${INPUT_START_COL}G\x1b[K`)
}

function applyPipe(output: string, pipe: string): string {
  // For piping, we need to try to re-parse the raw data
  // This is a simple implementation - try to extract structured data
  try {
    if (pipe === 'json') {
      // Try to find JSON-like data in the output
      const esc = String.fromCharCode(27)
      const stripped = output.replace(new RegExp(esc + '\\[[0-9;]*m', 'g'), '')
      // Try to parse table rows as objects
      return formatJSON({ raw: stripped })
    }
    if (pipe === 'count') {
      const esc = String.fromCharCode(27)
      const stripped = output.replace(new RegExp(esc + '\\[[0-9;]*m', 'g'), '')
      const lines = stripped.split(/\r?\n/).filter((l) => l.trim())
      // Subtract header lines (typically 2: header + separator)
      const dataLines = Math.max(0, lines.length - 2)
      return formatCount(Array.from({ length: dataLines }))
    }
  } catch {
    /* fall through */
  }
  return output
}
