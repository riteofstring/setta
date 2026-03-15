## 2026-03-15 Structured Output Harness Check

- Slice: extract structured output payload inference and resizable rendering from `frontend/src/components/Chat/ChatMessages.tsx` into `frontend/src/components/Chat/chatStructuredOutput.tsx`
- App context: verified through a same-origin harness on `http://127.0.0.1:3002` because the normal app shell was already blank from the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing)
- Surface exercised: expanded assistant activity action row with diff-style input and output payloads rendered through `ChatMessageList`
- Output pane resize observations on a `772px` viewport:
  - minimum drag clamp reached `90px`
  - near-max drag clamp reached `617px`
  - no content bleed, duplicate resize handles, or obvious overlap was visible at either size
- Artifacts:
  - `perf/reports/frontend/chat-structured-output-min-2026-03-15.png`
  - `perf/reports/frontend/chat-structured-output-max-2026-03-15.png`
- Perf note: no before/after trace was recorded because this slice was a behavior-preserving ownership extraction with no intended render-path change
