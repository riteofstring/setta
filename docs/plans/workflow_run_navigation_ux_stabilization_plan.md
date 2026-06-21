# Workflow Run Navigation UX Stabilization Plan

- **Date:** June 24, 2026
- **Status:** Ready for implementation.
- **Scope:** Fix the product-facing workflow graph mode behavior after the run
  navigation/history implementation.

## Goal

The workflow graph must feel stable and understandable while moving between:

- editable draft;
- starting/active run;
- historical run.

The backend run model is now much closer to the right long-term shape, but the
frontend interaction model is not acceptable yet. A manual frame-by-frame review
showed toolbar reflow, loading flicker, live run activity leaking into draft
mode, and missing historical run activity. This slice fixes those problems as
first-class behavior, not as cosmetic cleanup.

## Product Principle

The selected graph view owns what the user is looking at.

- Draft view shows editable structure only.
- Active run view shows live execution state and live activity for that exact
  execution.
- Historical run view shows the final execution state and persisted activity for
  that exact execution.

Workspace-level activity is not a display contract. It is an input source. The
renderer must not project activity into a graph unless the current selected
target explicitly allows that run's activity to appear.

## Compatibility Constraint

Do not add backward compatibility, legacy support, migrations, transitional
code, dual-read/write paths, old-field aliases, compatibility shims, or silent
fallbacks.

If the current model or contract is wrong, replace it cleanly. If durable
historical activity needs a different Go-owned contract, add the correct
contract and update the callers directly. Do not preserve old renderer behavior
or old activity semantics for compatibility.

## Manual Review Evidence

The current UI fails in ways the existing tests did not catch:

1. The toolbar changes shape between draft, active run, and historical run.
   Buttons move horizontally, appear, disappear, and change the toolbar width.
2. Clicking `Run` produces visible intermediate frames:
   - draft toolbar;
   - disabled `Starting` toolbar;
   - blank/loading toolbar while the old graph is still visible;
   - later active-run toolbar.
3. Draft mode shows run activity chips/status rectangles, which makes the draft
   look like it is running even when the user is editing.
4. Historical run mode does not reliably show the activity chips that explain
   what happened in that run.

Treat these as release blockers for workflow run navigation.

Latest real-app recording evidence:

- `.recordings/20260624T155648Z/screenshots/0007-periodic.png` shows
  `Draft editable` with `View Active Run`, but live workflow activity chips are
  still rendered on the draft graph.
- `.recordings/20260624T155648Z/screenshots/0008-periodic.png` shows active run
  mode with run chips, which is the expected place for those chips.
- `.recordings/20260624T155648Z/screenshots/0009-app-before-quit.png` shows a
  cancelled historical run graph with node statuses but no explanatory activity
  chips.
- `.recordings/20260624T155648Z/ipc.jsonl` shows the real sequence:
  `workflow_execution_a14d16887d536507c88f441234de2394` started, the user
  switched to draft, selected older cancelled runs, returned to the active run,
  then cancelled it.
- The same IPC log shows the startup workspace activity snapshot contained
  durable records for older cancelled runs, but the records were mostly
  transient `pending` / `running` node activity plus an execution-level
  `cancelled` record. The current marker projection suppresses transient records
  once the run is terminal and suppresses execution-level records as unanchored,
  leaving historical runs with no chips.

So the historical-run issue is not simply "load the existing workspace snapshot
again." The durable activity contract must produce renderable, run-scoped
history for terminal node/run outcomes.

## Root Causes

### 1. Toolbar Structure Is Conditional

`WorkflowGraphToolbar` mounts different controls for different modes:

- `Run`;
- `View Active Run`;
- `Stop`;
- `Edit Draft`;
- the run selector, which currently disappears entirely when no runs exist.

This causes controls to move around while the user is clicking them. The toolbar
is technically correct state-by-state, but it violates the interaction contract.

### 2. Projection Loading Clears The Displayed Projection

`workflow-graph-projection-state.ts` sets `projection: null` on every loading
transition and the hook returns `projection: null` unless the state is ready.

That creates the visible `Blank workflow draft / Loading` frame during view
switches, even while the previous graph is still on the canvas.

### 3. Draft Activity Filtering Is Too Loose

`workspace-activity-markers.ts` currently treats a workflow projection with an
empty `executionId` as matching any workspace activity for the same workflow.
That is appropriate for some backend inventory operations, but it is wrong for
draft rendering.

