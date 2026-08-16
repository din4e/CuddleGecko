# docs/ — historical MVP plans

Everything under `superpowers/` is the **original 2026-04-17 MVP planning set**
(specs + implementation plans for the Go backend and React frontend), frozen
as written before the v0.1.0 build. They reflect the project at that date —
e.g. "Go 1.24" (now 1.25), no todos/workouts/MCP/realtime modules, and a
planned Wails dual-mode that has since moved to the CuddleGeckoDesktop repo.

They are kept for history and are **not current documentation**. For the
present-day architecture, conventions, and API surface, see:

- `README.md` (repo root) — features, quick start, deployment, endpoints, MCP
- `AGENTS.md` — architecture + the engineering conventions that are enforced
  by tests/CI (stats aggregation patterns, recursive-CTE cascade, optimistic
  updates, terminal sanitization, …)
- `web/README.md` — frontend commands, layout, and conventions

Do not extend the files in `superpowers/`; new specs/plans should live in a
new dated directory alongside them.
