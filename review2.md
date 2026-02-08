# Branch Review (`main...HEAD`)

## Merge Recommendation
Do **not** merge yet. There are two high-severity issues (status parsing correctness and test safety) and one medium-severity UX race.

## Findings (ordered by severity)

### 1) High — Unstaged rename/copy entries are parsed incorrectly and corrupt subsequent status rows
- File: `backend/setta/routers/git.py:200`
- Why this is a problem:
  - `_parse_porcelain_status` only consumes an extra `old_path` token when `index_status` is `R`/`C`.
  - In porcelain `-z`, unstaged rename/copy uses `worktree_status` (`" R"` / `" C"`) and still emits an extra path token.
  - That token is not consumed, so parsing becomes misaligned and creates bogus rows.
- Concrete example:
  - Input stream equivalent to `" R new.txt\0old.txt\0"` produced 3 rows (1 real + 2 garbage) during local repro.
- Proposed fix:
  - In `backend/setta/routers/git.py:200`, consume the extra token when **either** status column is rename/copy:
    - `if (index_status in {"R","C"} or worktree_status in {"R","C"}) and i < len(tokens): ...`
  - Add a backend unit test for unstaged rename and unstaged copy parsing.
- UX/DX before:
  - Users see incorrect Git status rows, wrong badges, and broken diff targeting after rename/copy in working tree.
- UX/DX after:
  - Rename/copy status is stable and accurate; no parser desync.

### 2) High — Playwright tests mutate real repo history/branches when `.git` already exists
- File: `frontend/tests/e2e/git/git-diff-and-graph-overlay.spec.ts:44`
- Why this is a problem:
  - The test uses `SETTA_WORKSPACE_ROOT` directly, and if `.git` exists (`createdRepo === false`), it still creates commits/branches/merges on the existing repo.
  - Cleanup removes files, but does **not** restore git history/branches.
- Concrete example:
  - Commits at `frontend/tests/e2e/git/git-diff-and-graph-overlay.spec.ts:52` onward and branch/merge operations at `frontend/tests/e2e/git/git-diff-and-graph-overlay.spec.ts:744`, `frontend/tests/e2e/git/git-diff-and-graph-overlay.spec.ts:783`, etc.
- Proposed fix:
  - Run these tests only in a disposable temp workspace (fresh repo) and point `SETTA_WORKSPACE_ROOT` there.
  - At minimum, hard-fail/skip unless an explicit opt-in env var confirms destructive git mutations are allowed.
- UX/DX before:
  - Running E2E locally can silently pollute a developer’s git history and branch graph.
- UX/DX after:
  - E2E remains deterministic and safe for local runs and CI.

### 3) Medium — Race condition can request wrong file diff after rapid commit switching
- File: `frontend/src/state/actions/git.ts:584`
- Why this is a problem:
  - `selectGitCommit` always calls `selectGitCommitFile(firstFile)` after details resolve.
  - If user selected another commit in the meantime, this call can run with the **new** selected commit hash but the **old** file path.
- Concrete example:
  - Click commit A then quickly commit B. A’s details resolves late and triggers file-diff request for `(commitHash=B, path=firstFileOfA)`.
- Proposed fix:
  - Before calling `selectGitCommitFile`, re-read store and require `selectedCommitHash === commitHash` (the commit for this request).
  - Optional: pass `commitHash` explicitly into `selectGitCommitFile` and verify it matches selected state before mutating.
- UX/DX before:
  - Intermittent wrong diff panel content or spurious “Failed to load file diff” when clicking quickly.
- UX/DX after:
  - Commit selection remains deterministic under rapid interaction.

### 4) Low — Redundant/unnecessary code paths add maintenance surface
- Files:
  - `frontend/src/components/Git/GitDiffOverlay.tsx:11`
  - `backend/setta/routers/git.py:784`
- Why this is a problem:
  - `headerPath` `useMemo` in `GitDiffOverlay` always returns `diffState.path` (conditional is redundant).
  - `route_get_git_commit_diff` endpoint appears unused by frontend (no call sites in `frontend/src`).
- Proposed fix:
  - Replace headerPath logic with `const headerPath = diffState?.path ?? "";`.
  - Remove unused endpoint (or wire it into UI if intentionally retained).
- UX/DX before:
  - Slightly higher cognitive load and extra API surface to maintain.
- UX/DX after:
  - Cleaner code and reduced maintenance overhead.

## Backward-compatibility shims
I did **not** find unnecessary backward-compatibility shims in this diff.

## Verification I ran
- Frontend targeted tests:
  - `pnpm -C frontend exec vitest run src/state/actions/git.test.ts src/utils/gitGraph.test.ts src/components/Git/gitFileStatusVisuals.test.ts` (pass)
- Backend targeted tests:
  - `source activate.sh && ./scripts/run_backend_tests.sh tests/routers/test_git_routes.py` (pass)
- Extra repro:
  - Confirmed status parser desync for unstaged rename via direct `_parse_porcelain_status` call.
