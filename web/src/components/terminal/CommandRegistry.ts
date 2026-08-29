export interface ArgDef {
  name: string
  required: boolean
  description: string
  type: 'string' | 'number' | 'boolean' | 'string[]' | 'number[]'
  flag?: string
}

export interface CommandDef {
  name: string
  aliases: string[]
  description: string
  usage: string
  category:
    | 'buddies'
    | 'events'
    | 'todos'
    | 'tags'
    | 'transactions'
    | 'interactions'
    | 'reminders'
    | 'graph'
    | 'ai'
    | 'workspace'
    | 'system'
  args: ArgDef[]
}

export const commands: CommandDef[] = [
  // ── System ──
  {
    name: 'help',
    aliases: ['h', '?'],
    description: 'Show available commands or details for a specific command',
    usage: 'help [command]',
    category: 'system',
    args: [{ name: 'command', required: false, description: 'Command to get help for', type: 'string' }],
  },
  {
    name: 'clear',
    aliases: ['cls'],
    description: 'Clear the terminal screen',
    usage: 'clear',
    category: 'system',
    args: [],
  },
  {
    name: 'history',
    aliases: ['hist'],
    description: 'Show command history',
    usage: 'history',
    category: 'system',
    args: [],
  },
  {
    name: 'open',
    aliases: ['navigate', 'goto', 'nav'],
    description: 'Navigate to a page in the app',
    usage: 'open <page>',
    category: 'system',
    args: [{ name: 'page', required: true, description: 'Page path (e.g. buddies, graph, events)', type: 'string' }],
  },
  {
    name: 'export',
    aliases: ['exp'],
    description: 'Export all data as JSON',
    usage: 'export',
    category: 'system',
    args: [],
  },

  // ── Buddies ──
  {
    name: 'list buddies',
    aliases: ['ls buddies', 'buddies', 'ls contacts', 'contacts'],
    description: 'List all buddies',
    usage: 'list buddies [--search <query>] [--page <n>] [--page-size <n>] [--tag-ids <id1,id2>]',
    category: 'buddies',
    args: [
      { name: 'search', required: false, description: 'Search query', type: 'string', flag: '--search' },
      { name: 'page', required: false, description: 'Page number', type: 'number', flag: '--page' },
      { name: 'pageSize', required: false, description: 'Page size', type: 'number', flag: '--page-size' },
      { name: 'tagIds', required: false, description: 'Tag IDs (comma-separated)', type: 'string', flag: '--tag-ids' },
    ],
  },
  {
    name: 'get buddy',
    aliases: ['show buddy', 'buddy'],
    description: 'Get details for a specific buddy',
    usage: 'get buddy <id>',
    category: 'buddies',
    args: [{ name: 'id', required: true, description: 'Buddy ID', type: 'number' }],
  },
  {
    name: 'create buddy',
    aliases: ['add buddy', 'new buddy'],
    description: 'Create a new buddy',
    usage: 'create buddy --name <name> [--nickname <nick>] [--birthday <date>] [--calendar solar|lunar] [--notes <text>] [--phones <p1,p2>] [--emails <e1,e2>] [--labels <l1,l2>]',
    category: 'buddies',
    args: [
      { name: 'name', required: true, description: 'Name', type: 'string', flag: '--name' },
      { name: 'nickname', required: false, description: 'Nickname', type: 'string', flag: '--nickname' },
      { name: 'birthday', required: false, description: 'Birthday (YYYY-MM-DD)', type: 'string', flag: '--birthday' },
      { name: 'calendar', required: false, description: "Birthday calendar: 'solar' or 'lunar' (when lunar, --birthday is a lunar date)", type: 'string', flag: '--calendar' },
      { name: 'notes', required: false, description: 'Notes', type: 'string', flag: '--notes' },
      { name: 'phones', required: false, description: 'Phone numbers (comma-separated)', type: 'string', flag: '--phones' },
      { name: 'emails', required: false, description: 'Emails (comma-separated)', type: 'string', flag: '--emails' },
      { name: 'labels', required: false, description: 'Relationship labels (comma-separated)', type: 'string', flag: '--labels' },
    ],
  },
  {
    name: 'update buddy',
    aliases: ['edit buddy'],
    description: 'Update an existing buddy',
    usage: 'update buddy <id> [--name <name>] [--nickname <nick>] [--birthday <date>] [--calendar solar|lunar] [--notes <text>] [--phones <p1,p2>] [--emails <e1,e2>] [--labels <l1,l2>]',
    category: 'buddies',
    args: [
      { name: 'id', required: true, description: 'Buddy ID', type: 'number' },
      { name: 'name', required: false, description: 'Name', type: 'string', flag: '--name' },
      { name: 'nickname', required: false, description: 'Nickname', type: 'string', flag: '--nickname' },
      { name: 'birthday', required: false, description: 'Birthday (YYYY-MM-DD)', type: 'string', flag: '--birthday' },
      { name: 'calendar', required: false, description: "Birthday calendar: 'solar' or 'lunar' (when lunar, --birthday is a lunar date)", type: 'string', flag: '--calendar' },
      { name: 'notes', required: false, description: 'Notes', type: 'string', flag: '--notes' },
      { name: 'phones', required: false, description: 'Phone numbers (comma-separated)', type: 'string', flag: '--phones' },
      { name: 'emails', required: false, description: 'Emails (comma-separated)', type: 'string', flag: '--emails' },
      { name: 'labels', required: false, description: 'Relationship labels (comma-separated)', type: 'string', flag: '--labels' },
    ],
  },
  {
    name: 'delete buddy',
    aliases: ['rm buddy', 'remove buddy'],
    description: 'Delete a buddy',
    usage: 'delete buddy <id>',
    category: 'buddies',
    args: [{ name: 'id', required: true, description: 'Buddy ID', type: 'number' }],
  },
  {
    name: 'tag buddy',
    aliases: ['buddy tags'],
    description: 'Replace tags for a buddy',
    usage: 'tag buddy <id> --tag-ids <id1,id2>',
    category: 'buddies',
    args: [
      { name: 'id', required: true, description: 'Buddy ID', type: 'number' },
      { name: 'tagIds', required: true, description: 'Tag IDs (comma-separated)', type: 'string', flag: '--tag-ids' },
    ],
  },

  // ── Events ──
  {
    name: 'list events',
    aliases: ['ls events', 'events'],
    description: 'List events',
    usage: 'list events [--page <n>] [--page-size <n>]',
    category: 'events',
    args: [
      { name: 'page', required: false, description: 'Page number', type: 'number', flag: '--page' },
      { name: 'pageSize', required: false, description: 'Page size', type: 'number', flag: '--page-size' },
    ],
  },
  {
    name: 'create event',
    aliases: ['add event', 'new event'],
    description: 'Create an event',
    usage: 'create event --title <title> --start <time> [--end <time>] [--location <loc>] [--description <text>]',
    category: 'events',
    args: [
      { name: 'title', required: true, description: 'Event title', type: 'string', flag: '--title' },
      { name: 'start', required: true, description: 'Start time (ISO string)', type: 'string', flag: '--start' },
      { name: 'end', required: false, description: 'End time (ISO string)', type: 'string', flag: '--end' },
      { name: 'location', required: false, description: 'Location', type: 'string', flag: '--location' },
      { name: 'description', required: false, description: 'Description', type: 'string', flag: '--description' },
      { name: 'color', required: false, description: 'Color', type: 'string', flag: '--color' },
    ],
  },
  {
    name: 'update event',
    aliases: ['edit event'],
    description: 'Update an event',
    usage: 'update event <id> [--title <title>] [--start <time>] [--end <time>] [--location <loc>]',
    category: 'events',
    args: [
      { name: 'id', required: true, description: 'Event ID', type: 'number' },
      { name: 'title', required: false, description: 'Event title', type: 'string', flag: '--title' },
      { name: 'start', required: false, description: 'Start time', type: 'string', flag: '--start' },
      { name: 'end', required: false, description: 'End time', type: 'string', flag: '--end' },
      { name: 'location', required: false, description: 'Location', type: 'string', flag: '--location' },
      { name: 'description', required: false, description: 'Description', type: 'string', flag: '--description' },
    ],
  },
  {
    name: 'delete event',
    aliases: ['rm event', 'remove event'],
    description: 'Delete an event',
    usage: 'delete event <id>',
    category: 'events',
    args: [{ name: 'id', required: true, description: 'Event ID', type: 'number' }],
  },

  // ── Todos ──
  {
    name: 'list todos',
    aliases: ['ls todos', 'todos'],
    description: 'List todos',
    usage: 'list todos [--status <pending|done|all>]',
    category: 'todos',
    args: [
      { name: 'status', required: false, description: 'Filter by status', type: 'string', flag: '--status' },
    ],
  },
  {
    name: 'create todo',
    aliases: ['add todo', 'new todo'],
    description: 'Create a todo',
    usage: 'create todo --title <title> [--description <text>] [--priority <low|normal|high>] [--due <time>]',
    category: 'todos',
    args: [
      { name: 'title', required: true, description: 'Todo title', type: 'string', flag: '--title' },
      { name: 'description', required: false, description: 'Description', type: 'string', flag: '--description' },
      { name: 'priority', required: false, description: 'Priority (low|normal|high)', type: 'string', flag: '--priority' },
      { name: 'due', required: false, description: 'Due time (ISO string)', type: 'string', flag: '--due' },
    ],
  },
  {
    name: 'update todo',
    aliases: ['edit todo'],
    description: 'Update a todo',
    usage: 'update todo <id> [--title <title>] [--description <text>] [--priority <p>] [--due <time>]',
    category: 'todos',
    args: [
      { name: 'id', required: true, description: 'Todo ID', type: 'number' },
      { name: 'title', required: false, description: 'Todo title', type: 'string', flag: '--title' },
      { name: 'description', required: false, description: 'Description', type: 'string', flag: '--description' },
      { name: 'priority', required: false, description: 'Priority', type: 'string', flag: '--priority' },
      { name: 'due', required: false, description: 'Due time', type: 'string', flag: '--due' },
    ],
  },
  {
    name: 'toggle todo',
    aliases: ['check todo', 'complete todo'],
    description: 'Toggle todo completion status',
    usage: 'toggle todo <id>',
    category: 'todos',
    args: [{ name: 'id', required: true, description: 'Todo ID', type: 'number' }],
  },
  {
    name: 'sync todo',
    aliases: [],
    description: 'Sync a todo to an event',
    usage: 'sync todo <id>',
    category: 'todos',
    args: [{ name: 'id', required: true, description: 'Todo ID', type: 'number' }],
  },
  {
    name: 'delete todo',
    aliases: ['rm todo', 'remove todo'],
    description: 'Delete a todo',
    usage: 'delete todo <id>',
    category: 'todos',
    args: [{ name: 'id', required: true, description: 'Todo ID', type: 'number' }],
  },

  // ── Tags ──
  {
    name: 'list tags',
    aliases: ['ls tags', 'tags'],
    description: 'List all tags',
    usage: 'list tags',
    category: 'tags',
    args: [],
  },
  {
    name: 'create tag',
    aliases: ['add tag', 'new tag'],
    description: 'Create a tag',
    usage: 'create tag --name <name> [--color <hex>]',
    category: 'tags',
    args: [
      { name: 'name', required: true, description: 'Tag name', type: 'string', flag: '--name' },
      { name: 'color', required: false, description: 'Color (hex)', type: 'string', flag: '--color' },
    ],
  },
  {
    name: 'update tag',
    aliases: ['edit tag'],
    description: 'Update a tag',
    usage: 'update tag <id> --name <name> [--color <hex>]',
    category: 'tags',
    args: [
      { name: 'id', required: true, description: 'Tag ID', type: 'number' },
      { name: 'name', required: false, description: 'Tag name', type: 'string', flag: '--name' },
      { name: 'color', required: false, description: 'Color (hex)', type: 'string', flag: '--color' },
    ],
  },
  {
    name: 'delete tag',
    aliases: ['rm tag', 'remove tag'],
    description: 'Delete a tag',
    usage: 'delete tag <id>',
    category: 'tags',
    args: [{ name: 'id', required: true, description: 'Tag ID', type: 'number' }],
  },

  // ── Transactions ──
  {
    name: 'list transactions',
    aliases: ['ls transactions', 'transactions', 'txns'],
    description: 'List transactions',
    usage: 'list transactions [--page <n>] [--page-size <n>] [--type <income|expense>]',
    category: 'transactions',
    args: [
      { name: 'page', required: false, description: 'Page number', type: 'number', flag: '--page' },
      { name: 'pageSize', required: false, description: 'Page size', type: 'number', flag: '--page-size' },
      { name: 'type', required: false, description: 'Filter by type', type: 'string', flag: '--type' },
    ],
  },
  {
    name: 'summary',
    aliases: ['finance summary', 'txn summary'],
    description: 'Show transaction summary',
    usage: 'summary',
    category: 'transactions',
    args: [],
  },
  {
    name: 'create transaction',
    aliases: ['add transaction', 'new transaction'],
    description: 'Create a transaction',
    usage: 'create transaction --title <title> --amount <n> --type <income|expense> [--category <cat>] [--date <date>] [--notes <text>]',
    category: 'transactions',
    args: [
      { name: 'title', required: true, description: 'Title', type: 'string', flag: '--title' },
      { name: 'amount', required: true, description: 'Amount', type: 'number', flag: '--amount' },
      { name: 'type', required: true, description: 'Type (income|expense)', type: 'string', flag: '--type' },
      { name: 'category', required: false, description: 'Category', type: 'string', flag: '--category' },
      { name: 'date', required: false, description: 'Date (YYYY-MM-DD)', type: 'string', flag: '--date' },
      { name: 'notes', required: false, description: 'Notes', type: 'string', flag: '--notes' },
    ],
  },
  {
    name: 'update transaction',
    aliases: ['edit transaction'],
    description: 'Update a transaction',
    usage: 'update transaction <id> [--title <title>] [--amount <n>] [--type <t>] [--category <c>]',
    category: 'transactions',
    args: [
      { name: 'id', required: true, description: 'Transaction ID', type: 'number' },
      { name: 'title', required: false, description: 'Title', type: 'string', flag: '--title' },
      { name: 'amount', required: false, description: 'Amount', type: 'number', flag: '--amount' },
      { name: 'type', required: false, description: 'Type', type: 'string', flag: '--type' },
      { name: 'category', required: false, description: 'Category', type: 'string', flag: '--category' },
    ],
  },
  {
    name: 'delete transaction',
    aliases: ['rm transaction', 'remove transaction'],
    description: 'Delete a transaction',
    usage: 'delete transaction <id>',
    category: 'transactions',
    args: [{ name: 'id', required: true, description: 'Transaction ID', type: 'number' }],
  },

  // ── Interactions ──
  {
    name: 'list interactions',
    aliases: ['ls interactions', 'interactions'],
    description: 'List interactions for a buddy',
    usage: 'list interactions --buddy <id> [--page <n>] [--page-size <n>]',
    category: 'interactions',
    args: [
      { name: 'buddy', required: true, description: 'Contact ID', type: 'number', flag: '--buddy' },
      { name: 'page', required: false, description: 'Page number', type: 'number', flag: '--page' },
      { name: 'pageSize', required: false, description: 'Page size', type: 'number', flag: '--page-size' },
    ],
  },
  {
    name: 'create interaction',
    aliases: ['add interaction', 'new interaction'],
    description: 'Create an interaction',
    usage: 'create interaction --buddy <id> --title <title> --type <meeting|call|message|email|other> [--content <text>] [--occurred <date>]',
    category: 'interactions',
    args: [
      { name: 'buddy', required: true, description: 'Contact ID', type: 'number', flag: '--buddy' },
      { name: 'title', required: true, description: 'Title', type: 'string', flag: '--title' },
      { name: 'type', required: true, description: 'Type', type: 'string', flag: '--type' },
      { name: 'content', required: false, description: 'Content', type: 'string', flag: '--content' },
      { name: 'occurred', required: false, description: 'Occurred at (ISO)', type: 'string', flag: '--occurred' },
    ],
  },
  {
    name: 'update interaction',
    aliases: ['edit interaction'],
    description: 'Update an interaction',
    usage: 'update interaction <id> [--title <title>] [--type <t>] [--content <text>]',
    category: 'interactions',
    args: [
      { name: 'id', required: true, description: 'Interaction ID', type: 'number' },
      { name: 'title', required: false, description: 'Title', type: 'string', flag: '--title' },
      { name: 'type', required: false, description: 'Type', type: 'string', flag: '--type' },
      { name: 'content', required: false, description: 'Content', type: 'string', flag: '--content' },
    ],
  },
  {
    name: 'delete interaction',
    aliases: ['rm interaction', 'remove interaction'],
    description: 'Delete an interaction',
    usage: 'delete interaction <id>',
    category: 'interactions',
    args: [{ name: 'id', required: true, description: 'Interaction ID', type: 'number' }],
  },

  // ── Reminders ──
  {
    name: 'list reminders',
    aliases: ['ls reminders', 'reminders'],
    description: 'List reminders',
    usage: 'list reminders [--status <pending|done|snoozed>]',
    category: 'reminders',
    args: [
      { name: 'status', required: false, description: 'Filter by status', type: 'string', flag: '--status' },
    ],
  },
  {
    name: 'create reminder',
    aliases: ['add reminder', 'new reminder'],
    description: 'Create a reminder',
    usage: 'create reminder --buddy <id> --title <title> --time <datetime> [--description <text>]',
    category: 'reminders',
    args: [
      { name: 'buddy', required: true, description: 'Contact ID', type: 'number', flag: '--buddy' },
      { name: 'title', required: true, description: 'Title', type: 'string', flag: '--title' },
      { name: 'time', required: true, description: 'Remind at (ISO datetime)', type: 'string', flag: '--time' },
      { name: 'description', required: false, description: 'Description', type: 'string', flag: '--description' },
    ],
  },
  {
    name: 'update reminder',
    aliases: ['edit reminder'],
    description: 'Update a reminder',
    usage: 'update reminder <id> [--title <title>] [--time <datetime>] [--description <text>] [--status <s>]',
    category: 'reminders',
    args: [
      { name: 'id', required: true, description: 'Reminder ID', type: 'number' },
      { name: 'title', required: false, description: 'Title', type: 'string', flag: '--title' },
      { name: 'time', required: false, description: 'Remind at', type: 'string', flag: '--time' },
      { name: 'description', required: false, description: 'Description', type: 'string', flag: '--description' },
      { name: 'status', required: false, description: 'Status', type: 'string', flag: '--status' },
    ],
  },
  {
    name: 'delete reminder',
    aliases: ['rm reminder', 'remove reminder'],
    description: 'Delete a reminder',
    usage: 'delete reminder <id>',
    category: 'reminders',
    args: [{ name: 'id', required: true, description: 'Reminder ID', type: 'number' }],
  },

  // ── Graph ──
  {
    name: 'graph',
    aliases: ['network'],
    description: 'Show graph nodes and edges',
    usage: 'graph',
    category: 'graph',
    args: [],
  },
  {
    name: 'list relations',
    aliases: ['ls relations', 'relations'],
    description: 'List relations for a buddy',
    usage: 'list relations --buddy <id>',
    category: 'graph',
    args: [
      { name: 'buddy', required: true, description: 'Contact ID', type: 'number', flag: '--buddy' },
    ],
  },
  {
    name: 'create relation',
    aliases: ['add relation', 'new relation', 'link'],
    description: 'Create a relation between two buddies',
    usage: 'create relation --from <id> --to <id> --type <relation>',
    category: 'graph',
    args: [
      { name: 'from', required: true, description: 'Contact ID A', type: 'number', flag: '--from' },
      { name: 'to', required: true, description: 'Contact ID B', type: 'number', flag: '--to' },
      { name: 'type', required: true, description: 'Relation type', type: 'string', flag: '--type' },
    ],
  },
  {
    name: 'delete relation',
    aliases: ['rm relation', 'remove relation', 'unlink'],
    description: 'Delete a relation',
    usage: 'delete relation <id>',
    category: 'graph',
    args: [{ name: 'id', required: true, description: 'Relation ID', type: 'number' }],
  },

  // ── AI ──
  {
    name: 'analyze relationship',
    aliases: ['analyze contact', 'ai relationship'],
    description: 'AI analysis of a relationship',
    usage: 'analyze relationship <id>',
    category: 'ai',
    args: [{ name: 'id', required: true, description: 'Contact ID', type: 'number' }],
  },
  {
    name: 'analyze event',
    aliases: ['ai event'],
    description: 'AI analysis of an event',
    usage: 'analyze event <id>',
    category: 'ai',
    args: [{ name: 'id', required: true, description: 'Event ID', type: 'number' }],
  },
  {
    name: 'analyze comprehensive',
    aliases: ['ai comprehensive', 'ai analyze'],
    description: 'AI comprehensive analysis',
    usage: 'analyze comprehensive [--contacts <id1,id2>] [--events <id1,id2>] [--question <text>]',
    category: 'ai',
    args: [
      { name: 'contacts', required: false, description: 'Contact IDs (comma-separated)', type: 'string', flag: '--contacts' },
      { name: 'events', required: false, description: 'Event IDs (comma-separated)', type: 'string', flag: '--events' },
      { name: 'question', required: false, description: 'Question to ask', type: 'string', flag: '--question' },
    ],
  },

  // ── Workspace ──
  {
    name: 'list workspaces',
    aliases: ['ls workspaces', 'workspaces'],
    description: 'List all workspaces',
    usage: 'list workspaces',
    category: 'workspace',
    args: [],
  },
  {
    name: 'switch workspace',
    aliases: ['use workspace', 'workspace'],
    description: 'Switch to a workspace',
    usage: 'switch workspace <id>',
    category: 'workspace',
    args: [{ name: 'id', required: true, description: 'Workspace ID', type: 'number' }],
  },
]

const aliasMap = new Map<string, string>()
for (const cmd of commands) {
  aliasMap.set(cmd.name, cmd.name)
  for (const alias of cmd.aliases) {
    aliasMap.set(alias, cmd.name)
  }
}

export function findCommand(input: string): CommandDef | undefined {
  const normalised = input.trim().toLowerCase()
  const resolved = aliasMap.get(normalised)
  if (resolved) return commands.find((c) => c.name === resolved)
  return undefined
}

export function getAutocompleteCandidates(partial: string): string[] {
  const lower = partial.toLowerCase().trim()
  const candidates: string[] = []
  for (const cmd of commands) {
    if (cmd.name.startsWith(lower)) candidates.push(cmd.name)
    for (const alias of cmd.aliases) {
      if (alias.startsWith(lower)) candidates.push(alias)
    }
  }
  return [...new Set(candidates)]
}
