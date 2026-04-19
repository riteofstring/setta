# Settings All Settings Backdrop Measurement-Scale Freeze Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior dense reference: `perf/reports/frontend/2026-04-20_settings-all-settings-motion-shell-canonical-zoom-hotspot-report.md`
Focused motion proof: `frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Related unit coverage:
- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`

## Goal

Reduce renderer-main zoom churn on the retained canvas shell path by keeping `SectionShellBackdropCanvas` off the per-tick `transform[2]` subscription path while `viewportInteractionActive` is true.

## Implementation

- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx`
  - added `useBackdropMeasurementViewportScale(...)`, which snapshots the current viewport scale from the React Flow store and only resubscribes to `transform[2]` when viewport interaction is inactive
  - `SectionShellBackdropCanvas` now feeds that frozen measurement scale into the per-section backdrop measurement hooks instead of subscribing the whole backdrop tree directly to `state.transform[2]`
- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
  - added a focused probe that asserts the backdrop measurement scale stays frozen through transform updates while `viewportInteractionActive` is true and only catches up after interaction ends

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - Playwright Chromium, headless Linux
  - Chrome DevTools MCP, headless Chromium
- Surface:
  - `settings` -> `All Settings`
- Canonical target section:
  - `settings-section__browserSectionDefault`
- Sibling proof sections:
  - `settings-section__promptSectionDefault`
  - `settings-section__languageServer`
- Commands:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-008/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`

## Fresh Dense Metrics

Fresh live rerun on the current worktree runtime recorded:

- blank pane point: `x=24`, `y=60`
- `flowNodeCount: 46`
- `visibleFlowNodeCount: 46`
- `documentNodeCount: 5575`
- `inputCount: 5`
- `textareaCount: 2`
- `buttonCount: 60`
- `canvasCount: 1`
- `raf.meanMs: 122.4`
- `raf.p50Ms: 83.3`
- `raf.p95Ms: 116.7`
- `raf.maxMs: 4333.1`
- `longTasks.count: 72`
- `longTasks.totalMs: 16216`
- `longTasks.maxMs: 3461`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 118 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-motion-shell-canonical-zoom-hotspot-report.md`:

- `documentNodeCount: 5579 -> 5575`
- `buttonCount: 59 -> 60`
- `raf.meanMs: 130.39 -> 122.4`
- `raf.p95Ms: 116.7 -> 116.7`
- `raf.maxMs: 4733.1 -> 4333.1`
- `longTasks.count: 89 -> 72`
- `longTasks.totalMs: 17889 -> 16216`
- `longTasks.maxMs: 3663 -> 3461`

## Focused Motion Proof

- the motion-hidden shell/body lane stayed intact on the same live rerun:
  - before motion on `browserSectionDefault`, `promptSectionDefault`, and `languageServer`:
    - `hiddenBodyCount: 0`
    - `hiddenHeaderControlsCount: 0`
    - `display: block`
    - `childElementCount: 2`
  - during one checked zoom interaction:
    - `hiddenBodyCount: 45`
    - `hiddenHeaderControlsCount: 45`
    - `display: none`
    - `childElementCount: 0`
  - after settle:
    - `hiddenBodyCount: 0`
    - `hiddenHeaderControlsCount: 0`
    - `display: block`
    - `childElementCount: 2`

## Interpretation

- This is a bounded renderer-main optimization, not another survivor-family harvest: the retained backdrop now reuses the last measured graph-space scale during active zoom instead of re-entering its measurement hook tree on every transform tick.
- The dense rerun moved in the right direction against the latest hotspot report. Mean frame time, long-task count, and long-task total all improved without reopening motion-hidden-body regressions on the canonical sections.
- The branch is still far from the real goal. `raf.meanMs 122.4` and `longTasks.totalMs 16216` remain well above budget, so this slice is only a hotspot reduction, not a success claim for dense `All Settings` motion.
- The current evidence supports the renderer-main JS/GC lane from the hotspot report. If the next pass cannot remove a larger chunk of viewport-interaction JS cost, the branch should escalate to the broader graph-surface step instead of resuming motion-shell micro-harvests.

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
  - result: blocked by the pre-existing repo jsdom dependency/runtime issue before test collection: `Error: require() of ES Module ... @exodus/bytes/encoding-lite.js ... from html-encoding-sniffer`
- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.test.tsx`
  - result: passed
- Playwright focused + dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-008/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (1.2m)`
- CDP visual check:
  - required for this frontend slice
  - `All Settings` stayed active on `/settings`
  - exactly one retained `react-flow__section-shell-backdrop` canvas remained mounted after `fit view` plus one bounded zoom-in
  - `browserSectionDefault`, `promptSectionDefault`, and `languageServer` stayed visible with no obvious blank or detached shell artifact
