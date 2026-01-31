# Agentic graph UI plan (sections + edges)

This plan introduces an agent-centric graph overlay where Chat sections are the
primary nodes (each Chat section represents an agent). We reuse the existing
sections canvas but add a separate agentic edge layer so we avoid the
codegen/dependency edge constraints.

## Goals
- Treat Chat sections as agents and make them the center of the agentic graph.
- Add agentic edges stored separately from codegen edges.
- Support agent-to-agent links (Chat ↔ Chat), prompt-to-agent links
  (Prompt → Chat), and agent-to-section scope links (Chat → Section).
- Visually highlight active sections/edges during runs (AIFollow-driven).
- Keep chat stream UX intact; this is additive.

## Non-goals
- Replacing the existing dependency graph or codegen semantics.
- Building a full new workflow editor; use existing canvas primitives.
- Forcing agentic runs to be canvas-based (Project Chat stays valid).
- Implementing auto-relay or advanced agent orchestration policies yet.

## Current code constraints (Jan 2026)
- `Edge` is a port/param connection; validation enforces
  `BaseSectionWithParamsImpl`, and codegen applies every edge in
  `projectConfig.edges`.
- `edge.type` is a free-form string used only for XYFlow rendering (no enum).
- Edge rendering relies on handle positions; Chat sections do not expose handles.
- AIFollow only drives section ids today (codeObj ids are tracked but unused).

## Concepts
- **Agent node**: a Chat section that represents an agent.
- **Agentic edge**: a lightweight link between sections that defines agent
  context or scope (not a codegen dependency).
- **Chat ↔ Chat edge**: agent-to-agent communication or sub-agent relationship.
- **Prompt → Chat edge**: prompt sources that seed or constrain a chat agent.
- **Chat → Section edge**: scope bounds for what the agent can read/use.
- **Active path**: sections/edges highlighted when a run is executing or when a
  tool call references them.
- **Agentic edge layer**: UI affordances layered on the canvas, stored outside
  `projectConfig.edges`.

## Data model additions
- Add a new model (e.g., `AgenticEdge`) with section-level endpoints only
  (no port ids). Suggested fields: `id`, `sourceSectionId`, `targetSectionId`,
  `kind` (chat-chat | prompt-chat | chat-section), plus `style`, `hidden`,
  `zIndex` as needed.
- Store these edges separately from `ProjectConfig.edges` (e.g.,
  `ProjectConfig.agenticEdges`).
- Provide helpers + routes to create/update/delete agentic edges without touching
  codegen edge validation.
- Optional denormalized fields on `ChatSectionImpl` (e.g., `contextSectionIds`,
  `promptSectionIds`, `linkedChatIds`) if needed for quick lookup; source of truth
  stays in the agentic edge list.

## UI behavior
- Canvas: render agentic edges in a dedicated layer using section bounds/centers
  (not edge handles), with distinct styling per `kind`.
- On run start (`ChatSectionImpl.waitingForResponse` or `AgentRunStatus.running`):
  highlight edges that emanate from the running Chat section.
- On tool calls/AIFollow updates: highlight referenced nodes and any agentic
  edges that touch those nodes (tool-args vs tool-result styling if desired).

## AIFollow integration
- Use existing AIFollow updates (section ids) to set active section state.
- Derive active agentic edges by matching AIFollow section ids against
  `agenticEdges` (no codegen edge involvement).

## Functional flow (managed chat)
1) User connects a Chat section to prompts/agents/sections via agentic edges.
2) Agentic edges are stored in the agentic edge list.
3) When a run starts, edges originating from that Chat section are highlighted.
4) Run events + AIFollow updates drive active highlights.

## Functional flow (project chat)
- Project Chat has no canvas node; still allow a context selector in the
  Project-level AI UI and store edges using a `chatId` mapping (no edge
  rendering unless a section node exists).

## Functional flow (external agent run)
- Same as managed chat; event stream still maps into AgentRuns and AIFollow.
- If the run has no `sectionId`, fall back to project chat behavior (no source
  node).

## Implementation phases
### Phase A: Data model + storage
- Introduce `AgenticEdge` model + new project config field.
- Add helpers + routes for CRUD of agentic edges.
- If run chain launches should highlight a chat section, pass `sectionId` through
  chain inputs (either include in `_CHAIN_INPUT_KEYS` or set on each step).

### Phase B: UI creation + selection
- Add canvas affordance to draw/remove agentic edges (e.g., agent edge handle on
  Chat sections or a context mode toggle).
- Add a “Context/Links” selector in Chat settings that creates agentic edges.

### Phase C: Active path visualization
- Highlight agentic edges on run start/stop.
- Highlight nodes + edges on AIFollow updates.

## Open questions
- Do we need explicit edge `kind`, or infer it from section types?
- Should agent links be scoped by chat section id or chat id (for Project Chat)?
- Should any agentic edges be auto-derived from tool usage?
- How to visualize Project Chat context on the canvas (if at all)?

## Compatibility notes
- This plan is additive and does not conflict with existing agentic work.
- Key guardrail: keep agentic edges out of codegen dependency logic.
