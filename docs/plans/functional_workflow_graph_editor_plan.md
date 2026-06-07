# Functional Workflow Graph Editor Plan

- **Date:** June 8, 2026
- **Status:** Phase 4 in progress; layout, workspace-file/null-workflow authoring, basic editor UX, diagnostic marker, selected-run node details, and explicit draft/run/version state slices complete; workflow-level configuration and deeper node-detail refinements remain
- **Scope:** Build the first usable workflow graph editor on top of workspace JSON workflow definitions containing `WorkflowDefinition.graph` and runtime `WorkflowGraphProjection` overlays.

## Direction

The editor should author workspace-saved workflow definitions. It must not treat a runtime projection, a Pixi-local mutable graph, or a global SQLite row as the durable product artifact.

Target authoring flow:

```text
Open Workflow Graph
  -> blank editable canvas when no workflow file is selected
  -> first graph edit materializes a workspace workflow definition file
  -> subsequent canvas interactions
  -> renderer draft of WorkflowDefinition.graph
  -> backend validation
  -> deterministic workspace JSON workflow file
  -> immutable SQLite workflow version snapshot when run
  -> run saved version
  -> overlay WorkflowGraphProjection state for the selected run
```

`WorkflowGraphProjection` is a derived read model for display. It may provide status, activity counts, pending approvals, errors, and edge activation state for a selected run. It is not the editable definition.

An empty graph is a valid draft/null workflow. The editor should render it as the normal editable canvas, not as a separate "create workflow" state. Creating a workflow file is a persistence consequence of the first real edit, such as adding a node or changing graph metadata. A null workflow may be saved as a deterministic workspace JSON definition, but starting a run still requires executable validation.

The Pixi graph is a rendering adapter. It may have positions, dimensions, colors, labels, hit targets, ports, and interaction state. Pixi-local mutations are not workflow edits until they update the renderer draft and save through the backend workflow definition API.

Manual node positions and collapsed/grouped editor state should be persisted as backend-owned editor metadata when they need to survive reload. That metadata must live in the Go-owned workflow graph or workflow editor contract, be saved in the workspace workflow file, be ignored by execution, and be regenerated into TypeScript. Do not maintain a renderer-only saved layout mirror.

## Definition Storage

Authored workflows live in the workspace under `.setta/workflows/` as deterministic JSON files. Current filenames use the workflow name slug and definition ID, for example `<slug>--<definition-id>.json`, so the file is stable, diffable, and reviewable in git.

The workspace workflow file should contain the authored definition data: name, description, graph nodes, graph edges, layout, validation-relevant config, and editor metadata that should travel with the project. It should not contain runtime events, node attempts, pending approvals, runner refs, or chat transcript data.

SQLite remains appropriate for runtime state and immutable snapshots. When a workflow starts, the backend captures the current workspace JSON definition into an immutable version snapshot so the run remains reproducible after the file changes.

Do not add migration, dual-read/write, fallback, import, old-field aliases, or compatibility behavior for old SQLite-authored definition rows. The authored-definition storage path has been replaced directly with workspace files.

## Visual Layers

Node visuals should keep four concerns separate:

- Node type: shape, icon, header, and accent treatment.
- Validation or definition state: diagnostic marker and inspector warnings for invalid drafts.
- Runtime state: border, badge, glow, progress, or animation for a selected run.
- Editor affordance: hover, selection outline, handles, context menus, and active port targets.

Validation state must not reuse runtime failure styling. A node can be an `Agent Task`, invalid in the draft, failed in a previous run, and selected in the editor at the same time. Those states need distinct visual channels.

Runtime states must not rely on color alone. Use a stable icon, badge, label, or shape treatment for states such as idle, ready, running, waiting approval, succeeded, failed, cancelled, and recovery-required.

## Initial Node Semantics

The first editor should expose AI agent and state-machine/control concepts without adding future runner types.

Initial user-facing nodes:

- `Agent Task`: compiles to an `action` node with `agent.codex` action config.
- `Route`: compiles to a typed gateway such as `gateway.xor` for one-of-many routing.
- `Merge`: pass-through control node for any incoming activation when that behavior is needed.
- `Barrier Join`: compiles to `gateway.and` semantics when all required incoming activations must arrive.
- `Start`: compiles to `start`.
- `End`: compiles to `end`.

