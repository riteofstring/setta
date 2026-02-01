# Agentic graph UI plan (sections + edges)

This plan introduces an agentic graph overlay that reuses Setta's existing
sections + edges canvas for agentic context and run visualization without
conflicting with codegen dependency edges.

## Goals
- Reuse sections as context/input/output nodes for agentic runs.
- Add a new edge type for agentic context/flow that does not affect codegen.
- Visually highlight active sections/edges during runs (AIFollow-driven).
- Make the graph UI the primary surface for run-chain authoring, step editing,
  and trace viewing (no standalone run-chain UI).
- Keep chat stream UX intact; this is additive.

## Non-goals
- Replacing the existing dependency graph or codegen semantics.
- Building a full new workflow editor; use existing canvas primitives.
- Forcing agentic runs to be canvas-based (Project Chat stays valid).

## Concepts
- **Agentic context edge**: a lightweight link from a Chat (or Agent Run) section
  to any section that should be included as context for that run.
- **Active path**: sections/edges highlighted when a run is executing or when a
  tool call references them.
- **Agentic graph overlay**: UI affordances layered on the canvas, not stored as
  codegen dependencies.
- **Run chain panel**: a graph-adjacent editor for `RunChainSpec` that launches
  multi-step runs and exposes step-level trace.

## Data model additions
- Add a new edge type enum value, e.g. `EdgeType.AgenticContext`.
- Store these edges in project state alongside existing edges, but ensure
  codegen/dependency export ignores this edge type.
- Optionally persist per-chat context selection on `ChatSectionImpl` for quick
  access (mirror edges for UI; edges are source of truth).

## UI behavior
- Canvas: draw agentic edges with distinct styling (dashed or tinted).
- On run start: highlight edges from the active Chat section to context nodes.
- On tool calls/AIFollow updates: highlight referenced nodes + inbound edges.
- Run status badge on Chat section (running/failed/completed) that opens the
  graph run panel (history + trace + chain steps).

## AIFollow integration
- Use existing AIFollow updates to set “active” state on sections.
- Extend AIFollow handling to derive active edges from highlighted nodes.

## Functional flow (managed chat)
1) User selects context sections for a Chat section (UI toggle or edge creation).
2) Context edges are stored as `EdgeType.AgenticContext`.
3) When a run starts, context edges are highlighted.
4) Run events update active highlights via AIFollow and stream state.

## Functional flow (external agent run)
- Same as managed chat; event stream still maps into AgentRuns and AIFollow.

## Implementation phases
### Phase A: Data model + storage
- Add `EdgeType.AgenticContext` and ensure codegen ignores it.
- Add helpers to create/remove/list agentic edges.

### Phase B: UI creation + selection
- Add canvas affordance to draw/remove agentic edges.
- Add a “Context” selector in Chat settings that creates edges.

### Phase C: Active path visualization
- Highlight agentic edges on run start/stop.
- Highlight nodes + edges on AIFollow updates.

### Phase D: Run badge + trace entry point
- Add run-status badge to Chat section header; open run history/trace panel.

### Phase E: Run chain authoring + trace
- Add a Run Chain editor that builds `RunChainSpec` and launches runs.
- Support step-level replay/inspect using the existing AgentRun event stream.
- Show cross-tool trace (Setta + external) in the same panel.

## Open questions
- Should agentic edges be per-project or per-chat (default per-chat)?
- Should context selection be auto-derived from prior tool usage?
- How to handle context edges for Project Chat (non-canvas)?

## Compatibility notes
- This plan is additive and does not conflict with existing agentic work.
- Key guardrail: never treat agentic edges as codegen dependencies.
