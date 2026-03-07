# Go Backend Rewrite Plan

## Goal

Plan a full backend rewrite from Python to Go without treating this as a simple web API port.
The current backend is a large stateful runtime with:

- 34 router modules under `backend/setta/routers/`
- 312 route constants in `backend/setta/types/routes.py`
- 372 backend test files under `tests/`
- heavy custom logic around project state, websockets, MCP, LSP, plugins, terminals, and multi-mode runtime behavior

This rewrite is a clean break. We can reuse good ideas from the current backend, but we do not need backward compatibility, legacy route preservation, storage migrations, or Python-shaped internal structure.

## Current Reality

The backend seams that matter most for planning are:

- App assembly and lifecycle:
  - `backend/setta/server.py`
  - `backend/setta/server_state.py`
- Route surface and mode guards:
  - `backend/setta/routers/*.py`
  - `backend/setta/routers/setta_api_router.py`
  - `backend/setta/types/routes.py`
- Auth and sessions:
  - `backend/setta/auth/*.py`
  - `docs/reference/auth-and-sessions.md`
- Realtime and websockets:
  - `backend/setta/routers/websocket.py`
  - `backend/setta/websockets/*.py`
  - `docs/reference/setta-realtime-behavior.md`
- Project state and file-backed persistence:
  - `backend/setta/project_state/*.py`
  - `docs/reference/setta-files.md`
- LLM and MCP:
  - `backend/setta/llm/*.py`
  - `backend/setta/mcp/*.py`
  - `docs/reference/mcp-system-overview.md`
- Terminals, LSP, and subprocesses:
  - `backend/setta/terminals/*.py`
  - `backend/setta/lsp/*.py`
- Plugins:
  - `backend/setta/plugins/*.py`

The main planning implication is simple: this rewrite is mostly about rebuilding custom runtime semantics, not choosing an HTTP library.

## Rewrite Principles

1. Optimize for the target Go architecture first.
   - Reuse current HTTP, websocket, and MCP contracts only when they are still the simplest good choice, not because we owe legacy compatibility.

2. Redesign internals aggressively.
   - Do not port `SettaFastAPIState` or other large Python objects 1:1.
   - Replace implicit global/runtime coupling with explicit Go services and supervised runtimes.

3. Treat storage as new.
   - Stay file-backed by default, but design the new on-disk layout for the Go runtime.
   - We do not need to preserve old file formats or ship migration machinery unless product requirements change later.

4. Use libraries for transport and OS integration, not product semantics.
   - Wire protocols, cookie codecs, filesystem events, PTY support, JSON Schema validation: library territory.
   - Project state, runtime managers, scope enforcement, tool registry, share/app mode semantics: our code.

5. Build a black-box reference harness early.
   - The existing Python tests are a capability and edge-case inventory.
   - The Go rewrite should use them to avoid blind spots, not as a strict compatibility bar.

## Decision Buckets

### Adopt Unless Disproven

- HTTP: `net/http` + `github.com/go-chi/chi`
- Websockets: `github.com/coder/websocket`
- SSE/streamed HTTP: stdlib `net/http`
- Structured logging: `log/slog`
- Metrics/tracing hooks: Prometheus + `otelhttp`
- File watching: `github.com/fsnotify/fsnotify`
- Subprocesses: `os/exec`
- Git operations: shell out to native `git`
- Filesystem state: stdlib filesystem APIs plus our own atomic-write/path-policy layer
- JSON Schema validation: `github.com/santhosh-tekuri/jsonschema/v6`

These are strong enough to plan around now.

### Spike Before Locking

- MCP SDK choice:
  - likely `github.com/modelcontextprotocol/go-sdk`
- PTY layer:
  - likely `github.com/aymanbagabas/go-pty`
- LSP stack:
  - custom manager plus small JSON-RPC/LSP helper packages only where needed
- Cookie codec:
  - likely `github.com/gorilla/securecookie`
- LLM provider SDK boundaries:
  - use official provider SDKs only at adapter edges
- Embedded DB fallback:
  - defer unless a real indexing or transaction need emerges

These need short implementation spikes, not just library reading.

### Definitely Custom

