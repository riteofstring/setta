# Semantic Cartographer Usefulness Plan

- **Date:** June 14, 2026
- **Status:** Phases 1-6 implemented; Phase 7 ready next
- **Scope:** Make semantic cartography produce useful, connected, inspectable work memory from real workflow runs.
- **Related docs:**
  - `docs/plans/setta_semantic_work_graph_plan.md`
  - `docs/plans/setta_semantic_work_graph_implementation_plan.md`
  - `docs/plans/setta_semantic_work_graph_implementation_plan_later_phases.md`

## Problem Statement

A recent real desktop workflow exposed a gap between the intended Semantic Work
Graph and the current automatic cartographer behavior.

Observed persisted state for one completed workflow run:

```text
workflow duration:              about 8 minutes
run items:                      202
completed command executions:   139
agent messages:                 19
cartographer runs:              209
cartographer patches applied:   5
semantic nodes created:         5
semantic edges created:         0
semantic activity intervals:    0
pending cartographer runs:      159
running cartographer runs:      1
```

The final workflow output contained concrete review findings, file references,
bugs, UX issues, and maintainability risks. The semantic graph mostly recorded
generic process notes such as "Static review without file edits" and "Repository
stack and workflow surface." It created no semantic relationships, no activity
overlay, and no visible source/workflow connections. Node details existed in a
technical sense, but the graph UI made them difficult to discover and the
evidence anchors were mostly summary-only references.

This is not primarily a prompt-tuning issue. The current system lets too many
low-signal observation windows enter the cartographer, lacks durable queue
leases/recovery, accepts low-value isolated nodes, does not require relationships
or visible source connections, and hides the detail path behind an implicit graph
gesture.

Several important capabilities already exist and should be reused rather than
recreated. Chat/workflow observations already carry typed source refs. Evidence
anchors are already typed and can carry rich URI/path/text/hash/workflow/chat/run
fields. The details pane already renders edges, evidence, activity, steering,
history, and cartographer provenance when that data exists. The observed run was
weak because useful data was not produced, connected, applied, or surfaced, not
because the whole schema is missing.

## Product Goal

The cartographer should turn agent work into public, inspectable work memory:

```text
What is this work about?
What did the agent discover?
Which decisions and constraints matter?
Which files, commands, tests, messages, and workflow nodes support each claim?
How do concepts, findings, decisions, questions, and constraints relate?
What is active now, and what changed over time?
Why did this semantic node appear?
```

A successful run should usually leave behind:

- A small set of specific semantic nodes, not a transcript-shaped pile.
- Source links from semantic nodes to workflow nodes, chat/run items, files,
  commands, tests, or diffs.
- Semantic edges between related nodes when the relationship is evidence-backed.
- Activity intervals showing what the agent was exploring, editing, debugging,
  validating, or blocked on.
- A discoverable details panel for each semantic node.
- A cartographer health/audit surface that explains pending, running, failed,
  no-op, superseded, and applied work.

## Design Principles

1. **Semantic memory is product state, not a transcript mirror.**
   The graph should represent stable public work facts, decisions, constraints,
   questions, and relationships. Raw events remain evidence, not graph shape.

2. **Typed observations before interpretation.**
   The cartographer input must use the typed chat, workflow, run item, command,
   file, diff, and test fields that already exist. It should not infer
   prompt/assistant roles or source meaning from human-readable summary
   substrings.

3. **Semantic epochs, not event crumbs.**
   Cartographer windows should align to meaningful work boundaries, not just
   size/quiet-period thresholds: prompt received, command cluster completed, file
   change recorded, test result observed, agent message completed, workflow node
   completed, workflow run completed. Assistant deltas are already aggregated;
   the missing step is promoting those aggregates into semantically meaningful
   epochs.

4. **No useful graph mutation without evidence and a relationship.**
   An automatically applied semantic update must have concrete evidence. New
   nodes should either attach to a visible source/evidence connection or connect
   to an existing semantic node. Isolated session nodes may exist briefly, but
   the final synthesis pass must connect, merge, dismiss, or justify them.

