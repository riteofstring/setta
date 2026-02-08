# Repository Guidelines

## Project Structure & Module Organization

- `backend/setta/` houses the Python package, including API routers, code generation, and server state modules that ship to PyPI.
- `frontend/` contains the React/Vite UI; place components and stores in `src/`, shared templates in `generation/`, and static assets under `public/`.
- `setta_files/` stores runtime metadata created by the app; it is gitignored and should not be committed. Keep only canonical fixtures under version control elsewhere and wipe local noise before committing.
- Root scripts such as `build.sh`, `build_and_upload.sh`, and `format_code.sh` orchestrate packaging, publishing, and formatting; keep them executable after edits.
- The `tests/` directory mirrors `backend/setta` directly (for example, `tests/auth`, `tests/code_gen`, `tests/middleware`, `tests/start`); do not nest suites under `tests/setta`.

## Build, Test, and Development Commands

- `pnpm start` (or `pnpm startr` for backend reloads) runs Vite alongside `frontend/backendStart.sh` for a full-stack dev server (Vite defaults to `http://127.0.0.1:3000`, backend defaults to `http://127.0.0.1:8000`).
- `./ai.sh` (or `pnpm -C frontend ai`) starts dev + a CDP-enabled Chrome; `./aireset.sh` (or `pnpm -C frontend aireset`) wipes `setta_files` then starts.
- `./kill.sh` (or `pnpm -C frontend kill`) stops dev processes + sessions; `pnpm -C frontend cdp-port` prints the CDP port for the current worktree.
- `pnpm build` produces the production frontend bundle; `./build.sh` wraps this, bundles the Node runtime + sidecars, copies artifacts into `backend/setta/static/frontend/`, and builds the wheel via `python -m build`.
- `pnpm test` executes the Vitest suite (watch mode by default). For a one-off run, prefer `pnpm -C frontend exec vitest run <path>` to avoid hanging in watch; Playwright E2E runs via `./scripts/run-playwright-e2e.sh`.
- `./format_code.sh` applies Ruff import sorting, lint fixes, and formatting to every Python module (run with `source activate.sh`).
- `./t.sh` runs all tests (backend pytest, frontend Vitest, Playwright E2E). Use `--b` for backend-only or `--f` for frontend + Playwright.
- `./scripts/run_backend_tests.sh` runs the Python pytest suite only.
- `./gcf.sh` runs `pnpm gcf` and logs output to `gcf.log` at the repo root.
- Release smoke tests rely on `verify_install.sh`, which builds, installs the sdist with `uv pip`, and cleans up.
- Note: the full test suite (and Playwright in particular) can take a long time to finish.

## Coding Style & Naming Conventions

- Python follows Ruff defaults (see `ruff.toml`); use 4-space indents, snake_case for functions/modules, and PascalCase for classes and Pydantic models.
- Keep FastAPI routers grouped by feature under `backend/setta/routers/` and name endpoint functions with verbs (`get_notifications`, `create_project_state`).
- TypeScript/JS files use Prettier 3.2.4 and ESLint 9; components belong in PascalCase (`ToolbarButton.tsx`), hooks in camelCase prefixed with `use`.
- Tailwind class strings are organized by Prettier plugins; co-locate companion styles in `icons.css` or module-scoped `.css` next to the component.
- Prefer inlining Tailwind class strings in JSX/TSX instead of extracting them into variables, even if repetitive, unless there is a clear performance, dx, or programmatic benefit to reuse.
- Avoid div soup: keep markup shallow and semantic, minimize unnecessary wrappers, and avoid deep nesting when it is not required.
- Prefer semantic elements in JSX (`section`, `header`, `nav`, `main`, `article`, `button`, `ul/li`) over generic `div`/`span` when appropriate.
- Frontend code must prioritize performance, assuming very large DOMs (for example, hundreds of complex sections on the React Flow canvas).
- In typescript, avoid nested ternary statements. Annotate function arguments with expected types so that types and truthiness of argument attributes can be inferred.
- Avoid "any" types, unless absolutely necessary.
- Do not use no-op assignments like `_ = var` to silence unused parameters; remove unused args.

## UI Style Consistency

- Use `docs/reference/ui-style-consistency.md` as the canonical style anchor map for UI work (component references, icon guidance, panes to ignore).

## Testing Guidelines

