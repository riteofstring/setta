# Python Canvas backend design rationale

This document owns current non-local rationale for the `python-canvas-backend` module. The public
CLI, HTTP, and product behavior remain in `apps/python-canvas/README.md`.

## Ownership boundaries

The aggregate owns validated authored state and has no filesystem, HTTP, renderer, provider, or
process dependency. The renderer deterministically derives complete Python and semantic source
ranges from one validated aggregate. The project-file adapter owns strict disk encoding and
same-filesystem authored replacement. The materializer owns one disposable generated module beside
the project so Basedpyright resolves imports in the real project context. The coordinator is the
only boundary that combines these participants into a durable mutation.

Go owns the closed V2 transport contract. TypeScript declarations and fixtures are generated from
that owner together. External JSON is decoded strictly at delivery boundaries into aggregate or
application types; unknown fields, incompatible union members, and derived-state fields are
rejected rather than retained for later interpretation.

The shared `local-backend/strictjson` lexical rules apply to project files, CLI operations and
responses, HTTP requests, terminal control, and interpreter probes before Python Canvas performs
closed-shape and semantic validation. `local-backend/httpjson` owns bounded JSON request and
canonical response mechanics, and `local-backend/sse` frames and flushes unnamed complete-project
events. Python Canvas retains routes, statuses, typed errors, subscription decisions, and terminal
and WebSocket semantics.

## Durable mutation transaction

A provider-dependent mutation uses one serialized transaction:

1. Validate the expected project identity and revision and build a wholly valid aggregate
   candidate.
2. Rewrite only parser-confirmed authored references, without allocating another revision, then
   render the complete candidate document.
3. Stage and sync the authored project file and generated document as siblings of their targets.
4. Install the generated candidate while retaining a synced rollback copy.
5. Synchronize the provider against that exact candidate and normalize its result.
6. Atomically commit the authored project file.
7. Finalize the generated document, publish one complete snapshot, and notify subscribers.

Any provider or authored-commit failure restores the prior generated document and provider target
before returning. Rollback uses an internal background context because restoring the last published
state is a transaction obligation even when the caller's request was canceled. Once the authored
file is durable, failure to remove a recovery backup is deferred to coordinator cleanup and does
not turn the published mutation into a false failure.

Structural mutations do not require a ready provider. They commit the authored file and generated
document first, publish a complete snapshot with pending diagnostics, then schedule analysis for
that exact durable revision. Queued structural analysis coalesces superseded work while the active
provider request remains serialized. `DiagnosticsRevision` may trail the authored revision and is
the explicit signal that diagnostics are still settling.

Section paste is one of these structural mutations. A closed clipboard V1 payload contains only
authored callables, Parameter Dictionaries, Lists of Objects, their forest, parameter values, and
typed UI configuration. It excludes project identity, generated Python, diagnostics, provider
status, terminal state, and browser layout. Copy validates an observed revision, captures the
complete selected subtrees, and rewrites parser-confirmed internal `state.*` references from their
project paths to self-contained fragment paths without writing.

Paste validates the expected revision and complete external payload before persistence. The
aggregate allocates all section, parameter, and dictionary-entry ids and collision-free display
names before constructing one candidate; the coordinator then rewrites existing and cloned
references against their distinct path maps. Render, materialization, or authored persistence
failure leaves the published and durable project unchanged. Acceptance advances one revision and
publishes one complete snapshot with the pasted root ids. Provider diagnostics begin after that
durable structural boundary, so a later provider failure publishes failed provider status and does
not retroactively roll back the accepted paste. Workspace placement and presentation remain
frontend-owned and never enter the Go aggregate or transport payload.

Coordinator shutdown cancels background analysis before waiting for the main mutation lock. A
synchronous provider mutation can hold that lock while waiting for provider serialization, so the
cancel-first order breaks the corresponding diagnostics wait cycle. Closing releases only provider
and disposable materialization state; it never edits the authored project.

## Files and Python environment

Project creation is exclusive. Loading accepts only the current strict format and never guesses a
legacy format or substitutes an empty project. Replacement bytes are fully encoded, synced, and
staged in the target directory before an atomic rename, preserving the required same-filesystem
boundary. This adapter remains application-owned: the authored stage participates in the
coordinator's generated-file install, provider synchronization, and rollback protocol, while the
shared `local-backend/projectfs` replacement is intentionally a single-file commit.

Python selection happens once at startup. The nearest valid `.venv` above the project wins;
otherwise the exact launcher Python is used. The selected interpreter is verified by a bounded
probe, and every language-server, generated-run, and terminal child receives the same prepared
environment. Variables that can independently redirect Python executable or import-root selection
are removed while ordinary Python behavior flags remain intact.

## Provider and publication model

