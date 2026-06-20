# Workspace Trajectory Liveness and Semantic Memory Plan
- **Date:** June 18, 2026
- **Status:** Phase 5 complete; Phase 6 ready to implement
- **Scope:** Replace the current semantic-node-centered liveness model with a
  principled split between deterministic workflow trajectory visuals, durable
  semantic memory, cartographer audit, and graph interaction/runtime
  infrastructure.
- **Supersedes:** earlier semantic work graph, semantic cartographer
  usefulness, cartographer settings/audit, workspace graph semantic liveness,
  living workspace visual redesign, and semantic runtime interaction plans.
## Position
The recent semantic graph work improved important infrastructure, but it did not
solve the product problem.

The system now has better cartographer queue state, typed observations, audit
metadata, runtime deltas, renderer backpressure, and semantic node details.
Those are useful foundations. They are not, by themselves, a good explanation
of what the agent is doing during a workflow.

The current graph still conflates four different concepts:

- Workflow execution state.
- Raw trajectory activity, such as file reads, file edits, commands, tool
  calls, reasoning summaries, approvals, and assistant output.
- Durable semantic memory, such as evidence-backed findings, decisions,
  constraints, open questions, and relationships.
- Cartographer lifecycle/audit state, such as queued, running, no-op,
  superseded, failed, applied, and pending review.

The result is predictable:

- The graph feels static until a semantic or cartographer object appears.
- When a semantic object appears, it receives visual treatment that is too
  important and too cryptic.
- The animations communicate "something is active" but not what happened or why
  it matters.
- File reads, file edits, and reasoning summaries remain trapped in the
  transcript even though they are the highest-frequency, highest-legibility
  work signals.
- Pan/zoom and layout persistence regressions are experienced as graph product
  failures, even when some deterministic synthetic gates pass.

The long-term fix is not another prompt-tuning pass and not another particle
animation pass. Setta needs a first-class **workspace trajectory runtime** that
is deterministic, typed, low-latency, bounded, and independent from the semantic
cartographer model. The cartographer should create durable claims. It should
not be responsible for making the graph feel alive.
## Diagnosis
### What The Earlier Plans Built
The earlier plans did meaningful engineering work:

- Cartographer settings, model/reasoning audit, queue lifecycle, lease recovery,
  and run timing are now more explicit.
- Cartographer inputs preserve typed observations and semantic epochs instead
  of relying only on display summaries.
- Automatic patch validation rejects more low-value or unconnected semantic
  mutations.
- The renderer has a semantic runtime snapshot/delta path instead of repeated
  full working-set reads for normal cartographer event flow.
- The graph renderer has camera coalescing, visible object pooling, runtime
  backpressure, and acceptance gates.
- Semantic details can explain evidence, source links, related nodes, and patch
  provenance when the data exists.

That work made the system more observable and less wrong. It did not produce a
clear product language for live agent work.
### Current Product Failures
The active user-visible issues are:

- Semantic nodes still do not feel useful.
- Pan/zoom performance is still poor in real use.
- Semantic decorative animations stop while panning or zooming.
- The graph background changes as soon as a semantic node appears.
- Manually moved semantic node positions can reset after a refresh or async
  persistence race.
- The semantic-cell orbiting/nucleus/organelle animations have no readable
  meaning.
- Semantic nodes and ephemeral visual activity appear too late.

These are not independent bugs. They come from an unclear model of what should
be represented in the graph, how fast it should appear, and which subsystem owns
the truth.
### Architectural Mismatch
The semantic cartographer is an interpretation system. It is allowed to be
slow, selective, uncertain, and review-gated. That makes it a bad source for
basic liveness.

File reads, file edits, tool calls, command results, reasoning summaries, and
approvals are already typed workflow trajectory facts. They should appear
without waiting for:

- a cartographer epoch to close,
- a cartographer run to leave the queue,
- a model response,
- patch validation,
- durable semantic mutation,
- or semantic graph projection refresh.

Likewise, durable semantic nodes should not be asked to represent everything
that happened. A semantic node should be a claim, decision, constraint, question,
finding, or reusable concept. "Read file X" and "edited Y by +12/-3" are usually
trajectory facts, not semantic memory.
## Product Model
The workspace graph should have four explicit layers.
### 1. Workflow Graph
The workflow graph is the durable execution structure:

- workflow nodes,
- workflow edges,
- workflow execution status,
- active node and edge state,
- approvals and routing state,
- draft layout.

This layer owns the user's primary mental model: "Where is the workflow now?"
### 2. Trajectory Runtime
The trajectory runtime is fast, deterministic, and short-lived. It renders
typed facts from the live run:

- file read observed,
- file edit/change observed,
- diff observed,
- command started/completed/failed,
- test result observed,
- tool call started/completed/failed,
- reasoning summary updated,
- plan updated,
- assistant message chunk/completion,
- approval requested/resolved,
- workflow node started/completed.

