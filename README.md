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
| Backend | Go 1.25, Gin, GORM, SQLite/MySQL |
| Frontend | Vite, React 19, TypeScript, Tailwind CSS v4, shadcn/ui |
| Testing (Go) | testify, httptest |
| Testing (JS) | Vitest, @testing-library/react, jsdom |
| State | Zustand |
| i18n | react-i18next |
| Graph | react-force-graph-2d |
| Charts | Recharts |
| Terminal | xterm.js |
| AI Icons | @lobehub/icons-static-svg (CDN) |

## Brand Icon

The app icon is `web/public/icon.png` (a square PNG, ~1254×1254). It's used as:

- the browser **favicon** and **apple-touch-icon** (`web/index.html`),
- the logo on the **login / register** pages and the **sidebar** (`<img src="/icon.png">` in `AuthScaffold`, `LoginPage`, `RegisterPage`, `AppLayout`).

To replace it: drop a new `icon.png` into `web/public/`, then rebuild the frontend:

```bash
docker compose build web && docker compose up -d web
```

The favicon link carries a `?v=` cache-buster in `web/index.html` — bump it when you ship a new icon so browsers refetch. Browsers cache favicons aggressively, so a hard reload (Ctrl+Shift+R) or an incognito window may be needed to see the new one.

> The About card also shows a WeChat official-account QR code (`web/public/wechat-qr.jpg`); replace it the same way.

## Quick Start

### Dev mode (SQLite, two terminals)

```bash
# Backend (port 8080)
go run ./cmd/server

# Frontend (port 5173)
cd web && npm install && npm run dev
```

Open http://127.0.0.1:5173 and register an account.

### Docker Compose (MySQL + nginx, production-style)

Requires Docker with Compose v2.

```bash
cp .env.example .env
# Edit .env: set MYSQL_* passwords and generate CG_JWT_SECRET (>= 32 chars)
#   openssl rand -hex 32

docker compose build       # ~3-5 min the first time (Go build + npm ci + Vite build)
docker compose up -d
```

Services:

| Service | Image | Notes |
|---------|-------|-------|
| `mysql` | `mysql:8.0` | Named volume `mysql_data`, healthchecked, not exposed to host |
| `app` | built from `Dockerfile` | CGO-enabled Go binary, not exposed to host |
| `web` | built from `web/Dockerfile` | nginx serving baked `dist/` (no bind-mount), exposed on host port `80` |

nginx reverse-proxies `/api/` and `/avatars/` to `app:8080`; all other routes fall back to the SPA. `proxy_buffering off` on `/api/` keeps AI chat streaming token-by-token.

Browse `http://<host>/` and register. Re-deploying the frontend requires `docker compose build web` since `dist/` is baked into the image.

Persisted state lives in the `mysql_data` and `avatar_data` named volumes. `docker compose down -v` wipes both.

## 启用 HTTPS（SSL）

TLS 在 `web`（nginx）容器终止，由 `.env` 控制，支持三种证书来源。移动端（iOS/Android）默认只信任公网 CA 签发的证书。

### 1. 自签名（内网 / 无域名，最快）
```bash
# .env
SSL_ENABLED=true
SSL_MODE=selfsigned
SSL_DOMAIN=your.host.or.ip
SSL_EXTRA_DOMAINS=192.168.31.4     # 可选，附加 SAN（多域名/内网IP）
SSL_USE_CA=false                    # true=生成本地根CA再签发，移动端只需信任一个根证书
```
```bash
docker compose up -d --build
```
移动端需手动信任：`SSL_USE_CA=true` 时导出根 CA 再导入一次即可——
```bash
docker compose exec web cat /etc/nginx/certs/ca.crt > ca.crt
# iOS：AirDrop/邮件发送 ca.crt → 设置→已下载描述文件→安装→关于本机→证书信任设置→启用
# Android：设置→安全→加密与凭据→安装证书→CA 证书
```

### 2. Let's Encrypt（有公网域名，移动端零配置）
```bash
# .env
SSL_ENABLED=true
SSL_MODE=letsencrypt
SSL_DOMAIN=app.example.com
SSL_EMAIL=you@example.com
SSL_LE_CHALLENGE=webroot     # 公网服务器，80 可达
# 内网/NAT/无公网80 → 用 DNS-01（需 DNS 提供商 API）：
#   SSL_LE_CHALLENGE=dns
#   SSL_LE_DNS_PROVIDER=dns_cf   # 并设置 CF_Token / CF_Account_Id 等环境变量（见 acme.sh 文档）
```
首次签发容器会自动引导（webroot）或直接签发（dns），之后每 12h 自动续期并 reload。
先用 staging 测试（不消耗正式额度，签发的是不被信任的测试证书）：
```bash
SSL_LE_STAGING=true   # 测试成功后改回 false 重新部署
```

### 3. 自带证书（manual）
把已有证书放到 `${SSL_CERT_DIR}`（默认 `./data/certs`），命名 `fullchain.pem` 与 `privkey.pem`：
```bash
# .env
SSL_ENABLED=true
SSL_MODE=manual
```

### 切换证书模式 / 更换证书
容器仅在**启动时**读取证书。改了 `.env` 或替换了 `./data/certs` 下的证书后，必须重建 `web` 容器才会生效（仅删除证书文件不会影响正在运行的容器）：
```bash
docker compose up -d --force-recreate web
```

### 关闭 SSL
```bash
SSL_ENABLED=false   # 纯 HTTP，行为同未启用 SSL
```

> HSTS（`SSL_HSTS=true`，默认开）会让浏览器强制 HTTPS，近乎不可逆，仅长期 HTTPS 部署建议开启。
>
> 自签名 / manual 证书下 nginx 启动会出现一条 `ssl_stapling ... issuer certificate not found` 警告（OCSP stapling 对无独立颁发者的证书自动禁用），属正常现象，不影响服务。Let's Encrypt / 公网 CA 证书无此警告。

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
  database/         # GORM init (SQLite/MySQL, MySQL connect retry)
  llm/              # OpenAI-compatible LLM streaming client
  middleware/        # JWT auth, CORS, workspace auth
  response/         # Unified JSON response helpers
Dockerfile          # Multi-stage Go build (CGO + alpine runtime)
docker-compose.yml  # mysql + app + web stack
.env.example        # Template for compose env
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
  avatar_dir: ./data/avatars
database:
  driver: sqlite           # sqlite | mysql
  sqlite_path: ./data/cuddlegecko.db
  mysql_dsn: ""            # user:pass@tcp(host:3306)/dbname?charset=utf8mb4&parseTime=True&loc=Local
jwt:
  secret: "your-secret-key"   # must be >= 32 chars
  access_ttl: 15m
  refresh_ttl: 168h
captcha:
  enabled: true
  length: 4
ai:
  provider_type: ""    # e.g. deepseek, openai
  api_key: ""
  model: ""
  base_url: ""
```

Environment variables with `CG_` prefix (dots become underscores): `CG_SERVER_PORT`, `CG_SERVER_AVATAR_DIR`, `CG_DATABASE_DRIVER`, `CG_DATABASE_MYSQL_DSN`, `CG_CAPTCHA_ENABLED`, `CG_AI_API_KEY`, `CG_AI_MODEL`, etc.

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
