## 1. Merge recommendation + top risks

Do not merge yet.

Top risks:
- The Skills pane no longer has an authoritative source of truth for the custom-skill create root, so the UI can advertise and reveal one path while the create endpoint writes somewhere else.
- The project-chat composer still reserves native slash commands from stale historical runs instead of the active engine set plus newest metadata, so valid custom commands can be blocked incorrectly.

Priority check:
- Priority 1 correctness/invariants: 2 findings below.
- Priority 2 dead code: 1 dead branch left behind; no dead files found.
- Priority 3 backward-compatibility shims: still present; inventory below.

## 2. Findings by root-cause cluster

### Cluster A: Custom-skill create metadata is no longer authoritative

Violated invariant: The UI must not claim a custom-skill create destination unless it is the same destination the backend will actually write to.

Finding:
- Severity: `medium`
- Merge risk: `major`
- Concrete evidence: `backend/setta/routers/app_gen_extensions.py:226-239` resolves the actual create target by probing writable roots, but `backend/setta/routers/app_gen_extensions.py:243-249` and `backend/setta/routers/app_gen_extensions.py:327-340` return only the first preferred root for `GET /getAppGenSkills`. The frontend then treats that GET field as authoritative in `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx:841-853` and renders/reveals it in `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx:1924-1947`, even though create uses the POST response root in `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx:1599-1615`.
- Prior decision reopened: `cumulative_review.md:199-220` explicitly resolved that the displayed path, create target, and open action must share one source of truth. The later change at `cumulative_review.md:253-255` split GET display from POST write selection, and the current code now reintroduces the mismatch.
- Principled fix: Restore a single backend contract for create-root resolution. Either make `GET /getAppGenSkills` return the same authoritative writable root that POST will use, or remove the pre-create “Custom skills root” label/open action until the backend can expose an authoritative write destination without side effects. Do not keep a display-only path that can diverge from the actual write target.
- UX/DX before vs after fix: Before, the Skills view can tell the user “Custom skills root: X”, open X in Finder, and then create the new skill under Y. After, the rendered path/open action either match the real write location exactly or are omitted with an explicit unavailable state.
- Regression tests to add/update:
- Backend unit test: with unwritable `AGENTS_HOME/skills` and writable `~/.agents/skills`, assert the GET contract and POST create contract agree exactly on the root path, or assert GET exposes no create root and a non-null error if that is the chosen product behavior.
- Frontend Vitest: mock GET returning a create-root field plus POST returning a different `rootPath`, then assert the component never keeps rendering/revealing the stale GET path as the active create destination after refresh.
- Playwright E2E: create a custom skill in the unwritable-primary-root scenario and assert the visible “Custom skills root” text and the path opened by the “Open” button match the file location returned by the create response.

### Cluster B: Composer native slash-command reservation still uses stale run metadata

Violated invariant: Project-chat slash-command reservation must be derived from the active project’s active engine set and newest run metadata per engine, not from any historical run that happens to exist in the project.

Finding:
- Severity: `high`
- Merge risk: `major`
- Concrete evidence: `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx:1234-1241` correctly scopes persisted fallback metadata by `engineConfigIds`, but `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx:1322-1326` computes runtime native tokens by calling `collectAgentNativeSlashCommandTokensFromRuns(filterRunsByProjectConfigId(...))`. That helper, in `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.ts:824-854`, blindly unions every `agentNativeSlashCommands` array across all project runs, with no active-engine filter and no newest-run-wins logic. The branch already has the authoritative resolver in `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx:498-544`, but the composer does not use it.
- Prior decision reopened: `cumulative_review.md:195-205` and `cumulative_review.md:247-255` record that native slash reservations were supposed to be limited to the current project, current engine IDs, and newest run per engine. The current composer path still violates both constraints.
- Principled fix: Extract the authoritative per-engine resolver used by the Slash Commands viewer into shared logic, then make the composer flatten tokens from that resolved map. Delete the union-based `collectAgentNativeSlashCommandTokensFromRuns` path from composer reservation logic so there is exactly one source of truth.
- UX/DX before vs after fix: Before, an old or removed engine can keep `/deploy` reserved forever, and a newer run that reports “none” cannot clear an older token. After, slash reservations track the actual current engine set and latest metadata, so only real native commands block custom commands.
- Regression tests to add/update:
- Frontend Vitest: given two runs for the same engine where the older run exposes `["/deploy"]` and the newer run reports no native commands, assert the composer’s resolved runtime native token list is `[]`.
- Frontend Vitest: given runs for `engine-live` and `engine-dead`, with `engineConfigIds = ["engine-live"]`, assert the composer reserves only `engine-live` tokens and ignores `engine-dead`.
- Frontend integration test: assert a custom `/deploy` command remains addable/executable when the latest active-engine metadata no longer exposes `/deploy`, even if historical runs in the same project once did.

