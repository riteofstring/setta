# Git Diff Viewer + Git Graph Viewer Plan

This plan adds two git-focused UI surfaces to Setta:

1. A **Git Changes** list in the left pane that shows currently changed files for the current workspace (when the workspace is a git repo).
2. A **full central Git Diff view** that overlays the canvas/app preview and occupies the entire center area **between the left and right panes** (not a canvas section).
3. A **Git Graph viewer** that shows commit history topology and per-commit details/diffs.

This doc is implementation-oriented (routes, types, component placement, state, tests), not just product ideas.

## Goals

1. If `get_setta_paths().workspace_root` is inside a git worktree, show a Git entry point in the left pane and display a list of changed files.
2. Clicking a file opens a full-height/width central diff view that:
   - Covers the whole center area (between panes) on top of the canvas/app preview.
   - Is easy to close (close button + `Esc`).
   - Supports unstaged and staged diffs.
3. Provide a Git Graph viewer that:
   - Displays commit graph lanes/topology (Git Graph extension style).
   - Supports large repos using virtualization.
   - Lets users inspect commit metadata and view commit diffs.
4. Degrade gracefully:
   - If git is missing, or the workspace is not a git repo, the UI should not break and should explain why git features are unavailable.
5. Keep performance acceptable on large repos:
   - Avoid blocking renders on big lists/diffs.
   - Avoid repeated expensive git calls while idle.

## Non-Goals (V1)

1. Editing git state (stage/unstage, checkout, rebase UI, merge tools).
2. A full PR review UI or hosted-remote integration.
3. Perfect diff rendering for every edge case (binary diffs, extremely large patches). V1 should be correct and robust, with truncation/guards when needed.
4. Backward compatibility shims, legacy support, or migrations for older frontend/backend pairs.

## Key Terms

1. Workspace root: `get_setta_paths().workspace_root`.
2. Repo root: `git rev-parse --show-toplevel` executed with `cwd=workspace_root`.
3. Working tree diff: `git diff` (unstaged changes).
4. Index diff: `git diff --cached` (staged changes).

## UX Requirements

### Left Pane: Git Changes List

Entry point (recommended):

1. Add a new Overview tab `Git` (similar to `Explorer` / `Project Configs`), shown only when not in share/deployment mode.
2. When opened, it shows:
   - Repo summary: repo root, HEAD branch, short HEAD hash, dirty counts.
   - A list of changed files grouped by status:
     - Conflicts
     - Staged
     - Unstaged
     - Untracked
   - A `Refresh` control (plus optional auto-refresh when the tab is visible).
   - A `Graph` button to open the Git Graph viewer.

List item requirements:

1. Show relative path (repo-relative), and if rename: `old -> new`.
2. Show a small status badge (M/A/D/R/U/?) and which side it applies to (staged vs unstaged).
3. Clicking opens the central diff view for that file (default: prefer unstaged if present; otherwise staged; otherwise untracked view).

### Central Area: Git Diff Overlay

1. The diff view is not a section, not inside the pannable ReactFlow area. It is an overlay layer above the canvas/app preview.
2. It fills the entire center area between panes (use the same `overviewTrueWidth` / `uiEditorTrueWidth` padding approach as `ViewModeTabs`).
3. Has a top bar:
   - File path + status badges
   - Toggle: `Unstaged` / `Staged` (disabled when unavailable)
   - Optional toggles (Phase 2): ignore whitespace, show full file for untracked, wrap lines
   - Close button
4. Has a scrollable body rendered via CodeMirror (read-only), showing the unified patch text with diff-aware line styling.
5. Keyboard:
   - `Esc` closes the overlay.
   - Optional (Phase 2): `j/k` next/prev changed file; `[`/`]` prev/next hunk.

### Git Graph Viewer

Surface:

1. A central overlay (same overlay system as diff), between panes.

V1 graph viewer features:

1. Commit graph list (virtualized) with lanes/topology.
2. Commit selection shows details:
   - Author, date, hash, parents
   - Decorations (branches/tags, HEAD)
   - Changed files list
   - Patch diff (reuse the diff renderer).
