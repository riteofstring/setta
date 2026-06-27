# Workspace Drag-and-Drop Repair - 2026-06-22

## Scope

This report covers the first repair pass for workspace pane drag-and-drop:

- pane-level row and column drop semantics,
- normal-mode pointer geometry to `PaneDropIntent`,
- overview-mode ghost target to `PaneDropIntent`,
- single-commit `after` placement,
- requestAnimationFrame coalescing for drag preview updates,
- drag-source host geometry isolation during preview frames,
- drag-source host frame state isolation during preview frames,
- drag-source host visibility preservation if a transient preview frame omits it,
- drag-source host binding reservation if a transient preview frame wants to
  recycle it for another pane,
- drag-source host top-layer CSS without paint-heavy filter styling,
- frame metrics for pane drag preview update and clear counts,
- production-path Electron pointer workflow coverage for row, column, and
  overview ghost drops.

## Baseline

Baseline was taken from the pre-repair implementation described in
`docs/plans/workspace_drag_and_drop_repair_plan.md` and the code state before the
repair commits:

| Area | Before repair |
| --- | --- |
| Cross-column pane drag | Moved the entire source column into the target plane. |
| Drop into another column as row | Not representable; cross-column drag was always horizontal. |
| `after` placement | Implemented as two reorder commits. |
| Overview drag | Used `overviewPaneIdAtPoint` and always committed `before`. |
| Preview churn | Preview updates were immediate on target changes. |

Chrome frame profiling numbers were not captured before this slice. The final
performance sign-off still needs a large-DOM normal and overview drag profile
with p95/p99 frame time, long tasks, and dropped frames.

## After Guardrails

Focused command:

```sh
pnpm exec vitest run \
  src/renderer/src/workspace-layout/pane-drag-reorder.test.ts \
  src/renderer/src/workspace-layout/workspace-overview-ghost.test.ts \
  src/renderer/src/workspace-layout/layout-engine.test.ts \
  src/renderer/src/workspace-layout/layout-store.test.ts
```

Result: 4 test files passed, 93 tests passed.

Additional focused workspace-layout command:

```sh
pnpm exec vitest run src/renderer/src/workspace-layout
```

Result: 22 test files passed, 258 tests passed.

Focused drag metrics command:

```sh
pnpm exec vitest run \
  src/renderer/src/workspace-layout/metrics.test.ts \
  src/renderer/src/workspace-layout/pane-drag-reorder.test.ts \
  src/renderer/src/workspace-layout/presentation-engine.test.ts
```

Result: 3 test files passed, 28 tests passed.
Latest rerun after the active-source binding guard: 3 test files passed, 31
tests passed.

Focused presentation-engine command:

```sh
pnpm exec vitest run src/renderer/src/workspace-layout/presentation-engine.test.ts
```

Result: 1 test file passed, 21 tests passed.

Focused store guardrail command:

```sh
pnpm exec vitest run src/renderer/src/workspace-layout/layout-store.test.ts
```

Result: 1 test file passed, 39 tests passed.

Electron workflow syntax check:

```sh
node --check tests/electron/pane-drag-drop-workflow.test.mjs
```

Result: passed.

Focused drag-source CSS formatting check:

```sh
pnpm exec prettier --check src/renderer/src/workspace-layout.css
```

Result: passed.

Production Electron/Vite build:

```sh
pnpm exec electron-vite build
```

Result: passed.

Production pane drag/drop workflow:

```sh
node tests/electron/pane-drag-drop-workflow.test.mjs --keep-artifacts
```

Result: passed. Artifact:
`.recordings/pane-drag-drop-workflow/20260622T185753652Z`.

