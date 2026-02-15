## 2026-02-18 23:13:49 PST

- Reviewed and consolidated findings from `review1.md`, `review2.md`, and `review3.md`.
- Fixed pre-merge reliability issues in transcription sessions:
  - auto transport now falls back only on realtime capability failures and fast-fails on auth/config errors
  - realtime engine init now closes connections on setup failure
  - session ownership checks now validate scope before removing sessions
  - base64 append payloads are size-guarded before decode
- Aligned dictation behavior to target modes:
  - realtime mode uses chunked streaming append
  - file mode captures full audio and uploads/transcribes once on stop
  - file mode no longer exposes misleading effective chunking semantics (`chunkMs` now `0` in file mode responses)
- Updated documentation to match session-based dictation routes and current transport behavior.
- Added/updated tests across backend unit/integration, frontend unit, and Playwright e2e to cover the above behavior.

## 2026-02-18 23:53:46 PST

- Implemented all actionable fixes from the top-level review docs, excluding any backward-compatibility work.
- Backend updates:
  - added traffic-independent transcription session pruning loop with startup/shutdown lifecycle wiring
  - validated `transcriptionLlmConfigId` during transcription profile create/update
  - mapped missing transcription profile start errors to clean `404` semantics
  - seeded `openai-whisper-1` default transcription profile with `transportMode=file`
- Frontend updates:
  - provider availability now requires both config support and API key presence
  - added optional provider-start notification suppression for `auto` mode fallback paths
  - extracted shared dictation mode metadata and provider transcription session handlers
  - changed file-mode provider dictation to stream append chunks during capture (no full-session in-memory merge)
  - improved provider startup error messaging to avoid permission-only phrasing for non-permission failures
  - updated chunk setting UX copy/behavior to reflect realtime-only chunk semantics
  - exported and adopted generated `ChatDictationMode` typing instead of repeated string-literal unions
- Added/updated backend unit/integration tests, frontend Vitest tests, and Playwright dictation e2e coverage for these changes; targeted suites passed.
