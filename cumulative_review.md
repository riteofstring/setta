## 2026-03-05 10:06:46 PST

### Consolidated findings implemented
- Prevented lossy custom-skill saves from truncated previews.
- Fixed custom-skill root selection to choose the highest-priority writable root.
- Decoupled `skillId` updates from unrelated default-root writability.
- Hardened slash-command lifecycle collision handling (native vs custom).
- Hardened persisted custom slash-command schema parsing/normalization.
- Removed hidden legacy Watch Code overview render path and migrated persisted `WatchCode` tab state to `Overview`.

### Proposed fixes applied
- Backend root resolution now probes writability and fails deterministically if none are writable.
- Custom-skill save in raw mode is blocked when content is truncated or still loading.
- Raw editor draft state preserves intentional empty content (`""`) rather than falling back to preview text.
- Composer command list now re-reconciles custom commands against managed/native reserved tokens.
- Local storage merge now deep-sanitizes custom slash command shapes.

### UX/DX before and after
- Before: Users could save truncated skill previews and silently lose content.  
  After: Save is disabled/blocked until safe full-content editing conditions are met.
- Before: Create/update could fail due to non-writable default roots even with writable fallbacks.  
  After: Create selects first writable root by priority; update targets only the selected skill path.
- Before: Command collisions could appear later and still execute ambiguous custom commands.  
  After: Collisions are reconciled continuously and conflicted custom commands are disabled/excluded.
- Before: Malformed persisted slash-command data could destabilize command handling.  
  After: Invalid persisted entries are dropped deterministically.

## 2026-03-05 10:46:03 PST

### Consolidated implementation updates
- Added backend skill editability metadata (`isEditable`, `editabilityReason`) for MCP skills viewer records.
- Updated frontend skills viewer state handling to separate loading/error state from editable draft content.
- Scoped slash-command polling/work to slash mode and added a deterministic fallback selector helper.
- Fixed notifications `initialTab` handling to apply once without overriding later user tab changes.
- Added and updated backend, Vitest, and Playwright coverage for these behavior fixes.

### UX/DX before and after
- Before: Skill editability decisions were implicit and could be inconsistent between backend and UI.  
  After: Backend sends explicit editability metadata, so UI edit controls behave predictably.
- Before: Skills editor loading/error transitions could interfere with raw draft state.  
  After: Draft state is preserved independently from fetch lifecycle state.
- Before: Slash-command polling and selector checks ran more broadly than needed.  
  After: Polling/lookup is limited to slash mode with stable fallback behavior and tests.
- Before: Notifications `initialTab` could keep reapplying and disrupt user tab selection.  
  After: `initialTab` is consumed once, then user tab choice is preserved.

## 2026-03-05 11:48:38 PST

### Consolidated findings implemented
- Enforced `skillId` upsert as update-only: missing target `SKILL.md` now hard-fails instead of creating nested/spoofed paths.
- Fixed custom-skill save race so late responses from previously selected skills cannot overwrite the current skill editor state.
- Added deterministic startup slash-command token resolution that merges persisted native tokens during hydration and switches to runtime-authoritative tokens after initial run load completes.
- Removed route/subtab drift for Notifications vs Backend Logs by always mapping `BackendLogs` route to backend-logs pane state.
- Migrated reveal routing and pane-open behavior for Watch Code and Project AI Settings to current topology/state model (no legacy tab-key assumptions).
- Moved watch-code portal visibility and project chat aux-view selection into shared persisted state with ownership-aware rollback in reveal mutations.

### Proposed fixes applied
- Backend `upsert_app_gen_custom_skill` now checks selected `skillId` target existence before writing and raises deterministic `KeyError` for missing targets.
- Skills editor save path now captures request skill identity and applies response/cache updates only to that identity; selected-view state updates are guarded by current selection.
- Project chat composer now reads native slash-command tokens from persisted storage via shared utility and uses startup reconciliation logic to avoid temporary false-negatives.
- Notifications pane no longer accepts an `initialTab` override; Overview layer enforces backend-logs subtab whenever route tab is `BackendLogs`.
- UI settings registry now targets current overview keys (`Overview`, `ProjectAIChat`) for watch-code and project-ai settings reveals.
- Reveal activation/rollback now tracks and reverts `watchCodePortalOpen` and per-project `projectChatAuxViewByProjectConfigId` changes only when owned by the running mutation.
- Added persisted-state normalization for new keys and filtered invalid aux-view payloads deterministically.