Do not ship a stable wait-state `State` node until its backend execution semantics are explicit. A real state-machine wait state likely needs typed external signals, resume behavior, timeout policy, and restart recovery semantics. Until those semantics exist, state-machine behavior should be represented through explicit control nodes and typed transition conditions.

Future non-executable `Concept` and `Mindmap` nodes should remain out of the executable workflow editor until non-execution edge semantics are designed separately.

## Edge Semantics

Initial editor edges should mean directed control transitions:

```text
Node = executable step or control object
Edge = possible next activation
Condition = typed predicate that makes the edge eligible
Runtime token/event = evidence that the edge activated, completed, or was cancelled
```

Do not let one visible edge mean control transition, data flow, artifact reference, dependency, and knowledge association at the same time.

Data flow should be modeled through explicit input/output bindings, artifacts, variables, or structured outputs, not as the default meaning of a workflow edge. Non-executable reference or knowledge edges are future graph layers and should use distinct edge kinds and visual treatments when added.

Routing conditions must stay typed and backend-owned. Valid routing inputs include explicit status, signals, exit codes, approval result, and later validated structured output fields. Do not add arbitrary JavaScript, Python, expression strings, or prose-output heuristics for routing.

Default branches should be explicit in editor state and visible on the edge. A missing condition should not silently mean default unless the backend contract intentionally defines that behavior.

Join semantics must be visible. `Merge` means any incoming activation can continue. `Barrier Join` means all required incoming activations must arrive before continuing. If additional modes such as quorum joins are added later, they need explicit backend validation and visible labels.

## Virtual Ports

Ports are editor affordances, not a second durable graph contract.

The editor may expose deterministic virtual ports derived from the node kind, action kind, edge kind, and condition semantics. Dragging from a virtual port should create or update a real `WorkflowEdge` with a real `WorkflowCondition`.

Initial virtual port examples:

- `Agent Task`: `success`, `failure`, `default`, and typed `signal` outputs.
- `Route`: condition-labeled outputs plus an explicit `default` output.
- `Barrier Join`: incoming branch targets and a single joined output.
- `Start`: start output.
- `End`: no output.
- `Loop Guard`: later `continue` and `exit` outputs when loop editing is exposed.

Keep canonical port names small and stable. Do not allow near-duplicates such as `success`, `done`, `ok`, and `complete` to drift into separate semantics.

## Editor Interactions

Right-click canvas creation is useful, but it should not be the only creation path. The editor should also support a visible add control or command palette so node creation is discoverable.

Workspace workflow definitions should be listed in the left pane alongside conversations or in a sibling Workflows section. A user should be able to name a materialized workflow, select it later, and open the exact saved definition instead of relying on an implicit “latest workflow” projection.

Do not expose a "Create workflow" button just to allocate persistence. Opening the graph editor should show the canvas immediately. If no workflow file exists yet, the canvas represents the workspace's null workflow; the first graph edit creates the file automatically and the left pane lists it after that.

Initial canvas creation menu:

- `Agent Task`
- `Route`
- `Merge`
- `Barrier Join`
- `Start`
- `End`

Node details should be available from selection, double-click or Enter, and the node context menu. Right-click `View Details` is useful as a secondary entry point.

Details should open in an adjacent Niri pane instead of a modal when possible. The details surface should be type-specific:

- `Agent Task`: prompt, model, reasoning effort, approvals, activity/transcript references, final output, emitted signals, artifacts, and failure reason.
- `Route`: outgoing conditions, default branch, route explanation, and activation history.
- `Merge` or `Barrier Join`: incoming requirements, arrived activations, release history, and last activation.
- `Start` and `End`: minimal metadata and run participation.

The UI must make draft, saved version, and selected run explicit. If a user edits a draft after starting a run, the runtime overlay must remain pinned to the exact version that ran or show a clear version mismatch message.

## Completed First Slice

The first slice established backend-owned editor layout metadata and proved it through the existing renderer graph path:

- Add required layout metadata to the Go-owned workflow graph contract.
- Regenerate TypeScript contracts.
- Include layout in graph projection.
- Render projection nodes from persisted layout positions before falling back to automatic layout.
- Persist node moves through `updateDefinition` when the graph is showing a definition without a selected execution overlay.
- Keep layout warnings non-fatal because layout is editor metadata, not execution authority.

