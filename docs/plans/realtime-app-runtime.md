# Standalone Realtime App implementation plan

Status: proposed

This plan adds a `realtime` app beside Python Canvas. It lets AI author a local interactive user
interface and connect its events to arbitrary Python code. Python Canvas can help someone prototype
ordinary Python, but it is neither a runtime dependency nor a required authoring step.

## Product boundary

The first release supports one local project owner and one locally running application. It does
not include multiplayer collaboration, sharing, hosted deployment, or compatibility with the
main-branch listener API. The project consists of ordinary authored project data, Python source,
and user-selected dependencies. It introduces no additional packaging or capability-bundle
abstraction.

The runtime must support more than machine-learning calls. A handler may calculate, automate,
access project files, call a remote API, use a device library, retain an in-process resource, emit
progress, or produce an artifact. User Python runs with the current user's permissions; process
containment owns lifetime and cleanup and does not claim to be a security sandbox.

The initial acceptance scenario is deliberately concrete but not privileged in the design:

1. A drawing section emits a settled snapshot.
2. A binding invokes a Python image-stylization handler with the drawing and current controls.
3. The handler returns or streams an image.
4. A result section displays only the newest applicable result.

The same mechanism must also implement a counter with no third-party packages and a streaming
generator. Passing those contrasting cases prevents the architecture from becoming ML-specific.

## Architecture decision

Setta keeps a Go control plane and adds an out-of-process Python execution worker:

```text
AI or CLI ───────────────> project document and app.py
                                │
browser ── HTTP/SSE/WebSocket ─> Go realtime host
                                      │
                                      ├── project and artifact stores
                                      └── private worker adapter ──> Python worker
```

The Go host owns:

- loopback HTTP and WebSocket security;
- the canonical project document, identity, revisions, and atomic persistence;
- the complete-snapshot publication stream;
- runtime event validation, scheduling, coalescing, and concurrency groups;
- invocation identity, stale-result rejection, and artifact adoption;
- worker startup, readiness, reload, failure reporting, termination, and descendant cleanup; and
- the language-neutral worker contract.

The Python worker owns:

- importing the project's Python entrypoint;
- process-lifetime Python resources such as models, clients, and device handles;
- named handler invocation;
- Python generator and async-generator iteration;
- conversion between Python values and the worker contract; and
- cooperative handler cleanup during reload and shutdown.

The browser owns pointer-rate interaction, drawing presentation, focus, drafts, and other UI state
that does not need to cross the process boundary. `@setta/workspace` remains the reusable outer
workspace and section-composition layer. Realtime section implementations stay in the new app
unless a second concrete product proves that one is genuinely generic.

Python does not own another public web server. Running the user code as a child keeps Python's
ecosystem while preserving the existing Go backend, local security, persistence, and process
lifetime boundaries. It also isolates Python import failures and crashes from the browser server.

## Repository shape and ownership

The planned implementation starts with these owners:

```text
apps/realtime/
  backend/                  Go host, project aggregate, transport, scheduler, workers
  src/                      React app and realtime section kinds
  README.md                 Public CLI, project, and runtime behavior

packages/setta-runtime/     App registration, packaged assets, live-session ownership
packages/workspace/         Existing generic workspace only
```

The Realtime backend is its own module rather than an extension of the Python Canvas aggregate.
Its document, binding, runtime-state, and artifact contracts are product-specific. The frontend is
also a separate application consumer of `@setta/workspace`.

Do not add a domain module that both apps must use. Their shared foundations are the existing
Workspace and packaged-runtime boundaries, plus any narrowly extracted local-host infrastructure
whose contract is demonstrably identical in both apps. Python Canvas must not depend on the
Realtime worker protocol.

The existing packaged-runtime manifest, `AppRegistry`, `LiveSessionStore`, and
`NativeServerSupervisor` already support multiple app identities structurally. Extend their build
and registration paths so `setta apps` reports both applications and `setta realtime ...` launches
the new native server. Remove Python Canvas build and registry hard-coding at the source rather
than adding a second special case.

Do not begin with a broad shared-Go refactor. First identify exact identical invariants in the
Python Canvas local web and process code. Extract only the pieces used by both applications, with
their existing boundary tests, such as loopback authority enforcement, production-asset
validation, and platform process-tree ownership. Keep project aggregates, coordinators, routes,
and transport documents in their owning apps.

## Authored project model

A project directory contains an authored project document and a normal Python entrypoint. The
exact default paths will follow the existing local-project convention:

```text
.local/realtime/
  project.json
  app.py
```

The strict, versioned project document owns:

- stable opaque section IDs and the complete section forest;
- authored section data and end-user layout;
- the Python runtime declaration and entrypoint path;
- explicit event-to-handler bindings;
- binding arguments, output targets, and scheduling policy; and
- durable application configuration.

