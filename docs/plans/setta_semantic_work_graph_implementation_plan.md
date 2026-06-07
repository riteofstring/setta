# Setta Semantic Work Graph Implementation Plan

- **Date:** June 10, 2026
- **Status:** Proposed phased implementation
- **Scope:** Implement the Semantic Work Graph described in
  `docs/plans/setta_semantic_work_graph_plan.md` without making a graph
  database, vector store, or agent-memory framework the product source of truth.

## Core Decision

Setta should implement the Semantic Work Graph as a Setta-owned product model:

```text
Canonical truth:
  SQLite append-only semantic event log

Derived state:
  current semantic graph projection
  evidence/provenance projection
  activity interval projection
  steering directive projection
  context-pack history
  search/vector/symbol indexes
  graph/layout/rendering projections
```

This matches the feature requirements better than starting with a graph
database. The product needs replay, provenance, split/merge lineage, user
steering, activity intervals, context-pack auditability, and "why does this node
exist?" explanations. Those are event/projection requirements first and graph
query requirements second.

The saved executable workflow graph remains separate. The Semantic Work Graph is
persistent public work memory around prompts, workflow runs, agent activity,
files, diffs, tests, decisions, constraints, and user steering.

## Library And Framework Choices

### Use In The Initial Implementation

- **SQLite through the existing Go backend stack**: canonical event log,
  projections, evidence anchors, activity intervals, steering directives,
  context-pack history, and layout/user state.
- **SQLite FTS5**: first full-text retrieval primitive for semantic node labels,
  summaries, evidence text, prompts, chats, logs, diffs, and docs. Verify FTS5
  support in the repo-pinned SQLite driver during the backend foundation phase;
  build the broader retrieval/ranking layer later.
- **Existing Go HTTP API + generated TypeScript contracts**: backend owns all
  semantic contracts; TypeScript surfaces are generated. Do not maintain a
  hand-written TypeScript mirror.
- **Existing Electron/React/Pixi renderer**: render semantic nodes and activity
  overlays on the current canvas instead of replatforming to React Flow or a
  separate graph UI.
- **Existing workflow/chat/event infrastructure**: integrate with Setta's
  production workflow events, chat runs, and runtime state rather than adding a
  separate workflow or event-streaming framework.

### Defer Behind Small Interfaces

- **sqlite-vec**: evaluate only after FTS, evidence links, recency, explicit
  steering, and workspace search are insufficient. Put it behind a backend
  `VectorIndex` interface because it is pre-v1 and native-extension packaging
  may conflict with the current pure-Go SQLite setup.
- **Tree-sitter**: evaluate after basic file/range evidence anchors are working
  and the context compiler needs structured symbol anchors. Start with observed
  file paths, ranges, and symbol names from agent activity before adding parser
  infrastructure.
- **ELK.js**: evaluate after the renderer has manual semantic layout,
  user-moved-node pinning, and basic new-node placement. ELK should only
  auto-layout new or unpinned nodes and temporary local expansions.
- **OpenTelemetry + OpenInference**: add trace/span fields to semantic events
  early where cheap, but defer full tracing until cartographer debugging or
  agent observability needs it.

### Evaluate Later As Rebuildable Projections Or References

- **LadybugDB**: possible embedded property-graph projection if SQLite traversal
  queries become painful after real Setta sessions. It must not be canonical.
- **Graphiti**: useful design reference for temporal agent memory, provenance,
  and hybrid retrieval, but not a core dependency because Setta's graph is
  user-editable, visual, steerable, local-first, and tied to workflow/runtime UX.
- **LanceDB or Qdrant**: possible later vector-search upgrades if sqlite-vec is
  not enough. They add packaging or sidecar surface, so they are not MVP
  dependencies.
- **Phoenix or Langfuse**: possible developer observability/eval tools after
  OpenTelemetry/OpenInference traces exist. They should not become product
  state.

### Do Not Use For The MVP

- No primary graph database.
- No Neo4j, FalkorDB, ArcadeDB, SurrealDB, Qdrant, NATS JetStream, Temporal,
  EventStoreDB/KurrentDB, Automerge, or Yjs in the core MVP.
- No React Flow replatform unless the current Pixi graph architecture becomes a
  clear blocker.
- No CRDT as semantic truth. Collaboration can be revisited later for notes,
  canvas positions, comments, or user-authored steering prompts.

## Implementation Principles

- Backend-owned Go types define semantic contracts; regenerate TypeScript after
  contract changes.
- Do not add backward compatibility, legacy support, migrations, transitional
  adapters, dual-read/write paths, old-field aliases, compatibility shims, or
  silent compatibility fallbacks for semantic graph work unless explicitly
  requested.
- Schema changes should fail loudly on incompatible existing semantic stores
  instead of mutating old stores into a new shape. Idempotent creation of a fresh
  current schema is fine; migration code is not.
- Events are append-only. Corrections are represented by superseding, retracting,
  splitting, merging, dismissing, or promoting through new events.
- Projections are rebuildable from events unless explicitly documented as
  user-owned state, such as manual layout positions.
- Traces, chat logs, tool calls, diffs, tests, files, and prompts are evidence.
  They do not directly become semantic truth. The cartographer emits typed
  semantic graph patches.
- Do not store raw LLM chain-of-thought. Store public summaries, structured
  graph patches, evidence references, confidence, model metadata, and user
  review state.
