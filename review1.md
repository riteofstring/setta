# 1. Merge recommendation + top risks

Do not merge as-is.

Top risks:
- The branch reopens the previously resolved fail-closed slash-command invariant when agent-run loading ends in `terminal_error`, so reserved native tokens can become executable custom commands again during degraded startup.
- The new custom-skill root banner/Open action is not authoritative: it can point at a non-existent directory on fresh setups and can point at a different root than the one the backend actually used for create.

Priority-category summary:
- Correctness bugs: 2 findings below.
- Dead/unused code: 1 concrete item below.
- Backward-compatibility shims: present; inventory below.
- No additional priority-1 correctness bugs stood out in the reviewed `main...HEAD` scope after these.

# 2. Findings by root-cause cluster

## Cluster: Native slash-command authority is keyed to “load complete” instead of “runtime-authoritative”

- Severity: `high`
- Merge risk: `major`
- Concrete evidence: `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx:186` returns `runtimeNativeSlashCommandTokens` whenever `agentRunsInitialLoadComplete` is `true`. `frontend/src/state/actions/ai.ts:984`-`frontend/src/state/actions/ai.ts:988` marks repeated load failure as `agentRunsAuthorityState: "terminal_error"` while also setting `agentRunsInitialLoadComplete: true`. `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx:1338` then rebuilds slash-command availability from that emptied native-token set. This reopens the resolved fail-closed decision documented in `cumulative_review.md:52`, `cumulative_review.md:113`, and `cumulative_review.md:196`.
- Violated invariant: Native/reserved slash tokens must stay reserved until the runtime has produced an authoritative run snapshot; “load attempt finished with error” is not authoritative.
- Principled fix that removes the whole issue class: Drive native-token source selection from authority state, not from the generic “initial load complete” bit. Keep persisted native tokens merged in until `agentRunsAuthorityState === "ready"` (or another explicit authoritative-ready signal), and only then switch to runtime-only tokens.
- UX/DX before vs after fix: Before, a cold-start agent-run outage can make a reserved token like `/deploy` stop being reserved, so a colliding custom command becomes executable and the composer does the wrong thing. After, the composer remains fail-closed under startup degradation and only relaxes reservations after a successful authoritative load.
- Regression tests to add/update: Add a unit test for `resolveProjectChatComposerNativeSlashCommandTokens` asserting persisted tokens are still returned when the authority state is `terminal_error` and runtime tokens are empty. Add an integration test for `ProjectChatCore` asserting a custom `/deploy` command stays non-executable, but still recognized as unavailable, when persisted native tokens contain `/deploy` and agent-run loading has failed terminally.

## Cluster: Custom-skill root display/open state has split sources of truth

- Severity: `medium`
- Merge risk: `major`
- Concrete evidence: `backend/setta/routers/app_gen_extensions.py:327` returns `customSkillCreateRootPath` from `_resolve_preferred_custom_skill_root`, but `backend/setta/routers/app_gen_extensions.py:427` creates via `_resolve_writable_custom_skill_root`, which can choose a different path. `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx:1614` briefly adopts the actual `res.data.rootPath`, then `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx:1634` calls `refreshSkillsBrowser()`, and `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx:852` overwrites the banner back to the GET-time preferred root. `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx:1940` enables `Open` for any non-empty path, while `backend/setta/routers/status.py:366` hard-fails reveal on missing paths. The branch’s own route test at `tests/routers/test_app_gen_extensions_routes.py:1179` asserts GET can return a `customSkillCreateRootPath` whose directory still does not exist.
- Violated invariant: The root path surfaced in the UI must be the same actionable location the backend will actually use for create, or it must be explicitly marked non-actionable.
- Principled fix that removes the whole issue class: Make the backend expose one authoritative create-root contract. Either return the exact next create target plus an `exists/actionable` flag without mutating the filesystem, or return no openable root until create resolves one. The frontend should never overwrite a successful create root with a different display-only path, and `Open` should be disabled whenever the backend says the path is not actionable.
- UX/DX before vs after fix: Before, `Open` can 404 on fresh workspaces, and after a successful fallback create the “Custom skills root” label can point back to the wrong directory, so users look in the wrong place for the skill they just created. After, the label/Open action always track the real create target, and non-existent roots are clearly non-actionable instead of surfacing as broken controls.
- Regression tests to add/update: Add a backend unit/route test asserting GET and create agree on the effective root when the highest-priority root is unwritable, or that GET explicitly returns a non-actionable root state. Add a frontend component/E2E test asserting that after a successful create the root banner and Open action still reference `res.data.rootPath`, and that the Open control is disabled when the returned root does not exist yet.