Trajectory visuals should usually be ephemeral sprites, badges, rails, or
compact timeline items anchored to workflow nodes. They are not semantic graph
nodes by default.
### 3. Semantic Memory
Semantic memory is durable, evidence-backed, and future-oriented:

- findings,
- decisions,
- constraints,
- open questions,
- risks,
- domain concepts,
- reusable codebase facts,
- relationships between those facts.

Semantic nodes should be fewer than trajectory items. They should be worth
inspecting later or worth feeding back into future context packs.
### 4. Cartographer Workbench And Audit
Cartographer lifecycle state explains the semantic memory pipeline:

- observing,
- window open,
- queued,
- running,
- proposing,
- applying,
- pending review,
- no-op,
- rejected,
- failed,
- superseded,
- applied.

This is operational state. It belongs in details, health panels, and compact
workflow-node status indicators. It should not dominate the default graph view.
## Principles
1. **Fast liveness is deterministic.**
   The graph should show file reads, edits, commands, tool calls, reasoning
   summaries, and approvals from typed runtime events without a cartographer
   model response.

2. **Model output creates claims, not activity.**
   The semantic cartographer should create or update durable semantic memory. It
   should not be the critical path for showing that the agent read a file,
   edited code, ran a command, or produced a reasoning summary.

3. **Semantic nodes are durable memory, not transcript decorations.**
   A semantic node must either help explain the work, guide future work, or
   preserve a decision/finding/constraint/question that remains useful outside
   the moment it appeared.

4. **Every graph visual needs a readable meaning.**
   No orbiting particles, mystery beads, unlabeled source nodes, or decorative
   animations in the default view. A compact visual can use icons or badges, but
   hover, selection, or nearby text must make the meaning explicit.

5. **Trajectory facts are source refs, not semantic claims.**
   File reads and edits should become structured source references and
   trajectory sprites first. They may later become evidence for semantic claims.

6. **Typed data beats command parsing.**
   Use provider/runtime metadata, run item fields, tool arguments, structured
   result payloads, diff stats, and explicit protocol fields. Do not infer file
   reads or line ranges by brittle shell-command heuristics without an explicit
   product decision.

7. **User layout is local-first.**
   A user-dragged node position should survive graph refreshes immediately. A
   backend persistence request may fail loudly, but a stale graph refresh should
   not silently snap the node back.

8. **The background is stable.**
   A semantic node appearing should not change the whole graph foundation style.
   Background/foundation state should be controlled by user appearance settings
   and workflow execution state, not by the presence of semantic nodes.

9. **Camera interaction remains first priority.**
   Pan/zoom must not trigger backend reads, graph reconstruction, React churn,
   or expensive animation recompute. Essential workflow and trajectory feedback
   should continue during movement; only expensive decorative fidelity should be
   deferred.

10. **Hot paths have explicit budgets.**
    Runtime snapshots, deltas, sprite counts, retained display objects, label
    work, and animation work need hard or report-backed budgets.

11. **No polling, heuristic fallbacks, generated-output edits, backward
    compatibility, legacy support, migrations, or transitional code.**
    Use push streams, typed contracts, generated TypeScript, and explicit store
    resets when schema changes are intentionally incompatible. Do not add old
    field aliases, dual-read/write paths, compatibility adapters, transitional
    readers, legacy renderer modes, silent fallback behavior, or migrations.
## Compatibility Policy
This work should not preserve old semantic, runtime, trajectory, or renderer
behavior for compatibility.

Do not add:

- backward-compatibility shims,
- legacy support paths,
- SQLite or file-store migrations,
- old-field aliases,
- transitional readers or writers,
- dual-read/write paths,
- compatibility adapters,
- legacy renderer modes,
- silent compatibility fallbacks,
- or feature flags whose only purpose is to preserve the old behavior during the
  refactor.

If a persistent schema, generated contract, runtime protocol, or renderer state
shape changes incompatibly, bump the relevant version and fail loudly with reset
guidance. Existing local pre-release semantic/runtime state may be reset. Tests
should assert rejection of incompatible state instead of asserting migration.
## Target Architecture
### Workspace Trajectory Runtime
Add a Go-owned workspace trajectory runtime projection that is separate from
`SemanticGraph` and narrower than the cartographer audit surface.

The long-term owner should not be the semantic cartographer itself. The
cartographer can consume the trajectory runtime, but the trajectory runtime is
owned by workflow/chat execution facts. A future package name can be decided
during implementation, but the ownership boundary should be explicit:

- `internal/orchestrator` owns workflow execution events.
- `internal/chat` owns chat runs, run items, run item outputs, reasoning, plan,
  command, tool, file-change, diff, and approval records.
- `internal/semanticgraph` owns durable semantic memory and cartographer
  interpretation.
