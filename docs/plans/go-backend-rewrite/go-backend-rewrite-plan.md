# Go Backend Rewrite Plan

## Goal

Plan a full backend rewrite from Python to Go without treating this as a simple web API port.
The current backend is a large stateful runtime with:

- 34 router modules under `backend/setta/routers/`
- 312 route constants in `backend/setta/types/routes.py`
- 372 backend test files under `tests/`
- heavy custom logic around project state, websockets, MCP, LSP, plugins, terminals, and multi-mode runtime behavior

This rewrite is a clean break. We can reuse good ideas from the current backend, but we do not need backward compatibility, legacy route preservation, storage migrations, or Python-shaped internal structure.

## Current Status

As of 2026-03-09, the phase docs through Phase 11 and the recorded spike
outcomes describe a repo state where the deployment/launcher runtime slices,
the shipped CLI migration slices, and the MCP/tooling foundations are complete
for their bounded scopes.

That does not mean the full backend runtime is fully Go-owned. User-facing
AI/chat routing is still partially Python-owned, but the rewrite no longer
plans to recreate managed `setta_llm` in Go. The current bounded Go-owned
Phase 12 surface now includes:

- `internal/externalagentconfigs`
  - read access to `external_agents.json`
  - bounded preflight checker interface and a minimal concrete checker
  - Claude bridge preflight for Claude CLI resolution plus repo-pinned Python
    `claude-agent-sdk` availability
  - typed OpenCode-managed `settingsManagedBlock` reads for model /
    permission / MCP config
- `internal/externalagents`
  - persisted external-run lookup, latest-run selection, durable chat-state
    reconstruction, placeholder filtering, and context-usage normalization
  - active-run registry, live chat overlay storage, cancellation ownership, and
    approval-response and question-response dispatch foundations
  - external-agent AI-follow snapshot ownership, MCP-metadata-driven follow-id
    extraction, websocket `AIFollowToolArgumentsUpdate` broadcast, and
    canonical temporary-id resolution over active runtime state
  - external-agent send-path validation, history shaping, persisted running-run
    creation, and runtime activation foundations
  - real Codex app-server execution, approval production, terminal
    completion/failure persistence, and same-chat `threadId` continuity
  - real OpenCode sidecar execution, bounded runtime `opencode.json`
    generation, terminal completion/failure persistence, and same-chat
    `sessionId` continuity
  - real Claude SDK sidecar execution, bounded `.claude/settings*.json`
    ownership, terminal completion/failure persistence, approval/question
    routing, and same-chat `sessionId` continuity
- `internal/httpapi/ai_routes.go`
  - thin Go transport for:
    - `/getLLMResponse` (external-agent branch only)
    - `/getExternalAgentChat`
    - `/getAIFollowSnapshot`
    - `/stopExternalAgentRun`
    - `/respondExternalAgentApproval`
    - `/respondExternalAgentQuestion`

The tracked Phase 12 work is recorded across
`phase-12-managed-chat-runtime-and-ai-route-foundation.md` and the focused
follow-on slice docs under this folder. The external-agent runtime, execution,
parity, attachment, prompt, and AI-follow slices are now landed for their
bounded scopes.

The completed `phase-12-codex-app-server-executor-runtime.md` and
`phase-12-opencode-executor-and-question-runtime.md` plus the now-completed
`phase-12-claude-sdk-bridge-executor-runtime.md` slices prove the runtime split
with real Codex, OpenCode, and Claude execution plus Go-owned active
question-response transport. The first Codex-first parity closeout slice is now
also landed in
`phase-12-codex-rich-item-tool-result-and-mcp-status-parity.md`:

- richer Codex `response_item` handling for reasoning, tool calls, and tool
  results
- Go-owned external MCP runtime-status snapshot persistence and IDE-route
  readback

The bounded OpenCode follow-on tracked in
`phase-12-opencode-rich-item-tool-result-and-mcp-status-parity.md` is now
landed:

- richer OpenCode tool-result persistence over the shared runtime helpers
- OpenCode external MCP runtime-status seeding and persisted snapshot parity

The bounded Claude follow-on tracked in
`phase-12-claude-rich-item-tool-result-and-mcp-status-parity.md` is now
landed:

- Claude streamed `tool_result` persistence plus persisted `tool_result` run
  events
- Claude external MCP runtime-status seeding from `mcpConfig`, runtime capture
  from SDK `system_message`, and persisted snapshot parity