- Avoid heuristic fallbacks. Semantic updates should come from explicit user
  actions, typed runtime events, deterministic reducers, or validated
  cartographer patches.
- Keep user layout separate from semantic meaning. User-moved nodes must not be
  repositioned unless the user requests re-layout.

## Phase 1: Semantic Event Log And Backend Projection

Goal: create the durable backend foundation without changing agent behavior.

Scope guard:

- Implement backend foundation only.
- Do not implement renderer UI, cartographer automation, context compiler,
  vector search, graph database projections, Tree-sitter, ELK.js, observability
  backends, or agent behavior changes in this phase.
- Create a separate backend package, such as `internal/semanticgraph`, rather
  than adding semantic graph ownership to `internal/orchestrator`.
- Prefer a separate semantic graph SQLite store/database. Reference workflow,
  chat, run, file, and test entities by typed IDs and evidence anchors rather
  than by cross-store foreign-key ownership.
- FTS5 is not required in Phase 1. It may be probed or prepared if cheap, but
  retrieval indexes and ranking belong to Phase 7.
- Public HTTP endpoints should be read-oriented in this phase. Event append APIs
  should remain service-level/internal or test-helper-only unless a production
  caller already needs them.
- Follow the global no-compatibility policy in the implementation principles.

Deliverables:

- Add a backend semantic graph package, following the service/store style used by
  the workflow kernel.
- Add SQLite tables for the canonical event log and first projections:

```text
semantic_events
semantic_nodes_current
semantic_edges_current
semantic_evidence_anchors
semantic_activity_intervals
semantic_steering_directives
semantic_context_pack_history
semantic_layout_positions
```

- Define initial semantic types in Go:

```text
Node kinds:
  concept, question, hypothesis, finding, decision, constraint

Edge kinds:
  about, touches, supports, refutes, resolves, constrains, related_to

Activity kinds:
  exploring, editing, debugging, validating, blocked

Event families:
  node.created
  node.updated
  node.renamed
  node.dismissed
  node.promoted
  node.split
  node.merged
  edge.created
  edge.updated
  edge.removed
  evidence.attached
  activity.started
  activity.ended
  steering.created
  steering.updated
  context_pack.created
  constraint_check.recorded
```

- Include event metadata for audit and future trace linking:

```text
event_id
workspace_id
session_id
run_id
workflow_execution_id
actor_kind
actor_id
event_type
target_entity_id
causation_id
correlation_id
trace_id
span_id
logical_clock
observed_at
payload_json
model_info
confidence
supersedes_event_id
retracted_by_event_id
```

- Implement an event appender that writes the event and updates projections in
  the same transaction.
- Implement a projection rebuild path for tests and future repair tooling.
- Expose backend read APIs for current graph, node detail, evidence, activity,
  steering state, and event history.
- Generate TypeScript contracts from the Go-owned HTTP registry.

Acceptance criteria:

```text
semantic event log exists
current semantic graph projections exist
event append updates the event log and projections transactionally
projection rebuild works from the event log
core semantic contracts are Go-owned
HTTP read contracts are generated to TypeScript
focused Go and HTTP tests cover the backend behavior
```

Verification:

- Focused Go tests for event append, projection updates, rebuilds, split/merge
  lineage, dismiss/promote state, activity intervals, and corrupt-event failure
  paths.
- HTTP contract tests for the new semantic endpoints.
- Regenerate generated TypeScript outputs after contract changes.

## Phase 2: Read-Only Semantic Graph Surface

Goal: make semantic state visible without steering or cartographer automation.

Scope guard:

- Implement the renderer-facing read surface only.
- Do not implement cartographer automation, context compiler behavior, semantic
  content editing, user steering operations, automatic semantic inference,
  retrieval ranking, vector search, graph database projections, Tree-sitter,
  ELK.js, or agent behavior changes in this phase.
- Semantic content remains event-owned. Do not add production HTTP or IPC APIs
  that let the renderer create nodes, edges, evidence, activity, context packs,
  or steering directives.
- A minimal layout-position write API is allowed because layout is user-owned
  UI state, not semantic truth. It should update `semantic_layout_positions`
  only and must not become a general semantic mutation endpoint.
- Test and local-dev semantic data should be created through backend test helpers
  or local scripts that call the semantic graph service directly, not through a
  production append-event endpoint.

Deliverables:

- Add desktop main/preload/shared IPC wiring for the Phase 1 semantic read
  endpoints:

```text
read graph
read node detail
list evidence
list activity
read steering state
read event history
```

- Add a minimal Go-owned layout-position update contract if Phase 1 does not
  already expose one:

```text
update semantic layout positions
  workspace_id
  positions: entity_id, x, y, pinned
```

  This endpoint should only persist manual semantic layout state. It should not
  create or modify semantic nodes, edges, evidence, activity, steering
  directives, context packs, or events.
- Regenerate TypeScript contracts after any semantic HTTP contract changes.
- Add renderer store/API plumbing using generated semantic contracts and the
  typed preload surface.
- Render semantic nodes and semantic edges as a visually distinct layer on the
  existing Pixi graph surface.
- Render activity separately from semantic edges and workflow edges. For this
  phase, prefer node-local visual treatment such as halos, badges, or short
  activity strokes from active/recent `SemanticActivityInterval` records. Do not
  invent durable agent-to-node activity edge geometry until backend activity
  records include the actor/run/source references needed for that display.