5. **The cartographer has a lifecycle, not just a queue.**
   Pending, running, failed, no-op, superseded, abandoned, and applied states
   need durable semantics. Restart and shutdown must not leave stale running
   work or hundreds of pending windows behind.

   Empty envelopes already become completed no-op work in the current code. The
   backlog problem is primarily unprocessed work plus stale running recovery, not
   no-op rows leaking as pending.

   Throughput should be fixed by stale-lease recovery and reduced epoch volume
   before increasing worker concurrency. Raising the concurrency cap can hide the
   stale-running symptom while leaving queue semantics broken.

6. **Quality gates beat volume.**
   Empty/no-op envelopes are valid, but they should be cheap and explicit. A
   high number of cartographer runs with few useful mutations is a failure mode,
   not evidence of activity.

7. **Details and provenance are first-class UI.**
   If a semantic node is visible, the user must have an obvious way to inspect
   label, summary, status, evidence, source links, edges, activity, history,
   confidence, and cartographer provenance.

8. **No chain-of-thought storage.**
   Store public summaries, structured observations, patch envelopes, evidence
   anchors, source links, confidence, model metadata, and review state. Do not
   store private reasoning.

9. **No backward compatibility or transitional paths.**
   This refactor should not add backward-compatibility shims, legacy support,
   migrations, transitional adapters, dual-read/write paths, old-field aliases,
   or silent compatibility fallbacks. If the semantic store shape changes during
   this pre-release work, fail loudly on incompatible state and require a fresh
   app-data/store reset.

10. **Use the existing Setta-owned model.**
   Keep SQLite event/projection truth, Go-owned contracts, generated TypeScript,
   the shared harness abstraction, and the current Pixi surface unless real
   usage later proves a heavier dependency is necessary.

## Current Implementation Status

Phase 1 has been implemented in commit `803dbda9d` (`Stabilize semantic
cartographer lifecycle`). The implementation uses cartographer run/window
records as the durable queue projection: queued/running state, source epoch id,
source key, priority, lease owner/deadline, attempt count, terminal statuses,
durable health, and regenerated backend contracts now live in the Go-owned
model.

This satisfies the lifecycle prerequisite for Phase 2:

- Expired running leases are recovered on startup and idle wait instead of
  depending on an in-memory slice.
- Workflow terminal events enqueue a high-priority `workflow_done` pass and
  supersede queued windows for the same run.
- Per-source queue caps supersede old queued windows before they create an
  unbounded backlog.
- Empty envelopes end as `completed_noop`; failures, rejections,
  cancellations, abandoned work, and supersessions are audit-visible terminal
  states.
- The processing state API reports durable queued/running counts, stale leases,
  no-op/failure/supersession counts, pending-review counts, last processed
  work, and concurrency guidance.

Verification during the Phase 1 review:

```text
./scripts/go.sh test -count=1 ./internal/semanticgraph
pnpm -C desktop build
node desktop/tests/electron/run-workflows.mjs --workflow semantic-graph
node desktop/tests/electron/run-workflows.mjs --workflow semantic-cartographer-auto
```

Phase 2 has been implemented in commit `4b1e566de` (`Implement semantic
cartographer phase 2`). Cartographer inputs now carry typed observation records
derived from chat/workflow/run item fields, prompt and assistant text are routed
by message role/status instead of summary substrings, run item observations
carry command/file/test metadata, and generated backend TypeScript contracts
include the new observation surfaces.

This satisfies the input-trust prerequisite for Phase 3:

- Prompt text containing the word "assistant" and assistant text containing the
  word "prompt" no longer cross-contaminate prompt/assistant aggregates.
- Command, file-change, diff, and test observations preserve typed run item
  refs and source metadata for later evidence/source-link validation.
- Observation records are persisted inside cartographer input bundles and
  counted in cartographer run audit metadata.
- Evidence ref checks can now reuse typed observations rather than relying only
  on direct run-level refs or display summaries.

Verification during the Phase 2 review:

```text
./scripts/go.sh test -count=1 ./internal/semanticgraph
pnpm -C desktop exec vitest run src/stores/chat-store-operations.test.ts src/workspace-layout/react-dom-surface-adapter.test.tsx src/features/workspace-graph/semantic-node-details-surface.test.tsx
pnpm -C desktop build
node desktop/tests/electron/run-workflows.mjs --workflow chat
node desktop/tests/electron/run-workflows.mjs --workflow semantic-cartographer-auto
```

Phase 3 has been implemented in commit `d7fa70885` (`Implement semantic
cartographer phase 3`). Automatic cartographer input now closes around semantic
epoch boundaries instead of assistant/output byte thresholds, noisy output stays
coalesced until a semantic boundary, workflow terminal events enqueue a
high-priority `workflow_done` final synthesis epoch, and that final epoch folds
queued, processed, and open earlier epochs from the same workflow/chat source.

This satisfies the epoch-shaping prerequisite for Phase 4:

- Command/file/diff/approval/workflow-node terminal events close semantic
  epochs; assistant text waits for terminal assistant message completion instead
  of threshold fragments.
- Low-value output fragments are summarized/coalesced inside the current epoch
  until a command or workflow boundary closes it.
- Workflow completion folds earlier queued, processed, and open epochs into the
  final synthesis input, including the final assistant message or still-open
  assistant aggregate.
- Final synthesis runs are high priority and supersede obsolete queued epochs
  for the same workflow/chat source.
- Patch source-ref validation can now accept refs from observations and
  trajectory events inside the folded epoch, not only the top-level bundle refs.

Verification during the Phase 3 review:

```text
./scripts/go.sh test -count=1 ./internal/semanticgraph
```

Phase 4 has been implemented in commit `3c3e1765e` (`Implement semantic
cartographer source links`). Semantic graph reads now expose evidence-backed
`sourceLinks`, cartographer-created evidence anchors are enriched from typed
source refs, renderer projection draws source/activity edges from matching
workflow graph nodes to semantic nodes, and automatic patch policy now leaves
review-required, low-confidence, and high-impact patches pending review instead
of auto-applying them.

This satisfies the connection/validation prerequisite for Phase 5:

- `SemanticGraph` includes source links backed by existing
  `SemanticEvidenceAnchor` rows, and generated backend contracts include the new
  graph field.
- Renderer graph projection draws semantic-to-semantic edges plus distinct
  source/activity edges when the evidence or activity resolves to an existing
  workflow graph node.
- Automatic node creation requires granular evidence from `chat_message`,
  `run_item`, `file_range`, `diff`, `test`, `workflow_node`, or a specific
  log/document source; run-level-only evidence is rejected for automatic nodes.
- Low-risk, evidence-backed `create_edge`, `start_activity`, and `end_activity`
  patches can auto-apply; broad, low-confidence, review-required, or
  high-impact patches stay pending review.
- Node details continue to show the evidence/activity/history data behind those
  source links.

Verification during the Phase 4 review:

```text
./scripts/go.sh test -count=1 ./internal/semanticgraph ./internal/httpapi
pnpm -C desktop exec vitest run src/renderer/src/features/workspace-graph/semantic-graph-projection.test.ts
pnpm -C desktop build
node desktop/tests/electron/run-workflows.mjs --workflow semantic-graph
node desktop/tests/electron/run-workflows.mjs --workflow semantic-cartographer-auto
```

Phase 5 has been implemented in commit `efa491a44` (`Implement semantic
cartographer phase 5`). The cartographer prompt and strict output schema now
prioritize concrete findings, decisions, constraints, open questions,
source-backed evidence, semantic relationships, and activity patches while
discouraging process-only nodes. The schema constrains supported patch, edge,
activity, and evidence kinds and documents generated safe ids for patch metadata
so observed event refs are not reused as storage ids.

This satisfies the prompt/contract prerequisite for Phase 6:

- Automatic nodes are instructed to be inspectable and connected by source links
  or semantic edges, with granular evidence from chat messages, run items, file
  ranges, diffs, tests, workflow nodes, logs, or documents.
