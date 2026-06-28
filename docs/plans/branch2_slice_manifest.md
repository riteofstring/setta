# Branch 2 Slice Manifest

- Phase: 0 audit for `docs/plans/branch2_essential_port_plan.md`
- Current branch base checked: `6beddf21a554132c283255e1f1bc6c259213e537`
- Source cutoff checked: `7a67cf453a006fa4cfd9a9b7e9ef6298984364e4`
- Scope: docs-only; no cherry-picks, generated edits, contract edits, package edits, or runtime code edits.
- Primary decision: World B. Implement the graph-surface/runtime refactor first, then trajectory runtime/sprites.

## Decision Summary

World B wins because current live graph updates are not bounded content-only updates on the paths that matter.

The current renderer retains node display objects by id, but a graph replacement still clears and redraws every edge, destroys and recreates edge labels, rebuilds spatial queries, resyncs all labels, redraws glow/outlines, and cancels active interactions including camera panning. Workflow and semantic event ingress both pass through React state and `workflowRenderer.updateGraph(graph)`, which calls the same replacement path. Camera movement itself does not request backend reads, but graph updates during camera movement cancel the active camera interaction.

This makes trajectory sprites unsafe as the first slice: their renderer would ride on a graph surface that can still rematerialize scene pieces and interrupt pan/zoom. The first implementation slice should be a graph-surface/runtime ownership refactor that creates bounded update lanes and hard counters before adding trajectory runtime visuals.

## Runtime Evidence

Production Electron smoke was run after a desktop production build:

```text
./scripts/test_workflow_graph_visual.sh --keep-artifacts
```

Result: passed.

Artifacts: `.recordings/workflow-graph/20260622T033339683Z`

Relevant runtime counters in `summary.json` include `canvasCreationCount`, `rendererInstanceId`, `rendererDestroyCount`, `reactRenderCount`, `cameraUpdateCount`, `edgeRedrawCount`, `labelSyncCount`, `spatialIndexRebuildCount`, `spatialIndexUpdateCount`, and `graphUpdateCount`. This smoke uses a static fixture, so `graphUpdateCount: 0` is expected and it is not proof that live graph replacement is cheap. It verifies that the production main/preload/renderer path and debug counter surface are usable for the implementation slice.

Needs instrumentation - defer to implementation: the current snapshot has renderer-level counters, but no semantic/workflow event attribution counter that says which ingress caused a graph replacement while a camera gesture was active.

## Renderer Update-Path Investigation

### Current Data Ingress

Workflow projection updates:

- Owner files: `desktop/src/renderer/src/features/workspace-graph/workflow-graph-projection-state.ts`, `workflow-graph-surface.tsx`, `pixi-renderer.js`.
- Initial load and workflow events call `window.setta.workflow.graphProjection(...)`.
- Projection state updates rebuild the merged graph in React.
- `WorkflowGraphSurface` effect calls `workflowRendererRef.current?.updateGraph(graph)`.
- Renderer path: `updateGraph` -> `replaceSceneGraph` -> `sceneGraph.replaceGraph`.
- Disposition: full renderer update entrypoint; not content-only.

Semantic graph and activity updates:

- Owner files: `semantic-graph-state.ts`, `semantic-graph-projection.ts`, `workflow-graph-surface.tsx`, `pixi-renderer.js`.
- Semantic events are filtered by `semanticGraphRefreshRequestForChange`.
- Graph changes call `window.setta.semanticGraph.read(...)` and `readActivitySummary(...)`.
- Activity-only changes call `readActivitySummary(...)`.
- State updates rebuild the semantic projection and merged graph in React.
- Disposition: backend read plus React graph update plus full renderer update entrypoint; not content-only.

Validation, draft, and local graph updates:

- Owner files: `workflow-graph-draft-state.ts`, `workflow-graph-layout-overlay.ts`, `workflow-graph-surface.tsx`, `workflow-approval-overlay.tsx`.
- Validation/draft changes alter graph presentation data in React and then call the same renderer update path.
- Disposition: not Pixi app recreation, but still graph replacement through the renderer entrypoint.

