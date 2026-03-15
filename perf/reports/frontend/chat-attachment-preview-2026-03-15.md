## 2026-03-15 Attachment Preview Harness Check

- Slice: extract attachment URL lookup/caching and attachment preview rendering from `frontend/src/components/Chat/ChatMessages.tsx` into `frontend/src/components/Chat/chatAttachmentPreviewUrls.ts` plus `frontend/src/components/Chat/chatAttachmentPreviews.tsx`
- App context: verified through a same-origin harness on `http://127.0.0.1:3002` because the normal app shell was already blank from the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing)
- Surface exercised: `ChatMessageList` with a single archive attachment, opening the attachment preview dialog from the message bubble
- Before refactor:
  - attachment trigger rendered with the expected `release-bundle.zip` label
  - opened preview dialog showed `Archive preview not available.`
  - open-dialog harness DOM node count: `83`
- After refactor:
  - attachment trigger rendered with the same `release-bundle.zip` label
  - opened preview dialog still showed `Archive preview not available.`
  - open-dialog harness DOM node count: `82`
- Artifacts:
  - `perf/reports/frontend/chat-attachment-preview-open-2026-03-15.png`
- Perf note: no meaningful regression was observed in the attachment preview flow; the open-dialog structural footprint stayed effectively flat while the ownership split removed attachment state and preview branching from `ChatMessages.tsx`
