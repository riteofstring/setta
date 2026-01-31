# Repository Guidelines

## Project Structure & Module Organization

- `backend/setta/` houses the Python package, including API routers, code generation, and server state modules that ship to PyPI.
- `frontend/` contains the React/Vite UI; place components and stores in `src/`, shared templates in `generation/`, and static assets under `public/`.
- `setta_files/` stores runtime metadata created by the app; it is gitignored and should not be committed. Keep only canonical fixtures under version control elsewhere and wipe local noise before committing.
- Root scripts such as `build.sh`, `build_and_upload.sh`, and `format_code.sh` orchestrate packaging, publishing, and formatting; keep them executable after edits.
- The `tests/` directory mirrors `backend/setta` directly (for example, `tests/auth`, `tests/code_gen`, `tests/middleware`, `tests/start`); do not nest suites under `tests/setta`.

## Build, Test, and Development Commands

- `pnpm start` (or `pnpm startr` for backend reloads) runs Vite alongside `frontend/backendStart.sh` for a full-stack dev server (Vite defaults to `http://127.0.0.1:3000`, backend defaults to `http://127.0.0.1:8000`).
- `pnpm -C frontend ai` starts dev + a CDP-enabled Chrome; `pnpm -C frontend aicdt` adds auto-open DevTools; `pnpm -C frontend aireset` wipes `setta_files` then starts.
- `pnpm -C frontend kill` stops dev processes + sessions; `pnpm -C frontend cdp-port` prints the CDP port for the current worktree.
- `pnpm build` produces the production frontend bundle; `./build.sh` wraps this, bundles the Node runtime + sidecars, copies artifacts into `backend/setta/static/frontend/`, and builds the wheel via `python -m build`.
- `pnpm test` executes the Vitest suite (watch mode: `pnpm test -- --watch`); Playwright E2E runs via `./scripts/run-playwright-e2e.sh`.
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
- In typescript, avoid nested ternary statements. Annotate function arguments with expected types so that types and truthiness of argument attributes can be inferred.
- Avoid "any" types, unless absolutely necessary.
- Do not use no-op assignments like `_ = var` to silence unused parameters; remove unused args.

## Testing Guidelines

- Frontend unit/integration tests should live beside the code as `*.test.tsx` files; cover store logic, reducers, and view regressions with Vitest + React Testing Library helpers.
- Frontend E2E tests live under `frontend/tests/e2e/` as Playwright `*.spec.ts` files.
- Always use chrome-devtools-mcp to verify any visual edits, even when Playwright/Vitest tests run.
- Before using chrome-devtools-mcp, read `docs/guides/browser-mcp-quickstart.md` for the CDP-only workflow and worktree port guidance.
- You should never start `pnpm ai`/`pnpm -C frontend ai`, `pnpm -C frontend aireset`, or `pnpm -C frontend aicdt`; if chrome-devtools-mcp is needed, the developer runs it first.
- Frontend tests are split into unit/integration tests (Vitest, colocated as `*.test.tsx`) and E2E tests (Playwright, `frontend/tests/e2e/*.spec.ts`).
- Always run relevant Vitest or Playwright tests if they exist for the task.
- Backend tests live under `tests/` mirroring `backend/setta`; run them with `./scripts/run_backend_tests.sh` (pytest).
- Backend and frontend tests must not rely on existing files in `setta_files`. If a test needs to mimic `setta_files`, create it under a temporary directory (for example `/tmp`) and point the test there (see existing tests for patterns).
- Document manual verification steps (e.g., launching `setta` against a sample project) in your PR description when automated coverage is not yet available.
- Do not add or change production code for the purpose of easing tests—tests must adapt to production behavior.

## Commit & Pull Request Guidelines

- Follow the repository’s short, present-tense commit summaries (`add layers to unsharedKeys`, `delete extra beginPath call`) and add body context only when necessary.

## Environment & Tooling

- Python uses `uv` + `.venv` (`pyproject.toml` requires Python 3.12+). `init_env.sh` runs `uv sync --all-extras` and activates the venv.
- `dev_install.sh` is the one-stop local setup (runs `init_env.sh`, installs frontend deps, installs agent sidecars, then cleans). Source it if you want the venv to stay active: `. ./dev_install.sh`.
- `frontend/backendStart.sh` acts as the bridge to the Python server; keep custom flags documented in the script header when extending it.
- Regenerate TypeScript bindings or templates via `pnpm generate` whenever editing files under `frontend/generation/`.
- Clean stale artifacts using `cleanup.sh` before packaging or publishing to avoid shipping stray build outputs.
- Node is pinned in `scripts/node_version.txt` (used by `scripts/bundle_node_runtime.sh` during builds); keep local Node compatible.

## Worktrees & Ports

- `./scripts/create-worktrees.sh <branch...>` (or `pnpm -C frontend worktrees`) creates worktrees, copies `.env*`, and runs `./dev_install.sh` per worktree.
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