- A workspace graph/runtime projection service composes those sources for the
  renderer.

Candidate contract:

```text
WorkspaceTrajectoryRuntimeSnapshot
  workspaceId
  workflowExecutionId
  chatRunId
  revision
  generatedAt
  limits
  activeWorkflowNodeIds
  activeRunItemIds
  sprites
  timeline
  aggregateByWorkflowNode
  removals
  payloadBudget

WorkspaceTrajectoryRuntimeDelta
  workspaceId
  fromRevision
  toRevision
  generatedAt
  changedAreas
  spriteUpdates
  timelineUpdates
  aggregateUpdates
  removals
  payloadBudget
```

Candidate sprite contract:

```text
WorkspaceTrajectorySprite
  id
  kind
  status
  severity
  workspaceId
  workflowExecutionId
  workflowNodeId
  workflowNodeExecutionId
  chatConversationId
  chatRunId
  chatMessageId
  runItemId
  providerItemId
  title
  subtitle
  sourceRefs
  fileRefs
  command
  tool
  diffStats
  resultSummary
  errorSummary
  createdAt
  updatedAt
  expiresAt
  ttlMs

WorkspaceTrajectoryFileRef
  path
  displayPath
  operation       -- read | write | create | delete | rename | diff | unknown
  rangeStart
  rangeEnd
  additions
  deletions
  changedFiles
  contentHash
```

Supported sprite kinds should start small and typed:

```text
file_read
file_write
diff
command
test
tool_call
reasoning_summary
plan_update
assistant_message
approval
cartographer_status
workflow_status
```

`cartographer_status` can remain available as a compact operational sprite, but
it should be lower priority than raw workflow trajectory facts.
### Source Data Requirements
Use existing typed data first:

- `chat.RunItem.Type`
- `chat.RunItem.Status`
- `chat.RunItem.FilePaths`
- `chat.RunItem.PatchStatus`
- `chat.RunItem.DiffSummary`
- `chat.RunItem.Command`
- `chat.RunItem.Cwd`
- `chat.RunItem.ExitCode`
- `chat.RunItem.DurationMs`
- `chat.RunItem.ServerName`
- `chat.RunItem.ToolName`
- `chat.RunItem.Progress`
- `chat.RunItem.Result`
- `chat.RunItem.Error`
- `chat.RunItem.Details`
- `chat.RunItem.HiddenText` only for non-public/private reasoning storage, never
  for graph display.
- workflow node execution ids and runner refs.
- provider protocol file-change and diff notifications.

For line ranges and edit counts:

- Use explicit tool arguments or provider metadata when available.
- Use structured diff metadata when available.
- If only a textual diff summary is available, display the summary as provider
  text instead of re-parsing it into counts.
- Do not parse shell commands such as `sed -n '1,120p' file` or `rg` output as
  semantic truth unless a later phase deliberately introduces a narrow,
  documented parser.
### Renderer Sprite Layer
Trajectory sprites should be rendered in a dedicated layer, not as semantic
nodes.

Default placement:

- Anchor active sprites to their workflow node.
- Group multiple sprites into a small vertical or radial rail near the workflow
  node.
- Use icon plus short label when legible.
- Collapse older or crowded sprites into counts.
- Show full file path, line range, run item, command, and status in workflow-node
  details or a hover affordance.

Examples:

```text
read semantic-graph-projection.ts:218-262
edit pixi-renderer-foundation.js +4 -2
diff 3 files +48 -11
cmd pnpm test failed 1
reasoning summary updated
tool list_api_endpoints completed
approval file change requested
```

Sprite lifecycle:

- A running sprite appears immediately.
- A completed sprite remains visible for a short TTL.
- Failed or approval-needed sprites remain longer and are selectable.
- A sprite can be promoted into the selected workflow-node details timeline.
- A sprite is never promoted into a durable semantic node by the renderer.
### Semantic Memory Pipeline
The semantic cartographer should consume the same trajectory facts as evidence,
but produce only durable memory.

Semantic node creation should be biased toward:

- concrete findings,
- decisions,
- constraints,
- open questions,
- reusable codebase facts,
- discovered risks,
- high-value relationships.

Semantic node creation should be biased against:

- process narration,
- "read file" notes,
- "ran command" notes,
- generic review/session summaries,
- isolated nodes with no source link or semantic edge,
- duplicate facts that do not improve future context.

Recommended durable node contract additions, if current fields are insufficient:

```text
SemanticNodeUsefulness
  whyItExists
  futureUse
  sourceCoverage
  retrievalUseCount
  lastDeliveredInContextPackAt
  lastUserOpenedAt
  lastUserPromotedAt
  dismissalReason
```

These fields should be public summaries and counters only. Do not store private
reasoning.
### Cartographer Role After This Refactor
The cartographer should become a semantic memory compiler:

