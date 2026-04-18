# Go-Rewrite Pixi Canvas-First Log

Date started: 2026-04-17
Draft worktree placeholder: `go-rewrite-pixijs`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`

## Usage

Append-only execution log for the `go-rewrite` Pixi-first restart.

Every log item should record:

- `Item`
- `Status`
- `Details`
- `Next action`

Recommended status values:

- `todo`
- `in_progress`
- `done`
- `blocked`
- `deferred`

Record:

- architecture decisions
- baseline benchmark results
- Ralph/supervisor bootstrap work
- visible UX/parity findings
- editing-overlay decisions
- dense-scene perf evidence

## 2026-04-17 001

- Item: Create the draft plan/log/checklist/handoff set for a `go-rewrite`-based Pixi-first restart.
- Status: `done`
- Details:
  - Reviewed the existing Pixi rewrite plan, the pan/zoom pivot plan, the current rewrite log structure, the Ralph mode doc, the frontend-performance retrospective, the dense `All Settings` benchmark report, and the tldraw comparison discussion.
  - Locked the new architectural direction:
    - Pixi-first resting graph surface
    - DOM only for active heavyweight editing surfaces and popups
    - no second-click editing model
    - no default assumption that visible inactive content stays fully live in DOM
  - Chose a neutral placeholder doc path until the real `go-rewrite` worktree exists:
    - `docs/worktrees/go-rewrite-pixijs/`
- Next action:
  - once the new `go-rewrite` worktree exists, port these docs there, refresh the worktree name/path references, and complete the Ralph-loop bootstrap checklist before taking the first code slice

## 2026-04-17 002

- Item: Port the restart docs and Ralph/supervisor support into `/home/ubuntu/dev/setta.go-rewrite-pixijs`.
- Status: `done`
- Details:
  - Created `docs/worktrees/go-rewrite-pixijs/{plan,log,checklist,handoff}.md` in the new worktree.
  - Ported the missing Ralph/supervisor files and refreshed the loop scripts needed for the supervisor flow.
  - Locked `/home/ubuntu/dev/setta` as the read-only reference worktree path for side-by-side comparisons in this restart.
- Next action:
  - confirm the running loop reads the new worktree doc set instead of the inherited `pixijs-graph` plan files

## 2026-04-17 003

- Item: Add explicit preservation guardrails so the new loop does not undo the `go-rewrite` refactor while porting ideas from older branches.
- Status: `done`
- Details:
  - Added an explicit `go-rewrite` preservation rule to the plan, checklist, and handoff.
  - Locked the architectural rule that older Pixi/frontend-performance branches are research inputs only, not structures to copy wholesale.
  - Defined rollback of broad `go-rewrite` refactors as a replan decision rather than something the loop may do silently.
- Next action:
  - fix `RALPH.md` to point at the new worktree plan/handoff/log and then let the loop proceed to baseline restoration

## 2026-04-17 004

- Item: Retarget `RALPH.md` to the new worktree docs and make the restart requirement explicit.
- Status: `done`
- Details:
  - Updated `RALPH.md` so the loop config now points at `docs/worktrees/go-rewrite-pixijs/{plan,handoff,log}.md`.
  - Added reference-worktree notes pointing the read-only compare path at `/home/ubuntu/dev/setta`.
  - Confirmed from the loop scripts that `RALPH.md` is parsed at startup, so a Ralph process that was already running before this edit should be restarted once.
- Next action:
  - restart Ralph once if it was already running, then move directly to baseline restoration on `All Settings`

## 2026-04-17 005

- Item: Fix the remaining Ralph bootstrap blockers in `go-rewrite-pixijs`.
- Status: `done`
- Details:
  - Restored the missing `scripts/ralph-default-prompt.md` file in the new worktree so the loop can render prompts.
  - Added `main_worktree_root: /home/ubuntu/dev/setta` to `RALPH.md`.
  - Patched `scripts/run-codex-loop.sh` and `scripts/run-codex-supervisor.sh` to honor an explicit `main_worktree_root` from config before falling back to branch-name discovery.
  - Bounded startup verification now reaches loop bootstrap with:
    - the correct plan/handoff/log paths
    - `Main worktree root: /home/ubuntu/dev/setta`
    - main-lifecycle bootstrap starting instead of failing on missing prompt/discovery errors
- Next action:
  - rerun Ralph from the updated config and continue to baseline restoration on `All Settings`

## 2026-04-17 006

- Item: Fix the remaining `ai.sh` helper imports required for lifecycle bootstrap.
- Status: `done`
- Details:
  - Restored `scripts/lib/node_tooling.sh` so `scripts/ai.sh` can initialize Node/pnpm tooling.
  - Restored `scripts/lib/clear_devtools_profile_auth_cookies.py` to match the source worktree helper set.
  - Bounded startup verification no longer fails on missing prompt or missing helper imports; the loop now reaches lifecycle bootstrap with the correct config and reference worktree path.
  - Remaining startup noise now points at environment bootstrap state (`.venv` missing) rather than missing loop files.
- Next action:
  - rerun Ralph and let lifecycle bootstrap proceed far enough to settle the dev environment, then continue to the baseline restoration phase

## 2026-04-18 007

- Item: Harden the baseline probe plumbing for `settings` -> `All Settings`.
- Status: `done`
- Details:
  - Updated `scripts/run-playwright-e2e.sh` so the helper no longer assumes `pnpm` is already on `PATH`:
    - it now bootstraps Node tooling before starting Vite / Playwright
    - it now accepts the current Go CLI bootstrap-token log shapes (`bootstrap#token=` and `and paste:`), not only the old `Token:` line
  - Added `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts` as the first focused `go-rewrite` baseline probe for the `All Settings` view.
  - Static verification passed for the code slice:
    - `bash -n scripts/run-playwright-e2e.sh`
    - `pnpm -C frontend exec eslint tests/e2e/settings/settings-all-settings-baseline.spec.ts`
  - Runtime verification is still blocked one layer later:
    - the disposable helper now reaches browser startup and test execution instead of failing on missing `pnpm` / stale token parsing
    - but both the disposable helper and direct browser automation still fail before a usable Settings surface because browser-side `POST http://127.0.0.1:8069/api/loadProjectConfig` requests fail with `net::ERR_ALPN_NEGOTIATION_FAILED`
    - fresh worktree bootstrap URLs are one-shot; stale tokens quickly degrade into misleading `401` bootstrap failures, so each retry must refresh the URL first
  - No baseline perf report was written yet because the Settings graph surface never reached a trustworthy loaded state under automation in this iteration.