## Completed Storage Slice

- Added a workspace workflow file source of truth with deterministic JSON formatting.
- Listed workspace workflow definitions in the left pane and loaded the selected definition explicitly.
- Showed a blank editable canvas when no workflow file exists.
- Materialized a deterministic workspace workflow file on the first graph edit instead of requiring a separate create action.
- Treated an empty graph as a valid draft/null workflow while keeping executable validation at run start.
- Saved graph edits and layout edits to the workspace file through the backend workflow definition API.
- Captured immutable SQLite version snapshots when a workflow run starts.
- Removed global-SQLite authored-definition authority directly, without migration or compatibility paths.
- Proved the slice through deterministic Electron/main/preload/renderer/HTTP/store coverage for blank canvas, first-edit materialization, sidebar listing, durable node and edge edits, typed route ports, saved workspace JSON, and run-start snapshotting.

## Completed Basic Editor UX Slice

- Added a workflow graph toolbar with discoverable Add, Validate, Run, Draft, and Details controls.
- Added a toolbar add menu in addition to right-click canvas creation.
- Validated saved draft graphs through the backend workflow definition API and showed validation results in the editor.
- Started saved workflow definitions from the renderer, captured immutable SQLite version snapshots, and loaded the execution projection for the started run.
- Opened workflow node details in an adjacent Niri pane.
- Added basic Agent Task configuration in the details pane: title, prompt, model, reasoning effort, and fresh-conversation setting.
- Kept Agent Task details read-only when the pane is showing a run snapshot.
- Proved the slice through deterministic Electron/main/preload/renderer/HTTP/store coverage for toolbar add, node details, run start, and runtime projection updates.

## Completed Diagnostic Marker Slice

- Mapped backend validation diagnostics to affected draft nodes and edges.
- Rendered distinct Pixi node and edge diagnostic markers without confusing them with runtime failure state.
- Kept validation result panels as the summary/detail view while using local node and edge markers for graph context.
- Suppressed draft validation markers on run projections.
- Proved the slice through focused renderer projection tests and deterministic Electron workflow coverage for node and edge diagnostics.

## Completed Selected-Run Node Details Slice

- Opened node details from a selected run projection without reading mutable draft definitions.
- Passed run version, projection node status, and adjacent projection edge state into the details pane.
- Added basic type-specific draft details for Route, Merge, Barrier Join, Start, and End.
- Added selected-run inspection for run context, latest node execution, result status, emitted signals, file paths, JSON output, linked chat run activity, branch state, runtime tokens, and filtered workflow events.
- Proved the slice through focused renderer helper tests and deterministic Electron/main/preload/renderer/HTTP/store coverage that opens a completed run node and inspects its emitted signals, output, file paths, and activity.

## Completed Explicit Draft/Run/Version State Slice

- Added Go-owned projection metadata for graph view mode, editability, immutable version number, draft updated timestamp, draft/version match state, and version mismatch state.
- Regenerated the generated TypeScript contracts from the backend-owned workflow contract.
- Made the toolbar label editable drafts, selected runs, version snapshots, run/version IDs, and draft/version mismatch explicitly.
- Gated draft edits, validation, and run start on the backend projection's `editable` field instead of inferring read-only state only from execution IDs.
- Kept workflow event updates pinned to the selected run so runtime events do not pull the graph away from an explicitly selected draft.
- Exposed selected run/version and mismatch state in node details.
- Proved the slice through focused orchestrator projection tests, renderer projection and toolbar tests, and deterministic Electron workflow metadata coverage.

## Remaining Editor Slice

- Add first-class workflow-level naming and configuration controls.
- Refine node details beyond the first inspection slice where needed, including deeper route history, transcript presentation, and type-specific editing controls.

## Phase 4 Deliverables

Current status: partially complete. Storage, blank-canvas authoring, durable node and edge edits, typed route ports, workspace workflow listing/selection, immutable run snapshots, toolbar add/validate/run controls, validation result panels, node/edge-attached diagnostics, basic Agent Task editing, first-pass type-specific draft details, selected-run node inspection, and explicit draft/run/version state are implemented. The remaining deliverables are workflow-level configuration and deeper node-detail refinements.

