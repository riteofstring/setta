# Realtime frontend design rationale

This document owns current non-local rationale for the `realtime-frontend` module. Public browser
behavior belongs in `apps/realtime/README.md`.

## Canonical projection

The Go project snapshot is authoritative for project identity, revision, section records, forest,
authored layout, bindings, runtime declaration, and durable configuration. React validates each
external snapshot with generated Ajv standalone validators and projects one complete value into
one `@riteofstring/setta` host. It does not maintain a second authored store or merge separately
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

Realtime projects its bindings into Workspace's generic controlled graph API. Source-section event
ports and handler trigger ports use the workflow family; handler inputs, outputs, and display sinks
use the data family. Realtime derives deterministic ports and edges from the canonical project and
converts connect, reconnect, and delete gestures back into serialized project operations. Workspace
graph records remain disposable view data and never enter `project.json`; Go validates the complete
result and remains final graph authority.

Source authoring follows the same authority boundary. A project may project its declared runtime
entrypoint through one optional `code` section whose closed data is exactly
`{"source":"entrypoint"}`. The entrypoint file remains canonical. A disposable local Workspace
document may hold the source draft and editor undo state, but Realtime strips those bytes when it
projects authored state back to Go. The source, content version, draft, diagnostics, dirty state,
and activation state never enter `project.json`. Canonical project SSE reprojection preserves a
dirty local draft instead of overwriting or persisting it.

Each binding has one app-owned `handler` section whose closed data contains only `bindingId`. It is
the graph and runtime-state projection of an independently scheduled callback. It is deliberately
different from the optional code section, which edits the single shared entrypoint and has no
trigger, input, or output ports.

## Runtime delivery

One EventSource owns complete authored snapshots. One WebSocket owns the current runtime snapshot,
events, invocation status, streamed updates, bounded logs, and structured failures. Browser
reconnection is state replacement: it receives current complete project and runtime state without
listener replay, polling, force refresh, or locally reconstructed queues.

Every outgoing event is tied to an exact source section and event name and declares whether it came
from a user interaction or startup initialization. Stateful input and drawing sections emit at
most one startup event for each eligible binding-and-ancestor configuration in a ready runtime
session; a changed upstream graph creates a new initialization claim. This includes automatic joins
whose compiled root is `change` or `snapshot`; the Go host remains authoritative for policy,
adoption, and deduplication. Every update is tied to a session, run, binding, invocation, and
invocation-local update sequence. The frontend applies only host-authorized current outputs and
never equates newest submitted status with newest publishable output. Runtime snapshots provide a
published identity per binding, discovered handler names, and outputs restored from last-successful
materialization.
The browser may therefore apply a completed output while a newer invocation is queued, while still
rejecting an output older than the host's published watermark. Presentation and output updates keep
separate sequence watermarks, so a duplicate older-invocation output cannot be accepted merely
because a newer invocation owns the visible progress state. Binary data travels through the shared
HTTP content path, while runtime messages contain content references.

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

The catalog contains bounded input, output, button, status, drawing, handler, and optional singular
code sections. Inputs commit authored values at their documented boundaries. Buttons emit explicit
actions. Output and status sections render only host-canonical runtime values and invocation state
addressed by declared binding outputs. A retained value remains visible while startup refresh runs
or fails and is labeled as a saved result until a successful current-session result replaces it.
An eligible output with no value presents its initialization state rather than an unexplained empty
surface. The code section has no binding event or output semantics; it is an editor projection of
the declared entrypoint.

A handler section presents the selected handler and its discovery state, named input and output
ports, current run ID, queued, waiting, running, streaming, completed, blocked, failed, or cancelled
state, progress, message, error, and a contextual Cancel action. Its Inspector owns handler name,
argument JSON, logical output names, scheduling, and materialization. Draft validation mirrors the
contract's identifier, reference, count, and scheduling bounds before submitting one mutation. The
Runtime pane lists discovered entrypoint handlers and creates a disconnected binding and matching
handler section in one revision-checked mutation.

Graph edits are serialized so one project revision is in flight at a time. Workspace passes
reconnect candidates to Realtime with the replaced edge ID, allowing validation against the final
graph rather than the still-projected old edge. Reconnecting preserves automatic materialization
when the final root remains eligible and prunes only downstream inputs made invalid by changed root
ancestry. Reconnecting to a `press` or `submit` root clamps automatic materialization to `manual`.
Removing an event edge leaves the handler disconnected. Removing a producer, output port, or join
edge removes the exact join inputs, restores their ordinary argument placeholders as `null` when
the argument limit permits, and recursively disconnects joins with no remaining producer. Local
checks reject incompatible port families, occupied targets, self-connections, cycles, and ambiguous
root ancestry before the backend performs final validation.

