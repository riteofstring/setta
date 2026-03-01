## 2026-03-04 20:10:12 PST

- Fixed custom skill upsert path isolation so `skillId` updates no longer depend on default root creation and now stay within controlled error translation.
- Fixed raw SKILL markdown editor state to preserve empty string drafts and allow saving intentionally empty `SKILL.md`.
- Fixed custom slash command submit flow to preserve attachments for transformed custom prompt messages.
- Removed legacy runtime overview tab branches for deprecated `BackendLogs`/`ProjectAISettings` paths and kept canonical tab behavior.
- Updated UI setting registry/reveal expectations from `ProjectAISettings` to `ProjectAIChat`.
- Added/updated backend, Vitest, and Playwright tests for these regressions and behavior guarantees.
- Ran `pnpm -C frontend gcf`.

## 2026-03-04 20:55:08 PST

- Ran `pnpm -C frontend gcf` after implementing the review-driven changes.
- Removed deprecated overview tab compatibility for `BackendLogs` and `ProjectAISettings` in constants, persistence merge, and e2e helpers/callers.
- Added canonical slash command resolution for project chat execution and viewer rendering using a shared resolver, including removal of conflicting custom commands when runtime-reserved commands appear.
- Gated Watch Code controls/portal behind deployment mode visibility policy and wired overview controls to the same predicate as tab visibility.
- Fixed `NotificationsArea` type import for `OverviewNotificationsPaneTab`.
- Added/updated Vitest and Playwright coverage for canonical tab validation, reveal failures for deprecated keys, slash command conflict handling, and deployment mode Watch Code gating.
