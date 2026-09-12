# Realtime frontend design rationale

This document owns current non-local rationale for the `realtime-frontend` module. Public browser
behavior belongs in `apps/realtime/README.md`.

## Canonical projection

The Go project snapshot is authoritative for project identity, revision, section records, forest,
authored layout, bindings, runtime declaration, and durable configuration. React validates each
external snapshot with generated Ajv standalone validators and projects one complete value into
one `@setta/workspace` host. It does not maintain a second authored store or merge separately
delivered section and forest fragments.

The browser owns pointer-rate input, active selection, minimized presentation, focus, drafts,
drawing interaction, and other disposable view state. Project projection retains that state across
canonical backend snapshots. A durable mutation is sent only at a coherent commit boundary with
the observed project identity and revision. Conflicts fetch or await the newest complete snapshot
and remain explicit; the client does not replay a mutation against state the user did not edit.
The HTTP mutation response and project EventSource may deliver the same revision in either order;
an already accepted revision is an acknowledgement, not a second projection.

The Realtime app supplies its own section kinds and product providers through Workspace's public
registries. Realtime section implementations remain app-owned until another concrete consumer
requires an identical contract. Workspace continues to own outer canvas, windowing, section
chrome, document validation, and composition.

Source authoring follows the same authority boundary. A project may project its declared runtime
entrypoint through one optional `code` section whose closed data is exactly
`{"source":"entrypoint"}`. The entrypoint file remains canonical. A disposable local Workspace
document may hold the source draft and editor undo state, but Realtime strips those bytes when it
projects authored state back to Go. The source, content version, draft, diagnostics, dirty state,
and activation state never enter `project.json`. Canonical project SSE reprojection preserves a
dirty local draft instead of overwriting or persisting it.

## Runtime delivery

One EventSource owns complete authored snapshots. One WebSocket owns the current runtime snapshot,
events, invocation status, streamed updates, bounded logs, and structured failures. Browser
reconnection is state replacement: it receives current complete project and runtime state without
listener replay, polling, force refresh, or locally reconstructed queues.

Every outgoing event is tied to an exact source section and event name. Every update is tied to a
session, binding, and invocation. The frontend applies only host-authorized current outputs and
never equates newest submitted status with newest publishable output. Runtime snapshots provide a
published identity per binding. The browser may therefore apply a completed output while a newer
invocation is queued, while still rejecting an output older than the host's published watermark.
Binary data travels through the shared HTTP content path, while runtime messages contain content
references.

Realtime reads source through the same-origin-readable `GET /api/v1/runtime/source` and applies it
through an exact-origin `PUT` to the same path. It owns the source document, local draft, dirty comparison, apply
serialization, version conflict, diagnostics, and the distinction between saved source and live
activation. Typing never writes or reloads. The visible **Apply** action, whose tooltip names the
complete **Apply & reload** operation, and Mod-Enter invoke the same one operation. Its result
reports activation as `activated` or `rejected`, while runtime WebSocket state
independently reports the worker as `starting`, `ready`, or `failed`, without a browser
refresh. A failed activation leaves the editor clean against the accepted saved version, marks the
runtime failed, and keeps the diagnostic visible for a corrected Apply or global Reload. The HTTP
source action remains available while that runtime socket is unavailable because it is also the
recovery path. A stale-version response refreshes the canonical comparison baseline without
discarding the local draft.

## Sections and presentation

The initial catalog contains bounded input, output, button, status, drawing, and optional singular
code sections. Inputs commit authored values at their documented boundaries. Buttons emit explicit
actions. Output and status sections render only canonical session values and invocation state
addressed by declared binding outputs. The code section has no binding event or output semantics;
it is an editor projection of the declared entrypoint.

Workspace owns a reusable controlled Code editor, generic native header-action placement and
styling, and the Mod-Enter key seam. Realtime supplies the draft value, action, disabled state,
Python presentation, network behavior, and runtime meaning. This keeps Workspace source-agnostic
while giving the Code section the same header controls, focus behavior, accessibility, light mode,
and dark mode as native sections.

