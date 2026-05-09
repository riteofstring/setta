# Test Quality Cleanup Plan

## Goal
Clean up tests so they pass the repository's code quality metrics while staying useful as tests.

The metrics are guardrails, not the design goal. A cleanup is successful when the test is easier to read, easier to debug, and still covers the same behavior.

## Active Checks
- `./scripts/quality/check.sh --all` is the main quality gate.
- Test file-length limits are configured in `quality.paths.yaml`:
  - Python tests: `1000` lines
  - TypeScript tests: `1800` lines, with only documented narrow exceptions
  - Go tests: `2000` lines
- Python tests are covered by Ruff and C901 complexity checks.
- Go and TypeScript test complexity should remain report-driven until a cleaned baseline is stable.
- Test-only dead-code findings should stay separate from production dead-code findings.

## Guardrails
- Do not delete coverage just to satisfy a metric.
- Do not split files by arbitrary line count when the result is harder to navigate.
- Keep tests close to the package, route, component, or workflow they cover.
- Prefer focused tests, subtests, table-driven expectations, and local fixtures over generic shared helpers.
- Extract helpers when they remove repeated setup or name a real domain step.
- Avoid broad helper layers, compatibility shims, or test-only abstractions that only exist to make metrics pass.

Most important caution: when reducing test complexity, do not just move a stateful scenario into opaque `assert...` helpers; keep setup, mutation, and verification visibly sequenced, or split the case into focused tests.

For helper naming:
- `assert...` helpers should only inspect state and fail with a specific message.
- Helpers that write files, mutate stores, call services, advance timers, or send websocket messages should be named for that side effect, such as `seed...`, `write...`, `run...`, `update...`, or `restore...`.

## Work Plan
1. Run the quality gate or the relevant focused quality command.
2. Identify the test files or functions that fail the current metrics.
3. Clean them up by preserving behavior and improving local readability.
4. Prefer splitting by behavior or extracting narrowly scoped fixtures before adding new shared abstractions.
5. Re-run focused tests for the touched package or spec.
6. Re-run `./scripts/quality/check.sh --all` before considering the cleanup done.

## Verification
- Go: `./scripts/run_go_tests.sh ./internal/<package>` or the relevant package path.
- Python: `source activate.sh && pytest <paths>`.
- Frontend unit/integration: `pnpm -C frontend exec vitest run <paths>`.
- Playwright: `./scripts/run-playwright-e2e.sh <specs>`.
- Quality gate: `./scripts/quality/check.sh --all`.

## Acceptance Criteria
- The quality gate passes.
- Focused tests for touched areas pass.
- Test coverage is preserved.
- Refactored tests are easier to scan and fail with useful messages.
- Stateful setup and ordered behavior remain visible at the call site.
