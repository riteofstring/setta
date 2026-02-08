# Syntax-Highlighted Git Diff Viewer Plan (V2)

This plan upgrades the existing git diff surfaces to provide:

1. Syntax highlighting inside diffs based on the underlying file type.
2. A file-aware commit diff viewer (git graph) with a “files changed” list and per-file patch viewing.
3. Reuse of the same diff renderer in the non-graph flow, without duplicating the file list (the left pane already has it).

This is an incremental plan on top of the already-implemented git diff + graph overlays (see `docs/plans/git-diff-and-graph-viewer-plan.md`).

## Current State (As Implemented)

Frontend:

1. Working-tree diffs open from the left pane Git tab (`frontend/src/components/Panes/Overview/Git/GitPane.tsx`) into an overlay (`frontend/src/components/Git/GitDiffOverlay.tsx`).
2. Git graph overlay (`frontend/src/components/Git/GitGraphOverlay.tsx`) shows commit list on the left and a single CodeMirror view of the raw `git show` output on the right.
3. Diff rendering is done by `frontend/src/components/Git/GitDiffCodeMirror.tsx`:
   - Read-only CodeMirror.
   - Diff “chrome” via line decorations (`+`, `-`, `@@`, `diff --git`, etc).
   - No language-specific syntax highlighting.

Backend:

1. Working-tree diff endpoint: `POST /git/diff` (`backend/setta/routers/git.py`) returns unified patch for a repo-relative `path` and `mode` (staged/unstaged).
2. Commit diff endpoint: `POST /git/commitDiff` returns a single raw `git show` string (`--format=fuller` + patch) capped/truncated.

Tests:

1. Playwright coverage exists for overlays rendering and basic diff content: `frontend/tests/e2e/git/git-diff-and-graph-overlay.spec.ts`.

## Goals

1. Working-tree diff overlay:
   - Keep the file list in the left pane (no duplication in the overlay).
   - Add syntax highlighting within the diff for the selected file’s language.
2. Git graph commit view:
   - Show a “Files changed (N)” list for the selected commit.
   - Selecting a file displays that file’s patch with syntax highlighting.
   - Avoid loading/rendering a single giant multi-file diff by default (performance).
3. Performance:
   - Viewport-only work (no “highlight entire giant diff” upfront).
   - Scrolling should remain smooth for large diffs.
4. Robustness:
   - Handle renames/adds/deletes reasonably.
   - Handle truncation gracefully (clear banner and partial UI where needed).

## Non-Goals (This Iteration)

1. A full side-by-side / merge diff editor (Monaco-style).
2. Perfect multi-line context-aware syntax highlighting (for example, a multi-line string that starts on a previous line). This can be a later upgrade if needed.
3. Rich git actions (stage/unstage, checkout, rebase UI).

## UX Design

### Working-Tree Diff Overlay (Non-Graph)

Entry point stays the same:

1. User clicks a file in `GitPane` (`frontend/src/components/Panes/Overview/Git/GitPane.tsx`).
2. Overlay opens (`frontend/src/components/Git/GitDiffOverlay.tsx`) showing:
   - Path header (already present).
   - Staged/unstaged toggle (already present).
   - Truncation banner (already present).
   - Patch viewer (upgraded to show syntax highlighting).

Important: do not add a file list inside the overlay. The overlay is “single file patch view” only.

### Git Graph Overlay

Commit list: expandable rows (recommended):

1. Keep the commit list virtualized (same as today).
2. Clicking a commit expands that commit row inline (VS Code Git Graph-style):
   - Shows full commit message (subject + body).
   - Shows commit metadata (hash, parents, author/committer, timestamp).
   - Shows a “Files changed (N)” list with per-file +/- line counts.
   - Clicking the currently-expanded commit again collapses it (deselects).
3. Only one commit row should be expanded at a time (the selected commit).
4. The patch viewer lives in a persistent right-side panel:
   - Clicking a file in the expanded row selects it.
   - The right panel fetches and renders that file’s patch (with syntax highlighting).

Rationale:

1. This keeps commit navigation + details in the same visual surface, reducing context switching.
2. Keeping the patch viewer in a dedicated panel avoids the expanded row becoming excessively tall.
3. Dynamic row heights still allow large histories (only a single row expands).

## Data/API Plan

### Why Not Parse `git show` on the Frontend (Preferred)

Parsing unified diffs is doable, but:

1. It’s easy to get edge cases wrong (binary diffs, renames, incomplete/truncated output).
2. We want the “best UX” on large commits, which strongly favors loading file lists quickly and fetching patches lazily.

Recommended approach: add backend endpoints that provide structured commit details (including file list) and per-file patches.

### Backend Endpoints (Recommended)

Add two new routes (names illustrative; align with `backend/setta/types/routes.py` conventions):

