# Workspace Agent API Plan

Date: 2026-07-07

## Scope

This plan defines an agent-facing API, CLI, and skill surface for managing
Setta's niri-style workspace panes.

The target user experience is that an agent can inspect the current workspace,
focus a particular pane, rearrange panes, open or close panes, and interact with
existing pane contents through the pane's own domain contract. Examples:

- focus the terminal pane
- move the workflow graph to the right
- close a stale details pane
- send text to an existing terminal pane
- send or steer chat in the active chat pane
- read the latest content from a chat, terminal, workflow graph, or details pane

The current workflow-builder skill and `setta workflow` CLI remain focused on
workflow definitions and executions. Workspace management should be a separate
domain surface.

## Compatibility Policy

This work is a clean break. Do not add:

- backward compatibility paths
- legacy support
- migrations
- transitional adapters
- dual-read or dual-write behavior
- old-field aliases
- compatibility shims
- shadow endpoints that translate old layout writes into new operations
- silent fallback behavior

When the workspace operation API replaces an existing mutation path, update all
callers in the same change and remove or stop exposing the obsolete mutation
path. Do not keep a compatibility bridge for agents, renderer code, tests, or
remote clients.

If a persisted workspace UI schema change is required, bump the schema and make
old state fail loudly with an explicit reset/recreate path. Do not migrate old
state into the new shape.

## Non-Goals

Do not make agents write raw workspace layout JSON as the primary mutation
path.

Do not add generic screen scraping, arbitrary global key injection, fuzzy title
matching, or heuristic "window" discovery.

Do not make the workflow-builder skill responsible for workspace management.

Do not target the external Linux niri compositor in the first implementation.
External compositor control can be a later provider behind a separate capability
boundary. This plan is for Setta's in-app niri-style workspace.

Do not add MCP or Codex app-server dynamic tools as the canonical workspace
management interface.

## Recommendation

Add a `workspace-manager` skill plus a deterministic `setta workspace` CLI/API.

```text
In-app agents
External agents
        |
        v
workspace-manager skill
        |
        v
setta workspace CLI
        |
        v
Workspace backend API
        |
        v
Workspace UI state, renderer sync, and per-surface services
```

The backend should own the command contract, validation, authorization, audit
records, persisted layout updates, and event emission. Renderers should consume
workspace layout updates and report live surface state through typed channels.

Agents should operate on typed commands:

```text
focus pane
move pane
open pane
close pane
rename pane
resize pane
reorder pane
read pane metadata
read surface content through the surface contract
write surface input through the surface contract
```

They should not synthesize full layout files unless explicitly performing a
validated import/export operation.

## Current State

The backend already persists workspace UI layout state through
`ReadWorkspaceUILayout` and `SaveWorkspaceUILayout`:

```text
POST /workspaces/ui/layout/read
POST /workspaces/ui/layout/save
```

The renderer already has live operations for focus, movement, close, pane
configuration, and drop reordering in the workspace layout store.

Terminal content already has backend HTTP APIs for create, attach, input,
resize, close, profiles, and event streaming.

Chat, workflow graph, workflow node details, and semantic details already have
domain APIs, but they are not yet exposed as pane-targeted workspace operations.

The missing pieces are:

- a command contract that describes workspace operations without raw layout
  rewrites
- a backend reducer or command service that applies those operations
- a push path from backend workspace state changes to all active renderers
- per-surface read/write adapters that map a pane to the correct domain API
- a CLI and skill that teach agents the safe operation lifecycle

## Contract Principles

The API should return structured JSON for both success and failure. Failures
should include stable error codes and typed fields, not prose-only messages.

Pane identity must be explicit. Mutating commands should take `paneId` or another
stable backend-owned ID. Convenience selectors may be read-only or must fail
when ambiguous.

Capabilities must be explicit. A pane list response should include the
operations and surface IO modes currently supported for each pane. Agents should
inspect capabilities before attempting a write.

Surface IO should use domain contracts:

- terminal input writes bytes to a terminal session
- chat writes create, queue, or steer chat messages
- workflow graph writes graph/domain commands
- details panes read their referenced node/run/projection
- browser panes, when productized, use browser-specific commands

Avoid a single generic "type into window" abstraction. Raw key input can be a
last-resort capability for surfaces that explicitly support it, and it should be
separate from semantic commands like "send chat message".

## Proposed CLI Surface

Initial read-only commands:

