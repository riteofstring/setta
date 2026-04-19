# Backend-Owned Language Server Selection UI Plan

## Goal

Make the backend the source of truth for language-server selection UX state so
the frontend does not reconstruct a language-server state machine from raw
plugin status entries plus raw settings shape.

## Problem

The current frontend infers user-facing Python language-server state by
combining:

- raw plugin runtime state,
- raw plugin language-server registrations,
- raw applied-language-server status, and
- raw settings document shape (`missing` vs `null` vs string).

That creates drift risk because the same backend facts are interpreted in
multiple frontend components.

## Desired End State

- The plugin runtime response exposes a backend-owned language-server
  selection status view model keyed by language.
- The backend also owns the mutation route for selecting or disabling a
  language server for a language.
- The frontend plugin pane and banner render from the backend-owned selection
  status instead of scanning `PluginStatusEntry[]` and raw settings state.
- The frontend no longer writes `languageServer.selectedByLanguage` by editing
  and posting the full settings document for this workflow.

## Contract Design

Add a language-server selection status surface to plugin runtime status.

Recommended shape:

- one entry per language that matters to the current workspace/runtime:
  - selected in settings,
  - currently applied,
  - or currently provided by an active plugin
- each entry includes:
  - `language`
  - `selectionState`: `unset | disabled | selected`
  - `status`: backend-owned summary enum for the current UX state
  - `severity`: `default | warning | success`
  - `message`: backend-owned summary text
  - `selectedPluginId`
  - `appliedPluginId`
  - `availableProviders[]` with backend-owned display names
  - `restartRequired`

Initial `status` enum:

- `unselected`
- `disabled`
- `no_available_providers`
- `selected_unavailable`
- `selected_incompatible`
- `pending_restart`
- `active`

This keeps presentation simple while still letting the backend own the domain
state machine.

## Backend Implementation Plan

### 1. Add selection status types to the plugin runtime contract

- Extend the shared plugin status/runtime types in Go with generic
  language-server selection status structs and enums.
- Keep this language-generic even though Python is the first consumer.

### 2. Build selection status in the app-layer runtime service

- Reuse existing backend-owned inputs:
  - plugin status entries,
  - applied language-server status,
  - settings runtime selections.
- Compute one canonical selection status entry per language.
- Publish that status on the plugin runtime response.

### 3. Add a dedicated mutation route

- Add a plugin/LSP route that accepts:
  - `language`
  - `pluginId` as string or `null`
- Persist through `settingsstate.Runtime.MutateAndSave`.
- Validate language and plugin id using backend settings helpers.
- Broadcast the normal frontend settings update after mutation.

### 4. Add backend tests

- selection status mapping for:
  - unset + provider available
  - unset + no providers
  - disabled
  - selected active
  - selected pending restart
  - selected unavailable
  - selected incompatible
- mutation route tests for:
  - selecting a plugin
  - disabling a language server with `null`
  - invalid language / invalid payload

## Frontend Implementation Plan

### 1. Extend plugin runtime store

- Hydrate backend-owned language-server selection entries from the generated
  runtime response.
- Index them by language in the runtime store.

### 2. Replace frontend inference in the banner

- The banner reads the backend-owned Python selection entry.
- The banner renders directly from:
  - `status`
  - `message`
- The banner disappears when the backend reports `active`.

### 3. Replace frontend inference in the Plugins pane

- The Python selector options come from backend-provided
  `availableProviders[]`.
- The pane summary uses backend-owned `message`, `severity`, and
  `restartRequired`.
- The pane stops scanning raw plugin status entries to infer Python selection
  health.
- Plugin cards only use backend-owned `selectedPluginId` to render the
  `Python selected` badge and `Use for Python` action.

### 4. Switch mutations to the dedicated route

- `Use for Python` and the combobox both call the new route.
- After mutation, refresh plugin runtime and rely on websocket settings update
  for settings state.

## Verification Plan

- Regenerate affected Go-owned frontend and Python bindings.
- Run focused Go tests for plugin runtime and plugin/settings routes.
- Run focused frontend Vitest coverage for the plugin pane and banner.
- Run `./check_quality.sh` on the changed code.
- Run a CDP visual check on the Plugins pane and banner if the local dev
  session/browser path is healthy.

## Non-Goals

- Do not add heuristics that auto-pick a provider from installed plugins.
- Do not preserve frontend reconstruction of selection health from raw
  settings shape.
- Do not add a compatibility shim where both the old full-settings write path
  and the new dedicated route are used for the same UI action.