Workspace owns a reusable controlled Code editor, generic native header-action placement and
styling, and the Mod-Enter key seam. Realtime supplies the draft value, action, disabled state,
Python presentation, network behavior, and runtime meaning. This keeps Workspace source-agnostic
while giving the Code section the same header controls, focus behavior, accessibility, light mode,
and dark mode as native sections.

The drawing section uses one exact-pinned Fabric.js release for retained objects, hit testing,
brushes, erasing, selection, transforms, serialization, history, and raster export.
`RealtimeDrawingRuntime` is the sole Fabric mutation boundary. Setta owns the section shell,
canonical scene encoding, durable gesture and command boundaries, event name, content upload, and
snapshot coalescing. Fabric scenes pass through JSON serialization before entering project
contracts because some built-in objects expose JavaScript-only `undefined` properties from
`toObject`. Canvas gestures do not activate or reorder the outer Workspace section or trigger its
transient pressed outline. Primary pointer drag remains local to Fabric, while bare wheel input
over the non-scrolling drawing stage remains available to Workspace panning. The Code editor
similarly retains pointer selection while Workspace receives a wheel axis on which the editor has
no native overflow.

The compact drawing toolbar chooses Select, Pen, Highlighter, Eraser, and Text modes, groups line,
arrow, rectangle, and ellipse placement in one Setta-styled **Line & shape** menu, and retains only
image insertion and history as direct actions. The undoable **Clear drawing** command is a
destructive Canvas action in the Inspector. Text placement consumes one click; shape
placement uses the user's drag geometry with the initial press and current pointer as opposite
corners. Both return to Select after creation instead of adding objects at a default location.
Contextual toolbar controls expose Pen and Highlighter color and width, text and line color, and
shape fill and stroke while the corresponding creation tool is active. After placement returns to
Select, the same paint controls show and edit concrete colors supported by the current selection.
Mixed or disabled paint values and less common appearance properties remain explicit in the
Inspector instead of being approximated by a toolbar swatch. The highlighter icon includes its
active translucent color so it remains distinct from Pen before activation. The highlighter is a
retained translucent path with a uniform width. Variable-width pressure would require a separately
designed outlined-path representation; changing a `PencilBrush` width during a gesture would still
serialize only one uniform width and is therefore not presented as pressure support.

Detailed selection properties and structural commands belong in the right-side Inspector. A
host-and-section-keyed external store bridges the mounted Fabric controller to React
without putting Fabric objects or selection into Workspace state. Its stable primitive snapshots
let the Inspector mount before the drawing, represent unavailable and empty states, preserve mixed
values, survive minimization, and expose only properties shared by the current selection. The same
controller boundary handles appearance, typography, stacking, alignment, distribution,
duplication, grouping, locking, and deletion. Locked objects stay selectable so they can be
unlocked. A mixed lock selection offers one direct **Unlock all** action; geometry-changing and
destructive commands reject any partially locked selection.
The Inspector reuses Workspace disclosure cards and compact configuration rows instead of defining
a parallel control surface. **Selection** opens by default with compatible appearance, typography,
and object actions. **Arrange & align** appears only when useful and stays collapsed, as does
**Canvas**. This progressive disclosure keeps the current object properties visible while making
secondary and document-level controls discoverable without presenting them all at once.

Every coherent toolbar, Inspector, keyboard, or pointer mutation records at most one complete scene
history entry and one durable settlement. Clipboard and clone work revalidates the runtime and its
source selection after asynchronous Fabric enlivening before installing objects. Text creation
enters editing immediately, previews text changes, and settles once editing exits. Fabric's
temporary text-editing movement locks and Textbox's default scaling-flip lock are not interpreted
as user object locks; explicit locks still set the complete retained lock set. Object movement,
including freehand paths and text, previews at pointer rate and has a pointer-up settlement fallback
when Fabric omits `object:modified`. Selection, active tool, clipboard, and editing state remain
disposable browser state and do not enter the canonical scene.

The drawing stage owns shortcuts only after it has focus. Its resolver handles commands that are
currently available, stops those events before Workspace, and otherwise yields. Editable controls
and Fabric's hidden text editor always retain native keyboard and clipboard behavior. This makes
drawing undo, clipboard, grouping, deletion, selection, and nudging local without adding an
application-wide mode.

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

