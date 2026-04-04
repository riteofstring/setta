# Repository Guidelines

## Highest Priority

- Treat `cmd/` and `internal/` as the backend runtime. Treat `backend/setta/` as the Python package surface.
- Go is the default source of truth for canonical behavior, validation, derived metadata, and shared contracts unless the developer explicitly says otherwise.
- Prefer solutions in this order: `1.` Go-owned logic, `2.` Go as the source of truth with generated Python/TypeScript surfaces, `3.` duplicated Python/TypeScript logic only with a concrete justification.
- Regenerate endpoints and generated types instead of hand-syncing them.
- Add tests beside the owning code, use temporary directories instead of `setta_files`, and run `./check_quality.sh` before committing.
- Prefer explicit, typed, robust implementations over heuristics, silent fallbacks, or broad exception handling.

## Ownership & Layout

- `cmd/` contains the active Go entrypoints (`setta`, `setta-server`, generators, test seeders).
- `internal/` contains the backend runtime, transports, services, project state, frontend binding generation, and related tests.
- `backend/setta/` contains the Python package surface: CLI dispatch, source SDK files, generated Python types/codegen helpers, packaged assets, and binaries.
- `frontend/` contains the React/Vite UI; keep app code in `src/`, shared templates in `generation/`, and static assets in `public/`.
- `setta_files/` is local runtime state and must not be committed; keep canonical fixtures elsewhere.
- Go tests live with the packages they cover under `cmd/*` and `internal/*`. Python/package pytest coverage lives under `tests/`, not `tests/setta`.
- If a Python file outside `backend/setta/` looks unused, prove the surviving caller or replacement owner before deleting it.

## Go-Backed Python

- Distinguish `Go-owned Python types` from `Go-backed Python`.
- `Go-owned Python types` means Python consumes generated Go-owned contracts/models instead of handwritten Python schema mirrors.
- `Go-backed Python` means canonical local Setta behavior is delegated back to Go, either through the running backend or through `setta sdk-local-core`.
- Generated Python models are not, by themselves, proof that behavior is already Go-backed.
- Canonical validation, derived metadata, and correctness-sensitive local runtime behavior should not remain handwritten in Python just because Python has the data locally.
- Python should keep ergonomic helper behavior such as transport/session glue, context managers, callback scheduling, iterators, and read-only convenience builders over authoritative Go-owned contracts.
- Parsing backend-authored payloads or using generated contracts as DTOs does not, by itself, require a local Go subprocess call.

## Generation & Cross-Language Contracts

- Minimize duplicated logic across Go, Python, and TypeScript.
- Go-to-TypeScript and Go-to-Python generation should be generic and discovery-driven whenever a programmatic source of truth exists.
- Do not rely on hand-maintained allowlists when generators can discover types, endpoints, or registrations directly.
- Do not over-optimize generator selectivity just to avoid some unused outputs; broad correct discovery plus pruning is preferred to brittle special cases.
- Keep hardcoded generator special cases to the absolute minimum and require a concrete reason when they remain.
- Do not embed large blocks of Python or TypeScript source as raw strings inside generation scripts; keep substantial handwritten code in real `.py` or `.ts` files.
- Backend and frontend endpoint functions must have the exact same name.
- On the frontend, always use route functions from `generatedEndpoints`.
- Regenerate whenever you edit `frontend/generation/` or when a backend endpoint or type is missing on the frontend.
- If you need new generated outputs, run generation first and import or use those outputs before cleanup, or cleanup can delete them as unused.
- Use `./gcf.sh` when you need the full generate/cleanup/format wrapper.
- Large diffs after generation or cleanup are often expected; do not assume they are wrong.
- Do not manually edit `backend/setta/types/generated`; those files are generated outputs.

## Dev Workflow

- Prefer `./start.sh`, `./reset.sh`, and `./ai.sh` for the high-level source-checkout dev loop. Use `docs/guides/dev-scripts.md` for exact script behavior.
- `dev_install.sh` is the default Go-first local setup. `dev_install_python.sh` is opt-in for Python/package tooling, packaging flows, and Python tests/formatting/generation.
- `dev_install.sh` and `dev_install_python.sh` must not rewrite dependency lockfiles; use `./update_dependencies.sh` for explicit Python or pnpm lock refreshes.
- The default source-checkout dev loop does not require Python activation. For Python/package tooling, use `source activate.sh && <command>`.
- Pin all checked-in direct dependency versions exactly. Do not use floating ranges such as `^`, `~`, `>=`, `>`, `*`, or `latest`.
- Run Go through `./scripts/go.sh`; do not assume the pinned toolchain is on `PATH`.
- Format Go with `GOROOT="$(./scripts/go.sh env GOROOT)" && "$GOROOT/bin/gofmt" -w <files>`.
- Default test entrypoints are `./scripts/run_go_tests.sh`, `./scripts/run_backend_tests.sh`, `pnpm -C frontend exec vitest run <path>`, and `./scripts/run-playwright-e2e.sh`.
- `./scripts/run_backend_tests.sh` is a legacy-named Python/package pytest runner, not the Go backend test runner.
- Root scripts such as `build.sh`, `build_and_upload.sh`, and `format_code.sh` should remain executable after edits.
- For dependency audits, follow `docs/guides/dependency-audits.md`, start with `./audit_supply_chain.sh`, and default to critical/high fixes unless asked for broader cleanup.
- Do not use obscure forks, republished packages, or unofficial mirrors just to silence audit findings.
- Every kept dependency upgrade must satisfy the repo minimum release-age policy.

