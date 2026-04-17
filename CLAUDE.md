# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CuddleGecko (小蜥抱抱) is a local-first, self-hosted personal CRM/PRM with network visualization. Go backend + React frontend, with planned Wails desktop and SaaS cloud versions.

Development priority: **Web (Go API + React SPA)** → Desktop (Wails v2) → SaaS cloud.

## Tech Stack

- **Backend**: Go + Gin
- **Frontend**: Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Visualization**: react-force-graph + Recharts
- **State Management**: Zustand
- **Desktop**: Wails v2 (future)
- **Auth**: JWT + Refresh Token

## Build & Development Commands

```bash
# Go backend
go build -o cuddlegecko ./cmd/server
go run ./cmd/server
go test ./...
go test ./internal/contacts/...          # single package
go test -run TestContactCreate ./...     # single test

# Go linting
go vet ./...

# Frontend (from web/ directory)
cd web && npm install
cd web && npm run dev          # dev server
cd web && npm run build        # production build
cd web && npm run lint         # ESLint
cd web && npm run test         # Vitest
```

## Architecture

### Backend (Go)
- `cmd/server/` — entry point, wires dependencies
- `internal/` — all application code, no external imports of this package
  - `handler/` — HTTP handlers (Gin router groups), thin layer calling services
  - `service/` — business logic, no HTTP awareness
  - `repository/` — database access (abstracted for SQLite / MySQL compatibility)
  - `model/` — domain types (Contact, Interaction, Tag, Reminder)
- `pkg/` — reusable utilities that could be extracted (e.g., response helpers)
- `migrations/` — SQL migration files

### Frontend (web/)
- Standard Vite + React SPA structure
- `src/components/` — UI components (shadcn/ui based)
- `src/pages/` — route-level views
- `src/stores/` — Zustand state stores
- `src/api/` — backend API client

### Key Domain Concepts
- **Contact**: core entity with name, tags, relationship type, custom fields
- **Interaction**: timestamped record of contact events (meetings, calls, messages)
- **Network Graph**: contacts as nodes, relationships as edges, rendered via react-force-graph
- **Reminder**: scheduled follow-up prompts tied to contacts

## Go Conventions

- Use Go 1.22+ (standard library HTTP patterns where possible)
- Dependency injection via constructor functions, not global state
- Error handling: return errors, don't panic in handlers/services
- Repository pattern for DB access — keep SQL in repository layer only
- Handlers return structured JSON responses: `{"data": ..., "error": ...}`
- Use `context.Context` as first parameter in service/repository methods
- Database selection by deployment mode:
  - **Wails Desktop**: SQLite only
  - **Web (self-hosted)**: SQLite or MySQL (configurable)
  - **SaaS (cloud)**: MySQL only
- Repository layer must abstract SQL dialect differences (e.g., `AUTOINCREMENT` vs `AUTO_INCREMENT`, date functions)

## API Design

RESTful JSON API. Route groups:
- `GET/POST /api/contacts` — list/create contacts
- `GET/PUT/DELETE /api/contacts/:id` — contact CRUD
- `GET/POST /api/contacts/:id/interactions` — interaction timeline
- `GET/POST /api/tags` — tag management
- `GET /api/graph` — network graph data (nodes + edges)

## Language

This is a bilingual project. UI text and comments may be in Chinese (中文). Code identifiers, commit messages, and API fields are in English.
