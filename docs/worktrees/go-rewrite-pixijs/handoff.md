# Go-Rewrite Pixi Canvas-First Handoff

Last updated: 2026-04-18
Worktree: `go-rewrite-pixijs`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related history: `docs/worktrees/go-rewrite-pixijs/log.md`
Related guardrails and gates: `docs/worktrees/go-rewrite-pixijs/checklist.md`

## Current status

- The new worktree exists at `/home/ubuntu/dev/setta.go-rewrite-pixijs`.
- The tracking model is now explicit:
  - `docs/worktrees/go-rewrite-pixijs/log.md` is the canonical append-only execution history
  - `docs/worktrees/go-rewrite-pixijs/handoff.md` is the current-state summary
  - `docs/worktrees/go-rewrite-pixijs/checklist.md` is limited to stable guardrails and acceptance gates instead of checkbox progress tracking
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
- The next callable shell-chrome slice is now landed for the same canary section:
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now resolves canvas-owned header fill/divider colors alongside the retained shell fill/stroke, reusing section style theme colors when a style color is present
  - `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` now reads the measured header height from `useTemporaryMiscState` via `getSectionHeaderHeightKey(...)` and feeds that height into the canary frame visual
  - `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.ts` now carries per-frame header-band metadata and paints a clipped header band plus divider before the shell border stroke
  - focused coverage now exists for this slice:
    - `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.test.ts`
    - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - updated `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts` using graph-space canvas pixel sampling derived from the `.react-flow__node` transform so the live canary can verify header-vs-body pixels even when `All Settings` is fitted far out
- A fresh post-slice live baseline probe on 2026-04-18 passed on the worktree runtime and confirmed the new underlay is present on `settings` -> `All Settings`:
  - `canvasCount: 1`
  - `flowNodeCount: 46`
  - `documentNodeCount: 9555`
  - `raf.meanMs: 34.91`
  - `longTasks.totalMs: 119`
- Treat that post-slice probe as a runtime smoke check for the new surface seam, not as a new durable benchmark claim yet.
- Canonical target section for the next settings graph-surface lane: `settings-section__callableSectionDefault`.
- Fresh live canary inventory on 2026-04-18 closes the stale top-level callable body-panel assumptions for that section:
  - the retained canvas shell is still mounted and the section is healthy on `/settings` -> `All Settings`
  - the visible canary shows the section header, the callable `ARGS` toolbar row, and visible settings rows such as `Aspect Ratio`, `Column Width`, `Config Language`, `Edge Input Params`, `Edge Output Ports`, `Hide Params`, and `Hide Unpinned Params`
  - the mounted canary does not currently show a separate section search field or a visible pinned-params panel in the checked viewport, so do not spend another slice on search/pinned/unpinned panel chrome for this target
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
- focused verification for the callable header-band slice passed:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellBackdrop.ts src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
- CDP visual check is done for the callable header-band slice:
  - `/settings` loaded normally in the headless worktree session
  - `All Settings` was active
  - the retained shell `canvas` was mounted and the canary section remained visible with no crash/error-boundary state
  - the section shell still looked intact on the live surface
  - caveat: the new header-band/header-divider treatment was too tiny in the fitted `All Settings` view for a confident human-only visual call, so treat the updated Playwright graph-space pixel probe as the deterministic proof for that exact detail
