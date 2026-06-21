# Workspace Drag-and-Drop Repair - 2026-06-22

## Scope

This report covers the first repair pass for workspace pane drag-and-drop:

- pane-level row and column drop semantics,
- normal-mode pointer geometry to `PaneDropIntent`,
- overview-mode ghost target to `PaneDropIntent`,
- single-commit `after` placement,
- requestAnimationFrame coalescing for drag preview updates,
- drag-source host geometry isolation during preview frames,
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

Result: 22 test files passed, 248 tests passed.

Focused drag metrics command:

```sh
pnpm exec vitest run \
  src/renderer/src/workspace-layout/metrics.test.ts \
  src/renderer/src/workspace-layout/pane-drag-reorder.test.ts \
  src/renderer/src/workspace-layout/presentation-engine.test.ts
```

Result: 3 test files passed, 28 tests passed.

Focused presentation-engine command:

```sh
pnpm exec vitest run src/renderer/src/workspace-layout/presentation-engine.test.ts
```

Result: 1 test file passed, 19 tests passed.

Focused store guardrail command:

```sh
pnpm exec vitest run src/renderer/src/workspace-layout/layout-store.test.ts
```

Result: 1 test file passed, 37 tests passed.

Electron workflow syntax check:

```sh
node --check tests/electron/pane-drag-drop-workflow.test.mjs
```

Result: passed.

| Area | After repair evidence |
| --- | --- |
| Cross-column pane drag | `layout-engine.test.ts` verifies a single pane leaves a stacked source column while siblings stay behind. |
| Row drop into another column | Engine and store tests verify `row before` and `row after` intent placement. |
| New column drop | Engine tests verify the new column is seeded from the destination column width, not the source column. |
| `after` placement | Store test verifies one revision bump for an `after` row drop. |
| Overview drag placement | `workspace-overview-ghost.test.ts` verifies `above`/`below` map to row drops and `right` maps to a column drop. |
| Preview coalescing | `pane-drag-reorder.test.ts` verifies multiple pointer moves before one animation frame produce one preview for the latest intent. |
| Preview notification bounds | `layout-store.test.ts` verifies duplicate preview intents do not notify, changed intents notify once, and duplicate clears do not notify. |
| Drag-source geometry ownership | `presentation-engine.test.ts` verifies hosts marked `data-drag-source` do not receive preview frame transform, size, or surface viewport sync until the drag-source flag is cleared. |
| Preview metrics | `metrics.test.ts` verifies `paneDragPreviewUpdates` / `paneDragPreviewClears` snapshot and reset behavior. `pane-drag-reorder.test.ts` verifies the normal drag path records one coalesced update and records clears only when preview state clears. |
| Production pointer workflow | `pane-drag-drop-workflow.test.mjs` drives CDP mouse events through the built Electron app for normal row drop, normal column drop, and overview right-ghost column drop. It is registered in the required workflow manifest. |

## Pending Profiling

Before calling the feature done, run a fresh production desktop build, then run
the production Electron workflow and large workspace profiling in both normal and
overview modes. Append the measured numbers here:

| Mode | Preview updates per drag | Preview clears per drag | React commits during drag | p95 frame | p99 frame | Dropped frames | Long tasks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Normal | pending | pending | pending | pending | pending | pending | pending |
| Overview | pending | pending | pending | pending | pending | pending | pending |

The production Electron workflow and Chrome frame profiling were not run in this
slice because they need a fresh desktop build. The existing `desktop/out`
artifact is stale relative to this work: `desktop/out/renderer/index.html` was
last modified at 2026-06-22 12:09:02, while the drag/drop source edits were made
after 13:28. The current task instruction says not to run code quality checks
yet, so no fresh build/typecheck gate was started.

The broad quality gate was intentionally not run for this slice because the task
instruction says not to run code quality checks yet.
