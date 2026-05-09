# Test Quality And Dead-Code Cleanup Plan

## Goal
Complete the cleanup needed to make test code participate meaningfully in quality, dead-code, and file-length checks across Python, Go, and TypeScript without creating brittle mechanical splits or noisy gates.

## Current State
- Python tests are now covered by Ruff and C901 complexity in `./scripts/quality/check.sh`.
- Python, Go, and TypeScript test files have file-length categories in `quality.paths.yaml`, and the current thresholds are the active ratchets:
  - Python tests: `1000` lines
  - TypeScript tests: `1800` lines, with a narrow exception for the shared Playwright helper module
  - Go tests: `2000` lines
- Current largest files are below those thresholds except for the documented frontend helper exception:
  - Python tests: `tests/start/test_packaged_distribution.py` at `996` lines
  - TypeScript tests: `frontend/src/state/actions/uiSettingReveal.test.ts` at `1767` lines, with `frontend/tests/e2e/helpers.ts` intentionally excepted at `2058` lines
  - Go tests: `internal/httpapi/project_routes_view_modes_test.go` at `1919` lines
- Dead-code analysis has explicit production entrypoints for Go, Python, and frontend TypeScript.
- Dead-code reporting now has advisory test-only lanes for Python, Go, and frontend TypeScript, and aggregate candidates carry `root_scope`.
- Go and TypeScript test complexity are not hard-gated yet.
- Recent cleanup has shifted from large-file splitting to reducing readability and complexity hotspots in Go and TypeScript tests.

## Baseline
Baseline before this cleanup started:
- Python test files over the production Python limit (`1000` lines): `5`
- Go `_test.go` files over the production Go limit (`1200` lines): `42`
- Frontend/TypeScript test files over the production TypeScript limit (`1000` lines): `17`
- Go test complexity had hundreds of functions above the production threshold, with the worst hotspot at `369`.
- Python test lint and Python test C901 complexity are now clean under the current thresholds.

## Non-Goals
- Do not split large tests by arbitrary line count alone.
- Do not lower test value by deleting coverage to satisfy a metric.
- Do not hard-gate Go or TypeScript test complexity until the largest structural files have been split.
- Do not treat production dead-code findings and test-only dead-code findings as the same cleanup class.
- Do not add compatibility shims or helper layers only to satisfy tests.

## Principles
1. Split by behavioral ownership, not by file chunks.
2. Extract shared fixtures only when at least two tests use the same setup or when a test file has become unreadable.
3. Prefer route/service/component-specific test files over generic mega-suite files.
4. Ratchet thresholds after each cleanup batch so regressions are blocked immediately.
5. Keep dead-code findings advisory until the report clearly separates production, tooling, and test-only reachability.
6. Optimize tests for local intent and failure clarity first; complexity scores are a signal, not the goal.

## Work Plan

### 1. Stabilize the New Quality Coverage
- Status: implemented. Keep `./scripts/quality/check.sh --all` passing at the current ratchet thresholds.
- Maintain tests for:
  - `python-test` path selection
  - `go-test` path selection
  - `frontend-test-file-length` path selection
  - file-length reporting for test files
- Keep `scripts/quality/report_file_lengths.sh` reporting test-file overages.
- Keep `scripts/quality/report_complexity.sh` including Python tests.

### 2. TypeScript Test File Cleanup
Status: file-length cleanup is complete at the current `1800` line ratchet, with only the documented shared Playwright helper exception above that threshold.

Continue TypeScript test cleanup only when it improves behavioral locality, removes repeated setup, or prepares a future explicit test ESLint config. Do not split stable E2E specs solely to lower line counts below the current ratchet.

Original targets:
- `frontend/tests/e2e/chat/chat-composer-controls.spec.ts`
- `frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts`
- `frontend/tests/e2e/overview/project-ai/project-ai-chat-skills-mcp-viewer.spec.ts`
- `frontend/tests/e2e/editor/code-section-terminal-attachment.spec.ts`
- `frontend/tests/e2e/overview/project-ai/project-ai-chat-hydration-provenance.spec.ts`

Cleanup approach:
- Split E2E specs by user workflow or route surface.
- Move repeated setup into narrowly named helpers in the closest existing helper module.
- Avoid global helper growth unless multiple directories need the same helper.
- Keep each extracted spec independently understandable.
- Run the affected Playwright specs after every split cluster.

Ratchet history:
- Completed target sequence:
  - `8000` to `6500`
  - `6500` to `5000`
  - `5000` to `3500`
  - `3500` to `2500`
  - `2500` to `1800` with a documented exception for `frontend/tests/e2e/helpers.ts`