3. Controls:
   - Branch scope: current branch only vs all refs
   - Search/filter by subject/author/hash (client-side for initial loaded window)
   - Refresh

## Architecture Overview

### Backend (FastAPI)

Add a new router `backend/setta/routers/git.py` with read-only git APIs. Use git CLI (not GitPython) for predictable behavior and no extra dependency.

Core design constraints:

1. Commands must be executed with `cwd=<repo_root>` and must not allow escaping that repo via path tricks.
2. Disable git features in share/deployment mode (match file browser behavior).
3. Avoid slow/hanging git invocations:
   - timeouts per command
   - cap large diff outputs (with truncation metadata)

### Frontend (React)

Add:

1. A new Overview tab `Git` that fetches status and displays changed files.
2. A reusable “center overlay” layer that can render:
   - Git diff view
   - Git graph viewer

The overlay layer should:

1. Be rendered at the same level as the canvas/app preview (recommended: in `frontend/src/components/Pages/MainContainerCore.tsx` as a sibling to `GridWrapper`).
2. Use `overviewTrueWidth` and `uiEditorTrueWidth` to inset its content so it occupies only the visible center area.
3. Use z-index above the canvas/app preview but below the left/right panes (so panes remain accessible while diff is open).

## Library Choices (Locked)

Chosen for V1 (no new dependencies):

1. Diff viewer: `@uiw/react-codemirror` (already in the repo) in read-only mode, rendering unified diff text, with a small CodeMirror View plugin that decorates visible lines based on prefixes (`+/-/@@/diff --git`).
2. Git graph viewer: custom lane computation + `react-window` (already in the repo) for virtualization; render lanes/nodes as a small SVG per visible row.
3. Git data access: git CLI subprocesses, using porcelain formats for status and structured output for log/show/diff, with timeouts and output caps.

Alternatives considered (not chosen for V1):

### Diff Rendering (Frontend)

1. `react-diff-view` + a parser like `parse-diff`
   - Patch-native: renders unified diffs as files/hunks/lines.
   - Pros: closer to GitHub-like UX; structured rendering (file list, hunk navigation).
   - Cons: introduces diff parsing + a new rendering stack; large diffs still need careful virtualization.
2. `diff2html` / `diff2html-react`
   - Converts unified diff text into HTML.
   - Pros: nice visuals quickly.
   - Cons: can be heavy/slow on big diffs; often relies on HTML-string rendering patterns that are harder to control for perf.
3. `monaco-editor` diff editor
   - VS Code’s editor core, including a very capable diff viewer.
   - Pros: best-in-class diff UX; handles large files well; very “VS Code familiar”.
   - Cons: large bundle; content-based diff (requires fetching “before” + “after” file contents rather than rendering a git patch directly).

### Commit Graph Rendering (Frontend)

1. `@gitgraph/react` / `gitgraph.js`
   - Useful for small to medium graphs and “storybook style” commit drawings.
   - Pros: quick to get something on screen.
   - Cons: not designed for “thousands of commits in a virtualized list” UX; often becomes a dead-end for performance.

### Git Data Access (Backend)

1. `GitPython`
   - Pros: convenient wrappers.
   - Cons: still depends on git; doesn’t remove the need for careful output caps/timeouts; not a clear win for this use case.
2. `pygit2` (libgit2) / `dulwich`
   - Pros: avoid subprocess (pygit2); avoid external git dependency (dulwich).
   - Cons: packaging complexity (pygit2); feature parity/behavior mismatches vs git (dulwich); both are heavier changes than we need for V1.

## Backend Implementation Plan

### Phase 1: Git Utilities Module

Create `backend/setta/utils/git.py` with helpers:

1. `get_workspace_repo_root() -> Path | None`
   - Runs `git -C <workspace_root> rev-parse --show-toplevel`.
   - Returns `None` if not inside a worktree.
2. `run_git(args: list[str], *, cwd: Path, timeout_s: float) -> subprocess.CompletedProcess[str]`
   - Always uses `--no-pager`.
   - Sets env to disable color and paging:
     - `GIT_PAGER=cat`
     - `-c color.ui=false`
     - `-c core.quotePath=false`
   - Captures stdout/stderr, returns exit codes.
