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

The backend owns persisted workspace UI layout state in `internal/workspaceui`;
the exposed layout surface is read, initialize, reset, typed pane operations, and
workspace UI events:

```text
POST /workspaces/ui/layout/read
POST /workspaces/ui/layout/initialize
POST /workspaces/ui/layout/reset
POST /workspaces/ui/panes/operation
GET  /workspaces/ui/events
```

The superseded raw layout save endpoint is no longer exposed through HTTP,
generated TypeScript, IPC, preload, or the web adapter. Renderer layout mutations
use typed pane operations and apply the backend-returned persisted layout.

Terminal content already has backend HTTP APIs for create, attach, input,
resize, close, profiles, and event streaming.

Chat, workflow graph, workflow node details, and semantic details already have
domain APIs, but they are not yet exposed as pane-targeted workspace operations.

The remaining pieces are the rest of the write-capable workspace CLI commands after the initial focus/move/rename/close slice, a `workspace-manager` skill that teaches agents the safe operation lifecycle, per-surface read/write adapters, and richer live capability metadata beyond the current layout-only pane descriptors.
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
panes. Workflow node details can be added when commands carry an explicit
projection target with `definitionId`, `nodeId`, and `viewMode`; run targets
also require `executionId`/`nodeExecutionId`, and draft/version targets must not
carry run identity. Settings, semantic details, and browser panes are deferred
until their command contracts are clearly useful.

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
- Audit follow-up: changed the backend-only pane operation contract shape so
  move-specific input lives under a `move` payload instead of a top-level
  `direction` field shared by every operation kind. Focus operations now reject
  a move payload, and move operations require one. This keeps the Go-owned
  contract aligned with the planned typed/discriminated operation model before
  the operation API is exposed through HTTP, CLI, IPC, or generated TypeScript.
- Backend close operation reducer follow-up: added backend-only `close_pane`
  support without exposing an HTTP, CLI, IPC, renderer, or agent write surface.
  The reducer requires an explicit close payload with `surfaceClose: "none"`,
  rejects `safe` and `force` surface closes with a stable
  `unsupported_surface_close` error until surface-domain close semantics are
  implemented, removes the pane from the persisted layout, removes/reindexes
  empty columns, retargets focus with the same deterministic column/row clamping
  used by the renderer, rejects missing panes, and rejects closing the last
  remaining pane with a stable `last_pane` error.
- Verification for the backend close reducer follow-up:
  `./scripts/go.sh test ./internal/workspaceui` passed, and
  `./scripts/go.sh run ./cmd/generate-contracts` completed with no generated
  diffs because the write operation contract is still not endpoint-exposed.
- Backend rename operation reducer follow-up: added backend-only `rename_pane`
  support without exposing an HTTP, CLI, IPC, renderer, or agent write surface.
  The reducer requires a title-only rename payload, rejects missing titles and
  titles with surrounding whitespace as invalid operations, rejects payloads
  meant for other operation kinds, updates only the pane title, preserves focus,
  increments the revision and persists only when the title changes, and returns
  a structured rename outcome with the previous and resulting titles.
- Verification for the backend rename reducer follow-up:
  `./scripts/go.sh test ./internal/workspaceui` passed, and
  `./scripts/go.sh run ./cmd/generate-contracts` completed with no generated
  diffs because the write operation contract is still not endpoint-exposed.
- Backend resize operation reducer follow-up: added backend-only `resize_pane`
  support for pane-targeted column width changes without exposing an HTTP, CLI,
  IPC, renderer, or agent write surface. The reducer requires a width-only
  resize payload, rejects payloads meant for other operation kinds, validates
  finite positive `px` or `proportion` width specs, normalizes valid widths to
  the renderer's column width bounds with a structured warning when
  normalization changes the requested value, updates every persisted column in
  the target visual slot across planes, increments the revision and persists
  only when layout dimensions change, preserves focus, and returns structured
  resize outcome plus per-pane before/after dimension records for the affected
  slot.
- Verification for the backend resize reducer follow-up:
  `./scripts/go.sh test ./internal/workspaceui` passed, and
  `./scripts/go.sh run ./cmd/generate-contracts` completed with no generated
  diffs because the write operation contract is still not endpoint-exposed.
- Audit follow-up: expanded backend resize reducer tests for proportional width
  normalization at both bounds and invalid negative/infinite width values.