- Next action:
  - fix or narrow the `loadProjectConfig` browser transport failure on the live worktree Settings route, then rerun the new baseline probe and record the first `go-rewrite` baseline report

## 2026-04-18 008

- Item: Fix the OpenAPI request rewrite that was breaking browser-side `loadProjectConfig` on the live worktree runtime.
- Status: `done`
- Details:
  - Reproduced the live failure on the current runtime values (`frontend http://127.0.0.1:3068/`, `backend http://127.0.0.1:8068`) and narrowed it to `frontend/src/openapi/http/client.ts`:
    - plain browser `fetch("http://127.0.0.1:8068/api/loadProjectConfig", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: ... })` succeeded
    - the OpenAPI wrapper path that rewrote a `Request` into `new Request(resolvedURL, request)` failed in Chromium for the same JSON-body POST with `net::ERR_ALPN_NEGOTIATION_FAILED`
  - Updated `frontend/src/openapi/http/client.ts` so rewritten OpenAPI requests now preserve method/body/headers by explicitly rebuilding the request instead of cloning a `Request` object into another `Request` with a new URL.
  - Added `frontend/src/openapi/http/client.test.ts` as a regression test proving that the rewritten POST URL still carries the serialized JSON body and share-session headers.
  - Verification for this slice:
    - `pnpm -C frontend exec vitest run src/openapi/http/client.test.ts`
    - `pnpm -C frontend exec eslint src/openapi/http/client.ts src/openapi/http/client.test.ts`
    - headless Playwright runtime check importing `/src/openapi/http` in-browser after bootstrap:
      - `loadProjectConfig({ body: { projectConfigName: "round_lime" } })` returned `200`
      - no `requestfailed` events were emitted for `loadProjectConfig`
  - Rerunning `frontend/tests/e2e/settings/settings-all-settings-baseline.spec.ts` no longer hits the old ALPN transport failure, but the lane is still blocked one layer later by an unrelated app crash:
    - `ReferenceError: DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX is not defined`
    - source: `src/components/ChatWindowing/ProjectChatBottomDock.tsx`
  - CDP visual check confirmed the new state:
    - bootstrap/auth handoff succeeds
    - final URL is `http://127.0.0.1:3068/round_lime`
    - the live page lands in the React error boundary instead of a usable project surface because of the `ProjectChatBottomDock` runtime error
