# Workspace Trajectory Liveness and Semantic Memory Phase 0

Date: 2026-06-18

Plan: `docs/plans/workspace_trajectory_liveness_and_semantic_memory_plan.md`

Phase 0 captured current behavior before implementation changes. No production code was changed for this report.

## Commands

```bash
node desktop/tests/electron/workflow-graph-pan-zoom-recording.test.mjs --scenario small-trackpad --skip-build --keep-artifacts --artifact-dir .recordings/workspace-trajectory-phase0-20260618/small-trackpad
node desktop/tests/electron/semantic-cartographer-auto-workflow.test.mjs --semantic-live-recording-only --skip-build --keep-artifacts --artifact-dir .recordings/workspace-trajectory-phase0-20260618/semantic-live-run
```

Both commands passed. The recordings use temporary app data and production Electron/main/preload/renderer/backend paths. The first command records the existing small workflow pan/zoom gate; the second records the semantic cartographer automatic workflow.

## Artifacts

- `.recordings/workspace-trajectory-phase0-20260618/small-trackpad/phase8-performance-gate.json`
- `.recordings/workspace-trajectory-phase0-20260618/semantic-live-run/automatic-agent/phase8-semantic-liveness-gate.json`
- `.recordings/workspace-trajectory-phase0-20260618/semantic-live-run/automatic-agent/semantic-runtime-phase2-traffic-gate.json`
- `.recordings/workspace-trajectory-phase0-20260618/semantic-live-run/automatic-agent/events.jsonl`
- `.recordings/workspace-trajectory-phase0-20260618/semantic-live-run/automatic-agent/ipc.jsonl`

## Production-Like Workflow Baseline

No dedicated deterministic code-review workflow fixture exists today. The closest current production-like fixture is the semantic cartographer automatic workflow: it opened a workspace, created a chat-backed workflow execution, ran an agent node, streamed chat/run events, wrote a workflow report file, ran a dynamic `workflow_result` tool, and drove semantic cartographer windows through the backend and renderer event streams. The specific code-review workflow remains an evidence gap for a future targeted fixture or live recording.

Current-state finding: the workflow graph still feels static before semantic/cartographer state appears. The live recording exposes semantic graph and cartographer working-set events, but it does not expose first-class trajectory sprites for command, file change, reasoning, or plan updates. The current visible graph indication is semantic/cartographer runtime state, not the desired per-run-item trajectory layer.

## Liveness Timings

Measured from `events.jsonl` in the semantic live run:

| Source event | First visible graph indication | Latency |
| --- | --- | ---: |
| `workflow.execution.started` at `15:44:24.176Z` | `semantic_graph_event_forwarded` with `context_packs` at `15:44:24.181Z` | 5 ms |
| `workflow.execution.started` at `15:44:24.176Z` | `semantic_graph_event_forwarded` with `cartographer_audit,working_set` at `15:44:24.181Z` | 5 ms |
| First `chat.run_item.created` at `15:44:24.186Z` | `cartographer_audit,working_set` at `15:44:24.188Z` | 2 ms |
| First `chat.run_item.created` at `15:44:24.186Z` | committed `cartographer_audit,working_set,graph,activity` at `15:44:24.231Z` | 45 ms |
| File-change `chat.run_item.created` at `15:44:24.188Z` | `cartographer_audit,working_set` at `15:44:24.188Z` | 0 ms |
| File-change `chat.run_item.created` at `15:44:24.188Z` | committed `cartographer_audit,working_set,graph,activity` at `15:44:24.231Z` | 43 ms |

Reasoning-summary liveness could not be directly measured in this semantic workflow because the scripted run did not emit a reasoning summary. Source inventory confirms reasoning summaries are typed as `RunItemTypeReasoning`, but the current graph has no trajectory-sprite layer to make a reasoning-summary event visibly distinct from semantic runtime updates.

## Pan and Zoom

Measured from the small-trackpad gate:

