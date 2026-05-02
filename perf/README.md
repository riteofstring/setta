# perf/

Append-only performance reports for refactors and performance-focused work.

This folder is intended to keep the repo honest about performance changes (before/after), while keeping large trace artifacts out of git.

## What is tracked in git

- `perf/reports/*.md`: human-readable performance reports (before/after numbers + methodology + conclusions).

## What is NOT tracked in git

- `perf/artifacts/`: exported traces/profiles/screenshots/heapsnapshots (these are often large and machine-specific).

See `perf/.gitignore`.

## Creating a report

1. Copy `perf/reports/_template.md` to `perf/reports/YYYY-MM-DD_<area>_<slug>.md`.
2. Fill in the **Before (baseline)** section before making the refactor.
3. After the refactor, append the **After** section using the same scenario + measurement method.

## Append-only policy

Reports are append-only. If a measurement was wrong or you want to rerun on a different machine/browser, append a new dated section (for example, "Rerun" or "Correction") instead of rewriting prior content.

## Suggested measurements (pick what is relevant)

- DOM complexity: total node count, depth hot spots, number of "canvas" elements, etc.
- JS/TS runtime: DevTools Performance trace totals (scripting, rendering, painting), long tasks, repeated expensive functions.
- React: commit duration / re-render hot spots (if relevant).
- Memory: steady-state heap after N interactions, detached nodes, retained size.

## Tooling

Use `chrome-devtools-mcp` for profiling and verification when performance is a goal. Follow `docs/guides/browser-mcp-quickstart.md` and `docs/guides/verification-checklist.md`.

## Update (2026-02-06): Report Organization

Prefer report files grouped by coarse area (instead of mirroring the repo file tree):

- `perf/reports/frontend/YYYY-MM-DD_<slug>.md`
- `perf/reports/backend/YYYY-MM-DD_<slug>.md`
- `perf/reports/fullstack/YYYY-MM-DD_<slug>.md`

This supersedes the earlier suggestion to place everything directly under `perf/reports/`.

In each report, include a short list of code paths touched (for example `frontend/src/...`, `backend/setta/...`) so readers can map the report back to the codebase without requiring the perf folder to mirror the repo structure.

## Update (2026-02-06): Automated Perf Tests

Prefer automated performance guardrails as the primary enforcement mechanism:

- Playwright: add/update E2E tests that measure and assert coarse performance budgets for the scenario (and/or log metrics for the report).
- Vitest: add/update unit/integration tests (or benches) for hot-path functions/stores when meaningful.

Use DevTools artifacts primarily for investigation and for writing a high-quality report, not as the only "proof" of improvement.