The bounded Codex follow-on tracked in
`phase-12-codex-raw-tool-item-parity.md` is now also landed:

- Codex raw non-`response_item` tool-item persistence for command execution,
  file changes, MCP tool calls, and the Python-tracked generic item types
- buffered command/file output-delta aggregation when terminal item payloads
  omit aggregated output or diff fields
- persisted `tool_result` run events for those raw Codex tool outputs

The bounded follow-on tracked in
`phase-12-external-agent-prompt-and-app-generation-parity.md` is now also
landed:

- external agent-profile `systemPrompt` content now reaches Go-owned external
  runs through the shared executor `systemPrompt` payload
- external app-generation-mode prompt sections and reference-image prompt
  inputs now reach Go-owned external runs with Go-owned normalization and typed
  validation

The bounded follow-on tracked in
`phase-12-external-agent-attachment-payload-parity.md` is now also landed:

- external-agent runs now build `attachmentText`,
  `attachmentTextNoImages`, and `attachmentUrls` from chat message
  attachments in Go
- Go now exposes the token-backed attachment download route required by those
  external-agent URLs

The bounded follow-on tracked in
`phase-12-external-agent-ai-follow-snapshot-and-realtime-parity.md` is now
also landed:

- external-agent AI-follow snapshot state is now Go-owned through
  `/getAIFollowSnapshot`
- live external-agent `AIFollowToolArgumentsUpdate` websocket behavior is now
  Go-owned over the active runtime's canonical tool-argument state
- approval/question responses plus run stop/teardown now clear follow state
  through the same argument-update channel the frontend already consumes

The subsequent closeout inventory then found and closed one last concrete
external-agent dependency in
`phase-12-agent-run-list-read-transport-closeout.md`:

- the frontend now reads `GET /getAgentRuns` from Go before external stop and
  for agent-run-backed history/overview surfaces
- that transport is thin and store-backed over `internal/agentruns.RunStore`

Phase 12's tracked external-agent scope is therefore complete for the current
rewrite boundary. A short rerun after the landing confirmed that the remaining
frontend Python-owned agentic reads are now outside that boundary:

- `GET /getAgentProfiles`
- `GET /getPromptTemplates`
- `GET /getAgenticSummaryCacheStatus`

Those routes were later moved under bounded Phase 13 docs. They are no longer
a hidden external-agent blocker, and the direct app-start hydration plus direct
settings mutation surface discussed below is now Go-owned for the current
bounded scope.

The first post-Phase-12 bounded slice tracked in
`phase-13-agent-profile-read-transport.md` is now landed:

- the frontend now hydrates `GET /getAgentProfiles` from Go over the canonical
  `agent_profiles.json` store
- prompt-template transport and agentic summary-cache status remain deferred to
  later bounded slices because they need different source-of-truth owners

The next bounded post-Phase-13 slice tracked in
`phase-13-prompt-template-read-transport.md` is now landed:

- the frontend now hydrates `GET /getPromptTemplates` from Go
- Go now owns the file-backed prompt-template read owner for
  `setta_files/prompts/*.json`
- `GET /getAgenticSummaryCacheStatus` remained the next bounded dependency
  because it needs a different runtime owner than the prompt-template file path

The next bounded post-Phase-13 slice tracked in
`phase-13-agentic-summary-cache-status-transport-and-owner.md` is now landed:

- the chat-area settings UI now reads
  `POST /getAgenticSummaryCacheStatus` from Go
- Go now owns the bounded summary-cache-status owner over the live
  project-state runtime plus `setta_files/agentic_summary_cache.json`
- the follow-up prompt-template CRUD slice is now landed in
  `phase-13-prompt-template-crud-transport.md`

The next bounded post-Phase-13 slice tracked in
`phase-13-prompt-template-crud-transport.md` is now landed:

- Go now owns:
  - `POST /createPromptTemplate`
  - `POST /updatePromptTemplate`
  - `POST /deletePromptTemplate`
- prompt-template transport is now fully Go-owned for the current direct
  frontend surface over the existing prompt-template file store
- the closeout rerun corrected an earlier stale inventory in the Phase 13 docs:
  prompt-template writes were not the last remaining direct frontend Python
  agentic routes

The next bounded post-Phase-13 slice tracked in
`phase-13-external-agent-config-and-health-read-transport.md` is now landed:

- Go now owns:
  - `GET /getExternalAgentConfigs`
  - `GET /getExternalAgentHealth`
- the frontend now hydrates external-agent config list and availability from Go
  over the landed config store and bounded checker
- richer Python-only plugin/env-var/cache preflight semantics remain deferred
  instead of being silently bundled into this read slice
- at that point, the current remaining direct frontend Python-owned agentic
  routes were:
  - `POST /createExternalAgentConfig`
  - `POST /updateExternalAgentConfig`
  - `POST /deleteExternalAgentConfig`

The next bounded post-Phase-13 slice tracked in
`phase-13-engine-config-read-transport.md` is now landed:

- Go now owns:
  - `GET /getEngineConfigs`
- the frontend now hydrates engine-config list state from Go over the landed
  file-backed `internal/agentruns.EngineStore`
- the Go route intentionally stays IDE-gated for the current bounded settings
  surface instead of preserving Python's broader read exposure without a
  concrete caller
- at that point, the current remaining direct frontend Python-owned agentic
  routes were:
  - `POST /createExternalAgentConfig`
  - `POST /updateExternalAgentConfig`
  - `POST /deleteExternalAgentConfig`

The next bounded post-Phase-13 slice tracked in
`phase-13-transcription-profile-read-transport-and-capability-owner.md` is now
landed:

- Go now owns:
  - `GET /getTranscriptionProfiles`
- the frontend now hydrates transcription-profile list state from Go over a new
  bounded transcription-profile store/service owner
- `supportsRealtimeTranscription` now comes from live Go LLM config resolution
  on every read instead of trusting the stored profile payload
- the Go route intentionally stays IDE-gated for the current bounded settings
  surface instead of preserving Python's broader read exposure without a
  concrete caller
- at that point, the current remaining direct frontend Python-owned agentic
  routes were:
  - `POST /createExternalAgentConfig`
  - `POST /updateExternalAgentConfig`
  - `POST /deleteExternalAgentConfig`

The next bounded post-Phase-13 slice tracked in
`phase-13-engine-config-update-transport.md` is now landed:

- Go now owns:
  - `POST /updateEngineConfig`
- the frontend now updates engine-config state from a Go-owned mutation route
  over the landed `internal/agentruns.EngineStore`
- websocket `EngineConfigsUpdated` parity remains intentionally deferred
  because the current direct callers already update local state from the
  mutation response
- at that point, the current remaining direct frontend Python-owned agentic
  routes were:
  - `POST /createExternalAgentConfig`
  - `POST /updateExternalAgentConfig`
  - `POST /deleteExternalAgentConfig`

The next bounded post-Phase-13 slice tracked in
`phase-13-agent-profile-crud-transport.md` is now landed:

- Go now owns:
  - `POST /createAgentProfile`
  - `POST /updateAgentProfile`
  - `POST /deleteAgentProfile`
- the frontend now mutates agent-profile state through Go-owned CRUD routes
  over the landed `internal/agentprofiles.Store`
- watcher and websocket fan-out remain intentionally deferred because the
  current Python route handlers do not broadcast directly and the current
  frontend callers already update local state from the mutation response
- at that point, the current remaining direct frontend Python-owned agentic
  routes were:
  - `POST /createExternalAgentConfig`
  - `POST /updateExternalAgentConfig`
  - `POST /deleteExternalAgentConfig`

The next bounded post-Phase-13 slice tracked in
`phase-13-transcription-profile-crud-transport.md` is now landed:

- Go now owns:
  - `POST /createTranscriptionProfile`
  - `POST /updateTranscriptionProfile`
  - `POST /deleteTranscriptionProfile`
- the frontend now mutates transcription-profile state through Go-owned CRUD
  routes over the landed `internal/transcriptionprofiles.Store` and
  `internal/transcriptionprofiles.Service`
- runtime config validation plus realtime-transport eligibility now stay
  source-of-truth in Go instead of in the route layer
- websocket `TranscriptionProfilesUpdated` parity remains intentionally
  deferred because the current direct callers already update local state from
  the mutation response

The next bounded post-Phase-13 slice tracked in
`phase-13-external-agent-config-crud-transport.md` is now landed:

- Go now owns:
  - `POST /createExternalAgentConfig`
  - `POST /updateExternalAgentConfig`
  - `POST /deleteExternalAgentConfig`
- the frontend now mutates external-agent config state through Go-owned CRUD
  routes over a new `internal/externalagentconfigs.Service` above the landed
  config store
