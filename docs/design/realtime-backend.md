# Realtime backend design rationale

This document owns current non-local rationale for the `realtime-backend` module. Public CLI,
project, and runtime behavior belongs in `apps/realtime/README.md`.

## Ownership and dependency direction

The Realtime backend is a standalone Go control plane. It owns the authored project aggregate,
strict transport contracts, persistence, publication, scheduling, artifacts, worker lifecycle, and
the language-neutral worker protocol. It does not import Python Canvas project, coordinator,
renderer, listener, or transport packages. Shared local-host or process code may be extracted only
after both applications require an identical contract; product aggregates and routes remain with
their applications.

The browser supplies interaction events and disposable presentation state. The worker supplies
handler execution and process-lifetime resources. Neither is an authority for project revisions,
binding scheduling, invocation applicability, or adopted artifacts.

## Authored project authority

The project directory contains `.local/realtime/project.json` and `app.py`, plus optional ordinary
Python project metadata. The versioned project document is closed and contains only stable project
identity, revision, the complete section forest, authored section data and layout, a runtime
declaration, bindings, and durable application configuration. It never stores discovered handlers,
listener state, queues, active invocations, logs, generated artifacts, browser pointers, or
connection state.

The checked-in Signal Bloom example is an immutable project fixture rather than the live
playground root.
The repository-local launcher copies that fixture into an ignored working directory and the
backend reads and writes only the copy. This keeps callback source, drawing state, content, worker
staging, and future runtime-owned files out of the tracked source tree without changing ordinary
Realtime project ownership. The fixture's exact-pinned Pillow dependency remains ordinary Python
project metadata and is installed only into the ignored working project's environment.

A project may contain zero or one `code` section. Its closed data is exactly
`{"source":"entrypoint"}`: the section projects the file selected by `runtime.entrypoint` and does
not own source. The declared entrypoint, currently `app.py`, is the sole source authority. Source
bytes, versions, drafts, diagnostics, and activation state never enter the project document.

Each binding has exactly one app-owned `handler` section whose closed data contains its binding ID.
The handler section is an authoring and runtime-state projection, not another source authority. The
project contract enforces the one-to-one relationship; deleting either side removes the other and
prunes incident pipeline relationships in the same validated mutation.

Creation is exclusive. Loading rejects unknown fields, invalid unions, incompatible versions, and
missing required state. A mutation checks project identity and expected revision, constructs and
validates one complete candidate, writes replacement bytes through a synced sibling on the same
filesystem, and atomically renames it. Success increments the revision once and publishes the
complete snapshot once; conflict and persistence failure leave canonical state unchanged. The
shared `local-backend/projectfs` boundary owns the confined, bounded, synchronized file mechanics;
Realtime retains the project aggregate, validation, revision, and publication rules.

Each binding names one exact handler, resolved argument expressions, logical outputs, a scheduling
policy, an optional materialization policy, and one closed trigger variant: source-section `event`,
all-input runtime `join`, or authoring-state `disconnected`. A join input references one named
logical output of another binding. Logical outputs may independently target a display field; an
intermediate output needs no section sink. Go resolves event and section expressions from one frozen
root event and canonical project snapshot before enqueueing. Display names never become aliases or
identities. Materialization independently chooses whether the last successful outputs remain
session-only or survive runtime restarts, and whether startup runs the binding always, only when its
compute fingerprint is stale, only when no retained result exists, or only after an interaction.

Contract validation compiles the bindings into deterministic topological, parent, child,
descendant, reachability, and root-ancestry indexes. It rejects missing bindings or output ports,
self-edges, cycles, orphan joins, and joins with ambiguous root events. Version 2 introduced this
closed project shape; public HTTP routes remain under `/api/v1`.

## Browser transports

Revision-checked HTTP commands mutate durable state. A server-sent event subscription immediately
receives the current complete project snapshot and subsequently receives the newest complete
snapshot after each accepted mutation. Slow subscribers may skip superseded snapshots, and
reconnection catches up without replay or force-refresh state.

The shared `local-backend/latestvalue` boundary owns that authored-project subscription behavior.
Runtime WebSocket envelopes remain Realtime-owned: they carry a bounded sequence of snapshots,
invocations, updates, logs, and errors, and overflow deliberately replaces queued events with a
complete runtime snapshot for resynchronization rather than treating arbitrary events as one
coalescible value.

One WebSocket carries closed runtime messages for the current runtime snapshot, interaction and
startup events, invocation status, streamed updates, structured errors, and bounded logs.
Reconnection starts with the complete current runtime snapshot. Every invocation and result carries
session, run, binding, invocation, and sequence identity. Runtime snapshots carry discovered
handlers, current invocation status, the published identity for each binding, and which bindings
are currently showing a retained result. Reconnect and slow-subscriber snapshot replacement thus
preserve both graph-node availability and the distinction between submitted work and applied
output.

Large binary values use one HTTP content store. WebSocket and worker messages carry validated
content references. The coordinator rescopes the frozen root payload to its run, gives every
consumer an invocation-owned clone, and deletes unprotected intermediates when the run becomes
terminal. Published values and retained materializations remain protected until replaced. Paths,
encoded binary payloads, and arbitrary URLs are not alternate content channels.