### UX/DX before and after
- Before: Passing a crafted/missing `skillId` could create unintended skill folders during update flows.  
  After: Update-by-`skillId` is strict; missing target rejects immediately and no new files are created.
- Before: Saving skill A while switching to skill B could replace B editor content when A save resolved late.  
  After: Late save responses are scoped to the original skill request; active skill content remains stable.
- Before: Native slash commands could temporarily disappear before run hydration finished, degrading composer reliability.  
  After: Startup token reconciliation keeps native slash commands available until runtime metadata becomes authoritative.
- Before: Switching to `BackendLogs` overview route could still show Notifications subtab from prior state.  
  After: Route transition deterministically opens backend logs every time.
- Before: Reveal actions depended on outdated tab keys/local-only pane state and could miss intended anchors or rollback incompletely.  
  After: Reveal opens the correct modern pane targets (including watch-code portal and project-ai settings aux view) and rolls back owned state changes cleanly on failure.

### Validation coverage added or updated
- Backend tests: skill-id target-missing rejection at unit and route levels.
- Frontend unit/integration tests: startup slash-command reconciliation, persisted-state normalization, reveal state/rollback ownership, notifications/backend-logs routing behavior.
- Playwright tests: skill-save race regression and notifications->backend-logs route transition determinism.

## 2026-03-05 19:42:14 PST

### Consolidated findings implemented
- Eliminated stale project-scoped aux-view writes in `ProjectChat` that could mutate the wrong project after a project switch.
- Fixed branch-local TypeScript drift in notifications by restoring explicit `OverviewNotificationsPaneTab` type import.
- Added focused regression coverage for per-project aux-view isolation at unit, integration, and E2E levels.

### Proposed fixes applied
- Introduced `resolveProjectChatAuxViewByProjectConfigIdUpdate` as a deterministic aux-view map mutation helper.
- Introduced `setProjectChatAuxViewForActiveProject` so aux-view writes resolve active project scope at call time via `useProjectState.getState()`.
- Routed existing aux-view mutation paths (`engine change`, `return to chat`, `toggle threads`, `open skills/mcp/slash/ai settings`, and new-thread clears) through that active-project mutation path.
- Added missing notifications tab type import (`OverviewNotificationsPaneTab`) in `NotificationsArea`.

### UX/DX before and after
- Before: Aux-view actions could write to a previous project key when handlers outlived project switches, causing no-op/open-wrong-pane symptoms and cross-project persisted state bleed.  
  After: Aux-view state mutations always target the active project at invocation time, so project switching preserves strict per-project isolation.
- Before: Notifications pane compiled with unresolved type reference (`TS2304`) and reduced editor/CI confidence.  
  After: Type contract is explicit and stable.

### Validation coverage added or updated
- Frontend unit tests: pure aux-view map mutation helper behavior (`no-op`, `targeted set`, `targeted clear`).
- Frontend integration tests: active-project aux-view writes and clears remain scoped correctly across project ID switches.
- Playwright E2E: cross-project aux-view persistence/isolation (`Project A -> skills`, `Project B -> mcp`, clear `B`, restore `A`).

## 2026-03-05 20:21:44 PST

### Consolidated findings implemented
- Enforced canonical custom-skill mutation invariants: update-by-`skillId` now accepts only discoverable skill IDs and rejects hidden/unlisted path targets.
- Made custom-skill create mode non-destructive: `relativePath` collisions fail fast instead of overwriting existing `SKILL.md`.
- Fixed custom-skill root-priority selection under path aliasing so documented order remains deterministic (`AGENTS_HOME/skills` -> `~/.agents/skills` -> workspace `.agents/skills`).
- Restored slash-command fail-closed behavior by separating command recognition from command availability in project chat composer flow.
- Fixed skills viewer content fidelity so loaded empty `SKILL.md` renders as empty content rather than a no-selection placeholder.
- Removed unreachable legacy `BackendLogs` tab-content switch branch while preserving legacy remap behavior at tab normalization.

### Proposed fixes applied
- Backend `upsert_app_gen_custom_skill` now builds a discoverable-skill index from listing output and rejects unknown/non-discoverable `skillId` updates.
- Backend create path now checks target `SKILL.md` existence before write and raises deterministic collision errors for existing paths.
- Backend writable-root resolver now uses explicit prioritized root candidates independent of deduped listing IDs and normalizes returned root IDs against discoverable roots.
- Frontend `ChatInput` now accepts `recognizedSlashCommands` and resolves slash requests through a recognition set plus explicit availability gate.
- Frontend `ProjectChatCore` now computes `{ slashCommands, recognizedSlashCommands }` from one source helper and passes both to composer.
- Frontend skills viewer now derives preview fallback from load-state + selection (not content truthiness) and keeps create notifications strictly create-oriented.
- Frontend Overview tab content removed redundant `BackendLogs` switch case.

