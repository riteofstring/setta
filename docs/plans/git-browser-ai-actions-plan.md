# Git Browser + AI Git Actions Plan

Build a first-class git UI inside Setta:

- A **resizable Git Graph modal** (Git Graph extension style) that shows branches, commit lines, and commit metadata, plus per-commit details and diffs.
- A **Git Actions system**: buttons that trigger **AI chat commands** (custom prompts) that users can modify and save, with results visible as a normal Setta AI chat thread.
- Safe pathways for AI-assisted workflows like **pre-merge conflict detection + attempted resolution**, and **AI-assisted commits**.

This doc is intentionally exhaustive. It's written as an implementation-ready blueprint, not just a product spec.

## Goals
- Provide an in-app git browser that covers the "90% daily flow" without switching to VS Code/CLI:
  - See branch topology (colored branch lines), commits, and refs (HEAD, tags, branches).
  - Inspect a commit: metadata + changed files + patch diff.
  - Inspect working tree status: staged/unstaged/untracked/conflicts.
  - Basic operations: fetch, checkout, create branch, cherry-pick, revert, merge (later phases).
- Add "special git commands" as **AI prompt buttons**:
  - Each button runs a customizable prompt (template) inside a dedicated Setta chat thread.
  - Prompts are editable per-run and can be saved back to a reusable template.
  - Prompts can reference context like selected commits/branches, diffs, and conflict lists.
- Make AI workflows safe and ergonomic:
  - Prefer read-only context gathering by default.
  - For state-changing operations, require explicit confirmation.
  - For merge simulation and conflict resolution, do work in a temporary worktree first.
- Keep UI and state performant for large repos (thousands of commits).