- Name, list, open, edit, validate, save, and run workspace workflow definitions from the renderer.
- Render an empty editable canvas as the null workflow when no saved definition exists.
- Materialize a saved workspace definition on first graph edit, not through a separate create-workflow button.
- Maintain an editor draft using generated backend workflow types, not a hardcoded TypeScript mirror.
- Save authored graph data as deterministic workspace JSON, not as the long-term global SQLite source of truth.
- Add backend-owned editor layout metadata when manual node positions need to persist, then regenerate generated TypeScript outputs.
- Render the authored graph and overlay runtime `WorkflowGraphProjection` state for the selected run.
- Keep projection state read-only; do not infer durable graph edits from projection-only fields such as node status, execution count, pending approval, or edge status.
- Add nodes from canvas context menu and a discoverable add surface.
- Support initial node types: `Agent Task`, `Route`, `Merge`, `Barrier Join`, `Start`, and `End`.
- Defer stable wait-state `State`, executable-code, `Concept`, and `Mindmap` nodes until their backend semantics are explicitly designed.
- Draw directed control-transition edges that save as real `WorkflowEdge` records.
- Show compact edge labels for typed conditions, default branches, and failure/status/signal routes.
- Expose deterministic virtual ports that compile down to `WorkflowEdge.Kind` and `WorkflowCondition`.
- Open type-specific node details in an adjacent Niri pane.
- Show backend validation diagnostics on affected nodes and edges without confusing them with runtime failures.
- Make draft, saved version, and selected run/version explicit in the UI.

## Guardrails

- The editor must save through backend workflow definition APIs backed by workspace JSON files; Pixi-local node and edge arrays are rendering state only.
- Do not make global SQLite the long-term source of truth for authored workflow definitions.
- Do not expose storage allocation as a primary UX action. A blank canvas is a valid draft/null workflow, and first edit should create the backing file automatically.
- Do not require executable validation for saving draft workflow files. Run/start may fail validation; save should preserve user drafts.
- Route only from typed backend-owned predicates: status, signal, exit code, approval result, and later validated structured output fields.
- Do not add arbitrary JavaScript, Python, expression strings, keyword heuristics, or prose-output routing.
- Do not introduce non-Codex runners as part of this editor phase.
- Do not make ports a hidden durable contract; ports must be regenerated from saved node and edge semantics.
- Do not mix execution edges, data-flow edges, artifact references, and knowledge links in one visual edge layer.
- Do not ship join behavior unless the UI distinguishes `Merge` from `Barrier Join`.

## Acceptance Criteria

- Complete: opening Workflow Graph in a workspace with no workflow files shows a blank editable canvas, not a create button or "no workflow graph" dead end.
- Complete: adding the first node to the blank canvas creates a deterministic workspace JSON definition and lists it in the left pane.
- Complete: a user can see existing workspace workflows in the left pane, select one, and reopen that exact definition.
- Complete: a user can create a control-flow workflow with `Route`, explicit default routing, and `Merge` or `Barrier Join` semantics that validate through the backend and expose basic type-specific draft details.
- Complete: dragging a connection creates a durable `WorkflowEdge` and condition, not only a Pixi line.
- Complete: moving nodes persists via backend-owned layout metadata when persistence is enabled.
- Complete: the toolbar provides a discoverable add surface in addition to right-click canvas creation.
- Complete: a user can run a saved workflow from the renderer and see the started run projection on the graph.
- Complete: a user can create an `Agent Task` workflow from the canvas, configure basic Agent Task prompt/model settings in a Niri details pane, save it as a workspace JSON definition, run an immutable snapshot through the workflow API, inspect runtime status on the graph, and inspect selected-run node execution, output, emitted signals, file paths, and linked activity.
- Complete: validation diagnostics appear in the editor before run, and affected draft nodes and edges show local diagnostic markers.
- Complete: runtime overlays are loaded from the exact workflow version that ran, the UI blocks editing while viewing read-only projections, and saved version, selected run/version, and version mismatch state are explicit.
- Partial: node details panes can inspect and edit authored Agent Task config, inspect basic non-Agent node details, and inspect selected-run activity without hiding the graph; deeper route history, transcript presentation, and type-specific editing controls remain.
