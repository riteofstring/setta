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

## 2026-03-06 08:38:06 PST

### Consolidated findings implemented
- Fixed native slash-command execution so a first submit can refresh external-agent authority and still execute the discovered native command on that same submit path.
- Added explicit executable `native_prompt` slash-command handling so authoritative native commands no longer stay trapped in a recognized-but-unavailable state.
- Restored authoritative custom-skill affordance gating so `Create`, `Open`, and raw-save controls only stay enabled while the current backend/root contract supports them.
- Fixed backend custom-skill editability metadata so `isEditable` and `editabilityReason` now reflect actual `SKILL.md` writability instead of only root kind and relative path shape.
- Corrected skill activity ambiguity handling so same-named skills in inapplicable roots no longer poison `Active` status for the current engine.
- Removed the reviewed branch-local TypeScript regressions in the touched slash/skills files.

### Proposed fixes applied
- `ChatInput` now supports refreshed slash-command authority handoff from `onUnknownSlashCommand`, re-runs slash resolution against refreshed command sets, and executes native commands through the same canonical submit flow as other slash commands.
- `ProjectChatCore` now emits executable native slash-command definitions in `resolveProjectChatComposerSlashCommandSets` and returns refreshed command sets from the forced reload path instead of swallowing the first submit with placeholder feedback.
- `ProjectChatSkillsMcpViewer` now clears cached custom-skill root state at refresh start/failure, disables custom-skill creation unless the current backend response exposes a usable root path, and fail-closes custom slash creation until native namespace authority is ready for external-agent projects.
- `app_gen_extensions.py` now derives custom-skill editability from the actual `SKILL.md` path write authority and re-validates that authority on update before writing.
- `projectChatSkillsMcpViewerUtils` now filters active-skill ambiguity to applicable roots before marking skills `unknown`, and narrows touched map/index access to satisfy the current TypeScript contract.

### UX/DX before and after
- Before: A real native slash command discovered during the first submit could still stop at generic feedback and require a second Enter.  
  After: Refresh and execution now share one authoritative path, so the first confirmed submit executes immediately.
- Before: Custom-skill `Create` and `Open` could remain enabled after stale or failed root loads, and read-only custom skills could still offer Save until the write failed late.  
  After: The current backend/root authority disables those actions up front and surfaces accurate read-only reasons.
- Before: Cross-ecosystem duplicate skill names could mark the applicable skill `Unknown`, making activity badges look unreliable.  
  After: Only duplicates in roots applicable to the active engine remain ambiguous; cross-root irrelevant duplicates stay inactive.
- Before: Touched slash/skills files added fresh TS noise on top of the repo’s already noisy full typecheck surface.  
  After: The reviewed files stay clean under targeted typecheck filtering, which preserves local editor signal for follow-up work.

### Validation coverage added or updated
- Frontend Vitest coverage for:
  - native slash-command availability and executable action resolution,
  - custom-skill create gating from authoritative root state,
  - external-agent custom slash namespace fail-closed behavior,
  - cross-root skill activity resolution for Codex and OpenCode duplicates.
- Backend pytest coverage for:
  - read-only custom-skill listing metadata,
  - update rejection when an existing custom skill is no longer writable.
- Playwright E2E coverage for:
  - disabled custom-skill create with no current backend root,
  - stale root affordances clearing after refresh failure,
  - external-agent custom slash add remaining disabled until namespace authority is settled.
- Manual Chrome DevTools MCP verification for:
  - disabled custom-skill create/save affordances in the Skills view,
  - Slash Commands view rendering/gating for external-agent tabs and custom-command add state.
  - Watch Code portal clamping/alignment after row growth.

## 2026-03-05 22:32:42 PST

### Consolidated findings implemented
- Restored read-only behavior for `GET /getAppGenSkills` so opening the Skills browser no longer creates custom-skill directories or write-probe files as a side effect.
- Scoped persisted native slash-command metadata by `projectConfigId` plus `engineConfigId`, eliminating cross-project reservation bleed when default engine IDs are reused.
- Made runtime native slash-command selection deterministic by choosing the newest run per engine rather than whichever run happened to appear last in an unsorted list.
- Removed hidden agent-run loading from non-slash aux views so `Skills` and `MCP` no longer trigger slash-command/runtime discovery work on mount.
- Hardened skill activity badges to fail closed: ambiguous runtime skill identifiers now surface as `unknown` instead of heuristically marking one candidate `active`.