3. Output size guard:
   - `max_output_bytes` for diff/log responses.
   - If exceeded: return truncated output plus metadata so frontend can show a “truncated” banner.

### Phase 2: New Route Enum Entries

Add new routes in `backend/setta/types/routes.py` (names must align with frontend `generatedEndpoints` expectations):

1. `GET_GIT_REPO_INFO = "/git/repoInfo"`
2. `GET_GIT_STATUS = "/git/status"`
3. `GET_GIT_DIFF = "/git/diff"`
4. `GET_GIT_LOG = "/git/log"`
5. `GET_GIT_COMMIT_DIFF = "/git/commitDiff"`

### Phase 3: Backend Types (Pydantic)

Add `backend/setta/types/git.py` (do not use Pydantic aliases).

Suggested models:

1. `GitRepoInfoResponse`
   - `isGitRepo: bool`
   - `repoRoot: str | None`
   - `headBranch: str | None`
   - `headCommit: str | None`
2. `GitStatusEntry`
   - `path: str`
   - `oldPath: str | None` (rename source)
   - `indexStatus: str` (single char, porcelain v2 X)
   - `worktreeStatus: str` (single char, porcelain v2 Y)
   - `kind: "conflict" | "staged" | "unstaged" | "untracked"`
3. `GetGitStatusResponse`
   - `repo: GitRepoInfoResponse`
   - `entries: list[GitStatusEntry]`
4. `GetGitDiffRequest`
   - `path: str`
   - `mode: "unstaged" | "staged"`
5. `GetGitDiffResponse`
   - `repoRoot: str`
   - `path: str`
   - `mode: "unstaged" | "staged"`
   - `diff: str`
   - `isTruncated: bool`
6. `GitCommit`
   - `hash: str`
   - `parents: list[str]`
   - `authorName: str`
   - `authorEmail: str`
   - `authorTimeMs: int`
   - `subject: str`
   - `decorations: list[str]`
7. `GetGitLogRequest`
   - `rev: str` (default `"HEAD"`)
   - `maxCount: int` (default 2000; backend caps)
   - `allRefs: bool` (default false)
8. `GetGitLogResponse`
   - `repoRoot: str`
   - `headBranch: str | None`
   - `commits: list[GitCommit]`

### Phase 4: Implement Router Endpoints

Create `backend/setta/routers/git.py` and register it in the main app router (where other routers are included).

Endpoints:

1. `route_get_git_repo_info(ctx) -> GitRepoInfoResponse`
   - If deployment mode: 403.
   - Resolve repo root (or return `isGitRepo=false`).
   - HEAD branch:
     - `git symbolic-ref --short HEAD` (fails on detached head; return None).
   - HEAD commit:
     - `git rev-parse HEAD`.
2. `route_get_git_status(ctx) -> GetGitStatusResponse`
   - Use `git status --porcelain=v2 -z --untracked-files=all`.
   - Parse using NUL delimiters to correctly handle filenames with spaces/newlines.
   - Classify entries:
     - Untracked: `?`
     - Conflicts: `u` entries or `XY` containing `U`
     - Staged: `X != '.'` (index has changes)
     - Unstaged: `Y != '.'` (worktree has changes)
   - For a single path that is both staged and unstaged, return **two entries** (one under Staged, one under Unstaged), matching VS Code behavior.
3. `route_get_git_diff(x, ctx) -> GetGitDiffResponse`
   - Validate `x.path`:
     - Must be repo-relative and must not escape via `..`.
     - Resolve to absolute path and enforce `is_relative_to(repo_root)`.
   - Mode:
     - `unstaged`: `git diff --no-color --patch -- <path>`
     - `staged`: `git diff --cached --no-color --patch -- <path>`
   - Untracked file behavior:
     - `git diff` returns empty; for untracked, synthesize a patch:
       - Preferred: `git diff --no-index --no-color --patch -- <empty_file> <path>`
       - Use a temporary empty file created under repo root or runtime temp dir.
4. `route_get_git_log(x, ctx) -> GetGitLogResponse`
   - Use `git log --topo-order --date=unix --pretty=... --parents --decorate=full`.
   - Return structured commits. Decorations can be parsed from `--decorate=full` output or obtained via a separate `git for-each-ref` map.
   - Cap `maxCount` server-side.
