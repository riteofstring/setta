Compared `main...HEAD` (merge-base diff) and cross-checked against `cumulative_review.md`.

## Findings

### 1) Medium: Backward-compatibility shims are still present in managed/scriptable execution-settings updates
- Example:
  - `frontend/src/components/Section/Layouts/ChatArea.tsx:591`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx:592`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx:1363`
  - `frontend/src/components/Section/Layouts/ChatArea.tsx:1364`
- Why this is an issue:
  - `permissionMode` and `searchEnabled` are now first-class fields on chat section state, but these `??` fallbacks silently mask missing/invalid state and reintroduce a compatibility path you said you don’t want.
  - In failure/race scenarios this can also apply stale prop values instead of hard-failing on bad state.
- Proposed fix:
  - Remove the nullish fallbacks and read directly from `currentSectionState`.
  - If you want explicit invariants, throw when either value is unexpectedly missing.
- UX/DX before:
  - UX: potential silent drift in effective execution settings when state is malformed.
  - DX: state-shape bugs are hidden and harder to debug.
- UX/DX after:
  - UX: deterministic execution-settings behavior.
  - DX: schema/state violations surface immediately at the source.

### 2) Low: Workspace-root Python revalidation effectively bypasses the cache TTL and rescans too aggressively
- Example:
  - Revalidation interval every 5s: `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx:251`
  - Cache only used when `revalidationTick === 0`: `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx:289`
  - TTL is defined but mostly bypassed after first tick: `frontend/src/components/Panes/Overview/ProjectLevelAI/workspacePythonSignals.ts:16`
- Why this is an issue:
  - Once revalidation starts, `revalidationTick` stays `> 0`, so cache reads are skipped and `route_get_folder_contents` runs repeatedly.
  - For large roots this is avoidable background load and can add UI jitter/noise.
- Proposed fix:
  - Check cache on every revalidation tick; only scan when cache entry is missing/expired.
  - Or set the revalidation cadence to cache TTL/backoff so scans are bounded.
- UX/DX before:
  - UX: extra background requests while Project Chat empty-state is visible.
  - DX: noisier perf traces and harder profiling of unrelated UI work.
- UX/DX after:
  - UX: lower background load with same functional behavior.
  - DX: cleaner perf characteristics and easier diagnostics.

## Merge Recommendation
- No high-severity/blocking correctness regressions found in this diff.
- If you’re okay with the two cleanup items above being follow-up work, this branch is mergeable.
