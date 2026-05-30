# Setta 3 Phase 2: Workspace Switching And Local State

## Objective

Turn the existing platform skeleton into a usable local desktop app by adding a
clear VS Code-like workspace lifecycle, cmux-like active workspace switching,
and minimal persisted Setta state.

Phase 2 should answer these questions:

- Can a user open a local folder from the Electron app?
- Can Setta validate, remember, and switch between local workspaces through
  Go-owned state?
- Can the renderer show active workspaces, the selected workspace, and recent
  workspaces without direct filesystem or backend URL access?
- Can workspace contracts stay Go-owned while TypeScript uses generated types?
- Can this work without recreating the old Setta settings project or old project
  config system?

## Principles

- Go owns workspace validation, workspace identity, persisted app state, persisted
  workspace state, and TypeScript contract inputs.
- Electron main owns native OS dialogs and app lifecycle integration.
- The renderer should use a typed preload API. It should not receive raw backend
  URLs or direct filesystem access.
- Keep the first workspace model deliberately small. Add fields only when a real
  workflow needs them.
- Model active workspace switching now. It is cheaper to introduce an ordered
  active workspace list and selected workspace id before terminals, chats,
  agents, runs, and browser resources become workspace-owned.
- Do not add backward compatibility with old Setta project/config/state formats.
- Do not introduce remote SSH workspaces in this phase. The model should leave
  room for remote work later, but Phase 2 is local only.

## Proposed Data Model

Use two small persisted surfaces and one in-memory/app-state workspace session
model.

### Cmux-Inspired Workspace Switching

The useful cmux idea to carry forward is that "open workspaces" are an active,
ordered app session, not just a recent-files list. Phase 2 should model that
directly with:

- a selected workspace id
- an ordered active workspace list
- explicit open/select/close/reorder operations
- recent workspaces as a separate persisted list

This should be enough to support tab-like or sidebar-like workspace switching
without adding cmux's heavier workspace groups, multi-window moves, CLI/socket
control, notification-driven ordering, or pane restoration in this phase.

### Workspace Session

The workspace session is the active set of workspaces shown in the app. This is
separate from recent workspaces.

Phase 2 should keep the session metadata-only:

```json
{
  "selectedWorkspaceId": "workspace_web",
  "activeWorkspaces": [
    {
      "id": "workspace_api",
      "rootPath": "/Users/kevin/api",
      "displayName": "api",
      "lastOpenedAt": "2026-05-29T20:00:00Z"
    },
    {
      "id": "workspace_web",
      "rootPath": "/Users/kevin/web",
      "displayName": "web",
      "lastOpenedAt": "2026-05-29T20:05:00Z"
    }
  ],
  "recentWorkspaces": []
}
```

Semantics:

- Opening a folder adds it to `activeWorkspaces` if needed and selects it.
- Selecting a workspace changes `selectedWorkspaceId`; it does not start a new
  backend process.
- Closing a workspace removes it from `activeWorkspaces`; it stays in
  `recentWorkspaces`.
- Reordering active workspaces changes only active-session order.
- Recent workspaces are sorted by most recently opened and are not the same thing
  as active workspaces.

### App State

App state belongs to the Setta application, not to any one workspace.

Electron should pass a platform app-data directory to the Go backend on startup,
for example from Electron `app.getPath("userData")`. Go should own the file
format under that directory.

Phase 2 app state can be a JSON file such as:

```json
{
  "schemaVersion": 1,
  "selectedWorkspaceId": "workspace_web",
  "activeWorkspaceIds": ["workspace_api", "workspace_web"],
  "recentWorkspaces": [
    {
      "id": "workspace_web",
      "rootPath": "/Users/kevin/example",
      "displayName": "example",
      "lastOpenedAt": "2026-05-29T20:00:00Z"
    }
  ]
}
```

### Workspace State

Workspace state belongs to a specific local folder. Store it in a deterministic
hidden Setta folder under the workspace root:

```text
<workspace>/.setta/workspace.json
```

Phase 2 workspace state can be:

```json
{
  "schemaVersion": 1,
  "id": "workspace_...",
  "rootPath": "/Users/kevin/example",
  "displayName": "example",
  "createdAt": "2026-05-29T20:00:00Z",
  "updatedAt": "2026-05-29T20:00:00Z"
}
```

