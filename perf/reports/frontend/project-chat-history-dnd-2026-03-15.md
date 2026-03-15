# Project Chat History DnD

Date: `2026-03-15`
Slice: `ProjectChatHistory` drag-and-drop id, pointer, and reorder extraction

## Context

- CDP verification used a same-origin harness on `http://127.0.0.1:3002`.
- The normal app shell was still blank because of the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing), so the harness kept `ProjectChatHistory` mounted directly and re-seeded project chat state after the refactor.

## Before

- Unfiltered harness (`420x760` surface, 2 groups, 5 thread rows):
  - group rows: `2`
  - rendered thread entries: `5`
  - ungrouped section visible: `true`
  - history-panel node count: `210`
- Screenshot:
  - `perf/reports/frontend/project-chat-history-dnd-before-2026-03-15.png`

## After

- Unfiltered harness (`420x760` surface, same seeded history):
  - group rows: `2`
  - rendered thread entries: `5`
  - ungrouped section visible: `true`
  - history-panel node count: `211`
- Screenshot:
  - `perf/reports/frontend/project-chat-history-dnd-after-2026-03-15.png`

## Result

- The extracted `projectChatHistoryDnd.ts` owner preserved the seeded grouped-history structure and visible thread order while moving DnD ids, pointer-location helpers, drop-target resolution, and reorder math out of `ProjectChatHistory.tsx`.
- The harness stayed effectively flat after the extraction: the seeded history still rendered the same `2` group rows, `5` thread entries, and visible ungrouped section, with only a one-node delta in the panel subtree.
