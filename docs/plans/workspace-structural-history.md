# Workspace structural history implementation plan

Status: active

## Outcome

`@setta/workspace` will own an opt-in, host-scoped history kernel for package-owned document
mutations. Standalone consumers can select an in-memory implementation. Applications with a
backend or a broader product history can delegate recording and navigation to their own authority
while retaining the package's transaction boundaries, commands, key bindings, capability checks,
and focus behavior.

History is disabled unless `createWorkspaceHost` receives an explicit configuration. Existing
consumers retain their current behavior without a compatibility layer or hidden history stack.

## Current boundary

- `WorkspaceHost` owns one canonical serializable `WorkspaceDocument` and publishes one complete
  snapshot after each accepted package mutation.
- Completed moves, resizes, grouping actions, authoring actions, and presentation changes already
  notify at one semantic completion boundary. Selection and viewport publications use the same
  notification path but are transient navigation state.
- `loadDocument` is an external lifecycle replacement. `commitWorkspaceDocument` is an
  application projection replacement. Neither is a package-authored edit.
- Python Canvas subscribes to complete Workspace documents, translates relevant proposals into
  revision-checked backend commands, and projects accepted backend snapshots back through
  `commitWorkspaceDocument`.

## Ownership decision

Workspace owns:

- Typed metadata for package-authored history transactions.
- Detached frozen before/after snapshots at the completed mutation boundary.
- One bounded in-memory past/future engine.
- Undo and redo availability, capability gating, commands, default key bindings, and focus return.
- Explicit synchronization events for document loads and application projections.

The consumer owns:

- Persistence, revisions, conflicts, async acceptance, and cross-domain history.
- Whether delegated transactions become durable history entries.
- Inverses for domain effects, opaque identifiers, providers, files, processes, and backend data.
- User feedback for a delegated authority's pending or rejected operation.

## Public contract

Extend `createWorkspaceHost` with one optional configuration:

```ts
type WorkspaceHostOptions = {
  history?:
    | { kind: "local"; limit?: number }
    | { kind: "delegated"; authority: WorkspaceHistoryAuthority };
};
```

Export these host-scoped operations and types from the package root:

- `getWorkspaceHistoryState(host)`
- `subscribeWorkspaceHistory(host, listener)`
- `undoWorkspace(host)`
- `redoWorkspace(host)`
- `WorkspaceHistoryState` with `canUndo` and `canRedo`
- `WorkspaceHistoryChangeKind`
- `WorkspaceHistoryTransaction`
- `WorkspaceHistorySynchronization`
- `WorkspaceHistoryAuthority`
- `WorkspaceHostOptions`

The delegated authority contract receives `record(transaction)` for package-authored edits and
`synchronize(event)` for `load` and `projection` replacements. It owns `undo`, `redo`, state reads,
state subscriptions, and optional disposal. All transaction documents and synchronization
documents are detached, recursively frozen snapshots.

The transaction carries its change kind, before and after documents, and the capability names
required to navigate it. The synchronization event carries the replacement source and document.
No browser object, callback, store, component, backend revision, or application identifier enters
these values.

## Recorded scope

The local engine records completed package-owned changes in these families:

- Section structure: create, delete, group, ungroup, and reparent/reorder.
- Section layout: top-level movement, resize, lock, orientation, and bounded overflow.
- Section presentation: committed name, minimize state, style accent, and tag color.
- Item structure and layout: insert, delete, reorder/reparent, and column width.

The first release excludes viewport, section selection, item selection, section data, item data,
item control values/configuration, built-in Text/Code editor changes, shell state, navigator state,
windowing state, diagnostics, and appearance mode. CodeMirror retains its independent editor
history.

Every document publication must identify its exact change kind or identify itself as unrecorded.
The history kernel compares the previous observed document with the next document and skips an
unchanged result. One completed gesture produces at most one transaction.

## Local engine behavior

