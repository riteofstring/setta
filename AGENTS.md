# Repository Guidelines

## Source Of Truth

- Treat `cmd/` and `internal/` as the backend runtime, `backend/setta/` as the Python package and SDK surface rather than a second backend runtime with `backend/setta/api/` kept thin, and `frontend/` as the React/Vite UI with app code in `src/`, shared templates in `generation/`, and static assets in `public/`.
- Go owns canonical behavior, validation, derived metadata, shared contracts, endpoint shapes, and correctness-sensitive local runtime behavior unless the developer explicitly says otherwise.
- Prefer solutions in this order: `1.` Go-owned logic, `2.` Go-owned contracts with generated Python/TypeScript surfaces, `3.` duplicated Python/TypeScript logic only with explicit justification.
- Any duplicated non-trivial Python or TypeScript logic must have a concrete justification such as latency, offline requirements, or a platform constraint. Convenience alone is not enough.
- When duplication is unavoidable, keep the duplicated surface minimal and document the reason near the implementation or in the relevant design notes.
- Go tests belong with packages under `cmd/*` and `internal/*`. Frontend unit and integration tests belong alongside frontend code under `frontend/src/*` where appropriate, and frontend E2E coverage belongs under `frontend/tests/`. Python/package pytest coverage belongs under `tests/`.
- Python SDK/runtime ownership boundaries are defined in `docs/reference/go-backed-python.md`.

## Generation & Contracts

- When Go-owned contracts need downstream Python or TypeScript surfaces, prefer generation over hand-maintained mirrors.
- Drive generators from authoritative Go-side structure or metadata, prefer broad discovery plus pruning over brittle inventories, and keep generator-specific design constraints in `docs/reference/generation-contracts.md`.
- When a generated helper, union, type guard, or exported value is missing, first extend or export the existing authoritative generator path such as semantic sidecar metadata, discovery-driven declarations, or owner-owned metadata. Do not add handwritten compatibility declarations, hard-coded member inventories, or parallel generator-only mirrors when the same surface can be derived from an existing owner path.
- If a generator exception is truly unavoidable, keep it minimal, document in code why the authoritative path could not be used, and prefer a Go-owned metadata input over restating downstream TypeScript or Python structure in generator code.
- For HTTP, frontend callers must use the standard OpenAPI-generated client/types rather than bespoke generated endpoint wrappers. For non-HTTP route/constants surfaces, use the current Go-owned generated or value-exported frontend surface rather than hand-maintained mirrors.
- If you edit `frontend/generation/`, backend endpoints, or Go-owned types used by the frontend or Python surface, regenerate affected outputs before cleanup and before finishing the task.
- Prefer `./gcf.sh` when full generate/cleanup/format is appropriate. Large diffs after generation or cleanup are normal.
- Do not manually edit `backend/setta/types/generated`, checked-in OpenAPI artifacts under `frontend/generation/`, or generated frontend clients under `frontend/src/openapi/*/generated`.

## Workflow & Verification

- Use `dev_install.sh` for the default Go-first setup. Use `dev_install_python.sh` only when you need Python or package tooling.
- Neither install script should rewrite lockfiles. Use `./update_dependencies.sh` when a dependency update needs lockfile changes.
- Use `docs/guides/dev-scripts.md` when you need the exact command map for generation, cleanup, or the source-checkout dev loop.
- Use `docs/guides/browser-mcp-quickstart.md`, `docs/guides/verification-checklist.md`, and `docs/guides/chrome-repro-recording.md` for browser verification workflows when relevant.
- For dependency audit or upgrade work, use `docs/guides/dependency-audits.md`.
- For Python/package tooling, use `source activate.sh && <command>`.
- Pin checked-in direct dependency versions exactly. Do not use floating version ranges like `^`, `~`, `>=`, `>`, `*`, or `latest` in dependency manifests.
- Run Go through `./scripts/go.sh`.
- Format Go with `GOROOT="$(./scripts/go.sh env GOROOT)" && "$GOROOT/bin/gofmt" -w <files>`.
- Default test entrypoints are `./scripts/run_go_tests.sh`, `./scripts/run_backend_tests.sh` for Python/package pytest, `pnpm -C frontend exec vitest run <path>`, and `./scripts/run-playwright-e2e.sh`.
- When changing runtime behavior, add Go tests beside the backend owner. When changing Python SDK or package boundaries, add focused pytest coverage under `tests/`.
- Unless the developer explicitly narrows verification scope, run `./check_quality.sh` before committing.
- Do not skip tests broadly. Missing dependencies or capabilities should usually fail loudly. Any skip must be narrow and justified.
- A `Chrome recording` means a bundle produced by `./scripts/record-chrome-repro.sh`, and `see the latest Chrome recording` means `./scripts/latest-chrome-recording.sh --json`.
- Do not add generator drift tests that only rerun generators or formatters and compare checked-in artifacts against current output.
- Tests must use temporary directories instead of `setta_files`, must never mutate real git history in this repo or any non-disposable developer worktree, and should exercise production paths instead of mocks or test-only code paths.
- Do not add tautological tests that only restate the implementation or reproduce the same logic to compute the expected result.

## UI Rules

- Frontend code must handle very large DOMs efficiently.
- Default dropdown and selection UIs to the shared combobox system unless there is a documented reason not to.
- Use `docs/reference/ui-style-consistency.md` as the UI style anchor map.
- Do not add borders by default unless they convey structure.
- Prefer backend-initiated websocket updates over polling when the backend already knows when state changes.
- Treat frontend performance verification as first-class. Prefer automated guardrails, and use chrome-devtools profiling when deeper analysis is needed.
- UI changes require chrome-devtools visual verification when relevant.
- Never start `./ai.sh`, `./aireset.sh`, `pnpm ai`, `pnpm -C frontend ai`, or `pnpm -C frontend aireset` yourself. The developer starts CDP sessions.
- Final responses for UI work must include `CDP visual check: done (...)` or `CDP visual check: not run (reason)`.

## Code Shape & Safety

- Keep Go HTTP routes thin under `internal/httpapi`, websocket transports thin under `internal/wsapi`, and business logic in focused `internal/*` services.
- Keep code explicit and avoid div soup.
- Do not add `try/except` or `try/catch` blocks unless they are actually needed to handle a specific failure path.
- If a robust solution is not possible, say so explicitly and present the real tradeoffs.
- Prefer failing loudly and specifically over silent fallbacks, fake estimates, brittle keyword heuristics, or broad catch-all handling. Do not implement heuristic fallbacks without explicit approval.
- Prefer provider or runtime metadata, typed APIs, deterministic parsing, or explicit protocol fields over heuristics.
- Preserve intended behavior for supported workflows during refactors. Do not add backward-compatibility shims unless the developer explicitly asks for them.
- If behavior is unclear, stop and ask.
- For performance-relevant refactors, baseline first, re-measure after, and record before/after results in `perf/` as append-only reports.