- Default workflow: think, plan, write tests (Playwright, Vitest, Python unit tests), implement, then run tests. Stay flexible and update tests as the approach evolves or new components are introduced.
- In general, do not skip tests. Avoid broad `try/except ...: pytest.skip(...)` patterns that hide coverage gaps; missing deps/capabilities should usually fail loudly (or be caught by a single preflight) so CI/dev environments get fixed. Exceptions: explicitly opt-in integration tests (API keys/external services) or environments that fundamentally cannot run the test (e.g., sandbox restrictions). Any skip should be narrow, documented, and include how to enable the test.
- Ensure all tests are well commented so it's clear what each test is validating.
- Frontend unit/integration tests should live beside the code as `*.test.tsx` files; cover store logic, reducers, and view regressions with Vitest + React Testing Library helpers.
- Frontend E2E tests live under `frontend/tests/e2e/` as Playwright `*.spec.ts` files.
- Always use chrome-devtools-mcp to verify any visual edits, even when Playwright/Vitest tests run.
- Implement Playwright tests as often as possible. For any frontend change, write or update Playwright tests, run them, and iterate until they pass.
- Visual verification is a hard gate for UI changes: never claim visual verification without a CDP run. If CDP access is unavailable, stop and ask the user to enable the extension; otherwise state `CDP visual check: not run (reason)` in the final response.
- For any visual/UI change, include a final-response line `CDP visual check: done (brief context)` or `CDP visual check: not run (reason)`.
- Before using chrome-devtools-mcp, read `docs/guides/browser-mcp-quickstart.md` for the CDP-only workflow and worktree port guidance.
- You should never start `./ai.sh`, `./aireset.sh`, `pnpm ai`, `pnpm -C frontend ai`, or `pnpm -C frontend aireset`; if chrome-devtools-mcp is needed, the developer runs it first.
- Follow `docs/guides/verification-checklist.md` for the standard verification flow.
- Always run relevant Vitest or Playwright tests if they exist for the task; if none exist, propose what tests should be created when appropriate.
- Treat performance testing as a priority for frontend work; include coverage for large DOM scenarios and guard against costly render/update behavior.
- Use chrome-devtools-mcp for performance profiling when needed (Performance/Rendering/Memory tooling in DevTools) and document the measurements or observations.
- Playwright can capture automated performance signals (timings, traces, marks/measures), but DevTools profiling via chrome-devtools-mcp is required for deeper analysis.
- New components must ship with Playwright tests, Vitest coverage where applicable, and deeper DevTools performance profiling results.
- Playwright tests do not require running `pnpm ai`; when running Playwright tests as an AI, use `./scripts/run-playwright-e2e.sh`.
- Backend tests live under `tests/` mirroring `backend/setta`; run them with `./scripts/run_backend_tests.sh` (pytest).
- Backend coverage is currently sparse—add focused unit tests under `tests/` that mirror the `setta` namespace.
- Backend and frontend tests must not rely on existing files in `setta_files`. If a test needs to mimic `setta_files`, create it under a temporary directory (for example `/tmp`) and point the test there (see existing tests for patterns).
- Document manual verification steps (e.g., launching `setta` against a sample project) in your PR description when automated coverage is not yet available.
- Do not add or change production code for the purpose of easing tests—tests must adapt to production behavior.

## Commit & Pull Request Guidelines

- Follow the repository’s short, present-tense commit summaries (`add layers to unsharedKeys`, `delete extra beginPath call`) and add body context only when necessary.
- Before merging branches, always run `./gcf.sh`.

## Memory Logging

- When a task is particularly difficult but is ultimately completed, document how it was achieved in `MEMORIES.md` so we can avoid repeating the same work. Keep entries succinct; telegraphic notes are fine. Always append; never edit or delete prior entries.
- Only reference past memories when the user prompts for them or when they are directly relevant to avoid repeating a known hard issue.
- Only append a new memory after asking for permission first, unless the user explicitly asks to log it.

## Environment & Tooling

- Python uses `uv` + `.venv` (`pyproject.toml` requires Python 3.12+). `init_env.sh` runs `uv sync --all-extras` and activates the venv.
- `dev_install.sh` is the one-stop local setup (runs `init_env.sh`, installs frontend deps, installs agent sidecars, then cleans). Source it if you want the venv to stay active: `. ./dev_install.sh`.
- `frontend/backendStart.sh` acts as the bridge to the Python server; keep custom flags documented in the script header when extending it.
- Regenerate TypeScript bindings or templates via `pnpm generate` whenever editing files under `frontend/generation/`.
- Clean stale artifacts using `cleanup.sh` before packaging or publishing to avoid shipping stray build outputs.
- Node is pinned in `scripts/node_version.txt` (used by `scripts/bundle_node_runtime.sh` during builds); keep local Node compatible.