| Area | After repair evidence |
| --- | --- |
| Cross-column pane drag | `layout-engine.test.ts` verifies a single pane leaves a stacked source column while siblings stay behind. |
| Row drop into another column | Engine and store tests verify `row before` and `row after` intent placement. |
| New column drop | Engine tests verify the new column is seeded from the destination column width, not the source column. |
| Edge placements | `layout-engine.test.ts` verifies row drops before the first row and after the last row in target columns, plus column drops before the first column and after the last column in a target plane. |
| `after` placement | Store test verifies one revision bump for an `after` row drop. |
| No-op drops | `layout-store.test.ts` verifies current-neighbor row drops, drop-onto-self, and no-op adjacent column drops do not bump revision. |
| Overview drag placement | `workspace-overview-ghost.test.ts` verifies `above`/`below` map to row drops and `right` maps to a column drop. |
| Preview coalescing | `pane-drag-reorder.test.ts` verifies multiple pointer moves before one animation frame produce one preview for the latest intent. |
| Rapid target changes | `pane-drag-reorder.test.ts` verifies rapid back-and-forth dragging records preview updates only for changed targets and does not emit duplicate updates for repeated same-target frames. |
| Preview notification bounds | `layout-store.test.ts` verifies duplicate preview intents do not notify, changed intents notify once, and duplicate clears do not notify. |
| Drag-source geometry ownership | `presentation-engine.test.ts` verifies hosts marked `data-drag-source` do not receive preview frame transform, size, layer, visibility, moving, runtime, or surface viewport sync until the drag-source flag is cleared. It also verifies an active drag-source host is not hidden if a transient preview frame omits it, and is not recycled for another pane while the drag is active. |
| Drag-source CSS stability | `workspace-layout.css` keeps the active drag source in a top layer with no brightness filter, avoiding filter-induced repaint work and sibling z-index flicker during pointer-driven moves. |
| Overview drag commit stability | The production workflow verifies overview drag starts from settled visible hosts, excludes the active drag source from ghost geometry, previews the right ghost, and commits the retained preview intent on release. |
| Preview metrics | `metrics.test.ts` verifies `paneDragPreviewUpdates` / `paneDragPreviewClears` snapshot and reset behavior. `pane-drag-reorder.test.ts` verifies the normal drag path records one coalesced update and records clears only when preview state clears. |
| Production pointer workflow | `pane-drag-drop-workflow.test.mjs` drives CDP mouse events through the built Electron app for normal row drop, normal column drop, and overview right-ghost column drop. It is registered in the required workflow manifest. |
| Large workspace benchmark workflow | `pane-drag-drop-benchmark-performance.test.mjs` loads the 500-pane benchmark scene at a 3840x2160 viewport, prewarms bitmap snapshots, drives normal and overview drag gestures, and is registered in the performance workflow manifest. |

Production pointer workflow metrics from
`.recordings/pane-drag-drop-workflow/20260622T185753652Z/summary.json`:

| Gesture | Preview updates | Preview clears | React commits during drag | p95 frame | p99 frame | Dropped frames | Long tasks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Normal row drop | 1 | 1 | 0 | 12.7ms | 12.7ms | 2 | 0 |
| Normal column drop | 1 | 1 | 0 | 12.6ms | 12.6ms | 8 | 0 |
| Overview column drop | 1 | 1 | 0 | 0.8ms | 0.8ms | 1 | 0 |

Focused scheduler/snapshot/source guard command:

```sh
pnpm exec vitest run \
  src/renderer/src/workspace-layout/presentation-engine.test.ts \
  src/renderer/src/workspace-layout/frame-scheduler.test.ts \
  src/renderer/src/workspace-layout/surface-registry.test.ts
```

Result: 3 test files passed, 60 tests passed.

Large workspace workflow syntax check:

```sh
node --check tests/electron/pane-drag-drop-benchmark-performance.test.mjs
```

Result: passed.

Large workspace benchmark workflow:

```sh
node tests/electron/pane-drag-drop-benchmark-performance.test.mjs --keep-artifacts
```

Result: passed. Artifact:
`.recordings/pane-drag-drop-benchmark-performance/20260622T185922310Z`.

The benchmark scene was run in production Electron at a 3840x2160 viewport with
500 total panes. The normal gesture measured a cross-column row drop with 40
visible pane hosts. The overview gesture measured active overview drag source
stability from a centered visible overview card with all 500 overview cards
represented. Active-drag metrics use the pre-release measurement window; preview
clear counts come from the final post-release metrics in the same summary.

| Mode | Preview updates per drag | Preview clears per drag | React commits during drag | p95 frame | p99 frame | Dropped frames | Long tasks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Normal benchmark row drop | 1 | 1 | 0 | 5.5ms | 5.5ms | 1 | 0 sampled |
| Overview benchmark active drag | 1 | 1 | 0 | 1.5ms | 1.5ms | 0 | 0 sampled |

The active drag windows also recorded zero snapshot capture requests. This is
covered by `surface-registry.test.ts`, which verifies bitmap warmup is skipped
while a pane drag source is active, and by `frame-scheduler.test.ts`, which
verifies active pane-drop previews and drag-source movement overrides render as
movement frames.

The passing benchmark metrics above come from the workflow's CDP-driven
production Electron run plus in-page `requestAnimationFrame` and
`PerformanceObserver` sampling.

The broad quality gate was intentionally not run for this slice because the task
instruction says not to run code quality checks yet.
