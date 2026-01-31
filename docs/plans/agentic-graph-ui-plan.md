# Agentic graph UI plan (sections + edges)

This plan introduces an agentic graph overlay that reuses Setta's existing
sections canvas, but adds a separate agentic edge layer so we avoid the
codegen/dependency edge constraints.

## Goals
- Reuse sections as context/input/output nodes for agentic runs.
- Add agentic context edges stored separately from codegen edges.
- Visually highlight active sections/edges during runs (AIFollow-driven).
- Make the graph UI the primary surface for run-chain authoring, step editing,
  and trace viewing (no standalone run-chain UI).
- Keep chat stream UX intact; this is additive.

## Non-goals
- Replacing the existing dependency graph or codegen semantics.
- Building a full new workflow editor; use existing canvas primitives.
- Forcing agentic runs to be canvas-based (Project Chat stays valid).

## Current code constraints (Jan 2026)
- `Edge` is a port/param connection; validation enforces
  `BaseSectionWithParamsImpl`, and codegen applies every edge in
  `projectConfig.edges`.
- `edge.type` is a free-form string used only for XYFlow rendering (no enum).
- Edge rendering relies on handle positions; Chat sections do not expose handles.
- AIFollow only drives section ids today (codeObj ids are tracked but unused).

## Concepts
- **Agentic context edge**: a lightweight link from a Chat section (or Project
  Chat) to any section that should be included as context for that run.
- **Active path**: sections/edges highlighted when a run is executing or when a
  tool call references them.
- **Agentic edge layer**: UI affordances layered on the canvas, stored outside
  `projectConfig.edges`.
- **Run chain panel**: a graph-adjacent editor for `RunChainSpec` that launches
  multi-step runs and exposes step-level trace.

## Data model additions
- Add a new model (e.g., `AgenticContextEdge`) with section-level endpoints only
  (no port ids). Suggested fields: `id`, `sourceSectionId`, `targetSectionId`,
  optional `chatId`/`runId`, plus `style`, `hidden`, `zIndex` as needed.
- Store these edges separately from `ProjectConfig.edges` (e.g.,
  `ProjectConfig.agenticEdges` or `ProjectConfig.agenticContextEdges`).
- Provide helpers + routes to create/update/delete agentic edges without touching
  codegen edge validation.
- Optionally denormalize per-chat selection on `ChatSectionImpl`
  (`contextSectionIds`) for fast lookup; source of truth stays in the agentic
  edge list.

## UI behavior
- Canvas: render agentic edges in a dedicated layer using section bounds/centers
  (not edge handles), with distinct styling (dashed/tinted).
- On run start (`ChatSectionImpl.waitingForResponse` or `AgentRunStatus.running`):
  highlight context edges from that chat.
- On tool calls/AIFollow updates: highlight referenced nodes and any agentic
  edges that touch those nodes (tool-args vs tool-result styling if desired).
- Run status badge on Chat section header (running/failed/completed) opens the
  run history/trace panel.

## AIFollow integration
- Use existing AIFollow updates (section ids) to set active section state.
- Derive active agentic edges by matching AIFollow section ids against
  `agenticEdges` (no codegen edge involvement).

## Functional flow (managed chat)
1) User selects context sections for a Chat section (UI toggle or edge creation).
2) Context edges are stored in the agentic edge list.
3) When a run starts, context edges are highlighted.
4) Run events + AIFollow updates drive active highlights.

## Functional flow (project chat)
- Project Chat has no canvas node; still allow a context selector in the
  Project-level AI UI and store edges using a `chatId`/`sourceSectionId` mapping
  (no edge rendering unless a section node exists).

## Functional flow (external agent run)
- Same as managed chat; event stream still maps into AgentRuns and AIFollow.
- If the run has no `sectionId`, fall back to project chat behavior (no source
  node).

## Implementation phases
### Phase A: Data model + storage
- Introduce `AgenticContextEdge` model + new project config field.
- Add helpers + routes for CRUD of agentic edges.
- If run chain launches should highlight a chat section, pass `sectionId` through
  chain inputs (either include in `_CHAIN_INPUT_KEYS` or set on each step).

### Phase B: UI creation + selection
- Add canvas affordance to draw/remove agentic edges (e.g., context handle on
  Chat sections or a context mode toggle).
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
- Should agentic context be keyed by chat section id or chat id (for Project Chat)?
- Should context selection be auto-derived from prior tool usage?
- How to visualize context for Project Chat in the canvas (if at all)?

## Compatibility notes
- This plan is additive and does not conflict with existing agentic work.
- Key guardrail: keep agentic edges out of codegen dependency logic.