- Add node inspection showing:

```text
label
kind
derived status: active, dismissed, promoted, split, merged
confidence when available from event history; otherwise show no confidence value
evidence anchors
created/updated timestamps
lineage
supporting/refuting/resolving edges
activity history
```

- Persist manual semantic node positions through backend-owned layout state.
- Keep default placement simple and deterministic:

```text
new semantic nodes near their workflow/runtime/file anchor when known
otherwise near the viewport center
user-moved nodes fixed until explicit re-layout
```

- Add a backend test helper and, if useful, local dev scripts that create
  semantic graph events through the normal semantic service path so the UI can
  be exercised before the cartographer exists.

Acceptance criteria:

```text
renderer can read semantic graph data through production main/preload/backend paths
semantic nodes and semantic edges render on the existing graph surface
semantic visuals are distinguishable from executable workflow nodes and edges
node inspection opens from a selected semantic node
node inspection shows evidence, lineage, edges, activity, steering, and history links available from Phase 1 APIs
manual semantic node positions persist through reload
layout writes cannot mutate semantic content
state remains useful when the semantic graph is empty
```

Verification:

- Renderer tests for projection-to-canvas mapping, node detail rendering, layout
  persistence, and no mutation of generated contracts.
- Deterministic Electron workflow covering graph visibility, node inspection,
  reload persistence, and manual layout persistence.

## Phase 3: Evidence And Activity Capture

Goal: connect real Setta work to semantic evidence without inferring durable
semantic meaning yet.

Scope guard:

- Implement explicit evidence and activity capture only.
- Do not implement cartographer automation, context compiler behavior, semantic
  node creation from heuristics, keyword matching, embedding/vector matching,
  automatic topic extraction, user steering operations, constraint enforcement,
  or agent behavior changes in this phase.
- Existing semantic nodes may be explicitly attached to real Setta work. The
  system should not decide that a prompt, file, run, or workflow node deserves a
  new semantic node.
- Evidence should be grounded in production entities and lightweight summaries.
  Do not dump unbounded raw transcripts, tool output, diffs, logs, or file
  contents into semantic evidence rows.
- Activity overlays should be backed by typed source references, not by renderer
  guesses or semantic-node label matching.

Deliverables:

- Add explicit backend association APIs for attaching existing semantic nodes to
  real work:

```text
attach semantic node to workflow execution
attach semantic node to workflow node execution or workflow definition node
attach semantic node to chat run
attach semantic node to chat message or run item
attach semantic node to file path/range
detach or end an active semantic activity interval
```

- Store these associations as semantic events, usually combining:

```text
evidence.attached
activity.started
activity.ended
```

- Extend activity interval data with typed source references needed by the UI and
  future replay:

```text
source_kind: workflow_execution | workflow_node | chat_run | chat_message | run_item | file_range | test | diff | command
source_id
workflow_execution_id
workflow_node_id
chat_conversation_id
chat_run_id
chat_message_id
actor_kind
actor_id
```

  Use only fields that are known for the source. Keep references typed and
  explicit rather than overloading a freeform string.
- Attach evidence anchors from existing production paths when explicitly
  associated:

```text
user prompts
assistant messages
workflow definitions
workflow executions
workflow nodes
workflow events
chat runs
run items and tool calls
file paths and ranges observed from activity
diff summaries when available
test command/result summaries when available
```

- Add workspace/run scoped activity reads so Phase 2's renderer does not need to
  fan out one `listActivity` request per semantic node as graphs grow:

```text
list activity by workspace, optional source/run filters, paginated
list activity by semantic target, paginated
current activity summary for semantic graph nodes
```

- Update the renderer to use the new activity summary/read path for live and
  historical activity overlays.
- Show explicit attachment state in semantic node details, including the source
  kind, source id, summary, timestamps, and evidence reference.
- Keep associations explicit in this phase. Do not add keyword-based or
  embedding-based automatic semantic-node creation.

Evidence policy:

```text
store stable IDs, paths, ranges, timestamps, summaries, and content hashes when possible
store short excerpts only when they are useful for inspection
avoid storing large raw transcripts, full diffs, full logs, or complete file contents
preserve enough information to navigate back to the owning production entity
fail loudly when a requested production source cannot be resolved
```

Acceptance criteria:

```text
an existing semantic node can be attached to a real workflow execution
an existing semantic node can be attached to a workflow node or chat run when available
attachment creates evidence and activity records through semantic events
activity can be ended explicitly
semantic node details show attached work and evidence
the graph surface shows current/recent activity without per-node request fanout
reload preserves evidence and activity history
no semantic nodes are auto-created from prompts, labels, files, or activity
```

Verification:

- Focused backend tests for evidence anchor persistence and activity interval
  lifecycle, including source reference validation and activity paging.
- HTTP contract tests for attach/read/end activity APIs.
- Renderer tests for activity-summary projection and node-detail attachment
  display.
- Deterministic Electron/main/preload/renderer/HTTP/store test through a real
  workflow/chat path when attaching semantic nodes to active work, ending
  activity, reloading, and confirming no semantic content was inferred.

Phase 3 follow-up before Phase 4:

- Add direct regression coverage for every explicit attachment source that Phase
  4 may surface in user workflows:

```text
workflow definition node
workflow node execution
chat message
run item
command run item
file range
```

- Each attachment-source test should assert source resolution happens before
  semantic events are appended, failed source resolution leaves event history
  unchanged, and the resulting evidence/activity records preserve enough typed
  source data to navigate back to the production entity.
- Confirm workflow definition node attachments keep the owning workflow
  definition visible in evidence/detail readbacks. If the existing
  `source_id`/summary representation is not enough for navigation, add an
  explicit typed reference before exposing that attachment in the UI.

## Phase 4: User Editing And Steering Directives

Goal: let users curate the graph and create auditable steering state.

Scope guard:

- Implement explicit user editing and steering operations only.
- Do not implement cartographer automation, semantic context compilation, agent
  prompt injection, retrieval/vector search, constraint enforcement, or
  automatic semantic node creation in this phase.
- Do not expose a generic production append-event API. The backend should expose
  operation-specific service methods and HTTP contracts that validate intent and
  source state before appending semantic events.
- Keep graph editing deterministic and auditable. If an operation needs a
  semantic node or edge to exist, fail loudly when it does not exist.
- Keep existing workflow-definition JSON files as executable workflow artifacts.
  Semantic edits update the semantic event log/projections, not workflow
  definitions.

Deliverables:

- Add backend service methods, HTTP contracts, generated TypeScript, IPC, and
  preload APIs for user operations:

```text
rename semantic node
update semantic node summary/kind
dismiss semantic node
promote semantic node
split semantic node
merge semantic nodes
create user-authored semantic node
create user-authored semantic edge
update semantic edge
remove semantic edge
pin visual layout
pin for session context
pin for workspace context
attach existing semantic node to current run/workflow source
focus agent here
avoid
request validation
add constraint
add steering prompt
complete/supersede/dismiss steering directive
```

- Store every semantic operation as one or more semantic events. Visual layout
  position updates may continue using the layout table without semantic events
  when they only represent canvas state.
- Use operation-specific event payloads for edits. Existing reducer event types
  may be used where they are precise enough; otherwise add explicit event types
  before adding broad or ambiguous payload fields.
- Maintain lineage for split/merge operations through explicit events. The
  implementation must define and test what happens to:

```text
incoming and outgoing edges
evidence anchors
activity intervals
layout positions
steering directives
context-pack history references
event history inspection
```

- Prefer conservative lineage behavior for Phase 4:

```text
split: keep existing evidence/activity/history on the dismissed source node, create
       new child nodes, and add explicit edges or evidence reassign events only
       for items the user selects

merge: create a new target node, mark source nodes dismissed/merged, and add
       explicit reassignment events only for selected edges/evidence/activity/
       steering/layout state
```

- Do not silently move all historical evidence/activity during split/merge. The
  history must remain explainable after reload and replay.
- Expand steering directives from the current boolean projection into an
  auditable lifecycle:

```text
created
active
superseded
completed
dismissed
```

- A steering directive should include:

```text
directive_id
target_entity_id
kind: focus | avoid | validate | constraint | prompt | session_pin | workspace_pin
instruction
status
scope: run | session | workspace
source operation/event
optional source run/workflow/chat refs
created/updated/completed timestamps
```

- Render editing controls and steering state in semantic node details. Keep the
  controls compact and explicit:

```text
rename/edit summary
dismiss/promote
split/merge
add edge
add constraint
focus/avoid/validate
session/workspace pin
view event history
```

- Render steering state in run/context-adjacent surfaces as read-only state in
  this phase. The state is visible and auditable, but it must not yet be injected
  into agent prompts; that belongs to Phase 5.
- Add clear empty/error/loading states for editing surfaces. Validation errors
  should name the missing node, edge, directive, or source ID.
- Preserve generated-contract ownership: contracts live in `internal/httpapi`;
  regenerate generated TypeScript after contract changes and do not manually edit
  generated outputs.

Acceptance criteria:

```text
a user can rename, summarize, dismiss, and promote a semantic node
a user can create a constraint node and connect it to another semantic node
a user can split one semantic node into two or more child nodes
a user can merge two or more semantic nodes into a new target node
split/merge lineage is visible in node details and event history
selected reassignment behavior for edges/evidence/activity/steering/layout is explicit
a user can create focus/avoid/validate/constraint/prompt steering directives
a user can complete, supersede, or dismiss a steering directive
session and workspace pins are represented as steering directives, not layout state
visual layout pinning remains layout state and does not append semantic events
reload preserves edited graph state, steering state, lineage, and history
no semantic edits are inferred from prompts, labels, files, or activity
agent prompts and workflow behavior are unchanged
```

Verification:

- Focused backend service/reducer tests for rename, update, dismiss, promote,
  create node/edge, update edge, remove edge, split, merge, selected
  reassignment, and directive lifecycle.
- HTTP contract tests for every mutation/read API and validation failure path.
- Renderer tests for editing forms, compact controls, validation errors,
  steering lifecycle display, lineage display, and projection updates.
- Preload/IPC tests for every new operation.
- Deterministic Electron/main/preload/renderer/HTTP/store workflow for user
  editing, split/merge, steering directive lifecycle, reload, and event-history
  inspection.
- Because this phase touches generated backend contracts and IPC/preload
  contracts, run the relevant generated-contract checks, desktop typecheck, and
  deterministic Electron workflow before committing implementation code.