Basedpyright runs as one startup-supplied absolute executable; the backend never searches ambient
`PATH` or source-checkout dependencies for it. Temporary completion documents are read-only sibling
documents and cannot change the canonical generated document. UTF-8 byte ranges are converted to
and from LSP UTF-16 positions at the adapter boundary, rejecting offsets inside code points or
surrogate pairs.
Signature lookup renders a detached candidate with the queried callable's arguments removed. Their
UI overrides are removed from that candidate as well, so controls cannot reference absent
parameters. The canonical authored controls and values remain intact and participate in the normal
signature reconciliation and durable refresh.

Every event-stream subscription starts with the current complete snapshot. Publication is
latest-value: a slow subscriber may skip superseded intermediate snapshots while retaining the
newest one. Reconnection therefore catches up without polling or replay bookkeeping. The shared
`local-backend/latestvalue` boundary owns detached delivery, buffer-one replacement, cancellation,
and close; Python Canvas retains snapshot construction and the points at which durable or settled
state becomes publishable.

## Generated-process ownership

Noninteractive runs and the attached terminal are separate process boundaries. They accept only
coordinator-captured generated code, the startup-selected interpreter, and the explicit project
directory. No transport caller selects an arbitrary command, working directory, or environment.
Output streams are captured independently within bounds, and runner-enforced termination reasons
remain authoritative over incidental platform exit codes.

Process containment owns lifetime and cleanup, not user permissions:

- The shared `local-backend/proctree` boundary assigns a blocking Windows runner guardian or a
  suspended ConPTY root to a kill-on-close Job Object before user code can create descendants.
- The shared boundary makes Linux guardians child subreapers and performs bounded adopted-child
  termination and reaping. Terminal signaling remains application-owned because it revalidates
  terminal process identity and containment to avoid PID-reuse mistakes.
- The shared boundary supplies the inherited macOS `sandbox-exec` policy for noninteractive work,
  whose descendants cannot create a new process group or session. Terminal descendants may use
  process groups for job control but cannot leave the application-owned guardian session.
- A noninteractive run is refused on another POSIX platform when no comparable process-tree
  ownership primitive is available, using the shared fail-closed unsupported result.

The terminal guardian remains the stable session owner after the configured shell exits. Terminal
history and live forwarding are joined under one lock so an attachment cannot miss bytes between
the retained history and the live channel. Attachment tickets are opaque, single-use, and accepted
only for the already-open terminal. Closing is idempotent and returns only after owned artifacts
and processes are cleaned up.

## Local web boundary

The shared `local-backend/localweb` boundary binds IPv4 loopback and accepts only the exact
listener authority plus the matching `localhost` alias on that port. This closed `Host` set blocks
DNS rebinding before SPA, REST, or WebSocket handlers can expose project state. Python Canvas owns
its route tree and terminal upgrades additionally validate the exact configured browser origin.

Production assets are validated before the project publishes a live session. Only regular,
non-symlink files under the canonical asset root are served. API paths never fall through to the
SPA entry document, while an extensionless missing browser route may use that document for client
navigation. Shared serving performs bounded shutdown and invokes the application readiness writer
only after serving starts. Binding precedes handler construction so the actual origin is available
to every origin-sensitive route.

The Windows ConPTY implementation derives in part from `UserExistsError/conpty`. Its MIT notice is
retained in the source tree and the built wheel's license directory; this design record does not
replace that attribution.

## Visual Python playgrounds

Three independent examples exercise object composition with local, repeatable experiments. Rover
mission constructs a terrain and a fleet, then simulates route choice, energy, payload, and cost.
Model arena constructs shared feature transforms and three classifiers, cloning a fresh pipeline
for each training budget. Its split precedes all fitting; 400 held-out points drive the scores and
120 are drawn on the decision maps. Art studio constructs ordered drawing layers and renders the
same recipe under several seeds. SVG uses escaped text, validated hex colors, and reusable vector
shapes to stay within the existing bounded run output.

Each generated suffix calls its helper's `show` on explicit Run. The helper emits one versioned
`SETTA_DISPLAY` JSON line with image, chart, table, and Markdown panels. The frontend consumes that
line through the existing generated-program run route, using its revision binding, interpreter,
working directory, time limit, process containment, and output limit. There is no artifact server
or additional execution lifecycle. Validation errors leave authored inputs intact; ordinary Python
failures remain run results rather than application failures. `recipe.py` provides a handwritten
starting equivalent, and the suffix entry-point contracts declare those dynamic calls.

Rover mission and art studio need only the standard library. Model arena retains NumPy 2.5.1 and
scikit-learn 1.9.0 from the previous example: exact official releases older than 90 days at admission.
A fixed resolver cutoff preserves the 30-day admission window. Setup admits wheels only and runs
no build hooks. These packages belong to the example environment rather than the Setta runtime.
Project-local Basedpyright configuration permits the generated constructor's intentional `state`
parameter name. Each example owns a frozen lock and an observable boundary suite.