Layout and node drag:

- Owner files: `pixi-renderer-node-drag.js`, `workflow-graph-renderer-handlers.ts`, `workflow-graph-layout-persistence.ts`.
- Active drag mutates node positions in the retained renderer scene and updates spatial data for the moved nodes.
- Drag finish persists layout through semantic/workflow layout owners.
- Disposition: this is the closest current content-only lane, but it is local interaction-specific and does not cover workflow/semantic live events.

Camera movement:

- Owner files: `pixi-renderer.js`, `workflow-graph-renderer-handlers.ts`, `workflow-graph-camera-scope.ts`.
- Camera movement calls `commitCameraChange`, increments camera counters, syncs labels, and writes camera state through `writeWorkflowGraphCameraState`.
- It does not directly request backend graph reads.
- A concurrent graph replacement calls `cancelActiveInteractionsForGraphUpdate`, which clears drawing state and cancels `panningCamera`.
- Disposition: camera movement is not isolated from graph replacement churn.

Debug/runtime feeds:

- Owner files: `pixi-renderer-debug-snapshot.js`, `workflow-graph-runtime-registry.ts`, `workflow-graph-recording.ts`.
- Existing debug snapshot exposes renderer, graph update, label, edge, camera, spatial-index, and React render counters.
- Runtime registry currently provides renderer handles and freeze/debug access; it is not a trajectory data feed.

### Renderer Replacement Behavior

Current nodes:

- Owner file: `pixi-renderer-scene-graph.js`.
- `replaceGraph` clones incoming nodes and edges.
- Nodes are retained by id.
- Nodes are rebuilt only when display-shape inputs such as color, connectability, size, or ports change.
- Otherwise node fields are patched and `updateNodeDisplayObjects` moves/updates the retained display objects.
- Disposition: content-aware and partially retained.

Current edges:

- Owner file: `pixi-renderer-edge-rendering.js`.
- `redrawWorkspaceEdges` clears `edgeGraphics`.
- It destroys all edge labels through `edgeLabelLayer.removeChildren().forEach((child) => child.destroy())`.
- It redraws every edge after each graph replacement.
- Disposition: full edge/label rematerialization; not content-only.

Current graph replacement:

- Owner file: `pixi-renderer.js`.
- `replaceSceneGraph` cancels active interactions, replaces the scene graph, rebuilds spatial queries, prunes selection, redraws outlines/glow, syncs all labels, and redraws all edges.
- Disposition: bounded node patching is present, but the update lane is still too broad for high-frequency trajectory/runtime sprites.

Current React/Pixi lifecycle:

- Owner file: `workflow-graph-surface.tsx`.
- Normal graph changes rerender the React surface and call `updateGraph`.
- Pixi app creation/destruction is scoped to renderer setup keys such as surface/scope/debug readiness, not every graph change.
- Disposition: normal graph updates do not recreate the Pixi app, but they still cause React render and broad Pixi update work.

## Typed-Metadata Feasibility

Hard rule for all future slices: do not parse shell commands, arbitrary stdout/stderr, or assistant prose to infer file operations, test outcomes, or semantic meaning. Use typed provider/runtime metadata, Go-owned contracts, deterministic structured diff data, or explicit tool metadata only.