The Go contract definitions own JSON Schema for project, HTTP, WebSocket, artifact, and worker
documents. Generated browser declarations and Ajv standalone validators derive from those schemas;
Go strictly decodes the same closed shapes. The offline `realtime schema` document includes the
source read, apply request, and apply result schemas beside the other public contracts.

## Live entrypoint source

The `GET /api/v1/runtime/source` response is the closed document
`{projectId, entrypoint, version, source}`. It permits the missing Origin produced by an ordinary
same-origin browser read and rejects any supplied foreign Origin; loopback Host enforcement and the
browser's same-origin read policy protect the side-effect-free response. The mutating
`PUT /api/v1/runtime/source` requires the exact configured Origin and accepts the closed document
`{projectId, entrypoint, expectedVersion, source}`. Both operations bind the request to the current
project and its normalized declared entrypoint; callers cannot select another path. The opaque
version hashes the exact file bytes and is independent of the project revision.

Reads and writes accept only bounded valid UTF-8. A write compares `expectedVersion` against the
current bytes, then writes through a synced sibling and atomically renames it. Conflict, invalid
encoding, size overflow, entrypoint mismatch, and path or symlink escape leave the file and runtime
unchanged. An accepted compare-and-swap saves the source before activation. Its result reports the
saved source document separately from the `activated` or `rejected` activation outcome. Runtime
WebSocket state independently reports `starting`, `ready`, or `failed`; persistence success never
implies that the new code is live. `projectfs` supplies confinement, staging, replacement, and
directory synchronization while Realtime performs the authoritative version recheck between stage
and commit.

## Scheduling and runtime state

Scheduling exists only in Go. All selected pipeline nodes are reserved before roots are released;
joins enter `waiting` until their dependencies complete. Waiting, queued, debounced, and running
work all participate in binding admission. `once` admits no concurrent lineage, `latest` runs at
most one invocation for a binding and keeps at most one pending lineage, and `parallel` admits only
the explicit limit. The one `latest` pending slot covers waiting, queued, and debounced work, so a
delayed candidate cannot hide behind another candidate. Bindings may share a concurrency group; the
effective limit is the lowest declared member limit and every queue is bounded. If reserving a
valid graph exceeds queue capacity, the complete event admission rolls back and returns an error;
it never executes a truncated graph.

`latest` with zero debounce is the completion-paced automatic policy. Idle work starts immediately.
Input arriving while it runs replaces only pending work, and completion releases the binding slot
for the newest retained input. Running work is not cancelled or marked superseded merely because a
newer event arrived. The scheduler reports the exact pending invocation it replaced so the
coordinator can mark that invocation `superseded` without inferring task state from submission
order. A nonzero debounce remains a deliberate trailing admission delay.

Each accepted root event creates one run with a frozen payload and project revision, then selects
every reachable binding. Distinct concurrency groups admit fan-out handlers concurrently, and each
binding publishes display updates as soon as they arrive. An all-input join is the deliberate
cross-binding completion barrier: it becomes runnable only after every referenced producer in the
same run completes successfully and provides the declared output. Producer completion uses
accumulated streamed and final outputs, so a generator's empty final return does not erase its
latest yielded value. The Signal Bloom fixture prepares one reusable drawing artifact, fans it out
to SVG and Pillow renderers, then joins those exact lineage-matched results and their preparation
metadata in a poster compositor.

Each binding keeps separate highest-submitted and highest-published identities. Invocation status
follows submitted work. An active invocation's update or final output remains publishable while a
newer invocation is pending, provided its sequence is not older than the published-output
watermark. Publishing a newer output advances that watermark and prevents any later older output
from regressing target values. Progress or message-only updates remain observable without
advancing the output watermark. Complete runtime snapshots include published identities.

Every worker update also carries a contiguous invocation-local `updateSequence`, and invocation
completion reports `updateCount`. The coordinator waits for exactly that complete sequence before
making success visible to downstream joins. A gap, duplicate, wrong identity, or late update cannot
release or publish into an invalid lineage.

Authored project state is durable and revisioned. Runtime values are JSON-compatible and Go-owned.
Session-retained values live only in the current runtime snapshot. A binding configured for
last-successful retention also stores one atomic runtime-owned materialization beneath
`.local/realtime`, outside `project.json`; its scalar outputs and recursively referenced content
are restored before worker startup so a failed or unavailable refresh does not erase the last
usable result. A materialization is replaced only after successful handler completion, never from
an incomplete stream or failed invocation. Retained content is copied into the current session
content store and receives fresh content-reference identities. A retained result can satisfy a
startup dependency only when its fingerprint matches and the coordinator adopts it into the new run
lineage. Stale `ifMissing` ancestry blocks the affected branch instead of mixing values from
different computations. Corrupt or missing retained state is treated as unavailable rather than
authored project corruption. Applying a project reconciles removed or retargeted published values
and protected content before publishing the replacement snapshot. Process resources remain
worker-owned for one worker lifetime, and browser interaction state remains local and disposable.