- Next action:
  - fix the `ProjectChatBottomDock` runtime error so the `settings` baseline probe can finish and produce the first durable Phase 1 report
LOOP_TERMINAL_MARKER: none

## 2026-04-18 009

- Item: Clear the `ProjectChatBottomDock` missing-constant runtime crash that was blocking the live Settings baseline.
- Status: `done`
- Details:
  - Added the missing `DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX = 4` local constant back to `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`, matching the dock layout helper and removing the `ReferenceError` thrown on the live route.
  - Focused runtime verification now gets past the previous dock crash:
    - `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_PROJECT_URL=http://127.0.0.1:3068/round_lime SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --workers=1`
    - result: the app now reaches `http://127.0.0.1:3068/round_lime` and fails later with `Element type is invalid ... Check the render method of _MiniMapNodes.`
    - result: the prior `DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX is not defined` crash no longer appears in the Playwright failure output
  - CDP visual check is done for this slice and matches the new failure:
    - bootstrap redirected to `http://127.0.0.1:3068/round_lime`
    - the page lands in the React error boundary with `Unexpected Application Error!`
    - the visible blocker is the `_MiniMapNodes` invalid-element-type error, not the old dock-constant reference error
- Next action:
  - fix the `_MiniMapNodes` invalid-element-type runtime crash in the minimap path so the Phase 1 `settings` baseline probe can finish and write the first durable report
LOOP_TERMINAL_MARKER: none

## 2026-04-18 010

- Item: Clear the `_MiniMapNodes` invalid-element-type minimap crash so the live project route can settle again.
- Status: `done`
- Details:
  - Updated `frontend/src/forks/xyflow/minimap/MiniMapNodes.tsx` so optional minimap props with explicit `undefined` values no longer overwrite the default minimap node renderer and other minimap defaults.
  - Added a focused regression test in `frontend/src/forks/xyflow/minimap/MiniMap.test.ts` that renders `MinimapSvg` without a custom `nodeComponent` and expects the default minimap node markup.
  - Focused static verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/minimap/MiniMap.test.ts src/forks/xyflow/minimap/MiniMapNodes.tsx`
  - Focused Vitest execution for the new minimap regression test is still blocked by an existing jsdom dependency/runtime issue before test collection:
    - `Error: require() of ES Module ... @exodus/bytes/encoding-lite.js ... from html-encoding-sniffer`
  - Headless live verification with a fresh bootstrap URL now lands on the normal project surface at `http://127.0.0.1:3068/round_lime`; the prior React error boundary with `_MiniMapNodes` / invalid-element-type text no longer appears.
  - The next blocker is one layer later on the Settings route:
    - final URL: `http://127.0.0.1:3068/settings`
    - visible error boundary text: `Unexpected Application Error!`
    - runtime error: `TypeError: Cannot read properties of undefined (reading 'trim')`
    - stack points at `src/components/Utils/Combobox/ComboboxParts.tsx`
  - CDP visual check is done and matches the live probe:
    - project route is healthy again
    - `/settings` now fails later in `ComboboxParts.tsx`, not in minimap rendering
- Next action:
  - fix the `/settings` `ComboboxParts.tsx` `trim()` runtime crash so the Phase 1 baseline probe can mount the Settings surface and capture the first durable report
LOOP_TERMINAL_MARKER: none

## 2026-04-18 011

