# GPU Flow Canvas-First Committed Surface Runtime

Date: 2026-05-18
Area: frontend
Branch/Commit: diagnostics/retained-text-recording-20260513 @ 031ba1fde, dirty worktree
Related Plan: `docs/plans/gpu-flow-canvas-first-committed-surface-runtime-plan.md`

## Goal

Complete the canvas-first committed-surface runtime cut:

- keep passive retained content in GPU/canvas-owned surfaces;
- keep only active/browser-semantic controls in live DOM;
- split committed content identity from live projection samples;
- make retained section scroll a per-surface projection path;
- prevent cold placeholders from replacing previous coherent content;
- preserve observed Settings All Settings pan/zoom, section scroll, and
  activation behavior.

## Scenario

- Entry point: `http://127.0.0.1:3019/settings`
- Data set: Settings project, All Settings-scale scene.
- Final large-scene sample: 46 nodes, 45 retained surfaces, 476 retained rows.
- Browser lane: Chrome for Testing via repo Playwright/CDP scripts with
  HTML-in-canvas and WebGPU enabled.

## Before

- Fail-first signal: the broad GPU Flow HTML-in-canvas E2E path reported
  `17` active texture uploads during pan/zoom, centered on the
  `gen-python-section` surface. That proved viewport motion still caused
  active upload work instead of projecting already committed content.
- Earlier reproduction reports for the same family recorded visible DOM-control
  scale growth after switching to All Settings, `gpu-flow-frame` growth from
  about `3.4 ms` to about `14.6 ms`, and retained section wheel scroll using
  global `"viewport"` frame publication.

## Implementation Summary

- Added `frontend/src/gpuFlow/committedSurfaceRuntime.ts` and rewired
  `useGpuFlowCommittedSurfaceFrameState()` through `useSyncExternalStore`.
  Committed publication is now runtime-owned and no longer uses `flushSync`.
- Split committed actor identity into content, layout/projection, readiness,
  and live-motion identities. Per-surface retained scroll revisions now flow
  through retained runtime frames and DOM control sources.
- Added `"retained-scroll"` as a distinct frame reason and moved retained
  scroll controllers off `"viewport"` frame requests.
- Kept previous retained display frames through scene/runtime updates when no
  true scene reset exists, so activation and repair do not clear coherent
  content into a cold placeholder.
- Moved passive text-like values to canvas-owned retained rendering with
  native-island activation for active editing.
- Deferred resolution-only HTML texture uploads during active viewport motion
  and exposed `deferredSurfaceIds` diagnostics.
- Reset context-menu state before opening a new target so multiple menu stores
  cannot remain open together.
- Refactored large texture/e2e helper files into smaller modules to satisfy
  quality gates without changing behavior.

## After

Final automated large-scene sample:
`perf/reports/frontend/2026-05-17_gpu-flow-committed-surface-actor-refactor-strict.jsonl`

| Gesture | Frame p50 | Frame p95 | Frame p99 | Max | Long tasks |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pan | 8.3 ms | 8.8 ms | 9.2 ms | 9.3 ms | 0 |
| Zoom | 8.3 ms | 9.0 ms | 9.2 ms | 16.6 ms | 0 |
| Retained-hover zoom | 8.3 ms | 9.0 ms | 9.3 ms | 16.6 ms | 0 |
| Retained section scroll | 8.3 ms | 16.7 ms | 16.9 ms | 16.9 ms | 0 |
| Mixed scroll/zoom | 8.4 ms | 16.8 ms | 24.9 ms | 25.3 ms | 0 |

Visual continuity in the same sample:

- Before/pan/zoom/retained-hover-zoom/retained-scroll/mixed screenshots all
  had `bandCount: 0`.
- `highConfidencePlaceholder` was `false` for every captured phase.
- Nonblank ratios stayed between `0.972` and `0.983`.

CDP visual check:

- Command: `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh`
- Page: `http://127.0.0.1:3019/settings`
- Result: no unexpected application error, `HTMLCanvasElement.layoutSubtree`
  available, one GPU canvas mounted at `1440 x 644` CSS px, 476 retained rows,
  138 visual surfaces, and `0` passive DOM controls.
- Console: no errors; one React Router future-flag warning.

## Plan Audit

- Milestone A: fail-first coverage was added/updated before the runtime cuts;
  the active-upload pan/zoom failure was observed before the fix.
- Milestone B: runtime-owned committed publication, identity splitting,
  per-surface retained scroll, pan/zoom projection, and previous-coherent-frame
  holding landed together. `rg -n "flushSync" frontend/src/gpuFlow frontend/src/components/Pages/Project/GpuProjectSurface`
  returns no matches.
- Milestone C/D: text-like rows are canvas-owned for passive display and use
  native DOM islands for active editing. The retained text-like rendering and
  CodeMirror scroll specs cover passive display, active handoff, and restoration
  behavior without broad passive DOM controls.
- Milestone E: diagnostics now include deferred upload ids, upload summaries,
  per-surface scroll revisions, DOM-control scale, and retained visual surface
  counts. The full GPU Flow/retained Settings verification shard passed.

The passive accessibility/semantics model for the migrated text-like slice is
active-only native DOM plus bounded retained diagnostics; passive rendering does
not recreate a visible or per-frame projected DOM graph.

## Verification

Final commands run after the refactor:

| Command | Result |
| --- | --- |
| `pnpm -C frontend exec vitest run src/gpuFlow src/components/Pages/Project/GpuProjectSurface src/state/actions/contextMenus.test.ts` | Passed, 148 files / 954 tests |
| `./scripts/run-playwright-e2e.sh frontend/tests/e2e/gpu-flow frontend/tests/e2e/settings/settings-gpu-retained-interaction.spec.ts frontend/tests/e2e/settings/settings-retained-*.spec.ts` | Passed, 50/50 tests in 4.2m |
| `./scripts/quality/check.sh` | Passed |
| `pnpm -C frontend exec tsc --noEmit --pretty false` | Exits 2 from existing repo-wide diagnostics |
| touched-file TSC filter | No diagnostics matched touched frontend files |

The touched-file TSC filter was:

```sh
git status --porcelain | awk '{print $2}' | sed 's#^frontend/##' > /tmp/setta-touched-frontend-files
rg -n -F -f /tmp/setta-touched-frontend-files /tmp/setta-touched-tsc.out
```

## Raw Artifacts

- `perf/artifacts/frontend/2026-05-18_gpu-flow-canvas-first-committed-runtime-cdp.png`
- `perf/artifacts/frontend/2026-05-18_gpu-flow-canvas-first-committed-runtime-all-settings-cdp.png`
- `perf/reports/frontend/2026-05-17_gpu-flow-committed-surface-actor-refactor-strict.jsonl`

## Residual Risk

- The final automated browser lane is refresh-aware and CI-compatible. It
  demonstrates near-120Hz pan/zoom cadence and no long tasks, but retained
  scroll/mixed gestures still report p95 around one 60Hz frame in this measured
  lane. A dedicated high-refresh local hardware trace is still the stricter
  way to close the exact 8.33 ms target.
- Full frontend TSC remains blocked by existing repo-wide diagnostics; touched
  files from this change are clean under the exact-path filter above.
