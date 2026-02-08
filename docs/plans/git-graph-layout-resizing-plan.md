# Git Graph Layout Resizing + Expansion Polish Plan

This plan improves the Git Graph overlay UX in these areas:

1. Expanded commit rows feel less cramped.
2. Graph lanes stay visually continuous through expanded commit rows (no "gap" under the SVG graph cell).
3. The "Files changed" list does not show a horizontal scrollbar.
4. Commit list column widths are resizable (Graph, Message, Author, Date, Hash).
5. The divider between commit history (left) and diff viewer (right) is draggable to resize the split.

Related docs:

- Existing overlay + diff work: `docs/plans/git-diff-and-graph-viewer-plan.md`
- Syntax highlighting + per-file commit diffs: `docs/plans/git-diff-syntax-highlighting-plan.md`

## Current Pain Points

1. Expanded row is cramped because:
   - Left pane has a fixed split (`w-[56%]`), so expanded content is constrained.
   - The expanded layout uses a fixed file list width (currently 340px), which can fight available space.
2. Graph lane discontinuity:
   - The SVG graph cell is only rendered in the 28px commit header row.
   - The expanded content below has no "graph gutter", creating a visible gap before the next row.
3. "Files changed" horizontal scrollbar:
   - The list is vertically scrollable, and overflow rules can produce an x-scrollbar when any child overflows.
4. Non-adjustable layout:
   - Column widths are hard-coded.
   - Pane split is hard-coded.

## Goals

1. Make expanded rows readable without needing a huge window.
2. Preserve the mental model of a continuous commit graph, even when a row expands.
3. Remove horizontal scrolling from the file list (truncate instead).
4. Provide direct-manipulation resizing:
   - Column resizers in the commit list header.
   - A draggable splitter between history and diff viewer.
5. Persist layout in local storage so the graph "stays how I left it".
6. Keep performance smooth for large histories (virtualized list).

## Non-Goals

1. Replacing the unified diff viewer with a full side-by-side/Monaco diff editor.
2. Converting the file list into a full tree view (can be a later enhancement).
3. Adding git actions (stage/unstage/checkout) inside this UI.

## UX Proposal

### A. Expanded Commit Row Layout

Changes:

1. Keep expanded content aligned under the same column grid as the header row.
2. Give the "Files changed" panel a responsive width instead of a fixed 340px:
   - Use `minmax(280px, 420px)` or a percentage-based clamp, depending on available width.
3. Ensure long paths truncate with ellipsis and show the full path on hover via `title`.

Optional polish:

1. If the commit body is long, cap it with a "Show more" toggle so the expanded row does not become excessively tall.

### B. Continuous Graph Lanes Through Expanded Rows

Add a "graph continuation gutter" for the expanded section:

1. The expanded section becomes a grid row that includes:
   - Column 1: a graph gutter (same width as the Graph column).
   - Columns 2-5: the expanded commit details + file list UI.
2. The gutter renders vertical lane segments that extend from the bottom of the header SVG to the bottom of the expanded area.
3. The gutter should use the same lane x-positions and colors as the SVG:
   - `x = laneIndex * LANE_WIDTH + LANE_WIDTH / 2`
4. Lanes that end at this row should not continue in the gutter:
   - Use `laneEndIndices` as the primary signal.
   - Also suppress continuation for `joinFromLaneIndices` defensively (these typically represent lanes that merge into the commit).

Implementation detail:

1. Keep the existing SVG unchanged for curves and the commit dot (in the header).
2. In the expanded gutter, render only vertical segments using absolutely positioned `div`s (cheaper than re-deriving full SVG geometry for the expanded height).

### C. Remove Horizontal Scrollbar in "Files Changed"

1. Explicitly set `overflow-x-hidden` on the files list container.
2. Ensure all flex/grid children that need truncation have `min-w-0` and `truncate`.
3. Avoid unbroken strings forcing overflow:
   - Prefer truncation on the path cell, and do not allow the +/- stats cell to expand indefinitely.

### D. Resizable Commit List Columns

Columns to resize:

- Graph
- Author
- Date
- Hash
- Message remains the flexible `minmax(0, 1fr)` column between Graph and Author.

User interaction:

1. Add drag handles in the commit list header between columns.
2. Dragging updates the grid template columns for both:
   - The header row.
   - Each commit row header button.
3. Double-click on a handle resets that column to defaults.
4. Add `role="separator"` + `aria-label` and keyboard resizing support (optional but recommended):
   - Arrow keys adjust by small increments.
   - Shift+Arrow adjusts by larger increments.

Persistence:

1. Store widths in `useLocalStorage` so they survive refresh:
   - `gitGraphColWidthPx`
   - `gitGraphAuthorWidthPx`
   - `gitGraphDateWidthPx`
   - `gitGraphHashWidthPx`

Guardrails:

1. Clamp widths to sane min/max so the layout cannot be broken:
   - Graph: 80-240px
   - Author: 90-260px
   - Date: 90-220px
   - Hash: 70-160px

Performance:

1. During drag, avoid re-rendering the whole overlay on every pointermove:
   - Update CSS variables on the overlay root via `requestAnimationFrame`.
   - Commit final values to Zustand/localStorage on pointerup.

### E. Draggable Split Between History and Diff Viewer

User interaction:

1. Add a vertical splitter between the left commit list pane and the right diff viewer pane.
2. Dragging adjusts the left pane width (right pane flexes).
3. Double-click resets to the default split (current default is ~56% left).

Persistence:

1. Store a single value in `useLocalStorage`:
   - `gitGraphSplitPct` (recommended) or `gitGraphSplitPx`

Guardrails:

1. Enforce min widths:
   - Left pane: at least 320px (existing behavior).
   - Right pane: at least 360px (new) so diffs remain usable.

## Implementation Plan (Frontend)

### 1. Add Persistent Layout Fields

Files:

- `frontend/src/state/definitions.ts`

Add fields to the `ZustandLocalStorage` type and defaults:

1. `gitGraphSplitPct: number`
2. `gitGraphColWidthPx: number`
3. `gitGraphAuthorWidthPx: number`
4. `gitGraphDateWidthPx: number`
5. `gitGraphHashWidthPx: number`

### 2. Introduce a Reusable Pointer-Drag Resizer Helper

Create a small utility or hook:

- `frontend/src/utils/usePointerDrag.ts` (or similar)

Responsibilities:

1. Pointer capture.
2. Cursor management (`col-resize` or `ew-resize`).
3. `requestAnimationFrame` throttling.
4. Cleanup on pointerup/cancel.

### 3. Convert Git Graph Overlay to Use Computed Grid Columns

Files:

- `frontend/src/components/Git/GitGraphOverlay.tsx`

Changes:

1. Replace hard-coded `grid-cols-[...]` with `gridTemplateColumns` (or Tailwind arbitrary grid cols) derived from local storage widths.
2. Add resizer handles in the header:
   - Provide stable selectors: `data-testid="git-graph-col-resize-author"` etc.
3. Ensure commit rows use the same template columns string.

### 4. Add Pane Splitter

Files:

- `frontend/src/components/Git/GitGraphOverlay.tsx`

Changes:

1. Replace `w-[56%]` with `style={{ width: ... }}` driven by `gitGraphSplitPct`.
2. Insert a draggable splitter element between panes:
   - Visual: 1px hairline + 6-10px hit target.
   - `data-testid="git-graph-pane-splitter"`.

### 5. Fix Expanded Row Graph Continuity + Spacing

Files:

- `frontend/src/components/Git/GitGraphOverlay.tsx`

Changes:

1. Wrap expanded content in a grid row that uses the same column template as the header.
2. In the expanded section, render a left gutter in the Graph column:
   - A `div` that positions vertical lane segments with `position:absolute`.
   - `pointer-events:none` so it does not interfere with clicks.
3. Expand spacing:
   - Slightly more vertical padding.
   - Use a responsive file list width (`minmax`).

### 6. Remove Files Changed Horizontal Scroll

Files:

- `frontend/src/components/Git/GitGraphOverlay.tsx`

Changes:

1. Set `overflow-x-hidden` on the file list container.
2. Audit `min-w-0` and `truncate` for the path cell.
3. Ensure stats cell has a bounded width (or stays `shrink-0` but does not force overflow).

## Testing Plan

### Playwright

File:

- `frontend/tests/e2e/git/git-diff-and-graph-overlay.spec.ts`

Add coverage:

1. Pane splitter drag:
   - Measure left pane width.
   - Drag splitter by +120px.
   - Assert width increased and right pane shrank.
2. Column resize drag:
   - Drag the Author column handle.
   - Assert header Author cell bounding box width changes.
3. No horizontal scroll in "Files changed":
   - Expand a commit.
   - Evaluate `scrollWidth <= clientWidth` on the files list container.
4. Expanded gutter exists (continuity guardrail):
   - Add a stable class or `data-testid` on lane continuation elements and assert it exists when expanded.

### CDP Visual Verification (Hard Gate)

When implementing:

1. Start app (`pnpm start`) and Chrome MCP server.
2. Verify:
   - Expanded row feels readable at typical widths.
   - Graph lanes visually continue through the expanded area.
   - No horizontal scrollbar appears in "Files changed".
   - Column resize handles feel good and do not cause jank.
   - Pane splitter drag feels good and respects min widths.

## Performance Notes

1. Keep the commit list virtualized.
2. During drag interactions, update CSS variables via `requestAnimationFrame` and avoid full React re-renders on every pointermove.
3. After resize completes, trigger any necessary `react-window` relayout:
   - If row heights could change, call the dynamic row height reset helper (if needed).

## Rollout / Phasing

1. Phase 1: Expanded row polish
   - Fix horizontal scrollbar.
   - Add graph continuation gutter.
   - Make file list width responsive.
2. Phase 2: Pane splitter
   - Add draggable history/diff divider + persistence.
3. Phase 3: Column resizing
   - Add resizable commit list columns + persistence + tests.
4. Phase 4: Optional a11y polish
   - Keyboard resizing for separators.
   - "Reset layout" button in the graph overlay header.