- Item: Clear the `/settings` combobox `trim()` crash so the baseline probe can reach `All Settings`.
- Status: `done`
- Details:
  - Updated `frontend/src/components/Utils/Combobox/ComboboxParts.tsx` so fallback background resolution accepts an omitted `bg` prop and uses the variant default classes instead of calling `.trim()` on `undefined`.
  - Added a focused regression test in `frontend/src/components/Utils/Combobox/ComboboxParts.test.tsx` covering `bg={undefined}` for both `pane` and `pill` variants.
  - Focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Utils/Combobox/ComboboxParts.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line`
  - The live baseline probe now reaches `settings` -> `All Settings` and emits metrics instead of failing in the React error boundary:
    - `flowNodeCount: 46`
    - `documentNodeCount: 9553`
    - `inputCount: 92`
    - `buttonCount: 521`
    - `raf.meanMs: 207.16`
    - `longTasks.totalMs: 36691`
  - CDP visual check is done for this slice and confirms `/settings` loads without the previous `Unexpected Application Error` / `trim` failure; `All Settings` is visible, with the left settings sidebar still occupying a large portion of the viewport.
- Next action:
  - write the first durable `go-rewrite` baseline report under `perf/reports/frontend/` using the now-passing `All Settings` probe output
LOOP_TERMINAL_MARKER: none

## 2026-04-18 012

- Item: Record the first durable `go-rewrite` `settings` -> `All Settings` baseline report.
- Status: `done`
- Details:
  - Added `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md` as the first durable Phase 1 baseline report for this restart.
  - Reran the focused baseline probe on the live worktree runtime with a fresh bootstrap token:
    - `source activate.sh && . scripts/lib/node_tooling.sh && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> PLAYWRIGHT_HEADLESS=1 setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line`
    - result: passed in headless Chromium and emitted the durable baseline payload used in the report
  - Captured metrics from the fresh 2026-04-18 run:
    - `flowNodeCount: 46`
    - `visibleFlowNodeCount: 46`
    - `documentNodeCount: 9553`
    - `inputCount: 92`
    - `textareaCount: 1`
    - `buttonCount: 521`
    - `raf.meanMs: 204.93`
    - `raf.p95Ms: 216.7`
    - `raf.maxMs: 316.7`
    - `longTasks.count: 181`
    - `longTasks.totalMs: 36337`
    - `longTasks.maxMs: 301`
  - The report explicitly records the harness caveat that this probe uses a scripted `.react-flow__viewport` transform loop and is therefore a durable pre-change branch baseline, not a direct apples-to-apples replacement for the older staged March trace benchmark.
  - CDP visual check is done for this slice:
    - `/settings` loads normally
    - `All Settings` is visible and active
    - no React error boundary or crash overlay is visible
    - non-target chrome still visible during the check included the left settings list, right tool rail, bottom tab bar, and a `Chat Window 1` overlay/suggestion panel, but none blocked the graph surface
- Next action:
  - start the first real product slice by identifying the narrowest `settings` canary seam where Pixi can take camera or resting-surface ownership without another pure forwarding seam lift
LOOP_TERMINAL_MARKER: none

## 2026-04-18 013

- Item: Land the first real graph-surface product seam on the `settings` canary path.
- Status: `done`
- Details:
  - Added `frontend/src/forks/xyflow/core/container/GraphSurface.tsx` so `ReactFlow.tsx` now delegates graph-surface composition through one implementation boundary instead of inlining the edge/node renderers directly.
  - Added `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` plus `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.ts` to derive top-level node bounds from `useNodeInternals` and paint one retained canvas shell underlay behind the existing DOM section nodes.
  - Added `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx` covering the scene bounds math and retained-canvas sizing path.
  - Narrow source cleanup in `frontend/src/forks/xyflow/core/container/ReactFlow.tsx` also removed the existing `d3Zoom!` / `d3Selection!` non-null assertions surfaced by the focused lint pass.
  - Focused lint verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/ReactFlow.tsx src/forks/xyflow/core/container/GraphSurface.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx src/forks/xyflow/core/container/sectionShellBackdrop.ts`
  - Focused Vitest execution for the new retained-canvas test is still blocked by the same existing jsdom dependency/runtime issue before test collection:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
    - `Error: require() of ES Module ... @exodus/bytes/encoding-lite.js ... from html-encoding-sniffer`
  - Live runtime verification passed on the worktree canary with a fresh bootstrap token:
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-baseline.spec.ts --reporter=line`
    - result: passed with `canvasCount: 1`, `flowNodeCount: 46`, `documentNodeCount: 9555`, `raf.meanMs: 34.91`, `longTasks.totalMs: 119`
  - Treat that runtime probe as a smoke check that the new retained scene layer is mounted on the live canary, not as a new durable benchmark claim yet.
  - Canonical target section for the next lane is now `settings-section__callableSectionDefault`.
  - CDP visual check is done:
    - `/settings` loads normally
    - `All Settings` is visible and active
    - the graph surface is mounted and usable
    - a `canvas` is visible inside `.react-flow__section-shell-backdrop`
    - no crash overlay or obviously detached/blank section bodies are visible
- Next action:
  - move actual top-level shell chrome authority for `settings-section__callableSectionDefault` into the retained scene layer instead of stopping at the parallel underlay
LOOP_TERMINAL_MARKER: none

## 2026-04-18 014

- Item: Move resting shell chrome authority for `settings-section__callableSectionDefault` into the retained canvas layer.
- Status: `done`
- Details:
  - Added `frontend/src/forks/xyflow/core/container/graphSurfaceImplementation.tsx` so section chrome can read the active graph-surface implementation from the real composition boundary instead of via another forwarding seam.
  - Added `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` plus `sectionShellCanvasOwnership.test.ts` to declare the canonical canvas-owned shell id, resolve default/style-color-aware canvas fill and stroke, and lock that logic with a focused node-environment Vitest file.
  - Updated `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` and `sectionShellBackdrop.ts` so the retained backdrop scene accepts per-frame chrome overrides; the named callable canary now paints its resting shell fill/border from canvas-owned values instead of the generic parallel underlay palette.
  - Updated `frontend/src/components/Section/Container/SectionContainerCore.tsx` and `frontend/src/components/Utils/Resizable/CustomResizable.tsx` so only the canary section opts out of resting DOM shell chrome on the `canvas-shell-underlay` path while the legacy DOM implementation remains unchanged.
  - The first Playwright run exposed a real regression on non-settings project routes: `SectionShellBackdropCanvas.tsx` called `getCurrEffectiveSectionImpl(...)` unconditionally for the canary id and crashed on `/round_lime`.
  - Fixed that crash in the same slice by switching the canary lookup to `getCurrEffectiveSectionImplIfPresent(...)`, so project routes without the settings canary no longer trip the retained-canvas selector.
  - Added a focused live check at `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts` that loads `/settings`, activates `All Settings`, and verifies the canary section shell is canvas-owned while the retained shell canvas is mounted.
  - Focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/graphSurfaceImplementation.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/GraphSurface.tsx src/forks/xyflow/core/container/sectionShellBackdrop.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/components/Section/Container/SectionContainerCore.tsx src/components/Utils/Resizable/CustomResizable.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line`
  - CDP visual check is done:
    - `/settings` loaded normally
    - `All Settings` was active
    - `settings-section__callableSectionDefault` was visible with no crash/error boundary
    - one retained shell `canvas` was mounted
    - the section shell still looked intact after the DOM shell was made transparent on the canvas path
    - residual risk: this headless pass confirmed shell integrity and mounted-canvas presence, but the transformed canvas content was not centered for a full pixel-level inspection