- Auth and session semantics
- Runtime manager and registry topology
- Project state and persistence rules
- Realtime connection routing and replay model
- Tool registry, metadata, and search behavior
- MCP scope enforcement and frontend affinity semantics
- LLM/chat orchestration core
- Plugin discovery, capability policy, lifecycle, and process model
- API error model and transport shaping
- Share mode, app mode, launcher mode behavior

## Proposed Go Package Layout

Do not organize the rewrite around Python module parity. Organize it around runtime boundaries.

### Executables

- `cmd/setta-server`
  - main backend server
- `cmd/setta-mcp-bridge`
  - stdio bridge for MCP use cases
- `cmd/setta-cli`
  - only if CLI/runtime control is moved into Go in the first rewrite wave

### Internal Packages

- `internal/app`
  - app assembly, startup/shutdown, mode selection
- `internal/config`
  - env/config/profile/path resolution
- `internal/httpapi`
  - route registration, middleware, request decoding, response and error envelopes
- `internal/auth`
  - bootstrap tokens, cookie codec, auth middleware, share-session extraction
- `internal/runtime`
  - process-wide services, supervised background tasks, service registry
- `internal/modes`
  - IDE/share/app/launcher mode policies and service wiring
- `internal/projects`
  - project runtime registry, per-project ownership, state revisions
- `internal/statefs`
  - on-disk layout, atomic writes, file locks, schema/versioning
- `internal/realtime`
  - websocket hub, subscriptions, fan-out, snapshot replay, sequence handling
- `internal/terminals`
  - PTY creation, terminal session lifecycle, websocket attachment
- `internal/lsp`
  - LSP process lifecycle, stdio framing, diagnostics/completion sessions
- `internal/mcpx`
  - MCP server/client adapters, tool invocation boundary, transport wiring
- `internal/tools`
  - tool metadata, registration, scope checks, search indexing
- `internal/llm`
  - provider adapters, orchestration, stream assembly, run tracking
- `internal/plugins`
  - manifests, discovery, install/runtime metadata, backend worker lifecycle
- `internal/gitx`
  - safe shell wrapper around `git`
- `internal/sshx`
  - SSH helpers and policy layer
- `internal/artifacts`
  - attachments, artifacts, download/upload helpers
- `internal/observability`
  - log fields, metrics, traces, error shaping
- `internal/contracts`
  - transport DTOs shared across handlers and tests where useful

### Package Layout Rules

- Keep transport types separate from core domain/runtime types.
- Keep mode-specific policy out of handler packages.
- Keep filesystem persistence behind interfaces owned by us, not by a third-party library.
- Do not create a giant `server_state` equivalent package.

## Architecture Direction

### 1. Replace the giant mutable app state with explicit runtimes

Current Python behavior is centered around a large app state object plus many side managers.
The Go rewrite should separate:

- process-wide runtime
- per-mode runtime
- per-project runtime
- per-share-session runtime

Each runtime should own:

- start/stop lifecycle
- background goroutines
- relevant caches
- subscriptions
- cleanup rules

This is the biggest internal redesign win.

### 2. Treat project state as a first-class subsystem

Project state is not just persistence. It drives:

- websocket snapshots and deltas
- listener behavior
- LSP updates
- artifact/code-file synchronization
- tool scope resolution
- share-session redaction

The Go rewrite should create a clear `ProjectRuntime` boundary with:

- current state revision
- load/save methods
- mutation queue or single-writer loop
- broadcast hooks
- watcher hooks
- share/app redaction hooks

This subsystem should be implemented before most higher-level features.

### 3. Keep wire layers thin

Handlers should do only:

- auth/context extraction
- request decoding/validation
- service invocation
- response mapping

Do not let route handlers own runtime rules or persistence decisions.

### 4. Rebuild realtime around product semantics, not transport details

The hard part is:

- per-project/per-session connection tracking
- event sequencing
- replay/force-refresh behavior
- filtering by project/share-session/dependency
- backpressure and disconnect policy

The websocket library should be a small detail inside a larger `realtime` package.

### 5. Tight isolation around MCP, PTY, LSP, and plugins