## Phase 5: Semantic Context Compiler

Goal: deliver selected semantic context to agents explicitly and audit what was
sent.

Preflight before implementation:

- Tighten semantic store startup so an existing incompatible semantic database is
  rejected before schema DDL is applied. Fresh database creation can remain
  idempotent, but existing stores with an unsupported `PRAGMA user_version` must
  fail before any `CREATE TABLE IF NOT EXISTS` or index statements run.
- Keep this as a strict no-migration/no-compatibility change. Do not add
  upgrade code, old-schema reads, old-field aliases, or transitional dual paths.

Scope guard:

- Implement deterministic context compilation and audited delivery only.
- Do not implement cartographer automation, retrieval/vector indexes, FTS
  expansion, constraint enforcement, automatic semantic node creation, keyword
  matching, embedding matching, or broad agent-memory behavior in this phase.
- Do not inject semantic context into every chat by default. Initial production
  integration should target Codex-backed workflow agent turns and explicit
  steering delivery paths where workflow/chat/run source refs are known.
- Do not rewrite the user's or workflow definition's authored prompt in place.
  Preserve the authored prompt separately from the compiled semantic context and
  persist exactly what extra context was delivered.
- If context compilation or context-pack persistence fails, fail the agent start
  or steering delivery loudly before calling the Codex harness. Do not silently
  run without required semantic context.
- If no context items qualify, send the authored prompt unchanged and do not
  create a fake context pack.

Deliverables:

- Add a backend context compiler, preferably in `internal/semanticgraph`, behind
  a small interface consumed by workflow/chat integration points. Avoid package
  cycles by making the runtime wiring explicit rather than importing semantic
  graph state directly into low-level Codex harness code.
- Add compiler request types for:

```text
workflow agent turn start
active-run steering delivery
immediate steering replay
phase boundary, if the workflow runtime has an explicit boundary source ref
agent-requested semantic context, only if an existing typed agent-tool surface can request it deterministically
```

- Each compiler request should include the known source refs:

```text
workspace_id
trigger_kind: workflow_agent_start | steering | immediate_steering_replay | phase_boundary | agent_request
workflow_definition_id
workflow_execution_id
workflow_node_id
workflow_node_execution_id
chat_conversation_id
chat_run_id
chat_message_id
run_item_id
authored_prompt
token_budget
```

- Add read/query helpers needed by the compiler:

```text
active steering directives by workspace/scope/source refs
active constraints by workspace and associated graph neighborhood
semantic nodes associated with the current workflow execution/node/chat run
recent activity for the same workflow execution/node/chat run
evidence anchors for selected semantic nodes
prior context packs by workflow execution/chat run/target node
```

- The initial candidate set should come only from explicit state:

```text
active steering directives
session/workspace pins
active constraints
workflow/run/chat associations from Phase 3 activity/evidence
direct graph edges around associated nodes
prior decisions/open questions/promoted nodes in the associated neighborhood
recent activity tied to the same source refs
```

- Do not add keyword, fuzzy, embedding, or broad text search candidate discovery
  in Phase 5. SQLite FTS and exact workspace search belong to Phase 7 unless a
  specific deterministic source already exists.
- Add an explicit context pack model. Each pack should include:

```text
pack_id
workspace_id
trigger_kind
target_entity_id, when one semantic node is the primary target
workflow/chat/run source refs
authored_prompt_hash
delivered_context_hash
token_budget
estimated_tokens
item_count
items[]
```

- Each context pack item should include:

```text
item_id
kind: concept | constraint | decision | question | finding | steering | evidence | activity | file
semantic_node_id
evidence_anchor_id
activity_interval_id
steering_directive_id
source refs, when different from the pack source refs
title
summary
reason_included
priority: background | relevant | important | required
estimated_tokens
created/updated timestamps used for ranking
```

- Implement deterministic ranking without vector search:

```text
required active constraints
explicit focus/validate steering
explicit avoid steering as exclusions or warnings
session/workspace pins
active workflow/run/node associations
prior decisions and open questions in the associated neighborhood
promoted nodes before unpromoted nodes
recent activity
direct evidence links
staleness
estimated token cost
```

- `avoid` steering must either exclude lower-priority items or include an
  explicit warning item when the avoided area cannot be excluded. Do not silently
  ignore it.
- Exclude dismissed or merged nodes unless the context pack item is explaining a
  split/merge lineage that is directly relevant.
- Produce a deterministic delivered context block with stable ordering and a
  clear header, for example:

```text
Setta semantic context pack <pack_id>
- [required] Constraint: ...
  Reason: active workspace constraint
  Evidence: <evidence_id or source ref>
```

- Preserve the authored prompt. The Codex input may combine the semantic context
  block and authored prompt, but the context pack record must store enough data
  to reconstruct what extra context was sent and verify that the authored prompt
  was not overwritten.
- Persist `context_pack.created` events and context-pack history before or in
  the same transaction as the delivery decision. The context pack event payload
  should contain the pack metadata and item summaries; large raw transcripts,
  full diffs, full logs, and complete files must remain out of the event log.
- Integrate compiled context into Codex-backed workflow agent tasks and explicit
  steering updates as explicit context text or a typed context delta. Do not use
  provider-specific hidden state.
- Add read surfaces for context-pack audit where needed:

```text
read context pack by id
list context packs by workflow execution/chat run
list context packs by semantic target
show delivered context-pack history in semantic node details and run-adjacent surfaces
```

Acceptance criteria:

```text
workflow agent start compiles context from explicit semantic state
compiled context includes active constraints and focus/validate steering when relevant
avoid steering affects selected context deterministically
context pack respects token budget and records excluded/omitted required failures loudly
context_pack.created is appended before Codex receives added context
authored workflow prompt is preserved and auditable separately from context
no context is sent and no fake pack is created when no items qualify
steering delivery can compile and deliver updated semantic context
context pack history is visible after reload
no semantic nodes, edges, evidence, or activity are inferred or created by the compiler
Codex harness is not called if context persistence fails
```

Verification:

- Focused backend tests for compiler candidate selection, ranking, token-budget
  behavior, required constraints, explicit focus/avoid/validate steering,
  session/workspace pins, stale/dismissed/merged node exclusion, and context pack
  event persistence.
- Tests proving context-pack persistence happens before Codex harness invocation
  and that harness invocation does not happen when persistence fails.
- HTTP contract tests for any new context-pack read surfaces.
- Renderer tests for context-pack history display, if UI surfaces are added.
- Deterministic end-to-end app workflow tests through production
  Electron/main/preload/renderer/HTTP/store paths for workflow agent start,
  steering delivery, reload, and context-pack inspection.
- Because this touches chat/workflow/agent context behavior, run live Codex E2E
  tests when local ChatGPT auth is available. If unavailable, report the live
  provider skip explicitly.

## Phase 6: Semantic Cartographer

Goal: create and update semantic graph state from observed work through a
validated LLM-backed patch pipeline.

Scope guard:

- Implement the cartographer as a graph-patch proposal and validation pipeline,
  not as retrieval, constraint enforcement, a generic memory system, or a graph
  database.
- Do not add LangChain/LlamaIndex/Graphiti/CrewAI/agent-framework dependencies.
  Use a small Go-owned `CartographerProvider` interface with a deterministic
  scripted provider for tests and a separately wired production provider.
- Do not add FTS, embeddings, vector search, workspace-wide file search, or
  Tree-sitter in Phase 6. Cartographer input must come from explicit production
  refs and already-recorded evidence/activity/context packs.
- Do not poll and reread whole workflow or chat trajectories as the primary
  mechanism. The cartographer must consume existing chat/workflow event streams,
  then resume from persisted cursors after restart.
- Do not silently create durable workspace memory from prompts, files, or chat
  text. Cartographer-created nodes start session-scoped/unpromoted with evidence
  and can be promoted explicitly by user action or a later policy phase.
- Do not accept model output by best-effort parsing. Invalid JSON, unsupported
  operations, missing evidence, missing confidence, unknown refs, or chain of
  thought fields must fail loudly and leave graph state unchanged.

Implement Phase 6 as the following sub-phases. Each sub-phase should leave the
app in a shippable state and should not require the later sub-phases to make its
tests meaningful.

### Phase 6A: Foundation, Types, And Store Shape

Goal: add the typed cartographer substrate without changing runtime behavior or
calling a production LLM provider.

Deliverables:

- Replace any Phase 5 context-compiler avoid-steering logic that depends on
  rendered strings with typed `SteeringKindAvoid` handling. Avoid steering is a
  semantic signal, not a text match.
- Keep this as a strict no-migration/no-compatibility change. If Phase 6 needs
  schema fields, bump the current semantic store shape and reject incompatible
  existing stores before applying DDL.
- Add backend-owned cartographer types in or near `internal/semanticgraph`:

```text
CartographerRun
CartographerWindow
CartographerCursor
CartographerTrajectorySummary
CartographerInputBundle
CartographerPatch
CartographerPatchValidationResult
CartographerPatchApplicationResult
```

- Add persistent audit/progress state for cartographer runs, windows, cursors,
  trajectory summaries, proposed patches, validation diagnostics, and created
  semantic event ids. This state may live in the semantic SQLite database but
  must remain separate from canonical semantic graph meaning until patches are
  validated and applied.
- Wire a small provider interface:

```text
type CartographerProvider interface {
  ProposePatches(context.Context, CartographerInputBundle) (CartographerProviderResult, error)
}
```

- Add a deterministic scripted/fake provider for unit and Electron tests. Do not
  wire a production provider in 6A.
- Add internal validation for provider result envelope shape only. Detailed
  semantic patch validation lands in 6C.

Acceptance criteria:

```text
typed avoid-steering logic replaces string matching
cartographer store opens/rejects incompatible versions using the no-migration policy
cartographer run/window/cursor/summary records can be persisted and read
scripted provider can return deterministic patch envelopes
no runtime chat/workflow behavior changes yet
```

Verification:

- Focused backend tests for typed avoid steering, schema startup, store
  persistence/readback, and scripted provider behavior.

### Phase 6B: Event-Driven Trajectory Windows

Goal: let Setta observe active workflow-agent progress incrementally and build
bounded cartographer input windows without mutating semantic graph state.

Deliverables:

- Start with explicit trigger points only:

```text
manual cartographer run for a known workflow execution, chat run, or semantic target
active Codex-backed workflow agent run windows when workflow/chat/run refs are known
Codex-backed workflow agent run completion when workflow/chat/run refs are known
explicit retry/review of a failed or rejected cartographer run
```