- Next action:
  - move the next visible static shell primitive for `settings-section__callableSectionDefault` into the retained scene layer, likely the header/body chrome split or another obvious non-editing shell detail, instead of reopening harness or broad DOM work
LOOP_TERMINAL_MARKER: none

## 2026-04-18 015

- Item: Add a retained-canvas header band/divider for `settings-section__callableSectionDefault`.
- Status: `done`
- Details:
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` so the canary shell chrome now resolves `headerFill` and `headerDivider` alongside the existing retained shell fill/stroke, reusing section-style theme colors when present.
  - Updated `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` so the retained scene reads the measured header height from `useTemporaryMiscState` via `getSectionHeaderHeightKey(...)` and passes that height into the canary frame visual.
  - Updated `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.ts` so retained frames can carry header-band metadata and the painter now clips a header band plus divider into the canary shell before the outer border stroke.
  - Added focused node coverage in `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.test.ts` and updated `sectionShellCanvasOwnership.test.ts` to lock the new header-band/header-divider chrome contract.
  - Extended the live canary probe in `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts` so it samples the retained canvas in graph space using the `.react-flow__node` transform instead of transformed screen pixels; this keeps the probe trustworthy even when `All Settings` fits the target section down to only a few on-screen pixels.
  - The first runtime probe for this slice failed because the original screen-space pixel sampling treated the fitted `All Settings` header as roughly `2.2px` tall on screen and could not distinguish the new band from the body fill; the final graph-space version fixed that oracle problem without changing product code.
  - Focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellBackdrop.ts src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
  - CDP visual check is done:
    - `/settings` loaded normally in the headless worktree session
    - `All Settings` was active
    - the retained shell `canvas` was mounted and `settings-section__callableSectionDefault` remained visible with no crash/error-boundary state
    - the section shell still looked intact on the live surface
    - caveat: the new header-band/header-divider treatment was too tiny in the fitted `All Settings` view for a confident human-only call, so the updated Playwright graph-space pixel probe is the deterministic oracle for that exact detail
- Next action:
  - move one more visible non-editing callable shell detail for `settings-section__callableSectionDefault` into the retained scene layer, likely the next top-level separation beneath the new header band without starting param-row migration
LOOP_TERMINAL_MARKER: none
