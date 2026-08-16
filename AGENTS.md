# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CuddleGecko (小蜥抱抱) is a local-first personal CRM with network graph visualization, AI assistant, finance tracking, todos (nested tree + pomodoro), and fitness/workout tracking. Go backend + React SPA frontend. **Web-only repo** — the Wails desktop client lives in the separate **CuddleGeckoDesktop** repo (split in commit 03a8f82; no desktop/, wails.json, or wails-adapter here).

## Build & Run

```bash
# Backend
CG_CAPTCHA_ENABLED=false air          # hot-reload dev server (disables captcha for dev)
go run ./cmd/server                   # start on :8080 (no hot-reload)
go build -o cuddlegecko ./cmd/server  # build binary
go test ./...                         # all tests (CI also runs -race)
go test ./internal/service/...        # single package
go vet ./...                          # lint

# Frontend
cd web && npm install
cd web && npm run dev        # dev server (127.0.0.1:3001)
cd web && npm run build      # production build (CI gate)
cd web && npm run lint       # ESLint (0 errors required)
cd web && npm test           # Vitest

# Type-check — GOTCHA: use the app project config.
cd web && npx tsc -p tsconfig.app.json --noEmit
# A bare `tsc --noEmit` at the repo root is a NO-OP (project references) —
# it silently checks nothing and has masked real type errors before.

# Seed / audit
go run ./cmd/seed                              # demo/test123 account with sample data
go run golang.org/x/vuln/cmd/govulncheck@latest ./...  # CVE audit (CI gate)
```

CI (`.github/workflows/ci.yml`): backend build + vet + test `-race` + govulncheck; frontend tsc(app) + lint + vitest + production build. Runs on push to main/dev and PRs.

## Architecture

### Backend — Layered (Go)

```
cmd/server/main.go    → wires all dependencies (entry point)
cmd/seed, cmd/seed-stress, cmd/migrate → data tooling
internal/handler/     → Gin HTTP handlers, thin layer calling services
internal/service/     → business logic + VALIDATION (service layer validates, so
                        MCP tools can't bypass HTTP binding rules — see validation.go)
internal/repository/  → GORM access; interfaces defined in service package
internal/model/       → domain types + composite index tags (tested in indexes_test.go)
internal/mcp/         → MCP server (JSON-RPC 2.0, Streamable HTTP) for external AI tools
internal/realtime/    → WebSocket hub for multi-device todo sync
pkg/config/           → Viper config, CG_ env prefix
pkg/database/         → GORM init: SQLite WAL (single conn) / MySQL
pkg/llm/              → OpenAI-compatible streaming client (pure net/http)
pkg/middleware/       → JWT auth, CORS, IP rate limiting, workspace-membership cache
pkg/response/         → unified JSON: {code, data, message}
```

**Key backend patterns (established, tested — keep them):**
- **Stats** = single-pass conditional aggregation (`SUM(CASE WHEN …)`), never N COUNT queries.
- **Todo cascade** delete/restore + cycle check = recursive CTEs (`subtreeIDs`, `ancestorChainContains`), never full-graph loads.
- **Reorder** = one `UPDATE … SET sort_order = CASE id WHEN …` (`renumberSortOrder`), never per-row UPDATE loops.
- **Pagination** = `clampPage(page, pageSize)` in every repo List; `maxPageSize = 100000` (deliberately large — export reads full sets through the same Lists; a tight cap silently truncates backups).
- **Cross-driver SQL**: contact-id JSON filters branch on `Dialector.Name()` (SQLite `json_each` / MySQL `JSON_CONTAINS`/`JSON_OVERLAPS`); month bucketing uses `substr(date,1,7)` on SQLite (NOT `strftime` — it converts to UTC and mis-buckets non-UTC dates).
- **Error mapping**: service validators return sentinel errors (`ErrInvalidTransaction` …) wrapped with `%w`; handlers map them to 400 via `errors.Is`.
- **Rate limits**: `/api/auth/*` 10/min/IP; AI LLM routes (`/ai/chat`, `/ai/chat/sync`, `/ai/analyze/*`) 20/min; `/api/captcha` 30/min (router.go).

### Frontend — SPA (React 19 + Vite + TS)