- The next callable shell-chrome slice is now landed for the same canary section:
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now resolves `callableToolbarFill` and `callableToolbarDivider` alongside the existing shell/header chrome so the retained scene can paint the callable args toolbar card with the same section-style-aware palette rules
  - `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` now reads both `getSectionSearchHeightKey(...)` and `getKwargsControlsHeightKey(...)` for `settings-section__callableSectionDefault`, then places one retained detail band for the callable toolbar beneath the existing header band
  - `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.ts` now carries normalized per-frame `detailBands` metadata and paints rounded retained panel fills plus bottom dividers before the outer shell stroke
  - `frontend/src/components/Section/SectionParts/KwargsControls.tsx` now makes only the canary callable toolbar container transparent on the `canvas-shell-underlay` path while keeping the live controls/filter DOM intact
  - focused coverage now exists for this slice:
    - updated `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.test.ts`
    - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - updated `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
  - the first live probe for this slice exposed a real oracle issue, not a product regression:
    - the previous graph-space helper treated the `.react-flow__node` transform as if it carried zoom scale, but in the current runtime the zoom lives on the parent `.react-flow__viewport` transform while the node transform stays at scale `1`
    - the final probe now derives graph-space rects from DOM element bounds divided by the viewport transform scale, then compares the new toolbar-band pixel against the shell body pixel; that fixed the canary probe without changing product code
- focused verification for the callable toolbar-band slice passed:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellBackdrop.ts src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Section/SectionParts/KwargsControls.tsx tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
- CDP visual check is done for the callable toolbar-band slice:
  - `/settings` loaded cleanly with no crash/error boundary visible
  - the retained shell `canvas` was mounted and the workspace surface remained intact
  - `settings-section__callableSectionDefault` was present and its control cluster still showed the header, filter input, and the `Remove arg` / `Add arg` / `Pin selected args` / `Convert to edge connectors` / `Delete selected args` toolbar row after the DOM toolbar container was made transparent on the canvas path
  - caveat: the fitted headless view still makes the toolbar row too small for a confident human-only pixel read, so treat the updated Playwright viewport-scale probe as the deterministic oracle for the toolbar-band detail
- The next callable body-panel slice is now landed for the same canary section:
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now resolves `pinnedParamsFill` and `pinnedParamsDivider` alongside the existing shell/header/toolbar chrome so the retained scene can paint the pinned-params card with the same section-style-aware palette rules
  - `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` now reads `getPinnedParamsAreaHeightKey(...)` for `settings-section__callableSectionDefault` and emits a second retained detail band below the callable toolbar using the measured pinned-panel height
  - `frontend/src/components/Params/GroupContainer.tsx` now makes only the canary pinned-params container transparent on the `canvas-shell-underlay` path while keeping the live pinned param rows and controls mounted
  - focused coverage now exists for this slice:
    - updated `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.test.ts`
    - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - updated `frontend/src/components/Params/GroupContainer.test.tsx`
  - focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/GroupContainer.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/GroupContainer.tsx src/components/Params/GroupContainer.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
      - result: the trusted shell/header/toolbar canary smoke still passes unchanged after the pinned-panel product slice
  - attempted to extend `tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts` into a dedicated pinned-panel oracle in the same iteration, but reverted that oracle work after it hit untrusted settings-route automation shapes (`POST /api/setActiveIds -> 404` when headless row-selection replay missed param-select mode, plus empty `/settings` `useProjectState` reads in that setup); keep the checked-in Playwright file on the previously trusted shell/toolbar lane for now
- CDP visual check is done for the pinned-params slice:
  - `/settings` loaded normally in the headless worktree session
  - `All Settings` was active with no crash/error overlay
  - a retained `canvas` was present inside `.react-flow__section-shell-backdrop`
  - `settings-section__callableSectionDefault` was present on the live surface
  - the pinned-params panel was visible by default on that section and the live surface still looked healthy after the pinned container chrome was made transparent on the canvas path
  - residual risk: this slice now has focused unit coverage plus live CDP confirmation, but it does not yet have its own dedicated Playwright graph-space pixel probe because the attempted oracle extension was reverted as untrustworthy
- The first visible param/control family slice is now landed for the same canary section using `Aspect Ratio` as the deterministic probe row:
  - `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.ts` now supports retained-scene `detailBoxes`, so the canvas path can paint control-local chrome inside a section frame instead of only full-width shell bands
  - `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` now measures canvas-owned switch roots inside `settings-section__callableSectionDefault`, converts them into graph-space boxes, and paints retained switch-track pills for the visible switch rows on the canvas path
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now resolves default and section-style-aware switch-track colors alongside the existing shell/header/toolbar/pinned-panel chrome
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx` and `frontend/src/components/Params/ParamUIs/SwitchInput.tsx` now make only the canary section's switch tracks transparent on the `canvas-shell-underlay` path while leaving the live switch buttons/thumbs interactive
  - focused coverage now exists for this slice:
    - updated `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.test.ts`
    - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - updated `frontend/src/components/Params/ParamUIs/SwitchInput.test.tsx`
  - focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/SwitchInput.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellBackdrop.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/SwitchInput.tsx src/components/Params/ParamUIs/SwitchInput.test.tsx src/components/Params/ParamUIs/ParamUI.tsx src/components/Params/ParamUIs/ParamUI.test.tsx tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
      - result: the trusted canary shell-ownership probe now also samples the `Aspect Ratio` switch track pixel and passes on the live worktree runtime
