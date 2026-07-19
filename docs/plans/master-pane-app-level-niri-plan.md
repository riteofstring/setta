# Master Pane and App-Level Niri Layout Plan

**Date:** 2026-07-22
**Status:** Plan of record for moving Setta from a workspace-first shell to a pane-first shell.

## Product Decision

Setta should open directly into a master pane. The user should think in terms of panes, not
workspaces, folders, or project selectors.

The master pane is the main UX. It is one durable, long-running conversation with Setta. It can
answer directly, ask for missing context, open or steer conversation panes, and summon temporary UI
when it needs a resource choice.

Conversation panes remain first-class panes. A conversation may have no resource binding, a local
folder binding, a remote runtime binding, or another future capability binding. Those bindings are
implementation details surfaced only when the user needs to make a meaningful choice.

## Purpose Of The Master Pane

The master pane is Setta's global coordinator. It is the place where the user can say what they want
done without first deciding which folder, runtime, conversation, or capability should handle it.

The master should use product judgment to choose one of these outcomes:

- Answer directly when the request does not need a specific pane, folder, runtime, or tool.
- Ask a useful clarification question when the user can make a real choice.
- Create a conversation pane for new topic work.
- Focus or reopen an existing pane when the user refers to prior work.
- Route input to a conversation pane when a narrower topic agent should handle it.
- Queue work into a busy conversation pane without interrupting active work.
- Steer active work when the user wants to change direction mid-run.
- Track active work across panes and report what is running, blocked, complete, or waiting.
- Request resources on demand, such as a folder, runtime, local/remote capability, or permission.
- Surface approvals when a conversation or agent needs user consent.
- Record action receipts in the transcript so the user can see what Setta did.

The master must not require a folder to exist. Folderless requests should work. Folder-dependent
requests should trigger an ephemeral resource interaction only when the resource is actually needed.

## Hard Lines

This plan is a cutover, not a compatibility layer.

- No backward compatibility shims.
- No legacy surface-kind aliases.
- No migrations for old workspace UI layout state.
- No dual-read or dual-write paths.
- No transitional app mode that keeps the old left pane.
- No fallback that silently recreates the old selected-workspace model.

If checked-in or user-local UI layout state is incompatible with the new model, the new app-level
layout starts fresh.

## Current Model To Replace

The current desktop shell is workspace-first:

```text
selected workspace
  -> workspace-scoped Niri layout
    -> Easy Button conversation panes
```

Important current constraints:

- `App.tsx` renders a permanent `ProjectPane`/`WorkspaceSidebar`.
- `WorkspaceLayoutArea` reads `selectedWorkspaceId`.
- No selected workspace renders a first-run folder picker instead of a pane scene.
- Workspace UI layout is persisted by `workspaceId`.
- Easy Button panes inherit workspace context from the selected workspace.
- The master is a global overlay/launcher, not a pane.
- The master controller restores only one active/unresolved shell interaction and does not maintain
  a durable chat transcript.

This model makes folders a prerequisite for the primary UX. That is the wrong product boundary.

## Target Model

The target desktop shell is pane-first:

```text
Setta app
  -> app-level Niri layout
    -> master pane
    -> conversation pane
    -> conversation pane
    -> browser or capability panes
```

The app-level pane scene is the root UI. It exists before any folder is selected. It persists
globally for the connected runtime or local app data scope, not under a selected workspace.

The master pane is always available. Conversation panes are peers in the same scene, not children of
a selected folder.

## Vocabulary

Use these product concepts in new UI and renderer code:

- `pane`: a visible work surface in the Niri-style app layout.
- `master pane`: the durable global Setta conversation pane.
- `conversation pane`: a pane for direct interaction with one conversation.
- `resource binding`: optional hidden context that gives a pane access to a folder, runtime, repo,
  browser session, or future capability.
- `folder resource`: a local folder binding when file access is needed.

Avoid user-facing `workspace` language. Keep internal workspace-like concepts only where they mean
an actual folder/resource boundary.

