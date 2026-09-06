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
invocation identity. Only the newest applicable invocation may update a target.

Large binary values use one HTTP content store. WebSocket and worker messages carry validated
content references. References are scoped to their owning invocation until the host deliberately
adopts an output. Paths, encoded binary payloads, and arbitrary URLs are not alternate content
channels.

The Go contract definitions own JSON Schema for project, HTTP, WebSocket, artifact, and worker
documents. Generated browser declarations and Ajv standalone validators derive from those schemas;
Go strictly decodes the same closed shapes.

## Scheduling and runtime state

Scheduling exists only in Go. `once` admits no concurrent duplicate, `latest` keeps at most one
pending event while active work runs, and `parallel` admits only the explicit limit. Bindings may
share a concurrency group; the effective limit is the lowest declared member limit and every queue
is bounded. Debounce replaces an unstarted event with the newest complete event.

Authored project state is durable and revisioned. Runtime session values are JSON-compatible,
Go-owned, and present in the current runtime snapshot. Process resources are worker-owned and live
only for one worker lifetime. Browser interaction state is local and disposable. No scope silently
stands in for another after reload or reconnect.

Cancellation removes queued work and requests cooperative cancellation from an active worker.
Timeout or hard stop replaces the complete worker because arbitrary synchronous Python or native
code cannot be safely interrupted in process. Observable status distinguishes queued cancellation,
cooperative completion, timeout, worker crash, and host-forced replacement.

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
importable without installing Setta into the project environment. It imports the declared
entrypoint once per worker lifetime, runs bounded startup and shutdown hooks, invokes named
exports, iterates generators and async generators, closes cooperative work, and reports conversion
or execution failures structurally.

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

## Public coordinator commands

`schema`, `snapshot`, `apply`, `reload`, and `invoke` call the same coordinator used by HTTP and
WebSocket handlers. `apply` is revision checked; `open` performs one initial `reload` before it
presents the browser; later `reload` commands explicitly replace the worker after validating the
current entrypoint; `invoke` runs one named handler with bounded test input. Source editing and
dependency installation remain ordinary filesystem and project-environment operations. There is
no listener discovery, dependency catalog, implicit reload after source edits, temporary ID,
coverage, share-session, or force-refresh path.