- Read bounded trajectory facts.
- Read relevant prior semantic memory.
- Propose durable semantic memory mutations.
- Attach evidence to trajectory source refs.
- Explain why the claim should exist.
- Leave uncertain or high-impact mutations pending review.

It should not be responsible for:

- making file reads appear,
- making file edits appear,
- showing command/test progress,
- showing reasoning-summary progress,
- keeping the workflow graph alive,
- or driving core graph animation.
### Interaction And Layout Architecture
Pan/zoom should operate against a local renderer scene store:

- camera transform,
- visible materialized objects,
- sprite display objects,
- labels,
- hover/selection state,
- settled fidelity state.

Camera input should not:

- request backend reads,
- rebuild semantic graph arrays,
- replace React state,
- recompute full active sets,
- redraw settled glow for offscreen objects,
- or pause essential workflow/sprite feedback.

Movement-mode behavior should be explicit:

- Keep workflow active edge motion.
- Keep active workflow node status visible.
- Keep trajectory sprite fade/progress indicators cheap but active.
- Defer expensive decorative semantic fidelity.
- Avoid hiding labels on small graphs where label count is already bounded.

User layout should be local-first:

- Dragged semantic and workflow positions are applied immediately to a local
  layout overlay.
- Backend persistence is queued with a revision or save sequence.
- Incoming graph refreshes merge with pending local layout instead of replacing
  it.
- If persistence fails, show a specific error and keep enough local state for
  the user to retry or intentionally discard.

Background/foundation should be stable:

- Do not switch graph foundation style based on `node.layer === "semantic"`.
- Use a user appearance setting or workflow execution mode.
- If semantic density eventually needs visual treatment, use local node/edge
  styling, not a whole-canvas background jump.
## Visual Grammar
Default priority order:

1. Active workflow node and active workflow edge.
2. Blocking approval/failure state.
3. Recent deterministic trajectory sprites.
4. Committed semantic nodes and relationships.
5. Proposed semantic patch previews.
6. Cartographer lifecycle/audit indicators.
7. Decorative motion, only if it has a defined meaning and passes budgets.

Default view rules:

- No unlabeled particles.
- No standalone source beads unless selected, hovered, zoomed enough, or
  explicitly shown in details mode.
- No whole-background mode switch when semantic memory appears.
- No biological or abstract motion unless it maps to a named status.
- Status should be conveyed by icon, label, color, and details, not by color or
  motion alone.

Semantic node animation should be redesigned:

- Replace orbiting/nucleus/organelle animation with explicit status rings,
  badges, or brief pulses.
- Map each visual state to a concrete meaning:
  - recently updated,
  - evidence attached,
  - edge created,
  - selected,
  - hovered,
  - pending review,
  - failed update.
- Keep durable settled nodes mostly still.
## Phased Plan
### Phase 0 - Evidence And Current-State Audit
Status: complete. Commit `98844d3c4` added
`docs/reports/performance/workspace-trajectory-liveness-semantic-memory-phase-0.md`.

Capture the current state before changing behavior.

Record and report:

- A real or production-like code review workflow where the graph feels static.
- Time from first run item to first visible trajectory/cartographer/semantic
  visual.
- Time from file-change notification to visible graph indication.
- Time from reasoning-summary update to visible graph indication.
- Pan/zoom event-to-camera and event-to-frame measurements in the same workflow.
- Whether active workflow edge/node animations continue during camera movement.
- Semantic background/foundation changes when the first semantic node appears.
- Node drag persistence behavior under semantic runtime refreshes.
- Number and type of semantic nodes created, rejected, no-oped, or pending
  review.
- How many created semantic nodes later appear in context packs.

Add an append-only report under `docs/reports/performance/` or
`docs/reports/semantic-cartographer/`.

This phase should also inventory provider/run-item metadata for:

- file reads,
- line ranges,
- file writes,
- structured diff stats,
- tool call arguments,
- MCP filesystem calls,
- dynamic tool calls,
- reasoning summaries,
- plan updates.

The output should explicitly say which desired sprite labels can be typed today
and which require provider/protocol additions.

Phase 0 implementation review:

- The existing semantic-live workflow and small-trackpad graph recording passed
  through production Electron/main/preload/renderer/backend paths with
  temporary app data.
- The report confirms there is no first-class trajectory sprite layer today;
  current live graph indications are semantic/cartographer runtime signals.
- The first semantic node still changes the canvas foundation because
  `foundationStyleForGraph` selects the generic semantic foundation whenever
  any node has `layer === "semantic"`.
- Semantic layout persistence remains race-prone because the inspected path
  applies semantic positions after the backend save resolves, without a
  local-first pending layout overlay that survives semantic graph refreshes.
- The report could not prove reasoning-summary liveness, active workflow
  animation continuity during pan/zoom in the same workflow, or semantic drag
  persistence under runtime refresh. Those gaps should become targeted tests
  when the affected behavior is implemented.