- CDP visual check is done for the switch-track slice:
  - `Page 1` in the headless worktree session was bootstrapped, then verified on `http://127.0.0.1:3068/settings`
  - `All Settings` was active with no crash or error-boundary overlay visible
  - a retained `canvas` was present inside `.react-flow__section-shell-backdrop`
  - `settings-section__callableSectionDefault` was visible on the live surface
  - the `Aspect Ratio` row remained visible and its switch still looked intact after the DOM switch track was made transparent on the canvas path
- The first canary resting-text slice is now landed for the same canary section using `Config Language` as the deterministic probe row:
  - the old `Config Language` dropdown/combobox assumption is now closed as stale for this canary; the live row is a text-like `DummyCodeMirror`/CodeMirror-backed value that shows `python` at rest
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now declares the exact canary `Config Language` param info id so the resting-text handoff stays tied to one explicit product target instead of label heuristics
  - `frontend/src/components/Params/ParamUIs/ParamUI.tsx` now makes only that canary row's inactive `DummyCodeMirror` transparent on the `canvas-shell-underlay` path while leaving the real CodeMirror editor path intact for first-click activation
  - `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.ts` now supports retained-scene `detailTexts`, so the canvas path can paint measured text lines in graph space instead of only shell bands and control boxes
  - `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` now measures the canary `Config Language` dummy text line in graph space and paints the resting `python` text into the retained canvas; that measurement drops out automatically when the live editor mounts
  - focused coverage now exists for this slice:
    - updated `frontend/src/forks/xyflow/core/container/sectionShellBackdrop.test.ts`
    - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - new `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
    - updated `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
  - focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Params/ParamUIs/ParamUI.tsx src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellBackdrop.ts src/forks/xyflow/core/container/sectionShellBackdrop.test.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
      - result: the trusted canary probe now confirms the retained `Config Language` text pixel on the canvas path and that activating the dummy text node surfaces the live editor inline with no blank/detached jump
      - note: an intermediate row-wrapper click replay hit non-target DnD/selection noise (`POST /api/setActiveIds -> 404`); the final checked-in probe dispatches activation directly to the dummy text node and passes without that side effect
- CDP visual check is done for the `Config Language` resting-text slice:
  - `/settings` loaded cleanly with no crash or error overlay visible
  - `All Settings` was active on the live worktree surface
  - a retained `canvas` was present inside `.react-flow__section-shell-backdrop`
  - `settings-section__callableSectionDefault` was visible and the `Config Language` row showed resting `python` text on the canvas path
  - activating the `Config Language` row surfaced the inline editor with no blank or detached visual jump
- The next canary resting-text slice is now landed for the same canary section using `Column Width` as the deterministic probe row:
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now treats the canary resting-text lane as a small explicit set instead of a single param id, so the same named lane now owns both `Config Language` and `Column Width`
  - `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` now measures multiple canary `DummyCodeMirror` roots in graph space and paints both resting text rows into the retained canvas instead of special-casing one input id
  - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - updated `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
  - updated `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
  - the checked Playwright oracle is now slightly tighter for text rows: it counts pixels inside each measured text rect that differ from the sampled body pixel instead of treating any opaque pixel in that rect as proof
  - focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
      - result: the trusted canary probe now confirms both the retained `Config Language` and retained `Column Width` text pixels on the canvas path while preserving the existing inline `Config Language` activation check