These are the most likely subsystems to change during implementation.
Wrap them tightly so the rest of the backend is insulated from library churn.

## Branching And Worktrees

Use `go-rewrite` as the long-lived integration branch for this effort.
Assume the rewrite is being done in a dedicated worktree checked out from `go-rewrite`.

Inside that worktree, create short-lived child branches for concrete work units:

- spikes
- self-contained subsystem work
- risky architectural changes
- anything that should be reviewed or merged independently

Do not treat phases as branches by default.
Phases are planning boundaries; branches should map to mergeable work units.

Recommended workflow:

1. Keep the dedicated rewrite worktree on top of `go-rewrite`.
2. Inside that worktree, create a child branch for the current work item.
3. Complete the work, tests, and relevant doc updates on that child branch.
4. Merge the child branch back into `go-rewrite`.
5. Delete the short-lived branch and create the next one from updated `go-rewrite`.

Create additional worktrees only when you need multiple rewrite branches active at the same time or want stronger isolation between concurrent experiments.

## Phased Rewrite Plan

### Phase 0: Capability Extraction And Harness

Deliverables:

- route and capability inventory grouped by subsystem and runtime mode
- websocket event inventory
- MCP endpoint/tool inventory
- reference test shortlist built from existing Python tests
- explicit list of what we keep, redesign, and drop

Acceptance criteria:

- we can point to the exact Python tests and docs that describe each early-phase capability
- we have a minimal black-box integration harness that can target either backend

Priority reference suites for Phase 0:

- auth/session/bootstrap
- websocket auth and connection rules
- core project load/save routes
- share/app mode guards
- terminals attach/delete behavior
- MCP tool registration and namespacing

### Phase 1: Foundation Runtime

Deliverables:

- `cmd/setta-server`
- config/path resolution
- structured logging
- error envelope conventions
- middleware stack
- health/status routes
- atomic-write and filesystem policy helpers

Acceptance criteria:

- server boots in dev/test modes
- basic route registration works
- config/path resolution and runtime boot rules are intentionally specified and tested

### Phase 2: Auth, Modes, And Request Context

Deliverables:

- bootstrap token flow
- signed auth cookie flow
- share-session extraction and validation
- IDE/share/app mode gating
- request-scoped auth/context helpers

Acceptance criteria:

- current auth and mode-guard reference tests have a Go equivalent pass set
- websocket auth behavior is settled before broad websocket work begins

### Phase 3: Project State Core

Deliverables:

- project state load/save
- per-project runtime registry
- mutation queue or single-writer logic
- revision tracking
- file-backed persistence and versioning
- artifact/code-file/path policy integration

Acceptance criteria:

- load/save/update flows work without LLM, MCP, or LSP dependencies
- state writes are atomic and crash-safe enough for local app usage
- share-session state overlays are defined clearly

### Phase 4: Realtime And Terminal Runtime

Deliverables:

- websocket hub
- project/session subscription model
- snapshot + delta broadcast
- force-refresh behavior
- PTY-backed terminal sessions
- terminal websocket attach/detach/history behavior

Acceptance criteria:

- realtime sequence/replay behavior is deterministic
- terminal attach/delete/resize behavior works on at least macOS and Linux before Windows signoff

### Phase 5: LSP And Code Workflows

Deliverables:

- LSP process supervision
- stdio framing
- initialization/restart logic
- diagnostics broadcast
- completion/signature-help plumbing

Acceptance criteria:

- at least one real language server works end-to-end
- diagnostics/completion behavior is stable under restarts and file changes

### Phase 6: MCP And LLM Runtime

Deliverables:

- MCP server transport
- MCP client transport
- namespaced tool registry
- scope enforcement
- chat/tool stream orchestration
- provider adapters

Acceptance criteria:

- internal and external MCP use cases both work
- tool search, namespacing, and scoped invocation behavior match product expectations
- LLM orchestration remains custom and testable

### Phase 7: Plugins, Share/App Runtime, And Launcher-Adjacent Work

Deliverables:

- plugin discovery/install/runtime lifecycle
- plugin backend worker process model
- share/app runtime cleanup policies
- launcher/runtime-control endpoints that truly belong in the backend rewrite

