# Branch Review (`main...HEAD`)

## Findings (ordered by severity)

1. **High: `git status` truncation is silent, so the UI can show an incomplete file list without warning**
- **Where:** `backend/setta/routers/git.py:271`, `backend/setta/routers/git.py:283`, `backend/setta/routers/git.py:289`, `backend/setta/types/git.py:25`
- **Concrete example:** When `git status --porcelain -z` exceeds `_MAX_STATUS_BYTES` (2 MB), `run_git` sets `stdout_truncated=True`, and the route still parses partial output and returns success. There is no `isTruncated` flag in `GetGitStatusResponse`, so frontend users cannot tell they are seeing only a subset of changed files.
- **Why this matters:** This is a correctness/UX risk. In large repos, users can miss files and trust an incomplete status panel.
- **Proposed fix:**
  - Add `isTruncated: bool` to `GetGitStatusResponse`.
  - Set it from `result.stdout_truncated`.
  - Surface a warning banner in `GitPane` and disable risky assumptions (for example, "all changes listed").
  - Optionally add backend pagination or a higher configurable cap.
- **Before UX/DX:** UI appears complete even when data is partial; debugging “missing file in Git pane” is hard.
- **After UX/DX:** Users get explicit partial-data feedback; developers can reason about large-repo behavior deterministically.

2. **Medium: `rev` in `GET_GIT_LOG` is not validated, enabling option injection into `git log` args**
- **Where:** `backend/setta/routers/git.py:445`
- **Concrete example:** `x.rev` is appended directly to `args`. A caller can send a value that starts with `-` and alter `git log` behavior instead of providing a revision name.
- **Why this matters:** Even in trusted environments, it makes API behavior less predictable and weakens input-contract guarantees.
- **Proposed fix:**
  - Reject `rev` values that start with `-`.
  - Optionally validate against an allowlist regex for revision-like refs, or resolve rev via `git rev-parse --verify` before log fetch.
- **Before UX/DX:** API accepts malformed/option-like revision input with surprising behavior.
- **After UX/DX:** Contract is explicit: `rev` is a revision, not arbitrary CLI flags.

3. **Medium: new Git API/store surface includes unused pieces (dead additions in this branch)**
- **Where:** `backend/setta/routers/git.py:169`, `backend/setta/routers/git.py:784`, `frontend/src/utils/generatedEndpoints.ts:236`, `frontend/src/utils/generatedEndpoints.ts:272`, `frontend/src/state/git.ts:64`
- **Concrete example:** `route_get_git_repo_info` and `route_get_git_commit_diff` are generated and tested, but current UI flow uses `route_get_git_status`, `route_get_git_log`, `route_get_git_commit_details`, and `route_get_git_commit_file_diff`. Also `repoInfoOverride` is added to store but not read/written anywhere.
- **Why this matters:** Extra unused API/state increases maintenance and review/testing overhead.
- **Proposed fix:**
  - Remove unused endpoints and `repoInfoOverride` until needed, **or** wire them into UI now (and add usage tests).
- **Before UX/DX:** Larger surface area than necessary; harder to reason about what is actually required.
- **After UX/DX:** Smaller, intentional API/state footprint; less cognitive load and lower maintenance cost.

4. **Low: unnecessary frontend compatibility shim and minor redundancy**
- **Where:** `frontend/src/state/actions/git.ts:25`, `frontend/src/state/actions/git.ts:36`, `frontend/src/components/Git/GitDiffOverlay.tsx:11`
- **Concrete example:** `normalizeGitCommit` trims hashes/parents/decorations defensively even though backend already normalizes those fields. Also `headerPath` memo in `GitDiffOverlay` has a branch that returns the same value in both paths.
- **Why this matters:** Small, but it adds noise and suggests uncertainty in backend/frontend contract.
- **Proposed fix:**
  - Remove `normalizeGitCommit` once backend contract is trusted (or keep only as an assertion in tests).
  - Inline `headerPath` directly (`const headerPath = diffState.path`).
- **Before UX/DX:** Slightly more indirection and maintenance noise.
- **After UX/DX:** Cleaner codepath and clearer ownership of data normalization.

## Merge Recommendation

- **Do not merge as-is if you want strict correctness in large repos**: fix finding #1 first (silent status truncation).
- Findings #2-#4 are not hard blockers, but they are worth addressing soon to keep API behavior predictable and reduce dead surface area.

## Validation notes

- Reviewed exact merge-base delta (`main...HEAD`).
- Targeted tests run and passing:
  - `pytest tests/routers/test_git_routes.py -q` (6 passed)
  - `pnpm -C frontend exec vitest run src/state/actions/git.test.ts src/utils/gitGraph.test.ts src/components/Git/gitFileStatusVisuals.test.ts` (12 passed)