- CDP visual check is done for the `Column Width` resting-text slice:
  - `http://127.0.0.1:3068/settings` loaded with no visible crash/error overlay
  - `All Settings` was active
  - `settings-section__callableSectionDefault` was visible
  - a retained `canvas` was present inside `.react-flow__section-shell-backdrop`
  - the `Column Width` row was visible and looked intact on the canvas path
  - no obvious blank or detached section content was visible
  - caveat: the bootstrap URL used for the visual check had already been rejected, but the existing authenticated `/settings` session was still healthy and sufficient for the required CDP confirmation
- The next canary resting-text slice is now landed for the same canary section using `Edge Input Params` and `Edge Output Ports` as grouped probe rows:
  - a fresh live DOM inventory closed the remaining stale assumption here: both visible rows mount as text-like `DummyCodeMirror` / CodeMirror-backed `[]` values on this canary, so they fit the same retained-text lane instead of needing a new control-family path
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now treats the canary resting-text lane as a four-row explicit set: `Config Language`, `Column Width`, `Edge Input Params`, and `Edge Output Ports`
  - the existing retained-scene text measurement in `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` now picks up both edge rows automatically through that shared ownership set with no extra special-case path
  - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`, `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`, and `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
  - focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
      - result: the trusted canary probe now confirms retained text pixels for `Edge Input Params` and `Edge Output Ports` in addition to the existing `Config Language` and `Column Width` checks, while preserving the inline `Config Language` activation proof
- CDP visual check is done for the `Edge Input Params` / `Edge Output Ports` resting-text slice:
  - `http://127.0.0.1:3068/settings` was healthy with no visible crash/error overlay
  - `All Settings` was active
  - `settings-section__callableSectionDefault` was visible
  - a retained `canvas` was present inside `.react-flow__section-shell-backdrop`
  - both `Edge Input Params` and `Edge Output Ports` were visible and looked intact on the canvas path
  - caveat: the supplied bootstrap token had already been rejected during the CDP pass, but the existing authenticated `/settings` session remained healthy and sufficient for the required visual confirmation
- The canary resting-text lane is now closed as a per-row allowlist lane and moved to the real ownership boundary:
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now treats canvas-owned resting text as a canary-section rule for text-like params (`CodeParam`, `TextParam`, `TextAreaParam`) instead of enumerating individual param ids
  - `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.tsx` and `frontend/src/components/Utils/CodeMirror/DummyCodeMirror.tsx` now mark canvas-owned dummy roots with `data-canvas-owned-resting-text="true"`, and `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx` now measures those marked roots directly instead of rebuilding a manual `ParamInput` id list
  - that change means newly covered canary text rows such as `Style Color`, `Tag Color`, and the visible `Size` subfields ride the same retained-text path automatically without another ownership-list edit
  - focused coverage now proves the generalized rule and one newly covered row:
    - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - updated `frontend/src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
    - updated `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts` with a deterministic `Style Color` probe
  - focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamUIs/ParamUI.tsx src/components/Params/ParamUIs/ParamUI.canvasOwnedRestingText.test.tsx src/components/Utils/CodeMirror/TextInputCodeMirror.tsx src/components/Utils/CodeMirror/DummyCodeMirror.tsx tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
      - note: the first Playwright attempt in this iteration hit the expected one-shot bootstrap failure (`401` on a spent token); rerunning with a freshly minted token passed unchanged
- CDP visual check is done for the generalized resting-text slice:
  - `/settings` loaded with `All Settings` active and no crash/error overlay visible
  - `settings-section__callableSectionDefault` remained visible
  - a retained `canvas` remained mounted inside `.react-flow__section-shell-backdrop`
  - the newly covered `Style Color` row was present and looked intact on the live canvas path
  - caveat: the fitted headless viewport still leaves that row small, so treat this as a technical visual pass backed by the deterministic Playwright pixel probe rather than a strong human-only readability judgment
- The next visible inactive DOM family slice is now landed for param-label text on the same canary section:
  - the first attempt in this iteration targeted `ParamNameInput`, but a timed-out live wait plus source re-check showed the visible canary labels on this lane render through `ParamTextLabel` except for kwargs; no product code from that dead-end was kept
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts` now exposes `isCanvasOwnedSectionParamLabelRestingText(...)` so the label lane is explicit at the same canary ownership boundary as the existing resting-text/value lane
  - `frontend/src/components/Params/ParamItems/ParamTextLabel.tsx` now makes only the canary section's resting labels transparent on the `canvas-shell-underlay` path and tags them with `data-canvas-owned-resting-text="true"` so the retained scene can measure and paint them without changing the existing click-to-focus handoff
  - focused coverage now exists for this slice:
    - updated `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
    - new `frontend/src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx`
    - updated `frontend/tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
  - focused verification passed:
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx`
    - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Params/ParamItems/ParamTextLabel.tsx src/components/Params/ParamItems/ParamTextLabel.canvasOwnedRestingText.test.tsx tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts`
    - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3068/ SETTA_BACKEND_ORIGIN=http://127.0.0.1:8068 SETTA_BOOTSTRAP_TOKEN=<fresh token> setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-canvas-shell-ownership.spec.ts --reporter=line --workers=1`
      - result: the trusted canary probe now samples the retained `Style Color` label text separately from the retained `Style Color` value text and clicks the label to surface the inline `Style Color` editor on first click with no blank/detached jump