The drawing section uses one exact-pinned Fabric.js release for its retained objects, hit testing,
brushes, erasing, selection, transforms, serialization, filters, history, and raster export. Setta
owns the section shell, canonical scene encoding, durable gesture boundary, event name, content
upload, and snapshot coalescing. Canvas gestures do not activate or reorder the outer Workspace
section or trigger its transient pressed outline. Primary pointer drag remains local to Fabric,
while wheel input over the non-scrolling drawing stage remains available to Workspace panning. A
completed gesture persists one coherent vector scene. The Code editor similarly retains pointer
selection while Workspace receives a wheel axis on which the editor has no native overflow.

The visible Fabric scene is browser-authoritative from the first local change until the matching
durable scene is acknowledged. Canonical scenes hydrate only while that local state is clean, so a
delayed project snapshot cannot resurrect erased objects or replace a newer stroke. Scene hydration
keeps the prior lower-canvas frame visible until object enlivening completes, restores Fabric's
interaction state after superseded loads, and renders the settled frame synchronously.

The drawing's logical width, height, and object coordinates are content state, distinct from the
outer Workspace section size. Resizing the outer section changes only the available viewport; the
logical canvas remains centered and uniformly contain-fitted without a scene mutation, snapshot,
or aspect-ratio lock on the section frame. The regular section surface continues through non-drawable
letterbox space, while a non-sizing artboard edge distinguishes it from the canvas without adding
canvas padding. The drawing section contributes explicit canvas controls to the right-side Inspector.
Width and height start proportionally linked but may be unlinked. One Apply either keeps artwork
dimensions and translates objects from a selected nine-point anchor, or scales object positions and
dimensions with the new bounds. The resulting dimensions and scene are one drawing history entry and
one durable settlement, so undo and redo restore them together and a delayed canonical acknowledgement
cannot split their authority.

Fit frame to canvas is a one-shot layout action, not a persistent constraint. It measures the
section chrome and the drawing toolbar at the target width before changing the outer section once,
so toolbar wrapping does not leave accidental padding. Image content references rendered by output
sections use centered contain fitting and never mutate their source pixels when the outer section
changes. A dedicated image section is not part of the current section catalog.

When every matching binding uses `latest` with zero debounce, the browser treats its invocation
status as one local completion-paced capacity credit. It captures and uploads the first eligible
preview immediately and consumes the credit after a successful event send. While occupied,
pointer movement records only one dirty preview marker and performs no raster capture or upload.
A terminal matching invocation replenishes the credit and drains the newest state. Settling clears
obsolete preview work, retains one final raster until it can be sent, and gives that final work
priority when capacity returns. The Go scheduler remains the correctness boundary; browser
admission only avoids waste for the current single-owner local product. With multiple matching
bindings, the capacity credit returns after every binding is terminal. Their results may still
publish independently, and distinct concurrency groups allow independent scheduler admission.

Other policies retain the bounded fixed preview timer. Completion-paced work does not use an EWMA
or another estimate because completion itself supplies capacity feedback. Generator updates remain
the existing progressive-output path; the frontend adds no typed preview/final transport, result
cache, batching layer, or Python authoring SDK. The outer Workspace canvas remains its existing
upstream XYFlow projection.

Realtime renders one ordinary, editable `WorkspaceShell`, Workspace host, section registry,
section chrome, and upstream XYFlow canvas. It retains Workspace's native section selection,
movement, resizing, locking, minimization, naming, and Inspector instead of introducing an app
mode or presentation adapter. Realtime does not wrap the Workspace in a second product header;
connection and runtime actions live in the Workspace Runtime tab instead of reserving a full-width
row.

## Generated validation boundary

TypeScript contract declarations, representative fixtures, and Ajv standalone validation modules
are generated from the Go-owned schemas. Runtime application code imports the generated validators
and receives typed validated values; it does not carry a parallel handwritten parser. Generation
is deterministic and drift-checked in repository verification.

Fabric.js and Ajv are direct exact-pinned production dependencies only after their selected
releases pass dependency review. Realtime retains the repository's existing React, Zustand,
Radix, and Workspace foundations and adds no second frontend state system.