5. `route_get_git_commit_diff(x, ctx)`
   - Request: `{ commitHash: str }`
   - Response: patch string for that commit:
     - `git show --no-color --patch --format=fuller <hash> --`

## Frontend Implementation Plan

### Phase 1: Add Git Overview Tab

1. Update `frontend/src/utils/constants.ts`:
   - Add `OverviewTabNameEnum.Git = "Git"`.
   - Add prettified label.
2. Update `frontend/src/components/Panes/Overview/Overview.tsx`:
   - Add a tab button with a git icon.
   - Hide it in share/deployment mode (match FileBrowser behavior).
3. Implement `frontend/src/components/Panes/Overview/Git/GitPane.tsx`:
   - Calls `route_get_git_status()` when opened (and on refresh).
   - Shows repo summary + grouped file list.
   - Clicking an item calls `openGitDiffOverlay({ path, mode })`.

### Phase 2: Git UI State + Actions

Add a dedicated store, for example `frontend/src/state/git.ts` (or add to `frontend/src/state/definitions.ts` if preferred).

State shape:

1. `repoInfo`
2. `statusEntries`
3. `isLoadingStatus`, `statusError`
4. `overlay`:
   - `kind: "none" | "diff" | "graph"`
   - `diff: { path, mode, diffText, isLoading, error, isTruncated } | null`
   - `graph: { commits, selectedCommit, isLoading, error } | null`

Actions:

1. `refreshGitStatus()`
2. `openGitDiffOverlay({ path, mode })`
3. `closeGitOverlay()`
4. `openGitGraphOverlay()`

### Phase 3: Center Overlay Infrastructure

Implement a shared overlay layer that is rendered once and switches between diff/graph content.

Placement (recommended):

1. Add `GitOverlayLayer` in `frontend/src/components/Pages/MainContainerCore.tsx` as a sibling to `GridWrapper`.
2. Render as a grid item in the same cell as the canvas (matching `GridWrapper` / `PaneContainer` positioning).

Layout requirements:

1. Use `position: absolute` or a `single-cell-container` overlay that spans the center viewport.
2. Inset content with:
   - `paddingLeft: overviewTrueWidth`
   - `paddingRight: uiEditorTrueWidth`
3. z-index:
   - Above the canvas/app preview.
   - Below the left and right panes (so users can still click the Git list to switch files).

Keyboard handling:

1. Bind `Esc` to `closeGitOverlay()` when overlay is open.
2. Ensure focus is managed so keyboard shortcuts keep working (reuse `useTabScope` patterns where needed).

### Phase 4: Git Diff Overlay UI

Add `frontend/src/components/Git/GitDiffOverlay.tsx`.

Implementation details:

1. Header:
   - Path + status badges
   - Toggle `Unstaged` / `Staged` (refetch diff on toggle)
   - Close button
2. Body:
   - Use `@uiw/react-codemirror` in read-only mode to render the patch text.
   - Add a small CodeMirror View plugin to style lines by prefix:
     - `+` green, `-` red, `@@` blue, `diff --git` muted
   - Keep wrapping off by default for perf; optionally offer a wrap toggle later.
3. Truncation banner if `isTruncated`.
4. Error banner if diff fetch fails.

### Phase 5: Git Graph Viewer (Structured)

Add `frontend/src/components/Git/GitGraphOverlay.tsx`.

Data flow:

1. `openGitGraphOverlay()` calls `route_get_git_log({ rev: "HEAD", maxCount, allRefs })`.
2. Store commits in git state.
3. Compute lanes/topology on the frontend once per commit list update and store a computed representation.

Lane/topology algorithm:

1. Reuse the lane computation approach described in `docs/plans/git-browser-ai-actions-plan.md` (Approach A: backend returns raw commits + decorations; frontend computes lanes).
2. Keep computation incremental and O(n) over the commit list; do not recompute on every render.

UI:

1. Virtualized commit list (use `react-window` which is already in the codebase).
2. Each row:
   - Graph cell (small SVG lanes per row; computed lane plan stored in state)
   - Subject
   - Date
   - Author
   - Short hash
