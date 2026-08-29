# Python Canvas frontend design rationale

This document owns current non-local rationale for the `python-canvas-frontend` module. Public
browser behavior remains in `apps/python-canvas/README.md`.

## Canonical projection

The backend snapshot is authoritative for project identity, revision, authored data, section
placement, generated Python, provider status, and diagnostics. React projects one complete snapshot
into `@setta/workspace` through `commitWorkspaceDocument`, so section data, structure, and selection
never cross as separate canonical publications.

The browser retains only view or interaction state that the server does not own: workspace
geometry, local selection and filtering, pane presentation, unresolved item proposals, and
short-lived creation placeholders. A placeholder exists only until its typed create response
returns the canonical identity. It remains unpainted, reconciles in place to preserve its chosen
geometry, and does not remove unrelated placeholders still waiting in the serialized mutation
queue.

Generic workspace movement produces a complete placement proposal. Python Canvas translates that
proposal into the matching typed server command; it does not treat the workspace document as a
second durable project store. Application data coupled to structure follows the same authority. For
example, promoting a dictionary leaf to a parent is computed purely during publication and applied
after the workspace subscription returns, because subscriber callbacks cannot synchronously commit.

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

Shell pane preferences are the application's only browser-storage boundary. A missing, malformed,
disabled, or quota-limited storage value falls back to valid in-memory presentation without
creating a project error. Initial fallback loading never writes defaults over absent or malformed
storage; persistence occurs only after a shell-originated state change.

Application feedback stays outside package-private DOM. Completion errors, terminal state, pending
commit presentation, and contextual pane content use public workspace composition seams and
application-labelled live regions.
