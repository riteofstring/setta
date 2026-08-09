# Edge Styles

This page is the source-of-truth summary for how canvas edges look in the UI
today and what those visuals mean.

## Edge families

### Codegen/data edges

- Visual: thin gray line.
- Meaning: standard `ProjectConfig.edges` dataflow/codegen wiring.
- Source of truth:
  - `frontend/src/forks/xyflow/core/components/Edges/BaseEdge.tsx`
  - `frontend/src/forks/xyflow/core/styles/style.css`

These standard section/param wiring edges are distinct from both agentic edges
and workflow edges.

### Agentic edges

- Visual: dashed blue line.
- Meaning: `ProjectConfig.agenticEdges` chat-scope/context links.
- Source of truth:
  - `frontend/src/forks/xyflow/core/container/AgenticEdgeRenderer.tsx`
  - `frontend/src/forks/xyflow/core/styles/style.css`

Agentic edges currently have three semantic kinds:

- `chat_chat`: chat-to-chat linked agent relationship.
- `section_chat`: non-chat section into a chat as a context source.
- `chat_section`: chat into a non-chat section as a scope/output boundary.

Those three kinds all use the same dashed blue family styling.

### Workflow edges

- Visual: solid amber line.
- Meaning: `ProjectConfig.stateMachineEdges` workflow/state-machine control-flow.
- Source of truth:
  - `frontend/src/forks/xyflow/core/container/StateMachineEdgeRenderer.tsx`
  - `frontend/src/forks/xyflow/core/styles/style.css`

Workflow edges share the same styling for details like `send_prompt`,
`reset_thread`, or `signal` filters. The visual only answers the high-level
question: "is this a workflow edge?"

## Overlay states

These states can modify the base family styling.

### Selected workflow edge

- Visual: brighter/thicker orange workflow edge with a small glow.
- Meaning: the workflow edge is selected in the editor.

### Selected agentic edge

- Visual: brighter/thicker blue dashed edge with a small glow.
- Meaning: the agentic edge is selected in the editor.

### Missing agentic edge

- Visual: red dashed glowing line.
- Meaning: a scope/access relationship is missing and the UI is showing a
  non-persisted warning edge.

This is not a real saved edge in `ProjectConfig.agenticEdges`. It is a visual
warning overlay produced by the agentic scope violation logic.

### Running agentic edge

- Visual: thicker/glowing dashed blue line.
- Meaning: the source chat section is actively running or streaming.

## What is not visually encoded

The following semantic details are not intentionally encoded into different edge
styles:

- workflow target action type (`send_prompt`, `reset_thread`, future actions)
- workflow source filter type (`run_completed`, `signal`, future filters)
- which agentic kind the edge is (`chat_chat`, `section_chat`, `chat_section`)

Those distinctions live in the data model and inspector UI, not in the edge
stroke pattern.

## Related docs

- `docs/reference/agentic-edges.md`
- `docs/reference/chat-sections.md`
- `docs/reference/state-machine-workflows.md`