The inner drawing viewport always recomputes one uniform contain scale from logical and stage
dimensions. It has no independent zoom or pan state because upstream XYFlow already owns workspace
navigation. A pointer-neutral grid layer sits between Fabric's lower and upper canvases, follows
the same logical scale, and is absent from scene serialization and raster export. Grid visibility
and optional logical-coordinate snapping live with canvas controls in the right-side Inspector.
They are disposable state: neither changes the project revision, drawing history, backing-store
dimensions, or outer Workspace viewport.

Fit frame to canvas is a one-shot layout action, not a persistent constraint. It measures the
section chrome and the drawing toolbar at the target width before changing the outer section once,
so toolbar wrapping does not leave accidental padding. Image content references rendered by output
sections use centered contain fitting and never mutate their source pixels when the outer section
changes. A dedicated image section is not part of the current section catalog. Drawing image
insertion deliberately embeds a browser-prepared data URL in the Fabric scene rather than retaining
an ephemeral invocation content reference. The toolbar picker and a single-file drop onto the
drawing stage share that preparation boundary. A file drag gives the drawing exclusive ownership
and visibly marks the artboard; its drop point is converted through Fabric's fitted scene
coordinates, then the imported image is centered there and constrained to the logical canvas. Input
is limited to PNG, JPEG, and WebP files no larger than 20 MB; decoding honors source orientation,
the longest edge is capped at 2048 pixels, and iterative WebP encoding must fit within 600 KiB.
These bounds make the image durable with the scene without adding a project asset lifecycle.
Object-edge snapping and temporary smart guides remain outside this increment; grid snapping and
explicit alignment provide deterministic precision without pointer-rate React state or exported
guide artifacts.

Raster snapshot capture exports Fabric's lower scene canvas without its interactive upper canvas,
so selection borders, transform handles, and text cursors cannot enter settled output. Only an
active freehand preview composites the upper canvas to include the in-progress stroke, after
discarding selection state that could add controls.

When every matching binding uses `latest` with zero debounce, the browser treats its invocation
status as one local completion-paced capacity credit. It captures and uploads the first eligible
preview immediately and consumes the credit after a successful event send. While occupied,
pointer movement records only one dirty preview marker and performs no raster capture or upload.
A terminal matching invocation replenishes the credit and drains the newest state. Settling clears
obsolete preview work, retains one final raster until it can be sent, and gives that final work
priority when capacity returns. The Go scheduler remains the correctness boundary; browser
admission only avoids waste for the current single-owner local product. With multiple matching root
bindings, the capacity credit returns after every root binding is terminal. Their results may still
publish independently, and downstream joins continue under Go-owned scheduling and lineage.

Other policies retain the bounded fixed preview timer. Completion-paced work does not use an EWMA
or another estimate because completion itself supplies capacity feedback. Generator updates remain
the existing progressive-output path; the frontend adds no typed preview/final transport, general
result cache, batching layer, or Python authoring SDK. Go's contiguous update barrier, rather than
browser arrival timing, determines when a downstream join is ready.

Realtime renders one ordinary, editable `WorkspaceShell`, Workspace host, section registry,
section chrome, and upstream XYFlow canvas. It retains Workspace's native section selection,
movement, resizing, locking, minimization, naming, and Inspector instead of introducing an app
mode or presentation adapter. Realtime does not wrap the Workspace in a second product header;
connection and runtime actions live in the Workspace Runtime tab instead of reserving a full-width
row. This feature changes only Realtime's use of existing graph extension points plus Workspace's
generic replacement-aware validation callback; it adds no pipeline-specific source or persistence
to `@riteofstring/setta`.

## Generated validation boundary

TypeScript contract declarations, representative fixtures, and Ajv standalone validation modules
are generated from the Go-owned schemas. Runtime application code imports the generated validators
and receives typed validated values; it does not carry a parallel handwritten parser. Generation
is deterministic and drift-checked in repository verification.

Fabric.js and Ajv are direct exact-pinned production dependencies only after their selected
releases pass dependency review. Realtime retains the repository's existing React, Zustand,
Radix, and Workspace foundations and adds no second frontend state system.

## Playground guidance

The `project-neon-sketch` example opens an ordinary Start here shell tab. Three short challenges
frame the drawing, final poster, and editable entrypoint with Workspace's quick-start surface.
They explain automatic drawing updates versus explicit source Apply, and how to recover from an
unusable recipe. The guide has no product header, modal, separate editing mode, or runtime state.
On narrow screens its pane closes before framing the destination so the chosen section has room.
