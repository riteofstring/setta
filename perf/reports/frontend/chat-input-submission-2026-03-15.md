# ChatInput Submission Harness

- Date: `2026-03-15`
- Slice: `ChatInput` slash-command submission and queued-draft replay extraction
- Harness: same-origin `ChatInput` render harness on `http://127.0.0.1:3002`
- Why harness: the normal app shell is still blank because the unrelated
  `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate`
  export missing) prevents the main page from booting

## Before

- Initial render:
  - `49` harness DOM nodes
  - runtime activity footer visible
- Slash suggestion check:
  - typed `/app-j`
  - `/app-json` suggestion rendered
  - `49` harness DOM nodes
  - `1` visible suggestion button
  - `0` queued drafts
- Queued draft check:
  - typed `/app-json dashboard for support ops`
  - pressed `Enter` while `waitingForResponse` stayed `true`
  - `58` harness DOM nodes
  - `1` queued draft row
  - queued draft text: `1Queued/app-json dashboard for support ops`
- Screenshot:
  - `perf/reports/frontend/chat-input-submission-before-2026-03-15.png`

## After

- Initial render:
  - `49` harness DOM nodes
  - runtime activity footer still visible
- Slash suggestion check:
  - typed `/app-j`
  - `/app-json` suggestion still rendered
  - `49` harness DOM nodes
  - `1` visible suggestion button
  - `0` queued drafts
- Queued draft check:
  - typed `/app-json dashboard for support ops`
  - pressed `Enter` while `waitingForResponse` stayed `true`
  - `58` harness DOM nodes
  - `1` queued draft row
  - queued draft text: `1Queued/app-json dashboard for support ops`
- Screenshot:
  - `perf/reports/frontend/chat-input-submission-after-2026-03-15.png`

## Notes

- The extraction moved slash-command parsing, queued-draft replay snapshots,
  replay signatures, and submit or replay dispatch into
  `components/Chat/chatInputSubmission.ts`.
- The harness footprint stayed flat before and after the refactor, so the
  ownership split did not add DOM or surface-level interaction overhead in the
  exercised slash-suggestion or queued-draft paths.
