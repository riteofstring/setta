# Realtime frontend design rationale

This document owns current non-local rationale for the `realtime-frontend` module. Public browser
behavior belongs in `apps/realtime/README.md`.

## Canonical projection

The Go project snapshot is authoritative for project identity, revision, section records, forest,
authored layout, bindings, runtime declaration, and durable configuration. React validates each
external snapshot with generated Ajv standalone validators and projects one complete value into
one `@setta/workspace` host. It does not maintain a second authored store or merge separately
delivered section and forest fragments.

The browser owns pointer-rate input, focus, drafts, drawing interaction, and other disposable view
state. A durable mutation is sent only at a coherent commit boundary with the observed project
identity and revision. Conflicts fetch or await the newest complete snapshot and remain explicit;
the client does not replay a mutation against state the user did not edit.

The Realtime app supplies its own section kinds and product providers through Workspace's public
registries. Realtime section implementations remain app-owned until another concrete consumer
requires an identical contract. Workspace continues to own outer canvas, windowing, section
chrome, document validation, and composition.

## Runtime delivery

One EventSource owns complete authored snapshots. One WebSocket owns the current runtime snapshot,
events, invocation status, streamed updates, bounded logs, and structured failures. Browser
reconnection is state replacement: it receives current complete project and runtime state without
listener replay, polling, force refresh, or locally reconstructed queues.

Every outgoing event is tied to an exact source section and event name. Every update is tied to a
session, binding, and invocation. The frontend applies only host-authorized current outputs and
never infers applicability from arrival order. Binary data travels through the shared HTTP content
path, while runtime messages contain content references.

## Sections and presentation

The initial catalog contains bounded input, output, button, status, and drawing sections. Inputs
commit authored values at their documented boundaries. Buttons emit explicit actions. Output and
status sections render only canonical session values and invocation state addressed by declared
binding outputs.

The drawing section uses one exact-pinned Fabric.js release for its retained objects, hit testing,
brushes, erasing, selection, transforms, serialization, filters, and raster export. Setta owns the
section shell, canonical scene encoding, durable gesture boundary, event name, content upload, and
snapshot coalescing. Pointer movement stays local. One coherent completed gesture persists the
vector scene, and one settled raster snapshot may emit by content reference. The outer Workspace
canvas remains its existing upstream XYFlow projection.

Ordinary use has a presentation-focused surface that preserves authored layout while hiding
authoring controls. It is another projection of the same canonical document and section registry,
not a separate project format or Python-authored UI tree.

## Generated validation boundary

TypeScript contract declarations, representative fixtures, and Ajv standalone validation modules
are generated from the Go-owned schemas. Runtime application code imports the generated validators
and receives typed validated values; it does not carry a parallel handwritten parser. Generation
is deterministic and drift-checked in repository verification.

Fabric.js and Ajv are direct exact-pinned production dependencies only after their selected
releases pass dependency review. Realtime retains the repository's existing React, Zustand,
Radix, and Workspace foundations and adds no second frontend state system.