Notes:

- This is not a Setta settings project.
- Do not create project configs, variants, sharing metadata, plugin state, or
  generated app metadata in Phase 2.
- Do not add cmux-style workspace groups, multi-window workspace moves, CLI/socket
  workspace control, notification-driven ordering, or workspace-owned panes yet.
- If the workspace root cannot be read or `.setta/workspace.json` cannot be
  created or updated, fail loudly with a specific user-facing error.

## Proposed Repo Additions

```text
internal/
  appstate/
  workspace/
  workspacesession/
desktop/
  src/
    generated/
    main/
    preload/
    renderer/
```

Notes:

- `internal/workspace` owns workspace validation, identity, metadata loading, and
  metadata persistence.
- `internal/workspacesession` owns active workspace ordering, selected workspace
  rules, close/select/reorder behavior, and the distinction between active and
  recent workspaces.
- `internal/appstate` owns persistence for active workspace ids, selected
  workspace id, and recent workspaces.
- `internal/httpapi` remains thin and exposes the minimal backend endpoints.
- Generated TypeScript workspace types should continue to live under
  `desktop/src/generated/`.

## Backend Scope

Add Go-owned workspace contracts and generate TypeScript surfaces for them.

Minimum contracts:

- `WorkspaceSummary`
- `WorkspaceState`
- `WorkspaceSession`
- `RecentWorkspacesResponse`
- `OpenWorkspaceRequest`
- `OpenWorkspaceResponse`
- `SelectWorkspaceRequest`
- `CloseWorkspaceRequest`
- `ReorderWorkspaceRequest`
- structured error response shape if the current HTTP layer needs one

Minimum behavior:

- Validate that a workspace path:
  - is absolute
  - exists
  - is a directory
  - is readable
  - can create or update `.setta/workspace.json`
- Create a new workspace id when opening a folder that has no Setta workspace
  metadata.
- Load and reuse the existing workspace id when metadata exists.
- Opening a folder adds the workspace to the active session if it is not already
  active and selects it.
- Selecting an active workspace changes only the selected workspace id.
- Closing an active workspace removes it from the active session without removing
  it from recent workspaces or deleting workspace metadata.
- Closing the selected workspace selects a deterministic neighbor, preferably the
  next workspace at the same index, then the previous workspace, then no
  workspace if none remain.
- Reordering active workspaces is explicit and deterministic. Invalid ids and
  duplicate ids should fail loudly.
- Keep recent workspaces in app state, sorted by most recently opened.
- Persist active workspace order and selected workspace id across app restarts.
- Return clear errors for invalid paths, missing folders, files instead of
  directories, permission failures, malformed workspace metadata, and app-state
  persistence failures.

Minimum HTTP surface:

- `GET /health`
- `GET /workspace-session`
- `POST /workspaces/open`
- `POST /workspaces/select`
- `POST /workspaces/close`
- `POST /workspaces/reorder`
- `POST /workspaces/remove-recent`

The exact route names can change during implementation, but they should stay
backend-owned and generated or exported to TypeScript if the renderer needs
route constants.

## Electron And Renderer Scope

Electron main should:

- Pass an app-data directory to the backend on startup.
- Own the native open-folder dialog.
- Send selected local paths to the backend through main-owned backend calls.
- Keep raw backend URLs out of the renderer.
- Expose typed preload methods such as:
  - `window.setta.workspace.session()`
  - `window.setta.workspace.openLocalFolder()`
  - `window.setta.workspace.select(id)`
  - `window.setta.workspace.close(id)`
  - `window.setta.workspace.reorder(ids)`
  - `window.setta.workspace.removeRecent(id)`

Renderer should:

- Show an initial workspace screen when no active workspace is open.
- Show an open-folder action.
- Show active workspaces in an ordered switcher/sidebar.
- Support selecting active workspaces from that switcher.
- Support closing active workspaces without deleting metadata or recents.
- Show recent workspaces.
- Show the selected workspace name/path in the shell after opening or switching.
- Show specific error messages when opening fails.
- Keep the UI quiet and utilitarian. This is an app workflow, not a marketing
  page.

