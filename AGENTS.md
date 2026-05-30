# Repository Guidelines

## Generation & Contracts

- When Go-owned contracts need TypeScript surfaces, generate them programmatically instead of maintaining hardcoded mirrors.
- If you edit generated inputs or owner-defined contracts, regenerate affected outputs before cleanup and before finishing the task.
- Do not manually edit generated outputs.

## Workflow & Verification

- Pin checked-in direct dependency versions exactly. Do not use floating version ranges like `^`, `~`, `>=`, `>`, `*`, or `latest` in dependency manifests.
- Use `./update_dependencies.sh` when a dependency update needs lockfile changes.
- Run formatting, linting, dead-code checks, and relevant tests before committing.
- Unless the developer explicitly narrows verification scope, run the repository quality check before committing.
- Do not skip tests broadly. Missing dependencies or capabilities should usually fail loudly. Any skip must be narrow and justified.
- Do not add generator drift tests that only rerun generators or formatters and compare checked-in artifacts against current output.
- Tests must use temporary directories instead of local runtime state, must never mutate real git history in this repo or any non-disposable developer worktree, and should exercise production paths instead of mocks or test-only code paths.
- Do not add tautological tests that only restate the implementation or reproduce the same logic to compute the expected result.

## UI Rules

- Frontend code must handle very large DOMs efficiently.
- Treat frontend performance verification as first-class. Prefer automated guardrails, and use chrome-devtools profiling when deeper analysis is needed.

## Code Shape & Safety

- Keep code explicit and avoid div soup.
- Do not add `try/except` or `try/catch` blocks unless they are actually needed to handle a specific failure path.
- If a robust solution is not possible, say so explicitly and present the real tradeoffs.
- Prefer failing loudly and specifically over silent fallbacks, fake estimates, brittle keyword heuristics, or broad catch-all handling. Do not implement heuristic fallbacks without explicit approval.
- Prefer provider or runtime metadata, typed APIs, deterministic parsing, or explicit protocol fields over heuristics.
- Never add backward-compatibility shims, legacy support paths, migrations, transitional adapters, dual-read/write paths, old-field aliases, silent compatibility fallbacks, or compatibility layers unless the developer explicitly asks for that exact compatibility work.
- If behavior is unclear, stop and ask.
- For performance-relevant refactors, baseline first, re-measure after, and record before/after results as append-only reports.