- Typed run-item metadata is good enough for command, tool-call, reasoning
  summary, plan update, approval, assistant message, and partial file
  write/diff labels. Exact file-read ranges and structured diff `+/-` counts
  require provider/protocol or contract additions.

Phase 1 handoff:

- Phase 1 is ready to implement.
- Keep Phase 1 scoped to immediate graph UX corrections. Do not add the
  workspace trajectory runtime, new backend contracts, or first-class sprite
  layer in Phase 1.
- The missing trajectory sprite layer is the Phase 2/3 problem. Phase 1 should
  remove current graph regressions so the later trajectory runtime has a stable
  visual and interaction foundation.
### Phase 1 - Immediate Graph UX Corrections
Status: complete. Commit `06e120e06` implemented the Phase 1 renderer UX
corrections.

Fix regressions that do not require the full trajectory runtime.

Implementation:

- Stop switching canvas foundation/background merely because a semantic node is
  present.
- Make semantic node position persistence local-first so stale graph refreshes
  cannot reset user-dragged positions.
- Remove or disable orbiting semantic-cell animations in the default view.
- Replace semantic-cell activity with simple named badges or status rings.
- Ensure essential workflow animation continues during camera movement.
- Keep movement-mode deferral only for expensive non-essential visual fidelity.

Acceptance:

- Adding the first semantic node does not change the background.
- Dragging a semantic node and receiving semantic runtime events does not snap
  it back.
- A user can identify the active workflow node while panning.
- Default semantic visuals contain no unexplained orbiting particles.
- Focused renderer tests cover foundation selection, layout overlay merging,
  and movement-mode animation behavior.

Phase 1 implementation review:

- `foundationStyleForGraph` now ignores semantic-node presence and chooses the
  canvas foundation from workflow execution state.
- Semantic layout now has a local pending overlay that is merged ahead of stale
  backend layout positions while persistence is in flight.
- Default semantic-cell particle animation is disabled; active semantic state is
  represented by the existing activity/status marker path instead of orbiting
  beads, drifting nuclei, or organelles.
- Workflow node glow and active workflow edge flow continue while camera motion
  is marked `moving`; expensive semantic decoration remains deferred.
- Small visible graphs keep labels synchronized while panning, while larger
  graphs can still hide labels during movement to protect camera interaction.
- Focused renderer coverage was added for foundation selection, local semantic
  layout overlay merging, stationary semantic-cell animation, semantic activity
  marker rendering, and movement-mode animation behavior.

Phase 2 handoff:

- Phase 2 is ready to implement.
- Keep Phase 2 scoped to Go-owned trajectory runtime contracts, generated
  TypeScript, endpoint ownership, backend projection/revision behavior, and
  mapping tests. Do not build the renderer sprite layer in Phase 2.
- Start with typed sources confirmed by Phase 0: command execution, tool calls,
  reasoning summaries, plan updates, file changes with paths/status, diff
  summaries, approvals, assistant messages, workflow status, and compact
  cartographer status.
- Include `file_read` and structured file/diff stat fields in the contract only
  as optional typed fields. Leave them empty until provider/protocol data exists;
  do not infer file reads, line ranges, or `+/-` counts from command text or
  display output.
- Add deterministic snapshot/delta gap behavior and payload-budget tests before
  starting Phase 3 rendering.
### Phase 2 - Workspace Trajectory Runtime Contracts
Status: complete. Commit `a047823d4` added the backend-owned typed trajectory
runtime projection.

Implementation:

- Define Go-owned snapshot/delta contracts.
- Generate TypeScript from Go-owned contracts.
- Use existing HTTP endpoint registry ownership for endpoints.
- Subscribe to or compose from chat run items, run item outputs, workflow
  events, and semantic/cartographer status where needed.
- Expose compact hot-path sprite data separately from detail data.
- Include revision semantics, removals, TTL, limits, and payload budgets.
- Do not add polling.
- Do not duplicate the entire transcript, run item output, or cartographer
  audit in the hot path.

Initial supported sprite kinds:

- `command`
- `tool_call`
- `reasoning_summary`
- `plan_update`
- `file_write`
- `diff`
- `approval`
- `workflow_status`
- `cartographer_status`

`file_read` should be supported only when typed tool/provider metadata identifies
a file path and optional range. If the initial inventory shows the data is not
available, keep the contract field but do not synthesize fake read sprites.

Acceptance:

- A run item update can produce a trajectory sprite delta without waiting for a
  cartographer run.
- Sprite payloads are bounded and budgeted.
- Snapshot reload and delta gap behavior are deterministic.
- Generated TypeScript changes are produced from Go contracts.
- Unit coverage proves typed file-change/diff/command/reasoning inputs map to
  sprite records.

