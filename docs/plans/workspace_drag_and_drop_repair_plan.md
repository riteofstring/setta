# Workspace Drag-and-Drop Repair Plan

## Goal

Make pane drag-and-drop actually work, in both normal and overview presentation
modes, with no visible jank. Dragging a pane must let you:

- reorder panes vertically within a column (already works),
- move a single pane horizontally between columns and planes,
- drop a pane into another column so it becomes a new stacked row in that column,
- drop a pane into a new plane/column position.

When a pane lands in a different column or plane, it must **adopt the destination
column's and plane's settings** (width spec, plane membership, row sizing) rather
than dragging its own column settings along and imposing them on the destination.

This is a behavior-and-correctness plan first, and a performance/jank plan second.
Both are required to call the feature done.

## Why it is broken today

The drag UI wiring (pointer capture, threshold, preview swap, ghost overlays) is
mostly in place. The defects are in the reorder semantics and in two diverging
drop paths.

### 1. Cross-column drag moves the whole column, not the pane

`reorderPaneColumnBefore` in
`desktop/src/renderer/src/workspace-layout/layout-reorder.ts:32` is the core of
the drop. When source and target panes are in **different** columns it does not
move the dragged pane at all — it relocates the *entire source column* (with every
sibling pane) into the target's plane:

```ts
// layout-reorder.ts:56
const insertedPlaneColumns = [
  ...targetPlaneColumns.slice(0, targetPlaneIndex),
  { ...sourceColumn, planeIndex: targetColumn.planeIndex },
  ...targetPlaneColumns.slice(targetPlaneIndex),
];
```

Consequences:

- Dragging one pane out of a multi-pane column drags all of its siblings with it.
- A pane can never be dropped *into* another column to become a new row there;
  cross-column drag only ever shuffles whole columns between planes.
- The moved column keeps its own `widthSpec` / `idealWidthSpec` and stamps them
  onto the destination plane. This is the exact "imposes their settings" symptom
  the feature request calls out.

The correct single-pane model already exists for keyboard moves in
`movePaneToAdjacentColumn` (`layout-engine.ts:768`): it splices the pane out of
the source column, pushes it onto the target column's `paneIds`, updates
`pane.columnId`, and calls `removeEmptyColumns()`. The drag path should reuse this
extraction model instead of the whole-column move.

### 2. Drop axis is decided by column identity, not geometry

In `pane-drag-reorder.ts:194`:

```ts
const axis: PaneDropAxis =
  sourcePane.columnId === targetPane.columnId ? "vertical" : "horizontal";
```

So "vertical reorder" is only possible when the cursor is over a pane already in
the same column. There is no path to drop a pane into a *different* column as a
stacked row. The user's mental model ("drop it below that pane over there") is
unreachable.

### 3. "after" placement is a hacky double reorder, implemented twice

`reorderPaneColumnForPlacement` (`layout-reorder.ts:11`) implements "after" by
calling `reorderPaneColumnBefore(source, target)` then
`reorderPaneColumnBefore(target, source)`. `applyPaneDrop`
(`pane-drag-reorder.ts:108`) *also* implements "after" the same way at the store
layer via two `store.reorderPaneBefore` calls. The two implementations overlap and
diverge, and each `reorderPaneBefore` re-focuses and `notify()`s, so a single drop
fires multiple renders plus a focus jump.

### 4. Overview drag ignores the ghost overlay it shows the user

Overview mode renders rich drop affordances (`OverviewGhostTarget` with
above/below/right placement and ghost rectangles) in
`workspace-overview-ghost.ts`, but those are only used for the "add a new pane"
buttons. The actual overview *drag* path (`WorkspaceLayoutArea.tsx:483` /
`:550`) uses a separate, cruder hit-test (`overviewPaneIdAtPoint`) and always
commits with `"before"`:

```ts
// WorkspaceLayoutArea.tsx:503
runtime.store.previewPaneDrop(overviewSession.sourcePaneId, targetPaneId, "before");
```

