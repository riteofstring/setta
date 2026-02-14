# Plugin Test Expansion Plan

Coverage is already strong, but there are still good additions:

1. High: Add lockfile drift tests for source changes, not just version/digest changes.
`backend/setta/plugins/manager.py:3103` and `backend/setta/plugins/manager.py:3131` only compare version/digest; add unit/integration tests where `canonicalSourceKey`/`sourceSpec` changes with same version and assert reinstall/reconcile behavior.

2. High: Add same-scope precedence tests between Setta-managed and package-manager plugins.
`backend/setta/plugins/manager.py:3353` uses `_SOURCE_MANAGER_ORDER`, but current tests mostly cover scope precedence; add a test where both managers provide the same `pluginId` in `setta_files` and assert deterministic primary/shadowed selection.

3. High: Expand parametrized validation tests for backend registration payloads.
Branches in `backend/setta/plugins/manager.py:2028`, `backend/setta/plugins/manager.py:2223`, and `backend/setta/plugins/manager.py:2356` are mostly untested (unknown keys, python language rejection, invalid `settingsKey`, invalid `defaultModel`, malformed args/env lists, etc.).

4. High: Add component tests for restart banner behavior (no direct tests yet).
`frontend/src/components/AppHeader/PluginRestartBanner.tsx:39` should have Vitest coverage for programmatic accepted/rejected/error flows and that `refreshPluginRuntime()` is called after restart attempts.

5. Medium: Add component/integration tests for plugin section fallback actions.
`frontend/src/components/Section/Layouts/PluginArea.tsx:175`, `frontend/src/components/Section/Layouts/PluginArea.tsx:194`, and `frontend/src/components/Section/Layouts/PluginArea.tsx:216` need tests for delete/copy/open-plugins actions and notifications.

6. Medium: Add Playwright scenario for frontend-load-failure plugin fixture.
Use `tests/fixtures/plugins/frontend-errors/setta.plugin.json` to verify runtime/frontend error surfacing and fallback card behavior end-to-end.

7. Medium: Add Playwright test for header restart banner (not only Plugins pane restart controls).
You currently mock restart in `frontend/tests/e2e/overview/plugins-pane.spec.ts:951`; add a header-level regression test so restart-required UX doesn’t drift across panes.

8. Medium: Reduce E2E mocking in codegen-target test.
`frontend/tests/e2e/overview/plugin-codegen-target.spec.ts:14` intercepts `/api/setProjectConfigCodegenTargets`; add a real-endpoint variant that verifies persistence across reload.

9. Medium: Add CLI text-output tests for plugin list formatting branches.
`backend/setta/start.py:2235`, `backend/setta/start.py:2241`, and `backend/setta/start.py:2249` have formatting/error/shadowed branches that are not covered by current mostly-JSON CLI tests.

10. Low: Add worker host-RPC non-object response test branch.
`backend/setta/plugins/worker.py:63` handles non-object host responses; existing worker tests cover many RPC failures but not this exact path.
