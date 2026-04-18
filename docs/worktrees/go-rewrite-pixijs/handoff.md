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
- `frontend/src/forks/xyflow/minimap/MiniMapNodes.tsx` now preserves minimap defaults when callers pass optional props as `undefined`, so `MinimapSvg` can render without an explicit `nodeComponent`.
- `frontend/src/forks/xyflow/minimap/MiniMap.test.ts` now includes a regression test that renders `MinimapSvg` without a custom node component and expects the default minimap rect node output.
- `frontend/src/components/Utils/Combobox/ComboboxParts.tsx` now treats the combobox `bg` prop as optional when resolving fallback background classes, so `/settings` no longer crashes on `bg.trim()` when a caller omits that prop.
- `frontend/src/components/Utils/Combobox/ComboboxParts.test.tsx` now includes a regression test proving undefined `bg` values fall back to the variant default classes instead of crashing.
- No Pixi/settings product renderer code has been changed under this restart plan yet.
- The Phase 1 baseline itself is still not captured:
  - the browser-side `loadProjectConfig` transport failure on the live worktree runtime (`http://127.0.0.1:8068`) is fixed
  - focused runtime verification now succeeds for that exact request shape:
    - `pnpm -C frontend exec vitest run src/openapi/http/client.test.ts`
    - a headless Playwright browser import of `/src/openapi/http` now returns `200` for `loadProjectConfig({ body: { projectConfigName: "round_lime" } })` with no `requestfailed` events
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` now defines `DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX` locally again, so the prior dock-constant runtime crash is cleared
  - rerunning `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts` now gets past bootstrap/auth, reaches `http://127.0.0.1:3068/round_lime`, and fails one layer later before the Settings surface is usable
  - the `_MiniMapNodes` invalid-element-type crash is now cleared:
    - a headless Playwright probe with a fresh bootstrap URL lands on the normal project surface at `http://127.0.0.1:3068/round_lime` with no React error boundary and no visible `_MiniMapNodes` / invalid-element-type message
    - CDP visual check is done for this slice and confirms the same healthy project-route state
  - the `/settings` combobox `trim()` runtime crash is now cleared:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Utils/Combobox/ComboboxParts.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line`
    - result: the live Settings route now loads cleanly, `All Settings` becomes active, and the baseline probe emits metrics instead of hitting the React error boundary
    - current captured metrics from that passing probe:
      - `flowNodeCount: 46`
      - `documentNodeCount: 9553`
      - `inputCount: 92`
      - `buttonCount: 521`
      - `raf.meanMs: 207.16`
      - `longTasks.totalMs: 36691`
    - CDP visual check is done for this slice and confirms `/settings` loads without the prior `Unexpected Application Error`; `All Settings` is visible, though the left settings sidebar still occupies a large portion of the viewport and is non-blocking chrome for this crash-fix lane
  - focused static verification for the minimap fix passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/minimap/MiniMap.test.ts src/forks/xyflow/minimap/MiniMapNodes.tsx`
  - focused Vitest verification for the new minimap regression test is currently blocked by an existing jsdom dependency/runtime issue before test collection:
    - `Error: require() of ES Module ... @exodus/bytes/encoding-lite.js ... from html-encoding-sniffer`
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

1. Turn the now-passing `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts` output into the first durable `go-rewrite` baseline report under `perf/reports/frontend/`.
2. Decide whether the current baseline should be normalized further before Phase 2 work, or whether the existing `All Settings` probe is sufficient as the pre-change benchmark.
3. Only after the baseline report exists, take the first product slice.
4. Keep the append-only log current from the first running iteration onward.

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