### Proposed fixes applied
- Backend skills-list response now resolves only the preferred create root path for display and defers all directory creation plus writability probing to `upsert_app_gen_custom_skill`.
- Project AI slash-command storage now persists under a project-scoped map and the composer reads only the active project's cached native command entries during startup hydration.
- Slash-command runtime resolution now compares candidate runs by `getRunLastUpdatedMs` (with stable `run.id` tie-break) before extracting authoritative native command metadata.
- `ProjectChatSkillsMcpViewer` no longer performs an unconditional startup `loadAgentRuns()`; agent-run fetching remains behind the existing slash-only polling gate.
- Skill-activity mapping now only marks a skill `active` when the runtime-reported identifier maps uniquely; collisions across multiple discovered skills are treated as ambiguous.

### UX/DX before and after
- Before: Opening the Skills view could silently create `~/.agents/skills` or workspace custom-skill directories just by listing skills.  
  After: Skills discovery is read-only; filesystem changes happen only after an explicit create/save action.
- Before: Native slash commands discovered in Project A could reserve the same token in Project B before Project B had loaded its own run metadata.  
  After: Startup slash-command availability is isolated to the active project and active engine set.
- Before: An older run could overwrite newer native slash-command metadata depending on backend enumeration order.  
  After: Newest-run-wins behavior is deterministic, so native command status and reservations stay aligned with current runtime state.
- Before: Opening `Skills` or `MCP` still caused hidden `/getAgentRuns` traffic and unrelated slash-command state churn.  
  After: Only the `Slash Commands` aux view loads agent-run metadata.
- Before: If two discovered skills shared the same runtime token/name, the UI could mark the wrong one as `active`.  
  After: Ambiguous matches degrade to `unknown`, preserving badge trustworthiness.

### Validation coverage added or updated
- Backend pytest coverage for:
  - `resolve_app_gen_skills_response()` remaining side-effect free when the preferred custom-skill root does not yet exist,
  - `GET /getAppGenSkills` leaving candidate custom-skill roots absent after the request.
- Frontend Vitest coverage for:
  - project-scoped native slash-command storage parsing,
  - newest-run-wins and newer-`none` handling for native slash metadata,
  - cross-project cached native command isolation in composer fallback logic,
  - ambiguous skill-activity mapping failing closed as `unknown`.
- Playwright E2E coverage for:
  - `Skills`/`MCP` avoiding hidden `getAgentRuns` requests while `Slash Commands` still triggers them,
  - cross-project cached native slash metadata not blocking a valid custom command in the active project.
- Manual Chrome DevTools MCP verification for:
  - Project AI `Skills`, `MCP`, and `Slash Commands` aux-view transitions in the running app,
  - external-agent slash-command tab rendering and empty native-command state messaging.

## 2026-03-06 05:55:26 PST

### Consolidated findings implemented
- Replaced split native slash-command reservation logic with one authoritative runtime resolver scoped to the active project, active engine IDs, and newest-run-wins per engine.
- Restored strict fail-closed slash-command behavior during startup and degraded agent-run states so reserved native tokens never fall through as plain chat text.
- Unified custom-skill create-root authority between backend and frontend so the displayed root, create target, and `Open` action all point at the same backend-selected location.
- Removed misleading custom-skill root error semantics in favor of explicit actionability, which lets the UI distinguish “known path but not created yet” from “no usable root”.
- Reinstated Watch Code visibility gating after the control relocation so deployment/share mode no longer renders the Watch Code entry point.
- Deleted backward-compatibility remaps for removed top-level Overview tabs (`BackendLogs`, `WatchCode`, `ProjectAISettings`) so runtime tab state only accepts current destinations.

### Proposed fixes applied
- Backend `app_gen_extensions` now resolves the custom-skill create root through `_resolve_custom_skill_create_root(...)`, returning both `customSkillCreateRootPath` and `customSkillCreateRootActionable`.
- Backend writable-root probing now tracks whether the root already existed and cleans up any probe-created directories, preserving read-only `GET /getAppGenSkills` behavior while still determining whether the path is actionable.
- Custom-skill create/update flow now reuses that same backend resolver, so create writes land at the same path previously shown to the user.
- Frontend skills viewer now stores `customSkillCreateRootActionable`, renders `Custom skills root (not created yet): ...` when the backend has chosen a path that is not yet materialized, and disables `Open` until the backend says that path is actionable.
- Frontend slash-command resolution now uses `resolveAgentNativeSlashCommandsByEngineId(...)` plus `collectAgentNativeSlashCommandTokensFromEntries(...)` instead of unioning commands from arbitrary runs.
- Project chat composer fallback now keys off `agentRunsAuthorityState === "ready"` before trusting runtime-native slash metadata; until then it stays fail-closed on persisted reserved/native tokens.
- Watch Code portal rendering is now guarded by `shouldShowWatchCodePortalControl(...)`, and deployment-mode transitions force-close the portal instead of leaving stale UI state behind.
- Overview/local-storage normalization no longer remaps removed top-level tab names, and backend-log visibility logic no longer special-cases the deleted `BackendLogs` top-level tab.

