# Repository Guidelines

## Current Ownership Model

- Treat the code under `cmd/` and `internal/` as the backend runtime.
- Treat `backend/setta/` as the Python package surface for CLI dispatch, source SDKs, packaging, and shipped assets.
- If a Python file outside that package surface looks unused, prove the surviving caller or replacement owner before deleting it.

## Project Structure & Module Organization

- `cmd/` contains the active Go entrypoints (`setta`, `setta-server`, generators, test seeders).
- `internal/` contains the backend runtime, transports, services, project state, frontend binding generation, and related tests.
- `backend/setta/` is the Python package surface: thin wheel entrypoint wrappers, repo/sdist Python SDK files under `backend/setta/api/`, generated Python types/codegen helpers, and packaged assets/binaries.
- `frontend/` contains the React/Vite UI; place components and stores in `src/`, shared templates in `generation/`, and static assets under `public/`.
- `setta_files/` stores runtime metadata created by the app; it is gitignored and should not be committed. Keep only canonical fixtures under version control elsewhere and wipe local noise before committing.
- Root scripts such as `build.sh`, `build_and_upload.sh`, and `format_code.sh` orchestrate packaging, publishing, and formatting; keep them executable after edits.
- Go tests live alongside the packages they cover under `cmd/*` and `internal/*`. The `tests/` directory is for Python/package pytest coverage; do not nest suites under `tests/setta`.

## Go-Backed Python

- Distinguish `Go-owned Python types` from `Go-backed Python`:
- `Go-owned Python types` means Python consumes generated Go-owned contracts/models instead of handwritten Python schema mirrors.
- `Go-backed Python` means that when the retained Python SDK needs canonical Setta behavior locally, Python should delegate that work to Go, either through the running backend or through the `setta sdk-local-core` subprocess path.
- Do not treat “the Python model is generated from Go” as proof that the behavior is already Go-backed.
- Canonical validation, derived metadata, and correctness-sensitive local runtime behavior should not stay implemented in handwritten Python just because Python has the data locally.
- Python should keep ergonomic helper behavior: transport/session glue, context managers, callback scheduling, iterators, friendly lookup/builders, and other read-only convenience layers over authoritative Go-owned contracts.
- If Python is only parsing backend-authored payloads or using generated contracts as DTOs, that does not by itself require a local Go subprocess call.

## Dev Workflow

- Prefer `./start.sh`, `./reset.sh`, and `./ai.sh` for the high-level source-checkout dev loop. For exact script behavior, use `docs/guides/dev-scripts.md`.
- `dev_install.sh` is the default Go-first local setup. `dev_install_python.sh` is opt-in for Python/package tooling, packaging flows, and Python tests/formatting/generation.
- `dev_install.sh` and `dev_install_python.sh` must not rewrite dependency lockfiles; use `./update_dependencies.sh` for explicit Python/pnpm lock refreshes.
- The default source-checkout dev loop does not require Python activation. For Python/package tooling, use `source activate.sh && <command>`.
- Pin all checked-in direct dependency versions exactly. Do not use floating version ranges like `^`, `~`, `>=`, `>`, `*`, or `latest` in dependency manifests. Keep the corresponding lockfiles committed and current so Python and Node transitive resolutions stay pinned.
- Run Go through `./scripts/go.sh`; do not assume the pinned toolchain is on `PATH`.
- Format Go with `GOROOT="$(./scripts/go.sh env GOROOT)" && "$GOROOT/bin/gofmt" -w <files>`.
- Default test entrypoints are `./scripts/run_go_tests.sh`, `./scripts/run_backend_tests.sh`, `pnpm -C frontend exec vitest run <path>`, and `./scripts/run-playwright-e2e.sh`.
- `./scripts/run_backend_tests.sh` is a legacy-named Python/package pytest runner, not the Go backend test runner.
- `./gcf.sh` is the standard generate/cleanup/format wrapper; see Generation & Cleanup for when to use it.

## Dependency Audits

