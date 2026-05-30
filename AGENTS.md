# Repository Guidelines

## Generation & Contracts

- When Go-owned contracts or values need TypeScript surfaces, generate them programmatically instead of maintaining hardcoded mirrors or scattered cross-language constants.
- HTTP endpoint request and response contracts are owned by the `internal/httpapi` endpoint registry; do not maintain a separate generated-type list in the contract generator.
- If you edit generated inputs or owner-defined contracts, regenerate affected outputs before cleanup and before finishing the task.
- Do not manually edit generated outputs.

## Workflow & Verification

- Pin checked-in direct dependency versions exactly. Do not use floating version ranges like `^`, `~`, `>=`, `>`, `*`, or `latest` in dependency manifests.
- Use `./update_dependencies.sh` when a dependency update needs lockfile changes.
- Use `./scripts/go.sh` for all Go commands so the repo-pinned Go toolchain is used. For example, run `./scripts/go.sh test ./...`, `./scripts/go.sh test ./internal/chat`, and `./scripts/go.sh run ./cmd/generate-contracts`; do not call `go` directly unless you are intentionally debugging outside the pinned toolchain.
- Prefer `./scripts/format.sh` for formatting. If direct `gofmt` is needed, run it through the pinned toolchain with `"$("./scripts/go.sh" env GOROOT)/bin/gofmt" -w <files>`.
- Before committing source code, tests, scripts, generated inputs, generated outputs, build configuration, lint configuration, format configuration, or executable examples, run `./scripts/format.sh` and `./check_quality.sh --all`.
- Before committing dependency manifests, lockfiles, package manager configuration, Go module configuration, or supply-chain tooling, run `./scripts/check_supply_chain.sh`.
- Before broad implementation commits or release-like commits, run `./scripts/format.sh`, `./check_quality.sh --all`, and `./scripts/check_supply_chain.sh`.
- For documentation-only, planning-only, research-only, README-only, or AGENTS-only commits that do not change executable examples, scripts, manifests, generated artifacts, or committed code paths, the full workflow is not required. Inspect the diff and run any directly relevant checks; if no automated check applies, say that the full workflow was skipped because the change was documentation-only.
- Do not skip tests broadly. Missing dependencies or capabilities should usually fail loudly. Any skip must be narrow and justified.
- Do not add generator drift tests that only rerun generators or formatters and compare checked-in artifacts against current output.
- Tests must use temporary directories instead of local runtime state, must never mutate real git history in this repo or any non-disposable developer worktree, and should exercise production paths instead of mocks or test-only code paths.
- Do not add tautological tests that only restate the implementation or reproduce the same logic to compute the expected result.

## UI Rules

- Frontend code must handle very large DOMs efficiently.
- Treat frontend performance verification as first-class. Prefer automated guardrails, and use chrome-devtools profiling when deeper analysis is needed.
- For performance-relevant refactors, baseline first, re-measure after, and record before/after results as append-only reports.
- Avoid div soup.

## Code Shape & Safety

- Keep shared constants at the owning domain boundary, not scattered at the top of unrelated files. Avoid a global constants junk drawer. File-local constants are fine only for private implementation details.
- Prefer TypeScript discriminated unions, `satisfies` mappings, and `never` assertions so switch statements and status handling are checked exhaustively.
- Prefer push-based updates over polling. Do not add polling unless there is a strong, explicit justification and the tradeoffs are documented.
- Do not embed large blocks of executable code in string literals. Prefer normal
  source files, typed helpers, fixtures, or templates that can be formatted,
  linted, typechecked, and tested. Keep string-embedded code limited to small
  fixtures, small generated fragments, or APIs that explicitly require source
  text.
- Keep code explicit.
- Do not add `try/except` or `try/catch` blocks unless they are actually needed to handle a specific failure path.
- If a robust solution is not possible, say so explicitly and present the real tradeoffs.
- Prefer failing loudly and specifically over silent fallbacks, fake estimates, brittle keyword heuristics, or broad catch-all handling. Use provider or runtime metadata, typed APIs, deterministic parsing, or explicit protocol fields instead of heuristics. Do not implement heuristic fallbacks without explicit approval.
- Never add backward-compatibility shims, legacy support paths, migrations, transitional adapters, dual-read/write paths, old-field aliases, silent compatibility fallbacks, or compatibility layers unless the developer explicitly asks for that exact compatibility work.
- If behavior is unclear, stop and ask.
