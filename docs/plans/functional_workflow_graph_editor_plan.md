# Functional Workflow Graph Editor Plan

- **Date:** June 8, 2026
- **Status:** Phase 4 direction; first implementation slice started
- **Scope:** Build the first usable workflow graph editor on top of saved `WorkflowDefinition.graph` definitions and runtime `WorkflowGraphProjection` overlays.

## Direction

The editor should author saved workflow definitions. It must not treat a runtime projection or a Pixi-local mutable graph as the durable product artifact.

Target authoring flow:

```text
Canvas interaction
  -> renderer draft of WorkflowDefinition.graph
  -> backend validation
  -> createDefinition or updateDefinition
  -> immutable workflow version
  -> run saved version
  -> overlay WorkflowGraphProjection state for the selected run
```

`WorkflowGraphProjection` is a derived read model for display. It may provide status, activity counts, pending approvals, errors, and edge activation state for a selected run. It is not the editable definition.

The Pixi graph is a rendering adapter. It may have positions, dimensions, colors, labels, hit targets, ports, and interaction state. Pixi-local mutations are not workflow edits until they update the renderer draft and save through the backend definition API.

Manual node positions and collapsed/grouped editor state should be persisted as backend-owned editor metadata when they need to survive reload. That metadata must live in a Go-owned workflow graph or workflow editor contract, be ignored by execution, and be regenerated into TypeScript. Do not maintain a renderer-only saved layout mirror.

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

## First Slice

The first slice establishes backend-owned editor layout metadata and proves it through the existing renderer graph path:

- Add required layout metadata to the Go-owned workflow graph contract.
- Regenerate TypeScript contracts.
- Include layout in graph projection.
- Render projection nodes from persisted layout positions before falling back to automatic layout.
- Persist node moves through `updateDefinition` when the graph is showing a definition without a selected execution overlay.
- Keep layout warnings non-fatal because layout is editor metadata, not execution authority.

## Phase 4 Deliverables

- Create, open, edit, validate, save, and run workflow definitions from the renderer.
- Maintain an editor draft using generated backend workflow types, not a hardcoded TypeScript mirror.
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

- The editor must save through `createDefinition` and `updateDefinition`; Pixi-local node and edge arrays are rendering state only.
- Route only from typed backend-owned predicates: status, signal, exit code, approval result, and later validated structured output fields.
- Do not add arbitrary JavaScript, Python, expression strings, keyword heuristics, or prose-output routing.
- Do not introduce non-Codex runners as part of this editor phase.
- Do not make ports a hidden durable contract; ports must be regenerated from saved node and edge semantics.
- Do not mix execution edges, data-flow edges, artifact references, and knowledge links in one visual edge layer.
- Do not ship join behavior unless the UI distinguishes `Merge` from `Barrier Join`.

## Acceptance Criteria

- A user can create an `Agent Task` workflow, configure its Codex prompt, save it as a definition, run the saved version, and inspect runtime status on the graph.
- A user can create a control-flow workflow with `Route`, explicit default routing, and `Merge` or `Barrier Join` semantics that validate through the backend.
- Dragging a connection creates a durable `WorkflowEdge` and condition, not only a Pixi line.
- Moving nodes persists via backend-owned layout metadata when persistence is enabled.
- Validation diagnostics appear on invalid draft nodes or edges before save.
- Runtime overlays are pinned to the exact workflow version that ran; draft edits after run start do not silently change the displayed execution graph.
- Node details panes can inspect authored config and selected-run activity without hiding the graph.
