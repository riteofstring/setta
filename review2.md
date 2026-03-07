# 1. Merge recommendation + top risks

Do not merge yet.

Top risks:
- Stale native slash-command metadata can still reserve commands from removed or outdated engine runs, blocking valid custom commands in the Project AI composer.
- The Skills UI can display and reveal one “custom skills root” while the create mutation writes to a different root.
- The Watch Code relocation dropped the old deployment/share-mode visibility gate, so the control is now exposed from React Flow controls unconditionally.

No separate design-only findings stood out beyond the root-cause issues below.

# 2. Findings by root-cause cluster

## Cluster: Runtime authority is still derived from stale run metadata

Violated invariant: only the current project's active engines, using newest-run-wins per engine, may reserve native slash-command tokens in composer state.

- Severity: `high`
- Merge risk: `major`
- Concrete evidence: [ProjectChatCore.tsx](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx#L1322) collects runtime native tokens from every run in the project via `collectAgentNativeSlashCommandTokensFromRuns(filterRunsByProjectConfigId(...))`. [projectChatSkillsMcpViewerUtils.ts](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.ts#L824) then unions `agentNativeSlashCommands` across all passed runs and never filters by active `engineConfigId` or `getRunLastUpdatedMs()`. That reopens the already-resolved decision recorded at [cumulative_review.md](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/cumulative_review.md#L195) and [cumulative_review.md](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/cumulative_review.md#L247).
- Principled fix that removes the whole issue class: delete the composer-only union helper and reuse a single authoritative helper that accepts `projectConfigId` plus active `engineConfigIds`, filters out stale engines, and resolves newest-run-wins per engine before returning reserved native tokens.
- UX/DX before vs after fix: before, a removed engine or older run can keep `/deploy` reserved and make a valid custom command fail closed as “unavailable”; after, only native commands from active engines on the newest relevant runs can reserve tokens.
- Regression tests to add/update: add a unit test for composer token resolution where project `A` has runs for `engine-live` and `engine-removed`, with `/deploy` only on `engine-removed`; assert `/deploy` is excluded once `engineConfigIds` only contains `engine-live`. Add a unit test with two runs for the same engine where the older run reports `["/deploy"]` and the newer run reports `[]`; assert runtime native tokens are empty after `agentRunsInitialLoadComplete === true`.

## Cluster: Skills create flow no longer has a single source of truth for target root

Violated invariant: the root shown to the user and opened from the UI must be the same root that the create mutation writes to.

- Severity: `medium`
- Merge risk: `major`
- Concrete evidence: [app_gen_extensions.py](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/backend/setta/routers/app_gen_extensions.py#L243) and [app_gen_extensions.py](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/backend/setta/routers/app_gen_extensions.py#L327) return the first prioritized root for display, while [app_gen_extensions.py](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/backend/setta/routers/app_gen_extensions.py#L427) still chooses the first writable root for create-time writes. The UI renders and reveals that display path at [ProjectChatSkillsMcpViewer.tsx](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx#L1924). In a local repro with `AGENTS_HOME/skills` unwritable and `~/.agents/skills` writable, `GET /getAppGenSkills` returned the AGENTS_HOME path while `POST /upsertAppGenCustomSkill` created `user_agents_skills::demo-skill` under `~/.agents/skills`. That reopens the prior single-source-of-truth decision recorded at [cumulative_review.md](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/cumulative_review.md#L199).
- Principled fix that removes the whole issue class: make root resolution single-path. Either return the actual writable create target from a side-effect-free writability check, or stop exposing a specific “custom skills root” path until the create route resolves it. Do not keep separate display-root and write-root logic.
- UX/DX before vs after fix: before, “Open” can take the user to one folder while “Create” writes into another; after, the displayed folder, reveal action, and created file all agree.
- Regression tests to add/update: add a backend test with unwritable `AGENTS_HOME/skills` and writable `~/.agents/skills`; assert `GET /getAppGenSkills` returns the same root path that `POST /upsertAppGenCustomSkill` reports in `rootPath`. Add an E2E test that seeds differing display/write roots and asserts the UI’s “Custom skills root” path matches the created skill’s actual parent directory.

## Cluster: The Watch Code relocation widened feature availability

Violated invariant: moving a control must not silently remove the previous deployment/share-mode visibility gate.

- Severity: `medium`
- Merge risk: `minor`
- Concrete evidence: [Overview.tsx](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/frontend/src/components/Panes/Overview/Overview.tsx#L94) still derives deployment-mode visibility gates for other overview surfaces, but Watch Code no longer participates after its rail tab was removed. [Controls.tsx](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/frontend/src/forks/xyflow/controls/Controls.tsx#L67) and [Controls.tsx](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/frontend/src/forks/xyflow/controls/Controls.tsx#L302) render `rf__watch-code-settings` unconditionally and never read deployment/share visibility state. [WatchCodePane.tsx](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/frontend/src/components/Panes/Overview/WatchCode/WatchCodePane.tsx#L23) only disables editing after the portal is already visible.
- Principled fix that removes the whole issue class: centralize Watch Code availability in one selector shared by both the old rail logic and the new controls portal, and gate rendering before the button exists.
- UX/DX before vs after fix: before, deployment/share users can now see an internal Watch Code surface that used to be hidden entirely; after, relocation preserves the old availability contract and only eligible users see the control.
- Regression tests to add/update: add a component test rendering controls in deployment/share mode and assert `queryByTestId("rf__watch-code-settings")` is `null`. Add a Playwright deployment/share-session test asserting the Watch Code controls button and portal never appear.

# 3. Dead code inventory

- `customSkillCreateRootError` is effectively dead. [_resolve_preferred_custom_skill_root()`](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/backend/setta/routers/app_gen_extensions.py#L243) always has at least one fallback path from `_iter_prioritized_custom_skill_roots()`, so the `except ValueError` branch in [app_gen_extensions.py](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/backend/setta/routers/app_gen_extensions.py#L330) is not reachable in normal flow. The matching frontend error-state plumbing at [ProjectChatSkillsMcpViewer.tsx](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx#L767), [ProjectChatSkillsMcpViewer.tsx](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx#L852), and [ProjectChatSkillsMcpViewer.tsx](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx#L1928) is therefore dead UI state as well.
- No other obvious dead production paths stood out in the scoped diff.

# 4. Backward-compatibility shim inventory (must remove)

- Persisted `BackendLogs` top-level tab migration in [definitions.ts](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/frontend/src/state/definitions.ts#L1150).
- Persisted `WatchCode` top-level tab migration in [definitions.ts](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/frontend/src/state/definitions.ts#L1155).
- Runtime remap of `ProjectAISettings` and `BackendLogs` to current destinations in [Overview.tsx](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/frontend/src/components/Panes/Overview/Overview.tsx#L118) and [Overview.tsx](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/frontend/src/components/Panes/Overview/Overview.tsx#L144).
- Legacy `overviewTab === BackendLogs` visibility path in [backendLogEvents.ts](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/frontend/src/state/actions/backendLogEvents.ts#L19).

# 5. Regression test plan

- Composer/native slash commands: cover active-engine filtering and newest-run-wins in a pure unit test, then add an integration test proving a custom command is executable after a conflicting stale engine run is removed from the active config set.
- Skills root targeting: add a backend route test asserting `GET /getAppGenSkills.data.customSkillCreateRootPath === POST /upsertAppGenCustomSkill.data.rootPath` under mixed writable/unwritable roots, then an E2E test asserting the UI’s displayed root path matches the created skill’s actual directory.
- Watch Code availability: add a deployment/share-mode UI test that `rf__watch-code-settings` is absent, and an E2E deployment/share-mode test that the portal cannot be opened.
- Dead code cleanup: once the create-root contract is settled, remove `customSkillCreateRootError` and its frontend rendering, and keep a route test asserting the response schema only carries fields with reachable semantics.

# 6. `branch_intent.md` alignment check

Respected branch-intent items:
- The branch does deliver first-class custom skill create/update, explicit aux views for Skills/MCP/Slash Commands/AI Settings, the Watch Code portal relocation, the More-menu overview reorganization, custom slash commands, and the merged Notifications/Logs pane.
- I did not flag intentional UX changes such as the Follow AI default, the aux-tab persistence model, or the redesigned skills viewer/editor.

True regressions with evidence:
- The slash-command composer reopens a previously resolved issue: [cumulative_review.md](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/cumulative_review.md#L195) and [cumulative_review.md](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/cumulative_review.md#L247) say native reservations must be scoped to active engines and newest runs, but [ProjectChatCore.tsx](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx#L1322) plus [projectChatSkillsMcpViewerUtils.ts](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.ts#L824) still reserve tokens from all project runs.
- The custom-skill root display reopens a previously resolved source-of-truth issue: [cumulative_review.md](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/cumulative_review.md#L199) says the displayed path and create target should agree, but [app_gen_extensions.py](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/backend/setta/routers/app_gen_extensions.py#L327) and [app_gen_extensions.py](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/backend/setta/routers/app_gen_extensions.py#L427) now diverge under fallback-to-writable-root scenarios.
- The Watch Code deployment/share visibility regression is not called out as intentional in `branch_intent.md`; it appears to be accidental fallout from moving the control into [Controls.tsx](/Users/kevin/Documents/AppDevelopment/setta.chat-refinements/frontend/src/forks/xyflow/controls/Controls.tsx#L302) without carrying forward the old gate.
