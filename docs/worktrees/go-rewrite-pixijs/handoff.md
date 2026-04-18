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
- The first durable Phase 1 `go-rewrite` baseline report now exists at `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md`.
- A fresh baseline probe run on 2026-04-18 passed on the live worktree runtime and recorded:
  - `flowNodeCount: 46`
  - `visibleFlowNodeCount: 46`
  - `documentNodeCount: 9553`
  - `inputCount: 92`
  - `textareaCount: 1`
  - `buttonCount: 521`
  - `raf.meanMs: 204.93`
  - `raf.p95Ms: 216.7`
  - `longTasks.totalMs: 36337`
- CDP visual check is done for the baseline-report slice:
  - `/settings` loads normally
  - `All Settings` is visible and active
  - no React error boundary or crash overlay is visible
  - non-target chrome still visible during the check included the left settings list, right tool rail, bottom tab bar, and a `Chat Window 1` overlay/suggestion panel, but none blocked the graph surface
- The first settings product renderer slice is now landed:
  - `frontend/src/forks/xyflow/core/container/GraphSurface.tsx` is now the graph-surface composition boundary instead of inlining the edge/node renderers inside `ReactFlow.tsx`
  - the active implementation is a new `canvas-shell-underlay` surface that mounts one retained canvas behind the existing DOM section nodes
  - `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` and `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.ts` now derive top-level node bounds from `useNodeInternals` and paint shell backdrops into a single canvas underlay
  - `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx` now covers the scene bounds math and retained-canvas sizing path
- The named canary shell-authority slice is now landed for `settings-section__callableSectionDefault`:
  - `frontend/src/forks/xyflow/core/container/graphSurfaceImplementation.tsx` now exposes the active graph-surface implementation through context so section chrome can react at the real composition boundary instead of via prop threading
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now declares the canonical canvas-owned section shell id and resolves the retained-canvas fill/stroke for that shell, including style-color-aware chrome when a section style is present
  - `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` and `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.ts` now let the retained scene paint per-frame chrome overrides, so the canary callable section uses canvas-owned resting fill/border instead of the old generic underlay colors
  - `frontend/src/components/Section/Container/SectionContainerCore.tsx` and `frontend/src/components/Utils/Resizable/CustomResizable.tsx` now make only the canary section's resting DOM shell transparent on the `canvas-shell-underlay` path while leaving the legacy DOM implementation unchanged
  - `SectionShellBackdropCanvas.tsx` now uses `getCurrEffectiveSectionImplIfPresent(...)` for the canary lookup so non-settings project routes like `/round_lime` no longer crash when that section is absent
  - focused coverage now exists for this slice:
    - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
- A fresh post-slice live baseline probe on 2026-04-18 passed on the worktree runtime and confirmed the new underlay is present on `settings` -> `All Settings`:
  - `canvasCount: 1`
  - `flowNodeCount: 46`
  - `documentNodeCount: 9555`
  - `raf.meanMs: 34.91`
  - `longTasks.totalMs: 119`