- per-config Codex/OpenCode canonical settings-file sync and stale-artifact
  cleanup are now Go-owned at that same service boundary
- shared Claude `.claude/settings*.json` ownership and live plugin-adapter
  registry validation remain intentionally deferred instead of being bundled
  into generic config CRUD
- the direct frontend settings mutation surface tracked through Phase 13 is now
  Go-owned for the current bounded scope

The bounded closeout inventory tracked in
`phase-13-remaining-agentic-route-inventory-and-rerank.md` is now landed:

- the remaining Python-owned routes in `backend/setta/routers/agentic.py` no
  longer hide another direct Phase 13 settings or hydration blocker
- current leftover routes split into:
  - managed-agent / run-chain runtime routes tied to intentionally de-scoped
    managed `setta_llm` and Python runtime owners
- the next rewrite slice should therefore come from a concrete new caller or
  an explicit product/runtime decision, not from assuming another automatic
  transport migration is still pending

The bounded follow-on tracked in
`phase-13-engine-config-create-delete-transport.md` is now landed:

- Go now owns:
  - `POST /createEngineConfig`
  - `POST /deleteEngineConfig`
- the dormant engine-config create/delete transport noted in the inventory is
  now Go-owned over the landed `internal/agentruns.EngineStore`
- websocket `EngineConfigsUpdated` parity remains intentionally deferred
  because there is still no concrete caller that requires it

The bounded follow-on tracked in
`phase-13-agentic-single-item-read-transport.md` is now landed:

- Go now owns:
  - `POST /getAgentProfile`
  - `POST /getPromptTemplate`
  - `POST /getExternalAgentConfig`
  - `POST /getEngineConfig`
- the remaining non-runtime single-item agentic transport is now Go-owned over
  the landed stores and service boundaries
- the remaining Python-owned agentic surface was reduced to:
  - `POST /getAgentRun`
  - `POST /startAgentRun`
  - `POST /stopAgentRun`
  - `POST /startRunChain`
  - `POST /stopRunChain`

The bounded follow-on tracked in
`phase-13-agent-run-read-transport-closeout.md` is now landed:

- Go now owns:
  - `POST /getAgentRun`
- the remaining Python-owned agentic surface is now runtime-only mutation
  work:
  - `POST /startAgentRun`
  - `POST /stopAgentRun`
  - `POST /startRunChain`
  - `POST /stopRunChain`

That remaining runtime-only surface is now tracked in
`phase-14-managed-agent-and-run-chain-runtime-mutation-plan.md`:

- the rewrite no longer treats those routes as hidden transport cleanup
- current Python behavior and the landed Go runtime foundations are now
  documented in one place before any further code work
- the clean-break recommendation is to reopen managed
  `start/stopAgentRun` first, only if a real caller or explicit product
  decision requires it
- run-chain remains a separate later runtime decision instead of being bundled
  into the first follow-on slice

The bounded follow-on tracked in
`phase-14-managed-agent-start-stop-runtime-and-transport.md` is now landed:

- Go now owns:
  - `POST /startAgentRun`
  - `POST /stopAgentRun`
- managed active-run registry, cancellation, and transport ownership now live
  in Go over the existing managed-run service foundations
- the route is intentionally managed-only in Go and rejects
  external-agent-backed profiles instead of preserving Python's hybrid
  dispatch behavior
- the remaining Python-owned agentic runtime mutation surface is now only:
  - `POST /startRunChain`
  - `POST /stopRunChain`

The practical next step is still not "rerun the early spikes" or broadly
re-decide the initial library choices. MCP, LSP, and file-state decisions are
already locked in practice by the current Go implementation. The PTY runtime
shape is also proven, but the PTY library choice still has a bounded Unix-path
follow-up tracked in `spike-pty.md`. New work should start from the remaining
real callers and product dependencies, not by reopening the completed
external-agent runtime or Phase 13 settings surfaces. The next bounded priority
is no longer inventory or transport cleanup; those are now complete. The next
bounded priority should only be chosen after an explicit product/runtime
decision identifies whether the remaining run-chain Python runtime surface
still matters.

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
  - `backend/setta/routers/ai.py`
  - `backend/setta/llm/*.py`
  - `backend/setta/mcp/*.py`
  - `docs/reference/mcp-system-overview.md`
  - `docs/reference/chat-sections.md`
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

### Locked In Practice