Phase 2 implementation review:

- `internal/workspacetrajectory` now owns Go snapshot, delta, runtime event,
  sprite, timeline, aggregate, limit, payload-budget, and detail-ref contracts.
- The runtime service composes chat activity, workflow execution state, and
  semantic/cartographer runtime status without waiting for cartographer output
  before emitting run item activity.
- HTTP endpoint ownership lives in `internal/httpapi` through
  `/workspace-trajectory/runtime/snapshot` and
  `/workspace-trajectory/runtime/events`.
- Generated TypeScript was produced from the Go-owned contract surface.
- Runtime snapshots and deltas are bounded, revisioned, sorted, and explicit
  about `snapshotRequired` gaps.
- Focused coverage verifies typed run-item mapping, absence of command-text
  file-read synthesis, payload limits, deterministic gap behavior, and contract
  consumption by the generated frontend types.
- Focused post-review checks passed:
  `./scripts/go.sh test -count=1 ./internal/workspacetrajectory ./internal/httpapi ./internal/runtime`
  and `pnpm -C desktop typecheck`.

Phase 3 handoff:

- Phase 3 is ready to implement.
- Keep Phase 3 scoped to main/preload/renderer transport, a local trajectory
  runtime store, stream reconnect behavior, Pixi sprite rendering, and workflow
  node details. Do not broaden it into semantic-memory usefulness or file-read
  fidelity work.
- Bootstrap from a runtime snapshot before rendering deltas, or buffer stream
  events until the initial snapshot has been applied.
- Treat `snapshotRequired` as a single-flight snapshot reload for the affected
  workspace/runtime projection.
- Maintain a deterministic local anchor index from the runtime snapshot and the
  current workflow graph runner refs. Live chat run-item deltas can arrive
  without workflow node ids because they are mapped directly from chat events;
  the renderer store should preserve existing anchors for matching sprite ids,
  resolve anchors through typed run/chat/workflow refs when available, or place
  the sprite in a bounded recent-activity lane until the next snapshot.
- Do not solve missing anchors by parsing command text, filenames in output, or
  other display strings.
- Camera movement must not request runtime snapshots, reopen streams, or
  trigger full graph refreshes.
- Do not change the backend runtime contract during Phase 3 unless a hard
  renderer blocker is discovered and documented in the plan first.
### Phase 3 - Renderer Trajectory Sprite Layer
Status: complete. Commit `ab0d154ad` added the renderer trajectory runtime
store, Electron event forwarding, IPC snapshot reads, workflow-node details,
and Pixi sprite rendering.

Render trajectory sprites as their own graph layer.

Implementation:

- Add a local trajectory runtime store with snapshot bootstrap and delta
  application.
- Coalesce sprite updates by animation frame.
- Pool sprite display objects.
- Anchor sprites to workflow nodes by source refs.
- Collapse crowded sprite groups into counts.
- Add selection/details affordances for sprite provenance.
- Keep sprite display independent from durable semantic graph refresh.
- Continue cheap sprite TTL/fade/progress while panning.

Acceptance:

- File changes, diffs, command status, reasoning summaries, and tool calls are
  visible within one second of typed run item activity.
- The default `Start -> Reviewer -> End` workflow feels live before any semantic
  node exists.
- Sprites disappear or collapse without leaving graph clutter.
- Selecting the workflow node shows recent sprites with source refs and run item
  ids.
- Camera movement does not trigger trajectory backend reads.
- Sprite rendering stays within display-object and frame budgets.

Phase 3 implementation review:

- Main process forwarding now streams workspace trajectory runtime SSE events
  and forwards decoded events to renderer windows.
- Preload and shared IPC expose trajectory runtime snapshot reads and runtime
  event subscriptions through `window.setta.workspaceTrajectory`.
- The renderer owns a local trajectory store with snapshot bootstrap, buffered
  deltas before initial snapshot, animation-frame coalescing, deterministic
  `snapshotRequired` reload behavior, TTL pruning, bounded recent-lane fallback,
  and workflow-node anchor preservation.
- Workflow graph rendering now has a dedicated Pixi trajectory layer with pooled
  display objects, compact icons/labels, collapsed counts, recent unanchored
  sprites, and cheap progress/fade animation that continues through camera
  movement.
- Workflow node details now show recent trajectory provenance including run item
  ids, chat run ids, provider ids, source refs, and file refs.
- Focused coverage verifies SSE cursor reconnect, store coalescing, snapshot
  buffering, gap reload, workspace filtering, runner-ref anchoring, anchor
  preservation when live deltas omit refs, recent-lane bounding, and workflow
  node details rendering.
