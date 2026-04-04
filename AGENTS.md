# Repository Guidelines

## Remember This First

- Treat `cmd/` and `internal/` as the backend runtime, `backend/setta/` as the Python package surface, and `frontend/` as the React/Vite UI.
- Go is the default source of truth for canonical behavior, validation, derived metadata, correctness-sensitive local runtime behavior, and shared contracts unless the developer explicitly says otherwise.
- Prefer solutions in this order: `1.` Go-owned logic, `2.` Go-owned contracts with generated Python/TypeScript surfaces, `3.` duplicated Python/TypeScript logic only with concrete justification.
- Regenerate endpoints and generated types instead of hand-syncing them. Prefer explicit, typed implementations.
- `setta_files/` is local runtime state, not fixtures, and must not be committed.

## Ownership & Source Of Truth

- `cmd/` contains the active Go entrypoints. `internal/` contains the backend runtime, transports, services, project state, generators, and related tests.
- `backend/setta/` contains the Python package surface, SDK glue, generated Python types/helpers, packaged assets, and binaries. Keep `backend/setta/api/` as a thin client/SDK surface, not a second backend runtime.
- `frontend/` contains the UI; keep app code in `src/`, shared templates in `generation/`, and static assets in `public/`.
- Go tests belong with packages under `cmd/*` and `internal/*`. Python/package pytest coverage belongs under `tests/`.
- Distinguish `Go-owned Python types` from `Go-backed Python`: generated Go-owned contracts/models replace handwritten schema mirrors, while canonical local Setta behavior is only Go-backed when it delegates to Go through the running backend or `setta sdk-local-core`.
- Generated Python models or parsing backend-authored DTOs do not, by themselves, make behavior Go-backed or require a local Go subprocess call.
- Python may keep ergonomic helper behavior such as transport/session glue, context managers, callback scheduling, iterators, and read-only convenience builders over authoritative contracts.
- Before deleting a Python file outside `backend/setta/`, identify the surviving caller or replacement owner in the diff or final summary.

## Generation & Contracts

- Minimize duplicated logic across Go, Python, and TypeScript. Prefer generic, discovery-driven generation over hand-maintained allowlists or brittle special cases.
- Do not embed substantial Python or TypeScript source as raw strings inside generation scripts.
- Backend and frontend endpoint functions must have the exact same name, and frontend code should use route functions from `generatedEndpoints`.
- Regenerate after editing `frontend/generation/`, backend endpoints, or Go-owned types used by the frontend or Python surface.
- If you need new generated outputs, generate them before cleanup or cleanup can remove them as unused.
- Use `./gcf.sh` for the full generate/cleanup/format wrapper when needed. Large diffs after generation or cleanup are normal.
- Do not manually edit `backend/setta/types/generated`.

## Workflow & Verification

- Use `dev_install.sh` for the default Go-first setup and `dev_install_python.sh` only when you need Python/package tooling. Neither install script should rewrite lockfiles; use `./update_dependencies.sh` for that.
- For Python/package tooling, use `source activate.sh && <command>`.
- Pin checked-in direct dependency versions exactly. For dependency audit or upgrade work, follow `docs/guides/dependency-audits.md`, prefer critical/high fixes by default, and use official sources instead of obscure forks or mirrors.
- Run Go through `./scripts/go.sh`, and format Go with `GOROOT="$(./scripts/go.sh env GOROOT)" && "$GOROOT/bin/gofmt" -w <files>`.
- Default test entrypoints are `./scripts/run_go_tests.sh`, `./scripts/run_backend_tests.sh`, `pnpm -C frontend exec vitest run <path>`, and `./scripts/run-playwright-e2e.sh`.
- Run `./check_quality.sh` before committing unless the developer explicitly scopes verification differently.
- Do not skip tests broadly. Missing dependencies or capabilities should usually fail loudly, and any skip should be narrow and justified.
- Tests must use temporary directories instead of `setta_files`, must not mutate real git history, and should exercise production paths rather than mocks or test-only code paths.
- UI changes require chrome-devtools visual verification when relevant. Never start `./ai.sh`, `./aireset.sh`, `pnpm ai`, `pnpm -C frontend ai`, or `pnpm -C frontend aireset` yourself; the developer starts CDP sessions.
- Final responses for UI work must include `CDP visual check: done (...)` or `CDP visual check: not run (reason)`.

## Coding & Safety

- Keep Go HTTP routes thin under `internal/httpapi`, websocket transports thin under `internal/wsapi`, and business logic in focused `internal/*` services.
- Keep code explicit and low-complexity. Avoid unnecessary `any`, nested ternaries, div soup, and unused parameters.
- Frontend code must handle very large DOMs efficiently. Default dropdown and selection UIs to the shared combobox system unless there is a documented reason not to.
- Use `TYPE_CHECKING` blocks when possible, keep imports at the top of the file, and do not import annotations from `__future__`.
- Use `docs/reference/ui-style-consistency.md` as the UI style anchor map, and do not add borders by default unless they convey structure.
- Prefer backend-initiated websocket updates over polling when the backend already knows when state changes.
- If a robust solution is not possible, say so explicitly and present the real tradeoffs. Prefer failing loudly and specifically over silent fallbacks, fake estimates, brittle keyword heuristics, or broad catch-all handling, and do not implement heuristic fallbacks without explicit approval.
- Preserve intended behavior for supported workflows during refactors. Do not add backward-compatibility shims unless the developer explicitly asks for them. If behavior is unclear, stop and ask.
- Performance-relevant refactors must baseline first, re-measure after, and record before/after results in `perf/` as append-only reports.
