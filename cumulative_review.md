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