| Metric | Value |
| --- | ---: |
| Scenario | `small-trackpad` |
| Graph nodes | 3 |
| Wheel gestures | 2 |
| Wheel samples | 10 |
| p95 event to camera update | 0.5 ms |
| p95 event to rendered frame | 22.4 ms |
| p95 frame time | 28.7 ms, report-only |
| Worst frame time | 30.9 ms |
| Max long task | 66 ms |
| Display objects | 57 |
| Materialized nodes | 3 |
| Semantic working-set reads during camera input | 0 |
| Semantic working-set HTTP requests during camera input | 0 |
| Label syncs while camera moving | 0 |

The measured pan/zoom gate did not include active workflow edge flow (`activeEdgeFlowCount: 0`), so it does not prove active workflow animation continuity in the same semantic workflow. Existing renderer behavior and focused tests cover the intended split: active workflow motion continues while semantic decoration is deferred during camera movement, but this phase 0 artifact does not provide a visual proof for active workflow edges in the semantic live run.

## Semantic Runtime and Outcomes

The semantic runtime traffic gate passed:

| Metric | Value |
| --- | ---: |
| Semantic events | 131 |
| Runtime snapshot bootstrap | `2026-06-18T15:44:22.115Z` |
| Runtime snapshot IPC reads | 11 |
| Runtime snapshot max payload | 35,323 bytes |
| Runtime delta max payload | 10,972 bytes |
| Runtime payload bytes per minute | 798,928 |
| Blank-scope working-set reads | 0 |
| Blank-scope working-set HTTP requests | 0 |
| Scoped working-set reads | 8 |

Semantic nodes observed:

- Seed/context node: `semantic_auto_workflow_context`, kind `constraint`, first visible in `semantic-graph:read` at `15:44:22.653Z`.
- Auto-created finding: `semantic_node_cartographer_scripted_76d06ccde2fa`, kind `finding`, first visible in `semantic-graph:read` at `15:44:24.277Z`.

Cartographer status coverage in `phase8-semantic-liveness-gate.json`: `queued`, `running`, `noop`, `proposed`, `applied`, `failed`.

Requested outcome counts:

| Outcome | Count | Type/status detail |
| --- | ---: | --- |
| Created semantic nodes | 2 visible nodes total | 1 seed `constraint`, 1 auto-created `finding` |
| Rejected semantic nodes/patches | 0 observed | No `rejected` status appeared in this run |
| No-op cartographer runs | 1 | `completedNoopRunCount: 1`; status coverage includes `noop` |
| Pending review patches | 5 | `pendingReviewPatchCount: 5`; live workflow runtime status was `pending_review` |
| Failed cartographer runs | 5 | `failedRunCount: 5` |

Final audit snapshots showed `createdSemanticEventIds: 3`, `queuedWindowCount: 1`, `failedRunCount: 5`, `pendingReviewPatchCount: 5`, and `completedNoopRunCount: 1`. Duplicate public graph source links were prevented for `semantic_node_cartographer_scripted_76d06ccde2fa` with `sourceLinkCount: 2`.

Context-pack appearance:

- The delivered context pack `semantic_context_pack_bc9c0c3083a3337a7221e57317b53a2f` contained three items for the seed/context node: constraint, activity, and evidence.
- The auto-created finding appeared in retrieval results during the run, but it was not delivered as a context-pack item in this short recording. Count for newly auto-created finding nodes later delivered in context packs in this run: 0. Count for preexisting/seeded semantic nodes delivered in context packs: 1.

## Current Visual Behavior

Semantic foundation/background still changes on first semantic node. `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-foundation.js` returns `workspaceNeonTheme.foundation` whenever any node has `layer === "semantic"`, otherwise it chooses workflow-only or workflow-active foundation. This means the first semantic node still changes the foundation style instead of semantic memory arriving as an additive layer.

Semantic node drag persistence remains at risk under runtime refreshes. `workflow-graph-layout-persistence.ts` persists semantic positions by awaiting `window.setta.semanticGraph.updateLayoutPositions`, then calls `updateSemanticLayoutPositions(updated.positions)`. `semantic-graph-projection.ts` derives semantic node positions from `semanticGraph.layoutPositions` or defaults. I did not find a local-first semantic layout overlay in the inspected path. The current recordings did not drag a semantic node during a semantic runtime refresh, so phase 0 records this as unverified/race-prone rather than proven stable.

