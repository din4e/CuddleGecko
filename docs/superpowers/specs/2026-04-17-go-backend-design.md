# CuddleGecko Go Backend MVP Design

**Date**: 2026-04-17
**Status**: Approved
**Scope**: Full MVP backend — contacts, interactions, tags, reminders, network graph, auth

## Technology Decisions

| Area | Choice |
|------|--------|
| Language | Go 1.24 |
| HTTP Framework | Gin |
| ORM | GORM (SQLite + MySQL) |
| Auth | JWT (access 15m + refresh 7d, bcrypt passwords) |
| Config | Viper + YAML, env var overrides with `CG_` prefix |
| API Style | Pure RESTful JSON |

## Architecture

**Pattern**: Layered architecture — handler → service → repository → model.

Layer rules:
- Handlers depend on services. Services depend on repositories. Repositories depend on models.
- No reverse dependencies or cross-layer calls.
- Each layer is tested independently via interfaces.

### Project Structure

```
cuddlegecko/
├── cmd/
│   └── server/
│       └── main.go              # Entry point: load config, init DB, register routes, start HTTP
├── internal/
│   ├── handler/                 # HTTP layer (Gin handlers)
│   │   ├── contact.go
│   │   ├── interaction.go
│   │   ├── tag.go
│   │   ├── reminder.go
│   │   ├── graph.go
│   │   └── auth.go
│   ├── service/                 # Business logic layer
│   │   ├── contact.go
│   │   ├── interaction.go
│   │   ├── tag.go
│   │   ├── reminder.go
│   │   └── auth.go
│   ├── repository/              # Data access layer (GORM)
│   │   ├── contact.go
│   │   ├── interaction.go
│   │   ├── tag.go
│   │   ├── reminder.go
│   │   ├── relation.go
│   │   └── user.go
│   └── model/                   # Domain models (GORM models)
│       ├── contact.go
│       ├── interaction.go
│       ├── tag.go
│       ├── reminder.go
│       ├── relation.go
│       ├── refresh_token.go
│       └── user.go
├── pkg/
│   ├── config/                  # Viper config loading
│   ├── response/                # Unified JSON response helpers
│   ├── middleware/               # JWT auth middleware, CORS, logging
│   └── database/                # GORM init (SQLite/MySQL switch)
├── migrations/                  # SQL migration files (GORM AutoMigrate backup)
├── config.yaml                  # Default configuration
├── go.mod
├── go.sum
└── CLAUDE.md
```

## Database Schema

### Tables

**users** — MVP single user, multi-user ready

| Column | Type | Notes |
|--------|------|-------|
| id | uint (PK) | Auto increment |
| username | string (unique) | |
| email | string (unique) | |
| password_hash | string | bcrypt |
| created_at | datetime | GORM auto |
| updated_at | datetime | GORM auto |

**refresh_tokens** — JWT refresh token storage

| Column | Type | Notes |
|--------|------|-------|
| id | uint (PK) | |
| user_id | uint (FK → users) | |
| token | string (unique) | Opaque token string |
| expires_at | datetime | Expiration time |
| revoked | bool | Revocation flag |
| created_at | datetime | GORM auto |

**contacts**

| Column | Type | Notes |
|--------|------|-------|
| id | uint (PK) | |
| user_id | uint (FK → users) | Multi-tenant ready |
| name | string | Required |
| nickname | string | Optional |
| avatar_url | string | Optional |
| phone | string | Optional |
| email | string | Optional |
| birthday | date | Optional |
| notes | text | Optional |
| relationship_type | enum | family, friend, colleague, client, other |
| created_at | datetime | GORM auto |
| updated_at | datetime | GORM auto |
| deleted_at | datetime | Soft delete |

**tags**

| Column | Type | Notes |
|--------|------|-------|
| id | uint (PK) | |
| user_id | uint (FK → users) | |
| name | string (unique per user) | |
| color | string | Hex color code |
| created_at | datetime | GORM auto |

**contact_tags** — Many-to-many join table

| Column | Type | Notes |
|--------|------|-------|
| contact_id | uint (FK → contacts) | |
| tag_id | uint (FK → tags) | |

**interactions**

| Column | Type | Notes |
|--------|------|-------|
| id | uint (PK) | |
| user_id | uint (FK → users) | |
| contact_id | uint (FK → contacts) | |
| type | enum | meeting, call, message, email, other |
| title | string | |
| content | text | Optional |
| occurred_at | datetime | When it happened |
| created_at | datetime | GORM auto |
| updated_at | datetime | GORM auto |
| deleted_at | datetime | Soft delete |

**reminders**

| Column | Type | Notes |
|--------|------|-------|
| id | uint (PK) | |
| user_id | uint (FK → users) | |
| contact_id | uint (FK → contacts) | |
| title | string | |
| description | text | Optional |
| remind_at | datetime | When to remind |
| status | enum | pending, done, snoozed |
| created_at | datetime | GORM auto |
| updated_at | datetime | GORM auto |

**contact_relations** — Network graph edges