- Treat that post-slice probe as a runtime smoke check for the new surface seam, not as a new durable benchmark claim yet.
- Canonical target section for the next settings graph-surface lane: `settings-section__callableSectionDefault`.
- The Phase 1 baseline lane is now complete:
  - the browser-side `loadProjectConfig` transport failure on the live worktree runtime (`http://127.0.0.1:8068`) is fixed
  - focused runtime verification now succeeds for that exact request shape:
    - `pnpm -C frontend exec vitest run src/openapi/http/client.test.ts`
    - a headless Playwright browser import of `/src/openapi/http` now returns `200` for `loadProjectConfig({ body: { projectConfigName: "round_lime" } })` with no `requestfailed` events
  - `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx` now defines `DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX` locally again, so the prior dock-constant runtime crash is cleared
  - the `_MiniMapNodes` invalid-element-type crash is now cleared:
    - a headless Playwright probe with a fresh bootstrap URL lands on the normal project surface at `http://127.0.0.1:3068/round_lime` with no React error boundary and no visible `_MiniMapNodes` / invalid-element-type message
    - CDP visual check is done for that slice and confirms the same healthy project-route state
  - the `/settings` combobox `trim()` runtime crash is now cleared:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Utils/Combobox/ComboboxParts.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line`
    - result: the live Settings route now loads cleanly, `All Settings` becomes active, and the baseline probe emits metrics instead of hitting the React error boundary
- focused static verification for the minimap fix passed:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/minimap/MiniMap.test.ts src/forks/xyflow/minimap/MiniMapNodes.tsx`
- focused Vitest verification for the new minimap regression test is currently blocked by an existing jsdom dependency/runtime issue before test collection:
  - `Error: require() of ES Module ... @exodus/bytes/encoding-lite.js ... from html-encoding-sniffer`
  - fresh bootstrap URLs are one-shot; stale URLs quickly turn into misleading `401` bootstrap failures
- focused Vitest verification for the new retained-canvas shell test is blocked by the same existing jsdom dependency/runtime issue before test collection:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
  - error: `Error: require() of ES Module ... @exodus/bytes/encoding-lite.js ... from html-encoding-sniffer`
- focused lint verification for the new graph-surface files passed:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/ReactFlow.tsx src/forks/xyflow/core/container/GraphSurface.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx src/forks/xyflow/core/container/sectionShellBackdrop.ts`
- CDP visual check is done for the retained-canvas slice:
  - `/settings` loads normally
  - `All Settings` is visible and active
  - the graph surface is mounted and usable
  - a `canvas` is present inside `.react-flow__section-shell-backdrop`
  - no crash overlay or obviously detached/blank section bodies are visible
- focused verification for the canary shell-authority slice passed:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/graphSurfaceImplementation.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/GraphSurface.tsx src/forks/xyflow/core/container/sectionShellBackdrop.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/components/Section/Container/SectionContainerCore.tsx src/components/Utils/Resizable/CustomResizable.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line`
- CDP visual check is done for the canary shell-authority slice:
  - `/settings` loads normally
  - `All Settings` is active
  - `settings-section__callableSectionDefault` is visible with no crash/error boundary
  - one retained shell `canvas` is mounted
  - the section shell still looks intact after the DOM shell was made transparent on the canvas path
  - residual risk: this headless CDP pass confirmed mounted canvas presence and healthy shell appearance, but the transformed canvas content itself was not fully centered in the viewport for pixel-level inspection

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

1. Move the next visible static shell primitive for `settings-section__callableSectionDefault` into the retained scene layer, likely the header/body chrome split or another obvious non-editing shell detail, instead of stopping at flat resting fill/border ownership.
2. Use `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md` as the pre-change benchmark reference for every future product slice on this lane.
3. Keep the next product frontier constrained to top-level settings shell chrome only; do not reopen harness work or start row/body migration yet.
4. Keep the append-only log current from the first running iteration onward.

## First product frontier

The first product frontier is not:

- another broad DOM cleanup pass
- another shell-only Pixi experiment
- parity polishing before the perf floor moves

The first product frontier is:

- a real graph-surface composition boundary on the `settings` canary path
- with one retained scene canvas now mounted under the DOM section nodes as the first renderer-owned static layer
- with the named canary section now using canvas-owned resting shell fill/border instead of a purely parallel underlay
- next: move the next visible static shell detail into that retained scene path for the same named canary section instead of reopening broad DOM or harness work

## Hard rules

- No second click to edit.
- No visible layout jump when a field becomes editable.
- No progress claims from narrow canaries while dense `All Settings` still performs badly.
- Keep the append-only log and handoff current from the first worktree bootstrap step onward.
- Do not let the loop backslide into undoing `go-rewrite` architecture to mimic older branches.
