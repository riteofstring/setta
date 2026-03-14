# Project Chat Windowing and Window Spaces

Project chat is no longer tied to a single Overview-pane transcript. The
Overview `Project AI Chat` tab now renders the shared `ProjectChat` surface,
while window management lives in the bottom-dock manager menu. The same chat UI
is reused through `UnifiedChatSurface` across workspace windows, section hosts,
and standalone routes.

## Hosts and Surfaces

- Overview `Project AI Chat` renders `ProjectChat` directly, including the
  transcript, composer, thread controls, and auxiliary panels.
- Workspace project-chat windows use `ProjectChatBottomDock` plus
  `ProjectChatWindowSurface`.
- The bottom dock keeps a persistent manager trigger beside the create-chat
  button; that menu renders `ProjectChatManager`.
- Section chat and project-chat surfaces share `UnifiedChatSurface`, which
  chooses between `ProjectChat`, `ChatArea`, and `SectionWindowPlaceholder`
  based on the current owner.
- Standalone routes render the same surface types through:
  - `StandaloneProjectSurfacePage`
  - `StandaloneWindowSpaceSurface`
- The Git Graph uses the same tracked window layer via `git_graph_mode`;
  file diffs still use the separate centered diff overlay.

## Authoritative State

Per-project runtime state lives in:

- backend: `ProjectStateBackend.projectChatWindowingByProjectConfigId`
- loaded project state: `ProjectStateSingleConfig.projectChatWindowing`

`ProjectChatWindowingState` contains:

- `instancesById`
- `order`
- `nextInstanceNumber`

Each `ProjectChatWindowInstance` stores:

- `placement`: `bottom_docked`, `floating`, `maximized`, or `canvas_section`
- `mode`: `project_ai_mode`, `section_mode`, or `git_graph_mode`
- `isMinimized`, `isClosed`, `isMaximized`
- `bounds` and `dockMetrics`
- `zIndex` and `lastFocusedAt`
- `sectionIdOrNull`
- `title`
- `chatId`

Backend normalization keeps this state coherent:

- `section_mode` windows must bind a section.
- `git_graph_mode` windows cannot bind sections and cannot use
  `canvas_section`.
- Only `project_ai_mode` windows may carry `chatId`.
- Missing section bindings are pruned.
- Only one authoritative binding per section survives normalization.
- Layout updates cannot remove or retarget an existing thread-bound `chatId`;
  chat-thread rebinding must go through the dedicated chat-id route.

## Workspace Behavior

- New project-chat windows open in the docked workspace window manager and
  minimize into the bottom tray.
- The Overview `Project AI Chat` tab is now the primary integrated
  project-chat surface; use the dock to create, reopen, focus, hide, float,
  and move additional chat windows to canvas sections.
- The bottom-dock manager menu remains available even when only one chat window
  exists, so window actions do not depend on pill overflow mode.
- Floating windows can be focused, minimized, reopened, maximized, resized, and
  snapped.
- Section-backed chat windows can move between floating-window ownership and a
  canvas section host.
- When a section's project-chat surface is owned by an external window, the
  canvas host renders a placeholder instead of duplicating the chat UI.
- The Git pane's `Graph` button reuses a tracked Git Graph window instance
  rather than opening a separate overlay for commit history.

## Shared Transcript UX

- Project-chat draft text is persisted per project config in local storage, so
  the Overview pane and standalone `/:projectConfigName/chat` routes restore
  unsent composer text after reload.
- Standalone thread routes (`/:projectConfigName/chat/:chatId`) keep the shared
  project-chat frame and can switch between thread ids in-place without
  requiring a full page refresh.
- Route-owned waiting threads still hydrate the full transcript on reload; the
  UI does not intentionally fall back to showing only the latest optimistic
  fragment.
- Conversation search highlights visible transcript text, skips hidden tool
  payload/code blocks, and uses `Enter` / `Shift+Enter` to move between matches.

## Window Spaces

Saved window spaces live on `ProjectConfig.windowSpaces`.

Each `WindowSpaceConfig` stores:

- `windowsById`
- `order`
- `name`
- `sortIndex`

Saved windows store:

- `surfaceKind`: `project_chat` or `section`
- `mode`
- `sectionIdOrNull`
- `title`
- `chatId` for `project_ai_mode`
- `embeddedGitPaneVisible` for Git Graph windows
- `zIndex`
- normalized floating bounds

Persistence and restore rules:

- Saving only snapshots visible floating windows.
- Docked, minimized, closed, maximized, and invalid section-bound windows are
  excluded from a saved window space.
- Restore reuses matching live floating windows when ownership matches a
  section, a project-chat thread, or the tracked Git Graph.
- Colliding instance ids are remapped.
- Section bindings are deduped again after restore.
- Restore is two-phase:
  1. apply the layout
  2. rebind saved project-chat thread ids against the authoritative runtime
     state

Standalone `/windowspace/:windowSpaceSlug` routes render a local copy of the
saved layout. Dragging, snapping, chat-thread selection, and the embedded Git
pane toggle on that standalone page do not write back to
`ProjectConfig.windowSpaces`.

## Routes and APIs

Standalone frontend routes are documented in `docs/reference/urls-and-routes.md`:

- `/:projectConfigName/chat`
- `/:projectConfigName/chat/:chatId`
- `/:projectConfigName/windowspace/:windowSpaceSlug`
- `/:projectConfigName/section/:sectionSlug`

Backend persistence routes:

- `POST /api/setProjectChatWindowingState`
  - Persists layout-only project-chat window state.
- `POST /api/setProjectChatWindowChatId`
  - Persists a `project_ai_mode` window's `chatId` binding.
- `POST /api/createWindowSpace`
- `POST /api/setWindowSpaceName`
- `POST /api/setWindowSpaceSortOrder`
- `POST /api/deleteWindowSpace`

## Deployment Policy Interaction

- `allowLayoutChanges` gates window layout persistence and window-space
  save/rename/reorder/delete/restore behavior.
- `allowLLM` gates managed-chat usage and the
  `setProjectChatWindowChatId` route.
- If `allowLLM` is false on a standalone managed surface, that surface fails
  closed.
- Mixed standalone window spaces remain available when at least one saved window
  is still allowed after managed-chat filtering.

## Related Docs

- `docs/reference/chat-sections.md`
- `docs/reference/git-pane.md`
- `docs/reference/name-validation.md`
- `docs/reference/share-policy-flags.md`
- `docs/reference/urls-and-routes.md`