1. `POST /git/commitDetails`
   - Request: `{ commitHash: string }`
   - Response:
     - `repoRoot: string`
     - `commitHash: string`
     - `parents: string[]`
     - `authorName: string`
     - `authorEmail: string`
     - `authorTimeMs: number`
     - `committerName: string`
     - `committerEmail: string`
     - `committerTimeMs: number`
     - `subject: string`
     - `body: string` (may be empty)
     - `files: Array<{ path: string; oldPath: string | null; status: string; additions: number | null; deletions: number | null }>`
   - Implementation:
     - Commit metadata: `git show -s --no-color --format=<machine-readable> <hash>`
     - Files + stats: `git show --no-color --format= --name-status --numstat <hash> --` (or 2 commands if parsing is cleaner)
2. `POST /git/commitFileDiff`
   - Request: `{ commitHash: string, path: string }`
   - Response: `{ repoRoot: string, commitHash: string, path: string, diff: string, isTruncated: boolean }`
   - Implementation: `git show --no-color --patch --format= <hash> -- <path>`
   - Note: validate `path` with the same repo-relative rules used by `GET_GIT_DIFF`.

Truncation behavior:

1. Keep per-file patch caps (reuse existing `run_git` byte caps).
2. When truncated, return `isTruncated: true` and show a banner in the UI.

Merge commits:

1. V1: follow `git show` default (usually first-parent diff semantics).
2. Later: add a parent selection UI if needed.

Fallback option (if backend changes are deferred):

1. Parse `GetGitCommitDiffResponse.diff` on the frontend into per-file sections.
2. Treat truncation as “best effort” and mark last file as potentially incomplete.

### Frontend Store Shape Changes (Graph Only)

Extend `GitGraphOverlayState` in `frontend/src/state/git.ts`:

1. Add `selectedCommitFiles: Array<{ path: string; oldPath: string | null; status: string }>` (or a generated type from new endpoints).
2. Add `selectedCommitFilePath: string | null` for which file is selected in the right panel file list.
3. Add `selectedCommitFileDiffResponse: GetGitCommitFileDiffResponse | null` and loading/error state for the per-file patch fetch.
4. Optional cache: `commitFileDiffByKey: Record<string, GetGitCommitFileDiffResponse>` keyed by `${commitHash}:${path}` to avoid refetch on reselect.

Working-tree diff overlay state can remain as-is (it already carries the `path` and the diff text).

## Frontend Component Plan

### Component Split

Create a reusable core patch renderer, and build two containers around it.

Core renderer (used everywhere):

1. Rename or wrap `GitDiffCodeMirror` into something like `GitPatchCodeMirror`.
2. Inputs:
   - `value: string` (unified patch)
   - `filePathForLanguage: string | null` (for language detection)
   - `wrapLines?: boolean`
3. Responsibilities:
   - Existing diff chrome (line backgrounds + hunk/meta styling).
   - New syntax highlighting marks for “code area” of diff lines.

Containers:

1. Working-tree overlay container stays `GitDiffOverlay` and renders `GitPatchCodeMirror` with `filePathForLanguage = diffState.path`.
2. Commit viewer inside `GitGraphOverlay`:
   - Commit list row expands to show commit details + file list.
   - Right panel renders `GitPatchCodeMirror` for the selected file path.

### Syntax Highlighting Implementation (CodeMirror 6)

Approach: highlight only the visible code segments of diff lines via a `ViewPlugin` that emits `Decoration.mark` ranges.

Inputs:

1. File path: use `resolveCodeLanguageFromPath` (`frontend/src/utils/codeLanguage.ts`) to determine `CodeLanguage`.
2. Create a language parser for the resolved language.
   - Existing language packages already present:
     - `@codemirror/lang-python`
     - `@codemirror/lang-javascript` (TS/JS, plus JSX flag)
     - `@codemirror/lang-json`
     - `@codemirror/lang-markdown`
   - Add missing but already-supported `CodeLanguageEnum` values:
     - `yaml`: add `@codemirror/lang-yaml`
     - `bash`: add `@codemirror/lang-shell` (or a pragmatic fallback to plaintext if we don’t want the dependency yet)

Highlighting mechanics:

1. For each visible line in the diff editor:
   - If line starts with `+`, `-`, or space, treat it as a potential “code line”.
   - Skip diff headers: lines starting with `+++ `, `--- `, `diff --git`, `@@`, and other meta lines already classified by `classifyDiffLine`.
2. For eligible lines:
   - Compute `codeText = line.text.slice(1)` and `codeFrom = line.from + 1`.
   - Parse `codeText` using the language parser (outside the editor state).
   - Run `highlightTree` (`@lezer/highlight`) and map highlight tags to CSS classes using `highlightingFor(view.state, tags)` (`@codemirror/language`).
   - For each styled range in the line, add a `Decoration.mark` from `codeFrom + from` to `codeFrom + to`.