- Do not run background scans across all workspaces or all historical sessions
  in Phase 6.
- Add an event-driven trajectory observer that subscribes to ordinary production
  chat/workflow events and groups meaningful activity into bounded windows. The
  observer should react to events such as:

```text
chat.run_item.created
chat.run_item.updated
chat.run_item_output.delta
chat.assistant_text_delta
chat.run.updated
workflow runner events for the owning workflow node execution
```

- Close and enqueue a cartographer window on meaningful boundaries instead of
  every event:

```text
tool/run item completed, failed, cancelled, or requires approval
file change item completed
test/command result completed
assistant message completes or reaches a bounded summary threshold
output byte/token threshold reached
quiet period after activity
workflow node/run completed
manual user request to cartograph current progress
```

- Persist cartographer cursors so long-running agents can be processed
  incrementally and resume after restart:

```text
workspace_id
workflow_execution_id
workflow_node_execution_id
chat_conversation_id
chat_run_id
last_chat_event_stream_id
last_chat_event_sequence
last_workflow_event_cursor
last_output_ordinal_by_run_item
last_window_id
updated_at
```

- Build each window from new activity since the cursor plus compact prior
  context. Do not send the whole trajectory repeatedly for multi-hour runs.
- Store bounded trajectory summaries for processed windows. Later windows should
  reference prior summaries, semantic nodes, evidence refs, and context packs
  rather than raw earlier transcript/output.
- Define a typed cartographer input bundle assembled by the backend:

```text
workspace_id
trigger_kind
source refs: workflow_definition_id, workflow_execution_id, workflow_node_id,
  workflow_node_execution_id, chat_conversation_id, chat_run_id, chat_message_id,
  run_item_id
run status and terminal reason
window_id
window_start_cursor
window_end_cursor
new chat/workflow events since previous cursor
authored user/workflow prompt summary or bounded prompt text
assistant response summary or bounded assistant text
tool calls and tool results with run item ids
file read/edit refs, diff summaries, and test result summaries already captured
  by production run activity
prior cartographer window summaries for the same run/node
existing semantic subgraph selected by explicit refs and Phase 5 context packs
active steering directives
recent context packs delivered to the run
evidence anchors and activity intervals tied to the same source refs
token/input budget and truncation metadata
```

- Keep large raw transcripts, complete diffs, complete logs, and complete files
  out of cartographer input records. Store bounded summaries plus source refs.
- If a window is too large, summarize or split it deterministically before
  provider invocation and record the truncation/splitting metadata in the run
  audit.

Acceptance criteria:

```text
active workflow-agent chat/run events produce bounded windows
windows close on meaningful boundaries, not every event
cursors resume after restart without rereading the whole run
multi-hour runs are represented by summaries plus source refs
manual cartographer run can build a current-progress window
no semantic graph mutations are applied in 6B
```

Verification:

- Focused backend tests for event-driven observation, window closing triggers,
  cursor persistence, restart resume, large-window split/summarize behavior, and
  input-bundle assembly.
- Long-run tests proving a multi-window trajectory is processed incrementally
  without resending the whole run.

### Phase 6C: Patch Schema, Validation, And Application

Goal: validate cartographer patch proposals and apply accepted low-risk patches
through normal semantic graph events.

Deliverables:

- Define a strict graph patch schema as a discriminated union. Each patch must
  include:

```text
patch_id
operation
workspace_id
source refs
causation_id
correlation_id
confidence: 0.0..1.0
public_summary
evidence_refs[]
model_info
review_required
payload
```

- Supported initial operations:

```text
record_finding
record_decision
record_constraint
record_open_question
update_node_summary
attach_evidence
create_edge
start_activity
end_activity
split_node
merge_nodes
mark_resolved
```

- For node creation, require either an exact existing `semantic_node_id` or a
  `new_node` payload with explicit kind, label, summary, scope, and evidence
  refs. Do not deduplicate by label or keyword similarity in Phase 6.
- For edge creation, require exact existing node ids unless the same validated
  patch application creates the referenced session-scoped node.
- For split/merge/mark-resolved/update operations, require exact target ids and
  default them to review-required unless a later policy explicitly allows
  automatic application.
- Validate cartographer patches before appending semantic events:

```text
node kind is valid
edge kind is valid
evidence references exist
activity/source refs exist when referenced
split/merge targets exist
confidence is present and within range
public summary contains no chain-of-thought
patch causation/correlation fields are present
patch ids are unique within the cartographer run
workspace ids match the input bundle
operation is supported
review-required operations are not auto-applied
large raw content is absent from patch payloads
```

- Persist a cartographer run/patch audit before applying accepted patches:

```text
run_id
workspace_id
trigger_kind
source refs
window_id
window_start_cursor
window_end_cursor
provider/model metadata
input bundle hash
input item counts and truncation metadata
trajectory summary created by this window
raw provider response hash
status: proposed | applied | rejected | failed
validation diagnostics
patches[]
created semantic event ids
```

- Apply accepted patches by calling existing semantic graph service operations
  or a new typed internal patch applier that emits normal semantic events. Do
  not add a generic append-anything endpoint for the renderer.
- Use all-or-nothing application for accepted patches. Persist patch-audit state
  and graph-event appends in one transaction when possible; if validation or
  application fails, persist a failed/rejected run audit and append no graph
  mutations.
