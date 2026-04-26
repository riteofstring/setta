# Chat Detached Surface Checklist (Append-Only)

## Rules
- This file is append-only.
- Do not edit, delete, or reorder existing lines.
- To update progress, append a new line in `Status Log` referencing the task ID.
- If a task changes meaning, append a new task ID in `Task Catalog` instead of rewriting old items.

## Status Values
- `planned`
- `in_progress`
- `blocked`
- `done`
- `deferred`

## Task Catalog (Append-Only)
- `CH-001` [P0] Extract shared project chat surface component from pane-specific host.
- `CH-002` [P0] Introduce per-instance chat window state model (replace singleton view state for windowed chat).
- `CH-003` [P0] Add global project chat window layer mount in `MainContainerCore`.
- `CH-004` [P1] Implement docked bottom-corner chat window (left/right anchor support).
- `CH-005` [P1] Implement minimize/restore launcher behavior for docked chat.
- `CH-006` [P1] Update Overview chat tab behavior to focus/open floating chat as primary.
- `CH-007` [P2] Implement undock + drag behavior with viewport clamping.
- `CH-008` [P2] Implement resize behavior for floating chat.
- `CH-009` [P2] Implement snap presets (left/right/quadrants) and restore behavior.
- `CH-010` [P2] Implement fullscreen/restore in chat window chrome.
- `CH-011` [P3] Add create/duplicate chat instance actions.
- `CH-012` [P3] Add close/focus/z-index ordering for multiple instances.
- `CH-013` [P4] Add dedicated route `/:projectConfigName/chat` and direct-load host.
- `CH-014` [P4] Add open-in-new-tab/window button next to fullscreen in chat chrome.
- `CH-015` [P4] Verify installability behavior from chat route (manifest/scope/launch behavior).
- `CH-016` [P5] Add optional mode to render project chat back in sidebar pane.
- `CH-017` [P5] Add reversible toggle between floating-primary and pane mode.
- `CH-018` [QA] Add/refresh Vitest coverage for window manager + route behavior.
- `CH-019` [QA] Add/refresh Playwright E2E for docking, floating controls, multi-instance, new route.
- `CH-020` [QA] Run CDP visual/perf verification and append perf notes under `perf/`.

## Status Log (Append-Only)
- `2026-02-24` | `planned` | `CH-001` | Initial worktree plan and checklist created.
- `2026-02-24` | `planned` | `CH-002` | Initial worktree plan and checklist created.
- `2026-02-24` | `planned` | `CH-003` | Initial worktree plan and checklist created.
- `2026-02-24` | `planned` | `CH-004` | Initial worktree plan and checklist created.
- `2026-02-24` | `planned` | `CH-005` | Initial worktree plan and checklist created.
- `2026-02-24` | `planned` | `CH-006` | Initial worktree plan and checklist created.
- `2026-02-24` | `planned` | `CH-007` | Initial worktree plan and checklist created.
- `2026-02-24` | `planned` | `CH-008` | Initial worktree plan and checklist created.
- `2026-02-24` | `planned` | `CH-009` | Initial worktree plan and checklist created.
- `2026-02-24` | `planned` | `CH-010` | Initial worktree plan and checklist created.
- `2026-02-24` | `planned` | `CH-011` | Initial worktree plan and checklist created.
- `2026-02-24` | `planned` | `CH-012` | Initial worktree plan and checklist created.
- `2026-02-24` | `planned` | `CH-013` | Initial worktree plan and checklist created.
- `2026-02-24` | `planned` | `CH-014` | Initial worktree plan and checklist created.
- `2026-02-24` | `planned` | `CH-015` | Initial worktree plan and checklist created.
- `2026-02-24` | `planned` | `CH-016` | Initial worktree plan and checklist created.
- `2026-02-24` | `planned` | `CH-017` | Initial worktree plan and checklist created.
- `2026-02-24` | `planned` | `CH-018` | Initial worktree plan and checklist created.
- `2026-02-24` | `planned` | `CH-019` | Initial worktree plan and checklist created.
- `2026-02-24` | `planned` | `CH-020` | Initial worktree plan and checklist created.

## Entry Template (Append New Lines Only)
- `YYYY-MM-DD` | `<planned|in_progress|blocked|done|deferred>` | `CH-XXX` | `<concise note>`
