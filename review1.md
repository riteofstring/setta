# Branch Review (main...HEAD)

Scope reviewed: `git diff --name-status main...HEAD` and cumulative fixes in `cumulative_review.md`.

## Findings

1. Low: silent cleanup failures are swallowed in GC fallback path
- Example: `PluginManager.__del__` suppresses all exceptions and returns silently (`backend/setta/plugins/manager.py:497`).
- Why this matters: this path is a redundant fallback on top of explicit shutdown hooks, and when it does run, any teardown failure is invisible.
- Proposed fix: either remove `__del__` and rely only on explicit lifecycle shutdowns, or keep it but log the exception (at least debug/error) before returning.
- UX/DX before: intermittent worker teardown issues can be hard to diagnose because no signal is emitted.
- UX/DX after: failures become observable and actionable; less time spent debugging hidden process-leak/teardown behavior.

2. Low: unknown overview tab keys can render fallback content with no active tab highlight
- Example: `effectiveTabName` is only normalized for missing plugin-pane tabs, while `TabContent` defaults to `<ProjectOverview />` (`frontend/src/components/Panes/Overview/Overview.tsx:87`, `frontend/src/components/Panes/Overview/Overview.tsx:425`).
- Why this matters: if an unexpected tab key gets persisted (stale/corrupt local storage), UI content and tab-selection state can diverge.
- Proposed fix: add a canonical `isKnownOverviewTabKey(...)` guard and normalize unknown keys to `Overview` (and persist corrected selection).
- UX/DX before: user can see Overview content with no tab selected, which looks broken/confusing.
- UX/DX after: deterministic tab selection and consistent visual state even with stale persisted keys.

## Redundant/Unused/Inefficient Code Check
- No merge-blocking redundant/unused code stood out in the net-new plugin runtime/manager/route surface.
- No unnecessary backward-compatibility shims found in current branch additions; the branch is mostly moving toward canonical plugin contracts/routes.

## Merge Recommendation
- No blocker found from this review.
- I would merge after (or alongside) the two low-severity cleanups above.

## Spot Validation I Ran
- `pnpm -C frontend exec vitest run src/plugins/runtime.test.ts` (73 passed)
- `pnpm -C frontend exec vitest run src/components/Panes/Overview/Plugins/PluginsPane.test.ts` (24 passed)
- `source activate.sh && pytest tests/routers/test_plugin_routes.py -q` (37 passed)
- `source activate.sh && pytest tests/plugins/test_plugin_manager.py -q -k 'runtime_response or restart_capability or restart_backend'` (7 passed)
