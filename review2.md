# Review: `main...HEAD`

## Findings

1. **Medium — Selector-only test runs can skip needed plugin fixture rebuilds (stale-fixture risk).**
- **Where:** `scripts/plugin-fixtures/cache.sh:596` (selector-only branch in `should_build_plugin_fixtures_for_targets`).
- **Concrete example:**
  - Command: `source scripts/plugin-fixtures/cache.sh; should_build_plugin_fixtures_for_targets "$PWD" "playwright" --grep "runtime endpoint errors" && echo build || echo skip`
  - Current result: `skip`
  - But this selector can target plugin E2E tests (for example `frontend/tests/e2e/overview/plugins-pane.spec.ts`).
- **Why this matters:** with changed plugin fixtures, selector-only runs can execute against stale built artifacts and produce misleading local results (false pass/fail).
- **Proposed fix:** when `has_selector_filter==1` and no positional target, resolve selected tests before deciding to skip fixture prep.
  - `pytest`: use a fast `--collect-only` pass and detect plugin-targeted nodeids.
  - `playwright`: use `playwright test --list` (or equivalent listing mode) and detect plugin-targeted files.
  - Keep current fast-path skip only when collection proves no plugin-targeted tests.
- **UX/DX before:** fast local loops, but selector-only commands can silently run with stale plugin fixtures.
- **UX/DX after:** same fast path for non-plugin selectors, but plugin-targeted selector runs become deterministic/correct without requiring manual env overrides.

## Backward-Compatibility / Redundancy Check

- I did **not** find new unnecessary backward-compatibility shims in this branch diff; the plugin runtime/read API consolidation and legacy route removals are consistent with `cumulative_review.md`.
- Outside the finding above, I did not find a merge-blocking redundant/unused-code issue in the added branch delta.

## Merge Recommendation

- **Mergeable with caution.**
- If your team relies on selector-only local runs (`-k` / `--grep`) for plugin tests, I recommend fixing the fixture-selection edge case first.

## Validation I ran

- `pytest -q tests/start/test_start_plugins.py tests/routers/test_plugin_routes.py` -> `67 passed`.
- `pnpm -C frontend exec vitest run src/plugins/runtime.test.ts src/components/Panes/Overview/Plugins/PluginsPane.test.ts` -> `97 passed`.
