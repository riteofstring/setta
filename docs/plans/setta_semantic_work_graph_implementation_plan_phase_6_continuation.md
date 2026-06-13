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
harness failures are visible as failed audits
live harness output passes the same 6C validator before any graph mutation
long-running workflows continue to use bounded windows and persisted cursors
```

Verification:

- Deterministic harness tests must remain the primary regression suite.
- Because Phase 6 touches chat/workflow/agent behavior and semantic graph
  mutation, run live Codex E2E tests when local ChatGPT auth is available. If
  unavailable, report the live-harness skip explicitly.

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