## Pane Invariants

The app maintains these invariants:

- There is exactly one master pane.
- The master conversation is durable and is not deleted by pane layout operations.
- Pressing the master shortcut ensures the master pane exists, focuses it, maximizes it, and focuses
  the composer.
- Closing a conversation pane removes only that view from the current layout.
- Closing a pane does not cancel active work.
- Reopening an existing conversation creates or focuses a pane for that durable conversation.
- Destructive actions such as deleting, archiving, or resetting history are explicit commands, not
  pane-close side effects.

## Master Pane Behavior

The master pane should feel similar in interaction grammar to conversation panes:

- Long transcript.
- Composer at the bottom.
- Streaming or in-progress state.
- Assistant answers.
- Clarification questions.
- Action receipts for routing, pane creation, pane focus, queued work, approvals, and resource
  choices.
- Product-safe failures with retry actions.

The master pane should still look distinct from conversation panes:

- It uses a dedicated `master` surface kind.
- It does not use conversation palette identity.
- It uses Setta/global identity rather than topic identity.
- It can show coordination receipts and resource requests that normal conversation panes do not
  own.

The existing overlay shortcut should become a pane focus shortcut. A modal master overlay may be
added later only as secondary convenience UI; it is not the primary master experience.

## Durable Master Conversation

Replace the current transient master interaction projection with a durable master transcript.

The durable transcript should include:

- User master inputs.
- Assistant global answers.
- Clarification questions.
- User clarification replies.
- Route/action receipts.
- Product-safe failure messages.
- Cancellation records.
- Resource-request records.

Provider audit details, route context, schema validation details, provider thread ids, and internal
diagnostics stay backend-owned and are not transcript UI.

The master routing system may still use structured decisions internally. The transcript is the
user-facing projection of what happened.

## Conversation Panes

Replace the workspace-inherited Easy Button pane config with an explicit conversation pane config.

The new persisted surface kind should be `conversation`, not `easy-button`.

Conversation pane config should include:

```text
conversationId
resourceBindings
presentationIdentity
```

`resourceBindings` is optional. A folderless conversation is valid. If a user asks for work that
requires files, Setta asks for a folder resource at that point through ephemeral UI.

Conversation panes can exist for conversations connected to different folders or runtimes because
the binding belongs to the pane/conversation, not to a global selected workspace.

## App-Level Layout Persistence

Introduce a new app pane layout domain. Do not reuse workspace UI layout as a compatibility
container.

The new layout store owns:

- schema version
- focused pane id
- maximized pane id
- columns and pane placement
- pane records
- surface kind
- surface config by kind

Surface kinds in the new product contract:

- `master`
- `conversation`
- `browser`
- `empty-frame` if still useful as an internal placeholder

Do not accept old `easy-button` layout records in the new app layout contract.

## Resource Requests And Ephemeral UI

The master should summon focused, temporary UI only when a real user choice is needed.

Examples:

- Choose a folder resource.
- Choose local vs remote runtime.
- Choose one of several matching conversations.
- Approve a sensitive action.
- Pick a capability provider.

These surfaces should be typed product interactions, not generic error prompts. The app should not
ask the user to recover from routing JSON, schema, projection, or formatting failures.

## Pane Close And Reopen

Pane close semantics:

- Master pane: cannot be destructively closed. A close command should focus another pane or do
  nothing if no other pane exists.
- Conversation pane: remove the pane from the app layout only.
- Browser/capability panes: close removes the view; durable resource/session cleanup requires a
  separate explicit command if applicable.

Reopen paths:

- Master shortcut.
- Asking the master.
- Command/search palette.
- Recent or active work ephemeral surface.
- Clicking an action receipt in the master transcript.

The reopen operation is idempotent: focus an existing pane for the target if present, otherwise
create a pane for the existing durable target.

## Keyboard Shortcut

The master shortcut is global within the desktop app.

Required behavior:

```text
shortcut pressed
  -> ensure app-level layout is loaded
  -> ensure exactly one master pane exists
  -> focus master pane
  -> maximize master pane
  -> focus master composer
```