It does not contain derived handler discovery, listener registration state, Python objects,
runtime queues, active invocations, logs, generated artifacts, browser pointers, or connection
state. Unknown fields and incompatible union members fail validation. There is no legacy listener
parser or migration path.

A binding names one source event, one handler, its arguments, its possible outputs, and its
scheduling policy. For example:

```json
{
  "id": "stylize-on-drawing",
  "trigger": { "sectionId": "drawing", "event": "snapshot" },
  "handler": "stylize",
  "arguments": {
    "drawing": "$event.contentRef",
    "strength": "$sections.strength.value"
  },
  "scheduling": {
    "mode": "latest",
    "debounceMilliseconds": 250,
    "concurrencyGroup": "image-work",
    "concurrencyLimit": 1
  },
  "outputs": {
    "image": { "sectionId": "result", "field": "contentRef" }
  }
}
```

Go resolves argument references against one event and one canonical state snapshot before enqueueing
the invocation. Python receives values, not dependency paths. Handler names and stable section IDs
are exact; aliases derived from display names are not supported.

## AI-native authoring

The app exposes strict commands through the existing Setta app registry:

- `setta realtime schema` describes project operations and runtime errors;
- `setta realtime snapshot` returns the canonical project and runtime status;
- `setta realtime apply` performs one revision-checked project mutation;
- `setta realtime reload` validates and starts the current Python entrypoint; and
- `setta realtime invoke` runs one named handler with bounded test input.

The browser and CLI use the same coordinator. AI edits `app.py` as an ordinary file and uses the
CLI to build and inspect the UI, bindings, and runtime. Reload is explicit after a source edit;
there is no implicit listener re-registration or dependency-catalog refresh.

Python Canvas remains optional. A handoff consists only of AI copying a useful ordinary function
or module into the Realtime project, importing an existing local package, or reusing an ordinary
file artifact. AI may instead create `app.py` directly in the Realtime project and produce the
same final state.

## Browser and durable-state transports

Use one transport for each kind of state:

- Revision-checked HTTP commands mutate durable authored project state.
- One server-sent event stream immediately sends the current complete project snapshot and then
  publishes the newest complete snapshot after changes.
- One WebSocket carries ephemeral runtime events, invocation status, streaming updates, and logs.
- HTTP uploads and downloads carry large binary content; WebSocket messages carry content
  references rather than duplicate encoded payloads.

Reconnect receives current complete project and runtime snapshots. It does not replay arbitrary
listener history or request a force refresh. Every runtime event and result includes a session,
binding, and invocation identity. A result for a superseded invocation cannot update its targets.

Continuous microphone and camera media must not be forced through the generic JSON event path.
When a section requires latency or bandwidth beyond bounded snapshots, add a media-specific
transport such as WebRTC behind the same section event boundary. The first drawing slice uses
settled image snapshots and does not require WebRTC.

## Worker contract and future languages

Go defines a private, versioned worker protocol independent of Python. The minimum message set is:

- `initialize`, followed by `ready` or a structured load error;
- `invoke`, carrying invocation identity, handler name, arguments, and staged content references;
- zero or more `update` messages carrying progress, output values, or artifacts;
- `complete` or `error`;
- `cancel`; and
- `shutdown`.

The transport uses framed messages on a dedicated inherited channel or local IPC endpoint.
Arbitrary application stdout and stderr remain logs and can never corrupt protocol framing. JSON
values form the portable value subset. Large values use validated, invocation-scoped content
references. Do not expose pickle, Python exceptions, modules, callables, or Python UI objects in
the host contract.

The Python adapter uses the already selected project interpreter and a packaged standard-library
bootstrap so project virtual-environment dependencies remain importable without requiring Setta to
be installed inside that environment. The bootstrap imports `app.py`, invokes its exported handler
table, and translates values to the protocol.

The project document declares a runtime kind such as `python`; it does not encode how that adapter
is launched. A future TypeScript, Go, or Rust adapter implements the same conformance suite and
message lifecycle. The browser, binding model, scheduler, project persistence, and artifacts stay
unchanged. Before the first release, run the conformance suite against the Python adapter and a
minimal non-Python fixture worker to prove the boundary has no Python-only assumptions.

## Scheduling, streaming, and cancellation

Scheduling happens only in Go. Each binding selects one of three bounded modes:

- `once`: reject or ignore another event while one invocation is active;
- `latest`: retain at most the newest pending event while one invocation is active; or
- `parallel`: admit work up to an explicit concurrency limit.

Bindings may share a concurrency group for scarce resources. The group uses the lowest declared
limit and a bounded queue. Change-like and pointer-derived events default to `latest`; explicit
submit actions default to `once`. Unbounded parallelism is never implicit.

