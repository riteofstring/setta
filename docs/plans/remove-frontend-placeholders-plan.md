# Remove Frontend Placeholders Plan

This plan describes how to remove placeholder UI, no-op controls, and fake
frontend state from the integrated `new-layout` frontend while preserving the
real `setta-3` backend behavior.

The cleanup goal is not to make every aspirational feature work immediately. The
goal is to ensure the frontend no longer presents enabled product controls that
do nothing, mutate fake state, or imply durable behavior that does not exist.

This is a removal-first cleanup plan. Do not add new backend capabilities,
durable product state, generated contracts, compatibility shims, or new
IPC/preload APIs as part of this pass. A control may stay only when it can be
connected to production behavior that already exists before this cleanup starts.
If the behavior is missing, remove the control from normal UI.

This pass does not need backward compatibility, legacy support, migrations,
transitional adapters, dual-read/write paths, old-field aliases, or transitional
code. Remove obsolete placeholder surfaces directly.

## Target Invariant

Every visible enabled frontend control must fall into one of these categories:

- It executes real behavior through the production renderer, preload, Electron
  main, HTTP, Go backend, and store path.
- It changes only ephemeral UI chrome, such as opening a menu, selecting a tab,
  focusing an input, resizing a pane, or dismissing a dialog.
- It is an accurate read-only display with no implied action.

Anything else must be removed from normal UI until the real behavior exists.

Do not replace no-ops with fake success states, optimistic local product state,
silent fallbacks, or local-only persistence. If a feature needs backend support,
remove the frontend affordance in this pass and track the real feature as
follow-up work.

## Decision Rules

Use this policy for every placeholder or questionable control. These rules are
ordered and deterministic:

- If the behavior already exists in `setta-3`, wire the control to that existing
  behavior.
- If the behavior does not already exist in `setta-3`, remove the visible
  control from normal UI.
- If the behavior would require new durable product state, a new backend
  contract, a new IPC/preload API, or a generated contract change, do not build
  it in this pass. Remove the UI affordance and leave the feature for a
  separate backend-owned plan.
- If it is unclear whether the behavior exists, assume it does not exist and
  remove the visible control. The only exception is when the agent can point to
  an existing production store/preload/backend function and wire the control to
  it without changing contracts.
- If hiding the control would leave an awkward gap, adjust the layout so the
  remaining real controls still look intentional.
- Do not keep a visibly enabled button that only logs, closes a menu, updates
  fake product state, or calls a temporary no-op.
- Do not keep local-only settings, pins, notes, rules, terminals, canvases,
  memory integrations, or project actions.
- Do not add backward compatibility, legacy support, migrations, transitional
  adapters, dual-read/write paths, old-field aliases, or transitional code.

Explicit pass-level decisions:

- Do not implement chat deletion in this pass. Remove the chat trash/delete UI
  and remove the `deleteConversation` temporary no-op from the renderer store.
- Do not implement pinned chats or pinned projects in this pass. Remove pin UI
  and renderer-local pin state.
- Do not implement notes, rules, terminals, canvases, memory integrations,
  plugins, automations, notifications/logs, global search, command palette,
  browser panes, diff panes, file panes, voice input, attachments, Electron
  context attachments, chat permission modes, reasoning controls, or settings
  persistence in this pass.
- Keep Provider Accounts because it is already wired to production preload APIs.
- Keep existing project chat creation, workspace selection, workspace opening,
  recent workspace handling, project folder opening, workspace removal,
  transcript-local search, chat sending, queueing, steering, stopping,
  approvals, `/goal`, and `/model` only where those flows are already backed by
  current production code.

## Current Placeholder Inventory

The agent must verify this inventory before implementation because the branch
may continue changing. Verification does not change the cleanup policy: newly
found placeholders follow the same remove-first rules.

### Sidebar And Projects

- Chat row delete/trash button calls `deleteConversation`, which is a temporary
  no-op.
- Chat row pin/unpin mutates renderer-only pin state.
- Primary sidebar shortcuts for `New setta gen`, `Plugins`, `Automations`, and
  `Notifications / Logs` have no behavior.
- Standalone sidebar `terminal`, `setta canvas`, and `chat` actions create
  local placeholder rows only.
- Sidebar `New note` and `New rule` actions create local placeholder rows only.
- Project-level `New terminal` and `New setta canvas` create local placeholder
  rows only.
- Placeholder sidebar rows are buttons with no click behavior.
- Project more menu actions `Pin project`, `Open in Finder`,
  `Create permanent worktree`, `Rename project`, and `Archive chats` call a
  temporary no-op.
- DB / Memories modal options `Folder`, `Obsidian`, `QMD`, and `Cognee` call a
  temporary no-op.

### Chat Composer And Menus

- Composer voice input button has no handler.
- Add-context menu items `Add photos & files` and `Attach Electron` have no
  handlers.
