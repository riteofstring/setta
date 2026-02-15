# Review 5 (`main...HEAD`)

## Scope
- Compared branch delta only (`git diff --name-status main...HEAD` / merge-base scope).
- Cross-checked against `cumulative_review.md` to avoid re-flagging already-fixed items.
- Spot-validated with targeted tests in this branch state:
  - `pytest -q tests/routers/test_plugin_routes.py` (`37 passed`)
  - `pytest -q tests/start/test_run_backend_tests_script.py tests/start/test_plugin_fixture_target_selection_script.py tests/start/test_plugin_fixture_reset_script.py` (`40 passed`)
  - `pnpm -C frontend exec vitest run src/plugins/runtime.test.ts src/components/Panes/Overview/Plugins/PluginsPane.test.ts src/components/Section/Layouts/PluginArea.test.tsx src/components/AppHeader/PluginRestartBanner.test.tsx` (`115 passed`)

## Findings

### 1. Low: Fixture cache can treat stale plugin frontend build outputs as valid
- Example: `scripts/plugin-fixtures/cache.sh:17` and `scripts/plugin-fixtures/cache.sh:45` explicitly exclude `frontend/dist` from the signature/change-stamp inputs, and `scripts/plugin-fixtures/cache.sh:383` + `scripts/plugin-fixtures/cache.sh:384` only verify output presence/completeness before skipping rebuild.
- Why this matters: if built fixture outputs become stale/corrupted but still exist, cache logic can skip rebuild and keep serving stale assets to backend/Playwright plugin tests.
- Proposed fix: include a lightweight integrity signal for built outputs (for example, hash `frontend/dist/index.js` + `index.css` and/or Vite manifest-referenced files) in the cache key.
- UX/DX before: occasional confusing stale-fixture behavior where tests run against old plugin frontend assets even though source-side signatures are unchanged.
- UX/DX after: cache skips remain fast, but stale artifact drift reliably triggers rebuild, making plugin test behavior more predictable.

### 2. Low: Runtime refresh always flips global plugin status to `loading`, even for no-op updates
- Example: `frontend/src/plugins/runtime.ts:345` sets `status: "loading"` for every refresh cycle, then `frontend/src/plugins/runtime.ts:458` sets back to `"loaded"`.
- Why this matters: it introduces avoidable store churn/rerenders during frequent refreshes, including no-op payload refreshes where most data identities are already reused.
- Proposed fix: keep `status` as `"loaded"` after first successful load and add a separate `isRefreshing` flag for in-flight refresh state.
- UX/DX before: extra subscription churn around each refresh, and status-driven UI can react to transient loading transitions.
- UX/DX after: fewer unnecessary rerenders on no-op refreshes, while preserving explicit first-load/error states.

## Backward-compatibility shim check
- I did **not** find unnecessary backward-compatibility shims in this merge-base delta. The branch generally removes legacy plugin read surfaces and converges on canonical runtime contracts.

## Merge recommendation
- No blocking regressions found from this review pass.
- I would merge, with the two low-severity improvements above tracked as follow-up cleanup/perf hardening.