| Column | Type | Notes |
|--------|------|-------|
| id | uint (PK) | |
| user_id | uint (FK → users) | |
| contact_id_a | uint (FK → contacts) | |
| contact_id_b | uint (FK → contacts) | |
| relation_type | string | e.g. "colleague", "friend" |
| created_at | datetime | GORM auto |

All tables include `user_id` for future multi-tenant support. `contacts` and `interactions` use GORM soft delete (`deleted_at`).

## API Routes

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/register | Register user, return JWT + refresh token |
| POST | /api/auth/login | Login, return JWT + refresh token |
| POST | /api/auth/refresh | Exchange refresh token for new JWT |
| GET | /api/auth/me | Get current user info |

### Contacts

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/contacts | List (pagination + search + tag filter) |
| POST | /api/contacts | Create |
| GET | /api/contacts/:id | Detail |
| PUT | /api/contacts/:id | Update |
| DELETE | /api/contacts/:id | Soft delete |

### Contact Tags

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/contacts/:id/tags | Get contact's tags |
| PUT | /api/contacts/:id/tags | Replace contact's tags |

### Tags

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/tags | List all |
| POST | /api/tags | Create |
| PUT | /api/tags/:id | Update |
| DELETE | /api/tags/:id | Delete |

### Interactions

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/contacts/:id/interactions | Interaction timeline for a contact |
| POST | /api/contacts/:id/interactions | Add interaction |
| PUT | /api/interactions/:id | Update |
| DELETE | /api/interactions/:id | Delete |

### Reminders

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/reminders | List (filter by status) |
| POST | /api/contacts/:id/reminders | Create reminder |
| PUT | /api/reminders/:id | Update (including snooze) |
| DELETE | /api/reminders/:id | Delete |

### Contact Relations

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/contacts/:id/relations | Get contact's relations |
| POST | /api/contacts/:id/relations | Add relation |
| DELETE | /api/relations/:id | Remove relation |

### Network Graph

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/graph | Full network graph data (nodes + edges) |

### Response Format

```json
{"code": 0, "data": {...}, "message": "success"}
```

Error example:
```json
{"code": 40001, "data": null, "message": "contact not found"}
```

Pagination: `?page=1&page_size=20`, response includes `total` and `items`.

## Authentication Flow

```
Register → POST /api/auth/register → JWT (15min) + Refresh Token (7d)
Login    → POST /api/auth/login    → JWT + Refresh Token
Request  → Authorization: Bearer <JWT>
Refresh  → POST /api/auth/refresh  → Exchange refresh token for new JWT
```

- Passwords hashed with bcrypt
- JWT payload: `user_id` + `exp`
- All `/api/*` routes (except auth) protected by JWT middleware
- Refresh tokens stored in database, revocable

## Configuration

### config.yaml

```yaml
server:
  port: 8080
  mode: debug  # debug | release

database:
  driver: sqlite        # sqlite | mysql
  sqlite_path: ./data/cuddlegecko.db
  mysql_dsn: ""         # user:pass@tcp(127.0.0.1:3306)/cuddlegecko?parseTime=true

jwt:
  secret: "change-me-in-production"
  access_ttl: 15m
  refresh_ttl: 168h     # 7 days

log:
  level: info
  format: json          # json | text
```

### Precedence

Environment variables (prefixed `CG_`) > config.yaml > defaults.

Examples:
- `CG_DB_DRIVER=mysql`
- `CG_SERVER_PORT=3000`
- `CG_JWT_SECRET=my-secret-key`

## Database Abstraction

GORM handles dialect differences between SQLite and MySQL. The `pkg/database/` package:

1. Reads `database.driver` from config
2. Initializes the appropriate GORM dialector (SQLite file or MySQL DSN)
3. Returns a `*gorm.DB` instance injected into repositories
4. Runs `AutoMigrate` on startup for all models

SQLite-specific notes:
- File stored at `database.sqlite_path` (default `./data/cuddlegecko.db`)
- `WAL` journal mode enabled for concurrent read performance

MySQL-specific notes:
- Connection via `database.mysql_dsn`
- `parseTime=true` required for GORM time handling

## Key Dependencies

```
github.com/gin-gonic/gin          # HTTP framework
gorm.io/gorm                       # ORM
gorm.io/driver/sqlite              # SQLite driver
gorm.io/driver/mysql               # MySQL driver
github.com/golang-jwt/jwt/v5       # JWT
golang.org/x/crypto                # bcrypt
github.com/spf13/viper             # Configuration
```

## Error Handling

- Handlers catch service errors and return appropriate HTTP status codes
- Services return `fmt.Errorf` with descriptive messages
- Repositories wrap GORM errors with context
- No panic in handler/service layers
- Validation errors return 400 with field-level messages

## Future Considerations (Out of Scope for MVP)

- Wails desktop integration (reuse service layer)
- WebSocket for real-time reminders
- Data import/export (JSON/CSV)
- AI-powered contact enrichment
- Multi-tenant with role-based access control
- PWA push notifications
