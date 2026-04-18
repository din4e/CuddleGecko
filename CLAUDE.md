# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CuddleGecko (小蜥抱抱) is a local-first personal CRM with network graph visualization, AI assistant, and finance tracking. Go backend + React SPA frontend. Supports Web mode (Gin server) and Desktop mode (Wails v2). Roadmap: Web → Desktop → SaaS cloud.

## Build & Run

```bash
# Backend
CG_CAPTCHA_ENABLED=false air          # hot-reload dev server (disables captcha for dev)
go run ./cmd/server                    # start on :8080 (no hot-reload)
go build -o cuddlegecko ./cmd/server   # build binary
go test ./...                          # all tests
go test ./internal/service/...         # single package
go test -run TestAuthService_Register_Success ./...  # single test
go vet ./...                           # lint

# Frontend
cd web && npm install
cd web && npm run dev       # dev server (127.0.0.1:3001)
cd web && npm run build     # production build
cd web && npm run lint      # ESLint

# Desktop (Wails v2)
wails dev                    # dev mode with hot reload
wails build                  # production build (outputs to build/bin/)
```

**Windows port note:** Port 5173 may be reserved by Hyper-V. Vite is configured to use port 3000, auto-fallback if occupied.

## Architecture

### Backend — Layered (Go)

```
cmd/server/main.go    → wires all dependencies (web mode entry point)
internal/handler/     → Gin HTTP handlers, thin layer calling services
internal/service/     → business logic, no HTTP awareness
internal/repository/  → GORM database access, interfaces defined in service package
internal/model/       → domain types (User, Contact, Tag, Interaction, Reminder, Relation, Event, Transaction, AIProvider, AIConversation, AIMessage)
pkg/config/           → Viper config with CG_ env prefix
pkg/database/         → GORM init, SQLite WAL mode / MySQL switch
pkg/llm/              → OpenAI-compatible LLM streaming client (pure net/http, no SDK)
pkg/middleware/       → JWT Bearer auth, CORS
pkg/response/         → unified JSON: {code, data, message}
```

### Desktop — Wails v2 (Go + React)

```
main.go               → wails.Run() entry point (desktop mode)
app.go                → App struct with startup/shutdown lifecycle
cmd/desktop/bindings/ → Wails binding structs wrapping services
  state.go            → global binding state + userID tracking
  auth.go, contact.go, tag.go, interaction.go, reminder.go, graph.go, event.go, transaction.go, ai.go
  export.go           → JSON import/export
  types.go            → request/response types for Wails bindings
wails.json            → Wails project configuration
web/src/wailsjs/      → auto-generated JS bindings (gitignored)
```

**Dual-mode frontend:** The React frontend supports two runtime modes:
- **Local mode** (desktop): Calls Go methods via Wails IPC bindings
- **Remote mode** (desktop/web): Calls HTTP API via axios

Mode switching is managed by `stores/mode.ts` using adapter interfaces defined in `api/adapter.ts`.

**Dependency injection:** Constructor functions, no global state. Service tests use mock repos.

**Repository error pattern:** `GetByID`/`GetUserByUsername` return raw GORM errors (service checks `gorm.ErrRecordNotFound`). Other methods wrap with `fmt.Errorf`.

### Frontend — SPA (React)

```
web/src/api/client.ts      → Axios with JWT interceptor + backend envelope unwrap
web/src/api/adapter.ts     → AppAdapters interface (dual-mode: HTTP vs Wails IPC)
web/src/api/http-adapter.ts → HTTP adapter using Axios
web/src/api/wails-adapter.ts → Wails IPC adapter using dynamic imports
web/src/api/{domain}.ts    → One module per domain (auth, contacts, tags, etc.)
web/src/types/index.ts     → TypeScript types matching Go models
web/src/stores/auth.ts     → Zustand auth store with localStorage persistence
web/src/stores/mode.ts     → Local/remote mode switching
web/src/stores/graphSettings.ts → Graph visualization settings
web/src/i18n/              → react-i18next setup with en/zh locales
web/src/layouts/AppLayout.tsx → Sidebar + header + dark mode toggle
web/src/components/ProtectedRoute.tsx → Redirect to /login if unauthenticated
web/src/components/GeckoIcon.tsx → SVG gecko logo
web/src/components/BuddyPicker.tsx → Multi-select buddy picker with search
web/src/components/ViewToggle.tsx → List/card view toggle
web/src/pages/             → Route-level views
```

**API response handling:** Backend wraps all responses in `{code, data, message}`. The Axios response interceptor in `client.ts` unwraps this so `res.data` is the actual payload. Pages access `res.data` directly.

**Auth flow:** Login/register stores tokens in localStorage → `checkAuth()` on app mount calls `/auth/me` → 401 triggers automatic refresh token retry → redirect to `/login` on failure.

## Key Domain Types

- **Contact** — name, email, phone, birthday, notes, relationship_labels (multi-select), avatar_emoji, avatar_url, tags[]
- **Interaction** — type (meeting/call/message/email), title, content, occurred_at
- **Tag** — name, color (hex)
- **Reminder** — title, description, remind_at, status (pending/done/snoozed)
- **ContactRelation** — contact_id_a, contact_id_b, relation_type
- **Event** — title, description, start_time, end_time, location, color, contact_ids[]
- **Transaction** — title, amount, type (income/expense), category, contact_ids[], date, notes
- **AIProvider** — provider_type, name, base_url, api_key, model, is_active
- **AIConversation** — user_id, title, messages[]
- **AIMessage** — conversation_id, role (user/assistant/system), content
- **RelationshipLabels** — family, friend, colleague, client, pet, other (multi-select, supports custom)

## Seed Data

```bash
go run ./cmd/seed   # creates demo/test123 account with sample buddies, tags, interactions, reminders, relations
```

## API Routes

All at `/api`, JWT-protected except auth endpoints:

| Group | Methods |
|-------|---------|
| Auth | POST register/login/refresh, GET me |
| Buddies | GET/POST list/create, GET/PUT/DELETE /:id, GET/PUT /:id/tags |
| Tags | GET/POST list/create, PUT/DELETE /:id |
| Interactions | GET/POST /buddies/:id/interactions, PUT/DELETE /:id |
| Reminders | GET list (status filter), POST /buddies/:id/reminders, PUT/DELETE /:id |
| Relations | GET/POST /buddies/:id/relations, DELETE /:id |
| Graph | GET /graph (nodes + edges) |
| Events | GET/POST list/create, PUT/DELETE /:id |
| Transactions | GET/POST list/create, GET /summary, PUT/DELETE /:id |
| AI | GET/PUT providers, POST activate/test, GET/POST conversations, POST chat (SSE), POST analyze |

## Conventions

- Bilingual project: UI text/comments may be Chinese (中文). Code, commit messages, API fields in English.
- Go: `context.Context` as first param. Return errors, don't panic.
- Frontend: Use path alias `@/` for imports (configured in vite.config.ts + tsconfig).
- Config env vars: `CG_` prefix with underscores for nesting (`CG_SERVER_PORT`, `CG_DATABASE_DRIVER`).
- Database: SQLite for desktop/web, MySQL for SaaS. Repository layer abstracts dialect differences.
