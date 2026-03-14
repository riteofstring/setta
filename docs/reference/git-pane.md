# Git Pane and Overlays

This document describes the Git UI added to the Overview sidebar and the backend
git route contracts it depends on.

## Availability

- The Git pane is the `Git` tab in the Overview sidebar.
- It is IDE-only:
  - The tab is hidden in deployment mode.
  - All git routes return `403` in deployment mode.
- If the workspace is not a git repo, status returns `repo.isGitRepo=false`
  instead of failing.

## Overview Git Pane

- UI file: `frontend/src/components/Panes/Overview/Git/GitPane.tsx`.
- On first render, it auto-loads status once (`refreshGitStatus`) if no status
  data exists yet.
- It shows:
  - Current branch / detached head + short commit.
  - Repo root path.
  - An open-by-default `Worktrees` accordion when the repo has additional worktrees.
  - File groups: `Conflicts`, `Staged Changes`, `Changes`, `Untracked`.
- `Refresh` reloads status.
- `Graph` opens or focuses the tracked Git Graph window (disabled when not in a
  git repo).
- Clicking a file row opens the diff overlay in the matching mode:
  - `staged` entries -> staged diff.
  - `unstaged`, `conflict`, `untracked` entries -> unstaged diff.

### Worktree summary

- The accordion is hidden when the current repo has no sibling worktrees.
- Each row shows:
  - derived display name
  - branch name or `Detached HEAD`
  - short head commit
  - `Current` badge for the active worktree
  - `Prunable` badge plus the git-reported reason when applicable
- Worktree metadata is informational only; this pane does not create, switch,
  or remove worktrees.

## Diff Overlay

- UI file: `frontend/src/components/Git/GitDiffOverlay.tsx`.
- Opened from status file rows.
- Supports mode toggle:
  - `Unstaged`
  - `Staged`
- Mode availability is computed per path from status entries, so unavailable
  modes are disabled.
- Shows truncation and error banners when applicable.
- Uses read-only CodeMirror for diff rendering (`GitDiffCodeMirror`), with:
  - diff-line styling (`+`, `-`, hunk/file/meta lines),
  - syntax highlighting on diff content lines for:
    - `.py`
    - `.ts`, `.tsx`
    - `.js`, `.jsx`, `.mjs`, `.cjs`
    - `.json`
    - `.yaml`, `.yml`
    - `.toml`
    - `.md`, `.markdown`

## Graph Window

- Core content UI: `frontend/src/components/Git/GitGraphOverlay.tsx`
- Window host wrapper: `frontend/src/components/Git/GitGraphWindowContent.tsx`
- Opened from the pane `Graph` button.
- The `Graph` button now opens or focuses a tracked `git_graph_mode` project
  window instead of rendering commit history in the center overlay layer.
- That tracked window participates in:
  - project-chat window focus/maximize state
  - saved window spaces
  - standalone `/windowspace/...` surfaces
- The window header can optionally expose a `Git pane` toggle, which embeds the
  Overview Git status pane alongside the graph content.

Inside the Git Graph window:
- Header controls:
  - commit filter input (`Filter commits…`),
  - branch scope toggle (`Branch` / `All refs`),
  - refresh,
  - window chrome close/minimize/maximize actions from the shared window layer.
- Commit list behavior:
  - Virtualized list (react-window).
  - Auto-pagination near the bottom when no filter is active.
  - Pagination pauses after load-more errors until explicit `Retry`.
  - Filtering is client-side and applies to already-loaded commits only.
- Selecting a commit loads commit details inline and populates the right diff
  pane file list.
- Selecting a changed file loads that file diff in the right pane.
- Truncation warnings are surfaced for:
  - commit details (changed-file list may be incomplete),
  - selected file diff.
- Pane and column resizing:
  - Left/right split is draggable.
  - Graph/author/date/hash columns are individually resizable.
  - Sizes persist in local storage.

## Overlay Layer and Escape Behavior

- Host file: `frontend/src/components/Git/GitOverlayLayer.tsx`.
- Only the diff overlay still renders in the center canvas layer, between
  Overview and UI Editor pane widths.
- `Escape` closes the active diff overlay unless focus is in an editable target
  (`input`, `textarea`, `contenteditable`).
- Git Graph uses the shared tracked window layer described in
  `docs/reference/project-chat-windowing.md`.

## Backend Routes

- Router: `backend/setta/routers/git.py`.
- Utility subprocess wrapper: `backend/setta/utils/git.py`.

Routes:

- `POST /api/git/status` (`Route.GET_GIT_STATUS`)
  - No request body.
  - Returns repo info + porcelain-v2 parsed entries.
  - Includes `isTruncated`.
  - Also includes `worktrees`, a list of parsed `git worktree list --porcelain -z`
    entries (`path`, `displayName`, `branchName`, `headCommit`, `isCurrent`,
    `isPrunable`, `prunableReason`).
- `POST /api/git/diff` (`Route.GET_GIT_DIFF`)
  - Request: `{ path, mode, oldPath? }`.
  - Returns file diff for staged/unstaged modes.
  - If unstaged diff is empty for an untracked file, backend synthesizes a
    unified diff payload.
- `POST /api/git/log` (`Route.GET_GIT_LOG`)
  - Request: `{ rev="HEAD", allRefs=false, offset=0, pageSize=250 }`.
  - Response includes `nextOffset`, `hasMore`, `isCapped`.
- `POST /api/git/commitDetails` (`Route.GET_GIT_COMMIT_DETAILS`)
  - Request: `{ commitHash }`.
  - Returns commit metadata + changed file list with add/delete counts.
- `POST /api/git/commitFileDiff` (`Route.GET_GIT_COMMIT_FILE_DIFF`)
  - Request: `{ commitHash, path, oldPath? }`.
  - Returns diff for a selected file in that commit.

## Validation and Safety Rules

- Path inputs are repo-relative only:
  - no absolute paths,
  - no `..`,
  - no NUL bytes.
- File-diff routes reject directory pathspecs.
- Commit hashes are verified via git before loading details/diffs.
- Git commands use:
  - `--literal-pathspecs` for path safety,
  - `--no-ext-diff` and `--no-textconv` to avoid external diff/textconv hooks.

## Operational Limits (Current Defaults)

From `backend/setta/routers/git.py`:

- Status timeout: `2.0s`, max stdout `2,000,000` bytes.
- Diff timeout: `4.0s`, max stdout `2,000,000` bytes.
- Log timeout: `3.0s`, max stdout `4,000,000` bytes.
- Show/details timeout: `4.0s`, max stdout `2,000,000` bytes.
- Log pagination:
  - max page size: `500`,
  - max traversed history cap: `5000` commits (`isCapped=true` when exceeded).

## Implementation References

- Backend:
  - `backend/setta/routers/git.py`
  - `backend/setta/utils/git.py`
  - `backend/setta/types/git.py`
- Frontend:
  - `frontend/src/components/Panes/Overview/Git/GitPane.tsx`
  - `frontend/src/components/Git/GitOverlayLayer.tsx`
  - `frontend/src/components/Git/GitDiffOverlay.tsx`
  - `frontend/src/components/Git/GitDiffCodeMirror.tsx`
  - `frontend/src/components/Git/GitGraphOverlay.tsx`
  - `frontend/src/components/Git/GitGraphWindowContent.tsx`
  - `frontend/src/state/actions/git.ts`
  - `frontend/src/state/actions/projectChatWindowing.ts`
  - `frontend/src/state/git.ts`
