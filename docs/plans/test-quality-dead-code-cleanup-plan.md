# Test Quality And Dead-Code Cleanup Plan

## Goal
Complete the cleanup needed to make test code participate meaningfully in quality, dead-code, and file-length checks across Python, Go, and TypeScript without creating brittle mechanical splits or noisy gates.

## Current State
- Python tests are now covered by Ruff and C901 complexity in `./scripts/quality/check.sh`.
- Python, Go, and TypeScript test files have file-length categories in `quality.paths.yaml`.
- Current branch test file-length thresholds are ratchets, not final targets:
  - Python tests: `1000` lines
  - TypeScript tests: `1800` lines, with a narrow exception for the shared Playwright helper module
  - Go tests: `2000` lines
- Dead-code analysis has explicit production entrypoints for Go, Python, and frontend TypeScript.
- Dead-code reporting now has advisory test-only lanes for Python, Go, and frontend TypeScript, and aggregate candidates carry `root_scope`.
- Go and TypeScript test complexity are not hard-gated yet.

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

## Work Plan

### 1. Stabilize the New Quality Coverage
- Keep `./scripts/quality/check.sh --all` passing at the current ratchet thresholds.
- Add or maintain tests for:
  - `python-test` path selection
  - `go-test` path selection
  - `frontend-test-file-length` path selection
  - file-length reporting for test files
- Confirm `scripts/quality/report_file_lengths.sh` reports test-file overages.
- Confirm `scripts/quality/report_complexity.sh` includes Python tests.

### 2. TypeScript Test File Cleanup
Prioritize TypeScript first because the largest files are mostly E2E specs and can be split by workflow.

Initial targets:
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

Ratchet after each cluster:
- Lower `frontend.test_file_length.max_lines` to just above the largest remaining TypeScript test file.
- Target sequence:
  - `8000` to `6500`
  - `6500` to `5000`
  - `5000` to `3500`
  - `3500` to `2500`
  - final stretch goal: `1800` or a documented exception list

### 3. Go Test File Cleanup
Go has the largest backlog, so handle it by package ownership and avoid making a broad complexity gate first.

Initial targets:
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

Ratchet after each cluster:
- Lower `go_tests.file_length.max_lines` to just above the largest remaining Go test file.
- Target sequence:
  - `17000` to `15000`
  - `15000` to `12000`
  - `12000` to `9000`
  - `9000` to `6000`
  - `6000` to `3500`
  - final stretch goal: `2000` or a documented exception list for intentional integration suites

### 4. Python Test File Cleanup
Python is already clean for lint and complexity, so this is mostly file structure.

Initial targets:
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

Ratchet after each cluster:
- Lower `python_tests.file_length.max_lines` to just above the largest remaining Python test file.
- Target sequence:
  - `2000` to `1800`
  - `1800` to `1500`
  - `1500` to `1200`
  - final target: `1000`

### 5. Dead-Code Reporting For Tests
Add test-only dead-code reporting as advisory before any hard gate.

Go:
- Add a separate report lane or scope for test-only reachability.
- Keep production Go `deadcode` classification unchanged.
- Use Go test roots to identify helpers/functions live only in tests.
- Do not auto-delete helpers used through table-driven tests, reflection, fixtures, or subprocess command paths without manual review.

Python:
- Run Ruff unused rules over tests, already enforced by quality.
- Add optional Vulture report roots for `tests/` with a lower confidence threshold only as advisory.
- Exclude generated fixtures and miniature language servers where dynamic protocol dispatch is intentional.

TypeScript:
- Add a Knip or ESLint-based test-root report for frontend tests.
- Treat Playwright fixtures, `test.step` helpers, route names, and file-level setup as dynamic/test-framework edges.
- Keep plugin frontend tests separate from app frontend tests so package boundaries remain clear.

Output:
- Extend `reports/deadcode/aggregate.json` with a test-only bucket or add explicit test report files.
- Candidate records must indicate `root_scope: test` or equivalent.
- `scripts/deadcode/list_candidates.sh` should be able to filter test-only candidates.

### 6. Complexity Cleanup And Future Gates
After file-size cleanup reduces the largest files, revisit complexity.

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
- Test file-length thresholds are significantly lower than the initial ratchets:
  - Python tests at or near `1000`
  - TypeScript tests at or near `1800`, or narrow documented exceptions
  - Go tests below `3500`, or narrow documented exceptions for intentional integration suites
- Test dead-code reports distinguish test-only candidates from production candidates.
- No coverage is removed without replacement coverage of equal or stronger value.
- Split tests remain package/locality-aligned and easier to navigate.

## Suggested Execution Order
1. TypeScript E2E split batch 1; lower TypeScript test file-length threshold.
2. Go route/app split batch 1; lower Go test file-length threshold.
3. Python file split batch 1; lower Python test file-length threshold.
4. Add test-only dead-code report lanes.
5. Repeat TypeScript and Go split batches until thresholds are near targets.
6. Revisit Go and TypeScript test complexity gates after the size cleanup.

## Branch Progress
- Dead-code confidence is lowered to `60`, production entrypoints are configured, and test-only dead-code reports are advisory and filterable by `root_scope`.
- Python test file length has been ratcheted from `2000` to `1000`.
- TypeScript test file length has been ratcheted from `8000` to `1800` with a narrow shared-helper exception.
- Go test file length has been ratcheted from `17000` to `2000`.
- Remaining file-length ratchets from this plan:
  - Python: complete at `1000`
  - TypeScript: complete at `1800` with `frontend/tests/e2e/helpers.ts` documented as a shared-helper exception
  - Go: complete at `2000`
