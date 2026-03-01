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

## 2026-03-04 21:26:43 PST

- Added shared custom-slash sanitization/persistence sync for both `ProjectChatCore` and `ProjectChatSkillsMcpViewer` so conflicting custom commands are removed from persisted state regardless of mounted subview.
- Hardened custom slash command parsing and local-storage merge normalization to drop malformed entries safely (no runtime throws from bad persisted rows).
- Scoped aux-view side effects to active tabs (`mcp` for MCP runtime status fetches, `slash_commands` for external-agent run polling/refresh).
- Enforced authoritative skill editing rules in Skills viewer: save is disabled unless full content is loaded; truncated previews and load-error states are non-writable.
- Added/updated Vitest and Playwright coverage for malformed slash rows, truncated-skill save lockout, load-error draft protection, view-scoped polling, and no-resurrection slash conflict behavior.
- Ran `pnpm -C frontend gcf`.

## 2026-03-04 21:54:42 PST

- Hardened custom-skill upsert path handling so `skillId` updates are canonicalized, cannot target root-equivalent paths, and cannot create missing skill docs.
- Reworked default custom-skill root selection to scan prioritized editable roots for writability and return deterministic all-roots-unusable `400` details when needed.
- Added backend unit/route coverage for invalid `AGENTS_HOME` fallback, non-canonical `skillId` rejection, root-equivalent `skillId` rejection, and missing-target `skillId` failures.
- Consolidated Watch Code navigation to a single visible rail-tab path by restoring `overview-tab-watch-code` and removing the controls-triggered Watch Code portal path.
- Removed duplicated runtime-activity count derivation drift by using `resolveProjectChatRuntimeActivityCounts` in the main `ProjectChatCore` render path.
- Updated frontend Vitest and Playwright coverage for the canonical Watch Code tab flow and deployment-mode hiding behavior.
- Ran `pnpm -C frontend gcf`.

## 2026-03-04 22:21:05 PST

- Ran `pnpm -C frontend gcf`.
- Unified skill editability contract between list and upsert by introducing backend-authored `editable`/`editBlockedReason` metadata from the same validator used by writes.
- Updated Skills viewer edit/save gating to rely on backend editability metadata (no root-id heuristics), and surfaced the blocked reason in raw mode/save tooltip.
- Narrowed hydrate reconciliation to preserve only local-only activity rows (tool messages or assistant activity rows), while converging canonical chat history to backend state.
- Removed dead Watch Code `inPopover` branch and the redundant `showMoreAppTab` alias in overview navigation.
- Added/updated backend route tests, frontend Vitest tests, and Playwright tests for non-editable skill save blocking and hydration activity-only preservation.

## 2026-03-04 22:37:46 PST

- Ran `pnpm -C frontend gcf`.
- Fixed active-stream hydration so local assistant text rows are preserved while streaming is active, while inactive hydrates still converge to backend canonical history.
- Extended hydrate merge controls to separate local activity-row preservation from assistant-row preservation and applied stream-aware flags at chat and section hydration call sites.
- Updated custom-skill upsert responses to always include backend-authoritative `editable` and `editBlockedReason` metadata.
- Updated Skills viewer to keep editability metadata keyed by `skillId` so create/save flows remain writable even when immediate post-create skills refresh fails.
- Added/updated backend route tests, Vitest unit/integration tests, and Playwright e2e coverage for active-stream assistant-row preservation and create-then-refresh-fails editability behavior.

## 2026-03-04 23:02:26 PST

- Fixed Run menu `Custom Runs...` navigation to be open-only and idempotent when Overview is already on Custom Runs by introducing `openOverviewTab` and using it from the run dropdown.
- Added a stable run-menu trigger test id for e2e targeting.
- Fixed backend custom-skill upsert ordering to validate editability before any filesystem mutation (fail-fast for read-only targets).
- Added Vitest unit coverage for `openOverviewTab` open/switch semantics.
- Added backend unit and route regressions to assert non-editable targets fail before any `SKILL.md` write.
- Added Playwright e2e coverage for run-menu Custom Runs shortcut idempotent-open behavior.
- Ran `pnpm -C frontend gcf`.

## 2026-03-04 23:21:48 PST

- Ran `pnpm -C frontend gcf`.
- Hardened custom skill upsert updates so `skillId` writes require the canonical resolved path (`root::normalizedRelativePath`), preventing alias updates like `foo/../editable`.
- Updated Overview More-menu actions (`Custom Runs`, `App Gen`, `Plugins`) to use open-only tab navigation so selecting the active tab does not close the Overview pane.
- Replaced Project Chat empty-state CTA gating by copy-string comparison with explicit placeholder state (`kind` + `text`) and a deterministic `shouldShowProjectChatNoThreadsPlaceholder` predicate.
- Added backend unit and route regression tests for canonical `skillId` enforcement, Vitest coverage for placeholder-state behavior, and Playwright e2e coverage for More-menu Custom Runs idempotent-open behavior.

## 2026-03-04 23:45:27 PST

- Ran `pnpm -C frontend gcf`.
- Restored `useAIFollow` default mode to `off` so Follow AI remains opt-in and no longer auto-activates on first load.
- Updated Follow AI regressions to assert inactive-by-default UI styling and explicit active styling when mode is set to `all`.
- Added follow-filtering coverage to ensure `off` mode yields no allowed chat IDs/section highlights.
- Added Playwright coverage for Project AI settings Follow AI trigger to validate default opt-in behavior and menu availability.

## 2026-03-04 23:50:42 PST

- Ran `pnpm -C frontend gcf`.
- Verified this cycle produced no additional source changes after cleanup/generation.
- Confirmed there were no top-level `review*.md` files to remove.