```text
setta workspace current
setta workspace panes list
setta workspace panes read <pane-id>
setta workspace schema
```

Layout mutation commands:

```text
setta workspace panes focus <pane-id>
setta workspace panes move <pane-id> --direction left|right|up|down
setta workspace panes close <pane-id> [--surface-close safe|force|none]
setta workspace panes open --input open-pane.json
setta workspace panes rename <pane-id> --title "..."
setta workspace panes resize <pane-id> --width-px <n>
setta workspace panes resize <pane-id> --width-scale <n>
setta workspace panes resize <pane-id> --height-px <n>
setta workspace panes resize <pane-id> --height-scale <n>
setta workspace panes resize <pane-id> --reset-height
setta workspace panes reorder --input reorder.json
setta workspace layout apply --input layout-operations.json
```

Per-surface commands:

```text
setta workspace surfaces read <pane-id> [--mode summary|snapshot|content]
setta workspace surfaces write <pane-id> --input surface-write.json
```

Terminal-specific convenience commands:

```text
setta workspace terminals read <pane-id>
setta workspace terminals writes prepare <pane-id> --input terminal-write.json
setta workspace terminals writes commit <prepared-write-id>
setta workspace terminals close <pane-id> --confirmed
```

Chat-specific convenience commands:

```text
setta workspace chats read <pane-id> [--limit <n>]
setta workspace chats send <pane-id> --input message.json
setta workspace chats steer <pane-id> --input steering.json
setta workspace chats queue <pane-id> --input message.json
```

Every command should accept `--app-data-dir DIR` consistently with
`setta workflow`.

## Proposed API Shape

Use backend-owned Go contracts and regenerate TypeScript surfaces from the HTTP
endpoint registry.

Candidate endpoints:

```text
GET  /workspaces/ui/schema
POST /workspaces/ui/panes/list
POST /workspaces/ui/panes/read
POST /workspaces/ui/panes/operation
POST /workspaces/ui/surfaces/read
POST /workspaces/ui/surfaces/write
GET  /workspaces/ui/events
```

`/workspaces/ui/panes/operation` should accept a discriminated union:

```json
{
  "workspaceId": "workspace_123",
  "operation": {
    "kind": "focus_pane",
    "paneId": "workspace_pane_1"
  }
}
```

Other operation kinds should include:

```text
open_pane
close_pane
move_pane
rename_pane
resize_pane
resize_column
resize_pane_row
apply_layout_operations
reorder_pane
configure_pane
set_presentation_mode
```

`apply_layout_operations` should apply multiple layout operations as one
validated transaction. For example, a request like "widen panes X, Y, and Z, and
make panes A and B half height" should resolve each named pane to a stable
`paneId`, compute explicit width and height operations, validate the combined
layout, then persist it once. If any target pane or dimension update is invalid,
the whole operation fails without partial layout changes.

The response should include:

```text
workspaceId
revision
layout
changed
operationResult
beforeAfterDimensions
warnings
```

The API should maintain a monotonic layout revision. Renderer clients can ignore
stale updates and apply newer ones deterministically.

## Pane Capability Model

`panes list` should return enough information for an agent to decide what it can
do without guessing:

```text
paneId
surfaceId
surfaceKind
title
subtitle
focused
column/row/plane location
runtimeState
canFocus
canMove
canClosePane
surfaceCloseModes
readModes
writeModes
contentRefs
```

Example `contentRefs`:

```text
chat: conversationId
terminal: sessionId, profileId, cwd
workflow-graph: definitionId, executionId, viewMode
workflow-node-details: definitionId, executionId, nodeId, nodeExecutionId
semantic-node-details: nodeId
```

If a pane does not have the required content reference, the command should fail
with a specific error. Do not infer the target from titles or labels.

## Surface IO Model

### Chat

Chat pane operations should use the existing chat service. A chat pane should
expose the active `conversationId` it controls.

Supported writes:

- send message when no run is active
- queue message while a run is active
- steer active run

Supported reads:

- conversation metadata
- recent message page
- active run state
- queued messages

Initial chat pane commands should operate only on the conversation currently
bound to the pane. Switching a chat pane to another conversation is a separate
explicit pane configuration operation and should not happen implicitly inside
read, send, queue, or steer commands.

### Terminal

Terminal pane operations should use the terminal service. The pane should expose
or resolve a terminal `sessionId`.

Supported writes:

