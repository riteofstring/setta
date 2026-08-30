# Workspace saved views implementation plan

## Outcome

Add opt-in saved canvas views to `@setta/workspace`. A saved view is a named presentation of the
same workspace document: it owns the active top-level layout, camera, and exact per-section
visibility while section identity, hierarchy, content, item values, selection, shell panes,
windowing, diagnostics, and runtime state remain shared.

An enabled document will always have one active view. Creating a view will clone the current
presentation and activate it. Switching will first capture the outgoing live layout and camera,
then project the target view and prune selection that is no longer visible in one atomic document
publication. View management and activation will stay out of structural undo history.

## Ownership boundary

`@setta/workspace` will own:

- the canonical saved-view document types, validation, and deterministic reconciliation;
- synchronization between the active saved view and live top-level geometry and viewport;
- per-section visibility and its canvas, Outline, focus, selection, navigation, and command effects;
- create, activate, rename, delete, reorder, and visibility mutations;
- capability gating, focus restoration, accessible status, and the integrated management pane;
- one complete validation and publication boundary for every accepted operation.

Downstream applications will own:

- whether saved views are enabled for a document;
- durable storage, revisions, conflicts, sync, and failure reporting;
- application routes, sharing or deployment exposure, analytics, and product-specific defaults;
- mapping accepted saved-view state through any backend-owned project model;
- application concepts such as variants, runs, files, terminals, and Window Spaces.

Python Canvas will keep its current authority split. Its backend remains authoritative for project
identity, revisions, authored data, and the section forest. Workspace geometry is already
browser-local, so saved views will be stored in versioned project-scoped browser storage and
retained across later canonical backend projections. Switching or editing a saved view will not
send a forest mutation or add coordinate fields to the Go contract.

## Canonical document contract

Extend `WorkspaceDocument` with a required `savedViews` field whose value is either `null` or a
complete `WorkspaceSavedViewsState`. This is an atomic public cutover for the unpublished package;
all repository consumers and fixtures will supply the field explicitly.

`WorkspaceSavedViewsState` will contain an `activeViewId` and a record of
`WorkspaceSavedView` values. Each view will contain:

- a stable nonblank `id` matching its record key;
- a trimmed, nonblank, unique `name`;
- a unique contiguous non-negative `sortIndex`;
- one complete top-level layout keyed by every current top-level section;
- a `Viewport | null` camera snapshot;
- one exact boolean visibility entry for every current section.

The view will store the complete current `TopLevelSectionLayout`, including its optional measured
width and height. Authored `WorkspaceSection.size` remains shared section state; saved views do not
create section variants or copy section records.

`savedViews: null` disables the capability and preserves current all-visible behavior. An enabled
state must contain at least one view and exactly one active id. Editing mode, pending operations,
draft names, errors, and focus remain host runtime or React state and never enter the document.

## Validation, reconciliation, and synchronization

Parse every loaded or projected saved-view state once at the complete-document boundary. Validate
records, ids, names, ordering, layout numbers, viewport numbers, visibility values, and active-view
membership before writing any store.

Document structure can change after a view was saved. Apply one explicit package policy during the
same prepared document commit:

1. Remove deleted section ids from every visibility record and deleted root ids from every saved
   layout.
2. Add every new section to every view as visible.
3. Add every new top-level section to every view with the accepted live layout from the incoming
   document.
4. Keep existing inactive-view layout and visibility unchanged.
5. Synchronize the active view's stored layout and viewport from the accepted live document before
   subscribers observe the publication.

The policy matches the useful behavior of frozen main while keeping one current Workspace owner.
Malformed state still fails specifically; reconciliation handles only valid section-set drift.

All live coordinate, size-measurement, stacking, and viewport publications must refresh the active
view snapshot before `host.getSnapshot()` or a subscriber can observe them. Package document
mutation helpers will carry saved-view state automatically so individual features do not implement
parallel synchronization.

## Visibility and activation behavior

The active view's visibility record is the sole saved-view visibility authority. A hidden parent
removes its rendered subtree. A visible parent may contain hidden descendants. The canvas and
Outline will project only currently visible sections, while the saved-views pane will show the
complete hierarchy so hidden entries remain recoverable.

Activation will validate the target view and current capabilities, capture the outgoing live
layout and viewport, project the target layout and viewport, change the active id, remove hidden
sections from canonical selection, rebuild node geometry, apply the camera, close stale menus and
drag sessions as required, and notify once. Activation remains available when layout editing is
disabled because it selects an existing presentation; creating, renaming, deleting, reordering,
and changing visibility require `canEditLayout`.

