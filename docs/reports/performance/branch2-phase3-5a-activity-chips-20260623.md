# Branch 2 Phase 3.5A Activity Chips Evidence

- Date: 2026-06-23T01:27:38Z
- Scope: readable, bounded workflow activity chips on the Pixi workflow graph.
- Artifact directory: `.recordings/workflow-activity-feed/20260623T012738313Z`
- Production workflow: `node tests/electron/workflow-activity-feed.test.mjs --skip-build`

## Visual Evidence

Screenshots captured by the deterministic Electron workflow:

- `.recordings/workflow-activity-feed/20260623T012738313Z/activity-feed-idle.png`
- `.recordings/workflow-activity-feed/20260623T012738313Z/activity-feed-failed.png`
- `.recordings/workflow-activity-feed/20260623T012738313Z/activity-feed-cancelled.png`
- `.recordings/workflow-activity-feed/20260623T012738313Z/activity-feed-waiting-approval.png`
- `.recordings/workflow-activity-feed/20260623T012738313Z/activity-feed-completed.png`
- `.recordings/workflow-activity-feed/20260623T012738313Z/activity-feed-compact-lod.png`

## Counter Evidence

From `summary.json`:

- Waiting/run activity deltas applied: 10
- Deltas during camera movement: 10
- Backend reads during camera movement: 0
- Graph scene replacement touched by activity updates: false
- Revision gap reloads: 0
- Waiting/run chip materialization: created 14, retained 73, updated 13
- Completed chip materialization: created 16, retained 124, updated 18
- Suppressed unanchored activity count: 5 during waiting/run, 2 after completion

Readable chip evidence after completion:

- `Command printf script...`
- `File scripted-activit...`
- `Approval approved Com...`
- `Workflow waiting acti...`
- Collapsed overflow chip: `+6`
- End-node chip placement: `left`, screen bounds `{ left: 612, right: 768, top: 281, bottom: 303 }`
- All visible readable chips asserted within canvas bounds with 12px padding

Compact LOD evidence after wheel zoom:

- Layout mode: `compact`
- Readable chip text threshold: `0.9`
- Camera zoom: `0.8798533791446438`
- Node label visibility mode: `visible-priority`
- Visible node label count: 3
- Activity node label: visible with `visibilityReason: "visible-priority"`
- Marker chip text hidden: command, file, approval, and workflow marker chips
- Collapsed count remains readable: `+6`
- Compact marker width: 28
- Compact collapsed width: 58

## Focused Checks Run

- `pnpm vitest run src/renderer/src/features/workspace-graph/workspace-activity-markers.test.ts src/renderer/src/features/workspace-graph/workspace-activity-state.test.ts src/renderer/src/features/workspace-graph/pixi-renderer-activity-markers.test.js src/renderer/src/features/workspace-graph/pixi-renderer-visual-state.test.js src/renderer/src/features/workspace-graph/pixi-renderer-debug-registry.test.js`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm deadcode`
- `node tests/electron/workflow-activity-feed.test.mjs --skip-build`
