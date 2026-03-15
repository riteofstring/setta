# Project Chat History View Model

Date: `2026-03-15`
Slice: `ProjectChatHistory` grouped-history view-model extraction

## Context

- CDP verification used a same-origin harness on `http://127.0.0.1:3002`.
- The normal app shell was still blank because of the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing), so the harness imported `ProjectChatHistory` directly and seeded grouped project-chat history state.

## Before

- Unfiltered harness (`420x760` surface, 2 groups, 5 thread rows):
  - group rows: `2`
  - rendered thread entries: `5`
  - ungrouped section visible: `true`
  - history-panel node count: `209`

## After

- Unfiltered harness (`420x760` surface, same seeded history):
  - group rows: `2`
  - rendered thread entries: `5`
  - ungrouped section visible: `true`
  - history-panel node count: `209`
- Filtered harness after entering `deploy` in the master search:
  - visible group rows: `2`
  - rendered thread entries: `2`
  - counter text: `1/2`
  - filtered history-panel node count: `149`
- Screenshots:
  - `perf/reports/frontend/project-chat-history-view-model-after-2026-03-15.png`

## Result

- The extracted `projectChatHistoryViewModel.ts` owner preserved the same grouped, pinned, and ungrouped history structure in the harness while moving search filtering, match counts, thread ordering, badge labels, and placeholder text out of `ProjectChatHistory.tsx`.
- No DOM inflation showed up at the unfiltered checkpoint after the extraction: the seeded history stayed at `209` panel nodes with the same two group rows and five visible thread entries.
- The post-extraction search checkpoint still rendered both matching conversations with the expected `1/2` navigation counter and no empty-state regression.
