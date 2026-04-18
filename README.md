# CuddleGecko 小蜥抱抱

A local-first, self-hosted personal CRM with network graph visualization.

## Features

- **Contact Management** — CRUD with tags, relationship types, search & pagination
- **Interaction Timeline** — Record meetings, calls, messages per contact
- **Smart Reminders** — Schedule follow-ups with status tracking (pending/done/snoozed)
- **Network Graph** — Force-directed visualization of your relationship network
- **Tag System** — Color-coded tags for contact categorization
- **Dark Mode** — Green gecko brand theme with light/dark toggle
- **Auth** — JWT + refresh token with automatic retry

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go 1.24, Gin, GORM, SQLite/MySQL |
| Frontend | Vite, React 18, TypeScript, Tailwind CSS v4, shadcn/ui |
| State | Zustand |
| Graph | react-force-graph-2d |
| Charts | Recharts |

## Quick Start

```bash
# Backend (port 8080)
go run ./cmd/server

# Frontend (port 3001)
cd web && npm install && npm run dev
```

Open http://127.0.0.1:3001 and register an account.

## Project Structure

```
cmd/server/         # Entry point, dependency wiring
internal/
  handler/          # HTTP handlers (Gin)
  service/          # Business logic
  repository/       # Database access (GORM)
  model/            # Domain types
pkg/
  config/           # Viper config loading
  database/         # GORM init (SQLite/MySQL)
  middleware/        # JWT auth, CORS
  response/         # Unified JSON response helpers
web/src/
  api/              # Axios client + domain modules
  components/       # UI components (shadcn/ui + GeckoIcon)
  layouts/          # App layout with sidebar
  pages/            # Route-level views (7 pages)
  stores/           # Zustand stores (auth)
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
| GET/POST | /contacts | List/Create contacts |
| GET/PUT/DELETE | /contacts/:id | Contact CRUD |
| GET/PUT | /contacts/:id/tags | Contact tags |
| GET/POST | /contacts/:id/interactions | Interactions |
| POST | /contacts/:id/reminders | Create reminder |
| GET/POST | /contacts/:id/relations | Relations |
| GET/POST | /tags | Tag CRUD |
| PUT/DELETE | /tags/:id | Tag update/delete |
| PUT/DELETE | /interactions/:id | Interaction update/delete |
| GET | /reminders | List reminders (filter by status) |
| PUT/DELETE | /reminders/:id | Reminder update/delete |
| DELETE | /relations/:id | Delete relation |
| GET | /graph | Network graph data |

## Configuration

`config.yaml`:

```yaml
server:
  port: 8080
  debug: true
database:
  driver: sqlite    # sqlite or mysql
  path: ./data/cuddlegecko.db
  mysql_dsn: ""
jwt:
  secret: "your-secret-key"
  access_ttl: 900000000000      # 15 minutes
  refresh_ttl: 604800000000000  # 7 days
```

Environment variables with `CG_` prefix: `CG_SERVER_PORT`, `CG_DATABASE_DRIVER`, etc.

## Development

```bash
# Backend tests
go test ./...

# Frontend
cd web && npm run build    # production build
cd web && npm run lint     # ESLint
```

## License

MIT