### 3. Go Test File Cleanup
Status: file-length cleanup is complete at the current `2000` line ratchet. Go still has the largest complexity backlog, so continue by package ownership and avoid making a broad complexity gate first.

Original targets:
- `internal/httpapi/project_routes_test.go`
- `internal/app/app_test.go`
- `internal/app/mcp_test.go`
- `internal/mcpx/server_test.go`
- `internal/httpapi/ai_routes_test.go`
- `internal/httpapi/mcp_tool_routes_test.go`
- `internal/managedllm/executor_test.go`
- `internal/app/websocket_test.go`
- `internal/mcpx/ui_setting_tools_test.go`
- `internal/wsapi/routes_test.go`

Cleanup approach:
- Split route tests by route group or behavior:
  - project route structure
  - section mutations
  - layout/view-mode mutations
  - chat routes
  - websocket/realtime behavior
- Split app integration tests by product surface:
  - managed chat
  - plugins
  - websocket/listener
  - project shell
  - state-machine runs
- Extract package-local fixtures only when setup is repeated or when it makes test intent clearer.
- Keep helper types in `_test.go` files in the same package unless there is a production ownership reason to create a real package helper.
- Run package tests after each package split.

Ratchet history:
- Completed target sequence:
  - `17000` to `15000`
  - `15000` to `12000`
  - `12000` to `9000`
  - `9000` to `6000`
  - `6000` to `3500`
  - `3500` to `2000`

### 4. Python Test File Cleanup
Status: complete at the current `1000` line ratchet. Python tests are also covered by Ruff and C901 complexity, so only revisit Python test structure when new large files or readability regressions appear.

Original targets:
- `tests/api/test_listener_realtime.py`
- `tests/start/test_run_codex_branch_review_loop_script.py`
- `tests/start/test_packaged_distribution.py`
- `tests/start/test_record_chrome_repro.py`
- `tests/utils/test_setta_paths.py`

Cleanup approach:
- Split by fixture/domain:
  - listener realtime bootstrap, delta processing, binary parsing
  - branch-review loop setup, retry/finalize behavior, stop behavior
  - packaged distribution wheel/sdist/plugin packaging flows
  - Chrome recording collector, wrapper, latest-pointer helper
  - Setta path env/profile/runtime resolution
- Keep fixtures close to tests unless multiple files share them.
- Avoid broad `conftest.py` additions unless sharing is proven.

Ratchet history:
- Completed target sequence:
  - `2000` to `1800`
  - `1800` to `1500`
  - `1500` to `1200`
  - `1200` to `1000`

### 5. Dead-Code Reporting For Tests
Status: implemented as advisory reporting. Keep test-only dead-code separate from production dead-code and continue using it as review input, not as an automatic deletion gate.

Go:
- Keep production Go `deadcode` classification unchanged.
- Use Go test roots to identify helpers/functions live only in tests.
- Do not auto-delete helpers used through table-driven tests, reflection, fixtures, or subprocess command paths without manual review.

Python:
- Run Ruff unused rules over tests, already enforced by quality.
- Exclude generated fixtures and miniature language servers where dynamic protocol dispatch is intentional.

TypeScript:
- Treat Playwright fixtures, `test.step` helpers, route names, and file-level setup as dynamic/test-framework edges.
- Keep plugin frontend tests separate from app frontend tests so package boundaries remain clear.

Output:
- Candidate records must keep indicating `root_scope: test` or equivalent.
- `scripts/deadcode/list_candidates.sh` should keep being able to filter test-only candidates.

### 6. Complexity Cleanup And Future Gates
Current phase. After file-size cleanup, reduce complexity only when the result is easier to read, easier to debug, and at least behaviorally equivalent.

Go:
- Keep `gocyclo` test complexity report-only until the worst integration files are split.
- Start by extracting repeated setup and assertion blocks from hotspots above `50`.
- Once the worst hotspots are below `50`, consider a dedicated `go-test-max` threshold in `scripts/quality/check.sh`.

TypeScript:
- First make ESLint cover test files with an explicit test config.
- Start with no hard complexity gate, or with a generous threshold matching the cleaned baseline.
- Add focused exclusions only for generated or protocol fixture code, not broad `tests/**` escapes.

Python:
- Keep the existing Python test complexity gate on.
- Avoid weakening C901 unless a protocol fixture needs a targeted exemption.