Cancellation removes queued work or requests cooperative cancellation from an active worker and
marks all unstarted descendants `blocked`. Failure and supersession do the same; an already active
descendant receives cooperative cancellation. Project replacement, source activation, reload, and
coordinator shutdown invalidate every affected run before replacing scheduling or worker state.
Every late update is checked against its still-current invocation and run. Timeout or hard stop
replaces the complete worker because arbitrary synchronous Python or native code cannot be safely
interrupted in process. Observable status distinguishes waiting, blocked, queued cancellation,
cooperative completion, timeout, worker crash, and host-forced replacement.

Handler completion provides the adaptive feedback signal; the scheduler does not estimate runtime
with an EWMA. Generator and async-generator updates remain the progressive-output contract, and
normal invocation completion remains its final and materialization boundary. A startup event is a
state-initialization signal rather than a user interaction. Go remains authoritative for its
policy and provisionally claims each target before its dependencies run, preventing duplicate
startup lineages while allowing a target that was never reached to retry. The claim identity covers
the target's complete ancestor binding graph. Each eligible target selects its required ancestors,
its reachable descendants, and dependencies of those descendants; unrelated sibling branches do
not run. The coordinator compares a stable fingerprint of the active entrypoint version, handler,
and normalized resolved arguments for `whenStale`. Automatic startup is valid only for bindings
whose compiled root ancestry is `change` or `snapshot`. General deterministic result memoization,
cross-session batching, typed preview/final messages, and a Python scheduling SDK are not part of
this design.

## Worker boundary

The private versioned worker protocol is JSON-RPC 2.0 over Language Server Protocol
`Content-Length` framing on a dedicated inherited channel. Application stdout and stderr are
separate bounded logs and can never enter framing bytes. `initialize` negotiates the protocol;
`runtime/invoke` carries identity, handler, values, and staged references; `runtime/update`
notifications stream progress and outputs with `updateSequence`; the invocation result reports
`updateCount`; `$/cancelRequest` requests cooperative cancellation; and `shutdown` starts bounded
cleanup. The private worker and browser runtime contract families are version 2 so run lineage and
the update completion barrier are explicit rather than inferred.

JSON values and validated content references are the complete portable value set. Python
exceptions become structured errors. Pickle, Python objects, modules, callables, and frontend
objects never cross the contract. A conformance harness exercises the same lifecycle against the
packaged Python bootstrap and a minimal non-Python fixture worker.

The Python bootstrap is packaged by Setta and uses only the standard library for the protocol. It
runs with the already selected project interpreter so ordinary project dependencies remain
importable without installing Setta into the project environment. A dedicated source loader
compiles the declared entrypoint's current bytes directly and does not read or write its bytecode
cache; rapid equal-size edits with the same filesystem timestamp therefore cannot reactivate stale
code. Imports performed by the entrypoint retain ordinary Python import behavior. The bootstrap
loads the entrypoint once per worker lifetime, runs bounded startup and shutdown hooks, invokes
named exports, iterates generators and async generators, closes cooperative work, and reports
conversion or execution failures structurally.

## Local host and process lifetime

The shared `local-backend/localweb` boundary binds IPv4 loopback, admits only its exact listener
authority and matching `localhost` alias, applies the common response headers, confines production
assets to a canonical preflighted root, and bounds server shutdown. Realtime retains its route
tree, readiness document, and decisions about which routes require the exact configured browser
origin. API, content, SSE, and WebSocket paths never fall through to the SPA.

Containment owns lifecycle and descendant cleanup, not reduced user permissions. The worker uses
the platform process-tree boundary whose contract matches Python Canvas: Windows Job Objects,
Linux child-subreaper ownership, and the established macOS guardian restrictions. Unsupported
platforms fail closed when descendants cannot be owned. Shutdown is bounded, idempotent, and does
not report success before owned processes and staged artifacts are gone.

Source activation deliberately performs bounded destructive replacement: the coordinator stops
the current worker and its owned descendants before launching the saved entrypoint. It does not
overlap old and new workers because model, GPU, device, memory, and other resourceful runtimes can
otherwise consume resources twice and repeat process-lifetime side effects. Runtime snapshots
publish `starting`, `ready`, or `failed`. If startup fails, the accepted bytes remain canonical,
the worker remains failed, and the diagnostic is returned and published; the user can apply a
corrected source or invoke the global reload after an external correction.

## Public coordinator commands

`schema`, `snapshot`, `apply`, `reload`, and `invoke` call the same coordinator used by HTTP and
WebSocket handlers. `apply` is revision checked; `open` performs one initial `reload` before it
presents the browser; later `reload` commands explicitly replace the worker after validating the
current entrypoint; `invoke` runs one named handler with bounded test input. The source endpoint is
the only browser write path for the declared entrypoint. Dependency installation remains an
ordinary project-environment operation. There is no listener discovery, dependency catalog,
autosave, implicit reload after ordinary filesystem edits, temporary ID, coverage, share-session,
or force-refresh path.