It must work from:

- master pane
- conversation panes
- browser/native panes
- settings
- folderless fresh startup
- transient resource UI

Native/browser pane key forwarding must route this shortcut to the shell.

## Implementation Sequence

### 1. Replace Workspace UI Layout With App Pane Layout

**Status:** Completed.

Completed repository work:

- Added a Go-owned app pane layout contract, store, service, HTTP endpoints, generated TypeScript
  surface, and Electron IPC/preload bridge.
- Added a focused Electron workflow that round-trips the app pane layout through renderer preload,
  main IPC, backend HTTP, and app-level layout storage.
- Moved the primary renderer Niri shell load/save path from workspace-scoped UI layout persistence
  to the app pane layout API.
- Added renderer adapters that store current conversation panes as app-level `conversation` records
  with explicit folder resource bindings while preserving the required app-level master pane record.
- Restored app-level focused and maximized pane ids into the renderer runtime, and extended the
  focused Electron workflow to verify app layout load/save through renderer, preload, main, backend
  HTTP, and storage.

Remaining repository work:

- None.

Create a new Go-owned app pane layout contract and generated TypeScript surface.

Remove the workspace-scoped UI layout dependency from the primary renderer shell. Delete old
workspace UI layout read/save usage from the shell path instead of bridging it.

### 2. Add Product Surface Kinds

**Status:** Completed.

Completed repository work:

- Kept the app-level pane layout contract on `master` and `conversation` surface kinds, with
  generated TypeScript rejecting removed `easy-button` app pane records.
- Cut the older workspace UI pane contract over from `easy-button`/`easyButtonConfig` to
  `conversation`/`conversationConfig`, regenerated the backend TypeScript surface, and bumped the
  backend protocol version for the breaking contract shape.
- Updated renderer workspace-layout scene types, pane normalization, pane store, surface adapter
  routing, topic conversation presentation, and Electron workflow fixtures to use conversation pane
  product records instead of persisted `easy-button` records.

Remaining repository work:

- None.

Add `master` and `conversation` as product surface kinds.

Remove `easy-button` from the persisted pane contract. Rename renderer concepts that are now
conversation-pane concepts as part of the cutover. Do not keep an `easy-button` alias in generated
contracts.

### 3. Build The Master Pane Surface

**Status:** Completed.

Completed repository work:

- Restored app-level `master` pane records into the live renderer Niri scene instead of filtering
  them out during app layout load.
- Added a React DOM surface adapter path for `master` panes, threaded the app-shell master
  controller and speech controllers into separate pane React roots, and rendered the master pane as
  a first-class Niri pane with composer, current interaction state, progress, routing results,
  cancellation/retry controls, voice controls, and product-safe unavailable state.
- Preserved existing app-level master pane records during layout save so renderer persistence does
  not create duplicate master panes, and kept master pane close requests non-destructive.
- Updated the focused app pane Electron workflow to verify the live master host is restored through
  renderer, preload, main, backend HTTP, and app-level layout storage.

Remaining repository work:

- None.

Create a React DOM surface adapter for `master`.

Render the master as a Niri pane with a long transcript, composer, progress state, route/action
receipts, and product-safe recovery actions.

### 4. Persist The Durable Master Transcript

**Status:** Completed.

Completed repository work:

- Added a backend master transcript projection with durable transcript event records separated from
  route audit records.
- Projected shell-originated master inputs, assistant answers, clarification questions, route/action
  receipts, product-safe routing failures, and cancellations into the durable transcript.
- Added a backend read endpoint, generated TypeScript contract surface, Electron IPC/preload bridge,
  and renderer controller loading path for the master transcript.
- Rendered transcript entries in the master pane while preserving the existing active interaction
  presentation, cancellation, retry, and presentation-intent flows.
- Added focused backend, HTTP, IPC/preload, renderer controller, and renderer surface tests for
  durable transcript persistence and projection.

