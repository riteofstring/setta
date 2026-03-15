## 2026-03-15 Assistant Activity Card Harness Check

- Slice: extract the assistant activity card shell, timeline row rendering, open-all coordination, and activity-item copy wiring from `frontend/src/components/Chat/ChatMessages.tsx` into `frontend/src/components/Chat/chatAssistantActivityCard.tsx`, with shared clipboard notifications in `frontend/src/components/Chat/chatCopyText.ts`
- App context: verified through a same-origin harness on `http://127.0.0.1:3002` because the normal app shell was already blank from the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing)
- Surface exercised: grouped assistant activity-only run merged with a trailing assistant bubble, then expanded through `ChatMessageList`
- Before refactor:
  - collapsed harness DOM node count: `122`
  - expanded harness DOM node count: `130`
  - expanded activity subtree node count: `46`
  - grouped activity card still rendered the trailing assistant bubble text and both action plus thought rows
- After refactor:
  - collapsed harness DOM node count: `122`
  - expanded harness DOM node count: `130`
  - expanded activity subtree node count: `46`
  - grouped activity card still rendered the trailing assistant bubble text and both action plus thought rows
- Artifacts:
  - `perf/reports/frontend/chat-assistant-activity-card-2026-03-15.png`
- Perf note: the ownership split held the same structural footprint in the representative grouped-activity harness while removing the duplicated activity-card shell and most of the timeline-row rendering from `ChatMessages.tsx`
