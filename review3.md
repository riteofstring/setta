# Review: `main...HEAD`

## Findings

### 1) **P0 - Merge blocker**: New Playwright tests mutate any existing repo and do not restore it
- **Concrete example**:
  - `frontend/tests/e2e/git/git-diff-and-graph-overlay.spec.ts:44` detects whether `.git` exists.
  - Even when repo already exists (`createdRepo === false`), tests still run commits/branching/merges (e.g. `:52-69`, `:729-794`, `:910-949`, `:1102-1149`).
  - Cleanup only removes `.git` when it was created by the test (`:699-701`, `:878-880`, `:1071-1073`, `:1260-1262`).
- **Why this is a merge risk**:
  - Running this suite in an existing workspace can permanently add commits/branches and alter git history/state.
  - It can also fail nondeterministically (example: `commit -m "init"` at `:54` if `.gitignore` is already unchanged).
- **Proposed fix**:
  - Run these tests against an isolated temporary workspace only (dedicated temp dir per test run), and point the app/test harness to that workspace.
  - If harness cannot isolate yet, hard-fail early when `.git` already exists instead of mutating it.
- **UX/DX before**:
  - Before: Test run can pollute developer repos and be flaky.
  - After: Deterministic tests, zero repo contamination, safer CI/local runs.

### 2) **P1 - Functional bug**: Rename diffs are misrepresented in working-tree diff overlay
- **Concrete example**:
  - UI opens diff by `path` only (`frontend/src/components/Panes/Overview/Git/GitPane.tsx:121-144`).
  - Request type only carries `path` + `mode` (`backend/setta/types/git.py:28-31`).
  - Backend diffs only one path (`backend/setta/routers/git.py:360-363`).
  - For staged rename (`git mv a.txt b.txt`), `git diff --cached -- b.txt` yields "new file" style output rather than rename metadata.
- **Why this is a merge risk**:
  - Git pane shows `oldPath -> newPath` but diff content can contradict it, which is misleading for real rename reviews.
- **Proposed fix**:
  - Add optional `oldPath` to `GetGitDiffRequest`.
  - When present and different, call git with both paths (`-- <oldPath> <newPath>`) to preserve rename context.
  - Pass `entry.oldPath` from Git pane when opening staged/unstaged diffs for rename/copy entries.
- **UX/DX before**:
  - Before: Rename rows can look like add/delete patches.
  - After: Diff view matches status semantics (accurate rename context).

### 3) **P2 - Redundant/unused additions**: New endpoints/state field are currently dead code
- **Concrete example**:
  - Unused frontend endpoint wrappers: `route_get_git_repo_info` and `route_get_git_commit_diff` (`frontend/src/utils/generatedEndpoints.ts:236-275`).
  - Backend handlers exist for both (`backend/setta/routers/git.py:169-174`, `:784-820`) but no UI action consumes them.
  - `repoInfoOverride` is defined but unused (`frontend/src/state/git.ts:64,75`).
- **Why this matters**:
  - Increases maintenance surface, generated type churn, and mental overhead without user value.
- **Proposed fix**:
  - Remove until needed, or wire them into a real flow now.
  - If keeping, add explicit TODO + test proving intended near-term use.
- **UX/DX before**:
  - Before: Larger API/store surface with unclear ownership.
  - After: Leaner codebase, easier reasoning and review.

### 4) **P2 - Inefficiency**: Git status refresh launches 3 git processes per call
- **Concrete example**:
  - `route_get_git_status` runs `git status` (`backend/setta/routers/git.py:271-277`) then calls `_build_repo_info` (`:290`) which triggers separate `symbolic-ref` + `rev-parse` subprocesses (`:116-127`, `:103-114`).
- **Why this matters**:
  - Extra process startup cost on each refresh; noticeable on larger repos/remote filesystems.
- **Proposed fix**:
  - Use `git status --porcelain=v2 --branch` and parse branch/OID from one command, or cache head info and refresh it less often.
- **UX/DX before**:
  - Before: Higher latency per refresh.
  - After: Faster status refresh and lower system overhead.

## Backward-compatibility shims
- I did **not** find unnecessary backward-compatibility shims in this diff.

## Recommendation
- **Do not merge yet** due to Finding 1 (repo-mutating Playwright behavior) and Finding 2 (rename diff correctness).
- Findings 3-4 are non-blocking cleanup/perf improvements but worth addressing while this area is fresh.

## Validation I ran
- `pytest -q tests/routers/test_git_routes.py` -> passed (`6 passed`).
- `pnpm -C frontend exec vitest run src/state/actions/git.test.ts src/components/Git/gitFileStatusVisuals.test.ts src/utils/gitGraph.test.ts` -> passed (`12 passed`).
