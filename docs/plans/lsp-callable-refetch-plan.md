# LSP Callable Param Refetch Plan

## Summary
Add an opt-in settings toggle that triggers automatic callable param refetching
when LSP diagnostics indicate a call-argument mismatch (missing/extra/incorrect
parameter names). This refetch path reuses the existing `set_callable(...,
refetchParams=True)` behavior so existing parameter code objects are preserved
by name. The new trigger is independent of watch mode.

## Goals
- Add a backend settings toggle that enables auto-refetch on LSP call mismatch.
- Detect LSP diagnostics that signal call-argument mismatches (not type errors).
- Refetch params for affected callable sections exactly when mismatch appears.
- Keep current watch mode behavior unchanged, but align refetch logic in one
  shared helper so LSP-based refetch and existing auto-refetch use the same
  pathway.

## Non-goals
- No refetch on argument type errors.
- No UI logic changes beyond settings propagation.
- No behavioral changes to watch mode or manual refetch flows.

## Current Behavior
- Watch mode updates callable params on signature hash changes by calling
  `set_callable(..., refetchParams=True)`.
- Auto-refetch is only triggered when undefined symbols become resolved in
  generated code diagnostics.
- LSP call-argument mismatch errors are parsed and surfaced as UI errors but do
  not trigger refetch.

## Proposed Changes

### 1) Settings
- Add a new boolean field on `SettingsBackend`:
  `autoRefetchCallableParamsOnLspMismatch` (default: false).
- This field is the single toggle; it is independent of watch mode.

### 2) Diagnostics: detect call-argument mismatches
- Extend the LSP diagnostics processor to return a set of section IDs that have
  call-argument mismatches based on:
  - `Diagnostic.code == "reportCallIssue"`
  - message includes "parameter" or "positional argument"
- Map each diagnostic range back to a section dependency key to identify the
  owning section even when the missing parameter is not present in the UI.

### 3) ProjectGenPythonCode: mismatch tracking + callback
- Track the last mismatch set on `ProjectGenPythonCode` to avoid refetch loops.
- Add a new optional callback `on_callable_signature_mismatch` that is invoked
  only for newly mismatched sections.

### 4) BaseProjectManager: unified refetch helper
- Extract the existing auto-refetch logic into a shared helper that:
  - Builds refetch targets from section IDs.
  - Uses `set_callable(..., refetchParams=True)`.
  - Preserves existing params by name (current behavior).
  - Adds a single coalesced history entry when it changes code.
- Keep the current undefined-symbol refetch behavior unchanged by calling the
  shared helper.
- Add a new enqueued method for LSP mismatch refetch that first checks the
  settings toggle.

## Behavior Details
- If the toggle is off: mismatch diagnostics do nothing (errors still show).
- If the toggle is on: the first appearance of a mismatch for a section triggers
  a refetch. Further identical mismatch diagnostics do not refetch again unless
  the section first becomes clean and then mismatches again.
- Missing params in the callable definition are still detected because the
  mismatch is mapped at the section level via diagnostic ranges.

## Files to Update
- `backend/setta/types/settings_state.py`
- `backend/setta/project_state/lsp_response_handlers/diagnostics.py`
- `backend/setta/project_state/project_code.py`
- `backend/setta/project_state/base_project_manager.py`

## Testing/Verification
- Manual:
  1) Enable the new settings toggle.
  2) Create a callable section bound to a function with params x, y.
  3) Update the function signature to add param z.
  4) Confirm LSP emits a call-issue diagnostic and params are refetched to
     include z while preserving x/y values.
  5) Disable toggle and repeat; confirm no auto-refetch occurs.

## Rollout Notes
- Default remains off to avoid behavioral surprises.
- No backwards-compatibility concerns; existing flows remain unchanged.