```
web/src/api/           # one module per domain; Axios client unwraps {code,data,message}
web/src/hooks/api/     # TanStack Query hooks — THE way to fetch (30s staleTime, cached across pages)
web/src/stores/        # Zustand: auth, workspace, pomodoro, navConfig, mode (HTTP adapter singleton)
web/src/components/    # dialogs, pickers, cards, TodoTreeRow, terminal/ (xterm + sanitized formatters)
web/src/lib/           # utils (cn, isoToLocalInput), ics (RFC5545 folding), quickAdd, wsSync
web/src/i18n/          # react-i18next, en/zh locales — ALL UI strings through t()
web/src/layouts/       # AppLayout + PomodoroBar (isolated so store ticks don't re-render the app)
web/src/pages/         # route-level views
```

**Key frontend patterns (established, tested — keep them):**
- Fetch via the shared hooks; NEVER raw `useEffect` + setState (defeats the cache).
- Invalidate by scope prefix: `qc.invalidateQueries({ queryKey: rootKey('contacts') })`.
- Mutation errors: global `MutationCache onError` toasts unless the hook sets `meta: { localErrorHandling: true }`.
- datetime-local inputs load via `isoToLocalInput()` (lib/utils) — slicing ISO shifts by the UTC offset per edit.
- Optimistic updates: `getQueriesData` + per-key `setQueryData` (the `setQueriesData` updater takes ONE arg — a second `query` param is undefined; regression tests in hooks/api/__tests__/).
- Terminal: user text MUST pass `sanitize()` (components/terminal/formatters.ts) before xterm.
- Dark mode via `useIsDarkMode()` hook, not per-frame classList reads.

**SSE wire format**: AI stream tokens are JSON envelopes (`data: {"c":"…"}` / `{"error":"…"}`), never raw text (newline-in-token framing). Out-of-tree clients must parse the envelope.

## Key Domain Types

- **Contact** — name, nickname, email, phone, birthday, notes, relationship_labels, avatar_emoji, avatar_url, tags[]
- **Interaction** — type (meeting/call/message/email), title, content, occurred_at
- **Tag** — name, color (hex)
- **Reminder** — title, description, remind_at, status (pending/done/snoozed), contact_id
- **ContactRelation** — contact_id_a, contact_id_b, relation_type
- **Event** — title, description, start_time, end_time, location, color, contact_ids[]
- **Todo** — title, description, status, priority, pinned, due_time, start_time, repeat/repeat_interval, sort_order, parent_id (nested tree), item_total/item_done, pomodoro_count, contact_ids[], tags[]
- **Workout** — name, type, status, intensity, scheduled_at, duration, calories, exercises[] (sets/reps/weight), sort_order
- **BodyMetric** — recorded_at, weight, height, body_fat, resting_hr, sleep, steps, energy, mood
- **Transaction** — title, amount, type (income/expense), category, contact_ids[], date, notes
- **AIProvider / AIConversation / AIMessage**

## API Routes (at /api, JWT-protected except auth/captcha/ws)

| Group | Methods |
|-------|---------|
| Auth | POST register/login/refresh, GET me (rate-limited) |
| Buddies | GET/POST, GET/PUT/DELETE /:id, tags; ?contact_id= filters on reminders |
| Contacts/Tags/Interactions/Relations | CRUD |
| Graph | GET /graph (projected nodes, no tag preload) |
| Events | CRUD + `?q=` title search |
| Todos | CRUD + trash (cascade), PATCH toggle, POST move/reorder (tree), sync-event, items (subtasks), bulk |
| Workouts | CRUD + exercises, toggle, reorder; body metrics CRUD + summary |
| Transactions | CRUD + /summary + **/monthly** (dashboard aggregate) + `?q=` search + `?contact_id=` (JSON contains) |
| AI | providers, conversations, POST chat (SSE envelope), analyze/* (rate-limited) |
| MCP | POST /mcp |

## Conventions

- Bilingual project: UI text/comments may be Chinese (中文). Code, commit messages, API fields in English.
- Go: `context.Context` first param; return errors, don't panic; repo GetByID returns raw GORM errors (service checks `gorm.ErrRecordNotFound`).
- Frontend: path alias `@/`; all UI strings via `t()`; i18n keys added to BOTH en and zh locales.
- Config env vars: `CG_` prefix (`CG_SERVER_PORT`, `CG_DATABASE_DRIVER`).
- Database: SQLite default (WAL, single conn), MySQL optional (docker-compose DSN); repository layer branches where dialect SQL differs.
- Verification bar: backend `go build && go vet && go test ./...`; frontend `tsc -p tsconfig.app.json --noEmit && npm run lint && npx vitest run`.
