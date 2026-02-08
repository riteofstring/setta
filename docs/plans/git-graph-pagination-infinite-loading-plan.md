# Git Graph Pagination + Infinite Loading Plan

## Summary

The Git Graph overlay currently requests a fixed batch (`maxCount: 2000`) and stops there. This prevents reaching older history in repos with more than ~2000 commits and makes the end-of-history behavior ambiguous.

This plan adds true pagination at the API level and infinite loading in the Git Graph UI so users can keep scrolling toward the start of history, with clear UX states for loading, errors, and repository-limit boundaries.

## Goals

- Load commit history incrementally as the user scrolls.
- Make "how much is loaded" explicit and predictable.
- Preserve current graph rendering behavior (lanes, expansion rows, diff pane, selection).
- Keep UI responsive while loading large histories.
- Support both `allRefs=true` and branch-only (`rev`) modes.

## Non-Goals (Initial)

- Full-text server-side search over all commits.
- Bidirectional pagination (newer + older) in a single session.
- Reworking git graph lane algorithm semantics.

## Current Behavior (Baseline)

- Frontend requests `route_get_git_log({ rev: "HEAD", maxCount: 2000, allRefs })`.
- Backend clamps `maxCount` with `_MAX_LOG_COUNT = 5000`.
- Response returns one flat commit list with no cursor/next-page metadata.
- Scrolling to the bottom of the list does not trigger additional fetches.

## Proposed UX

1. Initial load fetches a first page (recommended: `pageSize = 250`).
2. Scrolling near the bottom auto-fetches the next page.
3. The list shows an inline bottom status row:
   - `Loading more commits...`
   - `Could not load more commits. Retry`
   - `Start of history reached`
   - `Showing first N commits (cap reached)`
4. No duplicate file list behavior changes (non-graph pane behavior remains as-is).
5. Selected commit remains selected when new pages append.

## API Design

### Request model changes

Update `GetGitLogRequest` to pagination-first fields:

- `rev: str = "HEAD"`
- `allRefs: bool = False`
- `offset: int = 0`
- `pageSize: int = 250`

Notes:

- Keep camelCase field naming (consistent with repo style).
- Clamp `pageSize` to a safe range, e.g. `1..500`.
- Clamp `offset` to `>= 0`.

### Response model changes

Update `GetGitLogResponse` with page metadata:

- existing: `repoRoot`, `headBranch`, `commits`
- add: `offset: int`
- add: `pageSize: int`
- add: `nextOffset: int | None`
- add: `hasMore: bool`
- add: `isCapped: bool`

Semantics:

- `hasMore` indicates more history is available for this query shape.
- `nextOffset` is the request offset for the next page (or `None` when done).
- `isCapped=true` means backend safety cap prevented reading full history.

### Backend query strategy

In `route_get_git_log`:

1. Compute clamped `pageSize`, `offset`.
2. Respect global cap (`_MAX_LOG_COUNT`), with bounded window behavior:
   - Effective max readable index: `_MAX_LOG_COUNT`.
   - If `offset >= _MAX_LOG_COUNT`: return empty page, `hasMore=false`, `isCapped=true`.
3. Run `git log --topo-order --no-color --skip=<offset> --max-count=<pageSize + 1> ...`.
4. Parse up to `pageSize + 1` commits:
   - If count > `pageSize`, trim to `pageSize` and set `hasMore=true`.
   - Else `hasMore=false`.
5. If reaching cap boundary, force `hasMore=false` and `isCapped=true`.

Rationale:

- `pageSize + 1` avoids a second count call for end detection.
- `--skip` is straightforward and predictable for a first iteration.

## Frontend State Changes

In graph overlay state (`frontend/src/state/git.ts`), add fields:

- `isLoadingMore: boolean`
- `hasMore: boolean`
- `nextOffset: number | null`
- `pageSize: number`
- `loadMoreError: string | null`
- `isCapped: boolean`

Behavior rules:

- Initial load (`offset=0`) sets/clears primary loading state.
- Incremental load only toggles `isLoadingMore` + `loadMoreError`.
- Append commits to existing response on success; do not reset selection.
- Recompute graph rows from the accumulated commit list (phase 1).

## Frontend Action Flow

### Initial fetch

`openGitGraphOverlay` / `refreshGitGraphOverlay`:

- Request first page with `offset=0`.
- Initialize pagination metadata from response.

### Load-more action

Add `loadMoreGitGraphCommits()` action:

- Guard clauses:
  - overlay must be graph mode
  - not already loading more
  - `hasMore=true`
  - `nextOffset != null`
- Use request token/id to ignore stale responses (same pattern as current log request guard).
- On success:
  - append commits
  - update `nextOffset`, `hasMore`, `isCapped`
  - recompute rows
