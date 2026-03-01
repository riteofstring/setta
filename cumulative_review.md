## 2026-03-04 20:10:12 PST

- Fixed custom skill upsert path isolation so `skillId` updates no longer depend on default root creation and now stay within controlled error translation.
- Fixed raw SKILL markdown editor state to preserve empty string drafts and allow saving intentionally empty `SKILL.md`.
- Fixed custom slash command submit flow to preserve attachments for transformed custom prompt messages.
- Removed legacy runtime overview tab branches for deprecated `BackendLogs`/`ProjectAISettings` paths and kept canonical tab behavior.
- Updated UI setting registry/reveal expectations from `ProjectAISettings` to `ProjectAIChat`.
- Added/updated backend, Vitest, and Playwright tests for these regressions and behavior guarantees.
- Ran `pnpm -C frontend gcf`.