- Add-context `Plan mode` and `Pursue goal` toggle local-only component state.
- Add-context plugin submenu entries have no handlers.
- Chat permissions menu choices update local-only state.
- Chat model menu reasoning choices update local-only state.
- Chat model menu rows `GPT-5.5` and `Speed` have no handlers.
- Static slash-command palette entries include commands that are not backed by
  the backend command registry.

### Palettes, Panes, And Settings

- Command palette input is not wired to command execution or filtering; its
  rows only close the palette.
- Global search palette has an input but no query/results behavior.
- Workspace pane actions for `Browser`, `Canvas`, `Diffs`, `Files`, `Note`, and
  `Terminal` create local placeholder tabs or empty/static surfaces.
- Settings outside Provider Accounts are local-only React state or uncontrolled
  inputs. They do not persist or apply to app behavior.

## Workstreams

### 1. Add Audit Guardrails

Before removing behavior, add a lightweight audit so regressions are easy to
catch during the cleanup.

- Search for and remove all `temporaryNoop`, `temporary.*Noop`, and equivalent
  empty action handlers.
- Search for enabled `<button>` elements with no meaningful `onClick`, no form
  submit role, and no menu trigger role.
- Search for local state whose names imply product state, such as pinned chats,
  notes, rules, utility items, settings choices, or permissions.
- Add focused renderer tests for the highest-risk controls that remain visible.
- Do not add a new broad lint-style script in this pass. Use focused searches
  and targeted tests instead; broad button heuristics are too likely to create
  false positives in this UI.

Exit criteria:

- No temporary no-op functions remain.
- Remaining intentional no-action elements are disabled, read-only, or
  semantically non-interactive.
- The audit list is checked in as implementation notes or test coverage, not
  only as tribal knowledge.

### 2. Sidebar Cleanup

Remove fake sidebar state first because it creates many visible placeholders.

- Remove local `standaloneItems`, `projectUtilityItemsByWorkspace`, `notes`,
  and `rules` product state.
- Remove sidebar actions that create placeholder terminal, canvas, note, rule,
  or standalone chat rows.
- Remove placeholder row rendering for those fake entries.
- Remove primary sidebar shortcut buttons for `New setta gen`, `Search`,
  `Plugins`, `Automations`, and `Notifications / Logs`.
- Keep real workspace selection, recent workspace, project chat creation, chat
  selection, project folder opening, settings opening, and workspace removal.
- Remove the chat pin/unpin button and all renderer-local pinned-chat state.
- Remove the chat trash/delete button and the `deleteConversation` temporary
  no-op.
- Remove project more menu actions `Pin project`, `Open in Finder`,
  `Create permanent worktree`, `Rename project`, and `Archive chats`.
- Keep the project more menu only if it still contains the real `Remove`
  workspace action. A one-item menu is acceptable for this cleanup pass.
- Remove the DB / Memories sidebar entry and modal entirely.

Verification:

- Project sidebar opens and selects workspaces as before.
- Project `New chat` still creates a real chat.
- Removed controls leave no layout gaps or hidden hover targets.
- Reloading the app does not expose any fake sidebar state.

### 3. Chat Composer Cleanup

Keep the composer focused on real chat behavior.

- Remove voice input until dictation/transcription is implemented.
- Remove `Add photos & files` until attachment ingestion exists through the
  backend and transcript contract.
- Remove `Attach Electron` until there is a concrete attachment or context
  capture contract.
- Remove local-only `Plan mode` and `Pursue goal` toggles.
- Remove the static slash-command palette and its hardcoded command inventory.
- Keep only the backend-driven command suggestions returned by `listCommands`.
- Keep `/goal` and `/model` command flows because they are backed by the current
  command endpoint.
- Remove plugin submenu entries until plugin execution or configuration exists.
- Remove the chat permissions menu.
- Remove the chat model/reasoning menu. Model selection remains available only
  through the existing `/model` command flow.

Verification:

- Sending, steering, queueing, stopping, approvals, and command execution still
  use the production chat path.
- Unsupported slash commands are not advertised in the static UI.
- The composer has no enabled controls that only update local display state.

### 4. Palettes And Search

Remove command/search shells. Do not implement global command or search behavior
in this cleanup pass.

- Remove the command palette component, its trigger path, and the `Cmd+K`
  keyboard shortcut.
- Remove the global search palette component, its sidebar shortcut, and the
  `Cmd+G` keyboard shortcut.
- Keep transcript-local search. If cleanup work breaks transcript-local search,
  fix transcript-local search rather than removing it.

Verification:

- `Cmd+K` and `Cmd+G` are unregistered.
- No palette row simply closes the palette while implying a command ran.

### 5. Workspace Pane Cleanup

Workspace pane actions should create real panes, not empty frames. In this
cleanup pass, keep only the Settings pane, and reduce Settings to real content
as described below.