### UX/DX before and after
- Before: Stale runs, removed engines, or older runs could keep native slash tokens reserved in the current project, while startup `terminal_error` states could also accidentally reopen reserved tokens as executable custom commands.  
  After: Only the latest run for each active engine in the current project can reserve native tokens, and startup/degraded states remain fail-closed until authoritative runtime data is ready.
- Before: Skills UI could show one root, `Open` could target that root, and create could still write somewhere else, or `Open` could stay enabled for a path that did not exist yet.  
  After: The banner, create target, and `Open` action share one backend contract; when the root is not created yet, the UI says so explicitly and disables `Open`.
- Before: Deployment/share mode could still expose the relocated Watch Code control, widening feature availability relative to the previous product gate.  
  After: The control is hidden before render in deployment mode, matching the intended availability rules.
- Before: Removed top-level Overview tabs still existed as semi-supported runtime states through hydration/remap branches, which made navigation logic and tests harder to reason about.  
  After: Only current tabs survive validation, so hydration follows one smaller state path and the runtime no longer carries dead compatibility code.

### Validation coverage added or updated
- Backend pytest coverage for:
  - authoritative custom-skill create-root selection,
  - `customSkillCreateRootActionable` behavior for existing vs not-yet-created roots,
  - GET/POST consistency for the skills root contract.
- Frontend Vitest coverage for:
  - newest-run-wins native slash-command resolution by engine,
  - fail-closed composer behavior while agent-run authority is not ready,
  - skills-root label/actionability rendering,
  - Watch Code deployment-mode gating,
  - removed Overview tab compatibility-branch cleanup.
- Playwright E2E coverage for:
  - disabled `Open` behavior when the backend-selected custom-skills root is not yet created,
  - preserved Watch Code hiding in deployment mode,
  - updated Overview navigation paths after removing legacy top-level tab shims.
- Manual Chrome DevTools MCP verification for:
  - `Custom skills root (not created yet)` rendering with `Open` disabled,
  - Watch Code control absence in deployment mode.

## 2026-03-06 06:42:38 PST

### Consolidated findings implemented
- Restored strict read-only behavior for `GET /getAppGenSkills` by separating skills-browser root discovery from the write-capable create/save path.
- Made native slash-command authority consistent across load, cache hydration, viewer rendering, and composer execution so reserved agent-native commands stay fail-closed until authoritative run metadata is ready.
- Preserved cached native slash-command metadata during degraded agent-run states instead of hiding or deleting it on transient or terminal load failures.
- Removed the remaining Playwright compatibility shims for deleted Overview destinations so E2E coverage follows the shipped Project AI Chat and Notifications flows directly.

### Proposed fixes applied
- Backend `app_gen_extensions` now uses `_resolve_custom_skill_create_root(...)` for `GET /getAppGenSkills` and keeps `_resolve_custom_skill_create_root_for_write(...)` for explicit custom-skill creation and updates.
- Backend regression tests now fail immediately if the GET route attempts any `Path.mkdir(...)` or write-mode `Path.open(...)` while resolving the skills response.
- Frontend agent-run loading now hydrates persisted native slash-command metadata from the authoritative load path in `ai.ts` instead of relying on the slash-command viewer to seed storage after the fact.
- `ProjectChatSkillsMcpViewer` now treats runtime-native slash-command data as authoritative only when `agentRunsAuthorityState === "ready"` and avoids cache writeback in non-authoritative states.
- `ProjectChatCore` now keeps slash-prefixed input fail-closed while authoritative agent-run metadata is unresolved and continues treating cached reserved/native tokens as protected during startup and terminal failure states.
- Playwright helpers now reject removed `ProjectAISettings` and `BackendLogs` aliases, and the affected specs were rewritten to navigate through the live `Project AI Chat -> settings popover -> AI Settings` and `Notifications -> Logs` UI paths.