The visual ghost the user aims at and the placement actually committed disagree.
There is no horizontal/row distinction and no "after" in overview at all.

### 5. No settings inheritance on landing

Nothing drops the pane's source-column width/row weight and adopts the
destination's. Because the whole column moves (defect 1), source settings are
actively carried over. Even after fixing extraction, we must explicitly decide
what a landed pane inherits.

### 6. Jank sources

- `previewPaneDrop` / `clearPaneDropPreview` call `notify()` on every pointermove
  that changes the target, bumping the store revision and re-rendering the
  workspace (`layout-store.ts:472`, `:484`).
- The preview is recomputed each frame by swapping `this.columns` to a freshly
  rebuilt preview array and restoring it in a `finally` (`layout-engine.ts:249`);
  the "after" preview rebuilds columns twice.
- The dragged host is moved with a direct `style.translate` write
  (`pane-drag-reorder.ts:133`) at the same time React re-renders the preview
  layout for the same element — two systems animating one node, a flicker risk.
- The "after" drop double-commits and double-focuses (defect 3).

## Existing starting point (keep)

- Pointer capture, 6px drag threshold, and source-offset translate in
  `pane-drag-reorder.ts` are fine and should stay.
- The preview-by-swapping-columns approach in `renderFrame`
  (`layout-engine.ts:249`) is a reasonable design; we keep it but feed it correct
  preview columns.
- `movePaneToAdjacentColumn` (`layout-engine.ts:768`) is the reference for correct
  single-pane extraction and empty-column cleanup.
- The Zustand store + `notify()` revision model and the
  `previewPaneReorder` / `clearPaneReorderPreview` engine hooks stay; we reduce how
  often they fire, not how they work.

## Design

### Drop intent: a single typed descriptor

Replace the axis-by-column-identity guess with an explicit, geometry-derived drop
intent computed from the pointer and the hovered pane's rect. One descriptor used
by both normal and overview paths:

```ts
type PaneDropIntent =
  | { kind: "row"; targetPaneId: PaneId; placement: "before" | "after" }   // into a column as a stacked row
  | { kind: "column"; targetColumnId: ColumnId; planeIndex: number; slotPlacement: "before" | "after" }; // as a new column in a plane
```

Hit-testing rule, derived from the hovered pane rect (reuse the geometry already
in `paneDropPlacement` and the overview ghost band math):

- Cursor in the vertical center band of a pane → `row` drop relative to that pane
  (`before`/`after` by cursor Y vs pane mid-height), targeting that pane's column.
- Cursor near a pane's left/right edge (or in the inter-column gutter) → `column`
  drop, inserting a new single-pane column into the plane at that slot.

This makes "drop into another column as a row" and "drop as a new column"
first-class, and it is the same model overview already visualizes
(`above`/`below` → row, `right` → column).

### Engine: pane-level move, not column-level move

Add a single engine operation that both modes call, e.g.
`applyPaneDropIntent(sourcePaneId, intent)`, built on the extraction logic from
`movePaneToAdjacentColumn`:

1. Remove `sourcePaneId` from its source column's `paneIds`.
2. For a `row` drop: insert it into the target pane's column at the index implied
   by `placement`; set `pane.columnId` to the target column. The pane inherits the
   target column's `widthSpec` / `idealWidthSpec` automatically (column owns
   width) and is assigned a default row `weight` for that column (see inheritance
   rules below).
3. For a `column` drop: create a new column in the target plane at the requested
   slot, seeded from the **destination plane's** default column width
   (`defaultColumnWidthSpec` / sibling columns' spec), put the pane in it, and set
   `pane.columnId`.
4. Call `removeEmptyColumns()` and `reindexColumns()` so a drained source column
   disappears and slots/plane indexes stay dense.

`reorderPaneColumnBefore`'s same-column branch (`reorderPaneWithinColumn`,
`layout-reorder.ts:78`) is already correct and is reused for `row` drops within
the source column.

This replaces the whole-column relocation. Whole-*column* reordering (dragging a
column to another plane) is a separate gesture; if we still want it, it should be
triggered by a column-header drag handle, not by dragging a pane.