## Coding Conventions

- Keep Go HTTP routes thin under `internal/httpapi`, websocket transports thin under `internal/wsapi`, and move business logic into focused `internal/*` service packages.
- Python API files under `backend/setta/api/` should stay thin client/SDK surfaces rather than growing backend runtime behavior.
- Keep complexity low; split branching or stateful logic into smaller helpers before functions become hard to reason about.
- Avoid div soup, nested ternaries, and `any` unless necessary. Remove unused parameters instead of silencing them.
- Frontend code must prioritize performance for very large DOMs.
- Default dropdown and selection UIs to the shared combobox system (`IdNameCombobox`/Combobox`) unless there is a clear documented reason not to.
- Use `TYPE_CHECKING` blocks when possible, keep imports at the top of the file, and never import annotations from `__future__`.
- Use `docs/reference/ui-style-consistency.md` as the canonical UI style anchor map.
- Do not default to adding borders around every UI container or row; add borders only when they convey real structure or affordance.

## Realtime

- Prefer push-based updates over polling when the backend already knows when state changes.
- For frontend/backend synchronization, default to backend-initiated websocket updates rather than periodic frontend polling unless push is impractical.
- Polling must have a concrete justification such as third-party limits, infrastructure limits, or a deliberately simplified non-critical path.

## Testing & Verification

- Default workflow: think, plan, write tests, implement, then run tests. Update tests as the approach evolves.
- Use `docs/guides/dev-scripts.md`, `docs/guides/browser-mcp-quickstart.md`, `docs/guides/verification-checklist.md`, and `docs/guides/chrome-repro-recording.md` for detailed test and browser-verification workflows.
- Run `./check_quality.sh` before committing unless the developer explicitly asks for a different verification scope.
- Do not skip tests broadly. Missing dependencies or capabilities should usually fail loudly; any skip should be narrow, documented, and justified.
- UI changes require chrome-devtools-mcp visual verification when relevant.
- A `Chrome recording` means a bundle produced by `./scripts/record-chrome-repro.sh`; `see the latest Chrome recording` means `./scripts/latest-chrome-recording.sh --json`.
- Never start `./ai.sh`, `./aireset.sh`, `pnpm ai`, `pnpm -C frontend ai`, or `pnpm -C frontend aireset` yourself; if CDP access is needed, the developer starts it.
- Final responses for UI work must include `CDP visual check: done (...)` or `CDP visual check: not run (reason)`.
- Add Go tests beside the backend owner when changing runtime behavior. Add focused pytest coverage under `tests/` when changing Python SDK/package boundaries.
- Treat frontend performance testing as first-class; prefer automated guardrails and use chrome-devtools-mcp for deeper profiling when needed.
- Do not add generator drift tests that only rerun generators or formatters and compare checked-in artifacts against current output.
- Tests must not rely on existing files in `setta_files`; use temporary directories instead.
- Tests must never mutate real git history in this repo or any non-disposable developer worktree.
- Default to production-path tests. Do not add mocks, fakes, dummy classes, cast tricks, tautological tests, or production-only code paths added solely to ease tests.

## Safety & Refactoring

- Do not add `try/except` or `try/catch` blocks unless absolutely necessary.
- Prefer failing loudly and specifically over failing silently or mysteriously.
- Avoid over-defensive code and endless safety checks.
- Do not rely on fake estimates or brittle keyword matching when a standardized source-of-truth path exists.
- Prefer provider/runtime metadata, typed APIs, deterministic parsing, or explicit protocol fields over heuristics.
- If a robust solution is not currently possible, say so explicitly, explain why, and present the implementation options with tradeoffs.
- Heuristic fallbacks may be suggested as options, but must not be implemented without explicit approval.
- We do not need backward compatibility unless the developer explicitly asks for it.
- Refactors should preserve the current intended behavior for supported workflows unless the developer asks for a behavior change. If that behavior is unclear, stop and ask instead of guessing.
- Performance-relevant refactors must baseline first, re-measure after, and record before/after results in `perf/` as append-only reports.