- On failure:
  - keep existing commits
  - set `loadMoreError`

### Reset points

Reset pagination state when:

- toggling all refs / branch mode
- changing filter mode behavior that invalidates loaded history
- explicit refresh
- closing/reopening graph overlay

## Infinite Loading Trigger

Recommended trigger strategy (stable with virtualization):

- Use history pane scroll container (`git-graph-commit-list-wrapper`) scroll events.
- Trigger `loadMoreGitGraphCommits` when scroll position is within a threshold from bottom (e.g. 500px).
- Throttle checks with `requestAnimationFrame` or lightweight debounce.

Alternative (optional): sentinel row + `IntersectionObserver` if scroll container integration is cleaner.

## Filter Behavior

Current filter is client-side over loaded commits. With pagination this can mislead users into thinking they searched full history.

Phase 1 recommendation:

- Keep current client-side filter for speed.
- Show helper text when filter is active: `Filtering loaded commits only`.

Phase 2 (optional): add server-side query fields and paged filtered results.

## Performance Considerations

- Keep page size moderate (`200-300`) to reduce parse + row recompute spikes.
- Recompute graph rows per append in phase 1 (simple and safe).
- If profiling shows append lag at large sizes, add incremental row computation in a follow-up.
- Maintain existing virtualization; only loaded rows are rendered.

## Error Handling and Resilience

- Initial-load failure keeps current full-screen error behavior.
- Load-more failure keeps current rows visible and offers inline retry.
- If git command times out during load-more, surface concise message and allow retry.
- If repository changes during pagination (new commits), allow eventual consistency; explicit refresh re-syncs.

## Files Expected To Change

Backend:

- `backend/setta/types/git.py`
- `backend/setta/routers/git.py`
- tests under `tests/` mirroring backend namespace (add git log pagination coverage)

Frontend:

- `frontend/src/state/git.ts`
- `frontend/src/state/actions/git.ts`
- `frontend/src/components/Git/GitGraphOverlay.tsx`
- `frontend/tests/e2e/git/git-diff-and-graph-overlay.spec.ts`
- optional unit tests for action/state transitions

Generated endpoint/types sync:

- `source activate.sh && cd frontend && pnpm generate`

## Test Plan

### Backend tests

Add focused tests for paginated `GET_GIT_LOG` route behavior:

1. `offset=0`, `pageSize=N` returns `<=N` and correct `nextOffset`/`hasMore`.
2. Two consecutive pages have no overlap and preserve order.
3. End-of-history page returns `hasMore=false`, `nextOffset=None`.
4. Cap boundary reports `isCapped=true` and stops paging.
5. `allRefs` and branch-only paths both paginate correctly.

### Frontend unit/integration tests

1. `refreshGitGraph` initializes pagination metadata.
2. `loadMoreGitGraphCommits` appends commits and keeps selection.
3. Guard behavior prevents duplicate concurrent load-more calls.
4. Load-more errors do not clear existing rows.

### Playwright E2E

Update/add Git Graph E2E:

1. Seed repo with > first-page commits.
2. Open graph overlay; verify first page loads.
3. Scroll to bottom; verify additional commits appear.
4. Repeat until `Start of history reached` or capped state appears.
5. Verify divider resizing and diff pane behavior remain intact (regression checks).

## CDP Manual Verification (Required)

1. Open Git Graph overlay.
2. Scroll down repeatedly; confirm bottom loader appears/disappears correctly.
3. Confirm no visual jitter in header/rows while appending pages.
4. Confirm selected commit remains selected when older pages load.
5. Confirm end/capped messaging appears and no further requests fire.

## Rollout Strategy

1. Backend pagination contract + tests.
2. Frontend state/actions for initial + load-more fetch.
3. UI infinite-load trigger + footer statuses.
4. Playwright updates.
5. CDP verification and perf spot-check.

## Risks and Mitigations

1. Risk: `--skip` becomes slow for very large offsets.
   - Mitigation: keep caps, moderate page sizes; consider cursor/hash-based strategy in follow-up if needed.
2. Risk: repo mutates during pagination, causing minor ordering drift.
   - Mitigation: allow refresh-to-rebase model; document eventual consistency.
3. Risk: row recompute cost grows with loaded commits.
   - Mitigation: monitor with DevTools; add incremental graph-row builder if needed.

## Done Criteria

- Users can scroll beyond the first page and continue loading older commits.
- UI clearly indicates loading, retry, end-of-history, and cap states.
- No duplicate rows across pages.
- Existing Git Graph interactions (expand/collapse, file diff selection, pane/column resizing) continue to work.
- Automated backend + frontend + Playwright coverage added/updated.
- CDP visual verification completed and recorded in task response.
