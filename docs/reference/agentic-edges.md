# Agentic Edges

Agentic edges provide a lightweight, non-codegen link layer between sections so
chat agents can express context, scope, and peer relationships without affecting
`ProjectConfig.edges` or dependency validation.

## Edge kinds
- `chat_chat`: links one Chat section to another (agent-to-agent).
- `section_chat`: links a non-Chat section into a Chat section (context source).
- `chat_section`: links a Chat section to a non-Chat section (scope boundary).

## Data model
Agentic edges live on `ProjectConfig.agenticEdges` and use the `AgenticEdge`
model (`backend/setta/types/agentic_edges.py`):
- `id`: edge id.
- `sourceSectionId` / `targetSectionId`: section endpoints (no port ids).
- `kind`: one of the edge kinds above.
- `contextMode`: defaults to `reference_only` (reserved for future modes).
- `style`, `hidden`, `zIndex`, `selected`: UI-only rendering metadata.

## Persistence + validation
- Stored alongside the project config and remapped when duplicating configs.
- Deleted automatically when either endpoint section is removed.
- Validation enforces that `chat_chat` edges connect Chat sections, and that
  `section_chat` or `chat_section` edges connect to a Chat section on the
  appropriate side.

## Routes
CRUD uses the same optimistic update flow as codegen edges:
- `Route.CREATE_AGENTIC_EDGE`
- `Route.UPDATE_AGENTIC_EDGE`
- `Route.DELETE_AGENTIC_EDGES`
- `Route.SET_AGENTIC_EDGES`

## UI behavior
- Sections expose agentic handles on the left/right edges for drag links; valid
  connections require a Chat section endpoint.
- Chat settings include a Context & Links panel to add context sources, scope
  sections, and linked agents.
- Agentic edges render in a dedicated overlay layer above codegen edges.
- Selection + delete uses the same shortcuts as standard edges.

## AIFollow + run highlights
- AIFollow tool argument/result ids highlight any agentic edges that touch the
  referenced sections.
- When a Chat section is streaming (`waitingForResponse`), its outbound agentic
  edges receive a run highlight.

## Share mode
Agentic edge edits are treated as structural changes and are blocked in share
mode (structural edits remain IDE-only).
