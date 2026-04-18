# Go-Rewrite Pixi Canvas-First Handoff

Last updated: 2026-04-18
Worktree: `go-rewrite-pixijs`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related history: `docs/worktrees/go-rewrite-pixijs/log.md`
Related checklist: `docs/worktrees/go-rewrite-pixijs/checklist.md`

## Current status

- The new worktree exists at `/home/ubuntu/dev/setta.go-rewrite-pixijs`.
- Ralph/supervisor bootstrap files have been ported into the worktree.
- `RALPH.md` now points at this worktree plan set.
- `RALPH.md` now also pins `main_worktree_root` to `/home/ubuntu/dev/setta`, and the loop scripts honor that explicit reference path instead of requiring branch-name discovery.
- The missing `scripts/ralph-default-prompt.md` file has been restored in this worktree.
- The missing `scripts/lib/node_tooling.sh` and `scripts/lib/clear_devtools_profile_auth_cookies.py` helpers have also been restored in this worktree.
- If Ralph was started before those config/script fixes, restart it once so the running process picks them up.
- `scripts/run-playwright-e2e.sh` now bootstraps Node/pnpm tooling before starting Vite or Playwright, and its bootstrap-token parser now understands the current Go CLI log format (`bootstrap#token=` and `and paste:`).
- A focused baseline probe now exists at `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts` for `settings` -> `All Settings`.
- `frontend/src/openapi/http/client.ts` no longer rewrites body-carrying backend requests by cloning one `Request` into another `Request`; it now rebuilds the request explicitly so Chromium can send JSON POSTs like `loadProjectConfig` reliably across the dev frontend/backend origin split.
- A focused regression test now exists at `frontend/src/openapi/http/client.test.ts` to keep the rewritten OpenAPI transport from dropping POST bodies.
- No product renderer code has been changed under this restart plan yet.
- The Phase 1 baseline itself is still not captured:
  - the browser-side `loadProjectConfig` transport failure on the live worktree runtime (`http://127.0.0.1:8068`) is fixed
  - focused runtime verification now succeeds for that exact request shape:
    - `pnpm -C frontend exec vitest run src/openapi/http/client.test.ts`
    - a headless Playwright browser import of `/src/openapi/http` now returns `200` for `loadProjectConfig({ body: { projectConfigName: "round_lime" } })` with no `requestfailed` events
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` now defines `DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX` locally again, so the prior dock-constant runtime crash is cleared
  - rerunning `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts` now gets past bootstrap/auth, reaches `http://127.0.0.1:3068/round_lime`, and fails one layer later before the Settings surface is usable
  - the current blocking runtime error is `Element type is invalid: expected a string ... but got: undefined. Check the render method of _MiniMapNodes.`
  - CDP visual check is done for this slice and shows the same state: redirect succeeds to the project route, then the page falls into the React error boundary with `Unexpected Application Error!` and the `_MiniMapNodes` invalid-element-type message; no visible `DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX` reference remains
  - fresh bootstrap URLs are one-shot; stale URLs quickly turn into misleading `401` bootstrap failures

## Preservation rule

- `origin/go-rewrite` is the product-architecture source of truth for this restart.
- `/home/ubuntu/dev/setta` is the read-only reference worktree when a side-by-side compare is needed.
- Prior Pixi/frontend-performance branches are research inputs only.
- Port ideas, helpers, instrumentation, and narrow code slices from older branches only where they fit the `go-rewrite` structure.
- Do not undo broad `go-rewrite` refactors just to recreate an older branch shape.
- If Ralph hits a frontend compile blocker during bootstrap, the allowed response is a narrow `go-rewrite`-native source repair only.
- Do not restore deleted generated exports or reintroduce old branch scaffolding just to satisfy stale imports.
- If unblocking the build would require broad rollback of the `go-rewrite` refactor, stop and record that as a blocker/replan instead of doing it.

## Why this restart exists

The prior work established three things:

1. The main `All Settings` bottleneck is the visible live row/widget subtree.
2. Simple DOM cleanup was not enough.
3. A renderer change alone does not help if visible heavyweight DOM still stays fully live.

That leaves one primary architectural move:

- make the default visible graph surface cheap by design

## Immediate next actions

1. Fix the `_MiniMapNodes` invalid-element-type runtime crash in the minimap path (`frontend/src/forks/xyflow/minimap/*`) so the project route can settle under automation again.
2. Re-run `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts` once the live route can finish rendering without the minimap error boundary.
3. Capture the first durable `go-rewrite` baseline report under `perf/reports/frontend/`.
4. Only after the baseline exists, take the first product slice.
5. Keep the append-only log current from the first running iteration onward.

## First product frontier

The first product frontier is not:

- another broad DOM cleanup pass
- another shell-only Pixi experiment
- parity polishing before the perf floor moves

The first product frontier is:

- one Pixi-owned camera/surface seam on the `settings` canary path
- with the branch explicitly targeting a Pixi-owned resting graph surface rather than a partially shared runtime body experiment

## Hard rules

- No second click to edit.
- No visible layout jump when a field becomes editable.
- No progress claims from narrow canaries while dense `All Settings` still performs badly.
- Keep the append-only log and handoff current from the first worktree bootstrap step onward.
- Do not let the loop backslide into undoing `go-rewrite` architecture to mimic older branches.