3. Details pane for selected commit:
   - On selection, call `route_get_git_commit_diff({ commitHash })` and render patch (reuse diff renderer).

## Testing Plan

### Backend (pytest)

Add `tests/routers/test_git_routes.py` (or `tests/routers/test_git.py`) using a temporary workspace.

Test fixture approach:

1. Create a temp directory.
2. `git init`, configure user.name/email locally.
3. Create and commit a file.
4. Create each status type:
   - Modify tracked file (unstaged)
   - Stage a change (staged)
   - Create new file (untracked)
   - Rename a file (rename)
5. Use `temporary_setta_paths(workspace_root=<tempdir>)` to point Setta to the temp repo.
6. Call routes and assert:
   - `repoInfo.isGitRepo` is true
   - `status.entries` contains expected files and classifications
   - `diff` includes the expected hunk markers and paths

### Frontend (Vitest)

1. Add small pure helpers and unit test them:
   - grouping/sorting status entries
   - diff line classification (`+/-/@@/header`)
2. Component tests:
   - GitPane renders “not a git repo” state
   - Clicking a list item dispatches overlay open state
   - Diff overlay close button clears overlay state

### Playwright (E2E)

Add `frontend/tests/e2e/git/git-diff-overlay.spec.ts`:

1. Run Setta against a known git fixture repo (prefer creating the repo under a temp dir in the test, not committing new fixtures into the real workspace).
2. Open Overview `Git` tab.
3. Click a changed file.
4. Assert diff overlay is visible, contains expected diff markers, and is inset between panes (smoke assertion: overlay not hidden behind panes).
5. Press `Esc` and assert overlay closes.
6. Open graph viewer and assert commit list renders (at least first N rows).

## Performance Plan

1. Status refresh:
   - Only auto-refresh when the Git tab is visible, with a conservative interval (for example 2-5 seconds).
   - Provide manual refresh button.
2. Diff payload:
   - Cap diff output size; show truncation banner and optionally allow “load full diff” with a warning.
   - Prefer truncating on “nice” boundaries:
     - For single-file diffs: truncate at a hunk boundary (`@@ ... @@`) when possible.
     - For multi-file diffs: truncate at a file boundary (`diff --git ...`) when possible.
3. Graph:
   - Cap commit count server-side; default 2000 (tunable).
   - Virtualize list rendering.
   - Compute lanes once per load, memoized in store.

## Decisions (Locked, Match VS Code)

1. Repo root scoping:
   - Use the **git repo root** discovered via `git rev-parse --show-toplevel` from the Setta workspace root.
   - Status and diffs are repo-scoped (not filtered to only paths under the Setta workspace folder), matching how VS Code behaves when you open a subfolder inside a repo.
2. Status entry modeling (staged + unstaged):
   - If a file has both staged and unstaged changes, show it in **both** groups (two rows). Clicking within each group opens the corresponding diff base.
3. Untracked diffs:
   - Show a synthetic “new file” diff (all additions) by diffing the file against an empty file (via `git diff --no-index` with a temporary empty file), matching VS Code’s “Open Changes” semantics for untracked files.
4. Graph UI surface:
   - Use a **central overlay** (between panes), not a modal.
5. Large diff behavior (truncation):
   - Enforce a hard cap by bytes for reliability/perf.
   - When truncating, prefer cutting at file/hunk boundaries (see Performance Plan) so the displayed diff stays readable.
   - UX/DX impact by strategy:
     - Truncate by bytes:
       - UX: most predictable performance; can cut mid-hunk and feel “broken” unless we boundary-trim.
       - DX: simplest; natural fit for server-side output caps.
     - Truncate by file count (multi-file diffs):
       - UX: shows complete diffs for the first N files; “cleaner” partial results.
       - DX: requires parsing diff file boundaries; slightly more complexity, but still straightforward.
     - Truncate by hunk count (single-file diffs):
       - UX: preserves semantic chunks; less confusing than mid-hunk cuts.
       - DX: requires parsing hunk headers and tracking boundaries; more logic, but manageable.