### UX/DX before and after
- Before: Opening the Skills browser could still create directories or write probe files under candidate custom-skill roots.  
  After: Skills discovery is side-effect free; only create/save actions can mutate the filesystem.
- Before: Fresh loads and degraded agent-run states could disagree about whether a reserved native slash token should be shown, cached, or blocked from execution.  
  After: One authority model governs cache hydration, viewer visibility, and composer protection, so reserved native slash commands remain consistently fail-closed until runtime metadata is authoritative.
- Before: A terminal run-load failure could hide cached native slash commands and even drop the persisted reservation metadata.  
  After: Cached native commands remain visible and read-only during failure states, and load failures no longer erase the reservation cache.
- Before: Playwright could keep passing while using removed Overview-tab aliases rather than the actual UI entry points users see.  
  After: E2E coverage exercises the real shipped navigation flows, which makes failures more trustworthy and reduces dead compatibility code.

### Validation coverage added or updated
- Backend pytest coverage for:
  - read-only `GET /getAppGenSkills` behavior with hard failures on attempted directory creation,
  - read-only `GET /getAppGenSkills` behavior with hard failures on attempted write opens,
  - retained `customSkillCreateRootActionable` contract while the GET flow stays side-effect free.
- Frontend Vitest coverage for:
  - authoritative agent-run loads hydrating cached native slash metadata,
  - retained cached native slash metadata after terminal agent-run failures,
  - fail-closed composer reconciliation while `agentRunsAuthorityState` is not `ready`,
  - viewer/runtime command resolution using the shared authority helpers.
- Playwright E2E coverage for:
  - Project AI Settings access through the live Project AI Chat settings popover flow,
  - slash-command UX with cached native metadata surviving terminal run-load failures,
  - updated Overview navigation paths without removed alias shortcuts.

## 2026-03-06 07:22:34 PST

### Consolidated findings implemented
- Replaced the read-once native slash-command cache path with a subscribed shared store so the Project AI chat composer and slash-command viewer observe the same live authority state.
- Changed native slash-command cache hydration from incremental patching to full authoritative snapshot replacement so deleted projects and removed commands are pruned instead of lingering in persisted storage.
- Preserved raw custom-prompt slash-command suffix text through parsing and submission so multiline prompts, indentation, repeated spaces, and fenced code blocks are no longer rewritten before execution.
- Made successful custom-skill writes authoritative in the frontend by returning the written skill row and content payload from `/upsertAppGenCustomSkill`, then seeding the local viewer state from that mutation response.

### Proposed fixes applied
- Added a dedicated shared native slash-command cache store in `projectChatSkillsMcpViewerUtils.ts` and moved both persistence and subscription logic behind that single source of truth.
- Updated `ai.ts` agent-run hydration to normalize native slash-command entries per project and replace the persisted cache wholesale after each successful authoritative `agentRuns` load.
- Switched `ProjectChatCore` and related Project AI helpers to derive reserved/native slash-command protection from the subscribed cache state rather than a stale `localStorage` snapshot captured at mount time.
- Extended slash-command parsing in `chatComposerControls.ts` and `ChatInput.tsx` so managed commands still receive parsed arguments while `custom_prompt` commands receive the raw suffix verbatim.
- Expanded the backend `UpsertAppGenCustomSkillResponse` model and route implementation to include the authoritative `AppGenSkillEntry` plus `skillContent`, matching what the frontend needs immediately after save/create.
- Updated `ProjectChatSkillsMcpViewer.tsx` to upsert returned skill metadata into local list/editor state and treat follow-up list/content fetches as background synchronization instead of prerequisites for a successful write UX.

### UX/DX before and after
- Before: Native slash-command reservations could go stale after mount, disappear during degraded authority states, or remain reserved for projects that no longer owned them.  
  After: Native slash-command reservations stay synchronized across load, cache, viewer, and composer state, and obsolete project reservations are pruned on the next authoritative hydration.
- Before: A user could type `/custom-prompt` followed by structured markdown or code and have whitespace, blank lines, or indentation silently collapsed before submission.  
  After: Custom prompt execution receives exactly the text the user typed after the slash token, preserving formatting-sensitive prompts.
- Before: A `200` response from custom-skill create/save could still leave the new skill unavailable or stuck in read-only/error states if the immediate follow-up read failed.  
  After: A successful write remains selectable and editable immediately because the write response itself seeds the authoritative local state.