- byte input
- paste text
- resize through normal terminal resize paths
- close process through existing safe/confirmed close semantics

Supported reads:

- session summary
- screen snapshot or replay buffer
- recent output page
- process state

Terminal reads should include both the current screen snapshot and a bounded
recent output page. For example, an agent needs the screen snapshot to answer
"what prompt is visible now?" and recent output to inspect a test failure that
scrolled above the visible terminal. A useful response should include fields
such as `screenText`, `cursor`, `cols`, `rows`, `recentOutput`, and
process/session status.

Terminal writes need stronger integrity guarantees than ordinary text commands.
The main risk is not that the agent chooses the wrong text; it is that Setta
targets the wrong session, reconstructs different bytes after approval, treats a
partial PTY write as success, or interleaves concurrent writes.

Use an exact byte contract for terminal input:

- requests carry `dataBase64`, `byteCount`, and `sha256`
- the backend decodes once and verifies the byte count and hash before writing
- approval displays the decoded byte preview with control characters escaped,
  plus `workspaceId`, `paneId`, `sessionId`, byte count, and hash
- commit writes the already prepared bytes, not a reconstructed string
- writes are serialized per terminal session
- partial PTY writes must continue until all bytes are written or fail loudly
- success responses return `writtenByteCount` and the same `sha256`

Prefer a prepare/commit flow for agent-originated terminal writes:

```text
prepare terminal write -> return preparedWriteId, preview, byteCount, sha256
approval -> commit preparedWriteId
```

Prepared writes should expire quickly and should be bound to the target
workspace, pane, session, authenticated device/session, and byte hash.

### Workflow Graph And Details

Workflow panes should not be controlled through DOM events. They should expose
domain operations:

- read graph projection
- focus node
- open node details pane
- read node trajectory
- start/cancel/steer workflow node run where supported

These operations should route through existing workflow/orchestrator APIs.

### Browser Or Native View Panes

Real product browser panes are deferred unless they become part of the persisted
workspace surface set.

When added, browser pane control should be explicit:

- read URL/title/load state
- navigate to URL
- capture snapshot
- send supported key/mouse input
- close or reload

Do not use this as a generic fallback for all pane types.

## Close Semantics

Closing a pane and closing its underlying surface are different operations.

`close_pane` removes the pane from the layout. It should fail or warn when the
surface has an active process or other state that would continue running.

`surface_close` asks the surface domain to close the underlying resource:

```text
none  - remove only the pane
safe  - ask the surface to close without force
force - force close when the surface supports it
```

For terminals, use the existing safe/confirmed terminal close behavior. For
chat, closing the pane should not delete the conversation. For workflow details,
closing the pane should not mutate workflow execution state.

## Renderer Synchronization

The target architecture is push-based.

Backend workspace operations should persist the new layout, increment the
revision, and emit a workspace UI event. Active renderers subscribe and apply
the new layout. Renderer-originated user actions must call the same backend
operation API in the same product change that exposes workspace write
operations, so the backend is the single mutation authority.

Do not ship agent-originated backend operations while renderer-originated layout
mutations still write through a separate local path. Development branches may
stage the work internally, but the merged product state must not contain dual
writers or transitional routing.

If a renderer has unsaved local layout changes when a backend operation arrives,
it should resolve through revisions and explicit conflicts, not silent last-write
wins.

Decision: event sync and backend-owned write operations ship as one clean
product change. Event sync may land first internally if needed, but workspace
write commands must not be exposed until renderer-originated layout actions also
use the backend operation API.

## Workspace Manager Skill

Add a `workspace-manager` skill separate from `workflow-builder`.

The skill should instruct agents to:

1. Resolve the active workspace.
2. List panes and capabilities.
3. Select a pane by stable ID.
4. Read the pane or surface state needed for the task.
5. Apply the smallest typed operation.
6. Re-read the pane or workspace state to confirm the result.

The skill should explicitly forbid:

- editing `ui-state.json` by hand
- guessing pane IDs from titles
- using chat APIs against terminal panes or terminal APIs against chat panes
- sending raw input when a semantic domain command exists
- reconstructing terminal write bytes after approval
- closing underlying processes without explicit user intent or command support

## Security And Audit

Workspace commands can be destructive or externally visible. Treat them as
write-capable runtime commands.

Audit records should include:

- authenticated device/session
- workspace ID
- command name
- pane ID and surface ID
- operation kind
- surface target reference when present
- outcome
- structured error or warning fields