- CDP visual check is done for the param-label slice:
  - no crash/error overlay was visible on `/settings` with `All Settings` active
  - a retained `canvas` was mounted inside `.react-flow__section-shell-backdrop`
  - `settings-section__callableSectionDefault` remained present on the live surface
  - the `Style Color` label looked intact on the callable canvas path
  - clicking the `Style Color` label surfaced the inline `Style Color` editor with the `null` value rendered inline and no blank/detached jump
- The next frontier should not reopen param-label text on this section:
  - treat the canary param-label lane as complete at this ownership boundary
  - move to the next visible row-chrome family on `settings-section__callableSectionDefault` instead of adding more label/text coverage; likely candidates are shared text-row underline/input-shell chrome or another repeated inactive row-decoration family

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

1. Treat the callable shell/body-panel chrome lane for `settings-section__callableSectionDefault` as complete; do not spend another iteration on nonexistent search, pinned-panel, or unpinned-panel chrome for that target.
2. Use `perf/reports/frontend/2026-04-18_settings-all-settings-go-rewrite-baseline.md` as the pre-change benchmark reference for every future product slice on this lane.
3. Keep the same named canary section, but do not spend another pass on value-text or param-label drift; take the next repeated row-chrome family in one bounded product slice instead.
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
- with the same canary section now also painting a canvas-owned header band/divider from the measured header height
- with the same canary section now also painting a canvas-owned callable toolbar band while the live controls remain interactive
- with the same canary section now also painting canvas-owned switch tracks for visible switch rows while the live switch thumbs/buttons remain interactive
- with the same canary section now also painting the resting `Config Language` text in the retained canvas while the live CodeMirror editor still activates inline on first click
- with the same canary section now also painting the resting `Column Width`, `Edge Input Params`, and `Edge Output Ports` text in the retained canvas while the live editors remain available
- with the same canary section now also painting the resting `Style Color` label text in the retained canvas while label clicks still hand off directly to the inline `Style Color` editor
- with older assumptions about a visible section search field and pinned-params panel now closed as stale for the current `All Settings` canary state
- with the stale `Config Language` dropdown assumption now closed in favor of a real text-row handoff on the live canary
- next: move to the next repeated row-chrome family on that same named canary instead of reopening top-level shell/body panel work or continuing label/text churn

## Hard rules

- No second click to edit.
- No visible layout jump when a field becomes editable.
- No progress claims from narrow canaries while dense `All Settings` still performs badly.
- Keep the append-only log and handoff current from the first worktree bootstrap step onward.
- Do not let the loop backslide into undoing `go-rewrite` architecture to mimic older branches.
