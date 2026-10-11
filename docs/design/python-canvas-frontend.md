# Python Canvas frontend design rationale

This document owns current non-local rationale for the `python-canvas-frontend` module. Public
browser behavior remains in `apps/python-canvas/README.md`.

## Canonical projection

The backend snapshot is authoritative for project identity, revision, authored data, section forest
placement, generated Python, provider status, and diagnostics. React projects one complete snapshot
into `@riteofstring/setta` through `commitWorkspaceDocument`, so section data, structure, and selection
never cross as separate canonical publications.

The browser retains only view or interaction state that the server does not own: workspace
geometry and saved views, local selection and filtering, pane presentation, unresolved item
proposals, and short-lived creation placeholders. A placeholder exists only until its typed create
response returns the canonical identity. It remains unpainted, reconciles in place to preserve its
chosen geometry, and does not remove unrelated placeholders still waiting in the serialized
mutation queue.

Generic workspace forest movement produces a complete placement proposal. Python Canvas translates
that proposal into the matching typed server command; it does not treat the workspace document as
a second durable project store. Coordinate-only movement, including package-owned top-level auto
layout and saved-view activation, remains browser-local: forest comparison ignores geometry and
saved views, and every later canonical projection retains the current active root layout and
reconciled view state. Application data coupled to structure follows the backend authority. For
example, promoting a dictionary leaf to a parent is computed purely during publication and applied
after the workspace subscription returns, because subscriber callbacks cannot synchronously
commit.

Canonical IDs are opaque. Workspace section IDs and structural item-root IDs use disjoint local
namespaces so application identity is never inferred from a generated DOM or drag identifier.

## Mutation serialization and drafts

User drafts stay local until their explicit commit boundary. Every server mutation carries the
project identity and observed revision and is serialized with other frontend mutations. A conflict
is reported rather than retried against a newer project the user did not edit.

Python target persistence and generated execution share the same serialization chain. Run first
flushes the current target draft, waits for that exact persistence result, then captures the
resulting revision. It cannot race a debounced target edit or execute the preceding generated
document.

Callable expression commit and provider signature refresh remain separate mutations. A committed
expression is durable even when a missing symbol prevents signature resolution. The UI keeps that
canonical expression and its diagnostics instead of presenting provider failure as a reverted edit.

## Delegated section clipboard

Python Canvas registers one delegated Workspace clipboard authority after the first canonical
snapshot and section-kind catalog are installed. Its synchronous copyability check accepts only
authored callable, Parameter Dictionary, and List of Objects roots, so generated, pending, and
unknown sections are disabled before an asynchronous copy starts. Copy and paste join the existing
mutation chain and bind their requests to the snapshot project id and revision observed when their
turn begins.

The generated transport payload is parsed at the browser boundary and contains domain-authored
entities only. Workspace's fragment remains the owner of section presentation and relative root
geometry. After one accepted backend paste, the adapter validates the source and destination
forests in parallel, including exact kinds and child order, maps copied presentation onto every new
canonical section, places roots at the Workspace proposal with fresh frontmost z-indices, and
selects the returned roots in the same complete projection publication. It never creates an
optimistic section or local Workspace history entry.

A revision conflict fetches and projects the latest complete snapshot, reports the conflict, and
does not replay copy or paste. Ordinary failure restores the current canonical presentation. The
delegate resolves paste only after `commitWorkspaceDocument` has accepted the returned snapshot;
later delivery of that same revision through the event stream is ignored as already current.

## Workspace history boundary

Python Canvas intentionally creates its `WorkspaceHost` without structural history. The backend
snapshot is canonical, every accepted mutation is revision-checked, and the current backend has no
cross-domain undo operation or durable inverse capable of recreating deleted canonical entities.
A browser-local Workspace stack would therefore claim authority it does not have and could diverge
from the next accepted projection. Editor-local CodeMirror history remains available for active
text drafts.

A future Python Canvas implementation can supply a delegated Workspace history authority after the
backend owns the corresponding contract. That adapter will translate frozen package transactions
into typed inverse-capable backend mutations, serialize them with the existing project mutation
queue, expose pending and unavailable reasons through delegated state, and apply only accepted
canonical snapshots. Workspace load/projection synchronization events then let the adapter
acknowledge, clear, or rebase its history without treating a frontend snapshot as durable project
state. Product effects outside `WorkspaceDocument` remain part of the backend transaction rather
than a responsibility of the UI package.