High-risk operations should require explicit confirmation or a command mode that
cannot be triggered accidentally:

- closing terminal processes
- force-closing browser/native views
- sending terminal input
- submitting chat messages
- steering active agent runs
- workflow run control

The CLI should fail loudly when the runtime is unavailable, the active workspace
cannot be resolved, a pane is missing, a selector is ambiguous, or the requested
capability is unsupported.

Low-risk layout operations such as read, focus, rearrange, and opening an empty
pane do not require approval. Multi-pane layout resize transactions are also
low-risk when they only affect pane geometry and include a before/after preview.
High-risk operations require operation-specific approval text that includes the
pane title, surface kind, target reference, and an exact payload preview. Browser
input and navigation should also require approval when browser pane support is
added.

For terminal writes, the approval target and payload are part of the safety
contract. Approval must reference immutable prepared bytes by ID and hash. The
commit step must fail if the prepared write expired, the session changed, the
target pane no longer resolves to the same terminal session, or the byte hash no
longer matches.

## Implementation Phases

### Phase 1: Read-Only Workspace Introspection

Add `setta workspace current`, `setta workspace schema`, `panes list`, and
`panes read`.

Use existing workspace session and workspace UI layout services. Include
capability descriptors even if many capabilities initially report unsupported.

Verification:

- Go tests for API handlers and CLI response validation
- generated backend contracts updated from Go-owned endpoint registry
- focused renderer tests for pane metadata mapping

Progress on 2026-07-07:

- Added the authenticated read-only workspace UI endpoints:
  `GET /workspaces/ui/schema`, `POST /workspaces/ui/panes/list`, and
  `POST /workspaces/ui/panes/read`.
- Added Go-owned workspace UI schema and pane descriptor contracts covering
  stable pane IDs, surface IDs/kinds, title/subtitle, focus state, column/row/
  plane location, `layout_only` runtime state, read-only capability descriptors,
  and explicit content reference slots. The initial implementation exposes only
  deterministic content references already present in persisted layout state
  (terminal pane config and workflow-node-details config) and does not infer
  chat, workflow graph, or semantic detail targets from titles.
- Added `setta workspace current`, `setta workspace schema`,
  `setta workspace panes list`, and `setta workspace panes read <pane-id>`.
  The commands use local runtime auth, resolve the current workspace from the
  active workspace session, validate response shape, and print structured JSON.
- Missing persisted workspace UI layout now returns `layoutPresent: false` with
  an empty pane list instead of synthesizing renderer-only default panes.
- Regenerated the backend TypeScript contract surface and HTTP contract
  snapshot from the endpoint registry; backend protocol version is now `14`.
- Verification: `./scripts/go.sh test ./internal/workspaceui`,
  `./scripts/go.sh test ./internal/httpapi`,
  `./scripts/go.sh test ./cmd/setta`, `pnpm -C desktop typecheck`,
  `pnpm -C desktop build`, and
  `node desktop/tests/electron/run-workflows.mjs --workflow pane-focus-click`
  passed.
- Additional observation: `workflow-graph-smoke` was attempted after rebuilding
  for protocol `14`; it rendered the graph but timed out waiting for an existing
  projection-update assertion. The passing `pane-focus-click` workflow is the
  app-path verification for this read-only workspace/layout slice.
- Audit follow-up: tightened persisted workspace UI validation so
  `terminalConfig` is rejected on non-terminal panes instead of being silently
  omitted from pane introspection.
- Renderer-facing follow-up: exposed the read-only workspace UI schema, pane
  list, and pane read operations through the Electron IPC/preload `SettaAPI`
  surface and the web runtime adapter. The workspace layout renderer now loads
  pane descriptors for real workspaces, maps them by stable pane ID, exposes the
  load status/counts on the workspace layout root for deterministic inspection,
  and reports unavailable API, descriptor load, or validation failures through
  the existing layout recovery notice rather than silently ignoring them. The
  mapper rejects duplicate pane IDs and multiple focused descriptors.
- Verification for the renderer-facing follow-up:
  `pnpm -C desktop exec vitest run src/main/workspace-ui-ipc.test.ts src/preload/index.test.ts src/renderer/src/workspace-layout/workspace-pane-metadata.test.ts src/renderer/src/workspace-layout/workspace-ui-layout.test.ts`,
  `pnpm -C desktop typecheck`, `pnpm -C desktop build`, and
  `node desktop/tests/electron/run-workflows.mjs --workflow pane-focus-click`
  passed. The Electron workflow now asserts that the production renderer loads
  the seeded workspace's pane metadata through the main/preload/backend path.
