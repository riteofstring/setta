# Branch 2 Phase 2 Typed Liveness Plan

- **Date:** June 22, 2026
- **Source plan:** `docs/plans/branch2_essential_port_plan.md`
- **Phase 0 manifest:** `docs/plans/branch2_slice_manifest.md`
- **Phase 1 prerequisite:** `docs/plans/branch2_phase1_graph_surface_update_plan.md`
- **Status:** Ready for implementation planning review.
- **Scope:** Build the first typed workspace liveness boundary after the graph
  surface update work, split into backend/feed and renderer-marker slices.

## Goal

Make the workspace graph show what the agent is doing in real time using typed
runtime facts, without reintroducing branch 2 bloat.

The first complete demoable behavior should be:

- open a temporary workspace;
- start a deterministic scripted workflow run;
- show live typed workflow activity on the graph for commands, approvals,
  workflow status, and path/status-level file changes where already-typed
  metadata exists;
- keep pan/zoom smooth while activity arrives;
- make the finished run explainable from the graph and existing chat/workflow
  surfaces.

The UX impact is confidence and spatial awareness. The user should be able to
watch the graph and understand "the agent is running this command", "this file
changed", "approval is needed", or "this step finished" without reading every
chat token.

## Product Principle

Typed liveness is not semantic memory.

Live activity belongs in a deterministic runtime surface. Semantic nodes are
durable memory and should not be used as the fast path for showing that the
agent read, edited, tested, ran a command, or requested approval.

## Preconditions

Phase 1 must be committed and green before this starts:

- safe graph updates do not redraw unchanged edge graphics;
- unchanged edge labels are retained;
- camera panning survives safe workflow graph updates;
- graph update source/materialization counters are available;
- interaction cancellation is tested through pure decision logic and a
  production Electron path.

If any of those regress during Phase 2, stop and fix the graph surface before
adding more liveness features.

## Current Typed-Metadata Boundary

Phase 0 found:

- **Feasible now:** commands, approvals, generic tool calls, reasoning
  summaries, assistant output, workflow status, and run item provenance.
- **Partial now:** file writes, diffs, and test activity.
- **Blocked for full fidelity:** normalized file reads.

Hard rule: do not parse shell commands, arbitrary stdout/stderr, assistant
prose, or unstructured logs to infer file operations, test outcomes, or
semantic meaning. Use Go-owned contracts, typed provider/runtime metadata,
deterministic structured diffs, or explicit tool metadata only.

If a signal is missing typed metadata, display it honestly as unknown or leave
it out of this slice.

## Phase 2 Split

Phase 2 must land in two reviewable slices.

### Phase 2A - Backend Activity Contract And Feed

Implement the Go-owned activity contract and production snapshot/delta feed.
Prove it with Go and HTTP/event-stream tests plus a thin renderer/debug
consumer that records deltas in debug state. Do not render graph markers in
Phase 2A.

Phase 2A may only carry fields derivable from typed data that already exists on
this branch:

- command execution fields;
- approval request/status fields;
- workflow event/status fields;
- run/message/provider item provenance;
- file-change path/status fields where already typed.

Phase 2A must not add new chat/provider extraction fields, normalized
file-operation extraction, diff-stat extraction, file-read extraction, or
heuristic metadata. That work can be a later explicit contract slice.

### Phase 2B - Minimal Renderer Markers

After Phase 2A is committed and green, add the renderer store and minimal graph
markers for the activity records. Prove marker liveness with the deterministic
Electron workflow.

This is not a port of branch 2's full `internal/workspacetrajectory` stack. Use
branch 2 as design evidence only.

## Non-Goals

Do not implement:

- normalized file-read activity unless a typed contract exists first;
- new chat/provider source metadata fields in Phase 2A;
- diff stats, file ranges, hashes, or file-read fidelity in Phase 2A;
- semantic-memory promotion, semantic usefulness scoring, or cartographer UI;
- neon/cell/glow visual effects or a visual redesign;
- trajectory popover/details panels beyond minimal debug-readable labels;
- broad future update lanes;
- command-output parsing or assistant-text heuristics;
- migrations, compatibility shims, dual paths, old-field aliases, transitional
  adapters, or silent fallbacks.

Do not create a generic activity abstraction that hides typed differences
between commands, file changes, diffs, approvals, workflow events, chat run
items, and tool calls.

## Implementation Contract

### 1. Choose Transport Ownership

Before adding runtime code, decide how the activity feed is transported.

The branch already has semantic graph event-stream and forwarding plumbing with
revision/gap behavior. Phase 2 must either:

- reuse or mirror that existing event-stream shape and ownership; or
- explicitly justify a separate transport in the plan/implementation notes.