- Before: Frontend debugging had to reason about multiple partially-authoritative paths: cached storage, viewer-derived cache writeback, stale mount snapshots, and mutation success followed by fragile re-read dependencies.  
  After: Authority boundaries are explicit, state flows are simpler to trace, and the tests now exercise the same pathways the production UI relies on.

### Validation coverage added or updated
- Backend pytest coverage for:
  - authoritative custom-skill upsert responses including returned skill metadata and content,
  - write-success behavior that remains valid even when subsequent readback would fail.
- Frontend Vitest coverage for:
  - full-snapshot native slash-command cache replacement and project-pruning behavior,
  - shared cache reactivity between agent-run hydration, viewer state, and composer protection,
  - raw-suffix preservation for custom prompt slash commands,
  - frontend skill-state upserts from successful custom-skill mutations.
- Playwright E2E coverage for:
  - cached native slash-command visibility surviving terminal agent-run load failures,
  - custom slash-command submissions preserving attachments and raw markdown-mode content,
  - newly created custom skills remaining usable immediately without depending on follow-up reads.

## 2026-03-06 07:53:12 PST

### Consolidated findings implemented
- Fixed the reopened custom-skill save race in the Project AI Skills viewer so late save responses no longer steal the active editor after the user switches to another skill.
- Split custom-skill upsert reconciliation into two authority paths: canonical skill/cache/draft updates always apply for the saved skill, while visible selection/editor state now updates only when the response still owns the current selection or the flow explicitly requested selection.
- Removed the two native-slash storage helpers that had become test-only production exports after the shared cache refactor, and retargeted tests to the supported parse/filter/cache pathways instead.

### Proposed fixes applied
- `ProjectChatSkillsMcpViewer.tsx` now exports narrow reconciliation helpers for:
  - replacing a saved skill's raw-draft state with the authoritative saved content,
  - deciding whether an upsert response is allowed to update the active selection/editor surface.
- The viewer's `applyUpsertedSkillResponse(...)` path now:
  - always updates the in-memory skill-content cache for the saved `skillId`,
  - always upserts the returned skill row into the local skills list,
  - always replaces the saved skill's draft snapshot with the authoritative returned content,
  - only updates `selectedSkillId`, visible markdown content, truncation state, and original-size metadata when the current selected skill still matches the request context or the create flow explicitly requests selection.
- The viewer now uses a wrapped `setSelectedSkillId(...)` setter that updates `selectedSkillIdRef.current` synchronously with selection changes, closing the narrow timing gap where a fast response could land before a `useEffect`-driven ref sync.
- Skills list rows now expose `data-selected=\"true|false\"` so automated tests and DevTools inspection can assert the active row directly instead of inferring selection only from rendered markdown content.
- `projectChatSkillsMcpViewerUtils.ts` no longer exports:
  - `resolveAgentNativeSlashCommandsStorageUpdate(...)`
  - `collectAgentNativeSlashCommandTokensFromStorage(...)`
- Utility tests now validate the same semantics through the live authority APIs:
  - `parseAgentNativeSlashCommandsStorage(...)`
  - `filterAgentNativeSlashCommandsByEngineId(...)`
  - `collectAgentNativeSlashCommandTokensFromEntries(...)`
  - `replaceAgentNativeSlashCommandsCache(...)`

### UX/DX before and after
- Before: Saving custom skill A, switching to custom skill B, and then receiving A's delayed save response could forcibly reselect A and overwrite the editor surface the user was actively reading or editing.  
  After: The delayed save for A updates A's cached/list/draft state in the background, while the visible editor remains on B unless the user intentionally reselects A.
- Before: The create and save flows shared one unconditional \"apply response\" path, so async ownership was implicit and fragile.  
  After: Create remains the only explicit \"select the returned skill\" path, while ordinary save responses are ownership-checked against the live selection.
- Before: The utility module still advertised a second storage-update pathway and a raw-storage token collector even though the runtime had already moved to a shared cache authority model.  
  After: The production API surface matches the actual runtime authority model, which makes future maintenance and test intent easier to reason about.

### Validation coverage added or updated
- Frontend Vitest coverage for:
  - stale save responses being ignored when the user has already switched selection,
  - same-skill save responses still updating the active editor state,
  - create-style responses still selecting the returned skill explicitly,
  - successful custom-skill saves replacing both `draft` and `loadedContent` for the saved skill,
  - integration-level stale-save sequencing where skill A updates are retained in cache/draft/list state while skill B remains the selected editor target.