- Final gate: `./scripts/format.sh` and `./check_quality.sh --git-changes`
  passed. During the gate, stale backend-supervisor ready-event test fixtures
  that still hardcoded protocol `13` were updated to receive the generated
  backend protocol version from the test environment.
- Phase 1 is complete for the current read-only workspace introspection surface.
  The next implementation phase is backend-owned layout operations with renderer
  write cutover and push synchronization as required below.

### Phase 2: Backend-Owned Layout Operations

Add typed pane operations for focus, move, close-pane, rename, resize, open, and
reorder.

Resize support should include:

- pane-targeted column width changes with absolute and relative inputs
- pane-targeted height changes with absolute and relative inputs
- row/plane height changes when multiple panes share a visual row
- multi-pane atomic transactions for requests that affect several panes at once

Every resize response should include before/after dimensions for the affected
panes and columns so agents can confirm results without inferring from rendered
pixels.

Initial open/configure support should cover terminal, chat, and workflow graph
panes. Workflow node details can be added when the command requires explicit
`definitionId`, `executionId`, and `nodeId` references. Settings, semantic
details, and browser panes are deferred until their command contracts are
clearly useful.

Implement operation validation in Go. Either port the necessary deterministic
layout reducer from the renderer or extract a shared operation model that both
backend and renderer can consume without hardcoded mirrors.

Cut over renderer-originated layout mutations to the backend operation API in
the same product change. Remove or stop exposing any superseded raw layout
mutation endpoint rather than keeping it as a compatibility path.

Verification:

- unit tests for every operation and invalid case
- HTTP contract tests
- CLI tests against temporary app data
- Electron E2E proving an agent-originated operation updates the production
  renderer and persists across reload

Progress on 2026-07-07:

- Added the Phase 2 persisted layout revision prerequisite without exposing
  workspace write commands to agents. `WorkspaceUILayout` now has a required
  positive `revision`, and the persisted workspace UI layout schema is now
  version `2`.
- Regenerated the backend TypeScript contract surface and HTTP contract
  snapshot from the Go-owned endpoint registry; backend protocol version is now
  `15`.
- The workspace UI store now fails loudly on schema-1 persisted UI layouts and
  schema-2 layouts without a positive revision. No migration, compatibility
  shim, dual-read path, or silent fallback was added.
- The renderer layout store can start from a restored persisted revision, and
  renderer whole-layout saves now include the current store revision so restored
  layouts do not reset to revision `1` on the next save. This keeps the
  existing renderer save path coherent while backend-owned operations and event
  sync are still unexposed.
- Updated Electron workflow fixtures that seed workspace UI layouts to write
  schema version `2` with revision `1`.
- Verification:
  `./scripts/go.sh test ./internal/workspaceui ./internal/httpapi`,
  `./scripts/go.sh test ./cmd/setta`,
  `pnpm -C desktop exec vitest run src/renderer/src/workspace-layout/layout-store.test.ts src/renderer/src/workspace-layout/workspace-scene.test.ts src/main/workspace-ui-ipc.test.ts src/preload/index.test.ts src/renderer/src/workspace-layout/workspace-pane-metadata.test.ts src/renderer/src/workspace-layout/workspace-ui-layout.test.ts`,
  `pnpm -C desktop typecheck`, `pnpm -C desktop build`, and
  `node desktop/tests/electron/run-workflows.mjs --workflow pane-focus-click`
  passed.
- Audit follow-up: added an explicit renderer recovery action for persisted
  layout load failures. The recovery notice now offers a recreate action that
  intentionally saves the fresh schema-2 layout and only dismisses the notice
  after the save succeeds, instead of relying on a later incidental layout
  mutation to overwrite old state.
- Verification for the audit follow-up:
  `pnpm -C desktop exec vitest run src/renderer/src/workspace-layout/workspace-layout-area-components.test.tsx src/renderer/src/workspace-layout/workspace-ui-layout.test.ts src/renderer/src/workspace-layout/workspace-scene.test.ts src/renderer/src/workspace-layout/layout-store.test.ts`,
  `./scripts/go.sh test ./internal/workspaceui ./internal/httpapi`,
  `./scripts/go.sh test ./cmd/setta`, and `pnpm -C desktop typecheck` passed.
