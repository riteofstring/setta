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

The checked-in Neon example is an immutable project fixture rather than the live playground root.
The repository-local launcher copies that fixture into an ignored working directory and the
backend reads and writes only the copy. This keeps callback source, drawing state, content, worker
staging, and future runtime-owned files out of the tracked source tree without changing ordinary
Realtime project ownership.

A project may contain zero or one `code` section. Its closed data is exactly
`{"source":"entrypoint"}`: the section projects the file selected by `runtime.entrypoint` and does
not own source. The declared entrypoint, currently `app.py`, is the sole source authority. Source
bytes, versions, drafts, diagnostics, and activation state never enter the project document.

Creation is exclusive. Loading rejects unknown fields, invalid unions, incompatible versions, and
missing required state. A mutation checks project identity and expected revision, constructs and
validates one complete candidate, writes replacement bytes through a synced sibling on the same
filesystem, and atomically renames it. Success increments the revision once and publishes the
complete snapshot once; conflict and persistence failure leave canonical state unchanged.

Each binding names one exact source section event, one exact handler, resolved argument
expressions, declared outputs, and a scheduling policy. Go resolves arguments from one event and
one canonical state snapshot before enqueueing. Display names never become aliases or identities.

## Browser transports

Revision-checked HTTP commands mutate durable state. A server-sent event subscription immediately
receives the current complete project snapshot and subsequently receives the newest complete
snapshot after each accepted mutation. Slow subscribers may skip superseded snapshots, and
reconnection catches up without replay or force-refresh state.

One WebSocket carries closed ephemeral messages for the current runtime snapshot, events,
invocation status, streamed updates, structured errors, and bounded logs. Reconnection starts with
the complete current runtime snapshot. Every event and result carries session, binding, and
invocation identity. Runtime snapshots carry both current invocation status and the published
identity for each binding, allowing reconnect and slow-subscriber snapshot replacement to preserve
the distinction between submitted work and applied output.

Large binary values use one HTTP content store. WebSocket and worker messages carry validated
content references. References are scoped to their owning invocation until the host deliberately
adopts an output. Paths, encoded binary payloads, and arbitrary URLs are not alternate content
channels.

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
implies that the new code is live.

## Scheduling and runtime state

Scheduling exists only in Go. `once` admits no concurrent duplicate, `latest` runs at most one
invocation for a binding and keeps at most one pending event, and `parallel` admits only the
explicit limit. The one `latest` pending slot covers both queued and debounced work, so a delayed
candidate cannot hide behind another queued candidate. Bindings may share a concurrency group;
the effective limit is the lowest declared member limit and every queue is bounded.

`latest` with zero debounce is the completion-paced automatic policy. Idle work starts immediately.
Input arriving while it runs replaces only pending work, and completion releases the binding slot
for the newest retained input. Running work is not cancelled or marked superseded merely because a
newer event arrived. The scheduler reports the exact pending invocation it replaced so the
coordinator can mark that invocation `superseded` without inferring task state from submission
order. A nonzero debounce remains a deliberate trailing admission delay.

Each binding keeps separate highest-submitted and highest-published identities. Invocation status
follows submitted work. An active invocation's update or final output remains publishable while a
newer invocation is pending, provided its sequence is not older than the published-output
watermark. Publishing a newer output advances that watermark and prevents any later older output
from regressing target values. Progress or message-only updates remain observable without
advancing the output watermark. Complete runtime snapshots include published identities.

Authored project state is durable and revisioned. Runtime session values are JSON-compatible,
Go-owned, and present in the current runtime snapshot. Process resources are worker-owned and live
only for one worker lifetime. Browser interaction state is local and disposable. No scope silently
stands in for another after reload or reconnect.

Cancellation removes queued work and requests cooperative cancellation from an active worker.
Timeout or hard stop replaces the complete worker because arbitrary synchronous Python or native
code cannot be safely interrupted in process. Observable status distinguishes queued cancellation,
cooperative completion, timeout, worker crash, and host-forced replacement.

Handler completion provides the adaptive feedback signal; the scheduler does not estimate runtime
with an EWMA. Generator and async-generator updates remain the progressive-output contract, and
normal invocation completion remains its final boundary. Automatic handler cancellation, graph
invalidation, deterministic result caching, cross-session batching, typed preview/final messages,
and a Python scheduling SDK are separate contracts and are not part of this design.

## Worker boundary

The private versioned worker protocol is JSON-RPC 2.0 over Language Server Protocol
`Content-Length` framing on a dedicated inherited channel. Application stdout and stderr are
separate bounded logs and can never enter framing bytes. `initialize` negotiates the protocol;
`runtime/invoke` carries identity, handler, values, and staged references; `runtime/update`
notifications stream progress and outputs; `$/cancelRequest` requests cooperative cancellation;
and `shutdown` starts bounded cleanup.

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

The HTTP server binds IPv4 loopback and admits only its exact listener authority and matching
`localhost` alias. Origin-sensitive routes validate the exact configured browser origin. API,
content, SSE, and WebSocket paths never fall through to the SPA. Production assets must be regular,
non-symlink files within a canonical validated root before a live session is published.

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