The Generated Python section receives the exact protected UTF-16 range from the canonical snapshot.
Completion sends the complete draft and that range to the backend and is offered only in the two
editable outer regions. Neither the frontend nor workspace searches text for generated markers.

## Diagnostics and event delivery

One native EventSource consumes complete snapshots. The server sends its current snapshot at every
connection, so transport reconnection is the catch-up mechanism and no timer or polling loop owns a
parallel read model.

A structural snapshot may publish before its diagnostics settle. While that revision is pending,
the frontend may retain the last settled diagnostic presentation only for targets that still exist
in the new canonical section. A settled snapshot replaces the presentation exactly, including with
an empty result. Diagnostics never keep a deleted target visible or become authored workspace data.

## Runtime and browser-local state

Terminal creation, execution, attachment, and deletion are serialized by one frontend runtime.
Run joins an in-flight create request rather than allocating another shell. Running against an
existing hidden terminal does not reveal it; only creating a missing runtime opens the attached
surface. Terminal input uses binary UTF-8 WebSocket frames, including control bytes.

Shell pane preferences and saved views are the application's two browser-storage boundaries. Saved
views use a strict versioned payload under an exact canonical-project-id key. Initial projection
loads a valid saved state through Workspace's bootstrap projection or seeds one Overview view, then
retains that state across later backend projections while Workspace reconciles added and deleted
canonical sections. The initial load never writes a fallback over absent, malformed, or unavailable
storage; persistence begins with the first later accepted saved-view change.

Saved-view persistence runs independently of backend mutation comparison. Switching, renaming,
reordering, changing visibility, or moving the active view therefore cannot enqueue a forest
mutation or add coordinate fields to the Go contract. A missing, malformed, disabled, or
quota-limited storage value leaves a valid in-memory state and reports application feedback without
creating project state or claiming persistence success. Persistence compares canonical saved-view
content, so a fresh projection with unchanged content does not rewrite storage and one failed state
is not retried or re-announced until the saved views change. Neither browser-storage boundary
carries a compatibility parser.

Application feedback stays outside package-private DOM. Completion errors, terminal state, pending
commit presentation, and contextual pane content use public workspace composition seams and
application-labelled live regions.

Callable and Parameter Dictionary body wrappers pass the section's available height through to
Workspace's item-list scroll region. They can shrink below their contents, so resized cards keep
parameter rows inside their boundaries and reachable by scrolling. The shared item list retains
scroll and wheel ownership; application wrappers do not introduce another scroll region.

## Visual parity tooling boundaries

The Python Canvas parity capture serializes browser-visible public state at one boundary and
normalizes fixture-created canonical identifiers before publishing artifacts. A separate
provenance owner resolves source revisions and hashes the built Python Canvas and Workspace
artifacts. Comparison keeps recursive public-state classification and catalog comparison separate:
geometry fields receive the fixed CSS-pixel tolerance, while all other public state and manifest
contracts remain exact. PNG decoding and bounded pixel classification come from the shared parity
image owner used by the Playground comparator.

## Visible recovery

Initial loading and connection failure have a visible presentation. Retry creates a fresh host
only before a workspace has loaded. Operation, completion, terminal, and storage errors render
above the existing workspace, keeping both sighted and screen-reader users informed while their
current work remains available. A completion failure never removes the editor or terminal.
Automatic Python target completion can race a newer canonical generated body. A rejected
completion draft produces no suggestions and clears stale completion feedback; it does not report
a failed project edit. The backend still validates the protected region, and transport or provider
failures retain their visible feedback. Later completion requests use the current draft normally.

## Execution and export

Run drains pending callable and dictionary control saves through the existing mutation queue, then
flushes the Python target and executes the resulting canonical revision in the attached terminal.
A save failure prevents execution and permits retry. This avoids running old values when Run
follows a control change within its save debounce.

Download Python reads the public code-section data at click time, including prefix and suffix
drafts, and saves a Python file. It does not run code or bundle imported modules and dependencies.
Download failure leaves the editor available for retry.