- Start with `./audit_supply_chain.sh` for full repo visibility, but do not assume every reported item should be fixed in the same pass.
- The default remediation target is critical/high findings only unless the developer explicitly asks for broader cleanup. Do not churn versions just to clear low/moderate advisories.
- Keep dependency fixes minimal and exact. Prefer the smallest official upstream version bump that clears the severe finding, then refresh lockfiles intentionally and rerun focused tests in the touched area.
- Python: `pip-audit` CLI output does not include severity in the table. Confirm severity from OSV/GHSA metadata before deciding whether a Python finding should be fixed in a severe-only pass.
- Go: prioritize code-reachable `govulncheck` findings. Do not bump unrelated modules just because verbose output lists non-reachable advisories.
- Frontend/Node: prefer official upstream releases and narrow `pnpm.overrides` for transitive fixes when the upstream dependency range already allows a safe version. Avoid broad toolchain churn unless it is required to clear the severe finding.
- Do not switch to obscure forks, republished packages, or unofficial mirrors just to silence an audit finding. If the official package has no fixed mainstream release, leave the finding in place, explain the blocker, and present replacement/migration as a separate decision.
- Every accepted dependency upgrade must also satisfy the repo minimum release-age policy. Re-run `./audit_supply_chain.sh` after refreshes, or at minimum rerun the Python, Go, and pnpm release-age checks before keeping the lockfile changes.
- pnpm uses `minimum-release-age` in minutes, not `min-release-age` in days. Treat the pnpm config as resolver guidance only; the hard enforcement for checked-in Node dependencies is `scripts/check_pnpm_lock_release_age.py` via `./update_dependencies.sh` and `./audit_supply_chain.sh`.
- Normal install scripts must remain frozen. Refresh lockfiles only through `./update_dependencies.sh` or an intentionally scoped lockfile update as part of the dependency-fix change.
- If `./audit_supply_chain.sh` still fails only because of intentionally unaddressed lower-severity findings, say that explicitly instead of widening the remediation scope without approval.

## Coding Style & Naming Conventions

- Python follows Ruff defaults (see `ruff.toml`); use 4-space indents, snake_case for functions/modules, and PascalCase for classes.
- Keep Go HTTP routes thin under `internal/httpapi`, websocket transports under `internal/wsapi`, and push business logic into focused `internal/*` service packages.
- Python API files under `backend/setta/api/` should stay thin client/SDK surfaces rather than growing backend runtime behavior.
- Always prefer low cyclomatic complexity. Split branching or stateful logic into smaller helpers before a function becomes hard to reason about.
- TypeScript/JS naming stays conventional: components in PascalCase, hooks in camelCase prefixed with `use`.
- Prefer inlining Tailwind class strings in JSX/TSX unless reuse has a clear benefit.
- Avoid div soup, prefer semantic elements, avoid nested ternary expressions, avoid `any` unless necessary, and remove unused parameters instead of silencing them.
- Frontend code must prioritize performance for very large DOMs.
- Default dropdown/selection UIs to the shared combobox system (`IdNameCombobox`/Combobox) unless there is a clear documented reason not to.
- Use `TYPE_CHECKING` blocks when possible, keep imports at the top of the file, and never import annotations from `__future__`.

## UI Style Consistency

- Use `docs/reference/ui-style-consistency.md` as the canonical style anchor map for UI work.
- Do not default to adding borders around every UI container or row. Add borders only when they convey clear structure, hierarchy, or interaction affordance.

## Endpoints

- Backend and frontend endpoint functions should have the exact same name.
- On the frontend, always use route functions from `generatedEndpoints`.
- If a function exists on the backend but not on the frontend, run the generation workflow in Generation & Cleanup to sync endpoint definitions.

## Generation & Cleanup

