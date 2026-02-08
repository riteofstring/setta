# Git Graph “Same Lane Gap” Debug/Fix Plan

## Problem

In the Git Graph overlay, a single lane can appear visually discontinuous: the same-colored lane is drawn in two segments with a visible gap between them (see the close-up screenshot with the salmon lane). This reads as a rendering bug because the lane should be continuous unless the branch actually ended.

This is distinct from the earlier “color collision” issue (two different lanes reusing the same visible color), because here the complaint is a missing connection for what appears to be the same lane.

## Current Implementation (Relevant Parts)

The graph is rendered as one `<svg>` per row (virtualized list):

1. Vertical lane segments are drawn as `<line>` elements in `GitGraphCell`.
2. Join curves (branch joins into the commit lane) are drawn as cubic Beziers `<path>` from the top of the row to the commit dot (`y=0 -> y=centerY`).
3. Merge curves (merge commit to secondary parent lanes) are drawn as cubic Beziers `<path>` from the commit dot to the bottom of the row (`y=centerY -> y=height`).

The renderer intentionally “clips” some vertical segments to avoid a straight “tail” line extending past a join/merge curve:

- `joinFromLaneIndices` currently suppresses the top half of the source lane vertical segment.
- `mergeToLaneIndices` currently suppresses the bottom half of the destination lane vertical segment.

Code: `frontend/src/components/Git/GitGraphOverlay.tsx` (`GitGraphCell`).

## Working Hypotheses

1. The “gap” is a half-row missing segment caused by clipping the destination lane vertical segment for `mergeToLaneIndices` (we stop the vertical lane at `centerY` even though the lane is continuing through the row).
2. In some edge topology, the lane gets clipped in two consecutive rows in a way that leaves no stroke touching the row boundary for that lane, creating a visible discontinuity between stacked SVGs.
3. Less likely: layout/subpixel issues (row height vs svg height), or SVG overflow/clipping with `strokeLinecap="round"` creating a hairline gap at row boundaries.

## Debugging Plan

1. Reproduce in the running UI (CDP):
   - Open the Git Graph overlay for a repo/commit range where the gap is visible.
   - Identify the two rows adjacent to the gap.
2. Inspect the SVG geometry for the affected lane:
   - For the “salmon” lane color, collect all `line/path` strokes in the two rows.
   - Check whether the lane’s stroke touches the bottom of the upper row (`y=height`) and the top of the lower row (`y=0`).
   - Confirm which of `laneStartIndices`, `laneEndIndices`, `joinFromLaneIndices`, `mergeToLaneIndices` is responsible for suppressing the missing segment.
3. Validate whether the gap is:
   - Within a single row (missing the bottom half or top half due to clipping), or
   - Between rows (no stroke touching the shared boundary).

## Fix Plan

Primary fix (most likely):

1. Revisit the `mergeToLaneIndices` clipping rule in `GitGraphCell`.
2. Adjust vertical lane rendering so that continuing lanes remain continuous through the full row height, even in rows where a merge curve is drawn.
   - Likely change: do not clip the destination lane’s vertical segment to `centerY`.
   - Keep join-source lane suppression (those lanes truly end at this row after joining).
3. Re-run CDP visual verification on the original repro area:
   - Ensure the salmon lane no longer has a gap.
   - Ensure we did not reintroduce the earlier “tail artifact” (straight segment extending past a join/merge).

If the primary fix reintroduces a tail/thickness artifact:

- Consider a more surgical approach:
  - Draw the destination lane full height but shorten only a tiny amount near the curve endpoint (by <= strokeWidth/2), or
  - Adjust drawing order so merge curves paint on top, hiding any overlap without removing continuity.

## Test Plan

1. Add/extend a Playwright regression test under `frontend/tests/e2e/git/git-diff-and-graph-overlay.spec.ts`:
   - Create a small synthetic repo with at least one merge commit (two parents) that produces the relevant geometry.
   - Open Graph overlay, locate the merge row, and evaluate the row’s SVG:
     - For each lane color that appears in consecutive visible rows, assert the upper row has a stroke of that color touching `y=height` and the lower row has a stroke touching `y=0`.
2. Keep the existing “lane alignment across join boundaries” test as a guard for the earlier lane-slot stability work.

## Acceptance Criteria

1. The salmon-lane style discontinuity is gone in the repro (no visible gap between segments for a continuing lane).
2. Join/merge curves remain tangent and visually clean (no right-angle joins).
3. No regression of prior fixes:
   - Lane alignment across row boundaries remains correct.
   - No confusing same-color lane reuse in the same viewport window.
4. Playwright regression test reliably catches the gap case.

