# Repository Guidelines

## Project Structure & Module Organization

- `backend/setta/` houses the Python package, including API routers, code generation, and server state modules that ship to PyPI.
- `frontend/` contains the React/Vite UI; place components and stores in `src/`, shared templates in `generation/`, and static assets under `public/`.
- `setta_files/` stores runtime metadata created by the app; keep only canonical fixtures under version control and wipe local noise before committing.
- Root scripts such as `build.sh`, `build_and_upload.sh`, and `format_code.sh` orchestrate packaging, publishing, and formatting; keep them executable after edits.
- The `tests/` directory mirrors `backend/setta` directly (for example, `tests/auth`, `tests/code_gen`, `tests/middleware`, `tests/start`); do not nest suites under `tests/setta`.

## Build, Test, and Development Commands

- `pnpm start` (or `pnpm startr` for backend reloads) runs Vite alongside `backendStart.sh` for a full-stack dev server on localhost:8000.
- `pnpm build` produces the production frontend bundle; `./build.sh` wraps this, copies artifacts into `backend/setta/static/frontend/`, and builds the wheel via `python -m build`.
- `pnpm test` executes the Vitest suite; watch mode is available with `pnpm test -- --watch` for UI-driven workflows.
- `./format_code.sh` applies Ruff import sorting, lint fixes, and formatting to every Python module; run it before committing backend changes.
- Release smoke tests rely on `test_install.sh`, which builds, installs, and verifies the packaged distribution in a fresh environment.

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

- Frontend tests live beside the code as `*.test.tsx` files; cover store logic, reducers, and view regressions with Vitest + React Testing Library helpers.
- Always use the agent-browser CLI to verify any visual edits, even when Playwright/Vitest tests run.
- Before using agent-browser or chrome-devtools-mcp, read `docs/guides/agent-browser-usage.md` for the current CDP-only workflow (pnpm ai + cdp-port/abcdp-run).
- Always run relevant Vitest or Playwright tests if they exist for the task; if none exist, propose what tests should be created when appropriate.
- Backend coverage is currently sparse—add focused unit tests under `tests/` that mirror the `setta` namespace and execute them with `python -m unittest discover`.
- Document manual verification steps (e.g., launching `setta` against a sample project) in your PR description when automated coverage is not yet available.
- Do not add or change production code for the purpose of easing tests—tests must adapt to production behavior.

## Commit & Pull Request Guidelines

- Follow the repository’s short, present-tense commit summaries (`add layers to unsharedKeys`, `delete extra beginPath call`) and add body context only when necessary.

## Environment & Tooling

- Initialize local environments with `. ./init_env.sh` followed by `. ./dev_install.sh` to sync Python and pnpm dependencies; these scripts expect Python 3.12+ and pnpm on PATH.
- `frontend/backendStart.sh` acts as the bridge to the Python server; keep custom flags documented in the script header when extending it.
- Regenerate TypeScript bindings or templates via `pnpm generate` whenever editing files under `frontend/generation/`.
- Clean stale artifacts using `cleanup.sh` before packaging or publishing to avoid shipping stray build outputs.

## Endpoints

Endpoint functions on the backend and frontend always have the exact same name. On the frontend, always use route functions from generatedEndpoints. If the function exists on the backend but not on the frontend, then run pnpm generate to sync the backend and frontend endpoint function definitions.

## Pydantic

Never use the `alias` feature in pydantic. Camel case is fine for pydantic attributes, if it makes the backend/frontend communication easier.

## Environment

Whenever you run `pnpm generate` or `format_code`, make sure to first run `activate.sh` to activate the correct python environment. Specifically, go to the root folder of the project, and run `source activate.sh && cd frontend && pnpm generate`.

To run python tests: `source activate.sh && python -m unittest discover`.

To run anything python related: `source activate.sh && <python command goes here>`

If frontend tests still don't exist, call that out and propose what should be added; otherwise run the relevant tests.

## Project State access style

I prefer a hard KeyError instead of hiding problems via project_state.some_dict.get(key).
Make existence checks explicit (e.g., `if key not in dict: raise KeyError(...)`) instead of relying on bare dict access for side effects.
When you know a section impl or code obj impl must be of a specific type, use the helper getter functions ending with "with_type_guard".

## Generated types

Don't both manually editing files in `backend/setta/types/generated`. These are generated via `pnpm generate`.

To cleanup generated files after you've imported what you need from them, you can run pnpm full-cleanup to remove unused generated types.

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
