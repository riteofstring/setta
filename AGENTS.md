# Repository Guidelines

## Generation & Contracts

- Generate TypeScript surfaces from Go-owned contracts or values programmatically; do not maintain hardcoded mirrors or scattered cross-language constants.
- HTTP endpoint request and response contracts are owned by the `internal/httpapi` endpoint registry; do not maintain a separate generated-type list in the contract generator.
- If you edit generated inputs or owner-defined contracts, regenerate affected outputs before cleanup and before finishing the task.
- Do not manually edit generated outputs.

## Dependencies & Tooling

- Pin checked-in direct dependency versions exactly. Do not use floating version ranges like `^`, `~`, `>=`, `>`, `*`, or `latest`.
- Use `./update_dependencies.sh` when a dependency update needs lockfile changes.
- Use `./scripts/go.sh` for all Go commands so the repo-pinned Go toolchain is used. Do not call `go` directly unless intentionally debugging outside the pinned toolchain.
- Prefer `./scripts/format.sh` for formatting. If direct `gofmt` is needed, run it through the pinned toolchain with `"$("./scripts/go.sh" env GOROOT)/bin/gofmt" -w <files>`.

## Verification

- During implementation, run the narrowest checks that exercise the changed behavior first. Broaden only after the implementation is stable, generated outputs change, or a focused check exposes cross-boundary risk.
- For changes touching chat behavior, Codex harness behavior, provider protocol handling, run lifecycle, queueing, steering, approvals, event streaming, IPC/preload contracts, generated backend contracts, renderer chat state, or transcript UI, deterministic end-to-end app workflow tests through the production Electron/main/preload/renderer/HTTP/store paths are required. Use temporary app data; a scripted fake Codex/provider harness is fine, but unit, store, component, service, or HTTP-only coverage is insufficient.
- Chat workflow tests must cover the relevant parts of opening a workspace, creating a chat, sending a message, receiving streamed assistant output, queueing during an active run, steering, completion/cancellation/failure, queued-work promotion or preservation, approvals when touched, and restart/reload behavior when persistence is touched.
- For changes touching chat workflows, Codex harness behavior, provider protocol handling, run lifecycle, queueing, steering, approvals, or streaming, run the live Codex E2E tests when `OPENAI_API_KEY` is present in `.env`. Check for the key without printing its value; if absent, say the live-provider tests were skipped, and do not treat the skip as proof of provider integration.
- Tests must use temporary directories, never mutate real git history in this repo or any non-disposable developer worktree, and exercise production paths instead of mocks or test-only paths. Skips must be narrow and justified; missing dependencies or capabilities should usually fail loudly.
- Do not add tautological tests or generator drift tests that only rerun generators or formatters and compare checked-in artifacts against current output.
- After a broad gate fails, fix the reported issue and rerun the narrowest relevant check first. Rerun `./check_quality.sh --all` after focused verification passes.
- Before committing source code, tests, scripts, generated inputs or outputs, build/lint/format configuration, or executable examples, run `./scripts/format.sh` and `./check_quality.sh --all`. One clean final run of each is sufficient unless new edits are made afterward.
- Before committing dependency manifests, lockfiles, package manager configuration, Go module configuration, or supply-chain tooling, run `./scripts/check_supply_chain.sh`. For broad implementation commits or release-like commits, run it in addition to the format and quality gates.
- For documentation-only, planning-only, research-only, README-only, or AGENTS-only commits that do not change executable examples, scripts, manifests, generated artifacts, or committed code paths, inspect the diff and run only directly relevant checks. If no automated check applies, say the full workflow was skipped because the change was documentation-only.

## UI Rules

- Frontend code must handle very large DOMs efficiently.
- Treat frontend performance verification as first-class. Prefer automated guardrails; use chrome-devtools profiling when deeper analysis is needed.
- For performance-relevant refactors, baseline first, re-measure after, and record before/after results as append-only reports under `docs/reports/performance/`.
- Avoid div soup.

## Code Shape & Safety

- Keep shared constants at the owning domain boundary, not scattered at the top of unrelated files. Avoid a global constants junk drawer. File-local constants are fine only for private implementation details.
- Prefer TypeScript discriminated unions, `satisfies` mappings, and `never` assertions so switch statements and status handling are checked exhaustively.
- Prefer push-based updates over polling. Do not add polling unless there is a strong, explicit justification and the tradeoffs are documented.
- Do not embed large blocks of executable code in string literals. Prefer normal source files, typed helpers, fixtures, or templates that can be formatted, linted, typechecked, and tested. Keep string-embedded code limited to small fixtures, small generated fragments, or APIs that explicitly require source text.
- Add `try/except` or `try/catch` blocks only when they handle a specific failure path.
- Prefer failing loudly and specifically over silent fallbacks, fake estimates, brittle keyword heuristics, or broad catch-all handling. Use provider or runtime metadata, typed APIs, deterministic parsing, or explicit protocol fields instead of heuristics. Do not implement heuristic fallbacks without explicit approval.
- Never add backward-compatibility shims, legacy support paths, migrations, transitional adapters, dual-read/write paths, old-field aliases, silent compatibility fallbacks, or compatibility layers unless the developer explicitly asks for that exact compatibility work.
- If behavior is unclear or a robust solution is not possible, stop and ask or present the real tradeoffs.