## Non-Goals
- Replacing the CLI for every git feature (reflog browsing, bisect UI, complex rebase editors, submodule management).
- Implementing a full PR review UI (that's a different product surface).
- Building a general-purpose DAG editor. This is a git log UI with commit graph lanes, not a freeform graph canvas.

## Key UX Requirements
- **Entry point**: a "Git" entry in the header menu (recommended) and/or a keyboard shortcut.
- **Modal**:
  - Resizable (both width + height).
  - Split layout: commit graph table + commit details/diff + AI actions/chat context.
  - Supports very large commit lists using virtualization.
- **Commit graph**:
  - Colored branch "lanes" and merge lines (like Git Graph).
  - Decorators: branch labels, tags, HEAD pointer, remote refs.
  - Columns similar to the screenshot: Graph | Description | Date | Author | Commit.
- **Selection**:
  - Click commit: show details + diff.
  - Shift-click or range selection: show diff between two commits (optional in Phase 2/3).
  - Right-click context menu on commit and branch rows for actions (Phase 3+).
- **AI actions**:
  - Prompts are visible and editable before sending.
  - Actions can be context-sensitive (commit-selected, branch-selected, conflicts-present).
  - Results appear as a normal Setta chat thread (persisted like other chats).

## Terminology
- **Repo root**: directory returned by `git rev-parse --show-toplevel`.
- **Ref**: branch, tag, remote branch pointer (e.g. `refs/heads/main`).
- **Decoration**: display names attached to a commit (branch names, tags, HEAD).
- **Lane**: one column in the commit graph visualization representing an active line of history.
- **Temporary worktree**: a separate checkout created via `git worktree add` for safe simulations.

## Product Surface (What We're Building)
1. Git Graph Modal.
2. Git data APIs (backend) powering the modal.
3. Diff viewing (frontend).
4. Git Actions templates (storage + UI).
5. AI Chat integration for Git Actions.
6. Optional "preview/apply to workspace" operations via temporary worktrees.

## Proposed UI Layout (Modal)
### Header row
- Repo indicator: repo name + path.
- Branch filter dropdown:
  - "Show all" (default) vs "Current branch only" vs specific branch.
- Toggles:
  - Show remote branches.
  - Show tags.
- Search input:
  - Filters commit subject/author/hash.
- Refresh controls:
  - Refresh (re-run queries).
  - Fetch (optional, Phase 3+).
- Settings (gear):
  - Graph density (row height).
  - Max commits to load.
  - Default diff mode (patch vs file list only).

### Main body (3 panes, resizable splitters)
1. **Left pane: Refs**
  - Local branches (group).
  - Remote branches (group, toggled).
  - Tags (group, toggled).
  - Branch row shows upstream + ahead/behind + last commit date.
2. **Center pane: Commit graph table**
  - Virtualized list of commit rows.
  - Fixed-height rows; each row renders:
    - Graph cell (lanes + commit node + merge edges).
    - Description cell: subject + ref pills.
    - Date, Author, Short hash columns.
3. **Right pane: Details + Actions**
  - Tabs:
    - "Details": commit metadata + file list + stats.
    - "Diff": patch view (with per-file navigation).
    - "Working Tree": status view (when "workspace" is selected).
    - "AI Actions": button grid + prompt editor + chat thread link.

### Resizing
- Outer modal resizable (width/height) using `re-resizable`.
- Inner pane splitters:
  - Horizontal or vertical split via CSS grid + custom drag handles.
  - Persist sizes in `useLocalStorage` keyed by repo root.

### Accessibility
- Keyboard navigation for commit list (up/down, enter to open diff).
- Focus trapping inside the modal (Radix `Dialog`).
- Actions reachable via tab order; context menus accessible via keyboard where feasible.

## Data Model (Backend Types)
Create typed Go request/response structs for the backend contract, likely
alongside `internal/gitread` and `internal/frontendbindings/git_support.go`.

### Repo + refs
- `GitRepoSummary`
  - `repoRoot: str`
  - `headCommit: str`
  - `headBranch: str | None` (None when detached)
  - `upstream: str | None` (e.g. `origin/main`)
  - `aheadCount: int`
  - `behindCount: int`
  - `isDirty: bool`
  - `stagedCount: int`
  - `unstagedCount: int`
  - `untrackedCount: int`
  - `conflictedCount: int`

- `GitRef`
  - `name: str` (display name, e.g. `main`, `origin/main`, `v1.2.3`)
  - `fullName: str` (e.g. `refs/heads/main`)
  - `kind: "local_branch" | "remote_branch" | "tag" | "head"`
  - `commit: str` (hash)
  - `upstream: str | None`

### Commits (raw)
- `GitCommit`
  - `hash: str`
  - `parents: list[str]`
  - `authorName: str`
  - `authorEmail: str`
  - `authorTimeMs: int`
  - `committerName: str`
  - `committerEmail: str`
  - `commitTimeMs: int`
  - `subject: str`
  - `body: str | None` (optional, lazy-loaded)
  - `decorations: list[str]` (refs/tags pointing to this commit)

### Commit graph rendering payload
We need structured graph information per row so the frontend can draw colored lines without re-deriving everything on every render.

Two viable approaches:

Approach A (recommended): backend returns **raw commits + decorations**, frontend computes lanes.
- Pro:
  - Less payload coupling.
  - Faster iteration on graph visuals.
  - Compute lanes incrementally in JS and store result in `useGitStore`.
- Con:
  - Must get lane algorithm correct on frontend.

Approach B: backend returns a **precomputed lane plan** for each row.
- Pro:
  - Single source of truth for lane algorithm.
- Con:
  - More backend work; payload may become large.

For Phase 1, use Approach A. If performance/complexity demands it, move lane computation to backend later.

Define a frontend-side type (TS only) for computed graph rows:
- `GitCommitRowComputed`
  - `commit: GitCommit`
  - `laneIndex: number`
  - `laneColorId: number`
  - `segments: Array<{ fromLane: number; toLane: number; kind: "vertical" | "merge" | "branch" }>`

### Lane algorithm details (frontend, Phase 2)
Inputs:
- Commit list in newest-to-oldest topo order (use `git log --topo-order`), each with `hash` and `parents`.
- Decorations are not required to compute lanes, but they improve visuals (showing branch tips).

Core state:
- `activeLanes: Array<{ nextHash: string; colorId: number }>`
  - Each entry means: "draw a vertical line in this lane, and on the next row expect `nextHash` to appear on that lane."

Per-commit processing:
1. Determine `laneIndex`:
  - If `hash` exists in `activeLanes[*].nextHash`, use that index.
  - Else append a new lane at the end.
2. Compute row `segments`:
  - Add `vertical` segments for all `activeLanes` lanes (including the commit lane).
  - For each parent edge:
    - If parent is already present in `activeLanes`, add a `merge` segment from `laneIndex` to the parent's lane.
    - Else treat it as a new lane that will appear "later" and add a `branch` segment that introduces it.
3. Update `activeLanes` for the next row:
  - Replace `activeLanes[laneIndex].nextHash` with `parents[0]` if present, else remove the lane.
  - For merge commits with `parents[1:]`:
    - Insert additional parent hashes into `activeLanes` immediately after `laneIndex` (or at the end), unless already present.
  - Deduplicate: if two lanes point to the same `nextHash`, keep the left-most lane and remove the others.
4. Color assignment:
  - Lane color is stable while a lane is active.
  - When a lane is removed, its colorId becomes available for reuse.

Pagination interaction:
- If we implement "Load more" (earlier commits), we have two options:
  - Recompute lanes from scratch for the entire loaded list after each page load.
  - Keep `activeLanes` state at the pagination boundary and continue incrementally (preferred once lists exceed a few thousand commits).

Lane overflow:
- Repos with heavy merge activity can temporarily create many lanes.
- UI should support horizontal scroll or a lane cap strategy:
  - Horizontal scroll: graph cell width expands to `laneCount * laneWidth`.
  - Lane cap: after `MAX_LANES`, collapse lesser lanes into a single "overflow" lane (visual compromise).

### Status + diffs
- `GitStatusEntry`
  - `path: str`
  - `oldPath: str | None` (for renames)
  - `status: "modified" | "added" | "deleted" | "renamed" | "copied" | "untracked" | "conflicted"`
  - `staged: bool`

- `GitFileDiff`
  - `path: str`
  - `oldPath: str | None`
  - `status: str`
  - `patch: str | None` (optional, lazy-loaded)

- `GitCommitDetails`
  - `commit: GitCommit` (with body populated)
  - `files: list[GitFileDiff]`
  - `stats: { insertions: int; deletions: int; filesChanged: int }`

## Backend Implementation Plan
### New module layout
- `internal/gitread/*.go`
  - Read-only git command execution, parsing, and typed responses.
- `internal/httpapi/git_routes.go`
  - HTTP routes (generated endpoint names/specs must stay aligned).
- `internal/frontendbindings/git_support.go`
  - Shared request/response structs exported to generated frontend bindings.
- `internal/frontendbindings/specs.go`
  - Generated endpoint exposure for frontend.
- `internal/mcpx`
  - MCP tools for external agents if we add `gitStatus`, `gitDiff`,
    `gitMergePreview`, and related helpers.

### Git command strategy (read-only)
All git commands should:
- Use `exec.CommandContext(ctx, "git", ...)` with `Cmd.Dir = repoRoot`.
- Never invoke a shell.
- Always include `--no-pager` and `--no-color` where relevant.
- Have explicit timeouts and maximum stdout/stderr capture limits.

Core commands:
- Repo root:
  - `git rev-parse --show-toplevel`
- HEAD + branch:
  - `git rev-parse HEAD`
  - `git symbolic-ref --quiet --short HEAD` (returns branch name or fails for detached)
- Refs:
  - `git for-each-ref --format=... refs/heads refs/remotes refs/tags`
- Status:
  - `git status --porcelain=v2 --branch`
- Log (paged):
  - `git log --topo-order --date=unix --pretty=format:... --max-count=N --skip=K <refspec>`
  - `--decorate=full` to get stable decoration strings for parsing.
- Commit details:
  - `git show --no-color --name-status --format=... <hash>`
- Diff:
  - Working tree:
    - `git diff --no-color` (unstaged)
    - `git diff --no-color --cached` (staged)
  - Commit vs parent:
    - `git show --no-color --format= <hash>`
  - Range:
    - `git diff --no-color <a>..<b>`

### Routes (backend)
Add route constants/handlers in `internal/httpapi/git_routes.go`, expose the
contract through `internal/frontendbindings/specs.go` and
`internal/frontendbindings/git_support.go`, then run `pnpm generate`.

Suggested endpoints:
- `route_get_git_repo_summary() -> GitRepoSummary`
- `route_get_git_refs({ includeRemotes, includeTags }) -> list[GitRef]`
- `route_get_git_log({ ref, maxCount, skip, search }) -> list[GitCommit]`
- `route_get_git_commit_details({ commitHash, includePatch, maxPatchBytes }) -> GitCommitDetails`
- `route_get_git_status() -> list[GitStatusEntry]`
- `route_get_git_diff({ kind, a, b, path, staged }) -> GitFileDiff | list[GitFileDiff]`

Phase 3+ mutation endpoints (optional; prefer MCP tools + user confirmation):
- `route_git_fetch({ remote? })`
- `route_git_checkout({ refOrHash })`
- `route_git_create_branch({ name, startPoint })`
- `route_git_merge_preview({ sourceRef, targetRef })`

### Temporary worktrees (safety-critical)
For operations that may modify the working tree (merge previews, rebases, AI conflict resolution), do not run them in the real repo checkout.

Pattern:
1. Create a temp directory under `setta_files/git_worktrees/<id>` (gitignored).
2. `git worktree add --detach <tempDir> <targetCommitOrBranch>`
3. Run operations in `<tempDir>`.
4. Collect results (conflicts list, diff, files changed).
5. Delete worktree:
  - `git worktree remove --force <tempDir>`
  - Ensure cleanup runs even if operations fail.

Note: large repos can make worktree creation expensive; design APIs to reuse a temp worktree per modal session when safe.

### Git watchers / refresh
Minimum viable:
- UI refresh button triggers re-fetch of summary/refs/log/status.

Better:
- Add a lightweight polling loop while the modal is open (e.g., every 2-5 seconds) to detect HEAD/index changes.
- Consider watching `.git/HEAD` and `.git/index` if file watchers are already robust in the backend.

## Frontend Implementation Plan
### New module layout
- `frontend/src/components/GitBrowser/`
  - `GitBrowserModal.tsx`
  - `GitBrowserHeader.tsx`
  - `GitRefsPane.tsx`
  - `GitCommitTable.tsx`
  - `GitCommitRow.tsx`
  - `GitGraphCell.tsx`
  - `GitDetailsPane.tsx`
  - `GitDiffViewer.tsx`
  - `GitActionsPane.tsx`
  - `GitActionPromptEditor.tsx`
- `frontend/src/state/gitStore.ts` (new Zustand store)
- `frontend/src/state/actions/git.ts` (API calls + parsing + caching)
- `frontend/src/utils/gitGraphLanes.ts` (lane algorithm + tests)

### Entry point
Recommended:
- Add a "Git" menubar item in `frontend/src/components/AppHeader/ProjectNav.tsx` with a "Git Browser..." command that opens the modal.

### UI style consistency
- Use `docs/reference/ui-style-consistency.md` as the styling anchor map.
- Prefer existing Setta patterns:
  - Menubar patterns from `frontend/src/components/AppHeader/FileMenu.tsx`.
  - Small button patterns from `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`.
  - Combobox patterns from `frontend/src/components/Utils/Combobox/IdNameCombobox.tsx`.

### Modal shell
- Use Radix `Dialog` (`@radix-ui/react-dialog`) for overlay + focus trap.
- Use `re-resizable` to allow resizing the dialog content.
- Persist size in `useLocalStorage` keyed by repo root.

### State management
Introduce `useGitStore`:
- Modal state:
  - `isOpen: boolean`
  - `modalRect: { width, height, x?, y? }`
  - `paneSizes: { refsWidth, detailsWidth }`
- Data:
  - `summary: GitRepoSummary | null`
  - `refs: list[GitRef]`
  - `commits: list[GitCommit]`
  - `computedRows: list[GitCommitRowComputed]`
  - `selectedCommitHash: string | null`
  - `selectedRange: { a: string; b: string } | null`
  - `commitDetailsByHash: Record<string, GitCommitDetails>`
  - `status: list[GitStatusEntry]`
- UI:
  - filters and toggles
  - loading/error states per query

### Commit table virtualization
- Use `react-window` to render commit rows.
- Keep row render pure and memoized; compute lane plan once per commits array change.
- Avoid huge DOM: only render visible rows.

### Graph rendering (SVG in row cell)
- Each row has a fixed `rowHeight` and a fixed `laneWidth`.
- `GitGraphCell` renders:
  - Vertical lane segments (for active lanes).
  - Curved or angled merge segments for parent edges.
  - A commit dot with styling:
    - Filled dot for normal commit.
    - Special marker for HEAD (ring).
    - Special marker for merge commits (double ring) if desired.
  - Colors are assigned per lane and remain stable as long as that lane is active.

### Table behavior details
- Column widths:
  - Graph: auto based on visible lane count, with horizontal scroll if needed.
  - Description: flexible, truncates with ellipsis.
  - Date/Author/Commit: fixed widths.
- Sorting:
  - No sorting by columns initially (git log order is the product). If we add sorting later, it must not break lane semantics.
- Row density:
  - Small/medium/large row heights in settings.
- Clipboard affordances:
  - Click short hash copies full hash.
  - Context menu item "Copy hash".

### Diff viewer
- For patches: show a CodeMirror read-only view with diff-like styling, or plain `<pre>` for Phase 2.
- For large diffs:
  - Default to file list only.
  - Add "Load patch" per file or "Load full patch" with size guardrails.

### "Changes appear in project"
There are three increasingly powerful interpretations; implement in phases.

Option 1 (Phase 2): commit selection updates only the Git modal (details/diff). No workspace changes.

Option 2 (Phase 3): "Open file at commit":
- Use `git show <hash>:<path>` and open in a read-only viewer in Setta (or reuse file browser viewer with a "readonly content provider").

Option 3 (Phase 4): "Preview commit in temporary worktree":
- Create a temp worktree at the selected commit.
- Point File Browser to that temp root in a "preview mode".
- Keep Setta canvas/project state unchanged by default (avoid accidental edits).
- Provide "Checkout in workspace" as an explicit action, with warnings.

## Git Actions (Custom Prompt Buttons)
### What a Git Action is
A Git Action is a UI button with an underlying prompt template and some metadata that controls:
- When the button is visible/enabled (requires commit selection, conflicts present, etc).
- Which AI engine/profile it uses.
- Whether it auto-submits or opens a prompt editor first.
- Which context variables are injected.

### Storage model (recommended)
Add a new stored entity (parallel to PromptTemplate) rather than overloading `PromptTemplate.metadata`.

- `GitActionTemplate` (new backend model, stored in DB like AgentProfile/PromptTemplate)
  - `id`
  - `name`
  - `description`
  - `promptTemplateId: ID | null` (optional; can inline prompt too)
  - `template: str` (inline fallback if no promptTemplateId)
  - `format: PromptFormat` (Jinja)
  - `defaultInputs: dict[str, str]`
  - `engineConfigId: ID | null`
  - `agentProfileId: ID | null`
  - `visibilityRules: list[str]`
  - `requiresSelection: "none" | "commit" | "range" | "branch" | "conflicts"`
  - `confirmationPolicy: "none" | "beforeToolUse" | "beforeApply"`

Alternative (lower work): mark PromptTemplates with `metadata.category="git_action"` and treat them as actions. This is faster to ship but becomes messy once we need non-prompt metadata like visibility rules.

### Default Git Actions (starter set)
- "Summarize working tree changes"
- "Generate commit message"
- "Suggest commit split"
- "Pre-merge conflict check" (requires choosing source + target branch)
- "Try resolving conflicts" (enabled only when conflicts exist)
- "Draft PR description"

Each action should ship with a sensible default template and clear variables.

### AI-assisted commit (detailed workflow)
This is the primary place where "commit with AI's help" should feel native.

Working Tree tab UX:
- Sections:
  - Staged
  - Unstaged
  - Untracked
  - Conflicts (if any)
- File rows:
  - Checkbox or toggle to stage/unstage.
  - Click opens file diff.
  - Right-click context menu: stage, unstage, discard, open file, copy path.
- Bulk actions:
  - Stage all
  - Unstage all
  - Discard unstaged changes (danger)
  - Add all untracked (optional)
- Commit box:
  - Subject line input.
  - Optional body textarea (collapsed by default).
  - Options: amend, signoff, no-verify (Phase 5).
  - Commit button disabled unless staged changes exist.
- AI helpers:
  - "AI: Generate message" (uses staged diff only)
  - "AI: Suggest split" (proposes multiple commits by grouping files)
  - "AI: Commit with plan" (agent proposes plan, user approves, then commit(s) are executed)

Backend/MCP support for commit workflows:
- Add safe mutation tools (prefer MCP tools over raw bash):
  - `mcp__setta__gitStage(paths: list[str])`
  - `mcp__setta__gitUnstage(paths: list[str])`
  - `mcp__setta__gitDiscard(paths: list[str])` (must require explicit confirmation)
  - `mcp__setta__gitCommit(subject: str, body?: str, paths?: list[str], amend?: bool)`
- Guardrails:
  - Require explicit confirmation for discard/reset operations.
  - For AI-driven commits, require a final UI confirmation showing:
    - The exact file list to be committed.
    - The full commit message (subject/body).
    - A summary of staged diff size (and a way to inspect it).

Commit splitting (Phase 3/4, simplified approach first):
- First implementation groups at file granularity:
  - For each proposed commit group: stage those files, commit with the suggested message.
  - Avoid partial hunk staging in early phases (add later if needed).
- Later improvement:
  - Add "interactive add" semantics via a dedicated tool that stages selected hunks, not whole files.

### Variable injection
Define a stable "git context" object injected into template rendering:
- `repo`: `{ root, headBranch, headCommit, upstream, aheadCount, behindCount }`
- `selection`:
  - `commit`: selected commit object (or null)
  - `range`: `{ a, b }` (or null)
  - `branch`: selected branch name (or null)
- `status`: `{ staged, unstaged, untracked, conflicted, entries }`
- `diff`:
  - `summary`: short summary text (always)
  - `patch`: optional, may be omitted or truncated
- `conflicts`: `{ files, count }`

Rendering should use the same Go-owned Jinja renderer
(`internal/promptrender/render.go`) so behavior matches Prompt sections.

### Prompt editor UX
When a user clicks an action:
1. Resolve required inputs (branch dropdowns, commit selection, etc).
2. Render a prompt preview (Jinja render):
  - If missing variables, show missing list and let user fill.
3. Open an editor dialog:
  - Editable prompt text (starts from rendered prompt).
  - Optional "show template" toggle to edit the underlying template.
  - "Send" button which sends the prompt to the Git chat thread.
  - "Save as template" button to persist changes to GitActionTemplate.

## AI Chat Integration
### "Git chat thread" behavior
We want Git actions to be first-class chat threads that show up in the Setta AI chat pane, not a bespoke output panel.

Two options:

Option A (recommended): create a dedicated "Git Chat" chatId stored in the same backing store as Project Chat.
- Add a new run/chat type constant (e.g. `GIT_CHAT_RUN_TYPE`) so runs can be listed/filtered by type.
- Persist chat thread by repo root (and optionally by projectConfigId).
- UI: "Open in AI pane" button deep-links to that chat.

Option B: reuse Project Chat and just prepend messages with a `[git]` marker.
- Faster but loses structure and makes history noisy.

### Sending messages
Use the existing submit pipeline (`frontend/src/state/actions/ai.ts`):
- Construct the final prompt text.
- Attach context as attachments when large:
  - Attach `git diff` text as a file attachment (preferred over inlining megabytes).
  - Attach `git status` output similarly.
- Call `submitMessage(...)` for the chosen engine (built-in or external).

### Tooling for agents (MCP tools)
To avoid giving AI raw bash by default, add MCP tools that expose git operations in a controlled way:
- `mcp__setta__gitStatus()`
- `mcp__setta__gitLog(ref, maxCount, skip, search)`
- `mcp__setta__gitShowCommit(commitHash, includePatch, maxPatchBytes)`
- `mcp__setta__gitDiff(a, b, path?, staged?)`
- `mcp__setta__gitMergePreview(sourceRef, targetRef)` (runs in temp worktree)
- `mcp__setta__gitApplyResolution(...)` (apply selected file edits to real workspace, gated)

External agent profiles can then allow `mcp__setta__git*` broadly while requiring "ask" for destructive bash patterns like `git reset`.

## Merge Conflict Preflight + Resolution (Core AI Workflow)
### Desired user flow
1. User selects "Merge branch X into Y".
2. User clicks "AI preflight".
3. System simulates the merge in a temp worktree and returns:
  - Whether conflicts would occur.
  - Conflicted files list.
  - A small merge summary (commits ahead/behind, changed file counts).
4. If no conflicts:
  - Offer "Run merge in real workspace" (explicit confirmation) or "Let AI run it".
5. If conflicts:
  - Offer "Try resolving conflicts with AI":
    - AI proposes resolutions per file.
    - User reviews diffs.
    - Apply to real workspace only after confirmation.

### Implementation notes
- Use `git merge --no-commit --no-ff` inside temp worktree.
- Detect conflicts via `git status --porcelain` and unmerged paths.
- For each conflict file:
  - Read file content (conflict markers).
  - Provide surrounding context (maybe also pre-merge versions via `:1:`, `:2:`, `:3:` stages).
  - AI proposes resolved file content.
  - Apply in temp worktree, rerun `git status` to confirm conflict cleared.
- After resolution attempt:
  - Produce a patch representing the resolution from the temp worktree.
  - Only apply patch to real workspace after user confirms.

## Safety + Permissions
- Share mode:
  - Git browser should be read-only.
  - Git actions that can change state should be hidden or disabled.
- Avoid accidental repo mutation:
  - All destructive git operations require explicit UI confirmation.
  - Prefer temp worktrees for anything that might touch index/worktree.
- Output limits:
  - Truncate large diffs with "load more" controls.
  - Avoid sending massive diffs into the AI prompt directly.

## Error Handling + Edge Cases
- Not a git repo:
  - Modal should show a clear empty state with the resolved working directory and a "git init" hint (no auto-init).
- Detached HEAD:
  - Summary shows `headBranch: null`.
  - Refs pane highlights the commit instead of a branch.
- Shallow clones:
  - Log may stop earlier; show "shallow history" indicator if `.git/shallow` exists.
- Large binary diffs:
  - `git show` emits "Binary files differ"; represent as a non-text diff entry.
  - Provide "extract file" or "open at commit" instead of patch.
- Renames:
  - Prefer `git show --name-status -M` so status includes rename pairs.
  - Diff viewer should show `oldPath -> path`.
- Submodules:
  - Treat submodule entries as file changes with a special status (no inline diff).
- Concurrent operations:
  - If user triggers refresh while a query is running, cancel or dedupe requests.
  - For mutation actions, ensure only one mutation runs at a time per repo root.

## Performance Requirements
- Commit list virtualization is mandatory.
- Avoid recomputing lane layouts on every scroll:
  - Compute once per commit list update.
  - Keep computed rows in store.
- Backend git queries must be paged:
  - Default `maxCount` (e.g., 500) with "Load more" pagination.
  - Provide a fast path for "current branch only".
- Consider async loading:
  - Load summary + refs first, then commits.
  - Fetch commit details only on selection.

## Testing Plan
### Backend (Go)
Add tests under `internal/gitread/*_test.go` and
`internal/httpapi/git_routes_test.go`:
- Create temp git repos in `/tmp`:
  - Initialize repo, commit a few files, create branches, do a merge.
  - Create a conflict scenario (edit same lines in two branches).
- Assert:
  - Refs listing matches expected.
  - Log returns stable commit ordering in topo order.
  - Status parsing handles staged/unstaged/untracked/conflicted.
  - Merge preview detects conflicts and lists files.

### Frontend (Vitest)
- Lane algorithm unit tests:
  - Linear history.
  - Simple branch.
  - Merge commit with two parents.
  - Multiple merges.
- UI rendering tests:
  - Commit row renders decorations.
  - Selection updates details pane.

### E2E (Playwright)
Under `frontend/tests/e2e/`:
- Fixture repo setup at test start.
- Open Git modal.
- Verify commit list renders and is scrollable.
- Select a commit and assert details/diff appear.
- Click a Git Action and assert a message appears in the Git chat thread.

### Manual verification
- Follow `docs/guides/verification-checklist.md`.
- For any UI work in this area, do a CDP visual check of:
  - Modal resizing behavior.
  - Commit list virtualization (no huge DOM growth).
  - Lane rendering (merge lines look correct for a known repo state).
  - Diff rendering for text and binary changes.

## Rollout Phases
### Phase 1: Read-only Git Graph MVP
- Modal + basic layout.
- Repo summary, refs list, commit list (no lanes initially or simplified lanes).
- Commit selection shows metadata + changed files list.

### Phase 2: Diff viewer + proper lane graph
- Lane rendering with colored lines.
- Patch diff viewer (with size limits).
- Working tree status view.

### Phase 3: Git Actions templates + chat thread
- CRUD for GitActionTemplate.
- Actions pane with prompt editor.
- Dedicated Git chat thread visible in AI pane.
- MCP git tools for context gathering.

### Phase 4: Pre-merge AI preflight + safe resolution in temp worktree
- Merge preview endpoint/tool.
- Conflict list + AI suggestions.
- Apply patch to workspace with explicit confirmation.

### Phase 5: Advanced operations
- Checkout/branch creation UI.
- Cherry-pick/revert UI.
- Optional fetch/pull/push with confirmations.

## Open Questions
- Where should GitActionTemplates live?
  - Workspace DB (like PromptTemplates) vs per-project config vs localStorage.
- Should Git chat threads be per-repo, per-projectConfig, or both?
- What's the best "changes appear in project" baseline?
  - Only diff in modal vs file-at-commit viewer vs full temp worktree preview mode.
- Do we need to support multiple git repos per Setta instance (monorepo + nested repos)?
- How aggressively should we watch/poll `.git` state for live updates?
