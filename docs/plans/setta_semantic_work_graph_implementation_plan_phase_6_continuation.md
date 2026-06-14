# Setta Semantic Work Graph Implementation Plan: Phase 6 Continuation

This continuation belongs with
`docs/plans/setta_semantic_work_graph_implementation_plan.md` and keeps the
main implementation plan below the repository file-length limit. Phase 6A
remains in the main plan because it is the active foundation phase.

## Phase 6: Semantic Cartographer

Goal: create and update semantic graph state from observed work through a
validated LLM-backed patch pipeline.

Architecture requirement: the cartographer must use the same LLM harness
substrate as master chat windows and workflow agent AI nodes. Codex is the first
production harness adapter, but Phase 6 must not introduce a separate
cartographer-only provider stack, auth path, model client, or backend selection
mechanism.

Scope guard:

- Implement the cartographer as a graph-patch proposal and validation pipeline,
  not as retrieval, constraint enforcement, a generic memory system, or a graph
  database.
- Do not add LangChain/LlamaIndex/Graphiti/CrewAI/agent-framework dependencies.
  Use Setta's common LLM harness substrate with a deterministic scripted/fake
  harness for tests and the Codex harness adapter as the first production
  implementation.
- Do not call a direct OpenAI API client, Codex-specific helper, or any other
  model backend from cartographer code. Cartographer code prepares typed input,
  requests strict structured output through the common harness, and validates the
  returned patch envelope.
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

Implement Phase 6 as sub-phases. Each sub-phase should leave the app in a
shippable state and should not require later sub-phases to make its tests
meaningful. Phase 6A is defined in the main implementation plan.

### Phase 6B: Event-Driven Trajectory Windows

Goal: let Setta observe active workflow-agent progress incrementally and build
bounded cartographer input windows without mutating semantic graph state.

Preflight before implementation:

- Expand the Phase 6A cartographer cursor/store shape to support the full 6B
  incremental observer requirements before adding the observer. The 6A cursor is
  only a foundation record; 6B needs separate chat, workflow, and run-item-output
  progress fields.
- Keep this as a strict no-migration/no-compatibility change. Bump the semantic
  store version and reject incompatible existing stores before applying DDL. Do
  not add upgrade code, old-schema reads, old-field aliases, or transitional dual
  paths.
- The cursor shape must be able to persist:

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

Deliverables:

- Start with explicit trigger points only:

```text
manual cartographer run for a known workflow execution, chat run, or semantic target
active harness-backed workflow agent run windows when workflow/chat/run refs are known
harness-backed workflow agent run completion when workflow/chat/run refs are known
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
  harness invocation and record the truncation/splitting metadata in the run
  audit.

Acceptance criteria:

```text
active workflow-agent chat/run events produce bounded windows
windows close on meaningful boundaries, not every event
cursors resume after restart without rereading the whole run
cursor records persist independent chat, workflow, and run-item-output progress
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

Preflight before implementation:

- Treat the Phase 6A/6B `CartographerPatch` and patch operation shape as a
  provisional persistence/audit scaffold only. Before implementing semantic
  validation or application, replace it with the strict Phase 6C patch envelope
  and discriminated operation schema described below. Do not build the 6C
  validator around the generic `{kind, targetEntityId, payload}` operation
  shape.
- Keep this as a strict no-migration/no-compatibility change. Bump the semantic
  store version for the patch schema change and reject incompatible existing
  semantic stores. Do not add upgrade code, old patch aliases, dual-read paths,
  or transitional adapters.
- Use `confidence` as a required JSON number in the `0.0..1.0` range. Do not
  keep or accept the provisional integer `0..100` confidence representation.