Helper extraction guidance:
- Keep the test's behavioral story visible at the call site. A top-level test should still read as setup, action, expectation, or as a small set of named scenario phases.
- Pure `assert...` helpers should only inspect state and fail with a specific message. If a helper writes files, mutates stores, calls the service under test, advances timers, or sends websocket messages, name it for that side effect, such as `seed...`, `write...`, `run...`, `update...`, or `restore...`.
- Prefer focused tests or subtests when scenario phases share mutable state and order matters. Do not hide an ordered timeline behind a sequence of `assert...` calls that appear independent.
- A one-use helper is acceptable when it names a real domain step or removes distracting fixture boilerplate. It is not enough that the helper lowers a complexity score.
- When extracting assertions over maps, OpenAPI documents, tool metadata, or scene graphs, prefer table-driven expectations and small `require...` helpers that fail close to the missing field.
- After refactoring a hotspot, read the failure path: the failing message should identify the behavior and subject without forcing the reader to reconstruct hidden setup.

Example caution:
- Avoid a sequence like `assertConflictSkip(...)`, `assertConflictBackup(...)`, `assertConflictOverwrite(...)` when each helper rewrites the same file and invokes the service under test. That lowers the top-level complexity score but hides the timeline. Prefer separate focused tests, subtests with fresh fixtures, or names such as `writeExternalFileAndUpdateWithSkip(...)` that make the mutation explicit.

### 7. Documentation And Exceptions
- Keep any permanent exceptions in `quality.paths.yaml` as narrow globs.
- Document every exception near the config with the reason:
  - generated fixture
  - protocol mini-server
  - intentional full-stack integration suite
- Prefer lowering thresholds over adding exceptions when the file can reasonably be split.

## Verification
For every cleanup batch:
- Run `./scripts/quality/check.sh --all`.
- Run focused tests for touched packages/specs:
  - Go: `./scripts/run_go_tests.sh ./internal/<package>`
  - Python: `source activate.sh && pytest <paths>`
  - Vitest: `pnpm -C frontend exec vitest run <paths>`
  - Playwright: `./scripts/run-playwright-e2e.sh <specs>`
- Run `./scripts/deadcode/report.sh` after dead-code reporting changes.
- For UI/E2E spec restructuring, run the affected Playwright specs. CDP visual verification is only required if production UI behavior changes.

## Acceptance Criteria
- `./scripts/quality/check.sh --all` passes.
- Current test file-length ratchets stay in force unless there is a documented, narrow exception:
  - Python tests at `1000`
  - TypeScript tests at `1800`, with `frontend/tests/e2e/helpers.ts` as the documented shared-helper exception
  - Go tests at `2000`
- Test dead-code reports distinguish test-only candidates from production candidates.
- No coverage is removed without replacement coverage of equal or stronger value.
- Split and refactored tests remain package/locality-aligned, easier to navigate, and explicit about stateful setup.

## Suggested Execution Order
1. Keep `./scripts/quality/check.sh --all` and focused package/spec tests passing at the current ratchets.
2. Review recent Go and TypeScript complexity refactors for hidden stateful helper timelines, especially helpers named `assert...`.
3. Continue Go and TypeScript hotspot cleanup only where it improves local test intent or failure clarity.
4. Add an explicit frontend test ESLint configuration before introducing any TypeScript test complexity gate.
5. Consider a dedicated Go test complexity threshold only after the remaining worst hotspots are below `50` and the helper style has stabilized.
6. Keep test-only dead-code reporting advisory and separate from production cleanup decisions.

## Branch Progress
- Dead-code confidence is lowered to `60`, production entrypoints are configured, and test-only dead-code reports are advisory and filterable by `root_scope`.
- Python test file length has been ratcheted from `2000` to `1000`.
- TypeScript test file length has been ratcheted from `8000` to `1800` with a narrow shared-helper exception.
- Go test file length has been ratcheted from `17000` to `2000`.
- Remaining file-length ratchets from this plan are complete:
  - Python: complete at `1000`; current largest test file is `996` lines.
  - TypeScript: complete at `1800`; current largest non-excepted test file is `1767` lines, and `frontend/tests/e2e/helpers.ts` remains the documented shared-helper exception.
  - Go: complete at `2000`; current largest test file is `1919` lines.
- Recent commits have reduced Go and TypeScript test complexity hotspots in areas such as MCP server tests, OpenAPI contract tests, MCP route tests, external agent executor fixtures, GPU flow tests, app subsystem guardrail tests, and window-space restore tests.
- The remaining quality work is readability-focused complexity cleanup and future gate design, not further broad file-size splitting.