### Settings inheritance rules (explicit)

When a pane lands in a different column or plane:

- **Column width**: not carried. Width is a property of the destination column.
  A `row` drop inherits the target column's `widthSpec`/`idealWidthSpec`
  unchanged. A `column` drop seeds the new column from the destination plane's
  default/sibling width, never from the source column.
- **Row height / `weight`**: the pane drops its source `weight`/`heightPx` and
  takes the destination column's default row weight, so it shares space evenly
  with existing rows rather than forcing its old height. (`heightPx` should be
  cleared on cross-column landing.)
- **Plane membership**: taken from the destination (`planeIndex`, `slotIndex`
  reassigned by `reindexColumns`).
- **Pane-intrinsic settings** (`surfaceKind`, `surfaceId`, `title`, `subtitle`,
  `tone`, `terminalConfig`): always travel with the pane. These are the pane's
  identity, not layout settings.

Document this table in code near the new engine method so the "adopt destination,
not source" contract is unmistakable.

### Collapse the two "after" implementations

Make `applyPaneDropIntent` handle placement internally (compute the destination
index directly; no double move). Remove the double-reorder in `applyPaneDrop`
(`pane-drag-reorder.ts:116`) and the double-pass `after` branch in
`reorderPaneColumnForPlacement` (`layout-reorder.ts:20`). One commit, one
`notify()`, one focus update per drop.

### Unify the overview drop path

Overview drag should compute a `PaneDropIntent` from the **same**
`OverviewGhostTarget` geometry the user sees (`above`/`below` → `row before/after`;
`right` → `column after`), instead of `overviewPaneIdAtPoint` + hardcoded
`"before"`. Preview and commit then use the same `applyPaneDropIntent`. The ghost
overlay becomes the single source of truth for where a pane will land in overview.

### Jank controls

- Throttle preview recompute to one per animation frame (coalesce pointermoves);
  only `notify()` when the resolved intent actually changes
  (`samePaneDropTarget` already guards target identity — extend it to the full
  intent).
- Keep the dragged pane's transform on a single owner during the gesture. Prefer
  letting the preview layout place the *gap* and using `translate` only on the
  floating source host; ensure the source host is excluded from the preview
  layout pass (it already carries `data-drag-source`) so React and the transform
  write don't fight over the same node.
- Ensure the preview column rebuild is O(columns), not O(columns²); the new
  pane-extraction path touches at most two columns, so the rebuilt array should be
  a targeted splice rather than a full re-derivation where possible.

## Work breakdown

1. **Engine core.** Add `applyPaneDropIntent` (pane extraction + insert + empty
   column cleanup + reindex) and the inheritance rules. Unit-test it directly in
   `layout-engine.test.ts`.
2. **Reorder module.** Replace whole-column relocation in `layout-reorder.ts`
   with the row/column intent logic; delete the double-pass `after`. Keep
   `reorderPaneWithinColumn`.
3. **Intent hit-testing.** Implement geometry → `PaneDropIntent` in
   `pane-drag-reorder.ts`, replacing the column-identity axis guess. Reuse band
   math from the overview ghost helpers.
4. **Store surface.** Replace/extend `reorderPaneBefore` /`previewPaneDrop` with
   intent-based equivalents; ensure a single `notify()` + single focus update per
   commit (`layout-store.ts:472`, `:507`).
5. **Normal-mode wiring.** Point `applyPaneDrop` / preview in
   `WorkspaceLayoutArea.tsx` (`:583`) at the new intent API.
6. **Overview-mode wiring.** Derive the intent from `OverviewGhostTarget` and
   route overview preview + commit through `applyPaneDropIntent`
   (`WorkspaceLayoutArea.tsx:483`, `:550`).
7. **Jank pass.** Frame-coalesce previews, settle transform ownership, verify with
   profiling.
8. **Cleanup.** Remove now-dead double-move code and any column-identity axis
   helpers.

## Testing strategy