3. Add a stable class to every syntax mark, for testability:
   - Example: always include `cm-gitdiff-syntax` alongside the theme classes.
4. Cache per-line results:
   - Key: `line.from` + `line.text` (or `line.number` + doc identity).
   - Invalidate on `docChanged` and when language changes.
   - Only compute for visible ranges (recompute on `viewportChanged`).

Performance guardrails:

1. Skip highlighting for extremely long lines (for example `> 2000` characters) to avoid parser worst-cases.
2. Skip highlighting entirely if the visible range line count is above a threshold (fallback to diff chrome only) to keep scrolling smooth.

Known limitation (accepted for this iteration):

1. Because we parse line-by-line, multi-line constructs can’t be highlighted with full context.
2. If we need perfect context later, the next step is a “content diff view” that fetches old/new file contents and runs the parser on full text.

## Git Graph UX State Machine

On commit selection:

1. Fetch commit details (`/git/commitDetails`) which includes file list + stats + message.
2. Expand the selected commit row and render these details inline.
3. Auto-select the first file in the list (or keep prior file selection if still present).
4. Fetch patch for the selected file (`/git/commitFileDiff`) and render it in the right panel via `GitPatchCodeMirror`.

Loading behavior:

1. If file list is loading, show a small skeleton/“Loading files…” row in the “Files changed” section.
2. If file diff is loading, show a “Loading diff…” placeholder in the patch area.
3. Errors are localized (file list vs file diff).

## Tests

### Playwright (E2E)

Update `frontend/tests/e2e/git/git-diff-and-graph-overlay.spec.ts`:

1. Working-tree diff overlay:
   - Use a test file with a recognizable language (for example `syntax.py` containing `def foo():\n  return 1\n`).
   - After opening its diff overlay, assert `diffOverlay.locator('.cm-gitdiff-syntax').first()` is visible.
2. Graph overlay:
   - After opening Graph, select a commit that changes `syntax.py`.
   - Assert the “Files changed” list contains the file.
   - Click the file entry and assert diff content updates and `.cm-gitdiff-syntax` exists.

Do not assert specific CodeMirror theme class names (they are implementation details and can be unstable). Use the stable `cm-gitdiff-syntax` mark class instead.

### Unit Tests (Optional but Valuable)

If we add any diff parsing fallback:

1. Add a small parsing utility (for example `frontend/src/utils/parseUnifiedDiff.ts`).
2. Add Vitest coverage for common cases:
   - Added file, deleted file, rename, normal modify.
   - Truncated last file section behavior.

### Backend Tests

If adding `/git/commitFiles` and `/git/commitFileDiff`:

1. Add focused pytest coverage under `tests/` mirroring `backend/setta`:
   - Path validation: rejects absolute paths and `..`.
   - Commit hash validation: rejects invalid input.
   - Happy path in a temp git repo created under `/tmp`.

## Rollout Plan (Phased)

Phase 1: Syntax highlight in working-tree diff overlay only.

1. Implement `GitPatchCodeMirror` (or extend `GitDiffCodeMirror`) with syntax mark plugin.
2. Pass `diffState.path` as `filePathForLanguage`.
3. Update Playwright test to assert `.cm-gitdiff-syntax`.

Phase 2: Git graph “files changed” list + per-file patch.

1. Add backend endpoints (`/git/commitDetails`, `/git/commitFileDiff`) and generated TS bindings.
2. Extend graph overlay store for commit details + selected file diff.
3. Convert the commit list to use dynamic row heights and implement “expand selected commit row”.
4. Wire file selection in the expanded row to update the right panel patch viewer.
5. Update Playwright graph overlay assertions.

Phase 3: Polish and perf.

1. Add filter input to the file list when file count is high.
2. Add caching to avoid refetching diffs when revisiting a file in the same commit.
3. Add guardrails for very large diffs and extremely long lines (skip syntax marks).

Phase 4 (Optional): Context-perfect highlighting.

1. Add backend endpoint(s) to fetch file contents at revisions (old/new).
2. Render a content-based diff view (side-by-side or inline) and run CodeMirror language normally on full text.

## Verification Checklist

1. Manual UI verification with CDP:
   - Working-tree diff overlay: open a `.py` and `.ts/.tsx` diff and visually confirm colored tokens within added/removed lines.
   - Graph overlay: select a commit, verify file list appears and selection updates the patch.
2. Performance:
   - Scroll a large diff and confirm no major jank (syntax marks must be viewport-only + cached).
3. Run Playwright e2e:
   - `./scripts/run-playwright-e2e.sh` (or targeted run for `frontend/tests/e2e/git/git-diff-and-graph-overlay.spec.ts`).