## Provider and Run-Item Metadata Inventory

Typed today:

| Metadata | Current source | Label support today |
| --- | --- | --- |
| Command execution | `RunItemTypeCommandExecution`, `Command`, `Cwd`, `ExitCode`, `DurationMs`, status | Yes: command running/completed/failed, command text, cwd, exit |
| File write/change | `RunItemTypeFileChange`, `FilePaths`, `PatchStatus`, status | Partial: file changed/written with path and patch status |
| MCP tool call | `RunItemTypeMCPToolCall`, `ServerName`, `ToolName`, `Progress`, sometimes `Details` from full items/fixtures | Partial: server/tool/progress when present; arguments only when typed details are present |
| Dynamic tool call | `RunItemTypeDynamicToolCall`, `Namespace`, `ToolName`, `Details`, `Result`, status | Yes: tool name/status/known arguments using raw JSON details |
| Reasoning summary | `RunItemTypeReasoning`, public `Summary`; private reasoning text goes to `HiddenText` | Yes for public summary updates; do not expose hidden text |
| Plan update | `RunItemTypePlan`, `Summary` | Yes: plan updated with summary |
| Approval requests | command/file/permission/structured/user-input approval run items and `ApprovalRequest` | Yes: approval requested/resolved by kind |
| Assistant message | `RunItemTypeAgentMessage`, assistant text deltas | Yes: assistant streaming/completed |
| Diff update | `RunItemTypeDiff`, `DiffSummary` text | Partial: diff updated with provider summary text only |

Requires provider/protocol or contract additions:

| Desired label | Missing typed metadata |
| --- | --- |
| `read <file>:<line-range>` | No general first-class file-read run item, no typed path/range for generic provider reads |
| `edit <file> +N -M` | File changes have paths/status, not structured additions/deletions or operation kind |
| `diff <files> +A -D` | Diff summary is text; no structured file count/add/delete stats |
| `create/delete/rename <file>` | No typed file operation kind in `RunItem` |
| MCP filesystem path/range labels | Only available when the MCP item/tool schema supplies typed args in details; not guaranteed by current notification progress |
| Source-level evidence line ranges for semantic/cartographer anchors | Semantic evidence has range fields, but current workflow evidence uses empty path and `rangeStart: 0`, `rangeEnd: 0`; provider/run-item events do not supply line ranges for generic reads/writes |

Relevant source references:

- `internal/chat/types.go`: run item status/type enums and `RunItem` fields.
- `internal/chat/events.go`: `chat.run_item.created`, `chat.run_item.updated`, `chat.run_item_output.delta`, and `chat.assistant_text_delta`.
- `internal/chat/codex_protocol.go`: Codex item mapping for command, changed paths, patch status, server/tool/progress, result/error, plan, and reasoning summary.
- `internal/chat/codex_harness_notification_handlers.go`: notifications for plan/reasoning deltas, patch updates, MCP progress, and diff updates.
- `internal/chat/codex_harness_requests.go`: dynamic tool calls store namespace/tool and raw JSON arguments in `Details`.
- `internal/chat/codex_harness_approvals.go`: command and file-change approvals create typed pending run items.

## Phase 0 Gaps to Carry Forward

- The current recordings measure semantic/cartographer graph indications, not first-class trajectory sprites. Phase 1 needs a visible run-item trajectory layer.
- A dedicated production-like code-review fixture or live recording is still needed; this phase used the existing semantic-live workflow-result fixture.
- Reasoning-summary event-to-visible-graph latency still needs a targeted fixture or live run that emits reasoning summary events.
- Active workflow animation continuity during camera movement needs a same-workflow recording with active workflow edges, not only source/test evidence.
- Semantic node drag persistence under semantic runtime refresh needs an automated reproduction before the behavior can be called stable.