- Verification for the audit follow-up:
  `./scripts/go.sh test ./internal/workspaceui`,
  `./scripts/go.sh run ./cmd/generate-contracts`, `./scripts/format.sh`, and
  `./check_quality.sh --git-changes` passed.
- Backend row-height resize reducer follow-up: added backend-only
  `resize_pane` support for pane-targeted row height changes without exposing
  an HTTP, CLI, IPC, renderer, or agent write surface. The reducer now accepts
  exactly one resize target per operation (`widthSpec`, `heightPx`, or
  `resetHeight`), applies absolute height changes and resets to every pane in
  the target visual row across columns in the same plane, normalizes positive
  heights below the renderer minimum to `96px` with a structured warning,
  preserves focus, increments the revision and persists only when row dimensions
  change, and returns structured resize outcome plus per-pane before/after
  dimension records including nullable `heightPx`.
- Persisted workspace UI layout schema is now version `3`. The Go-owned
  `WorkspaceUIPane` contract now includes nullable `heightPx`, the renderer
  persisted layout mapper round-trips it, and schema-2 persisted UI layouts now
  fail loudly through the existing recovery path. No migration, compatibility
  shim, dual-read path, or silent fallback was added.
- Regenerated the backend TypeScript contract surface and HTTP contract
  snapshot from the Go-owned endpoint registry; backend protocol version is now
  `16`.
- Verification for the backend row-height reducer/schema follow-up:
  `./scripts/go.sh test ./internal/workspaceui`,
  `./scripts/go.sh run ./cmd/generate-contracts`,
  `pnpm -C desktop typecheck`,
  `./scripts/go.sh test ./internal/workspaceui ./internal/httpapi ./cmd/setta`,
  and
  `pnpm -C desktop exec vitest run src/renderer/src/workspace-layout/workspace-scene.test.ts src/main/workspace-ui-ipc.test.ts src/preload/index.test.ts`
  passed. `pnpm -C desktop build` and
  `node desktop/tests/electron/run-workflows.mjs --workflow pane-focus-click`
  also passed for the generated contract and persisted layout schema change.
  Final gate: `./scripts/format.sh` and `./check_quality.sh --git-changes`
  passed. The first quality-gate attempt exposed that
  `internal/workspaceui/operations.go` exceeded the repository file-length
  limit after the new reducer branch; the height-specific reducer helpers were
  split into `operations_resize_height.go`, and the gate passed after that.
- Backend relative/scaled row-height resize reducer follow-up: extended the
  backend-only `resize_pane` operation with `heightDeltaPx` and `heightScale`
  inputs without exposing an HTTP, CLI, IPC, renderer, or agent write surface.
  These inputs are mutually exclusive with `widthSpec`, `heightPx`, and
  `resetHeight`; `heightScale` must be finite and positive. Because persisted
  layout stores only nullable explicit `heightPx` and not renderer viewport-
  derived default heights, relative and scaled height changes require the target
  pane row to already have an explicit `heightPx`; otherwise the operation fails
  with `invalid_operation` instead of guessing. Successful operations apply the
  computed height to the target visual row across columns in the same plane,
  preserve focus, increment and persist only on actual dimension changes, return
  structured before/after dimensions, and reuse the existing minimum-height
  normalization warning when a computed height is below `96px`.
- Verification for the backend relative/scaled row-height reducer follow-up:
  `./scripts/go.sh test ./internal/workspaceui` passed, and
  `./scripts/go.sh run ./cmd/generate-contracts` completed with no generated
  diffs because the write operation contract is still not endpoint-exposed.
- Backend adjacent split resize reducer follow-up: extended the backend-only
  `resize_pane` operation with an explicit `split` payload for resizing two
  directly adjacent panes in the same column without exposing an HTTP, CLI,
  IPC, renderer, or agent write surface. The operation treats the request
  `paneId` as the upper pane, requires `lowerPaneId`, finite positive
  `upperWeight` and `lowerWeight` values, rejects missing or non-adjacent lower
  panes with stable operation error codes, normalizes positive weights below
  `0.1` with a structured warning, preserves focus, increments and persists
  only on actual weight changes, and returns structured before/after dimension
  records for both panes.
- Verification for the backend adjacent split resize reducer follow-up:
  `./scripts/go.sh test ./internal/workspaceui` passed, and
  `./scripts/go.sh run ./cmd/generate-contracts` completed with no generated
  diffs because the write operation contract is still not endpoint-exposed.