Draft view must not show run activity chips.

### 4. Historical Run Activity Is Not A First-Class View Source

The activity layer currently reads a workspace-wide activity snapshot and then
filters at marker projection time. That is insufficient as the display contract
for a historical run. A historical run view needs activity for the selected
execution, reconstructed from durable workflow events and workflow-owned chat run
activity, then projected to that run's graph.

Do not solve this by showing live workspace activity in historical mode. That
will be stale, limited, and wrong for older runs.

Do not solve this by disabling stale-transient suppression either. A terminal
historical run should not show old `Workflow pending...` / `Workflow running...`
chips as if they are still active. If the durable event stream lacks node-level
terminal activity for cancelled/failed/completed outcomes, fix the Go-owned
activity source or mapper so the renderer receives truthful terminal records.

## UX Contract

### Stable Toolbar Slots

The toolbar must use stable slots with stable order and reserved widths:

1. workflow title/state/version;
2. settings;
3. add;
4. validate;
5. primary run control;
6. run selector;
7. view switch;
8. details.

Slots may become disabled, and labels/icons may change inside a slot, but the
slot itself must not disappear during normal mode changes.

Primary run control:

- draft with no active run: `Run`;
- draft with active run: `View Active Run`;
- active run: `Stop`;
- historical run: terminal status indicator or disabled `Run from Draft`
  affordance, but no runnable action from historical view.

View switch:

- draft: disabled/current `Draft` affordance or stable placeholder;
- active/historical run: `Edit Draft`.

Run selector:

- always occupies the same slot;
- disabled when there is no history;
- shows the selected run when viewing a run;
- shows `Runs N` or equivalent inventory when viewing draft.

### No Destructive Loading Frame

Switching targets must not blank the projection.

When loading a new target:

- keep rendering the previous graph until the replacement projection arrives;
- disable relevant toolbar actions while loading;
- show a subtle loading state inside the stable toolbar, not a fake blank draft;
- never show `Blank workflow draft / Loading` if a previous projection exists.

The state model should separate:

- selected/pending target;
- displayed projection;
- loading/error status.

### Draft Has No Run Activity Chips

Draft target must project zero workflow run activity chips.

This includes:

- workflow status chips;
- command chips;
- approval chips;
- file change chips.

Draft validation diagnostics may still render through the existing validation
layer. That is not workflow run activity.

### Active Run Has Live Run-Scoped Chips

Active run target should show live activity chips only for the selected
execution id.

If another workflow definition is running, or another execution exists in
history, its activity must not project into the current run graph.

### Historical Run Has Persisted Run-Scoped Chips

Historical run target should show activity chips for the selected execution id,
even after the run is terminal and even after switching away and back.

The source must be durable:

- workflow execution events for workflow status and approval activity;
- workflow-owned chat run activity for command/file-change activity;
- existing typed metadata only.

Do not parse shell output, assistant text, or chip labels to reconstruct history.
If existing typed data is insufficient for a chip kind, show the durable subset
and record the limitation in the evidence report.

Terminal runs must have renderable terminal activity, not only suppressed
transient records. For example, a cancelled run should leave a terminal
`cancelled` record that can be associated with the relevant node or an explicit
run-level graph location. If that information is missing from existing workflow
events, add it at the Go-owned workflow/workspace-activity boundary.

## Implementation Steps

### Step 1: Add Target-Aware Activity Projection

Make activity marker projection take the selected workflow graph target
explicitly, not just the graph.

Expected behavior:

- target `draft`: return no run activity markers;
- target `run`: include only records whose typed execution identity matches the
  selected `executionId`;
- no target or empty graph: return no markers.

This can start in the renderer, but if historical run activity is unavailable
through the existing workspace snapshot, stop and add a Go-owned run-scoped
activity snapshot endpoint rather than widening renderer heuristics.

### Step 2: Add Durable Run Activity Snapshot If Needed

If the existing workspace activity snapshot cannot reliably provide historical
run activity, add a run-scoped endpoint.

Contract shape should be small and explicit, for example:

```ts
ReadWorkflowExecutionActivityRequest {
  workspaceId: string;
  executionId: string;
  limit: number;
}

ReadWorkflowExecutionActivityResponse {
  snapshot: WorkspaceActivitySnapshot;
}
```

The backend should reuse the existing `internal/workspaceactivity` mapper and
typed records. Do not create a parallel activity type unless a concrete typed
gap requires it.

