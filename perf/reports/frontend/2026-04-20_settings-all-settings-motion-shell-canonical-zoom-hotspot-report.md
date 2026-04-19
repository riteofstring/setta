# Settings All Settings Motion-Shell Canonical Zoom Hotspot Report

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior dense reference: `perf/reports/frontend/2026-04-20_settings-all-settings-motion-shell-handoff-rerun.md`
Prior trace reference: `perf/reports/frontend/2026-04-19_settings-all-settings-post-gate-type-dense-hotspot-report.md`
Focused motion probe: `frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Trace artifact: `perf/artifacts/frontend/settings-all-settings/motion-shell-canonical-zoom-trace-2026-04-20.json`

## Goal

Capture one fresh dense rerun plus one fresh Chrome DevTools trace on the current canonical motion lane so the next product decision comes from current evidence after the motion shell and menu-trigger slices, not from another guessed micro-slice.

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

## Fresh Dense Motion Rerun

Fresh live rerun on the current worktree runtime recorded:

- blank pane point: `x=24`, `y=60`
- `flowNodeCount: 46`
- `visibleFlowNodeCount: 46`
- `documentNodeCount: 5579`
- `inputCount: 5`
- `textareaCount: 2`
- `buttonCount: 59`
- `canvasCount: 1`
- `raf.meanMs: 130.39`
- `raf.p95Ms: 116.7`
- `raf.maxMs: 4733.1`
- `longTasks.count: 89`
- `longTasks.totalMs: 17889`
- `longTasks.maxMs: 3663`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 118 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Focused motion-overlay proof on the same runtime still reports:

- initial state on `browserSectionDefault`, `promptSectionDefault`, and `languageServer`:
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

Interpretation:

- the motion-hidden shell/body lane is still behaving as intended on the canonical sections
- the dense canary is still clearly bad in absolute terms even with `45` hidden motion-body roots active for almost the whole sample window

## Chrome Trace Result

Fresh headless DevTools MCP pass on the same surface recorded:

- visual preflight:
  - `All Settings` active: yes
  - one retained graph canvas mounted: yes
  - canonical sections present: yes
  - visible crash/blank state: no
- trace kind:
  - insight set: `NO_NAVIGATION`
  - `CLS: 0.00`
  - no additional named DevTools insights surfaced
- trace interaction point:
  - used blank pane point: `x=300`, `y=200`
  - the old probe point `x=24`, `y=60` was not blank in this CDP pass

Local trace parsing on the saved artifact shows:

- ignore the first `~460ms` `CpuProfiler::StartProfiling` / trace-start overhead event when reading the hotspot
- after excluding that startup artifact, the largest renderer-main task in the checked zoom window is:
  - `EventDispatch`: `67.136ms`
  - nested `v8.callFunction`: `66.924ms`
- additional renderer-main work in the same trace window:
  - `HitTest`: `7.187ms`
  - `MinorGC`: `18` events, `48.157ms` total, `4.572ms` max
  - `V8.GCScavenger`: `18` events, `46.684ms` total
- compositor-side work stayed secondary in this short trace:
  - `VizCompositorThread RunTask`: `28.53ms` total, `26.692ms` max
- no meaningful `Layout`, `Paint`, `Layerize`, or forced-reflow hotspot surfaced in this checked trace window

## Interpretation

- This trace does not point at another surviving header/menu/body DOM family on the canonical motion lane.
- On the checked motion-shell zoom path, the dominant visible cost is renderer-main JavaScript event work with a non-trivial GC tail, not a fresh layout-thrash signal.
- That means another DOM chrome harvest on `browserSectionDefault` is unlikely to be the right next default pass.
- The next product frontier should either:
  - reduce the JS work triggered by viewport interaction on the canvas-shell path, or
  - move to a larger graph-surface architecture step instead of extending the current motion-hidden wrapper lane again

## Verification

- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-006/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (1.2m)`
- Chrome DevTools MCP:
  - fresh one-shot bootstrap from `./scripts/dev-runtime-info.sh`
  - headless visual check passed on `/settings`
  - headless `NO_NAVIGATION` trace saved to `perf/artifacts/frontend/settings-all-settings/motion-shell-canonical-zoom-trace-2026-04-20.json`

## Follow-up

- Treat the current `browserSectionDefault` motion-shell lane as measured and currently exhausted for wrapper/chrome follow-ups.
- Use this report as the stop signal against another motion-hidden DOM harvest unless a new trace shows a different concrete hotspot.
- The next bounded product pass should target viewport-interaction JS cost on the canvas-shell path or escalate to the broader Pixi-owned graph-surface step.
