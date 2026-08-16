# CuddleGecko Web (frontend)

React 19 + Vite + TypeScript SPA for CuddleGecko — the web client for the Go
backend in the repo root. Bilingual (zh/en) via react-i18next, dark mode,
Zustand stores + TanStack Query for server state.

> The Wails desktop client lives in the separate **CuddleGeckoDesktop** repo;
> this build is web-only (one HTTP adapter — see `src/stores/mode.ts`).

## Commands

```bash
npm install
npm run dev       # dev server (127.0.0.1:3001)
npm run build     # production build (also a CI gate)
npm run lint      # ESLint
npm test          # Vitest unit tests (or: npx vitest run)
```

**Type-checking gotcha**: use `npx tsc -p tsconfig.app.json --noEmit`. A bare
`tsc --noEmit` at the repo root is a **no-op** (root tsconfig only references
projects) — it silently checks nothing, and has masked real type errors before.

## Layout

```
src/api/          # One module per domain; request client unwraps {code,data,message}
src/hooks/api/    # TanStack Query hooks (useXxxList / useXxx mutations)
src/stores/       # Zustand: auth, workspace, pomodoro, navConfig, mode (HTTP adapter singleton)
src/components/   # Dialogs, pickers, cards, list rows, terminal/
src/pages/        # Route-level views
src/lib/          # utils (cn, isoToLocalInput), ics, quickAdd, wsSync, constants
src/i18n/         # react-i18next setup + en/zh locales
src/layouts/      # AppLayout (sidebar) + PomodoroBar
```

## Conventions

- **Server state → TanStack Query** (`src/hooks/api/`). List pages use the
  shared hooks (30s staleTime, cached across pages) — do NOT fetch in raw
  `useEffect` + `setState`; that defeats the cache and re-pulls per mount.
- **Query keys** are workspace-scoped via `rootKey(scope)` in
  `src/hooks/api/keys.ts`. Invalidate with the scope prefix, e.g.
  `qc.invalidateQueries({ queryKey: rootKey('contacts') })`.
- **Mutation errors**: a global `MutationCache onError` (in `main.tsx`) toasts
  `common.error` unless the hook sets `meta: { localErrorHandling: true }`
  (used when the call site shows a specific message).
- **datetime-local ↔ ISO**: always load inputs via `isoToLocalInput()` from
  `lib/utils` — slicing the ISO string hands UTC wall-time to a local-time
  input and shifts the value by the UTC offset on every edit.
- **Optimistic updates**: use the TanStack v5 pattern in
  `useTodos.ts` (`getQueriesData` + per-key `setQueryData`; the updater passed
  to `setQueriesData` receives only ONE argument — a second `query` param is
  `undefined` and has shipped a real bug). Regression tests live in
  `src/hooks/api/__tests__/`.
- **Terminal**: user-controlled text must go through the `sanitize()` in
  `components/terminal/formatters.ts` before it reaches xterm (escape-sequence
  injection).
- **Dark mode**: read it via `useIsDarkMode()` (`hooks/useIsDarkMode.ts`), not
  by touching `classList` per frame.
- **i18n**: all UI strings through `t()`; keys live in `src/i18n/locales/{en,zh}.ts`.

## Testing notes

- Vitest config: jsdom + setup file (`src/test/setup.ts`).
- Mocking `react-i18next` in page tests? Provide `initReactI18next` in the mock
  (pages import i18n transitively; without it the suite fails at import).
- Hook tests that hit `rootKey`/localStorage: mock `hooks/api/keys` for
  deterministic query keys, and set `gcTime: Infinity` if you seed inactive
  cache entries you later assert on.

See the root README for backend API endpoints, the MCP server, and CI details.