- Final synthesis now emphasizes final answer/tool output, command/test
  results, file changes, failures, and existing semantic context.
- Review-required handling is explicit for broad, destructive, uncertain,
  low-confidence, split/merge, resolution, or high-impact changes.
- The scripted structured cartographer harness now returns evidence-backed
  finding and edge patches instead of isolated placeholder notes.
- Duplicate workflow completion synthesis after an already processed final pass
  is closed as superseded instead of enqueued again.
- Golden trace and Electron workflow coverage verify concrete findings,
  relationships, source links, accepted/rejected/pending/no-op paths, and the
  live Codex provider path.

Verification during the Phase 5 review:

```text
./scripts/go.sh test -count=1 ./internal/chat ./internal/semanticgraph
pnpm -C desktop build
node desktop/tests/electron/run-workflows.mjs --workflow semantic-graph
node desktop/tests/electron/run-workflows.mjs --workflow semantic-cartographer-auto
node desktop/tests/electron/chat-live-auth.mjs
node desktop/tests/electron/run-workflows.mjs --workflow live-codex-electron
```

Phase 6 has been implemented in commit `2dfe4c192` (`Implement semantic
cartographer details phase 6`). The workflow graph toolbar now treats semantic
selections as inspectable graph nodes, routes the visible Details command to the
semantic details pane, keeps double-click as a shortcut, adds a dedicated Source
Links details section, and exposes a manual-refresh cartographer health panel in
workflow graph debug mode.

This satisfies the UI/discoverability prerequisite for Phase 7:

- The toolbar Details command opens semantic node details when a semantic node is
  selected, instead of only supporting workflow-node details.
- Semantic details show source links alongside identity, status, provenance,
  evidence, edges, activity, history, context packs, cartographer patches, and
  review actions.
- The cartographer health panel exposes runtime, durable queue, stale lease,
  pending review, superseded, no-op, failure, last processed, last applied, and
  created-event state without adding polling.
- The semantic graph Electron workflow covers selecting a semantic node, opening
  details through the toolbar, viewing source links and cartographer provenance,
  accepting pending review from details, cartographer health refresh, reload
  persistence, and double-click details after reload.

Verification during the Phase 6 review:

```text
pnpm -C desktop exec vitest run src/renderer/src/features/workspace-graph/workflow-graph-toolbar.test.ts src/renderer/src/features/workspace-graph/semantic-node-details-surface.test.tsx
pnpm -C desktop build
node desktop/tests/electron/run-workflows.mjs --workflow semantic-graph
```

One lifecycle/policy note should be carried into the next phases:

- Renderer source/activity edges currently require a matching workflow graph
  node. Run-item, file, diff, test, chat-message, log, and document evidence is
  now preserved as source-link data and visible in details, but it still does
  not produce standalone visual source nodes when no workflow node is available.
  Treat standalone source-node UI as a dedicated renderer follow-up only if
  product diagnostics show graph-level file/test/chat nodes are needed; it is
  not a blocker for Phase 7.

Lease recovery is deadline-based: a crashed-but-unexpired lease is not
recoverable until its lease deadline. Treat lease duration/owner-staleness as
future lifecycle tuning only if deterministic traces show it still affects
throughput. Do not raise worker concurrency as a substitute for typed
observations, epoch volume reduction, or correct lease recovery.

## Target Architecture

### 1. Observation Ledger

Introduce a normalized typed observation layer between raw chat/workflow events
and cartographer LLM calls.

The ledger can initially be a projection over existing events rather than a new
canonical store. Existing observations already contain typed refs and run item
metadata; the point is to normalize and use those fields consistently instead of
routing by display summaries. Stable records should include:

```text
prompt_message
assistant_message_completed
assistant_text_chunk_aggregate
command_started
command_completed
command_failed
file_read_observed
file_change_observed
diff_observed
test_result_observed
workflow_node_started
workflow_node_completed
approval_requested
run_completed
```

Each observation should include typed source refs and evidence-ready fields:

```text
workspace_id
workflow_definition_id
workflow_execution_id
workflow_node_id
workflow_node_execution_id
chat_conversation_id
chat_run_id
chat_message_id
run_item_id
provider_item_id
file_path
range_start
range_end
command
exit_code
summary
text_excerpt
content_hash
occurred_at
```

Required refactor:

- Replace role/status detection in cartographer input construction with typed
  message role, message status, run item type, run item status, command fields,
  file paths, diff summaries, and test results.
- Treat human-readable summaries as display text only.
- Preserve enough source identity to build evidence anchors without inventing
  refs.

### 2. Semantic Epoch Builder

Replace the current threshold-window stream with semantic epochs.

Epoch examples:

```text
initial_prompt_epoch
agent_orientation_epoch
command_cluster_epoch
tool_output_epoch
assistant_finding_epoch
file_change_epoch
test_result_epoch
workflow_node_completion_epoch
workflow_run_completion_epoch
```

An epoch should be closed by deterministic boundaries:

- agent message completed
- command completed or failed
- file change recorded
- test result recorded
- approval requested
- workflow node terminal event
- workflow run terminal event
- bounded quiet period with enough accumulated content
- size limit reached

Epochs should consume the existing bounded text/output aggregates and group them
by work meaning. If the run is noisy, the builder should coalesce low-value
windows into a deterministic summary instead of queuing every threshold fragment.

### 3. Durable Cartographer Work Queue

Move automatic cartographer processing from mostly in-memory scheduling to a
durable queue/projection with leases.

Required states:

```text
queued
running
completed_noop
applied
pending_review
failed
superseded
cancelled
abandoned
```

Queue requirements:

- Every queued item has a source epoch id, priority, source key, lease owner,
  lease deadline, attempt count, and terminal status.
- Restart recovery marks expired `running` items as `queued` or `abandoned`
  according to whether the source epoch is still relevant.
- Workflow completion enqueues exactly one final synthesis pass and supersedes
  obsolete pending micro-windows for that same run.
- Per-run and per-source backlog caps prevent unbounded pending work.
- Empty/no-op processing remains terminal and visible as `completed_noop`.
- Idle waits include durable queued/running state, not just in-memory worker
  state.
- The renderer can show queue health: queued count, running count, stale leases,
  last applied patch, last failure, and superseded windows.
- Worker concurrency remains a tuning knob after correctness. The primary fix
  for the observed throughput collapse is recovering stale running leases and
  reducing queued work volume through epochs.

### 4. Two-Stage Cartography

Split cartography into deterministic preparation and LLM interpretation.

Stage A: deterministic preparation

- Build semantic epochs from typed observations.
- Extract source links and evidence anchors where the source is obvious:
  workflow node, run item, chat message, command, file path, diff summary, test
  result.
- Build candidate existing nodes using explicit source associations, current
  activity, steering directives, prior context packs, existing edges, and recent
  semantic history.
- Produce a bounded input bundle with typed sections, not a flattened transcript.

Stage B: LLM interpretation

- Propose semantic graph patches against the prepared input.
- Prefer updating/reusing existing nodes over creating duplicates.
- Create specific finding/decision/constraint/question nodes only when the
  source evidence states something concrete.
- Propose edges and activity when the relationship is supported by the same
  epoch or existing context.
- Use `reviewRequired` for broad, uncertain, destructive, merge/split, or
  low-confidence changes.

Stage C: deterministic validation and application

- Reject or require review for isolated low-value nodes.
- Reject automatic process-only nodes through deterministic source adequacy
  checks, not keyword heuristics. A new auto-applied node must cite a concrete
  granular evidence kind: `chat_message`, `run_item`, `file_range`, `diff`,
  `test`, or `workflow_node`. A node whose only evidence is run-level
  `workflow_execution`, `chat_run`, or `prompt` evidence is insufficient to
  auto-apply. `log` and `document` evidence counts only when it names a specific
  URI/path/content hash rather than a broad run summary. This should reuse the
  existing direct/observed source-ref validation path rather than adding a new
  source kind. A process choice may still become a decision node when the user or
  agent explicitly stated it and a granular source is cited.