## Worktrees & Ports

- `./worktree.sh <branch...>` (or `pnpm -C frontend worktree` / `pnpm -C frontend worktrees`) creates worktrees, copies `.env*`, runs `./dev_install.sh` per worktree, then enters the worktree by default only when creating a single worktree (multi-worktree runs imply `--stay`).
- `./scripts/run-dev-instance.sh` starts a dev instance with per-worktree port offsets (defaults: `8000/3000` + offset). Use `--mode startr` or `SETTA_HOST/SETTA_PORT/SETTA_DEV_FRONTEND_PORT` for overrides.

## Endpoints

Endpoint functions on the backend and frontend always have the exact same name. On the frontend, always use route functions from generatedEndpoints. If the function exists on the backend but not on the frontend, then run pnpm generate to sync the backend and frontend endpoint function definitions.

## Pydantic

Never use the `alias` feature in pydantic. Camel case is fine for pydantic attributes, if it makes the backend/frontend communication easier.

## Environment

Whenever you run `pnpm generate` or `format_code`, make sure to first run `activate.sh` to activate the correct python environment. Specifically, go to the root folder of the project, and run `source activate.sh && cd frontend && pnpm generate`.

To run backend-only tests: `./scripts/run_backend_tests.sh` (uses pytest).

To run anything python related: `source activate.sh && <python command goes here>`

## Project State access style

I prefer a hard KeyError instead of hiding problems via project_state.some_dict.get(key).
Make existence checks explicit (e.g., `if key not in dict: raise KeyError(...)`) instead of relying on bare dict access for side effects.
When you know a section impl or code obj impl must be of a specific type, use the helper getter functions ending with "with_type_guard".

## Generated types

Don't manually edit files in `backend/setta/types/generated`. These are generated via `pnpm generate`.

To cleanup generated files after you've imported what you need from them, you can run pnpm full-cleanup to remove unused generated types.

`pnpm full-cleanup` runs Knip + a Python prune step; only run it after you have updated imports to use the generated types you need, because it deletes unused generated files.

## Tests

Tests should reflect production behavior as closely as possible. It's ok if this means the tests take longer. DO NOT use "mock", "fake" or "dummy" classes, or "cast" tricks.

## Python imports

Use TYPE_CHECKING blocks when possible.
Always put imports at the top of the file.
Never import annotations from **future**.

## Safety

Do not add try/except and try/catch blocks unless absolutely necessary.
Avoid being overly cautious about everything. I don't want endless safety checks everywhere.

## Python type annotations

Do not use Iterable and Mapping unless really necessary.

## Refactoring

We do NOT need backward compatibility!

When refactoring, performance is a first-class requirement:
- Try to reduce DOM tree complexity (fewer nodes, fewer wrappers, less layout/reflow work) when possible.
- Try to improve JS/TS runtime performance (less work per render, fewer allocations, avoid repeated expensive computations, fewer renders).
- Prefer simpler, flatter, more readable code when it does not harm performance; do not trade clarity for cleverness.

For any refactor where performance is relevant:
- Establish a baseline first (before refactor) using `chrome-devtools-mcp` (Performance/Rendering/Memory as appropriate).
- After refactor, re-measure the same scenario and confirm performance improved (or clearly document the tradeoff).
- Update tests: add new tests or modify existing ones to validate behavior (existing + intended new behavior). When feasible, add coverage for large DOM / large data scenarios and/or lightweight performance guard rails.

Record before/after performance results in the repo under `perf/` (append-only reports; do not rewrite prior results, append corrections/new runs instead).

Refactor definition (behavior-preserving):
- Assume user-facing behavior must remain identical (unless the developer explicitly requests a behavior change). This includes UX flows, state changes, accessibility behavior, and visual UI output.
- Even if the DOM structure changes significantly or the implementation is rewritten, the user should not notice any difference other than improved performance.
- If you are not certain what behavior is intended (or whether a subtle UI/UX change is acceptable), stop and ask the developer clarifying questions before proceeding.

Perf testing priority (automated-first):
- Automated tests are paramount. Prefer Playwright (E2E) and Vitest (unit/integration) performance guardrails as the primary enforcement mechanism.
- Use `chrome-devtools-mcp` for manual profiling and investigation while you work, but do not treat DevTools-only measurement as a substitute for automated coverage.
- When adding performance tests, prefer stable/structural metrics (DOM node counts, render counts, expensive function call counts, payload sizes) and only add timing-based assertions when the threshold is robust enough to avoid flakiness.