No additional priority-1 correctness issues were found in the reviewed diff after applying the branch-intent and cumulative-review guardrails.

## 3. Dead code inventory

- `customSkillCreateRootError` is effectively dead in the current implementation. `_iter_prioritized_custom_skill_roots()` always returns at least one fallback path in `backend/setta/routers/app_gen_extensions.py:179-182`, so `_resolve_preferred_custom_skill_root()` in `backend/setta/routers/app_gen_extensions.py:243-249` cannot practically fail, which makes the error branch in `backend/setta/routers/app_gen_extensions.py:327-340` unreachable for normal execution.
- The union-based helper `collectAgentNativeSlashCommandTokensFromRuns` in `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.ts:824-854` encodes obsolete semantics and should be removed once the composer is switched to the authoritative per-engine resolver already used by the Slash Commands viewer.

No dead files or obviously unused feature branches were found beyond the inventory above.

## 4. Backward-compatibility shim inventory

- `frontend/src/utils/constants.ts:21-34` still carries removed top-level overview tabs (`WatchCode`, `BackendLogs`, `ProjectAISettings`) as first-class enum values.
- `frontend/src/state/definitions.ts:1150-1156` silently migrates persisted `BackendLogs` to `Notifications/backend_logs` and `WatchCode` to `Overview`.
- `frontend/src/components/Panes/Overview/Overview.tsx:110-125` and `frontend/src/components/Panes/Overview/Overview.tsx:144-155` still remap legacy `ProjectAISettings` and `BackendLogs` states at render time.
- `frontend/src/state/actions/backendLogEvents.ts:19-31` still treats legacy top-level `BackendLogs` as a visible destination.

No other branch-added compatibility shims stood out in the reviewed diff.

## 5. Regression test plan

- Add a backend pytest that exercises unwritable-primary-root plus writable-fallback-root and asserts the exposed create-root contract is identical to the actual POST write destination, or intentionally absent with an explicit error.
- Add a frontend Vitest around project-chat composer native-token resolution that asserts active-engine filtering and newest-run-wins behavior, using two runs for the same engine plus one removed engine.
- Add a frontend integration/Vitest case that proves a historical native token cannot keep a valid custom command disabled once the latest active-engine metadata removes that token.
- Add a Playwright regression that creates a custom skill under a fallback root and asserts the Skills UI’s displayed root/open action matches the actual created file location.

## 6. `branch_intent.md` alignment check

Respected:
- I did not flag the Project AI aux-view split, persistent aux-tab switching, Watch Code portal relocation, More-menu rail reorganization, Follow AI default change, runtime activity dropdowns, or custom skill authoring itself as regressions; those are consistent with `branch_intent.md`.
- I did not recommend reverting the new slash-command system, rendered/raw skill editor modes, or the Notifications + Logs combined pane, because the diff and tests show those are intentional branch behavior changes.

True regressions with evidence:
- The custom-skill root label/open action no longer stay aligned with the actual create target, despite the earlier resolved decision in `cumulative_review.md:199-220`; the current split between GET preferred-root display and POST writable-root selection in `backend/setta/routers/app_gen_extensions.py:226-249` and `backend/setta/routers/app_gen_extensions.py:327-340` reintroduces the mismatch.
- The composer still reserves native slash tokens from stale project runs, despite the resolved decision in `cumulative_review.md:195-205` and `cumulative_review.md:247-255`; the current runtime path in `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx:1322-1326` plus `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.ts:824-854` does not enforce active-engine scoping or newest-run-wins.