- Post-review checks passed:
  `pnpm -C desktop exec vitest run src/main/workspace-trajectory-event-stream.test.ts src/renderer/src/features/workspace-graph/workspace-trajectory-store.test.ts src/renderer/src/features/workspace-graph/workflow-node-details-surface.test.ts`,
  `pnpm -C desktop typecheck`, `pnpm -C desktop build`, and
  `node desktop/tests/electron/run-workflows.mjs --workflow workflow-graph-smoke`.

Phase 4 handoff:

- Phase 4 is ready to implement.
- Keep Phase 4 focused on typed file operation fidelity in chat/provider/runtime
  data and the existing trajectory sprite contract. Do not refactor semantic
  memory usefulness or runtime ownership in this phase.
- Start by inventorying which file read, file write, patch, and diff facts are
  typed at the provider/protocol boundary today. Add explicit typed fields at
  the owning Go/backend boundary when the data exists.
- Regenerate TypeScript from Go-owned contracts if file-operation contract
  fields change. Do not edit generated TypeScript manually.
- Add a trajectory-specific deterministic Electron workflow that proves typed
  file reads, writes, and diffs travel through production Electron, main,
  preload, renderer, HTTP, and store paths into visible graph sprites and node
  details. The existing workflow graph smoke test proves the graph still boots
  after Phase 3, but it is not a file-fidelity acceptance test.
- Unknown or untyped file activity must continue to render as honest command,
  tool, or diff-summary sprites. Do not synthesize read ranges or `+/-` counts
  from command strings, command output, or display text.
### Phase 4 - File Read And Edit Fidelity
Status: complete. Commit `6e79eedd4` added typed file-operation fields to chat
run items, Codex protocol mapping, Setta dynamic tool metadata, trajectory
mapping, generated TypeScript, and deterministic Electron file-fidelity
coverage.

Improve the fidelity of file-specific trajectory facts.

Implementation:

- Add typed file operation details to chat run items or run item details where
  provider/tool metadata supports them.
- Represent file reads with filename and line range only when line range is
  typed.
- Represent file writes with path, operation, status, and structured additions /
  deletions when available.
- Represent diffs with structured stats when available.
- Add provider/protocol tests for file patch and diff notifications.
- Add MCP/dynamic tool argument extraction only through typed tool schemas.

Explicitly avoid:

- parsing arbitrary shell commands for file-read meaning,
- parsing arbitrary command output for line ranges,
- deriving `+/-` counts from untrusted display text,
- or treating a command that happens to mention a path as a file read.

Acceptance:

- `read file:line-range` sprites appear for typed file read tools.
- `edit file +N -M` sprites appear for typed diff/write sources.
- Unknown or untyped cases show honest tool/command sprites instead of fake file
  sprites.
- The transcript and graph agree on run item provenance.

Phase 4 implementation review:

- `RunItem` now carries `fileOperations` and structured `diffStats`, generated
  through the Go-owned contract surface into TypeScript.
- Codex file-change patch notifications map to typed create, write, delete, and
  rename operations with structured additions and deletions from provider diff
  payloads.
- Codex turn-level diff notifications map to typed diff operations and
  structured aggregate diff stats.
- The Setta `read_workspace_file` dynamic tool declares file-read metadata and
  records typed path and line-range facts from tool arguments.
- Workspace trajectory sprites now prefer typed file operations and structured
  diff stats, while untyped commands and tools remain honest command/tool
  sprites without synthesized file refs.
- Workflow-level trajectory snapshots now load chat activity for workflow-bound
  chat runs, so graph snapshots can show file-operation sprites without an
  explicit `chatRunId` filter.
- Deterministic coverage includes Go protocol/tool/trajectory mapping tests and
  `workspace-trajectory-file-fidelity`, which proves typed reads, writes, and
  diffs through production Electron, main, preload, renderer, HTTP, and store
  paths.

Phase 5 handoff:

- Phase 5 is ready to implement.
- Keep Phase 5 focused on semantic-memory usefulness: durable claim quality,
  evidence selection, future-use summaries, process-only rejection, context-pack
  reuse, and diagnostics for unused memory.
- Use the typed trajectory facts from Phase 4 as semantic evidence candidates.
  Do not promote raw reads, writes, diffs, commands, or tool calls into durable
  semantic nodes unless the cartographer can state the claim and future use.
- Add deterministic acceptance for `semantic-memory-usefulness` before changing
  broad cartographer behavior.
- Live Codex E2E with ChatGPT auth was run and failed in the live semantic
  cartographer terminal assertion after the goal and normal live assistant run
  completed. Treat that timeout as Phase 5 evidence: live semantic memory should
  either create a useful durable claim with evidence and future use or finish as
  an explicit no-op with a readable reason.
- Do not address the live failure with prompt-only tweaks or compatibility
  fallbacks. The fix should strengthen typed evidence selection, durable memory
  criteria, no-op diagnostics, and product-facing usefulness signals.

### Phase 5 - Semantic Memory Usefulness Refactor