- Require evidence for every automatic node creation/update.
- Require either a source link or semantic edge for every automatic node.
- Require edge endpoints to exist in current nodes or the same patch envelope.
- Require activity intervals to have an explicit source and terminal strategy.
- Record diagnostics for every rejected or downgraded patch.
- Apply accepted patches transactionally through the semantic event log.

### 5. Patch Contract And Application Policy Changes

The current patch operations and evidence anchors already include many useful
primitives. The contract and application policy should make source connections
explicit in the product behavior instead of treating evidence anchors as hidden
detail.

Clarify these concepts in contracts, projections, and UI:

```text
semantic_source_connection
  connects semantic entity to workflow/chat/run/file/test evidence
  may be backed by existing SemanticEvidenceAnchor records
  used for visual graph source connections and detail provenance

semantic_activity_interval
  connects active runtime work to semantic node over time

semantic_edge
  connects semantic node to semantic node
```

Source links should be visually distinct from semantic edges:

```text
workflow node/run item/file/test --source link--> semantic node
semantic node --semantic edge--> semantic node
agent activity --activity interval--> semantic node
```

The renderer can then show useful connections even when no semantic-to-semantic
edge exists yet.

Application policy must also be explicit. Evidence-backed `create_edge`,
`start_activity`, and `end_activity` patches are currently outside the low-risk
operation allowlist for non-forced auto-apply paths. If those operations remain
pending review, proposed connections will not appear in the graph. The refactor
must either auto-apply validated low-risk edge/activity patches in automatic
cartographer/final-synthesis paths, or surface pending-review connections
clearly enough that users can accept them.

### 6. Final Synthesis Pass

Every workflow run should receive one final synthesis pass after the workflow
and chat run reach a terminal state.

The final pass should:

- Read the run prompt, final assistant message, important command/test results,
  file changes, tool failures, existing semantic nodes from the run, evidence,
  source links, and prior cartographer diagnostics.
- Promote the most useful concrete final findings/decisions/questions.
- Add edges between related nodes.
- Merge or dismiss duplicate low-value session nodes.
- Attach evidence to final findings that were missed mid-run.
- End active activity intervals.
- Mark obsolete pending windows superseded.
- Leave the durable queue idle or explicitly failed.

This pass is allowed to create higher-level nodes than mid-run passes because it
has the whole run as context. It should still be evidence-backed and validated.

### 7. Context Compiler Feedback Loop

The context compiler should become part of the usefulness loop:

- At workflow/agent start, deliver relevant promoted constraints, decisions,
  and active steering.
- During active runs, deliver explicit steering deltas when the user focuses or
  attaches semantic nodes.
- After cartographer updates, record whether created nodes affected later
  context packs.
- In final synthesis, prefer findings and decisions that would be useful future
  context, not transient narration.

This keeps semantic nodes accountable: useful nodes either explain the run,
guide future work, or both.

## UI Requirements

### Semantic Selection And Details

- Single-click selects a semantic node.
- The toolbar details button must open semantic details when a semantic node is
  selected.
- Double-click can remain as a shortcut, but it must not be the only discoverable
  path.
- The details pane title should use the selected semantic label and show the node
  kind/status immediately.

### Node Details Content

The existing semantic details pane already renders much of the necessary data.
The work is to make it reachable and ensure generated evidence is rich enough to
be useful. Details should clearly show:

```text
label
kind
summary
scope
status
confidence
created/updated timestamps
why this exists
source links
incoming/outgoing semantic edges
current/recent activity
evidence excerpts
cartographer patches and diagnostics
event history
review actions when needed
```

Evidence rows should not be summary-only when a richer source exists. For file,
command, test, chat, and run item sources, details should expose the source
identity and a bounded excerpt or result summary.

### Visual Graph Connections

The graph should render three visually distinct connection types:

```text
workflow/control edges
semantic-to-semantic edges
source/activity links between runtime work and semantic nodes
```

If a semantic node has no semantic edge yet but has evidence/source links, it
should still appear connected to the work that produced it.

### Cartographer Health