- Auto-apply only low-impact, evidence-backed, session-scoped patches in the
  first implementation:

```text
record_finding
record_decision
record_constraint
record_open_question
attach_evidence to a cartographer-created or exact existing target
```

- Hold low-confidence, evidence-light, split, merge, mark-resolved, broad
  update, or high-impact edge patches for review.
- Do not expose a generic patch-append endpoint to the renderer.

Acceptance criteria:

```text
invalid provider output leaves graph state unchanged
accepted patches apply through normal semantic graph events
patch audit records input hash, response hash, diagnostics, summary, and event ids
application is all-or-nothing
low-risk session-scoped patches can auto-apply
high-impact or low-confidence patches remain pending review
no label/keyword/fuzzy/vector deduplication is used
```

Verification:

- Deterministic provider tests for accepted patches, invalid JSON, unsupported
  operations, missing evidence, unknown refs, missing confidence, duplicate patch
  ids, chain-of-thought fields, and provider failures.
- Patch application tests proving validation happens before graph mutations and
  that failed/rejected patches leave graph state unchanged.
- Tests proving no label/keyword/fuzzy/vector deduplication is used.

### Phase 6D: Read, Review, And Renderer Surfaces

Goal: make cartographer activity inspectable and reviewable through production
HTTP, generated TypeScript, IPC/preload, and renderer paths.

Deliverables:

- Add minimal review/read surfaces:

```text
run cartographer for explicit source refs or current active-run progress
list cartographer runs by workflow execution/chat run/semantic target
read cartographer run by id
read cartographer windows/cursors for a workflow execution or chat run
accept/reject a pending cartographer patch
show cartographer patch history from semantic node details and run-adjacent surfaces
```

- Keep generated TypeScript contracts owned by Go HTTP endpoint contracts.
- Show cartographer-originated semantic nodes, evidence, pending review patches,
  validation diagnostics, window summaries, and cursors in run-adjacent and
  semantic-node detail surfaces.
- Review actions should accept/reject pending patches explicitly and apply
  accepted patches through the same 6C validator/applier path.

Acceptance criteria:

```text
HTTP and IPC surfaces expose cartographer run/window/cursor/patch state
generated TypeScript contracts are regenerated from Go-owned endpoint contracts
semantic node details show cartographer provenance and pending review state
review accept/reject updates audit state and applies accepted patches safely
```

Verification:

- HTTP contract tests for cartographer run/read/review surfaces.
- Renderer tests for cartographer patch history, window summaries, validation
  diagnostics, and review UI.
- Deterministic end-to-end app workflow through production
  Electron/main/preload/renderer/HTTP/store paths proving a Codex-backed
  workflow run creates evidence-grounded semantic nodes while the run is still
  active, records cartographer audit, survives reload, resumes from persisted
  cursors, exposes review state, and can be inspected.

### Phase 6E: Production Provider And Live Verification

Goal: wire the real LLM-backed cartographer provider after the deterministic
pipeline is already validated end to end.

Deliverables:

- Add the production provider behind explicit runtime wiring. Prefer reusing
  existing Codex/ChatGPT-auth plumbing only if it can run an isolated
  cartographer turn and return strict JSON. Otherwise use a minimal Go HTTP
  client for the chosen model provider behind the same interface.
- Do not make provider unavailability look like a successful no-op. Provider
  auth, transport, schema, timeout, or rate-limit failures should create failed
  cartographer audits with explicit diagnostics.
- Keep production provider prompts bounded by 6B windows and summaries. Do not
  let the production provider request whole-run backfills in Phase 6E.
- Preserve the strict no-chain-of-thought policy. Store public summaries,
  structured patches, model metadata, confidence, diagnostics, and hashes only.

Acceptance criteria:

```text
production provider can propose strict JSON patches for active workflow-agent windows
provider failures are visible as failed audits
live provider output passes the same 6C validator before any graph mutation
long-running workflows continue to use bounded windows and persisted cursors
```

Verification:

- Deterministic provider tests must remain the primary regression suite.
- Because Phase 6 touches chat/workflow/agent behavior and semantic graph
  mutation, run live Codex E2E tests when local ChatGPT auth is available. If
  unavailable, report the live provider skip explicitly.

## Phase 7: Retrieval Indexes

Goal: improve recall for context packs and cartographer input without changing
semantic truth.

Deliverables:

- Add or enable SQLite FTS5 indexes for semantic nodes, evidence text, prompts,
  chats, diffs, and docs.
- Add exact search integration through ripgrep for workspace file search when
  current indexed evidence is insufficient.
- Add an internal retrieval service that merges:

```text
explicit graph links
FTS results
exact path/text matches
recent activity
workflow/run associations
user pins and steering
```

- Add a `VectorIndex` interface but do not require a concrete vector backend in
  the first retrieval slice.
- Evaluate sqlite-vec behind that interface only after collecting representative
  sessions where text/link retrieval misses important context.
- Evaluate Tree-sitter only when file/range anchors need structured symbol
  resolution beyond observed agent activity.

Verification:

- Focused retrieval tests for deterministic ranking and stable explanations.
- Performance checks on large evidence sets before enabling broad automatic
  retrieval in production paths.

## Later Phases And Verification Policy

Phases 8 through 10, the MVP definition, and the verification policy live in
`docs/plans/setta_semantic_work_graph_implementation_plan_later_phases.md`.