While doing this, audit terminal execution records. The current real-app
recording shows terminal cancellation can be represented only as an
execution-level record while node-level records remain `pending` / `running`.
That is not enough for historical chip rendering. Prefer emitting or mapping
typed terminal node activity from workflow execution state/events so the canvas
can show what actually happened without preserving stale active chips.

For active run live deltas, keep using the existing workspace activity event
stream, but filter by the selected run target before materialization.

### Step 3: Make Projection Loading Non-Destructive

Refactor `workflow-graph-projection-state.ts` so loading a new target preserves
the currently displayed projection.

The reducer should model the difference between:

- target being loaded;
- projection currently displayed.

The renderer should only replace the canvas graph when a new projection is
ready. Loading state may disable controls and update aria/status text, but must
not produce a blank projection frame.

### Step 4: Stabilize Toolbar Layout

Refactor `WorkflowGraphToolbar` around fixed slots.

Do not conditionally remove normal toolbar slots. Use a model that resolves each
slot to:

- label;
- icon;
- disabled state;
- click handler;
- test id;
- width class.

The implementation should avoid nested cards and should keep text within button
bounds at narrow widths.

### Step 5: Clear Mode-Specific Overlays On Mode Switch

Validation panels and draft-only state must not linger over run views.

Rules:

- starting a run clears draft validation UI before the first loading frame;
- switching to any run view clears draft validation UI;
- switching back to draft may keep or re-read draft validation only if it still
  corresponds to the current draft graph.

Do not hide validation by opacity while leaving stale DOM in the way of the run
graph.

### Step 6: Add Visual And Machine Verification

Extend the deterministic Electron workflow run navigation test with frame-aware
checks:

- before click `Run`;
- immediately after click `Run`;
- active run ready;
- after `Edit Draft`;
- after `View Active Run`;
- after selecting a historical run.

Assertions:

- toolbar slot x positions remain stable across modes within a small tolerance;
- there is no frame where the toolbar title becomes `Blank workflow draft` while
  a previous projection exists;
- draft view has zero activity markers and zero visible activity chips;
- active run view has chips only for the active execution id;
- historical run view has persisted chips for the selected execution id;
- validation panel is not visible in run views;
- screenshots cover draft, active run, and historical run states.

The screenshot artifacts are required. Automated assertions prove the contract;
screenshots prove the result is readable.

## Non-Goals

- No replay timeline.
- No animation system.
- No new chip aesthetics beyond what is necessary to make the corrected states
  legible.
- No backward compatibility, legacy support, migrations, transitional code,
  dual-read/write paths, old-field aliases, or compatibility shims.
- No heuristic reconstruction from text output.
- No second active run model.

## Definition Of Done

This slice is done only when:

- toolbar controls no longer jump positions across draft, active run, and
  historical run states;
- clicking `Run` has no blank/loading projection flash;
- draft view shows no workflow run activity chips;
- active run view shows run-scoped live chips;
- historical run view shows run-scoped persisted chips;
- deterministic Electron screenshots demonstrate all three modes;
- machine assertions cover toolbar stability, no blank projection frame, and
  activity marker scoping;
- focused tests pass;
- full required quality gates pass before commit.

## Suggested Verification

Run narrow checks first:

```bash
pnpm -C desktop exec vitest run \
  src/renderer/src/features/workspace-graph/workflow-graph-projection-state.test.ts \
  src/renderer/src/features/workspace-graph/workflow-graph-toolbar.test.ts \
  src/renderer/src/features/workspace-graph/workspace-activity-markers.test.ts
```

Then run the deterministic Electron workflow:

```bash
node desktop/tests/electron/workflow-run-navigation.test.mjs --skip-build
```

Before committing code, run the repository-required gates:

```bash
./scripts/format.sh
./check_quality.sh --all
```

## Handoff Prompt

Implement `docs/plans/workflow_run_navigation_ux_stabilization_plan.md`.

Fix the workflow graph run navigation UX so draft, active run, and historical
run views are visually stable and correctly scoped. Keep toolbar slots stable,
preserve the displayed projection while loading another target, suppress run
activity chips in draft mode, and show run-scoped persisted chips in historical
run mode. Add deterministic Electron assertions and screenshot evidence for the
manual failure sequence.

Do not add replay, animation, heuristic activity parsing, compatibility shims,
legacy support, migrations, transitional code, dual-read/write paths, old-field
aliases, silent fallbacks, or a second active-run model.
