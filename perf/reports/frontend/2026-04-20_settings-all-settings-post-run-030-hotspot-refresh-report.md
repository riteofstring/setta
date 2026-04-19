# Settings All Settings Post-Run-030 Hotspot Refresh Report

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `cf152daaf` + docs working tree
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior dense reference: `perf/reports/frontend/2026-04-20_settings-all-settings-gui-backend-shell-ownership-cluster-rerun.md`
Prior hotspot reference: `perf/reports/frontend/2026-04-20_settings-all-settings-motion-shell-canonical-zoom-hotspot-report.md`
Focused dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Trace artifact: `perf/artifacts/frontend/settings-all-settings/post-run-030-hotspot-refresh-trace-2026-04-20.json`

## Goal

Refresh the canonical dense `All Settings` hotspot evidence on the current post-run-030 runtime so the next product pass does not keep following the stale pre-cache / pre-shell `EventDispatch` report by inertia.

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

## Fresh Dense Motion Rerun

Fresh live rerun on the current worktree runtime recorded:

- `blankPanePoint: { x: 24, y: 60 }`
- `viewModeName: "All Settings"`
- `flowNodeCount: 46`
- `visibleFlowNodeCount: 46`
- `projectChatChromeCount: 0`
- `documentNodeCount: 5493`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 46`
- `canvasCount: 1`
- `codeMirrorCount: 0`
- `viewportStart: { x: 759.9, y: -41.8, zoom: 0.1 }`
- `viewportEnd: { x: 759.9, y: -41.8, zoom: 0.1 }`
- `raf.meanMs: 43.14`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50`
- `raf.maxMs: 1083.2`
- `raf.over16Ms: 109`
- `raf.over33Ms: 56`
- `longTasks.count: 8`
- `longTasks.totalMs: 6678`
- `longTasks.maxMs: 4254`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against the latest kept implementation slice in `perf/reports/frontend/2026-04-20_settings-all-settings-gui-backend-shell-ownership-cluster-rerun.md`:

- `documentNodeCount: 5493 -> 5493`
- `inputCount: 3 -> 3`
- `textareaCount: 1 -> 1`
- `buttonCount: 46 -> 46`
- `raf.meanMs: 43.14 -> 43.14`
- `raf.p95Ms: 50 -> 50`
- `longTasks.totalMs: 5746 -> 6678`

## Chrome Trace Result

Fresh headless DevTools MCP pass on the same surface recorded:

- visual preflight:
  - `All Settings` active: yes
  - retained graph canvas mounted: yes (`canvasCount: 1`)
  - `browserSectionDefault` visible after `fit view`: yes
  - obvious blank / detached artifact: no
- trace artifact saved successfully:
  - `perf/artifacts/frontend/settings-all-settings/post-run-030-hotspot-refresh-trace-2026-04-20.json`

Local parsing of the saved trace artifact shows:

- the old `EventDispatch` / nested `v8.callFunction` / `MinorGC` hotspot from `perf/reports/frontend/2026-04-20_settings-all-settings-motion-shell-canonical-zoom-hotspot-report.md` did not reproduce in this refreshed capture
- no meaningful `Layout`, `Paint`, or GC hotspot surfaced in the saved window
- the largest recorded work in this trace was short `RunTask` activity only:
  - `RunTask`: `25.521ms`
  - next `RunTask`: `3.863ms`
  - next `RunTask`: `2.705ms`

## Interpretation

- The dense Playwright rerun still sits in the same `~43ms` band, so the current post-run-030 surface has not produced a new whole-scene breakthrough.
- The old canonical motion-shell hotspot report is now stale as the default guide for another selector-cache or viewport micro-pass: the refreshed trace no longer reproduces that `EventDispatch` / `v8.callFunction` / GC spike on the current runtime.
- The next default pass should therefore prefer a stronger graph-surface ownership step on the canonical lane, or capture a longer / differently driven trace only when that trace is directly needed to scope one concrete product lane.
- Do not keep spending default passes on another guessed selector-cache follow-up based only on the older hotspot report.

## Verification

- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-031/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `1 passed (51.4s)`
- Chrome DevTools MCP:
  - fresh headless DevTools sub-agent consumed a fresh bootstrap URL from `./scripts/dev-runtime-info.sh`
  - normalized to `/settings` with `All Settings` active and `fit view`
  - verified one retained graph canvas and `browserSectionDefault` visibility with no obvious blank or detached artifact
  - saved `perf/artifacts/frontend/settings-all-settings/post-run-030-hotspot-refresh-trace-2026-04-20.json`
