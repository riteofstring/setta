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
- Do not add compatibility shims, legacy data migrations, dual-read/write paths,
  or old-field aliases.

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

Deliverables:

- Attach evidence anchors from existing production paths:

```text
user prompts
assistant messages
workflow definitions
workflow executions
workflow nodes
workflow events
chat runs
tool calls
file paths and ranges observed from activity
diff summaries when available
test command/result summaries when available
```

- Record activity intervals when an existing run, workflow node, or agent task is
  explicitly associated with a semantic node.
- Add backend APIs for attaching existing semantic nodes to a run or workflow
  node.
- Show live/historical activity overlays in the renderer.
- Keep associations explicit in this phase. Do not add keyword-based or
  embedding-based automatic semantic-node creation.

Verification:

- Focused backend tests for evidence anchor persistence and activity interval
  lifecycle.
- Deterministic Electron/main/preload/renderer/HTTP/store test through a real
  workflow/chat path when attaching semantic nodes to active work.

## Phase 4: User Editing And Steering Directives

Goal: let users curate the graph and create auditable steering state.

Deliverables:

- Add user operations:

```text
rename
dismiss
promote
split
merge
pin visually
pin for session
pin for workspace
attach to run
focus agent here
avoid
validate
add constraint
add steering prompt
```

- Store every operation as a semantic event.
- Maintain lineage for split/merge operations and reassign edges, evidence,
  activity history, layout, and steering directives through explicit events.
- Add steering directive projections with clear lifecycle:

```text
created
active
superseded
completed
dismissed
```

- Render steering state in node details and run context surfaces.

Verification:

- Backend reducer tests for split/merge/rename/dismiss/promote and directive
  lifecycle.
- Renderer tests for editing flows and state transitions.
- Deterministic Electron workflow for user editing, reload, and historical event
  inspection.

## Phase 5: Semantic Context Compiler

Goal: deliver selected semantic context to agents explicitly and audit what was
sent.

Deliverables:

- Implement a backend context compiler that produces bounded context packs for:

```text
run start
agent task start
user steering during an active run
phase boundaries
agent-requested semantic context
```

- Include in each context pack:

```text
relevant concepts
active constraints
prior decisions
open questions
steering directives and steering prompts
relevant files/symbols/docs/diffs/tests
reason each item was included
priority: background, relevant, important, required
token budget estimate
```

- Implement initial custom ranking without vector search:

```text
explicit user steering
active workflow/run associations
active constraints
prior decisions
recent activity
direct evidence links
text match through FTS/exact search when available
confidence/review status
staleness
token cost
```

- Persist `context_pack.created` events and context-pack history before or at the
  same time the agent receives the context.
- Integrate compiled context into Codex-backed workflow agent tasks and mid-run
  steering updates as explicit messages or context deltas.

Verification:

- Focused compiler tests for ranking, token-budget behavior, explicit steering,
  required constraints, and stale/dismissed node exclusion.
- Deterministic end-to-end app workflow tests through production
  Electron/main/preload/renderer/HTTP/store paths.
- Because this touches chat/workflow/agent context behavior, run live Codex E2E
  tests when local ChatGPT auth is available. If unavailable, report the live
  provider skip explicitly.

## Phase 6: Semantic Cartographer

Goal: create and update semantic graph state from observed work through a
validated LLM-backed patch pipeline.

Deliverables:

- Define a typed cartographer input bundle:

```text
user prompt
agent messages
tool calls
file reads/edits
diffs
test results
workflow metadata
existing semantic subgraph
active steering directives
recent context packs
```

- Define a strict graph patch schema:

```text
create_or_reuse_node
update_node_summary
attach_evidence
create_edge
start_activity
end_activity
split_node
merge_nodes
mark_resolved
record_finding
record_decision
record_constraint
record_open_question
```

- Validate cartographer patches before appending semantic events:

```text
node kind is valid
edge kind is valid
evidence references exist
split/merge targets exist
confidence is present
public summary contains no chain-of-thought
patch causation/correlation fields are present
```

- Start with session-scoped cartographer updates. Promotion to durable workspace
  memory should be explicit or policy-driven by a later phase.
- Add review affordances for low-confidence or high-impact cartographer patches.

Verification:

- Deterministic tests with scripted cartographer output.
- Patch validation tests for malformed, unsupported, or evidence-free patches.
- End-to-end workflow tests proving semantic nodes appear from an agent session,
  are grounded in evidence, survive reload, and can be inspected.
- Live Codex E2E when ChatGPT auth is available.

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

## Phase 8: Constraint Enforcement Bridge

Goal: connect semantic constraints to runtime validation without mixing semantic
meaning and executable enforcement.

Deliverables:

- Support enforcement levels:

```text
prompt_only
llm_judge_checked
code_checked
workflow_gate
```

- Link constraint nodes to enforcement mechanisms:

```text
file edit guard
schema/API diff check
contract test
custom command
LLM judge
human approval
workflow validation gate
```

- Record constraint check results as semantic events with evidence.
- Show constraint status in node details, run details, and workflow validation
  surfaces.
- Keep prompt-only constraints useful but visibly weaker than code-checked or
  workflow-gated constraints.

Verification:

- Backend tests for constraint check recording and enforcement-level display.
- Deterministic Electron workflow for at least one prompt-only constraint and
  one code-checked or workflow-gated constraint.
- Live provider test when a constraint is delivered to a live Codex run.

## Phase 9: Replay And Review

Goal: make the semantic graph's history inspectable and compatible with future
session replay.

Deliverables:

- Add event-history views for a semantic node, run, session, and workspace.
- Add projection rebuild/debug tooling for a temporary app data directory.
- Add time-window queries for activity intervals and semantic graph changes.
- Add optional replay data APIs:

```text
events in time order
graph projection at event cursor
activity intervals active at timestamp/cursor
context packs delivered by cursor
cartographer patches by cursor
```

- Keep UI replay minimal at first: chronological review and selected-node history
  are enough before animation.

Verification:

- Backend tests for projection-at-cursor and activity time-window queries.
- Electron workflow for history inspection and reload.

## Phase 10: Optional Library Evaluations

Goal: add heavier libraries only when real usage shows the need.

Evaluation order:

1. **ELK.js** for auto-layout of new/unpinned semantic neighborhoods.
2. **sqlite-vec** for local embedding retrieval behind `VectorIndex`.
3. **OpenTelemetry + OpenInference** for agent/cartographer/retrieval traces.
4. **Tree-sitter** for structured file/symbol anchors.
5. **LadybugDB** as a rebuildable graph traversal/analytics projection.
6. **Graphiti** as a benchmark/reference for temporal agent memory quality, not
   as Setta's implementation substrate.

Each evaluation should produce a short report or plan update covering:

```text
problem being solved
sample Setta traces used
quality/performance result
packaging impact
dependency/license impact
replacement/fallback story
whether the dependency becomes required, optional, or rejected
```

Dependency changes must pin exact versions and use the repo dependency workflow.

## MVP Definition

The MVP is complete when this loop works through production app paths:

```text
agent or workflow work happens
semantic events are appended
semantic nodes/edges/activity appear
each node has inspectable evidence
user can edit and steer through graph operations
selected semantic context reaches an agent explicitly
context-pack history records what the agent saw
state survives restart/reload
history can explain why the graph changed
```

MVP dependencies should be limited to existing stack plus SQLite FTS5 if
available. Vector search, graph databases, CRDTs, durable message brokers,
external tracing backends, and alternate graph renderers are later additions only
after pressure from real Setta sessions.

## Verification Policy By Phase

- Run the narrowest focused backend, renderer, or Electron checks that exercise
  each phase first.
- Regenerate TypeScript contracts whenever Go-owned semantic contracts or HTTP
  endpoint contracts change.
- For phases touching chat behavior, Codex harness behavior, provider protocol
  handling, run lifecycle, queueing, steering, approvals, event streaming,
  IPC/preload contracts, generated backend contracts, renderer chat state, or
  transcript UI, add deterministic end-to-end app workflow tests through the
  production Electron/main/preload/renderer/HTTP/store paths.
- When semantic context is delivered to Codex-backed runs, run live Codex E2E
  tests if local ChatGPT auth is available. If unavailable, report the live test
  skip explicitly and do not treat the skip as provider proof.
- Before committing source, tests, scripts, generated inputs or outputs, build
  config, or executable examples, run `./scripts/format.sh` and
  `./check_quality.sh --all`.
- For documentation-only changes to this plan, inspect the diff and skip the full
  workflow unless a directly relevant automated check exists.