- Audit follow-up: expanded backend split resize reducer validation coverage for
  lower panes that are not directly below the target pane and for split resize
  requests combined with another resize target. No reducer behavior or exposed
  contract changed.
- Verification for the audit follow-up:
  `./scripts/go.sh test ./internal/workspaceui`, `./scripts/format.sh`, and
  `./check_quality.sh --git-changes` passed.
- Backend multi-resize transaction follow-up: added a backend-only internal
  transaction reducer without exposing an HTTP, CLI, IPC, renderer, or agent
  write surface. The transaction currently accepts only validated `resize_pane`
  operations, applies width, row-height, and adjacent split resize reducers
  against a cloned layout, aggregates before/after dimensions from the
  pre-transaction layout to the final layout, increments the layout revision at
  most once, persists once only after all operations succeed, and leaves the
  persisted layout unchanged when a later operation fails. Single
  `resize_pane` operations now use the same transaction reducer with one
  operation.
- Verification for the backend multi-resize transaction follow-up:
  `./scripts/go.sh test ./internal/workspaceui` passed, and
  `./scripts/go.sh run ./cmd/generate-contracts` completed with no generated
  diffs because the write operation contract is still not endpoint-exposed.
  Final gate: `./scripts/format.sh` and `./check_quality.sh --git-changes`
  passed.
- Backend reorder operation reducer follow-up: added backend-only
  `reorder_pane` support without exposing an HTTP, CLI, IPC, renderer, or agent
  write surface. The reducer validates typed row, swap, column, and plane-slot
  intents; rejects payloads meant for other operation kinds; moves panes into
  rows; swaps pane slots while preserving pane sizing; creates deterministic new
  columns for column and plane-slot drops; resets pane row sizing when a pane
  adopts a new layout context; updates pane column ownership; removes/reindexes
  emptied columns; focuses the moved source pane for non-swap drops; preserves
  focus for swaps; increments the revision and persists only when layout order
  changes; and returns a structured reorder outcome with previous/resulting
  pane locations, destination column details, created-column IDs, removed-column
  status, and reset-sizing status. Missing target panes and columns use stable
  operation error codes.
- The operation validation helpers were split out of `operations.go` to keep
  the backend operation reducer files under repository size limits while adding
  the new typed reorder validation.
- Verification for the backend reorder reducer follow-up:
  `./scripts/go.sh test ./internal/workspaceui` passed,
  `./scripts/go.sh run ./cmd/generate-contracts` completed with no generated
  diffs because the write operation contract is still not endpoint-exposed, and
  `./scripts/go.sh test ./internal/workspaceui ./internal/httpapi` passed.
- Audit follow-up: expanded backend reorder reducer coverage for inserting a
  pane into a new plane above the current first plane, rejecting missing swap and
  plane-slot targets with stable error codes, and rejecting occupied plane-slot
  drops without persisting partial layout changes.
- Verification for the audit follow-up:
  `./scripts/go.sh test ./internal/workspaceui` passed.
- Backend open operation reducer follow-up: added backend-only `open_pane`
  support without exposing an HTTP, CLI, IPC, renderer, or agent write surface.
  The reducer keeps pane identity backend-owned by rejecting caller-supplied
  `paneId`, supports the initial terminal, chat, and workflow graph surface
  kinds, creates deterministic pane/surface/column IDs from the persisted
  layout, appends a new column or inserts one after an explicit adjacent
  column, normalizes requested column widths with structured warnings, focuses
  the created pane, increments the revision and persists exactly once, and
  returns a structured open outcome. Unsupported surface kinds, invalid payload
  shape, and missing adjacent columns fail with stable operation error codes and
  leave the persisted layout unchanged.
- Verification for the backend open reducer follow-up:
  `./scripts/go.sh test ./internal/workspaceui`,
  `./scripts/go.sh run ./cmd/generate-contracts`, and
  `./scripts/go.sh test ./internal/workspaceui ./internal/httpapi` passed. The
  generator completed with no generated diffs because the write operation
  contract remains unexposed through the endpoint registry.
- Backend configure operation reducer follow-up: added backend-only
  `configure_pane` support without exposing an HTTP, CLI, IPC, renderer, or
  agent write surface. The reducer supports the initial terminal, chat, and
  workflow graph target surface kinds, keeps pane IDs stable, creates a fresh
  surface ID for accepted configuration changes, preserves omitted metadata
  fields explicitly, focuses the configured pane, persists exactly once, and
  returns a structured configure outcome with previous/resulting surface and
  pane chrome fields. Terminal configuration is accepted only for terminal
  targets, existing terminal config is preserved when omitted, and unsupported
  target surface kinds fail with stable operation error codes without changing
  persisted layout state.
