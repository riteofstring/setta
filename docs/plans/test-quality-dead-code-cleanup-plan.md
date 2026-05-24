# Test Quality Cleanup Plan

## Goal
Clean up the current test quality backlog so every tracked test covered by the
repository quality gate passes the configured metrics while staying useful as a
test.

The metrics are guardrails, not the design goal. A cleanup is successful when the test is easier to read, easier to debug, and still covers the same behavior.

Executing this plan means clearing the backlog, not reducing it. The plan is not
done while `./scripts/quality/check.sh --all` still reports any test complexity
or test file-length violation.

## Active Checks
- `./scripts/quality/check.sh --all` is the main quality gate.
- Test file-length limits are configured in `quality.paths.yaml`:
  - Python tests: `1000` lines
  - TypeScript tests: `1200` lines, with only documented narrow exceptions
  - Go tests: `1500` lines
- Python tests are covered by Ruff and C901 complexity checks.
- TypeScript tests are covered by ESLint complexity-only checks at complexity `>= 10`.
- Go tests are covered by `gocyclo` checks at complexity `>= 20`.
- Test-only dead-code findings should stay separate from production dead-code findings.

Do not relax thresholds, add broad exclusions, or move tests outside the
configured paths to make the gate pass. Only add a narrow documented exception
when the repository owner explicitly approves that exception.

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
1. Run `./scripts/quality/check.sh --all` first and treat every reported test
   quality failure as in scope.
2. Build the cleanup queue from the full failure output, not only the top
   hotspots in `./scripts/quality/report_complexity.sh`.
3. Clean up each failing test file or function by preserving behavior and
   improving local readability.
4. Prefer splitting by behavior or extracting narrowly scoped fixtures before
   adding new shared abstractions.
5. Use focused commands such as `./scripts/quality/check.sh --files <paths>...`
   and the relevant package/spec tests for the inner loop.
6. Repeat the full `./scripts/quality/check.sh --all` until it exits
   successfully.

## Verification
- Go: `./scripts/run_go_tests.sh ./internal/<package>` or the relevant package path.
- Python: `source activate.sh && pytest <paths>`.
- Frontend unit/integration: `pnpm -C frontend exec vitest run <paths>`.
- Playwright: `./scripts/run-playwright-e2e.sh <specs>`.
- Quality gate: `./scripts/quality/check.sh --all`.

## Acceptance Criteria
- `./scripts/quality/check.sh --all` exits successfully with the current
  configured thresholds.
- No current Python, TypeScript, or Go test file covered by the quality gate
  remains over its file-length limit.
- No current Python, TypeScript, or Go test function covered by the quality gate
  remains over its complexity limit.
- Focused tests for touched areas pass.
- Test coverage is preserved.
- Refactored tests are easier to scan and fail with useful messages.
- Stateful setup and ordered behavior remain visible at the call site.