- Frontend utility-test coverage updated to:
  - collect persisted native slash-command tokens through the supported parse/filter/token helpers,
  - validate project-scoped native slash-command cache replacement through the shared runtime cache authority rather than a dead test-only export.
- Playwright E2E coverage updated to:
  - keep the existing delayed-save regression scenario as a merge gate,
  - assert both the visible markdown content and the selected beta skill row remain stable after the delayed alpha save resolves.
- Manual Chrome DevTools MCP verification:
  - opened Project AI Settings -> Skills in the headed app,
  - injected mocked skills/network responses in-page to avoid mutating real `~/.agents/skills`,
  - verified the beta row remained `data-selected=\"true\"` and the markdown viewer remained on `Beta stable body` after releasing the delayed alpha save.

## 2026-03-06 09:17:15 PST

### Consolidated findings implemented
- Restored the fail-closed native slash-command invariant in Project AI Chat so cached external-agent slash metadata can reserve names and stay visible, but cannot execute until runtime agent-run authority is actually `ready`.
- Restored strict custom-skill create/update semantics in the backend so concurrent filesystem changes no longer let update recreate a deleted `SKILL.md` or let create overwrite a file another writer created after validation.

### Proposed fixes applied
- Split Project AI slash-command handling into two authority layers:
  - `resolveProjectChatComposerNativeSlashCommandTokens(...)` still returns recognized/reserved native tokens from persisted cache while authority is unresolved.
  - `resolveProjectChatComposerExecutableNativeSlashCommandTokens(...)` returns executable native tokens only from authoritative runtime metadata when `agentRunsAuthorityState === "ready"`.
- Updated `resolveProjectChatComposerSlashCommandSets(...)` so recognized native slash commands and executable native slash commands are built from separate inputs instead of collapsing both into one token list.
- Extended `ChatInput` with an explicit unavailable-native slash-command recovery path so a recognized-but-unavailable native command triggers metadata reload/re-resolution instead of direct submission.
- Kept the existing unknown-slash reload path for truly unresolved slash-prefixed input, but prevented cached native commands from bypassing the fail-closed guard via the executable command list.
- Refactored backend custom-skill writes into:
  - `_write_new_custom_skill_doc(...)` using exclusive create mode (`open(\"x\")`) so late create collisions fail instead of clobbering existing content.
  - `_write_existing_custom_skill_doc(...)` using non-creating update mode (`open(\"r+\")`) so missing targets fail instead of being recreated.
- Moved `upsert_app_gen_custom_skill(...)` onto those two write helpers so the create-vs-update invariant is enforced at the syscall boundary rather than only by stale preflight `exists()` checks.

### UX/DX before and after
- Before: A cached `/deploy` or similar native external-agent command could appear authoritative on first render and submit immediately even while runtime agent metadata was still loading or degraded.  
  After: Cached native commands still reserve the namespace and remain visible to the user, but submission stays fail-closed until runtime authority is ready, with reload feedback instead of stale execution.
- Before: The slash-command state model mixed \"recognized\" and \"executable\" into the same derived list, which made startup/degraded behavior hard to reason about and easy to regress.  
  After: Recognition and executability are separate, explicit concepts, which makes the runtime authority model simpler to trace and test.
- Before: Custom-skill save/update behavior relied on preflight existence checks, so concurrent changes could silently resurrect deleted skills or overwrite newly created ones.  
  After: Late create/update races fail deterministically with the same user-facing collision/missing-target semantics the UI already promises.
- Before: Backend reasoning about custom-skill writes depended on timing between validation and write.  
  After: The write mode itself expresses the invariant, which is both more robust and easier to audit.

### Validation coverage added or updated
- Frontend Vitest coverage for:
  - executable native slash commands remaining empty until authority is ready,
  - cached native slash commands staying recognized but unavailable during unresolved authority states,
  - fail-closed parsing of cached native slash input before authority resolves.
- Backend pytest coverage for:
  - update-by-`skillId` failing when the target disappears immediately before the update write path,
  - create-by-`relativePath` failing without overwrite when another writer wins immediately before the create write path,
  - route-level verification of both late collision and late deletion behavior.
- Playwright E2E coverage for:
  - blocking custom slash creation while native command authority is still loading,
  - cached native slash command submission staying fail-closed until delayed `getAgentRuns` authority resolves, then submitting exactly once after re-resolution.
- Manual Chrome DevTools MCP verification:
  - opened Project AI Chat on the headed worktree instance,
  - verified the Slash Commands side view still renders correctly,
  - verified return-to-chat composer layout remains intact after the slash-command authority changes.