- Verification for the backend configure reducer follow-up:
  `./scripts/go.sh test ./internal/workspaceui`,
  `./scripts/go.sh run ./cmd/generate-contracts`, and
  `./scripts/go.sh test ./internal/workspaceui ./internal/httpapi` passed. The
  generator completed with no generated diffs because the write operation
  contract remains unexposed through the endpoint registry.
- Backend workflow-node-details operation follow-up: extended the backend-only
  `open_pane` and `configure_pane` reducers without exposing an HTTP, CLI, IPC,
  renderer, or agent write surface. Both operations now accept an explicit
  `workflowNodeDetailsConfig` only for `workflow-node-details` panes, validate
  target shape/workspace before persistence, enforce view-mode-specific run
  identity, preserve non-null projection edge arrays, focus the opened or
  configured pane, and preserve the existing details target when replacement
  config is omitted. This covers the renderer's current one-pane retargeting
  behavior ahead of the write cutover.
- Verification for the backend workflow-node-details operation follow-up: `./scripts/go.sh test ./internal/workspaceui`, `./scripts/go.sh run ./cmd/generate-contracts`, and `./scripts/go.sh test ./internal/httpapi` passed; generator completed with no generated diffs because the write operation contract remains unexposed through the endpoint registry. Final gate: `./scripts/format.sh` and `./check_quality.sh --git-changes` passed.
- Backend workspace UI event publication follow-up: added a backend-only event hub without exposing an HTTP, CLI, IPC, renderer, or agent write surface. `SaveLayout` emits full-layout `workspace_ui.layout_updated` after persistence; subscriptions require workspace ID, replay by stream cursor, filter by workspace, emit `workspace_ui.resync_required` on stale cursors, and no-op pane operations do not publish. Verification: `./scripts/go.sh test ./internal/workspaceui`, `./scripts/go.sh run ./cmd/generate-contracts`, and `./scripts/go.sh test ./internal/workspaceui ./internal/httpapi` passed; generator had no diffs because the event contract was not endpoint-exposed at that point.
- Audit follow-up: workspace-scoped replay now tracks latest and last-evicted layout event sequences per workspace, so unrelated workspace buffer rotation does not force resync; stale subscriptions after backend restart seed current revision from the persisted layout instead of reporting revision `0`. Verification: `./scripts/go.sh test ./internal/workspaceui ./internal/httpapi` passed.
- HTTP workspace UI event stream follow-up (2026-07-08): exposed the existing workspace UI event hub through the authenticated `GET /workspaces/ui/events` SSE endpoint without exposing HTTP, CLI, IPC, renderer, or agent write operations. The endpoint requires `workspaceId`, accepts `Last-Event-ID`/`lastEventId` cursors, writes typed `WorkspaceUIEvent` server-sent events, and preserves workspace-scoped replay/filtering semantics from the backend service. Regenerated the Go-owned HTTP contract snapshot and backend TypeScript surface; backend protocol version is now `17`. Verification passed: `./scripts/go.sh test ./internal/httpapi ./internal/workspaceui`, `pnpm -C desktop typecheck`, `./scripts/go.sh test ./cmd/setta-backend ./cmd/setta ./internal/runtime`, `pnpm -C desktop build`, and `node desktop/tests/electron/run-workflows.mjs --workflow pane-focus-click`. Audit follow-up expanded HTTP event stream coverage for the plan-required `workspaceId` query and for `workspace_ui.resync_required` events as typed SSE frames; no production behavior, generated contract, or exposed write surface changed.
- Renderer workspace UI event sync follow-up (2026-07-08): exposed `workspaceId`-scoped workspace UI event subscriptions through Electron main/preload `SettaAPI` and the web runtime adapter. Main owns authenticated SSE connections, reference-counts subscriptions, restarts them after runtime reconnect/switch, and forwards typed `WorkspaceUIEvent` IPC payloads; the renderer applies only newer backend layouts without polling, reports malformed layout/resync events through the existing recovery notice, and performs one explicit layout read on `workspace_ui.resync_required`. No workspace write endpoint, CLI command, renderer mutation cutover, or agent surface was exposed.
- Verification for the renderer event-sync follow-up passed: focused Vitest coverage for main/preload/web/layout event handling, `pnpm -C desktop typecheck`, `./scripts/format.sh`, `pnpm -C desktop build`, `node desktop/tests/electron/run-workflows.mjs --workflow pane-focus-click`, and `./check_quality.sh --git-changes`. The Electron workflow now waits for a backend-saved layout revision to reach the production renderer through the main/preload/backend event path.
- Audit follow-up: kept the Electron main-process workspace UI event replay cursor monotonic when stale duplicate frames arrive, and moved workspace UI event subscription reference counting into a tested registry that cleans subscriptions when a renderer `webContents` is destroyed. Verification: `pnpm -C desktop exec vitest run src/main/workspace-ui-event-stream.test.ts src/main/workspace-ui-event-subscriptions.test.ts src/preload/workspace-ui-events.test.ts src/renderer/src/workspace-layout/workspace-ui-layout.test.ts src/renderer/src/web/setta-web-api.test.ts`, `pnpm -C desktop typecheck`, `./scripts/format.sh`, `./check_quality.sh --git-changes`, and `node desktop/tests/electron/run-workflows.mjs --workflow pane-focus-click` passed.
- Backend open/configure cutover prerequisite follow-up (2026-07-08): extended backend-only `open_pane` for `empty-frame`, typed row targets, and typed plane-slot targets, and extended `configure_pane` for `empty-frame`, without exposing HTTP/CLI/IPC/renderer/agent writes; verification passed with `./scripts/go.sh test ./internal/workspaceui`, `./scripts/go.sh run ./cmd/generate-contracts`, and `./scripts/go.sh test ./internal/httpapi`, with no generated diffs because the write operation contract remains endpoint-unexposed.
- Backend column resize cutover prerequisite follow-up (2026-07-08): added backend-only `resize_column` operation support without exposing HTTP/CLI/IPC/renderer/agent writes. The reducer targets a stable backend-owned `columnId`, validates a column-specific width payload with no pane ID or pane-resize payload, applies the normalized width to every persisted column in the same visual slot across planes, preserves focus, increments the revision and persists only when dimensions change, returns structured resize outcome and before/after dimensions, and fails missing columns with the stable `column_not_found` error without persisting partial state. The shared width reducer was split into `operations_resize_column.go` to keep operation files below repository size limits. Verification passed: `./scripts/go.sh test ./internal/workspaceui`, `./scripts/go.sh run ./cmd/generate-contracts` with no generated diffs because the write operation contract remains endpoint-unexposed, `./scripts/format.sh`, and `./check_quality.sh --git-changes`.
- Backend initial layout cutover prerequisite follow-up (2026-07-08): added a backend-owned default real-workspace layout factory and an unexposed `InitializeLayout` service method. The factory owns the initial chat, terminal, workflow graph, and settings pane/column IDs, chrome, widths, focus, revision, and schema in Go; initialization persists exactly once, publishes the normal layout event, and fails loudly instead of overwriting an existing persisted layout. No HTTP, CLI, IPC, renderer, or agent write surface was exposed. Audit follow-up: the existing renderer can reopen/configure the workspace settings pane, so backend-only `open_pane` and `configure_pane` now accept `settings-dom` as a layout-only surface for the upcoming renderer write cutover while semantic details and workflow settings remain unsupported. Verification passed: `./scripts/go.sh test ./internal/workspaceui`, `./scripts/format.sh`, and `./check_quality.sh --git-changes`.
- Renderer layout reset/recreate command follow-up (2026-07-08): exposed an explicit authenticated `POST /workspaces/ui/layout/reset` backend command for renderer recovery without exposing pane operation writes, CLI commands, or agent write surfaces. `ResetLayout` writes the backend-owned default layout, preserves monotonic revisions against valid persisted layouts and the in-memory event hub, intentionally recreates corrupt or obsolete persisted UI state without migration or compatibility shims, persists through the existing store, and publishes the normal workspace UI layout event. Electron main/preload and the web runtime adapter now expose `workspace.resetUILayout`, and the renderer recovery action uses that command instead of saving renderer-synthesized raw layout JSON; ordinary renderer layout mutations still use the existing raw save path until the later operation cutover. Regenerated the Go-owned HTTP contract snapshot and backend TypeScript surface; backend protocol version is now `18`. Verification passed: `./scripts/go.sh test ./internal/workspaceui`, `./scripts/go.sh run ./cmd/generate-contracts`, `./scripts/go.sh test ./internal/httpapi`, `pnpm -C desktop exec vitest run src/main/workspace-ui-ipc.test.ts src/preload/index.test.ts src/renderer/src/workspace-layout/workspace-ui-layout.test.ts src/renderer/src/web/setta-web-api.test.ts src/renderer/src/stores/workspace-store.test.ts src/renderer/src/stores/chat-store-navigation.test.ts src/renderer/src/stores/chat-store.test.ts`, `pnpm -C desktop typecheck`, `./scripts/go.sh test ./cmd/setta-backend ./cmd/setta ./internal/runtime`, `pnpm -C desktop build`, `node desktop/tests/electron/run-workflows.mjs --workflow pane-focus-click --skip-build`, `./scripts/format.sh`, and `./check_quality.sh --git-changes`. Audit follow-up: reset from corrupt state after a previously published higher revision now returns and publishes the next revision instead of a stale revision `1`; verification passed with `./scripts/go.sh test ./internal/workspaceui`. Remaining Phase 2/3 work: cut renderer-originated layout mutations to the backend operation API and stop exposing the superseded raw layout save path before agent/CLI workspace write commands are exposed.
- Renderer initial layout prerequisite follow-up (2026-07-08): exposed the existing backend-owned default layout initializer through authenticated `POST /workspaces/ui/layout/initialize` and through Electron main/preload plus the web runtime adapter, without exposing pane operation writes, CLI commands, or agent write surfaces. Real-workspace renderer layout loading now treats a missing persisted layout as a backend initialization request and renders the returned persisted layout, failing loudly on mismatched workspace IDs or unavailable initialize support instead of synthesizing the initial product layout in the renderer. Reinitialization rejects existing layouts rather than resetting or migrating them. Regenerated the Go-owned HTTP contract snapshot and backend TypeScript surface; backend protocol version is now `19`. Verification passed: `./scripts/go.sh test ./internal/httpapi ./internal/workspaceui`, `pnpm -C desktop exec vitest run src/main/workspace-ui-ipc.test.ts src/preload/index.test.ts src/renderer/src/workspace-layout/workspace-ui-layout.test.ts src/renderer/src/web/setta-web-api.test.ts src/renderer/src/stores/workspace-store.test.ts src/renderer/src/stores/chat-store-navigation.test.ts src/renderer/src/stores/chat-store.test.ts`, `pnpm -C desktop typecheck`, `./scripts/go.sh test ./cmd/setta-backend ./cmd/setta ./internal/runtime`, `pnpm -C desktop build`, `node desktop/tests/electron/run-workflows.mjs --workflow pane-focus-click --skip-build`, `./scripts/format.sh`, and `./check_quality.sh --git-changes`. Remaining Phase 2/3 work: cut renderer-originated layout mutations to the backend operation API and stop exposing the superseded raw layout save path before agent/CLI workspace write commands are exposed.
- Audit follow-up: real-workspace layout loading now fails explicitly when the layout read API is unavailable instead of allowing renderer default layout synthesis, and it validates the read envelope workspace ID before deciding whether to initialize. Verification passed: focused renderer layout test, contract generator, backend `internal/httpapi` and `internal/workspaceui` tests, desktop typecheck, `./scripts/format.sh`, and `./check_quality.sh --git-changes`.
- Pane operation HTTP contract follow-up and audit rollback (2026-07-08): the existing backend pane operation reducer was briefly exposed through authenticated `POST /workspaces/ui/panes/operation`, then the audit removed that production HTTP endpoint, handler/request contract/tests, and generated TypeScript surface because renderer layout mutations still used the superseded raw layout save path. The backend reducer remained internal to `internal/workspaceui`; the next coherent step was to reintroduce the operation endpoint together with renderer mutation cutover and raw-save removal so the product state would not contain a second layout writer. The rollback regenerated the Go-owned contract snapshot/backend TypeScript surface and bumped the backend protocol version to `21`. Verification passed: `./scripts/go.sh test ./internal/httpapi`, `./scripts/go.sh test ./internal/workspaceui`, `./scripts/go.sh run ./cmd/generate-contracts`, `pnpm -C desktop typecheck`, `./scripts/go.sh test ./cmd/setta-backend ./cmd/setta ./internal/runtime`, `pnpm -C desktop build`, and `node desktop/tests/electron/run-workflows.mjs --workflow pane-focus-click --skip-build`.
- Renderer pane operation cutover follow-up (2026-07-08): reintroduced authenticated `POST /workspaces/ui/panes/operation` as the only exposed renderer layout mutation path, removed the raw layout save endpoint/request/client surface from HTTP, generated TypeScript, IPC, preload, and the web adapter, and bumped the backend protocol version to `22`. Renderer layout mutations now build typed backend operations for focus, open, close, configure, reorder, move, column/row/split resize, and pane focus persistence, then apply the backend-returned layout while preserving renderer-local transient scroll/no-reveal state. Same-revision command responses remain authoritative only when the layout differs, avoiding repeated no-op focus command churn. The backend open outcome now returns a valid placement enum for column-end/adjacent opens, so generated clients can decode operation results without widening the contract. Electron fixtures now seed and assert through initialize/apply operation paths; diagnostic browser panes remain renderer-local/deferred rather than silently mapped to backend operations. Verification passed: `./scripts/go.sh run ./cmd/generate-contracts`, `./scripts/go.sh test ./internal/workspaceui ./internal/httpapi`, `./scripts/go.sh test ./cmd/setta-backend ./cmd/setta ./internal/runtime ./internal/httpapi ./internal/workspaceui`, `pnpm -C desktop exec vitest run src/main/workspace-ui-ipc.test.ts src/preload/index.test.ts src/renderer/src/workspace-layout/workspace-interactions.test.ts src/renderer/src/workspace-layout/layout-store.test.ts src/renderer/src/workspace-layout/workspace-layout-area-hooks.test.ts src/renderer/src/workspace-layout/workspace-ui-layout.test.ts src/renderer/src/workspace-layout/terminal-surface-adapter.test.ts src/renderer/src/web/setta-web-api.test.ts src/renderer/src/stores/workspace-store.test.ts src/renderer/src/stores/chat-store-navigation.test.ts src/renderer/src/stores/chat-store.test.ts`, `pnpm -C desktop typecheck`, `pnpm -C desktop build`, `node desktop/tests/electron/chat-workflows.test.mjs --workflow-node-trajectory-contract-only`, `node desktop/tests/electron/run-workflows.mjs --workflow pane-focus-click --workflow settings-pane --skip-build`, `./scripts/format.sh`, and `./check_quality.sh --git-changes`. Remaining work: add write-capable workspace CLI commands, the workspace-manager skill, and per-surface IO; do not add another raw layout writer.
- Audit follow-up: the checked-in embedded web app bundle under `internal/webapp/static` still contained the old web adapter's `workspace.saveUILayout` path after the source cutover, which meant the served PWA bundle did not match the claimed raw-save removal. Regenerated the static web assets from current source with `pnpm -C desktop build:web`; source and static searches now find no `saveUILayout`, `saveWorkspaceUILayout`, or `/workspaces/ui/layout/save` exposure, and the embedded web adapter uses `applyWorkspaceUIPaneOperation`.
- Workspace CLI write-command follow-up (2026-07-08): added the first write-capable `setta workspace panes` commands for low-risk layout-only operations now that renderer write cutover and raw-save removal are in place. `focus <pane-id>`, `move <pane-id> --direction left|right|up|down`, `rename <pane-id> --title TITLE`, and `close <pane-id> [--surface-close none|safe|force]` resolve the active workspace through local runtime auth, call authenticated `/workspaces/ui/panes/operation`, validate the returned workspace/layout/operation envelope, and print structured JSON. Close with `safe` or `force` remains unsupported and fails loudly with `unsupported_surface_close` without changing persisted layout. Verification passed: `./scripts/go.sh test ./cmd/setta` and `./scripts/go.sh test ./cmd/setta ./internal/workspaceui ./internal/httpapi`; coverage uses temporary runtime/app data/workspace paths, applies focus/rename/move/close through production CLI/runtime/HTTP/store paths, confirms persistence by re-reading panes, covers invalid direction usage, and verifies unsupported safe close leaves layout unchanged. Remaining Phase 2 CLI work: open, resize, reorder, and layout transaction commands before the `workspace-manager` skill and per-surface IO.

### Phase 3: Renderer Event Sync
Add workspace UI event streaming. Active renderers subscribe to layout revision events and apply backend-originated operations without polling.

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
