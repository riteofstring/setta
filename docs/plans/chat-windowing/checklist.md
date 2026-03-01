# Chat Windowing v1 Checklist (Append-Only)

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
- `CW-001` [P0] Extract unified host-agnostic chat surface for bottom/floating/maximized/canvas-section hosts.
- `CW-002` [P0] Replace current separate section chat implementation with unified chat surface modes.
- `CW-003` [P0] Introduce chat window manager state model with chat-first generic-friendly primitives.
- `CW-004` [P0] Wire per-project DB-backed persistence for runtime chat/window state.
- `CW-005` [P0] Add settings JSON defaults plumbing for auto-create and shortcut bindings.
- `CW-006` [P1] Add bottom strip host with X-style pills and persistent `+` action.
- `CW-007` [P1] Implement `+` flow to create immediately-open docked chat instance.
- `CW-008` [P1] Implement multi-open docked layout with equal-width behavior and resize handles.
- `CW-009` [P1] Implement overflow behavior (`title -> icon`) plus left/right cycle controls.
- `CW-010` [P1] Implement close-as-hide semantics while preserving instance/thread state.
- `CW-011` [P1] Implement right-pane Chat Manager reopen flow that restores prior placement/geometry.
- `CW-012` [P1] Implement startup auto-create one docked chat unless disabled by settings JSON.
- `CW-013` [P2] Implement floating undock, drag, resize, and focus-driven z-order behavior.
- `CW-014` [P2] Implement maximize/unmaximize with exact restore to prior state and geometry.
- `CW-015` [P2] Implement global canvas visibility toggle button behavior when overlays obscure canvas.
- `CW-016` [P2] Implement canvas visibility and window control shortcuts with cross-platform key handling.
- `CW-017` [P2] Implement viewport guardrails (minimum visible title bar + `120px`, resize auto-correction).
- `CW-018` [P3] Implement drag ghost-zone snapping for halves and quarters.
- `CW-019` [P3] Implement keyboard snapping for focused floating windows.
- `CW-020` [P4] Implement boot-to-canvas action using cursor position, with canvas-center fallback.
- `CW-021` [P4] Implement undock from canvas-section to floating with translucent visual-only placeholder.
- `CW-022` [P4] Implement section rendering behavior where settings are right-pane only and threads remain in chat UI.
- `CW-023` [P4] Implement mode switching (`section mode` <-> `project-ai mode`) for canvas section chat.
- `CW-024` [P4] Reapply prior section edge-based scope when switching back from `project-ai mode`.
- `CW-025` [P5] Implement section-mode outgoing-edge-only direct-node scope filtering (direction-aware).
- `CW-026` [P5] Implement live scope recomputation on edge edits.
- `CW-027` [P5] Implement zero-scope UX (header warning icon + dismissible per-session inline banner).
- `CW-028` [P5] Implement chat-to-chat edge as bounded tool-call invocation endpoint behavior.
- `CW-029` [P5] Enforce recursion safety with cycle detection and max depth `1` for chat-to-chat tool-calls.
- `CW-030` [P5] Ensure incoming-only edges do not grant section-mode access.
- `CW-031` [QA] Add/refresh Vitest coverage for window manager transitions, persistence, scope rules, and recursion guard.
- `CW-032` [QA] Add/refresh Playwright E2E for docked/floating/maximized/snap/canvas-section workflows.
- `CW-033` [QA] Run CDP visual verification for key UI workflows after implementation.
- `CW-034` [QA] Capture before/after CDP performance profiles and append results under `perf/`.
- `CW-035` [DOC] Document intentional no-migration/no-compatibility break for old section chat in implementation notes.
- `CW-036` [POST] Add right-pane grouped chat/thread management follow-up task (deferred post-v1).
- `CW-037` [POST] Add non-chat section window-controls rollout follow-up task (deferred post-v1).

## Status Log (Append-Only)
- `2026-03-03` | `planned` | `CW-001` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-002` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-003` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-004` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-005` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-006` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-007` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-008` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-009` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-010` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-011` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-012` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-013` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-014` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-015` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-016` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-017` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-018` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-019` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-020` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-021` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-022` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-023` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-024` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-025` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-026` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-027` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-028` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-029` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-030` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-031` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-032` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-033` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-034` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-035` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-036` | Initial chat-windowing checklist created from approved plan.
- `2026-03-03` | `planned` | `CW-037` | Initial chat-windowing checklist created from approved plan.

## Entry Template (Append New Lines Only)
- `YYYY-MM-DD` | `<planned|in_progress|blocked|done|deferred>` | `CW-XXX` | `<concise note>`
