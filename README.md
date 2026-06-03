# CuddleGecko 小蜥抱抱

A local-first, self-hosted personal CRM with network graph visualization.

## Features

- **Contact Management** — CRUD with tags, relationship types, search & pagination
- **Interaction Timeline** — Record meetings, calls, messages per contact
- **Smart Reminders** — Schedule follow-ups with status tracking (pending/done/snoozed)
- **Events** — Calendar events with color coding, buddy linking, and time filters
- **Todos** — Task management with status tracking, priority levels, three views (timeline/grouped/kanban), and sync-to-event
- **Finance Tracking** — Income/expense records with category, buddy linking, and summary
- **Network Graph** — Force-directed visualization of your relationship network
- **AI Assistant** — Multi-provider LLM chat (DeepSeek, GLM, MiniMax, Kimi, Qwen, OpenAI, custom) with CRM data context, relationship analysis, and event insights
- **MCP Server** — Model Context Protocol endpoint for external AI tools (Claude Code, Cursor, etc.) to access your CRM data via 43 tools
- **Web Terminal** — Built-in xterm.js terminal with shell-like commands for keyboard-driven data management
- **Workspace Isolation** — Multiple workspaces with full data isolation
- **Tag System** — Color-coded tags for contact categorization
- **Dark Mode** — Green gecko brand theme with light/dark toggle
- **i18n** — English and Chinese (中文) support
- **Auth** — JWT + refresh token with automatic retry

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go 1.24, Gin, GORM, SQLite/MySQL |
| Frontend | Vite, React 19, TypeScript, Tailwind CSS v4, shadcn/ui |
| Testing (Go) | testify, httptest |
| Testing (JS) | Vitest, @testing-library/react, jsdom |
| State | Zustand |
| i18n | react-i18next |
| Graph | react-force-graph-2d |
| Charts | Recharts |
| Terminal | xterm.js |
| AI Icons | @lobehub/icons-static-svg (CDN) |

## Quick Start

```bash
# Backend (port 8080)
go run ./cmd/server

# Frontend (port 5173)
cd web && npm install && npm run dev
```

Open http://127.0.0.1:5173 and register an account.

## Project Structure

```
cmd/server/         # Entry point, dependency wiring
internal/
  handler/          # HTTP handlers (Gin)
  service/          # Business logic
  repository/       # Database access (GORM)
  model/            # Domain types
  mcp/              # MCP server (JSON-RPC 2.0, Streamable HTTP transport)
pkg/
  config/           # Viper config loading (YAML + env vars)
  database/         # GORM init (SQLite/MySQL)
  llm/              # OpenAI-compatible LLM streaming client
  middleware/        # JWT auth, CORS, workspace auth
  response/         # Unified JSON response helpers
web/src/
  api/              # Axios client + domain modules + dual-mode adapters
  components/       # UI components (shadcn/ui + GeckoIcon)
    terminal/       # Terminal emulator components (xterm.js)
  layouts/          # App layout with sidebar
  pages/            # Route-level views
  stores/           # Zustand stores (auth, mode, graph settings, terminal)
  i18n/             # react-i18next locales (en, zh)
  types/            # TypeScript types matching backend models
```

## API Endpoints

All endpoints at `/api`:

| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/register | Register |
| POST | /auth/login | Login |
| POST | /auth/refresh | Refresh token |
| GET | /auth/me | Current user |
| GET/POST | /workspaces | List/Create workspaces |
| PUT/DELETE | /workspaces/:id | Workspace update/delete |
| POST | /workspaces/:id/switch | Switch active workspace |
| GET | /workspaces/default | Get default workspace |
| GET/POST | /buddies | List/Create contacts |
| GET/PUT/DELETE | /buddies/:id | Contact CRUD |
| GET/PUT | /buddies/:id/tags | Contact tags |
| GET/POST | /buddies/:id/interactions | Interactions |
| POST | /buddies/:id/reminders | Create reminder |
| GET/POST | /buddies/:id/relations | Relations |
| GET/POST | /tags | Tag CRUD |
| PUT/DELETE | /tags/:id | Tag update/delete |
| PUT/DELETE | /interactions/:id | Interaction update/delete |
| GET | /reminders | List reminders (filter by status) |
| PUT/DELETE | /reminders/:id | Reminder update/delete |
| DELETE | /relations/:id | Delete relation |
| GET | /graph | Network graph data |
| GET/POST | /events | List/Create events |
| PUT/DELETE | /events/:id | Event update/delete |
| GET/POST | /todos | List/Create todos (status filter) |
| PUT | /todos/:id | Update todo |
| PATCH | /todos/:id/toggle | Toggle todo status |
| POST | /todos/:id/sync-event | Sync todo to event |
| DELETE | /todos/:id | Delete todo |
| GET/POST | /transactions | List/Create transactions |
| GET | /transactions/summary | Transaction summary |
| PUT/DELETE | /transactions/:id | Transaction update/delete |
| GET | /ai/presets | List AI provider presets |
| GET | /ai/env-status | Check environment-based AI config |
| GET/PUT | /ai/providers | List/Save AI providers |
| POST | /ai/providers/:id/activate | Activate provider |
| POST | /ai/providers/:id/test | Test connection |
| GET/POST | /ai/conversations | List/Create chat conversations |
| GET | /ai/conversations/:id/messages | Get conversation messages |
| DELETE | /ai/conversations/:id | Delete conversation |
| POST | /ai/chat | Stream chat (SSE) |
| POST | /ai/chat/sync | Sync chat |
| POST | /ai/analyze/relationship/:contactId | Analyze relationship |
| POST | /ai/analyze/event/:eventId | Analyze event |
| POST | /ai/analyze | Comprehensive analysis |
| POST | /mcp | MCP server endpoint |

## MCP Server

CuddleGecko exposes a [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) endpoint at `POST /api/mcp` using the Streamable HTTP transport. This allows external AI tools to interact with your CRM data directly.

### Connecting

The MCP endpoint is protected by JWT auth and requires a workspace context. Configure your MCP client:

```json
{
  "mcpServers": {
    "cuddlegecko": {
      "url": "http://localhost:8080/api/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_JWT_TOKEN>",
        "X-Workspace-ID": "2"
      }
    }
  }
}
```

### Available Tools (43)

| Category | Tools |
|----------|-------|
| Buddies | `list_buddies`, `get_buddy`, `create_buddy`, `update_buddy`, `delete_buddy`, `get_buddy_tags`, `set_buddy_tags` |
| Events | `list_events`, `create_event`, `update_event`, `delete_event` |
| Todos | `list_todos`, `create_todo`, `update_todo`, `toggle_todo`, `sync_todo_to_event`, `delete_todo` |
| Tags | `list_tags`, `create_tag`, `update_tag`, `delete_tag` |
| Transactions | `list_transactions`, `get_transaction_summary`, `create_transaction`, `update_transaction`, `delete_transaction` |
| Interactions | `list_interactions`, `create_interaction`, `update_interaction`, `delete_interaction` |
| Reminders | `list_reminders`, `create_reminder`, `update_reminder`, `delete_reminder` |
| Graph | `get_graph`, `get_relations`, `create_relation`, `delete_relation` |
| AI | `analyze_relationship`, `analyze_event`, `analyze_comprehensive` |
| Workspaces | `list_workspaces`, `switch_workspace` |

## Configuration

`config.yaml`:

```yaml
server:
  port: 8080
  mode: debug
database:
  driver: sqlite
  sqlite_path: ./data/cuddlegecko.db
  mysql_dsn: ""
jwt:
  secret: "your-secret-key"
  access_ttl: 15m
  refresh_ttl: 168h
ai:
  provider_type: ""    # e.g. deepseek, openai
  api_key: ""
  model: ""
  base_url: ""
```

Environment variables with `CG_` prefix: `CG_SERVER_PORT`, `CG_DATABASE_DRIVER`, `CG_AI_API_KEY`, `CG_AI_MODEL`, etc.

The AI configuration can be set via environment variables and acts as a fallback when no AI provider is activated in the database.

## Development

```bash
# Backend tests
go test ./...

# Frontend
cd web && npm run build    # production build
cd web && npm run lint     # ESLint
cd web && npm test         # Vitest unit tests
```

## License

GNU Affero General Public License v3.0 (AGPL-3.0)