- Phase 6C should use deterministic/fake patch envelopes in tests and should
  not wire production Codex/model execution yet. Production harness invocation
  remains Phase 6E; Phase 6C owns schema, validation, audit, and application.

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
harness/model metadata
input bundle hash
input item counts and truncation metadata
trajectory summary created by this window
raw harness response hash
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
invalid harness output leaves graph state unchanged
provisional Phase 6A/6B patch records are replaced by the strict Phase 6C schema
accepted patches apply through normal semantic graph events
patch audit records input hash, response hash, diagnostics, summary, and event ids
application is all-or-nothing
low-risk session-scoped patches can auto-apply
high-impact or low-confidence patches remain pending review
no label/keyword/fuzzy/vector deduplication is used
```

Verification:

- Deterministic harness tests for accepted patches, invalid JSON, unsupported
  operations, missing evidence, unknown refs, missing confidence, duplicate patch
  ids, chain-of-thought fields, and harness failures.
- Patch application tests proving validation happens before graph mutations and
  that failed/rejected patches leave graph state unchanged.
- Tests proving no label/keyword/fuzzy/vector deduplication is used.

### Phase 6D: Read, Review, And Renderer Surfaces

Goal: make cartographer activity inspectable and reviewable through production
HTTP, generated TypeScript, IPC/preload, and renderer paths.

Preflight before implementation:

- Treat Phase 6D as surfaces over the Phase 6B/6C deterministic pipeline. Do
  not wire production Codex/model cartographer execution in 6D; production
  common-harness invocation remains Phase 6E. If a runtime cartographer request
  cannot be satisfied without production structured-task support, return an
  explicit unsupported/failed audit instead of silently no-oping.
- Add backend read/review service methods before renderer work. The renderer
  should consume Go-owned HTTP contracts and generated TypeScript only; do not
  add renderer-local mirrors of cartographer contracts.
- Review actions must operate on stored `pending_review` patch records only.
  Rejecting a patch updates audit state and appends no semantic graph mutation.
  Accepting a patch must revalidate the stored patch against current graph,
  evidence, workspace, and source-ref state, then apply it through the same 6C
  validator/applier path. Do not allow accepting already applied/rejected
  patches, and do not add a generic patch-append endpoint.
- Keep deterministic end-to-end coverage on production Electron/main/preload/
  renderer/HTTP/store paths, using temporary app data and scripted/fake
  harness/provider behavior. Live Codex cartographer verification belongs to
  Phase 6E.

Deliverables:

- Add minimal review/read surfaces:

```text
build or run cartographer for explicit source refs/current active-run progress when supported by the existing deterministic pipeline
list cartographer runs by workflow execution/chat run/semantic target
read cartographer run by id
read cartographer windows/cursors for a workflow execution or chat run
read cartographer patches by run, semantic target, and status
accept/reject a pending cartographer patch
show cartographer patch history from semantic node details and run-adjacent surfaces
```

- Keep generated TypeScript contracts owned by Go HTTP endpoint contracts.
- Show cartographer-originated semantic nodes, evidence, pending review patches,
  validation diagnostics, window summaries, and cursors in run-adjacent and
  semantic-node detail surfaces.
- Review actions should accept/reject pending patches explicitly and apply
  accepted patches through the same 6C validator/applier path.
- Keep the initial UI operational and inspectable rather than predictive:
  show run/window/patch status, validation diagnostics, source refs, confidence,
  public summaries, created semantic event ids, and pending review actions.

Acceptance criteria:

```text
HTTP and IPC surfaces expose cartographer run/window/cursor/patch state
generated TypeScript contracts are regenerated from Go-owned endpoint contracts
semantic node details show cartographer provenance and pending review state
review accept/reject updates audit state and applies accepted patches safely
production Codex/model cartographer execution is not introduced before Phase 6E
```

Verification:

- HTTP contract tests for cartographer run/read/review surfaces.
- Renderer tests for cartographer patch history, window summaries, validation
  diagnostics, and review UI.
- Deterministic end-to-end app workflow through production
  Electron/main/preload/renderer/HTTP/store paths proving a scripted/fake
  cartographer workflow or pre-seeded active-run window creates or exposes
  evidence-grounded cartographer audit, survives reload, resumes from persisted
  cursors, exposes review state, and can be inspected. Production Codex-backed
  cartographer turns are verified in Phase 6E.

### Phase 6E: Production Harness Wiring And Live Verification

Goal: wire semantic cartographer turns through the production common LLM harness
after the deterministic pipeline is already validated end to end.

Preflight before implementation:

- Start from the Phase 6D state: deterministic cartographer windows, strict
  patch validation/application, review surfaces, and generated frontend
  contracts are already in place. Phase 6E should wire production execution into
  those paths, not redefine patch schema, review semantics, or renderer
  contracts.
- `CodexHarness.RunTask` currently rejects structured tasks. Implement
  structured-task support in the common harness path for
  `HarnessSurfaceSemanticCartographer`, `HarnessTurnStructuredTask`, and
  `HarnessOutputStrictJSON`; do not add a cartographer-specific Codex helper or
  direct provider client.
- Keep the cartographer capability policy restrictive in production:

```text
allowed_tools: []
workspace_mutation: false
approvals: false
streaming: false
```

  Do not expose CLI, MCP, dynamic tools, file reads, workspace writes, or
  approval flows to the cartographer in Phase 6E.
- Write the production cartographer prompt as backend-owned source near the
  cartographer harness boundary. The prompt must instruct the model to emit only
  the strict patch envelope, use only ids/source refs/evidence present in the
  input bundle, set `reviewRequired` when uncertain or high impact, return an
  empty patch list when no evidence-backed update is warranted, and avoid
  chain-of-thought or large raw content.
- If Codex or any future harness cannot satisfy strict structured output for the
  requested task, fail the cartographer run with explicit diagnostics. Do not
  fall back to best-effort free-text parsing.

Deliverables:

- Wire cartographer turns through the same runtime-selected LLM harness used by
  master chats and workflow agent AI nodes. The first production adapter is the
  existing Codex harness/ChatGPT-auth path.
- Do not add a direct OpenAI API client, Codex-specific cartographer helper, or
  per-feature model selection path in cartographer code. New future backends
  such as Claude Code, OpenCode, OpenHands, or direct model APIs must be added as
  common harness adapters.
- Run cartographer turns as isolated structured tasks with strict JSON output,
  explicit tool/capability policy, persisted harness metadata, and no workspace
  mutation authority unless a later phase explicitly grants it.
- Add a production cartographer runner that processes closed 6B windows by:

```text
loading the persisted window/run/input bundle
building a CartographerHarnessTask with the production prompt and strict schema
calling the shared HarnessTaskRunner
persisting harness/audit metadata
passing the raw structured response into the 6C validator/applier
marking the window processed only after audit state is persisted
```

- Support explicit/manual run requests through the same runner path when a
  current-progress window has already been built. Do not add background scans
  across all workspaces or historical sessions.
- Do not make harness unavailability look like a successful no-op. Harness auth,
  transport, schema, timeout, rate-limit, or unsupported-capability failures
  should create failed cartographer audits with explicit diagnostics.
- Keep production harness prompts bounded by 6B windows and summaries. Do not let
  the production harness request whole-run backfills in Phase 6E.
- Preserve the strict no-chain-of-thought policy. Store public summaries,
  structured patches, model metadata, confidence, diagnostics, and hashes only.

Acceptance criteria:

```text
production Codex harness adapter can propose strict JSON patches for active workflow-agent windows
closed windows are processed through the shared harness runner and then the 6C validator/applier
harness failures are visible as failed audits
live harness output passes the same 6C validator before any graph mutation
long-running workflows continue to use bounded windows and persisted cursors
cartographer production turns have no tools, no workspace mutation authority, no approvals, and no streaming
```

Verification:

- Deterministic tests for Codex/common-harness structured-task request
  construction, strict schema propagation, prompt/input assembly, failure audit
  persistence, and window processed-state transitions.
- Deterministic end-to-end app workflow through production
  Electron/main/preload/renderer/HTTP/store paths proving an active workflow run
  produces a cartographer window, processes it through a scripted structured
  harness, applies or holds validated patches through 6C/6D, survives reload,
  and exposes the audit/review state.
- Deterministic harness tests must remain the primary regression suite.
- Because Phase 6 touches chat/workflow/agent behavior and semantic graph
  mutation, run live Codex E2E tests when local ChatGPT auth is available. If
  unavailable, report the live-harness skip explicitly. Live tests must not use
  `OPENAI_API_KEY`; they should exercise the local Codex CLI ChatGPT-auth path.

### Phase 6F: Default-On Automatic Cartographer Processing

Goal: make semantic graph updates happen automatically during normal workflow
runs when the semantic cartographer is enabled.

This phase is required before the semantic work graph MVP can be considered
complete. Phase 6E proves that a closed cartographer window can be processed
through the shared harness. Phase 6F wires that runner into production workflow
execution so users do not need to call hidden APIs, press a review button, or
manually approve semantic graph updates.

Preflight before implementation:

- Start from the Phase 6E runner. Do not redefine the patch schema, prompt,
  structured-output contract, validation rules, evidence model, or shared
  harness abstraction.
- Keep the cartographer enabled by default for workflow runs. Add an explicit
  setting only to disable automatic cartography, not to enable it.
- Use push-based workflow/chat event observation. Do not add periodic polling.
  A startup recovery scan for closed unprocessed windows is acceptable because
  it repairs durable work after restart.
- Do not ask for user review or permission before applying cartographer output.
  The safety boundary is deterministic validation plus append-only semantic
  events, not a user approval gate.
- Keep the cartographer non-mutating with respect to the workspace filesystem
  and workflow definitions. It may only propose semantic graph patches through
  the existing strict JSON envelope.

Deliverables:

- Add an automatic cartographer processing queue owned by the semantic graph
  service or runtime wiring. When the observer closes a cartographer window, the
  window should be enqueued immediately for processing through
  `ProcessCartographerWindow`.
- Process windows while the workflow is still running as windows close, not only
  after the workflow reaches a terminal state. Terminal workflow windows should
  also be processed automatically.
- Add per-workspace or per-source concurrency limits so a long workflow cannot
  start unbounded cartographer turns. Preserve ordering for windows from the
  same chat run, workflow execution, or cartographer cursor.
- Add durable recovery on backend startup:

```text
find closed, unprocessed cartographer windows
ignore already running/processed windows
enqueue pending closed windows in deterministic order
record explicit diagnostics for windows that fail processing
```

- Auto-apply every cartographer patch that passes deterministic validation.
  Validation failures should be persisted as failed/rejected cartographer audit
  records with diagnostics and no graph mutation.
- Remove review-required behavior from the automatic path. If the model marks a
  patch as review-required, store that fact as metadata/diagnostics but do not
  block application when deterministic validation passes.
- Keep existing review surfaces as audit/correction tools only. They should not
  be required for normal automatic graph evolution.
- Refresh semantic graph projections and renderer state after automatic patches
  create or update nodes, edges, evidence, activity, or steering records.
- Surface operational state for dogfooding:

```text
cartographer enabled/disabled
queued windows
running window/process count
last processed window
last failure diagnostic
created semantic event ids
```

- Ensure automatic processing uses the same runtime harness entry point as
  master chats and workflow agent nodes. Do not introduce a cartographer-only
  backend, direct model client, hidden CLI invocation, or alternate provider
  path.

Acceptance criteria:

```text
new workspaces run with semantic cartographer automatic processing enabled
any agentic workflow run produces semantic nodes/evidence automatically when the agent trajectory contains evidence-backed findings, decisions, questions, constraints, or activity
semantic nodes can appear while a long workflow is still running as cartographer windows close
no user review, approval, or permission prompt is required for validated semantic graph updates
invalid or unsupported cartographer output records failed audit state without mutating the graph
restart processes closed unprocessed windows exactly once
automatic processing remains bounded by cartographer windows, summaries, and concurrency limits
```

Verification:

- Focused backend tests for queueing on window close, per-source ordering,
  concurrency limits, restart recovery, idempotent processed-window handling,
  harness failure diagnostics, validation failure no-mutation behavior, and
  auto-application of validated patches that were marked review-required by the
  model.
- Deterministic end-to-end Electron workflow through production
  Electron/main/preload/renderer/HTTP/store paths proving semantic nodes are
  produced automatically through the scripted structured harness, without
  calling `processCartographerWindow` from the test and without accepting a
  review prompt. A simple `Start -> Agent -> End` graph is enough for the
  minimal smoke case, but the implementation must attach to the general
  workflow/chat event stream rather than that specific graph shape.
- Deterministic long-running workflow test proving multiple bounded windows are
  processed before workflow terminal completion and survive reload/restart.
- Live Codex E2E test when local ChatGPT auth is available. If unavailable,
  report the live-harness skip explicitly. The live test should verify automatic
  semantic node creation from a real workflow agent run, not only manual window
  processing.

### Phase 6F Follow-Up: Semantic Graph Change Propagation

Goal: make semantic graph changes created by automatic cartographer processing
visible in already-open renderer surfaces without reloads, manual refreshes, or
polling.

This is a Phase 6F completion follow-up, not a new product phase. Phase 6F is
only complete when semantic graph mutations created during a workflow run are
observable by the renderer through the same production app paths users are
already using. A cartographer patch that is applied in SQLite but invisible
until workspace reload does not satisfy the Phase 6F user experience.

Preflight before implementation:

- Do not add renderer polling, timeouts, forced window reloads, or one-off
  "refresh after workflow run" calls. Semantic graph updates are domain state
  changes and need a durable app-wide invalidation mechanism.
- Do not add renderer-local mirrors of semantic graph contracts. Event payloads
  and request/response types must come from Go-owned contracts through the
  normal generator path.
- Keep semantic graph mutation authority in the backend service. The renderer
  should subscribe to change notifications and refetch authoritative read
  models; it should not infer graph mutations from cartographer audit records,
  workflow events, chat events, or local UI state.
- Use push-based propagation. If a backend restart happens, normal initial
  reads should recover the current graph projection; the live update mechanism
  does not need compatibility replay beyond the current process.

Deliverables:

- Add a backend semantic graph change notification stream at the semantic graph
  service boundary. Emit notifications after committed semantic events or
  projection-affecting operations, including cartographer-applied patches,
  manual semantic node/edge edits, evidence/activity/steering mutations, and
  layout updates.
- Define a typed notification contract with enough information for efficient
  renderer invalidation:

```text
workspace id
monotonic sequence or revision for the current process
changed areas: graph | activity | steering | context_packs | cartographer_audit | layout
changed semantic node ids
changed edge ids
changed target entity ids
created semantic event ids
cartographer run/window/patch ids when relevant
occurred at
```

- Wire the notification stream through production backend HTTP, Electron main,
  preload, and renderer paths. Prefer matching the existing chat/workflow event
  stream architecture so semantic graph updates become another first-class app
  event source rather than a feature-local callback.
- Update `useSemanticGraphState` to subscribe for the selected workspace,
  coalesce bursts of notifications, and refetch the authoritative semantic graph
  and affected activity summaries. The hook should unsubscribe on workspace
  change/unmount and ignore notifications for other workspaces.
- Keep renderer state replacement deterministic. Do not merge partial semantic
  graph data by hand unless the backend exposes a typed incremental read model.
  The first implementation should refetch the existing graph/activity read
  models after a relevant notification.
- Make cartographer processing state visible through the same invalidation
  path, so audit panels and operational status can update without manual
  refresh when queued/running/completed windows change.
- Ensure notification delivery is best-effort but state recovery is robust:
  missed live notifications are acceptable if a later explicit read returns the
  correct current projection, but the renderer must not permanently believe a
  loaded graph is current after receiving a failed refetch.

Acceptance criteria:

```text
semantic nodes created by automatic cartographer patches appear in an already-open workflow graph without reload
manual semantic graph mutations also refresh already-open graph/details surfaces
cartographer audit/status surfaces refresh after run/window/patch state changes
no renderer polling or forced page reload is introduced
notifications are workspace-scoped and generated from committed backend state
renderer subscriptions are cleaned up on workspace change and app surface unmount
missed notifications are recoverable by normal read paths after reload/reopen
```

Verification:

- Focused backend tests for notification emission after committed semantic
  events, no emission on failed/rolled-back mutations, workspace scoping, and
  sequence/revision monotonicity.
- Main/preload contract tests proving the semantic graph event stream is exposed
  through generated/typed surfaces, not hardcoded renderer-only shapes.
- Renderer tests for `useSemanticGraphState` subscription, notification
  coalescing, workspace filtering, refetch failure handling, and cleanup.
- Deterministic Electron workflow through production
  Electron/main/preload/renderer/HTTP/store paths proving a `Start -> Agent ->
  End` or equivalent agentic workflow creates a semantic node through automatic
  cartographer processing and that the node appears in the open graph surface
  without reload or manual refresh.

## Phase 7: Retrieval Indexes

Goal: improve recall for context packs and cartographer input without changing
semantic truth.

Current status: not implemented in this branch as of the Phase 7 readiness
review. No FTS tables, retrieval service, retrieval-backed context/cartographer
integration, or Phase 7 performance/usefulness evidence are present yet. Treat
this phase as the prerequisite before Phase 8.

Phase 7 starts after Phase 6F. The cartographer patch schema, canonical graph
tables, context pack contract, and harness abstraction should be treated as
already established. Retrieval is an advisory layer over those records: it may
find candidate context, but it must not become the source of truth for semantic
nodes, evidence, activity, or cartographer decisions.

Use SQLite FTS5 for the first implementation slice. Do not add embeddings,
sqlite-vec, Tree-sitter, background workspace scans, compatibility migrations,
dual-read/write paths, or legacy schema support in Phase 7. If the semantic
store schema needs to change for FTS tables, bump the store version and reject
incompatible stores rather than migrating them. Indexes must be rebuildable from
the canonical semantic graph records.

### Phase 7A: FTS Store And Maintenance

Deliverables:

- Add FTS5 tables for bounded searchable semantic text:
  - semantic node titles, summaries, statuses, labels, and attributes that are
    already persisted as graph data;
  - evidence summaries and quoted evidence text that already has source refs;
  - context pack item labels, reasons, and compact summaries when they are
    persisted;
  - workflow/run association text that is already persisted as semantic
    activity.
- Keep large raw chat logs, huge diffs, and whole workspace files out of the
  first FTS slice unless they already have bounded semantic records and source
  refs.
- Update FTS rows transactionally from semantic event append, projection update,
  and explicit rebuild paths.
- Add a deterministic FTS rebuild path for tests and developer repair. Rebuilds
  must derive rows only from canonical semantic graph data.
- Add focused store tests for insert, update, delete/tombstone, rebuild, and
  stable query ordering.

Verification:

- Go tests for the semantic graph store FTS tables and rebuild behavior.
- Confirm the implementation uses SQLite FTS5 already available through the
  current SQLite dependency; add no new direct dependency unless the
  implementation proves the existing dependency cannot support FTS5.

### Phase 7B: Retrieval Service

Deliverables:

- Add an internal retrieval service that returns typed retrieval results with
  stable ids, source refs, reason strings, scores, and enough provenance to
  explain why each result was selected.
- Merge these candidate sources:

```text
explicit graph links
FTS results
exact path/text matches
recent activity
workflow/run associations
user pins and steering
```

- Keep ranking deterministic. Use explicit graph relationships and source refs
  ahead of keyword matches, then use FTS scores, recency, workflow/run
  association strength, pins, and stable tie-breakers.
- Use `rg` only for explicit workspace file search requests or when persisted
  source refs point to workspace paths that need exact confirmation. Do not run
  broad file-system searches implicitly for every context pack or cartographer
  request.
- Add a `VectorIndex` interface only if it removes branching from the retrieval
  service. Leave it without a concrete backend in Phase 7.

Verification:

- Focused retrieval tests for deterministic ranking and stable explanations.
- Tests proving retrieval does not mutate semantic graph truth.
- Tests covering missing FTS rows, stale index rebuild, pinned items, recent
  activity, exact path/text matches, and stable tie-breaking.

### Phase 7C: Context Pack And Cartographer Integration

Deliverables:

- Use the retrieval service as bounded candidate expansion for context packs and
  cartographer windows after explicit graph associations and steering have
  already been applied.
- Preserve current context pack budgets. Retrieval must compete for existing
  budget rather than expanding prompts without a bound.
- Expose retrieval reasons in internal diagnostics or debug surfaces so a bad
  context inclusion can be traced back to graph links, FTS, exact search,
  activity, pins, or steering.
- Do not change cartographer mutation semantics. The cartographer still receives
  evidence and returns a strict patch envelope; retrieval only helps choose the
  bounded input context.
- Evaluate sqlite-vec only after representative sessions show text/link
  retrieval misses important context. Evaluate Tree-sitter only after observed
  file/range anchors require structured symbol resolution beyond agent activity.

Verification:

- Focused context pack and cartographer window tests proving retrieval-backed
  candidates are included with source refs and reasons.
- Performance checks on large synthetic evidence sets before enabling retrieval
  in broad production paths. Record performance findings under
  `docs/reports/performance/` if the phase changes production retrieval behavior
  in a performance-relevant way.