- Use `pnpm generate` to regenerate the Go-owned frontend bindings plus the Go-owned Python SDK/shared generated types. This command can produce a large diff.
- Use `pnpm -C frontend generate-go-frontend-bindings` when only the canonical frontend route/type/endpoint outputs need regeneration; this path does not require Python activation.
- `./gcf.sh` / `pnpm gcf` run `pnpm generate`, `pnpm full-cleanup`, Go formatting for `cmd/` and `internal/`, and frontend formatting.
- `pnpm full-cleanup` runs Knip plus the Python generated-type prune step, and can delete unused generated TS/Python outputs.
- Large diffs after generation or cleanup are often expected; do not assume they are incorrect.
- If you need new generated outputs, run generation first and import/use those outputs before cleanup, or cleanup can delete them as unused.
- Regenerate whenever editing files under `frontend/generation/`.
- Don't manually edit files in `backend/setta/types/generated`; they are generated outputs.

## Testing & Verification

- Default workflow: think, plan, write tests, implement, then run tests. Update tests as the approach evolves.
- Do not skip tests broadly. Missing deps/capabilities should usually fail loudly; any skip should be narrow, documented, and justified.
- Frontend unit/integration tests live beside the code as `*.test.tsx`; frontend E2E tests live under `frontend/tests/e2e/` as Playwright `*.spec.ts`.
- UI changes require chrome-devtools-mcp visual verification. When relevant Playwright coverage exists or should exist, add or update it and run it.
- Before using chrome-devtools-mcp, read `docs/guides/browser-mcp-quickstart.md` and follow `docs/guides/verification-checklist.md`.
- For Chrome repro recorder workflows, read `docs/guides/chrome-repro-recording.md`.
- A `Chrome recording` means a bundle produced by `./scripts/record-chrome-repro.sh`.
- When the user says `see the latest Chrome recording`, resolve it with `./scripts/latest-chrome-recording.sh --json` instead of guessing paths under `/tmp`.
- Chrome recordings can include redacted `llm_engine_artifacts/` copied from the active `setta_files` root; check that manifest when debugging external-agent runs.
- Never start `./ai.sh`, `./aireset.sh`, `pnpm ai`, `pnpm -C frontend ai`, or `pnpm -C frontend aireset` yourself; if CDP access is needed, the developer starts it.
- Final responses for UI work must include `CDP visual check: done (...)` or `CDP visual check: not run (reason)`.
- Add Go tests beside the backend owner when changing runtime behavior; add focused pytest coverage under `tests/` when changing Python SDK/package boundaries.
- Treat frontend performance testing as first-class. Prefer automated guardrails, and use chrome-devtools-mcp for deeper profiling when needed.
- Do not add generator drift tests that only rerun generators/formatters and compare checked-in artifacts against current output.
- Tests must not rely on existing files in `setta_files`; use temporary directories instead.
- Tests must never mutate real git history in this repo or any non-disposable developer worktree.
- Tests should reflect production behavior. Do not add mocks, fakes, dummy classes, cast tricks, tautological tests, or production-only code paths added solely to ease tests.

## Safety & Robustness

- Do not add `try/except` or `try/catch` blocks unless absolutely necessary.
- Prefer failing loudly and specifically over failing silently or mysteriously. From a UX perspective, it is better to know that something failed and what the actual failure was than to hide it behind broad exception handling or fallback behavior.
- Avoid over-defensive code and endless safety checks.
- Solutions must not rely on fake estimates or brittle keyword matching when a standardized source-of-truth pathway exists.
- Prefer provider/runtime metadata, typed APIs, deterministic parsing, or explicit protocol fields over heuristics.
- If a robust solution is not currently possible, say so explicitly, explain why, and present the implementation options with tradeoffs.
- Heuristic fallbacks may be suggested as options, but must not be implemented without explicit approval.

## Refactoring

- We do not need backward compatibility unless the developer explicitly asks for it.
- Refactors are behavior-preserving by default. If behavior is unclear, stop and ask instead of guessing.
- Performance-relevant refactors must baseline first, re-measure after, and add or update automated coverage where feasible.
- Record before/after performance results in `perf/` as append-only reports.