- MCP SDK choice:
  - using `github.com/modelcontextprotocol/go-sdk` behind `internal/mcpx`
- LSP stack:
  - using a custom `internal/lsp` manager with explicit stdio framing and
    lifecycle control

These no longer need pre-implementation spikes in the current repo state. See
`spike-mcp.md` and `spike-lsp.md` for the recorded outcomes.

### Chosen In Docs, Runtime Follow-Up Still Pending

- PTY layer:
  - current code uses `github.com/aymanbagabas/go-pty` behind
    `internal/terminals`
  - current rewrite recommendation is to switch to `github.com/creack/pty`
    for the Unix PTY path because it is the more conservative and widely used
    ecosystem choice
  - Windows PTY handling should be an explicit follow-up decision instead of
    being inherited from a smaller cross-platform wrapper

See `spike-pty.md` for the updated PTY note.

### Still Defer Until Needed

- Cookie codec:
  - likely `github.com/gorilla/securecookie`
- LLM provider SDK boundaries:
  - use official provider SDKs only at adapter edges
- Embedded DB fallback:
  - defer unless a real indexing or transaction need emerges

These should be decided only when a concrete bounded slice needs them.

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

- `cmd/setta`
  - main shipped user-facing CLI/router
- `cmd/setta-server`
  - main backend server
- `cmd/setta-mcp-bridge`
  - stdio bridge for MCP use cases
- `cmd/setta-cli`
  - narrower helper/diagnostic CLI surface if it remains useful alongside the
    shipped `cmd/setta` router

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

## Early Spike Records

These were the original uncertainty-reduction areas. They are no longer pending
prerequisites in the current repo state.

### MCP Spike

Status:

- complete

Outcome:

- use `github.com/modelcontextprotocol/go-sdk` behind a tight wrapper in
  `internal/mcpx`
- keep auth, namespacing, metadata, scope enforcement, and temporary-id
  translation custom
- use authenticated SSE for the Setta-owned server transport; keep the internal
  client capable of `sse`, `streamable_http`, and `stdio`

### PTY Spike

Status:

- follow-up selected

Outcome:

- current code uses `github.com/aymanbagabas/go-pty` behind
  `internal/terminals`
- current rewrite recommendation is to move the Unix PTY path to
  `github.com/creack/pty`
- keep attach/detach/history, resize, termination, scope filtering, and input
  policy custom
- keep websocket and HTTP transport layers thin above the PTY owner

### LSP Spike

Status:

- complete

Outcome:

- keep a custom `internal/lsp` session/runtime owner
- keep stdio framing and lifecycle control explicit
- support Python via current-process basedpyright first

### File-State Spike

Status:

- resolved through implementation

Outcome:

- `internal/statefs` plus the Phase 3 project-state/store work now own atomic
  writes, path policy, schema versioning, and temp-dir persistence coverage
- this is no longer a pending precondition before other rewrite work

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

1. Keep the roadmap and phase docs synchronized with the current shipped code
   so closed phases do not look active again and the remaining Python-owned
   agentic route inventory plus its reranked outcome do not disappear from
   planning context.
2. Treat MCP, LSP, and file-state choices as locked unless a concrete new
   requirement breaks them, and keep the PTY discussion bounded to the planned
   `go-pty` to `creack/pty` Unix follow-up rather than reopening terminal
   architecture more broadly.
3. Start any future agentic follow-on from the Phase 14 runtime-mutation plan
   and real caller analysis, not by reopening completed Phase 12 runtime work
   or early spikes.
4. Prefer stabilization and reference-suite expansion where completed runtime
   owners still have thin regression protection, but do not use that as a
   substitute for choosing a concrete next caller-backed or product-backed
   Python-owned agentic follow-on.
5. Treat Go-owned managed `setta_llm` runtime mutation work as explicitly
   deferred unless a later product decision reopens the Phase 14 managed
   `start/stopAgentRun` slice.
6. Limit future Python follow-up outside Phase 12 to explicitly chosen
   packaging, installer, or release-surface work rather than rediscovering
   backend-runtime scope.

## Planning Conclusion

This rewrite is viable, but only if we treat it as a clean-break stateful-runtime rebuild, not as a framework swap.

The safest path is:

- lock the boring infrastructure choices now
- keep uncertain subsystems bounded and explicit when new ones appear
- rebuild project state and realtime early
- defer scope growth until it is selected deliberately and documented