## Tests And Verification

Backend tests should cover:

- opening a valid temporary directory
- creating `.setta/workspace.json`
- opening the same workspace again and preserving the id
- adding an opened workspace to active workspaces and selecting it
- selecting an active workspace
- closing selected and unselected active workspaces
- deterministic selection after closing the selected workspace
- reordering active workspaces
- recent-workspace sorting
- active workspace order and selected workspace persistence
- invalid path, missing path, file path, malformed metadata, and permission-like
  failures where practical
- app-state persistence using temporary directories

Desktop tests should cover:

- preload workspace API shape
- renderer empty state, active-workspace list, and selected-workspace state
- active workspace select/close interactions
- open-folder flow with a stubbed dialog/backend boundary where practical

Smoke coverage should cover:

- the Electron app starts
- backend health still works
- the workspace screen renders
- local temporary folders can be opened and switched through the app flow if this
  can be automated reliably

Quality checks must remain wired through:

- `./scripts/format.sh`
- `./check_quality.sh --all`
- `./scripts/check_supply_chain.sh`
- `./update_dependencies.sh`

## Non-Goals

Do not build these in Phase 2:

- Project Chat
- Codex harness
- MCP server/client/bridge
- Runs, traces, or trajectories
- Terminals
- Git UI
- State machines
- Remote SSH workspaces
- Workspace groups
- Moving workspaces between windows
- CLI/socket workspace control
- Notification-driven workspace reordering
- Per-workspace pane/session restoration
- Settings UI beyond storing app/workspace state internally
- Plugin system
- Packaging, signing, auto-update, licensing, or auth
- File/browser/spreadsheet/chart/image/draw nodes

## Implementation Order

1. Add Go app-state, workspace, and workspace-session packages.
   - Use temporary-directory tests first.
   - Keep the JSON schemas small and versioned.
   - Model active workspaces, selected workspace, recents, select, close, and
     reorder before adding UI.

2. Add backend workspace endpoints.
   - Keep HTTP handlers thin.
   - Return structured errors with specific messages.

3. Extend Go-to-TypeScript generation.
   - Generate workspace contracts.
   - Keep generated files clearly marked.

4. Wire Electron main and preload.
   - Pass app-data dir to Go.
   - Add main-owned backend calls for workspace operations.
   - Add native open-folder dialog.
   - Expose a narrow typed preload workspace API.

5. Build the renderer workspace flow.
   - Empty state.
   - Active workspace switcher/sidebar.
   - Recent workspaces.
   - Selected workspace shell display.
   - Select, close, and reorder-ready state handling.
   - Error states.

6. Add smoke coverage.
   - Keep the browser-pane smoke passing.
   - Add workspace smoke coverage if reliable.

7. Finish verification.
   - Run `./scripts/format.sh`.
   - Run `./update_dependencies.sh`.
   - Run `./check_quality.sh --all`.
   - Run `./scripts/check_supply_chain.sh`.
   - Update `README.md` with any new dev commands.

## Acceptance Criteria

Phase 2 is complete when:

- The app can open a local folder through the Electron UI.
- Go validates the folder and creates or loads workspace metadata.
- Opening a folder adds it to the active workspace list and selects it.
- The app can switch between at least two active local workspaces without
  restarting the backend.
- The app can close an active workspace without deleting metadata or removing it
  from recents.
- Active workspace order, selected workspace id, and recent workspaces persist
  across app restarts.
- The renderer shows empty, active-workspace, selected-workspace,
  recent-workspace, loading, and error states.
- The renderer uses typed preload APIs and generated TypeScript contracts for
  Go-owned workspace data.
- The backend only binds to loopback and still starts/stops cleanly under
  Electron supervision.
- The browser-pane smoke still passes.
- `./scripts/format.sh` passes.
- `./update_dependencies.sh` passes and leaves the tree clean.
- `./check_quality.sh --all` passes.
- `./scripts/check_supply_chain.sh` passes.

## Follow-Up Phase

After workspace lifecycle is stable, the next phase should add the first
productive workflow surface. The likely candidates are:

- Project Chat plus the first Codex harness skeleton.
- Terminals plus basic Git status/diff surfaces.

Choose based on which workflow should become usable first.