- The default limit is 100 entries. A supplied limit must be a positive finite integer.
- A new recorded edit clears the redo branch.
- Undo and redo restore the transaction's document and its recorded selection while preserving the
  live viewport.
- Replay goes through the existing complete-document validation and atomic publication boundary.
- Replay emits the resulting document to ordinary Workspace subscribers exactly once and never
  records itself as a new transaction.
- `loadDocument` and `commitWorkspaceDocument` synchronize the engine as external replacements and
  clear local history. This keeps full local snapshots from crossing an application-owned
  canonical replacement.
- Current capabilities gate navigation. Structure entries require `canEditStructure`; layout and
  package presentation entries require `canEditLayout`; group and ungroup require both.
- Disposing the host disposes its history state and a delegated authority when that authority
  provides `dispose`.

## Delegated behavior

- Workspace never applies a delegated authority's undo or redo itself. The built-in operations
  forward the request to the authority.
- Workspace records only the package transaction. The authority decides whether to store it,
  coalesce it with product work, persist an inverse, or reject it.
- `loadDocument` and `commitWorkspaceDocument` send explicit synchronization events so an authority
  can clear, acknowledge, or rebase its own history.
- A delegated authority's state drives command availability and subscriptions. Workspace does not
  infer success from a later document shape.

Python Canvas will keep history disabled in this implementation. Its current backend has no
cross-domain undo authority and cannot safely recreate deleted canonical entities. The frontend
design document will record how a future Python Canvas authority can consume transactions, persist
an inverse through its serialized revision-checked mutation queue, and reconcile accepted snapshots
through synchronization events.

## Command and key-binding integration

- Add package pane commands `workspace.undo` and `workspace.redo` to the palette surface.
- Disable them with a specific explanation when history is disabled, empty, capability-blocked, or
  delegated state says unavailable.
- Add default bindings `Mod+Z` and `Mod+Shift+Z`.
- Preserve native or editor undo when the event target is editable.
- A disabled history operation declines without consuming the browser chord.
- A successful local replay restores focus to a surviving selected section or the canvas root.
  Delegated focus remains the authority's responsibility because completion may be asynchronous.

## Implementation slices and commits

1. Commit this plan as the reviewable contract.
2. Add the history types, host configuration, local engine, delegated adapter boundary, lifecycle,
   public exports, and focused tests.
3. Annotate document publication sites with exact change kinds and add mutation-boundary coverage.
4. Add built-in commands, key bindings, editable-target behavior, state subscriptions, and focused
   tests.
5. Integrate the slices, close public API coverage, update current Workspace and Python Canvas
   design documentation plus the package README, and remove obsolete history evidence or wording.
6. Delete this completed plan and commit the final candidate.

Each source commit must leave the public contract coherent. Shared public files are integrated only
after their owning implementation exists.

## Verification

Add focused tests for:

- Local record, undo, redo, redo invalidation, limit eviction, viewport preservation, selection
  restoration, capability gating, load reset, projection reset, and host disposal.
- Delegated record and synchronization snapshots being detached and frozen, state subscription,
  forwarding, and disposal.
- Every recorded mutation family producing one transaction and every excluded publication
  producing none.
- Commands and key bindings, including editable-target yielding and disabled chord behavior.
- Public runtime exports and TypeScript contract coverage.
- Python Canvas continuing to create a history-disabled host and treating application projection as
  backend authority.

The caller's standing instruction prohibits executing tests for this task. Add the required test
coverage without running it. Use formatting, source inspection, package build/type generation, and
non-test policy checks for the implementation candidate. Report the skipped test and merge-gate
verification explicitly.

## Completion and cleanup

- Move durable rationale into `docs/design/workspace.md` and
  `docs/design/python-canvas-frontend.md`.
- Document the local and delegated public API in `packages/workspace/README.md`.
- Remove superseded history wording and any implementation-only compatibility surface.
- Delete this plan after all implementation and current documentation are complete.
- Keep commits free of unrelated work and perform no push, publish, pull-request, or other GitHub
  operation.