### UX/DX before and after
- Before: Crafted/unlisted `skillId` values could mutate hidden paths (for example under skipped `.git` segments).  
  After: Only discoverable skill IDs are writable; hidden/unlisted IDs return deterministic 404-class errors.
- Before: Creating a custom skill with an existing name could silently overwrite existing content.  
  After: Create-on-collision fails with explicit error feedback and leaves existing content unchanged.
- Before: Root selection could drift to user scope when `AGENTS_HOME` aliased workspace paths.  
  After: Creates consistently land in the highest-priority writable root per documented order.
- Before: Recognized managed commands excluded by temporary availability could fall through as normal chat text.  
  After: Recognized commands are consumed as slash commands with explicit unavailable feedback and are not submitted as plain chat payload.
- Before: Empty loaded `SKILL.md` could appear as “Select a skill to preview SKILL.md.” in rendered mode.  
  After: Loaded empty documents display as empty content, matching source-of-truth file state.

### Validation coverage added or updated
- Backend unit + route tests for:
  - hidden/non-discoverable `skillId` rejection (including existing hidden `SKILL.md` files),
  - create collision non-overwrite behavior,
  - root-priority correctness when `AGENTS_HOME` aliases workspace paths.
- Frontend Vitest coverage for:
  - slash recognition vs availability split in `ChatInput`,
  - project chat command-set construction (`slashCommands` vs `recognizedSlashCommands`),
  - empty-skill preview fidelity in skills viewer,
  - legacy `BackendLogs` -> notifications remap behavior after dead-branch cleanup.
- Playwright E2E coverage for custom-skill create collision behavior ensuring error surfacing and current editor content stability.

## 2026-03-05 21:19:15 PST

### Consolidated findings implemented
- Stopped persisting transient startup/UI visibility state for Watch Code and Project AI aux views so stale local storage cannot reopen those surfaces in later sessions.
- Scoped Project AI composer drafts and new custom slash-command form drafts by `projectConfigId` to prevent cross-project draft bleed.
- Fixed custom slash-command submission so prompt expansion preserves attachments and uses the same submit contract as normal chat sends.
- Reworked raw skill-markdown draft handling to preserve dirty local edits across skill refresh/reload while still updating clean drafts when server content changes.
- Updated Playwright navigation helpers/specs to follow the real Overview `More` menu flow for relocated destinations such as Plugins.

### Proposed fixes applied
- `useLocalStorage` persistence now force-resets `watchCodePortalOpen` and `projectChatAuxViewByProjectConfigId` during hydration and omits both from `partialize`, keeping them session-local even though surrounding store state remains persisted.
- `ProjectChat` now uses `resolveProjectChatDraftMessageByProjectConfigIdUpdate` and a `draftMessageByProjectConfigId` map so composer text belongs to the active project only.
- `ProjectChatSkillsMcpViewer` now stores custom slash drafts per project and stores skill markdown draft state per skill as `{ draft, loadedContent }`, which distinguishes clean refreshable drafts from dirty locally edited drafts.
- `ChatInput` now routes custom prompt slash commands through `resolveCustomPromptSlashCommandSubmission`, clones current attachments into the expanded submission payload, and exposes a stable textarea test id for E2E coverage.
- Overview Playwright helpers now centralize relocated-tab access behind `openOverviewMoreDestination`, and stale rail-button selectors were removed from the affected specs.

### UX/DX before and after
- Before: Reopening the app could resurrect old Watch Code or Project AI aux panes from persisted visibility flags.
  After: Those panes open only from current-session actions or explicit reveal flows.
- Before: Draft text composed in one project could appear in another project, including half-authored custom slash commands.
  After: Draft state is isolated by project and clears only for the targeted project.
- Before: Sending a custom prompt slash command with attachments silently dropped the files from the request payload.
  After: Slash-command sends preserve attachments exactly like normal chat submissions.
- Before: Refreshing or transiently reloading a selected custom skill could wipe unsaved raw markdown edits, or force users to reselect a skill to see refreshed clean content.
  After: Dirty drafts survive refresh, while clean drafts still update immediately from refreshed server content.
- Before: Playwright still targeted removed Overview rail buttons, so coverage no longer matched the shipped navigation path.
  After: E2E tests use the real `More` menu path and are less brittle.