A normal Python return produces one final update. A generator or async generator produces streamed
updates and then completes. Output declarations constrain which sections a handler may update;
partial results may omit an output without clearing it.

Cancellation removes queued work and cooperatively closes generators and async tasks. Arbitrary
running synchronous Python, native extensions, and external calls cannot be killed safely inside
the process. A timeout or explicit hard stop terminates and replaces the complete worker process,
making process-lifetime Python resources restart. The UI reports this distinction instead of
claiming that a running function was safely interrupted.

## State and lifecycle

Keep four state scopes explicit:

- Authored project state is durable, revisioned, and Go-owned.
- Runtime session values are JSON-compatible, Go-owned, and included in the current runtime
  snapshot so a browser reconnect can catch up.
- Process resources are Python-owned objects created during worker startup and disposed during
  worker shutdown.
- Browser interaction state is local and disposable.

The first release does not add a generic application database. Python may use normal files,
SQLite, remote services, or another explicit application dependency when it needs durable data
beyond the authored project. Worker restart never pretends that arbitrary in-memory Python state
was preserved.

Lifecycle hooks are explicit and bounded: load, startup, handler invocation, cooperative cancel,
shutdown, and cleanup after failure. Timers are Go-scheduled bindings so reload, cancellation, and
visibility are deterministic. Python background work must register with the worker lifecycle; a
detached thread or child process is still terminated with its owning worker.

## Drawing section

Rebuild the drawing section around an exact-pinned external retained-mode drawing library rather
than porting the bespoke main-branch canvas implementation. Fabric.js is the initial candidate;
validate pointer, touch, eraser, selection, transform, serialization, and export behavior before
pinning it. Follow the dependency-review workflow before installation.

The library owns drawing objects, hit testing, transforms, selection, and image export inside the
section. Setta owns section chrome, canonical section data, event naming, persistence boundaries,
and content references. Vector scene changes become durable only at coherent gesture boundaries.
Raster snapshots are derived ephemeral inputs to handlers and are coalesced before leaving the
browser.

The main-branch `DrawArea` and its tests are behavior references for accepted gestures and snapshot
semantics. They are not source donors for the new drawing engine. The outer Workspace canvas
continues using its current upstream XYFlow adapter; the drawing-library decision applies only to
the drawing section's internal surface.

## Selective reuse

Reuse current-branch components at their existing ownership boundaries:

- `@setta/workspace` host, section registry, document projection, shell, and upstream XYFlow canvas;
- Python Canvas's complete-snapshot SSE and revision-conflict behavior as transport patterns;
- Python Canvas's loopback authority, origin, production-asset, and SPA/API separation invariants;
- the packaged Setta app registry, runtime manifest, live-session records, and native-server
  supervisor; and
- platform process-tree containment where its execution contract is identical.

Use the main branch as a behavior donor for WebSocket sequencing, bounded latest-value delivery,
binary artifact expectations, and drawing interactions. Do not port `backend/setta/api/listener.py`
or the listener registration, dependency keys and values, coverage, temporary IDs, frontend emit,
force-refresh, or share-session machinery. The standalone app replaces those mechanisms with
authored bindings and one Go-owned invocation scheduler.

## Lessons from Gradio and Streamlit

The plan adopts these Gradio concepts:

- explicit event functions with declared inputs and possible outputs;
- per-handler and shared-resource concurrency limits;
- `once`, concurrent, and always-latest trigger behavior;
- generator-based streamed results;
- cancellation that distinguishes queued, cooperative, and already-running work;
- session/resource cleanup and time-bounded stream ownership; and
- a separate media path for genuinely low-latency audio or video.

Gradio's current Server mode confirms that a custom frontend can sit above named Python APIs,
queues, and SSE streaming. It is not selected as the Realtime host: FastAPI and Gradio's public
wire, file, and session behavior would duplicate the existing Go host and make another language
adapter emulate Gradio. A prototype may compare it with the private Python worker only if measured
implementation risk remains after the worker contract is specified; it must stay behind the Go
adapter and cannot become a frontend dependency.

The plan adopts these Streamlit concepts:

- explicit separation between session values and process-lifetime resources;
- stable UI identities;
- scoped recomputation analogous to invoking only the affected binding; and
- batching related input changes before expensive work.

It does not adopt Streamlit's default whole-script rerun model or Python-authored UI tree. Replaying
an entire arbitrary program for drawing, media, or rapid controls would make effects and resource
lifetime harder to reason about. Setta's stable React sections and explicit handlers already supply
the useful scoped-execution boundary.

Research references:

- [Gradio Server mode](https://www.gradio.app/guides/server-mode)
- [Gradio Blocks and event listeners](https://www.gradio.app/guides/blocks-and-event-listeners)
- [Gradio queuing](https://www.gradio.app/guides/queuing)
- [Gradio streaming outputs](https://www.gradio.app/guides/streaming-outputs)
- [Gradio streaming inputs](https://www.gradio.app/guides/streaming-inputs)
- [Gradio state](https://www.gradio.app/guides/state-in-blocks)
- [Gradio resource cleanup](https://www.gradio.app/guides/resource-cleanup)
- [Streamlit execution flow](https://docs.streamlit.io/develop/api-reference/execution-flow)
- [Streamlit fragments](https://docs.streamlit.io/develop/api-reference/execution-flow/st.fragment)
- [Streamlit caching and resources](https://docs.streamlit.io/develop/concepts/architecture/caching)
- [Streamlit widget behavior](https://docs.streamlit.io/develop/concepts/architecture/widget-behavior)

## Delivery phases

### Phase 0: contracts and donor audit

1. Add Code Polishy module and design mappings for the new backend and frontend before governed
   implementation.
2. Specify the strict project, browser transport, artifact, and worker protocol documents.
3. Record exact reusable invariants and extraction candidates from Python Canvas.
4. Validate Fabric.js against the required drawing interactions without importing main's drawing
   implementation.
5. Build protocol fixtures for ordinary return, streaming, failure, cancellation, log isolation,
   and worker crash.

Exit when the contracts can describe the counter and drawing-stylization scenarios without a
listener registry, discovered dependency graph, or Python-specific host value.

### Phase 1: standalone shell and durable project

1. Add the Realtime app to the packaged runtime and CLI registry.
2. Add its Go native server and React application using `@setta/workspace`.
3. Implement strict project creation/loading, project identity, revisions, atomic replacement,
   revision-checked mutations, and complete-snapshot SSE.
4. Implement `schema`, `snapshot`, and `apply` through the live coordinator.

Exit when Realtime opens and edits a project without starting or importing Python Canvas.

### Phase 2: Python worker

1. Implement the language-neutral worker adapter interface and conformance harness.
2. Launch the packaged Python bootstrap with the selected project interpreter inside the existing
   platform process-lifetime boundary.
3. Implement initialization, handler invocation, streaming, structured errors, logs, explicit
   reload, shutdown, and hard worker replacement.
4. Implement `reload` and `invoke` through the same coordinator used by the browser.

Exit when the counter, generator, exception, timeout, crash, and reload fixtures pass without a
browser connection.

### Phase 3: realtime dispatch and artifacts

1. Add the runtime WebSocket and strict message contract.
2. Implement Go-owned binding resolution, debounce, bounded queues, latest-value replacement,
   concurrency groups, invocation sequencing, and cancellation.
3. Add one content store and HTTP content transfer path for all large values.
4. Publish complete current runtime status on connection and reject stale invocation results.

Exit when a synthetic high-frequency input cannot grow memory without bound and only its newest
applicable result reaches the target section.

### Phase 4: sections and drawing acceptance

1. Add the minimum input, output, button, status, and drawing section kinds in the Realtime app.
2. Integrate the selected drawing library and persist its vector scene at gesture boundaries.
3. Emit settled raster snapshots by content reference.
4. Complete the drawing-to-Python-to-result scenario, including progress, errors, cancellation,
   reload, and worker restart.
5. Add a use-focused presentation that preserves the authored layout without exposing authoring
   controls during ordinary interaction.

Exit when AI can construct the complete example directly in Realtime and a user can open and use
it without Python Canvas.

### Phase 5: packaging and extension seam

1. Package both app servers and web roots in the closed Setta runtime manifest.
2. Run the worker conformance suite against a minimal non-Python fixture adapter.
3. Verify clean shutdown and descendant cleanup on every supported platform.
4. Document how a later language adapter is registered without changing project bindings or the
   browser protocol.
5. Complete the required artifact, package, boundary, browser, and merge-gate verification selected
   by the repository workflow.

Exit when the installed wheel exposes both independent apps and the Realtime project declares its
runtime language without any Python-specific frontend behavior.

## Acceptance checklist

- `setta realtime open` starts a project when Python Canvas is absent from the active workflow.
- AI can inspect, mutate, reload, and test the app through strict commands.
- Arbitrary project Python imports from the selected project environment and initializes once per
  worker lifetime.
- Ordinary returns, generators, errors, logs, cancellation, timeouts, and crashes have distinct
  observable outcomes.
- Repeated drawing snapshots remain bounded and an older result cannot replace a newer result.
- Browser reconnection receives complete current project and runtime state without replay logic.
- Large values use one content-reference path.
- The drawing section uses an exact-pinned external drawing engine.
- The worker protocol passes a non-Python fixture and contains no Python serialization types.
- The project contains no listener discovery, registration, coverage, temporary-ID, share-session,
  or force-refresh mechanism.
- No Realtime command or runtime path requires Python Canvas.