Add a small cartographer health/debug surface, visible in dev and useful enough
for product diagnostics:

```text
queued windows
running windows
stale leases
last processed epoch
last applied patch
last no-op reason
last failure
created semantic events
pending review patches
superseded windows
```

This would have made the 159 pending / 1 running stale state obvious.

## Evaluation And Quality Gates

Create a corpus of deterministic cartographer evaluation traces:

1. The observed 8-minute static review workflow.
2. A code-edit workflow with file changes and tests.
3. A failing-test debugging workflow.
4. A user-steered workflow where semantic focus changes mid-run.
5. A workflow with approval wait and cancellation.
6. A long noisy command-output workflow.
7. A restart/reload recovery workflow with queued cartographer work.

For each trace, store the input run history in a temporary fixture format and
assert semantic outputs through production backend/store paths.

Minimum quality gates:

```text
time to first meaningful semantic update <= 30 seconds for active runs
final synthesis runs once for every terminal workflow run
durable cartographer queue is idle or terminal after final synthesis
no stale running cartographer runs after restart recovery
no pending micro-window backlog after workflow completion
every automatic node has evidence
every automatic node has at least one source link or semantic edge
final review trace creates semantic nodes for concrete findings, not only process notes
final review trace creates at least one semantic relationship or source link per node
semantic details open from selected semantic node through visible UI
semantic details show evidence/source provenance for created nodes
activity intervals start and end around active agent work when activity is inferred
```

Use deterministic E2E app workflow tests for renderer/main/preload/backend/store
paths when UI, IPC, event streaming, or run lifecycle behavior changes.

Live Codex E2E tests should cover the production cartographer path when local
ChatGPT auth is available. If unavailable, report the live-provider skip and do
not treat deterministic harness results as provider proof.

## Phased Implementation

### Phase 1: Stabilize Process Lifecycle (implemented)

Goal: stop creating stale pending/running cartographer work.

Deliverables:

- Durable queue/projection with leases and terminal statuses.
- Recovery for expired running items.
- Supersession of obsolete pending windows after workflow completion.
- Explicit `completed_noop` state.
- Concurrency guidance that treats worker count as a post-correctness tuning
  knob, not the solution to stale running work.
- Cartographer processing state API includes durable queue health.
- Focused tests for shutdown, recovery, idle wait, supersession, no-op, failure,
  and final workflow completion behavior.

Acceptance:

```text
no stale running runs after restart
no unbounded pending backlog after workflow completion
idle means durable queue is terminal
cartographer health explains what happened
```

### Phase 2: Replace Text Heuristics With Typed Observations (implemented)

Goal: make cartographer inputs trustworthy.

Deliverables:

- Typed observation records/projection from existing chat/workflow/run item
  fields.
- Role/status/run item extraction from structured fields.
- Bounded aggregation for assistant messages, commands, output, diffs, and tests.
- Removal of prompt/assistant classification by display-summary substrings.
- Focused tests using prompts and assistant output that contain misleading words
  such as "assistant" and "prompt."

Acceptance:

```text
prompt text and assistant text cannot contaminate each other through summaries
run item source refs survive into evidence anchors
command/file/test observations carry typed fields
```

### Phase 3: Epoch-Based Cartographer Input (implemented)

Goal: submit meaningful work windows rather than threshold-sized fragments.

Deliverables:

- Semantic epoch builder.
- Epoch closure rules.
- Coalescing and summary of low-value noisy windows.
- Per-run backlog cap and priority.
- Final synthesis epoch on workflow terminal event.

Acceptance:

```text
cartographer run count is proportional to semantic epochs, not event count
assistant aggregates are interpreted at semantic boundaries
final assistant message is included in final synthesis
```

### Phase 4: Source Links, Evidence, Activity, And Edge Validation (implemented)

Goal: make generated nodes connected and inspectable.

Deliverables:

- Renderer-visible source/evidence connection projection or adapter, backed by
  existing SemanticEvidenceAnchor data where possible.
- Renderer projection for source/activity links.
- Validation rule requiring evidence plus source link or semantic edge for
  automatically applied nodes.
