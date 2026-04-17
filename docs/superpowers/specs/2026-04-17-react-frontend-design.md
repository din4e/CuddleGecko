# CuddleGecko React Frontend MVP Design

**Date**: 2026-04-17
**Status**: Approved
**Scope**: Full MVP frontend — auth, contacts, tags, interactions, reminders, network graph

## Technology

| Area | Choice |
|------|--------|
| Framework | Vite + React 18 + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| State | Zustand |
| Routing | React Router v6 |
| HTTP | Axios |
| Graph | react-force-graph-2d |
| Charts | Recharts |
| Icons | Lucide React |

## UI Style

Clean modern design. Light/dark mode via Tailwind + shadcn/ui theme. No mascot elements. Focus on usability.

## Pages & Routes

| Route | Page | Description |
|-------|------|-------------|
| `/login` | Login | Login form |
| `/register` | Register | Registration form |
| `/` | Dashboard | Overview stats + upcoming reminders |
| `/contacts` | Contact List | Searchable, filterable, paginated contact list |
| `/contacts/:id` | Contact Detail | Contact info, interactions timeline, reminders, relations |
| `/graph` | Network Graph | Force-directed graph visualization |
| `/tags` | Tag Manager | CRUD tags with color picker |
| `/reminders` | Reminders | All reminders filtered by status |

## Architecture

```
web/
├── src/
│   ├── api/              # Axios API client per domain
│   ├── components/       # Shared UI components (shadcn/ui based)
│   ├── hooks/            # Custom React hooks
│   ├── layouts/          # App layout (sidebar + header + content)
│   ├── pages/            # Route-level page components
│   ├── stores/           # Zustand stores (auth, contacts, tags, etc.)
│   ├── types/            # TypeScript types matching backend models
│   ├── lib/              # Utility functions
│   ├── App.tsx           # Router setup
│   └── main.tsx          # Entry point
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

## State Management

Zustand stores:
- `useAuthStore` — user, tokens, login/logout/register actions
- `useContactStore` — contacts list, current contact, CRUD
- `useTagStore` — tags list, CRUD
- `useInteractionStore` — interactions per contact
- `useReminderStore` — reminders list, status filter
- `useRelationStore` — relations, graph data

Auth store persists tokens to localStorage. All stores use the API client.

## API Client

Single Axios instance in `src/api/client.ts`:
- Base URL: `http://localhost:8080/api`
- Request interceptor: attach `Authorization: Bearer <token>`
- Response interceptor: on 401, attempt refresh token, then redirect to login
- One module per domain: `auth.ts`, `contacts.ts`, `tags.ts`, `interactions.ts`, `reminders.ts`, `relations.ts`, `graph.ts`

## Key Components

### Layout
- Sidebar navigation (Dashboard, Contacts, Graph, Tags, Reminders)
- Header with user info + logout
- Content area

### Contact List
- Search bar + tag filter chips
- Card grid or table view
- Pagination controls
- Quick-add contact button

### Contact Detail
- Contact info card (editable)
- Tabs: Interactions | Reminders | Relations
- Interaction timeline (reverse chronological)
- Add interaction/reminder/relation modals

### Network Graph
- react-force-graph-2d canvas
- Node size by number of connections
- Node color by relationship type
- Click node to see contact details
- Click edge to see relation type

### Dashboard
- Stats cards (total contacts, interactions this week, pending reminders)
- Upcoming reminders list
- Recent interactions

## Backend API Endpoints (already implemented)

All endpoints at `http://localhost:8080/api`:
- Auth: POST register/login/refresh, GET me
- Contacts: GET/POST list/create, GET/PUT/DELETE /:id, GET/PUT /:id/tags
- Tags: GET/POST/PUT/DELETE
- Interactions: GET/POST /contacts/:id/interactions, PUT/DELETE /:id
- Reminders: GET/POST/PUT/DELETE
- Relations: GET/POST/DELETE
- Graph: GET /graph