# 3. Dead code inventory

- `backend/setta/routers/app_gen_extensions.py:327`, `backend/setta/routers/app_gen_extensions.py:243`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx:770`, and `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx:1929` carry a `customSkillCreateRootError` pathway that is effectively unreachable. `_iter_prioritized_custom_skill_roots()` always returns at least the fallback user root, so `_resolve_preferred_custom_skill_root()` never meaningfully fails in current code. Remove the dead response field/frontend state/UI branch, or replace it with a resolver that can actually emit a real error state.

# 4. Backward-compatibility shim inventory

These are branch-introduced/expanded compatibility paths that should be removed per the review rules:

- Legacy `BackendLogs` overview-tab remap: `frontend/src/state/definitions.ts:1150`, `frontend/src/components/Panes/Overview/Overview.tsx:124`, and `frontend/src/state/actions/backendLogEvents.ts:25` still keep the removed top-level `BackendLogs` tab alive as a special case.
- Legacy `WatchCode` overview-tab remap: `frontend/src/state/definitions.ts:1155` still rewrites the removed `WatchCode` tab to `Overview`.
- Legacy `ProjectAISettings` overview-tab remap: `frontend/src/components/Panes/Overview/Overview.tsx:113` and `frontend/src/components/Panes/Overview/Overview.tsx:120` still translate the removed top-level `ProjectAISettings` tab into `ProjectAIChat`.

Removal direction:
- Drop the removed tab keys from the current runtime path, stop special-casing them during render/unread logic, and treat old persisted values as invalid state that falls back through the normal current-tab validation path instead of perpetual remap code.

# 5. Regression test plan

- Add a unit test covering `terminal_error` startup reconciliation: persisted native tokens must remain reserved until agent-run authority is actually `ready`.
- Add a composer integration test where persisted native `/deploy` collides with a custom `/deploy` while runtime agent runs are unavailable; assert the custom command is not executable and the feedback stays “Unknown or unavailable command. Use /help.”
- Add a backend test for custom-skill root agreement under unwritable high-priority roots; exact assertion: the root surfaced to the client is either the real create root or explicitly marked non-actionable.
- Add a frontend component/E2E test for the skills root banner; exact assertions: `project-chat-custom-skill-root-path` and the Open action continue to reference the created `rootPath` after create, and Open is disabled when the root path does not exist.
- Add shim-removal hydration tests; exact assertion: persisted `BackendLogs`, `WatchCode`, and `ProjectAISettings` values are treated as invalid legacy state and no longer trigger special-case remap branches.

# 6. `branch_intent.md` alignment check

Respected:
- I did not flag the first-class custom-skill authoring flow itself, the split Project AI aux views, the richer skills viewer, the slash-command expansion, the notifications/logs combined pane, or the watch-code portal move as regressions. Those all read as intentional branch scope.
- The review does not recommend reverting intentional UX changes documented in `branch_intent.md`.

True regressions with evidence:
- The slash-command startup path violates the branch’s own fail-closed intent under `terminal_error`, because “initial load complete” is currently treated as authoritative even when the load never succeeded.
- The custom-skill root banner/Open control violates the branch’s authoring-path intent because the surfaced root is not a trustworthy representation of where create will actually write, and it can be non-actionable.

Non-intent items intentionally challenged:
- The legacy tab remaps listed in the backward-compatibility inventory are intentionally excluded from branch-intent protection by the review rules, so they are still called out for removal.
