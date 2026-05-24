# GPU Flow Retained Snapshot Runtime Refactor

Date: 2026-05-13

## Scope

Implemented the retained GPU-flow snapshot runtime refactor from
`docs/plans/gpu-flow-retained-snapshot-runtime-refactor-plan.md`.

- Input frames now sample runtime scroll/viewport state and draw retained content
  from the latest committed scene instead of committing scroll-time scene
  mutations.
- Retained page maintenance and resolution refreshes are deferred away from
  active viewport frames when committed coverage is already available.
- Native retained row visuals, scrollbars, and hover state are regenerated from
  sampled runtime state so hover/scroll feedback survives scene regeneration.
- The obsolete retained scroll scene commit module was deleted.
- Settings retained E2E coverage was strengthened for scroll cadence,
  scroll-then-pan/zoom nonblank behavior, row hover stability, pan ownership,
  switch zoom behavior, and CodeMirror retained activation/scroll paths.

## Baseline Note

No fresh pre-change baseline was captured in this worktree before the refactor
started. The plan already recorded the motivating pre-refactor evidence:
`gpu-flow-viewport-runtime-frame` was cheap, while full `gpu-flow-frame` frames
reached about `14-36ms` during retained page/texture work and retained sections
could temporarily disappear when coverage was missing.

The measurements below are post-change. The temporary metric spec used the same
Playwright helper stack as the E2E suite and was deleted after collection. This
local browser run was cadence-capped/noisy: event spacing often landed in the
`30-90ms` range, so these figures should be read as acceptance-harness evidence,
not a clean 120Hz lab trace.

## Post-Change Metrics

| Gesture | p50 frame | p95 frame | p99 frame | max frame | p95 FPS | slow ratio >16.7ms | long tasks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Retained section scroll | 15.8ms | 50.0ms | 50.0ms | 100.0ms | 20.0 | 0.4 | 1, max 77ms |
| Viewport pan | 26.2ms | 41.7ms | 83.3ms | 83.4ms | 24.0 | 0.9 | 2, max 78ms |
| Viewport zoom | 25.2ms | 33.9ms | 34.7ms | 83.3ms | 29.5 | 0.9 | 1, max 78ms |
| Scroll then pan+zoom | 25.1ms | 50.0ms | 83.3ms | 100.0ms | 20.0 | 0.7 | 5, max 77ms |

Visual/debug state after the combined gesture:

- retained debug rows: `478`;
- target retained surface visible rows: `17`;
- sample visible rows: `Param Move Up Shortcut`, `Param Select`,
  `Param Unindent Shortcut`, `Paste As Ref Shortcut`, `Paste Shortcut`;
- final viewport: `x=183.4`, `y=-68.7`, `zoom=1.2`.

## Verification

Full retained/GPU-flow Settings Playwright suite:

```sh
./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/settings/settings-retained-scroll-performance.spec.ts \
  frontend/tests/e2e/settings/settings-retained-visual-regressions.spec.ts \
  frontend/tests/e2e/settings/settings-retained-pan-zoom-performance.spec.ts \
  frontend/tests/e2e/settings/settings-retained-close-zoom-visual.spec.ts \
  frontend/tests/e2e/settings/settings-retained-interaction-stability.spec.ts \
  frontend/tests/e2e/settings/settings-retained-codemirror-activation.spec.ts \
  frontend/tests/e2e/settings/settings-retained-codemirror-scroll.spec.ts \
  frontend/tests/e2e/settings/settings-retained-pan-ownership.spec.ts \
  frontend/tests/e2e/settings/settings-retained-switch-zoom-flash.spec.ts \
  frontend/tests/e2e/settings/settings-retained-text-like-row-rendering.spec.ts
```

Result: `28 passed (2.7m)`.

GPU-flow Vitest coverage, excluding helper-only files with no suites:

```sh
pnpm -C frontend exec vitest run $(rg --files frontend/src/gpuFlow -g '*test.ts' -g '*test.tsx' -g '!*helpers.test.ts' -g '!*.helpers.test.ts' | sed 's#^frontend/##')
```

Result: `108 files passed`, `709 tests passed`.

Temporary metric collection:

```sh
./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/__tmp_gpu_flow_retained_perf_report.spec.ts
```

Result: `1 passed (16.9s)`. The temporary spec was removed after the run.

Repository quality gate:

```sh
./scripts/quality/check.sh
```

Result: passed.

Chrome DevTools visual verification:

- Started with
  `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh`.
- Opened `/settings`, switched from Core to All Settings, and verified the
  retained GPU-flow canvas was present at `1200x600`.
- CDP debug state after a viewport transform showed `30` visible retained rows,
  including `21` text-like rows and `4` switch rows, with no application error
  and no GPU support error.
- Console warnings contained only the existing React Router future flag warning.
- CDP screenshot capture timed out for the WebGPU/html-in-canvas page, so the
  visual gate used CDP page state/debug surfaces; the Playwright retained visual
  suite above covered screenshot and nonblank pixel assertions.
