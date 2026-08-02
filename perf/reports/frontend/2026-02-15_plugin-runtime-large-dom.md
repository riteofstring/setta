# Plugin Runtime Large-DOM + Plugins Pane

Date: 2026-02-15
Area: frontend
Branch/Commit: plugins @ 08db33e1
Related PR: n/a

## Goal

Improve plugin runtime responsiveness and correctness under large DOM/plugin catalogs while preserving behavior:
- Reduce plugin section re-render churn for 100+ plugin sections.
- Keep plugin frontend load and action UX stable.
- Ensure linked-local plugin affordances are explicit (update/rollback unavailable).

Touched code paths:
- `frontend/src/components/Section/Layouts/PluginArea.tsx`
- `frontend/src/state/actions/sectionInfos.ts`
- `frontend/src/plugins/runtime.ts`
- `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx`
- `tests/fixtures/plugins/frontend/frontend/src/index.js`

## Scenario

- Entry point (URL/route/screen): project page (`/<project>`), Plugins overview pane, fixture plugin sections on React Flow canvas.
- Steps to reproduce:
  1. Open Plugins overview with fixture frontend plugin enabled.
  2. Create 110 plugin sections (`fixture-card`) across the viewport.
  3. Trigger `Fixture Command`.
  4. Measure render counters + command summary; profile interaction with DevTools trace.
- Data set / project used: local dev project (`shark_buying`) with fixture frontend plugin.
- Browser + OS: Chrome (CDP MCP), macOS.
- Notes: no throttling; existing running CDP/browser session (no new app startup).

## Before (baseline)

- Measurement method (DevTools panels used, settings): pre-fix automated perf guard (`frontend/tests/e2e/overview/plugin-sections-large-dom.spec.ts`) plus branch-local repros.
- Key metrics:
  - Guard budget: `totalRenders < 2200`.
  - Pre-fix reproducible runs (from Review 6): `6881`, `6940`.
  - Additional branch-local pre-fix repro: `3569`.
- Observations:
  - Large plugin-section creation caused excessive rerenders and failed the guard consistently.
  - Plugins pane allowed dead-end linked-local update/rollback actions.

## After

(Appended after refactor, same scenario.)

- Key metrics:
  - CDP scenario (110 sections):
    - After creation: `totalRenders=220`, `uniqueSectionsRendered=110`, `maxRendersForAnySection=2`.
    - After fixture command: `totalRenders=330`, `maxRendersForAnySection=3`.
  - Fixture command summary observed:
    - `backend list:200 status:200` (with plugin/backend counts in summary).
  - DevTools trace (`NO_NAVIGATION` insight set):
    - INP: `226 ms` (pointerdown)
    - Processing: `106 ms`
    - Presentation: `119 ms`
- Observations:
  - Large-DOM rerender behavior is now bounded and far below prior failing levels.
  - Linked-local plugin UX is explicit in-pane (disabled Update/Rollback + guidance), avoiding guaranteed-failure actions.
  - Backend roundtrip in fixture command is stable and visible in summary text.

## Conclusion

- What improved:
  - Large-DOM plugin section rerender churn dropped significantly (order-of-magnitude reduction vs failing baseline).
  - Plugin command smoke path now reliably reports backend statuses.
  - Plugins pane action affordances now match backend capabilities for linked-local sources.
- What regressed (if any) + why it is acceptable:
  - None observed in targeted automated and manual verification.
- Follow-ups:
  - Optional: drive INP below 200 ms in this scenario by reducing presentation delay around command-triggered card updates.

## Raw Artifacts (local-only)

- `perf/artifacts/frontend/2026-02-15-plugin-sections-command-after.trace.json`
- `perf/artifacts/frontend/2026-02-15-plugins-pane-linked-local.png`

## Automated Perf Tests

- Playwright spec(s):
  - `frontend/tests/e2e/overview/plugin-sections-large-dom.spec.ts`
  - `frontend/tests/e2e/overview/plugins-pane.spec.ts`
- Vitest test(s) / bench(es):
  - `frontend/src/state/actions/sectionInfos.test.ts`
  - `frontend/src/plugins/runtime.test.ts`
  - `frontend/src/components/Panes/Overview/Plugins/PluginsPane.test.ts`
- Budgets/assertions added:
  - Large-DOM render budget retained (`totalRenders < totalSections * 20`) and now passing.