The last view cannot be deleted. Deleting an inactive view preserves the live presentation.
Deleting the active view activates the next sorted view, falling back to the preceding view when
there is no successor, through the same atomic activation boundary.

## Public operations and shell integration

Add public constructors and headless operations for:

- creating an initial saved-view state from a document;
- enabling saved views on a loaded host;
- reading the reconciled saved-view state;
- creating and activating a view;
- renaming, deleting, and reordering views;
- setting one or more section visibility values;
- querying disabled reasons for management operations.

All operations will receive an explicit `WorkspaceHost`, return typed results where an accepted
no-op or chosen active view matters, and publish only through the complete document boundary.

Add `WorkspaceSavedViewsPane` and a matching exported icon. `WorkspaceShell` will accept an
`includeBuiltInSavedViews` option, defaulting to `false`, that installs the pane as a reserved
leading tab after Outline. The pane will provide:

- an ordered view list with active state and direct activation;
- create, rename, delete, and deterministic move-up/move-down controls;
- an edit surface containing the complete section hierarchy and visibility checkboxes;
- clear disabled explanations, pending-free local behavior, keyboard operation, focus restoration,
  and polite status announcements.

The pane will render a clear unavailable state when a host opts into the tab before enabling saved
views. It will use public document and capability boundaries and will not reach into package-private
DOM from downstream applications.

## Playground and Python Canvas integration

The Playground will enable saved views in its fixture document and expose the built-in pane. Seed
concrete Overview, Content, and Controls views so switching visibly demonstrates different layouts,
cameras, and section visibility. The performance profile will keep saved views disabled so its
existing measurement fixture remains stable.

Python Canvas will:

1. Add the built-in saved-views tab to its Workspace shell.
2. Parse one exact versioned browser-storage payload keyed by canonical project id.
3. Seed a default Overview view from the first projected document when no saved payload exists.
4. Load valid saved views into the initial Workspace document and persist later accepted view
   changes.
5. Preserve saved views and their live active layout across every later backend projection.
6. Reconcile added and deleted canonical sections through the package document boundary.
7. Report unavailable or malformed storage through application-owned feedback without turning it
   into backend project state.

The storage adapter will have no compatibility parser. It will accept only its current explicit
version and exact payload shape. Storage errors will leave a valid in-memory default and will not
claim persistence success.

## Focused coverage

Add focused Workspace tests for:

- complete type validation, prototype-like ids, unique names/order, finite geometry, and malformed
  active ids;
- deterministic section-set reconciliation and active-view synchronization;
- create, activate, rename, delete, reorder, and visibility mutations;
- one atomic publication, viewport application, selection pruning, capability gating, no-op cases,
  and exclusion from structural history;
- top-level and nested visibility in the canvas and Outline;
- management-pane keyboard, focus, disabled, empty/unavailable, and status behavior;
- public exports and multi-host isolation.

Add Playground coverage for seeded-view switching. Add Python Canvas coverage for storage parsing,
project scoping, first-load seeding, persistence failures, backend-projection retention, section-set
reconciliation, and absence of backend forest mutations for view-only changes.

## Delivery sequence

1. Commit this plan as the temporary implementation contract.
2. Implement and commit the saved-view types, validation, synchronization, headless operations, and
   focused domain coverage.
3. Implement and commit visibility projection plus the integrated pane and shell surface.
4. Implement and commit Playground examples and Python Canvas browser-local persistence.
5. Run focused suites while editing, then `code-polishy test --changed` for broader feedback.
6. Update `packages/workspace/README.md`, `apps/playground/README.md`,
   `apps/python-canvas/README.md`, and the current design rationale with the final contract.
7. Delete this completed plan and any obsolete implementation artifacts, run the final merge gate
   against the resolved merge target, and commit the durable documentation and cleanup.

## Completion criteria

- An enabled consumer can create, name, order, activate, and delete views and can control exact
  section visibility from package-owned UI or public headless operations.
- Each view restores its own canvas layout and camera while shared section content, values,
  hierarchy, selection policy, panes, and windows remain outside the view snapshot.
- Every accepted operation is validated before one coherent publication and does not create a
  structural history entry.
- New and deleted sections reconcile deterministically across every saved view.
- The Playground demonstrates meaningful saved views and Python Canvas persists them per project
  without changing its backend coordinate authority.
- Public and design documentation describe the final ownership boundary.
- The temporary plan and obsolete implementation artifacts are absent from the final tree.