Acceptance criteria:

- plugins do not require in-process Go plugin loading
- share/app isolation semantics are explicitly specified and implemented
- launcher concerns are either implemented cleanly or explicitly split from the main rewrite

## Required Spikes

These should be short, code-first spikes with a written result, not open-ended research.

### MCP Spike

Questions:

- Does the Go SDK support the exact transport modes we need?
- How cleanly can we express tool schemas and metadata?
- How much custom glue is required for namespacing, scope checks, and auth?

Exit criteria:

- one tool server
- one external MCP client connection
- one authenticated end-to-end tool call

### PTY Spike

Questions:

- How well does the candidate library behave on macOS, Linux, and Windows?
- How do resize, raw mode, cancellation, and reconnect work?
- Which current terminal behaviors are worth preserving, and which should be simplified in the new runtime?

Exit criteria:

- shell launch
- streamed output
- resize
- termination
- reconnect/attach behavior

### LSP Spike

Questions:

- Which framing/types package gives the least pain?
- How much of the session logic do we need to own?
- What restart/timeout rules are required?

Exit criteria:

- launch one real language server
- initialize
- open/change document
- receive diagnostics
- request completion

### File-State Spike

Questions:

- What exact atomic-write and locking strategy works on all supported OSes?
- What versioning rules does the new on-disk state need?
- What corruption-recovery rules are acceptable?

Exit criteria:

- atomic replace path
- lock discipline
- version stamp
- crash-recovery behavior documented

## Reference And Test Strategy

See `docs/plans/go-backend-rewrite/testing-strategy.md` for the operational testing rules and harness expectations for the rewrite.

### Use the existing Python test suite as a capability map

The minimum bar is that the Go test suite must cover at least the product behavior covered by the current Python tests.
The target is to meet or exceed that behavioral coverage, even if the Go tests are organized differently.

High-value source areas:

- `tests/auth`
- `tests/routers`
- `tests/websockets`
- `tests/project_state`
- `tests/mcp`
- `tests/llm`
- `tests/plugins`
- `tests/terminals`
- `tests/server_state`

### Convert early confidence tests into black-box Go-facing suites

The rewrite should not start by porting unit tests line-for-line.
Instead, create black-box tests around:

- HTTP routes
- websocket session rules
- on-disk persistence behavior
- PTY/LSP process lifecycles
- MCP tool invocation behavior

### Keep cross-platform smoke coverage explicit

At minimum:

- macOS
- Linux
- Windows for PTY, paths, file locking, and process behavior

### Keep git-history safety rules

Any Git test that mutates history must continue to run in disposable repos only.
Do not weaken this rule during the rewrite.

## Rewrite Vs Redesign Calls

### Default To Redesign

- route layout and request/response envelopes
- auth/session token formats and cookie payload structure
- filesystem layout and persistence format
- app state construction and lifecycle
- background task supervision
- manager ownership boundaries
- persistence implementation details
- plugin worker architecture
- LLM/provider adapter boundaries

### Keep Only If They Still Buy Simplicity

- project and share-session concepts
- websocket snapshot/delta model
- MCP tool namespacing and scope behavior
- frontend-visible workflow concepts that are still clearly good product decisions

### Safe To Drop Entirely

- storage migration paths
- legacy route compatibility
- Python-shaped module boundaries
- launcher-adjacent coupling that is not core backend runtime
- incidental batching/caching behavior that exists only because of the Python implementation

## Immediate Next Actions

1. Write a capability inventory from `Route`, websocket message types, and MCP tool registration.
2. Define the first black-box reference suite.
3. Run the MCP, PTY, and LSP spikes before locking those libraries.
4. Draft the Go package skeleton and service wiring.
5. Decide whether CLI/launcher code is in scope for wave 1 or deferred.

## Planning Conclusion

This rewrite is viable, but only if we treat it as a clean-break stateful-runtime rebuild, not as a framework swap.

The safest path is:

- lock the boring infrastructure choices now
- spike the uncertain subsystems quickly
- rebuild project state and realtime early
- defer plugins, MCP richness, and cross-platform process edge cases until the core runtime is stable