Remaining repository work:

- None.

Extend the backend master domain so shell-originated master inputs project into one durable master
conversation.

Store transcript records separately from route audit records. The transcript is product state; the
route audit remains internal state.

### 5. Make Conversation Context Explicit

**Status:** Completed.

Completed repository work:

- Made app pane layout persistence accept conversation panes without persisted resource bindings and
  normalize them to an empty binding list, so folderless pane records remain deterministic on read
  and save.
- Preserved app-level conversation resource bindings in the renderer scene when restoring app pane
  layout, and kept folderless conversation panes visible instead of filtering them out for lack of a
  matching folder binding.
- Kept restored folderless conversation panes folderless when the renderer saves the app pane layout
  again.
- Made topic conversation ownership optional in the Go domain, store schema, service creation path,
  HTTP create contract, generated TypeScript surface, and renderer workspace-scoped projection guards.
- Added backend resource-required handling for folder-dependent topic work started from a folderless
  conversation, returning a stable `conversation_resource_required` API error code instead of treating
  missing workspace ownership as an internal failure.
- Kept folderless conversations out of workspace-scoped topic indexes, navigator pages, legacy pane
  binding projection, and narration observers until a folder resource exists.
- Added a backend folder-resource binding command that attaches a folderless conversation to the
  selected workspace, republishes the conversation snapshot, and makes the bound conversation available
  through workspace-scoped reads, navigator pages, and subsequent topic turns.
- Added Electron IPC/preload and renderer Easy Button handling for folder resource requests: choose a
  local folder, bind the conversation, persist the pane's folder resource binding, reload workspace
  session state, and submit the pending text input against the newly bound workspace.

Remaining repository work:

- None.

Change conversation pane config and conversation creation so resource bindings are explicit and
optional.

Folderless conversation creation is valid. Folder-required work triggers a resource request instead
of blocking app startup or conversation creation.

### 6. Remove The Left Pane Shell

Delete the permanent `ProjectPane`/`WorkspaceSidebar` from the primary app shell.

Replace its remaining jobs with:

- master transcript actions
- keyboard shortcut
- command/search palette
- ephemeral resource and conversation pickers
- settings entry point outside the old sidebar model

### 7. Rework Presentation And Routing

Presentation intents should target app-level panes.

Conversation focus/create/open commands should no longer select a workspace first. They should
resolve or create the appropriate pane directly from the command target and its resource bindings.

### 8. Verify End To End

Because this touches pane layout, master routing, conversation creation, persistence, keyboard
shortcuts, and renderer state, verification must include deterministic end-to-end app workflow
tests through production Electron/main/preload/renderer/HTTP/store paths.

Required coverage:

- fresh startup opens master pane without a folder
- master shortcut focuses and maximizes master pane
- master transcript persists across reload
- master can answer without a folder
- master can ask for a folder only when needed
- folderless conversation pane can be created and reopened
- resource-bound conversation pane can be created and reopened
- closing a conversation pane preserves active work
- closing/focusing behavior preserves exactly one master pane
- no old sidebar or selected-workspace requirement appears in the primary flow

Run live Codex E2E tests when local Codex CLI ChatGPT auth is available.

## Deletion Targets

Delete or replace these concepts during implementation:

- permanent left project pane
- user-facing workspace selector as the main navigation model
- no-folder first-run surface that blocks the pane scene
- overlay-only master UX
- transient-only master controller as the sole master UI state
- persisted `easy-button` surface kind
- workspace-inherited conversation pane context
- app startup dependency on `selectedWorkspaceId`

## Success Criteria

The cutover is complete when:

- A fresh user sees the master pane immediately.
- The master pane works without selecting a folder.
- The user can have one long durable conversation with the master.
- Conversation panes are peers of the master pane.
- A pane can be closed and later reopened without deleting durable work.
- The master shortcut always brings the master pane into view.
- Folder/runtime choices appear only as on-demand resource interactions.
- The primary UI contains no permanent left pane and no user-facing workspace-first flow.