Status: complete. Commit `d5db401e2` implemented semantic-memory usefulness
fields, evidence candidates, automatic-node policy checks, context-pack delivery
tracking, and renderer details surfacing.

Recenter semantic nodes around durable usefulness.

Implementation:

- Feed trajectory facts into cartographer input as evidence candidates.
- Make "why this node exists" and "future use" explicit in cartographer output
  or deterministic audit.
- Reject or pending-review semantic nodes that are merely trajectory events.
- Strengthen final synthesis to merge, dismiss, or connect session-specific
  nodes.
- Track whether semantic nodes later appear in context packs.
- Add a diagnostic for nodes that are never opened, promoted, connected, or
  delivered as context after creation.
- Consider a promoted/draft lifecycle for uncertain memory:
  - proposed memory,
  - accepted durable memory,
  - dismissed memory,
  - stale memory.

Acceptance:

- Semantic nodes created by the automatic cartographer are fewer and more
  specific than trajectory sprites.
- Every automatic durable semantic node has concrete evidence and a stated
  future use.
- Process-only nodes are rejected or remain pending review.
- At least one deterministic workflow proves a created semantic node is later
  delivered in a context pack when relevant.
- Details pane answers:
  - what the node claims,
  - why it exists,
  - what source facts support it,
  - what future work it should influence,
  - how it relates to other nodes.

Phase 5 implementation review:

- `SemanticNode` now stores public `whyItExists` and `futureUse`, and the
  generated TypeScript contract exposes `SemanticNodeUsefulness` in details.
- Cartographer output schema and validation require new nodes to include
  `whyItExists` and `futureUse`, and reject chain-of-thought or large raw
  content in those fields.
- Automatic cartographer application now rejects or leaves pending weak durable
  memory: process-only labels, repeated new-node summaries, missing concrete
  evidence, run-level-only evidence, and final-synthesis session nodes that are
  not connected to semantic context.
- Typed Phase 4 trajectory facts now flow into cartographer input as evidence
  candidates for run items, file changes, diffs, tests, commands, and typed file
  operations.
- Semantic details now report source coverage, context-pack delivery count,
  last context-pack delivery time, last user promotion time, and usefulness
  diagnostics for missing why/future-use or unused memory.
- Context-pack delivery tracking is proven through retrieval-backed compiler
  coverage, and the automatic cartographer workflow now asserts that created
  semantic nodes have concrete evidence, future-use text, and source coverage.
- The previous live Codex semantic-cartographer terminal timeout was rechecked
  with ChatGPT auth and passed after Phase 5.

Non-blocking residual:

- `lastUserOpenedAt` and `dismissalReason` are present in the usefulness
  contract, but current product paths do not yet record detail-pane opens or
  dismissal reasons. Do not treat those two fields as acceptance evidence until
  a later interaction-telemetry change gives them typed event sources.

Phase 6 handoff:

- Phase 6 is ready to implement.
- Keep Phase 6 focused on runtime ownership consolidation, not another
  cartographer prompt/policy pass unless a runtime contract boundary requires
  it.
- Preserve the hot-path split established by earlier phases: trajectory runtime
  for fast deterministic liveness, semantic memory for durable claims, and
  cartographer audit for operational state.
- Camera movement must remain local to renderer scene state. It must not cause
  backend reads, durable graph reconstruction, or high-frequency React array
  replacement.
- Details panes remain complete through explicit on-demand reads.
- Continue the no-backward-compatibility policy: no legacy runtime modes,
  migrations, transitional readers, dual-write paths, compatibility adapters, or
  silent fallbacks.

### Phase 6 - Runtime Ownership Consolidation

Status: ready to implement.

Clean up the long-term boundary between trajectory runtime, semantic runtime,
and renderer state.

Implementation:

- Decide whether `SemanticRuntimeSnapshot` remains as a semantic/cartographer
  audit projection or is folded into a broader workspace graph runtime.
- Keep durable `SemanticGraph` reads low-frequency and detail-oriented.
- Keep trajectory runtime hot-path data separate from semantic memory and
  cartographer details.
- Make the renderer consume one composed graph-scene store rather than several
  React-owned refresh paths.
- Use revisioned deltas for workflow, trajectory, semantic memory, and
  cartographer operational state.
- Keep details panes on explicit detail reads.

Acceptance:

- Camera movement cannot cause semantic, trajectory, cartographer, or workflow
  backend reads.
- Runtime deltas do not replace large React arrays on high-frequency paths.
- A stream gap causes one single-flight reload for the affected runtime
  projection.
- Hot-path payload budgets are enforced.
- Details remain complete through on-demand reads.

### Phase 7 - Product Acceptance Matrix

The product acceptance matrix, implementation notes, non-goals, and open
questions live in
`docs/plans/workspace_trajectory_liveness_and_semantic_memory_plan_appendix.md`.