| Signal | Current typed source | Fidelity |
| --- | --- | --- |
| File reads | Current `RunItem` mapping does not expose normalized file-read operations. Generic tool calls expose args/results but not a normalized read contract. | Blocked for full fidelity. |
| File writes | `RunItemTypeFileChange`, `FilePaths`, `PatchStatus`, file-change approvals, and diff run items exist. | Partial. Paths/status are typed; operation kind/range/hash/diff stats need Go-owned contract work. |
| Diffs | `RunItemTypeDiff`, `DiffSummary`, `FilePaths`, run item output deltas. | Partial. Typed paths/summary exist; structured per-file stats need contract work. |
| Commands | `RunItemTypeCommandExecution`, `Command`, `Cwd`, `ExitCode`, `DurationMs`, output deltas. | Feasible. |
| Tests | Usually represented as commands and workflow action results, not a first-class test result kind. | Partial. |
| Tool calls | MCP/dynamic/collab tool run item types include `ServerName`, `ToolName`, `Progress`, `Result`, `Error`. | Feasible for generic tool-call sprites; file semantics require explicit metadata. |
| Approvals | `ApprovalRequest` has typed command/file/permission/structured/user-input approval kinds and statuses. | Feasible. |
| Reasoning summaries | `RunItemTypeReasoning`, `Progress`, hidden text/details, run item deltas. | Feasible. |
| Assistant output | `chat.assistant_text_delta`, assistant message run items, message created/updated events. | Feasible. |
| Workflow status | `WorkflowEvent`, `RunnerEventType`, `WorkflowGraphProjection`, `WorkflowExecution`, action statuses, pending approvals. | Feasible. |
| Run item provenance | `ProviderItemID`, run/message ids, timestamps, status, item type. | Feasible for chat provenance; cross-domain trajectory provenance needs explicit trajectory ids/revisions. |

Branch 2 added the missing shape in two places:

- `internal/chat/file_operations.go` added structured file operation extraction and `RunItemFileOp` style data.
- `internal/workspacetrajectory/*` added typed trajectory sprite kinds, revisions, deltas, detail refs, source kinds, and bounded payloads.

Current feasibility conclusion: a useful backend trajectory spine is possible only if scoped to current typed facts, but branch 2's full file-operation fidelity is blocked until the current branch extends Go-owned chat contracts and regenerates TypeScript. This does not override the World B renderer decision.

## Current Owner Map

Workspace layout and surface registry:

- `desktop/src/renderer/src/workspace-layout/WorkspaceLayoutArea.tsx`
- `desktop/src/renderer/src/workspace-layout/workspace-ui-layout.tsx`
- `desktop/src/renderer/src/workspace-layout/surface-registry.ts`
- `desktop/src/renderer/src/workspace-layout/presentation-engine.ts`
- `desktop/src/renderer/src/workspace-layout/react-dom-surface-adapter.tsx`
- `desktop/src/renderer/src/workspace-layout/surface-adapters.ts`
- `desktop/src/renderer/src/workspace-layout/layout-store.ts`
- `desktop/src/renderer/src/workspace-layout/pane-resize-session.ts`
- `desktop/src/renderer/src/workspace-layout/pane-resize-target.ts`
- `desktop/src/renderer/src/workspace-layout/workspace-interactions.ts`

Graph renderer lifecycle:

- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-surface.tsx`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-application.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-lifecycle.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-scene-graph.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-edge-rendering.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-labels.js`
- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-spatial-queries.js`
- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-renderer-lifecycle.ts`
- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-runtime-registry.ts`

Pane presentation and resize handling:

- `desktop/src/renderer/src/components/resizable-pane.tsx`
- `desktop/src/renderer/src/workspace-pane-chrome.css`
- `desktop/src/renderer/src/workspace-layout.css`
- `desktop/src/renderer/src/workspace-layout/resize-phase-tracker.ts`
- `desktop/src/renderer/src/workspace-layout/layout-engine.ts`

Chat transcript and run activity:

- `desktop/src/renderer/src/components/chat-transcript.tsx`
- `desktop/src/renderer/src/components/chat-transcript-rows.tsx`
- `desktop/src/renderer/src/components/chat-transcript-render-helpers.ts`
- `desktop/src/renderer/src/components/chat-run-activity.tsx`
- `desktop/src/renderer/src/components/chat-panel.tsx`
- `desktop/src/renderer/src/stores/chat-store.ts`
- `desktop/src/renderer/src/stores/chat-events.ts`

Chat streaming performance paths:

- `desktop/src/renderer/src/stores/chat-store-stream-event-batcher.ts`
- `desktop/src/renderer/src/stores/chat-store-page-patches.ts`
- `desktop/src/renderer/src/components/chat-transcript*.tsx`
- `desktop/tests/electron/chat-stream-performance.test.mjs`
- `docs/reports/performance/*chat*`

Semantic graph HTTP and event stream:

- `internal/httpapi/semantic_graph_handlers.go`
- `internal/httpapi/semantic_graph_event_stream.go`
- `desktop/src/main/semantic-graph-event-stream.ts`
- `desktop/src/main/semantic-graph-event-forwarding.ts`
- `desktop/src/preload/index.ts`
- `desktop/src/renderer/src/features/workspace-graph/semantic-graph-state.ts`
- `desktop/src/renderer/src/stores/semantic-graph-store.ts`

Generated backend contracts:

- Owner registry: `internal/httpapi/endpoints.go`
- Contract owners: `internal/httpapi/contracts.go` and domain structs under `internal/chat`, `internal/orchestrator`, `internal/semanticgraph`
- Generator: `cmd/generate-contracts/main.go`
- Generated output: `desktop/src/generated/backend.ts`
- Rule: edit Go owners/endpoint registry first, regenerate; never manually edit generated TypeScript.

Electron workflow harnesses:

- `desktop/tests/electron/electron-cdp-harness.mjs`
- `desktop/tests/electron/workflow-graph-smoke.test.mjs`
- `desktop/tests/electron/workflow-graph-scale-validation.test.mjs`
- `desktop/tests/electron/workflow-projection-smoke-helpers.mjs`
- `desktop/tests/electron/workflow-graph-layout-helpers.mjs`
- `scripts/test_workflow_graph_visual.sh`
- `scripts/test_workflow_graph_scale_validation.sh`

## Cluster Manifest

### 1. Workflow Validation And Layout Ownership

Product intent:

- Preserve validation state, validation overlays, edge deletion correctness, durable drag/layout ownership, and save outcomes.

Source commits relative to cutoff:

- `19ace7475` Persist workflow validation state
- `7b740e4bf` Fix workflow draft validation revisions
- `829e0a0ed` Fix workflow validation overlay and edge deletion
- `2e9bc6e84` Add workflow graph view layout owner
- `30793a63d` Add workspace graph durable drag contract tests
- `4f8f93d74` Add workspace graph phase 2 contract coverage
- `f2161445e` Implement workflow graph movement ownership
- `01668433c` Implement graph layout save outcomes

Branch 2 files touched:

- `internal/orchestrator/validation*.go`
- `internal/orchestrator/store_validation.go`
- `internal/orchestrator/service_layout.go`
- `internal/orchestrator/service_view_layout.go`
- `internal/orchestrator/store_view_layout.go`
- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-layout-overlay.ts`
- `workflow-graph-layout-persistence.ts`
- `workflow-graph-view-layout.ts`
- workflow graph layout/contract tests

Current owners:

- `internal/orchestrator/*validation*`
- `internal/orchestrator/projection.go`
- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-layout-persistence.ts`
- `desktop/src/renderer/src/features/workspace-graph/workflow-graph-layout-overlay.ts`
- workspace layout files listed in the owner map

Contracts and generated outputs:

- Workflow projection, validation, and layout APIs are Go-owned.
- HTTP endpoint membership must remain in `internal/httpapi/endpoints.go`.
- `desktop/src/generated/backend.ts` must be regenerated only from owner changes.

Disposition:

- Keep, but not first.
- Method: reimplement-clean against current owners. Port-diff only for small isolated validation/layout logic after checking current branch semantics.
- Prerequisite: graph-surface/runtime ownership should land first for movement/persistence behavior. Pure validation state can be sliced earlier only if it avoids renderer churn.

Risks and followups:

- Branch 2 layout ownership overlaps with current workspace layout/surface registry. Avoid dual layout owners.
- Need deterministic Electron coverage through production app paths for any workflow layout behavior changes.

### 2. Visual Language And Mockups

Product intent:

- Keep the direction of a more legible, active workspace graph with clearer motion and status language.

Source commits relative to cutoff:

- `35aa9290d` add mockup and plan
- `ebb02707e` docs: living-workspace neon redesign mockup and plan
- `07e1fe584` Implement neon workspace graph phase 0
- `63b3fb2e2` Implement workspace graph neon phase 1
- `b3e097330` Implement neon workspace animation driver
- `c9e41c165` Implement workflow edge flow animation
- `74a791eb0` Implement workflow node neon motion
- `c01490083` Implement semantic cell static visuals
- `1992781fb` Implement semantic ambient graph animations
- visual parity followups: `0bd3bf1a9`, `abbe7f69a`, `fa15ac35c`, `bb01e50b7`, `18f5c1207`

Branch 2 files touched:

- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-animation*.js`
- `pixi-renderer-cell-animation.js`
- `pixi-renderer-edge-rendering.js`
- `pixi-renderer-node-geometry.js`
- visual reports under `docs/reports/visual`
- performance reports under `docs/reports/performance/living-workspace-*`

Current owners:

- `pixi-renderer-node-geometry.js`
- `pixi-renderer-edge-rendering.js`
- `pixi-renderer-labels.js`
- `workflow-graph-surface.tsx`
- visual/performance report directories

Contracts and generated outputs:

- None unless visual state becomes backend-owned.

Disposition:

- Learn-only for phase 1.
- Method: reimplement-clean after graph update lanes are bounded.
- Do not port decorative animation wholesale before interaction and performance gates are stable.

Risks and followups:

- Visual changes can hide performance regressions. Require before/after reports for performance-relevant refactors.

### 3. Semantic Cartographer Audit And Settings

Product intent:

- Preserve cartographer auditability, automatic settings, patch policy, validation evidence, and settings surfaces.

Source commits relative to cutoff:

- `803dbda9d`, `4b1e566de`, `d7fa70885`, `3c3e1765e`, `efa491a44`, `f97e504e3`, `f3cdfa699`
- Later validation/settings/usefulness followups: `77d6c6201`, `8da193b14`, `8589cab88`, `fe0b50741`, `7d872b0f7`, `02447842c`, `925416f90`, `50dc8ef90`, `5aab482d5`, `d5db401e2`

Branch 2 files touched:

- `internal/semanticgraph/cartographer_*.go`
- `internal/semanticgraph/cartographer_settings*.go`
- `internal/semanticgraph/store_cartographer*.go`
- `desktop/tests/electron/semantic-cartographer-*.mjs`
- `docs/reports/performance/semantic-cartographer-*.md`

Current owners:

- `internal/semanticgraph/service.go`
- `internal/semanticgraph/store.go`
- `internal/semanticgraph/projection*.go`
- `internal/httpapi/semantic_graph_handlers.go`
- semantic graph renderer/store files listed in the owner map

Contracts and generated outputs:

- Settings and readback contracts are Go-owned under `internal/semanticgraph` plus `internal/httpapi`.
- Regenerate backend TypeScript after any owner changes.

Disposition:

- Defer.
- Method: reimplement-clean after trajectory and graph update lanes have stable contracts.

Risks and followups:

- Audit/settings breadth is high. Taking it before graph/runtime boundaries would mix product behavior with infrastructure risk.

### 4. Semantic Memory Usefulness

Product intent:

- Preserve usefulness scoring, retrieval context, working-set pulses, and semantic memory signals that make graph activity meaningful.

Source commits relative to cutoff:

- `925416f90`, `50dc8ef90`, `5aab482d5`, `d5db401e2` and related semantic retrieval/context compiler commits in the branch 2 range.

Branch 2 files touched:

- `internal/semanticgraph/types_usefulness.go`
- `store_node_usefulness.go`
- `semantic_retrieval.go`
- `context_compiler*.go`
- `working_set*.go`
- renderer semantic details/usefulness files

Current owners:

- `internal/semanticgraph/types.go`
- `internal/semanticgraph/projection*.go`
- `desktop/src/renderer/src/features/workspace-graph/semantic-node-details-surface.tsx`
- `desktop/src/renderer/src/features/workspace-graph/semantic-node-details-invalidation.ts`
- `desktop/src/renderer/src/features/workspace-graph/semantic-graph-state.ts`

Contracts and generated outputs:

- Semantic graph payloads and details APIs are Go-owned.
- Regenerate generated backend after owner changes.

Disposition:

- Keep later.
- Method: reimplement-clean once trajectory has a typed source model and semantic runtime liveness is measurable.

Risks and followups:

- Avoid fake usefulness estimates or keyword inference. The signal must come from typed semantic graph/runtime data.

### 5. Workspace Trajectory Runtime Backend

Product intent:

- Build a bounded, typed runtime spine for workspace activity: file operations, commands, tests, tool calls, approvals, reasoning summaries, assistant messages, workflow status, and cartographer status.

Source commits relative to cutoff:

- `a047823d4` Implement workspace trajectory runtime phase 2
- `ab0d154ad` Add workspace trajectory runtime visualization
- `6e79eedd4` Implement typed workspace trajectory file operations
- `89512fcb9` Show command previews in trajectory sprites
- `d16c12111` Aggregate cartographer trajectory display items

Branch 2 files touched:

- `internal/workspacetrajectory/chat_delta.go`
- `internal/workspacetrajectory/mapper.go`
- `internal/workspacetrajectory/payload.go`
- `internal/workspacetrajectory/runtime_helpers.go`
- `internal/workspacetrajectory/service.go`
- `internal/workspacetrajectory/types.go`
- `internal/httpapi/workspace_trajectory_handlers.go`
- generated backend contracts
- workspace trajectory renderer/store files

Current owners:

- `internal/chat/types.go`
- `internal/chat/codex_protocol.go`
- `internal/chat/codex_harness_notification_handlers.go`
- `internal/chat/codex_harness_approvals.go`
- `internal/orchestrator/types.go`
- `internal/orchestrator/runner_contract.go`
- `internal/httpapi/endpoints.go`
- `desktop/src/generated/backend.ts`

Contracts and generated outputs:

- New trajectory contracts must be Go-owned.
- Endpoint registry must own the HTTP request/response surface.
- Generated TypeScript must be regenerated, never hand-edited.

Disposition:

- Keep, but not first.
- Method: reimplement-clean after graph-surface/runtime refactor establishes bounded renderer update lanes.
- A backend-only preparatory slice is possible later if it stays within current typed facts, but full branch 2 fidelity requires RunItem/file-operation contract changes.

Risks and followups:

- File reads are blocked on current typed metadata.
- Do not parse arbitrary command output or assistant text.
- Need temporary app data and production-path E2E coverage for chat/workflow activity propagation.

### 6. Renderer Trajectory Sprites And Details

Product intent:

- Render typed workspace activity as anchored/passive sprites, badges, command previews, and details panels without disrupting graph navigation.

Source commits relative to cutoff:

- `ab0d154ad` Add workspace trajectory runtime visualization
- `89512fcb9` Show command previews in trajectory sprites
- `a116edff8` Clean up trajectory anchorless placement
- `108db485e` Clean up trajectory details presentation
- `5fbd51db2` Implement trajectory sprite passive badges
- `0d63c5ae1` Add workflow graph activity sprite popovers

Branch 2 files touched:

- `desktop/src/renderer/src/features/workspace-graph/pixi-renderer-trajectory-runtime.js`
- `pixi-renderer-trajectory-sprites.js`
- `workflow-trajectory-runtime.ts`
- `workflow-trajectory-runtime-details.tsx`
- `workspace-trajectory-store.ts`
- `workspace-trajectory-display-items.ts`
- `workspace-trajectory-display-labels.ts`
- activity sprite popover/details files

Current owners:

- `workflow-graph-surface.tsx`
- `pixi-renderer.js`
- `workflow-graph-runtime-registry.ts`
- `chat-run-activity.tsx`
- `workflow-node-details-surface.tsx`

Contracts and generated outputs:

- Depends on the trajectory backend contract and generated TypeScript.

Disposition:

- Keep after graph-surface/runtime refactor and backend trajectory contract.
- Method: reimplement-clean, not wholesale port.

Risks and followups:

- Current graph replacement path would make sprite liveness noisy and pan/zoom-hostile.
- Details UI should reuse shared run/activity presentation after that presentation is extracted.

### 7. Graph Surface Runtime And Pan-Zoom

Product intent:

- Create a graph surface runtime that separates React ownership, Pixi scene ownership, camera ownership, content updates, labels, edges, semantic activity, and future trajectory lanes.

Source commits relative to cutoff:

- `a7fc49f4a`, `aced32937`, `f18785844`, `2d2a4498b`, `9dc20ff23`, `1cf772c9f`, `605282f12`, `0aa0c0e05`, `2d1343265`, `4fd513a4f`, `77b3d0f78`, `655675ab9`, `6b218a60c`, `ceba01abf`, `9f607dc57`, `f8452f281`, `8c0ae1497`, `8915626fd`, `d5be28480`, `c122518bc`, `6f5365223`, `3de7ff999`, `f8c4be565`

Branch 2 files touched:

- `workflow-graph-surface-controller.ts`
- `workflow-graph-surface-state.ts`
- `workflow-graph-scene-runtime.ts`
- `workflow-graph-surface-layers.tsx`
- `pixi-renderer-camera-*.js`
- `pixi-renderer-frame-*.js`
- `pixi-renderer-interaction-*.js`
- `pixi-renderer-wheel-*.js`
- `pixi-renderer-visible-scene-window.js`
- `pixi-renderer-visibility-window.js`
- pan/zoom performance, recording, and snapshot tests/reports

Current owners:

- `workflow-graph-surface.tsx`
- `pixi-renderer.js`
- `pixi-renderer-scene-graph.js`
- `pixi-renderer-edge-rendering.js`
- `pixi-renderer-labels.js`
- `pixi-renderer-spatial-queries.js`
- `pixi-renderer-debug-snapshot.js`
- `workflow-graph-renderer-handlers.ts`
- `workflow-graph-runtime-registry.ts`
- workspace layout/surface registry files listed above

Contracts and generated outputs:

- Mostly renderer-local unless exposing new debug/report surfaces.
- If runtime data crosses preload/HTTP boundaries, define it in Go/domain owners and regenerate TypeScript.

Disposition:

- First slice.
- Method: reimplement-clean using branch 2 as design evidence, not as a wholesale port.

First implementation shape:

- Add event-attributed counters at the existing graph update entrypoints so a recording can identify the ingress source, whether the camera was moving, whether an interaction was cancelled, and how many edges/labels were rematerialized.
- Retain or diff edges and edge labels for unchanged graph structure. If an edge or label must be rematerialized, count that explicitly and keep it out of the content-only path.
- Preserve active camera gestures across graph updates that do not structurally invalidate the interaction target. Do not null `panningCamera` for unrelated content updates.
- Keep Pixi app/layer ownership stable across normal graph updates.
- Split update handling only as far as the verified failures require: structural graph replacement versus content-only edge/label/camera-safe updates. Do not build future trajectory lanes in this slice.
- Preserve current debug snapshot compatibility where useful.

Verification expectation:

- Start narrow with renderer unit coverage for update lanes and retained edge/label behavior.
- Then run deterministic production Electron graph workflow tests with temporary app data.
- For performance-relevant changes, baseline first and write append-only before/after reports under `docs/reports/performance/`.
- Final broad gate for implementation commits remains `./scripts/format.sh` and `./check_quality.sh --all`.

Risks and followups:

- Branch 2 surface runtime files overlap with the current workspace layout/surface registry; importing them directly risks resurrecting stale ownership boundaries.
- Keep the first slice focused on update ownership and counters, not visual redesign.

### 8. Shared Agent Activity UI

Product intent:

- Share agent/run activity rendering between chat transcript, workflow details, and future trajectory details.

Source commits relative to cutoff:

- `2a0ad20fe` Share agent activity rendering in workflow details
- `0d63c5ae1` Add workflow graph activity sprite popovers
- related cleanup commits: `108db485e`, `5fbd51db2`

Branch 2 files touched:

- shared activity/detail components
- workflow activity sprite popovers
- chat/workflow detail presentation files

Current owners:

- `desktop/src/renderer/src/components/chat-run-activity.tsx`
- `desktop/src/renderer/src/components/chat-transcript-render-helpers.ts`
- `desktop/src/renderer/src/features/workspace-graph/workflow-node-details-surface.tsx`
- future trajectory sprite popover owner does not exist on this branch yet

Contracts and generated outputs:

- Presentation-only unless new activity fields are required.
- New fields must come from Go-owned chat/workflow/trajectory contracts.

Disposition:

- Keep later.
- Method: reimplement-clean after trajectory data shape is fixed.

Risks and followups:

- Avoid creating a generic activity abstraction that hides typed differences between chat, workflow, and trajectory sources.

### 9. Recording And Performance Tooling

Product intent:

- Preserve production-path evidence for graph state, pan/zoom liveness, recording incidents, visual parity, and performance guardrails.

Source commits relative to cutoff:

- `f47cc6757` Record workspace graph state in desktop sessions
- `bb460835f` Implement workflow graph recording incident reports
- `a420bbd1a` Implement workspace graph phase 8 verification gate
- related pan/zoom and phase-0 performance-report commits in the branch 2 range

Branch 2 files touched:

- `desktop/tests/electron/workflow-graph-*-recording*.mjs`
- `desktop/tests/electron/workflow-graph-pan-zoom-*.mjs`
- `desktop/tests/electron/workflow-graph-phase0-*.mjs`
- `desktop/tests/electron/workflow-graph-performance-recording.mjs`
- `scripts/dev_record_desktop_session.sh`
- `docs/reports/performance/workspace-graph-*.md`

Current owners:

- `desktop/tests/electron/electron-cdp-harness.mjs`
- `desktop/tests/electron/workflow-graph-smoke.test.mjs`
- `desktop/tests/electron/workflow-graph-scale-validation.test.mjs`
- `scripts/test_workflow_graph_visual.sh`
- `scripts/test_workflow_graph_scale_validation.sh`
- `docs/reports/performance/`

Contracts and generated outputs:

- Usually none, unless recording payloads become app contracts.

Disposition:

- Learn-only initially; keep targeted tooling that supports the first graph-surface/runtime slice.
- Method: reimplement-clean or adapt small helper diffs after current harness boundaries are checked.

Risks and followups:

- Do not port broad recording machinery before the first runtime counters are defined.
- Use current smoke/scale harnesses as the baseline and add narrowly scoped reports as implementation evidence.

## First Slice Contract

The next implementation slice should be graph-surface/runtime update ownership, with this minimum acceptance shape:

- Normal workflow/semantic activity updates do not recreate the Pixi app.
- Activity-only updates do not enter full graph replacement.
- Edge and label updates are retained or explicitly counted when rematerialized.
- Graph updates during camera gestures do not cancel camera pan/zoom unless the graph structurally invalidates the interaction target.
- Debug snapshots attribute update source and materialization cost.
- Production Electron coverage exercises workspace open, workflow graph display, camera pan/zoom, a workflow/semantic graph update, and counter assertions through main/preload/renderer paths.
- The slice does not add trajectory runtime or future trajectory render lanes; it only creates the measured surface behavior needed before trajectory work.

Trajectory runtime backend can follow once the renderer has bounded update lanes. Trajectory sprites/details should wait until both the backend contract and graph runtime lane exist.