- Validation rule requiring concrete typed source adequacy for automatic nodes,
  so isolated process notes backed only by run-level evidence
  (`workflow_execution`, `chat_run`, or `prompt`) do not auto-apply.
- Activity interval start/end support for active runtime work.
- Explicit auto-apply/review policy for validated low-risk edge and activity
  patches so proposed connections do not sit invisibly in pending review.

Acceptance:

```text
semantic nodes visibly connect to their producing workflow/run/file/test source
details show source links and evidence excerpts
automatically applied nodes are not isolated unless explicitly justified
```

### Phase 5: Patch Contract And Prompt Upgrade (implemented)

Goal: make the LLM cartographer optimize for useful graph state.

Deliverables:

- Updated or clarified patch schema for source connections and stricter evidence
  requirements.
- Prompt that prioritizes specific findings, decisions, constraints, questions,
  source links, and relationships.
- Prompt that discourages process-only nodes unless the process choice is itself
  a durable decision.
- Review-required handling for broad, destructive, low-confidence, split/merge,
  or uncertain changes.
- Automatic/final-synthesis application policy that allows validated low-risk
  `create_edge`, `start_activity`, and `end_activity` patches, or visibly routes
  them to user review.
- Golden trace tests for accepted, rejected, pending-review, and no-op patches.

Acceptance:

```text
the static review trace captures concrete final findings
the cartographer creates relationships/source links instead of only standalone nodes
low-confidence patches are not silently treated as high-value graph state
```

### Phase 6: UI Discoverability And Review (implemented)

Goal: make semantic nodes useful to users in the graph.

Deliverables:

- Toolbar details button works for semantic selections.
- Semantic details can open by visible command and double-click shortcut.
- Details pane clearly presents provenance, edges, source links, activity,
  history, patches, and diagnostics.
- Cartographer health surface.
- Electron workflow tests for selecting a semantic node, opening details,
  viewing evidence/source links, and reload persistence.

Acceptance:

```text
users can discover and inspect semantic details without knowing hidden gestures
semantic provenance is visible without querying SQLite manually
cartographer backlog/failure/no-op state is visible in dev diagnostics
```

### Phase 7: Context Loop And Usefulness Evaluation (ready next)

Goal: prove semantic nodes improve later work.

Deliverables:

- Context compiler records which semantic nodes are delivered after a run.
- Evaluation traces assert that promoted constraints/decisions appear in later
  agent context when relevant.
- User steering changes are delivered as explicit context deltas.
- Reports comparing before/after graph quality for the trace corpus.

Acceptance:

```text
useful semantic nodes are not just visual artifacts
future runs receive relevant constraints, decisions, and steering
context-pack history explains what was delivered and why
```

## Non-Goals

- Do not add a graph database as canonical truth.
- Do not add vector search as a prerequisite for the usefulness fix.
- Do not store private chain-of-thought.
- Do not create backward compatibility, legacy support, migrations,
  transitional code, dual-read/write paths, old-field aliases, or compatibility
  fallbacks.
- Do not keep increasing cartographer LLM volume as a substitute for better
  windowing, validation, source links, and final synthesis.

## Near-Term Triage Before The Refactor

These smaller fixes can reduce pain while the larger design is implemented:

1. Mark stale `running` cartographer runs and closed pending windows terminal or
   recoverable on backend startup.
2. Add a final synthesis pass for terminal workflow runs.
3. Stop letting threshold fragments become independent high-priority
   cartographer work; align queued work to semantic epochs.
4. Replace prompt/assistant substring checks with typed chat message role and
   event type checks.
5. Make the toolbar details button open semantic details for selected semantic
   nodes.
6. Make validated low-risk edge/activity patches either auto-apply in automatic
   cartographer/final-synthesis paths or appear clearly as pending-review
   connections.
7. Show cartographer processing counts in dev diagnostics.

These are tactical steps, not the final architecture. The long-term fix is the
epoch, source-link, durable-queue, validation, final-synthesis, and UI review
model described above.