- Backend operation reducer follow-up: added the first backend-only pane
  operation service slice without exposing an HTTP, CLI, or agent write surface.
  `ApplyPaneOperation` currently supports `focus_pane`, validates missing layout
  and missing pane failures with stable operation error codes, persists a
  revision increment only when focus actually changes, and returns the updated
  layout, `changed`, operation outcome, empty dimension changes, and warnings.
- Verification for the backend operation reducer follow-up:
  `./scripts/go.sh test ./internal/workspaceui` passed.
- Backend move operation reducer follow-up: added backend-only `move_pane`
  support without exposing an HTTP, CLI, or agent write surface. The reducer
  validates the typed move direction, moves panes up/down within a column,
  moves panes left/right into adjacent columns in the same plane, treats
  boundary moves as successful no-ops without persisting or incrementing the
  revision, increments the revision and persists once when layout order changes,
  updates pane column ownership for horizontal moves, removes/reindexes emptied
  source columns, and returns a structured move outcome with previous and
  resulting pane locations. Missing panes and invalid directions use stable
  operation error codes.
- Verification for the backend move reducer follow-up:
  `./scripts/go.sh run ./cmd/generate-contracts` completed with no generated
  diffs because the write operation contract is not yet endpoint-exposed, and
  `./scripts/go.sh test ./internal/workspaceui`, `./scripts/format.sh`, and
  `./check_quality.sh --git-changes` passed.
- Remaining Phase 2 work: complete the backend operation reducer/service and
  event sync for close-pane, rename, resize, open, reorder, and multi-operation
  transactions, then cut renderer-originated layout mutations over to that
  backend operation API before exposing agent or CLI workspace mutation
  commands.

### Phase 3: Renderer Event Sync

Add workspace UI event streaming. Active renderers subscribe to layout revision
events and apply backend-originated operations without polling.

This phase should not introduce a second write path. If event sync is required
for the write API to be correct, complete it before exposing workspace write
commands.

Verification:

- deterministic Electron tests through main/preload/renderer/backend/store paths
- reload/restart persistence tests
- multi-client stale revision tests when a second renderer/web client exists

### Phase 4: Terminal Surface IO

Add pane-targeted terminal read/write commands. Reuse existing terminal service
operations for input, resize, and close. Add explicit one-shot terminal screen
snapshot and bounded recent-output APIs if the existing event stream is not
enough for agent reads.

Implement terminal write prepare/commit before exposing agent-originated
terminal input. The prepare step stores immutable decoded bytes with byte count
and hash. The commit step writes those exact bytes to the resolved terminal
session, serializes with other writes for that session, and fails on target
mismatch, hash mismatch, expiry, partial write failure, or closed process.

Verification:

- terminal service tests for read snapshots/pages
- HTTP and CLI tests for pane-to-session resolution
- byte-for-byte terminal write tests covering newline variants, control bytes,
  invalid hashes, wrong byte counts, partial PTY writes, concurrent writes, and
  expired prepared writes
- Electron E2E that writes to an existing terminal pane and reads the result
  through production paths

### Phase 5: Chat Surface IO

Add pane-targeted chat read, send, queue, and steer commands. Resolve chat pane
content references to existing conversation/run APIs.

Initial chat commands should not switch the pane's selected conversation. If
conversation switching is needed, implement it as a separate explicit pane
configuration operation with its own validation and audit record.

Verification:

- deterministic chat workflow E2E through production Electron/main/preload/
  renderer/HTTP/store paths
- queueing during active run
- steering active run
- reload/restart behavior when persistence is touched
- live Codex E2E when ChatGPT auth is available

### Phase 6: Workflow Pane Domain Commands

Expose pane-targeted workflow graph and node-details reads and actions through
the existing orchestrator APIs.

Verification:

- workflow graph projection tests
- Electron E2E opening/focusing details panes from agent commands
- workflow run/trajectory reads through production paths

### Phase 7: Product Browser Pane Support

Only after browser panes are a real persisted product surface, add browser pane
capabilities.

Verification should include native view lifecycle, snapshots, input routing,
focus, close/reload, and performance checks for niri navigation.

## Settled Decisions

No open questions remain for the initial workspace API plan. The decisions above
settle renderer write cutover, terminal reads, chat pane conversation scope,
terminal write integrity, initial open/configure surface kinds, and high-risk
operation approvals.