### Validation coverage added or updated
- Frontend Vitest coverage for:
  - per-project Project AI composer draft isolation,
  - per-project custom slash draft isolation,
  - transient local-storage hydration/partialization behavior for Watch Code and aux views,
  - attachment-preserving custom slash-command submission,
  - clean-vs-dirty skill markdown draft refresh behavior.
- Playwright E2E coverage for:
  - Watch Code remaining closed on startup despite persisted visibility state,
  - session-local Project AI aux views across reloads,
  - unsaved raw skill edits surviving same-skill refresh,
  - custom slash commands preserving attachments on submit,
  - Plugins navigation through the Overview `More` menu.

## 2026-03-05 22:03:36 PST

### Consolidated findings implemented
- Fixed native slash-command reservation scope so project chat only treats active engines in the current project as authoritative sources of reserved/native tokens.
- Restored slash-command fail-closed behavior by separating slash-command recognition from slash-command executability, preventing reserved/native tokens from falling through as plain chat.
- Removed engine-configuration gating from custom slash-command management so custom commands remain manageable even when a project has zero engines configured.
- Isolated Project AI `Skills`, `MCP`, and `Slash Commands` side effects so hidden tabs no longer trigger unrelated skill discovery, MCP runtime fetches, or agent-run loading.
- Replaced frontend inference of the custom-skills root with the backend-selected writable create root, so the displayed root and reveal action share one source of truth.
- Fixed Watch Code portal resize observation so the popover repositions after post-open content growth instead of keeping stale dimensions.

### Proposed fixes applied
- Backend `getAppGenSkills` now returns a typed object containing `skills`, `customSkillCreateRootPath`, and `customSkillCreateRootError`, and root selection is resolved once on the backend via `resolve_app_gen_skills_response`.
- Project chat composer command resolution now builds both executable `slashCommands` and broader `recognizedSlashCommands`, including managed tokens, native tokens, and colliding custom tokens.
- Agent-native slash-command storage/runtime reconciliation now filters by current project and current engine IDs, pruning stale engine entries instead of treating cached global data as authoritative.
- Project AI settings viewer effects now key fetch/poll work to the active `viewMode`; slash-command polling remains limited to the external-agent slash view.
- Skills UI now always renders the custom-command manager, while engine-specific native-command panes are shown only when engine configs exist.
- Watch Code portal positioning now tracks the mounted portal element through a callback ref + `ResizeObserver`, so later row additions recompute clamp/alignment state.

### UX/DX before and after
- Before: Native slash commands discovered in another project, or for removed engines, could reserve tokens in the current project and block unrelated custom commands.  
  After: Only active engines on the current project reserve slash tokens, and stale engine metadata is pruned.
- Before: Recognized-but-unavailable slash commands such as reserved native tokens could be submitted as normal chat text.  
  After: Recognized slash tokens are always consumed by slash-command handling and surface unavailable/collision feedback instead of failing open.
- Before: Projects without engines lost access to custom slash-command management entirely.  
  After: Custom command authoring remains available regardless of engine configuration.
- Before: Opening `Skills` or `MCP` could still trigger hidden-tab work, increasing request churn and making the viewer harder to reason about.  
  After: Each Project AI subview only loads the data it owns, which reduces hidden work and simplifies testing.
- Before: The custom-skills root label/open action could disagree with the actual backend create target.  
  After: The displayed path, create target, and open action all use the same backend-selected writable root.
- Before: Adding Watch Code rows after opening the popover could leave the panel visually detached or clamped using stale dimensions.  
  After: The portal stays aligned and on-screen as its content grows.

### Validation coverage added or updated
- Backend pytest coverage for:
  - typed `getAppGenSkills` response shape,
  - authoritative custom-skill create-root selection independent of discovered skill locations.
- Frontend Vitest coverage for:
  - project-scoped agent-run filtering,
  - engine-scoped persisted native slash-command parsing,
  - slash recognition vs availability for reserved/colliding commands,
  - agent-native slash-command map equality/filter/resolve helpers.
- Playwright E2E coverage for:
  - custom slash-command management remaining available with zero engines,
  - Skills view avoiding hidden MCP runtime fetches,
  - backend-selected custom-skill root label rendering,
  - Watch Code portal stability after post-open content growth.
- Manual Chrome DevTools MCP verification for:
  - authoritative custom-skill root label visibility,
  - slash-command custom editor visibility,
  - Watch Code portal clamping/alignment after row growth.