- Keep the Settings pane container because it hosts Provider Accounts.
- Remove pane creation actions for `Browser`, `Canvas`, `Diffs`, `Files`,
  `Note`, and `Terminal`.
- Remove empty runtime frame surfaces for `Browser`, `Canvas`, `Diffs`, and
  `Files`.
- Remove the empty note surface.
- Remove the static terminal prompt surface.
- Remove empty-pane action buttons and new-tab menu entries for removed pane
  kinds.
- If the workspace pane component only has Settings left, simplify the pane UI
  so it does not advertise unavailable tab creation.

Verification:

- Creating a pane always creates a useful real surface.
- Closing/reopening panes does not create fake documents or fake runtime state.
- App workflow tests cover any pane that touches workspace, chat, terminal,
  browser, git, or persistence behavior.

### 6. Settings Cleanup

Settings is reduced to Provider Accounts only in this pass.

- Keep Provider Accounts because it is already wired to preload APIs.
- Remove the local `choices` and `switches` settings state.
- Remove the local reset button.
- Remove settings navigation entries and panels for Shell, Chat, Projects,
  Views, Shortcuts, and Storage.
- In Integrations, remove the Tools group, Status bar group, and any local-only
  toggles.
- Keep only the Provider Accounts panel and any loading/error/save/clear UI that
  is already production-backed inside that panel.

Verification:

- Every editable setting survives reload and affects the documented behavior.
- Settings that are not ready are absent from normal UI, not local-only.
- Provider Accounts still list, save, and clear through the production path.

### 7. Backend And Contract Work

Do not add backend surfaces in this cleanup pass. Removed placeholders that
should become real features belong in follow-up backend-owned plans.

Likely backend-owned features:

- Chat deletion and any deletion policy for runs, transcript items, queues, and
  corruption/quarantine records.
- Durable pinned chats and project pinning.
- Attachments and Electron/context attachments.
- Chat permissions, reasoning/model selection, and goal/plan mode semantics.
- Plugin, automation, MCP, and memory integration registries.
- Settings persistence and application.
- Workspace terminal, browser, diff, file, note, and canvas runtime state.

Rules for any future follow-up plan:

- Add HTTP endpoint contracts through `internal/httpapi` endpoint owners.
- Keep Go-owned values and contracts in Go.
- Regenerate TypeScript contracts with
  `./scripts/go.sh run ./cmd/generate-contracts`.
- Do not manually edit generated outputs.
- Do not add compatibility shims or dual paths unless explicitly requested.

If implementing this cleanup unexpectedly appears to require backend or
generated-contract work, do not add that work. Remove the frontend affordance
instead. Stop only when the app cannot compile without backend work after the
affordance has been removed.

### 8. Testing And Verification

This cleanup touches renderer chat state, transcript UI, IPC/preload contracts,
and potentially chat lifecycle behavior. Test coverage should scale with the
actual code changes.

Required checks for broad cleanup commits:

```sh
./scripts/format.sh
./check_quality.sh --all
```

If dependency manifests, lockfiles, package manager configuration, Go module
configuration, or supply-chain tooling change, also run:

```sh
./scripts/check_supply_chain.sh
```

Required app workflow coverage:

- Opening a workspace.
- Creating a project chat.
- Sending a message.
- Receiving streamed assistant output.
- Queueing while a run is active.
- Steering an active run.
- Completing, cancelling, and failing a run.
- Approval submission if permission/approval UI is touched.
- Restart/reload behavior for any newly persistent state.

Live-provider tests should run when `OPENAI_API_KEY` is present in `.env` for
changes touching chat workflows, Codex behavior, provider protocol handling,
run lifecycle, queueing, steering, approvals, or streaming. If credentials are
absent, record the skip explicitly.

## Implementation Order

1. Add the audit inventory and remove explicit no-op helpers.
2. Remove fake sidebar product state and placeholder sidebar actions.
3. Remove chat row delete/pin controls.
4. Remove local-only composer menus, static unsupported slash commands, and
   unbacked model/permission controls.
5. Remove command palette and global search.
6. Remove empty workspace pane surfaces and pane creation actions that are not
   real.
7. Reduce Settings to Provider Accounts only.
8. Run focused renderer tests after each area.
9. Run full quality checks before the final merge-ready commit.

## Merge-Ready Exit Criteria

- No visible enabled frontend control does nothing.
- No product feature is represented only by renderer-local fake state.
- No temporary no-op functions remain.
- No settings control is editable unless it persists and applies.
- No static slash-command, plugin, memory, pane, or project action is advertised
  unless it is backed by production behavior.
- Reloading the app does not discard state that the UI presented as durable.
- Deterministic app workflow tests cover the real chat paths affected by the
  cleanup.
- The final diff does not manually edit generated outputs.