Do not invent a third runtime stream by accident. This decision must be made
before coding the activity contract because it determines snapshot, delta,
revision, and gap behavior.

### 2. Confirm The Exact Typed Sources

Before adding runtime code, write down the exact current typed sources that
will feed Phase 2A:

- command execution item fields;
- file-change path/status item fields;
- approval request/status fields;
- workflow event/status fields;
- run/message ids, provider item ids, timestamps, and status fields.

Record which signals are included, partial, or excluded. This should be a short
implementation note in the PR/commit or an appendix in this doc, not a broad
Phase 0 repeat.

Bright-line Phase 2A rule: activity records may only carry fields derivable
from existing typed run item, workflow, and approval data. If the work requires
new extraction in chat/provider protocol code, stop and split that into a later
contract slice.

### 3. Own Contracts In Go

Add the activity contract at the owning backend boundary.

Minimum contract shape:

- workspace id;
- run or workflow provenance;
- activity id;
- monotonically increasing revision;
- typed activity kind;
- status;
- timestamp or sequence;
- optional graph anchor;
- bounded payload;
- detail reference if more data is needed.

Endpoint request/response contracts must be owned by the `internal/httpapi`
endpoint registry. Regenerate generated TypeScript after editing Go-owned
contracts. Do not manually edit generated output.

### 4. Keep Payloads Bounded

Activity records should be small enough to stream and render frequently.

Allowed examples:

- command preview, cwd, exit code, duration, and status;
- file paths and patch status where already typed;
- approval kind/status and target label;
- workflow action id/status.

Avoid embedding large command output, full diffs, diff stats that require new
extraction, large assistant text blocks, or unbounded tool results in graph
activity records. Use detail references for larger data.

### 5. Stream Through Production Paths

The snapshot/delta feed must travel through real app paths:

- backend runtime/source;
- HTTP or event stream boundary;
- Electron main/preload bridge where applicable;
- renderer store;
- graph surface/runtime handle.

Do not add polling unless there is an explicit documented reason.

### 6. Add Activity-Layer Counters

Phase 1 graph counters are necessary but not sufficient. Activity deltas are a
new ingress and need their own measurability.

Add debug counters that answer:

- how many activity snapshots loaded;
- how many activity deltas applied;
- how many activity records are currently retained;
- how many markers were created, updated, retained, and removed;
- whether activity delta application touched graph scene replacement;
- whether activity delta application requested backend reads during camera
  movement;
- whether any revision gap or reload occurred.

Phase 2A should expose feed/store counters even before markers exist. Phase 2B
should add marker materialization counters.

### 7. Render Minimal Typed Markers

The first renderer surface should prioritize legibility over decoration.

Minimum expected behavior:

- command activity is visually distinct from path/status-level file-change
  activity and approval activity;
- the demo anchors activity to workflow nodes from a workflow run;
- unanchored activity uses a bounded recent-activity lane or count, not random
  placement, and is only a fallback;
- markers have stable dimensions and do not shift graph layout;
- markers can be counted and inspected from the debug snapshot.

Do not build the full branch 2 sprite system, details panel, passive badges,
popover model, or cartographer aggregation in this phase.

### 8. Preserve Phase 1 Invariants

Trajectory/activity delta application must not:

- replace the graph scene;
- recreate the Pixi app, renderer, or layers;
- request backend reads during camera movement;
- cancel camera pan/zoom;
- redraw unchanged edge graphics;
- rematerialize unchanged edge labels;
- rebuild unrelated graph content.

Use the Phase 1 counters and the new activity-layer counters as hard assertions
in tests.

## Suggested File Areas

Likely backend contract/feed owners:

- small Go-owned `internal/workspacetrajectory/` files for the activity
  contract, mapper, runtime/feed, and tests;
- `internal/httpapi/endpoints.go` and colocated endpoint handlers for
  registry-owned request/response contracts;
- generated backend contracts after regeneration.

Read-from sources for mapping, not Phase 2A extraction edit targets:

- `internal/chat/types.go`
- `internal/chat/codex_protocol.go`
- `internal/chat/codex_harness_notification_handlers.go`
- `internal/chat/codex_harness_approvals.go`
- `internal/orchestrator/types.go`
- `internal/orchestrator/runner_contract.go`

If Phase 2A requires editing chat/provider protocol extraction code to expose a
new source field, stop and split that into a later contract slice.

Likely frontend owners:

- `desktop/src/generated/backend.ts`
- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-surface.tsx`
- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-runtime-registry.ts`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer.js`
- new focused trajectory/activity store and renderer helper files under
  `desktop/src/renderer/src/features/workspace-graph/`.

Likely tests:

- Go tests for typed mapping into activity records;
- HTTP or event-stream tests for snapshot/delta behavior;
- debug-snapshot coverage for Phase 2A feed/store counters;
- renderer/store tests for bounded delta application;
- deterministic Electron workflow using temporary app data and scripted
  provider/workflow events.

This list is not permission to touch every file. Prefer the smallest owner set
that proves the first slice.

## Verification

Start narrow:

- Go unit tests for mapping typed command, path/status-level file-change,
  approval, and workflow facts into activity records;
- endpoint or event-stream tests for snapshot, delta ordering, revision gaps,
  and workspace filtering;
- renderer store tests for append/update/remove behavior and bounded record
  counts;
- Pixi/helper tests for marker retention and bounded materialization.

Phase 2A production path:

- deterministic Electron workflow with temporary app data;
- start a scripted workflow run that emits typed command, approval, workflow
  status, and path/status-level file-change facts;
- assert snapshot/delta records arrive through production app paths;
- assert activity feed/store debug counters advance;
- assert no graph markers are created in Phase 2A;
- assert no file-read or diff-stat activity appears.

Phase 2B production path:

- deterministic Electron workflow with temporary app data;
- open a workspace and workflow graph;
- start a scripted workflow run that emits typed command, approval, workflow
  status, and path/status-level file-change activity;
- pan or zoom while activity deltas arrive;
- assert camera movement continues;
- assert graph update/materialization counters stay within Phase 1 limits;
- assert activity-layer counters show bounded delta and marker work;
- assert activity markers appear, update, and complete from typed metadata;
- assert no file-read marker or diff-stat marker appears unless explicit typed
  metadata exists.

If chat behavior, Codex harness behavior, provider protocol handling, approvals,
event streaming, IPC/preload contracts, generated backend contracts, renderer
chat state, or transcript UI are touched, the deterministic end-to-end app
workflow is required. Scripted harness events must use the same typed shapes as
the real provider path. If live Codex E2E is relevant and ChatGPT auth is not
available locally, record the skip and do not treat it as proof of provider
integration.

Because this is performance-relevant UI work, record before/after evidence as
an append-only report under `docs/reports/performance/`.

Final checks before committing executable changes:

- focused Go and renderer tests for changed behavior;
- relevant deterministic Electron workflow;
- `./scripts/format.sh`;
- `./check_quality.sh --all`;
- `./scripts/check_supply_chain.sh` only if dependency, package, module, or
  supply-chain files changed.

## Definition Of Done

Phase 2 is done when:

- Phase 2A is committed and green before Phase 2B begins;
- a Go-owned typed activity contract exists without adding new source
  extraction fields;
- generated TypeScript is regenerated from Go-owned contracts;
- a snapshot/delta feed exposes bounded typed activity;
- transport ownership is documented and uses or explicitly justifies divergence
  from existing event-stream plumbing;
- activity feed/store counters exist;
- the renderer applies activity deltas without replacing graph content;
- Phase 2B marker counters exist;
- the graph shows minimal typed markers for at least command, approval, and
  workflow-status activity, plus path/status-level file-change activity where
  current typed metadata exists;
- missing file-read fidelity is honestly absent or marked blocked, not
  inferred;
- pan/zoom remains smooth while activity arrives;
- production Electron coverage proves the live behavior through real app paths;
- append-only performance evidence is recorded;
- no semantic-memory, visual-redesign, broad branch 2 sprite system, or
  compatibility layer has been added.

## Handoff Prompt

Use this for an implementation agent:

```text
Implement docs/plans/branch2_phase2_typed_liveness_plan.md.

Keep the slice narrow:
- choose transport ownership first;
- split implementation into Phase 2A backend/feed and Phase 2B renderer markers;
- confirm exact typed sources before adding runtime code;
- add a Go-owned bounded activity contract using only existing typed source
  fields in Phase 2A;
- expose snapshot/delta activity through production paths;
- add activity-layer debug counters;
- render minimal typed graph markers for workflow-run commands, approvals,
  workflow status, and path/status-level file changes in Phase 2B;
- preserve Phase 1 pan/zoom and graph-materialization invariants.

Do not parse shell output, assistant prose, or arbitrary logs to infer missing
file/read/test semantics. Do not add semantic-memory usefulness, visual
redesign, branch 2 sprite-system parity, new Phase 2A chat/provider extraction
fields, migrations, compatibility paths, or future lanes.

Run focused checks first, then the relevant Electron workflow, then
./scripts/format.sh and ./check_quality.sh --all before committing code.
```
