# Branch 2 Phase 3.5B Chip Details Evidence

- Date: 2026-06-25
- Scope: connect readable workflow activity chips to the existing workflow node
  details Niri pane, deep-link the matching detail row, and render node-scoped
  agent/tool activity through the shared chat run-activity path.
- Production workflow: `node tests/electron/workflow-activity-feed.test.mjs --skip-build`
- Artifact directory: `.recordings/workflow-activity-feed/20260625T045427521Z` (the
  `./check_quality.sh --all` gate run; both chip-click-through screenshots present)

## What Landed

- `WorkspaceActivityMarker` now carries a bounded `detailRef`
  (`kind`, `runItemId`, `approvalId`, `workflowEventId`) derived from the typed
  `WorkspaceActivityRecord.detailRef`. No new backend contract; it is a subset of
  the existing detail ref and is not part of any marker fingerprint.
- The Pixi renderer hit-tests activity chips in screen space (no Pixi interaction
  on the marker layer, so pan/zoom stays manual) and fires a new
  `onActivityChipOpen` handler. A chip opens its node details on pointer release;
  a drag off the chip converts cleanly into a camera pan, so chips never create a
  pan dead zone. Chip hit state lives in `pixi-renderer-pointer-clicks.js`.
- Chip click routing: `workflow-graph-surface` opens the existing
  `workflow-node-details` pane for the owning node and sets a typed
  `selectedNodeActivityFocus` on the workflow editor store. The details pane
  highlights and scrolls to the matching row.
- Deep-link targets: `chat_run_item -> run-item:{id}`,
  `workflow_event -> workflow-event:{id}`, `approval -> approval:{id}`. The focus
  element id is single-sourced through `workflow-node-activity-focus.ts`.
- Workflow node details now render node-scoped agent/tool activity through the
  shared `RunActivityRows` chat component (fed by a preloaded-page adapter),
  replacing the bespoke lower-fidelity run-item renderer. No chat transcript is
  embedded and no chat turns are fabricated.
- Activity chips re-anchor on canvas resize (`applyRendererSize` repositions
  retained chip views) so they re-flow into the new viewport instead of
  stranding off-screen. This is a position-only sync; it does not materialize or
  replace anything.

## Production-Path Evidence

Deterministic Electron `workflow-activity-feed` workflow passed end-to-end. Two
chip kinds are driven through the real Pixi hit-test -> renderer handler ->
editor-store focus -> Niri details pane path
(`workflow-activity-feed-chip-clicks.mjs`):

- Clicking the command chip (typed `chat_run_item` ref) opened the existing
  workflow node details pane for the owning `activity` node and highlighted the
  matching run activity row (`data-activity-focus-id="run-item:run_item_..."`).
  The pane rendered 4 shared chat run-activity rows
  (`data-testid="run-activity-row"`), confirming reuse of the canonical
  run-activity rendering path. Evidence: `activity-feed-chip-details.png` shows
  the shared "Activity (4)" run-activity disclosure with the command run item
  expanded (CWD, COMMAND `printf scripted-activity`, EXIT).
- Closing the details pane and re-maximizing the graph, then clicking the
  workflow-status chip (typed `workflow_event` ref) re-opened the same canonical
  pane and highlighted the matching workflow event row
  (`data-activity-focus-id="workflow-event:..."`). Evidence:
  `activity-feed-chip-details-workflow.png` shows the Events section with the
  `workflow.action.completed #11` event row highlighted.
- No embedded chat transcript on either click: `[data-chat-message]` count was 0
  inside the details surface, and both clicks routed into the single canonical
  `workflow-node-details-surface` (no separate chip-only details surface).

Typed detail refs are present on all three chip kinds in the debug snapshot, so
the deep-link reference is available for each: command/file -> `chat_run_item`
`runItemId`; workflow-status -> `workflow_event` `workflowEventId`; approval ->
`approval` `approvalId`.

The approval deep-link is covered by the focused `WorkflowRunDetailsContent`
component test (it renders the real production component and asserts the
highlighted `data-activity-focus-id="approval:..."`). It is not driven on-canvas
in Electron because, once the run is terminal, there is no pending approval row
to focus; the command and workflow-status clicks cover the production
chip-click-through path end-to-end.

## Niri Layout Note

Opening the workflow node details pane scrolls the graph pane out of view (the
graph canvas ends up with a negative `left` and a clipped width), and the graph
stays scrolled after the pane closes. To drive a second on-canvas chip click the
test closes the details pane and re-maximizes the graph, then waits for the
canvas to be fully on-screen (`canvas.left >= 0`) with the target chip clickable
before clicking.

## Invariants Preserved

- Phase 3.5A chip LOD, layout, per-node cap (4 + `+N`), and compact-LOD behavior
  were unchanged; the compact-LOD and readable-chip assertions still pass.
- No Pixi app / renderer / canvas / layer recreation; renderer identity counters
  stayed stable across activity and the chip click-through.
- Unanchored activity stays suppressed and counted (2 suppressed after
  completion).

## Focused Checks Run

- `pnpm vitest run` over the workspace-graph marker/visual-state/pointer/details
  suites (chip hit-test + detail ref, activity-focus mapping, node-details focus
  + shared run-activity reuse, output-state adapter, pointer-down chip routing).
- `pnpm typecheck`, `pnpm lint`, `pnpm deadcode`, `pnpm build`.
- `./check_quality.sh --files <changed files>` (line length, cyclomatic
  complexity, dead code, full unit suite) — all green.
- `node tests/electron/workflow-activity-feed.test.mjs --skip-build` — passed.
- `./scripts/format.sh` — no changes.