Per `AGENTS.md`, exercise production paths, use deterministic setups, and add
performance guardrails for anything performance-relevant.

### Unit / store tests (extend existing `layout-store.test.ts`, `layout-engine.test.ts`)

Cover the cases that currently have **no** coverage:

- Drag a single pane out of a multi-pane column → only that pane moves; siblings
  stay; the source column persists (not relocated wholesale).
- Drop a pane into a different column as a new row, `before` and `after` a target
  pane → correct `paneIds` order and `pane.columnId` updated.
- Drop a pane as a new column in another plane → new column seeded with the
  **destination** plane's width spec, not the source's.
- Settings inheritance: landed pane's column `widthSpec` equals destination's;
  source `weight`/`heightPx` dropped; `surfaceKind`/`title`/`tone` preserved.
- Draining the last pane out of a column removes that column and reindexes
  slots/planes.
- `after` placement commits exactly once (one revision bump, one focus change) —
  assert no double-commit.
- Overview intent derived from each `OverviewGhostTarget` placement
  (`above`/`below`/`right`) maps to the expected row/column drop.
- No-op guards: drop onto self, drop onto current neighbor with no change → no
  revision bump.

### Interaction / DOM tests

Extend `workspace-interactions.test.ts` and `presentation-engine.test.ts` to
drive pointerdown → move past threshold → move over targets → pointerup through
the real handlers in `WorkspaceLayoutArea.tsx`, asserting:

- `data-dropAxis` / `data-dropTarget` (and overview ghost) match the committed
  result.
- The dragged host carries `data-drag-source` during the gesture and is cleared
  after.
- Click suppression after a drag still fires (`suppressNextPaneClick`).

### Jank / performance verification (first-class, per AGENTS.md UI rules)

- Add a guardrail asserting bounded React commits and `notify()` calls across a
  scripted multi-target drag (coalesced to ≤1 preview recompute per frame). Model
  it on the existing workspace frame-metrics harness
  (`WorkspaceFrameMetrics`, `metrics.test.ts`).
- Manual/automated chrome-devtools profiling pass on a large DOM
  (per `AGENTS.md`: frontend must handle very large DOMs) dragging across columns
  and planes in both modes; confirm no long tasks / dropped frames attributable to
  preview churn.
- Record before/after in an append-only report under
  `docs/reports/performance/` (e.g. `workspace-drag-and-drop-<date>.md`):
  preview recomputes per drag, React commits during drag, p95/p99 frame time,
  dropped frames — baseline current behavior first, then re-measure after.

### Live / manual matrix

Drag-test by hand and in tests across: single-pane column → another column;
multi-pane column extraction; into an empty plane; first/last row; first/last
column; both presentation modes; and rapid back-and-forth dragging (jank check).

## Acceptance criteria

1. Dragging a pane moves only that pane (never its silent siblings), in both
   modes.
2. A pane can be dropped: as a new row inside another column; as a new column in a
   plane; and reordered within its own column.
3. A pane that lands in a different column/plane adopts the destination's width
   and row sizing, and does not impose its source column's settings.
4. Overview drag commits exactly where the visible ghost indicates.
5. A single drop produces one layout commit and one focus update — no double-move.
6. No visible jank: preview recompute coalesced to per-frame, no transform
   fighting, profiling shows no new long tasks; before/after report committed.
7. New unit, interaction, and guardrail tests cover the cases above and pass under
   `./check_quality.sh --all` after `./scripts/format.sh`.

## Risks and open questions

- **Whole-column drag**: do we still want a gesture to relocate an entire column
  between planes? If yes, it needs its own column-header drag handle and is out of
  scope here; if no, the removed code stays removed.
- **Default row weight on landing**: confirm the intended even-share behavior with
  design rather than preserving source height; this plan assumes drop-and-share.
- **`column` drop slot precision**: inter-column gutter hit-testing in dense
  layouts may need a minimum target band to avoid accidental new-column creation;
  tune against the overview ghost gap (`overviewGhostGapPx`).
