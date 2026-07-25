# Repository Guidelines

## Product Philosophy

- Setta should feel like it just works. The user should not have to deal with internal app failures.
- When the user gives a request, the app should start the work, continue the current work, route the request somewhere useful, or ask a genuinely useful clarification question.
- Do not show errors like "the narrator model returned an invalid decision." That is an internal implementation problem. The app should retry, repair the AI output, or use an obvious product rule when the right behavior is clear.
- Ask the user only when the user can make a meaningful choice, such as whether to change the current run or queue something as the next task. Do not ask the user to retry routing, schema, projection, or formatting work.
- AI should still make judgment calls when judgment is needed. Product code should enforce basic invariants so bad JSON, invalid schema output, or routing-format mistakes do not break the UX.

## Unreleased Product Policy

- Setta is unreleased. There is no legacy code or legacy behavior to preserve.
- Never spend effort on backward compatibility. Do not add compatibility shims, migrations, transitional adapters, dual-read/write paths, old-field aliases, silent compatibility fallbacks, or support for superseded behavior.
- Change current contracts, data shapes, and implementations directly to the design the product should have now. Remove superseded code instead of preserving it alongside the replacement.

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

- Do not run automated tests or the test suite during implementation.
- Run tests only when both conditions are true: the branch is ready to merge, and the user explicitly asks for tests. The user decides when verification begins.
- When the user asks for tests, run the narrowest checks that exercise the changed behavior first. Broaden only after the implementation is stable, generated outputs change, or a focused check exposes cross-boundary risk.
- When requested verification covers topic-conversation behavior, Codex harness behavior, provider protocol handling, run lifecycle, queueing, steering, approvals, event streaming, IPC/preload contracts, generated backend contracts, renderer conversation state, or topic-projection UI, include deterministic end-to-end app workflow tests through the production Electron/main/preload/renderer/HTTP/store paths. Use temporary app data; a scripted fake Codex/provider harness is fine, but unit, store, component, service, or HTTP-only coverage is insufficient.
- Topic-conversation workflow tests must cover the relevant parts of opening a workspace, creating a conversation, submitting input, receiving streamed assistant output, queueing during an active run, steering, completion/cancellation/failure, queued-work promotion or preservation, approvals when touched, and restart/reload behavior when persistence is touched.
- When user-requested merge verification covers topic-conversation workflows, Codex harness behavior, provider protocol handling, run lifecycle, queueing, steering, approvals, or streaming, run the live Codex E2E tests when the local Codex CLI is signed in with ChatGPT auth. Live tests must not use `OPENAI_API_KEY`; if ChatGPT auth is unavailable, say the live-provider tests were skipped, and do not treat the skip as proof of provider integration.
- Tests must use temporary directories, never mutate real git history in this repo or any non-disposable developer worktree, and exercise production paths instead of mocks or test-only paths. Skips must be narrow and justified; missing dependencies or capabilities should usually fail loudly.
- Do not add tautological tests or generator drift tests that only rerun generators or formatters and compare checked-in artifacts against current output.
- During user-requested merge verification, after a broad gate fails, fix the reported issue and rerun the narrowest relevant check first. Rerun the broad gate only when the change still requires it.
- Do not run `./check_quality.sh`, `./scripts/check_supply_chain.sh`, or other automated verification gates unless the user explicitly asks for verification.
- Formatting changed files is allowed during implementation, but formatting is not a reason to start the test suite or broader verification gates.
- For documentation-only, planning-only, research-only, README-only, or AGENTS-only commits, inspect the diff; do not run automated checks unless the user asks.

## UI Rules

- Frontend code must handle very large DOMs efficiently.
- Treat frontend performance verification as first-class. Prefer automated guardrails; use chrome-devtools profiling when deeper analysis is needed.
- For performance-relevant refactors, baseline first, re-measure after, and record before/after results as append-only reports under `docs/reports/performance/`.
- When the user refers to the latest recording or a `./scripts/dev_record_desktop_session.sh` session, inspect `.recordings/latest.json` first and then the referenced artifact directory. These recordings are repo-local event, log, and screenshot artifacts under `.recordings/`, not normal `.mov` or `.mp4` desktop captures.
- Avoid div soup.

## Code Shape & Safety

- Keep shared constants at the owning domain boundary, not scattered at the top of unrelated files. Avoid a global constants junk drawer. File-local constants are fine only for private implementation details.
- Prefer TypeScript discriminated unions, `satisfies` mappings, and `never` assertions so switch statements and status handling are checked exhaustively.
- Prefer push-based updates over polling. Do not add polling unless there is a strong, explicit justification and the tradeoffs are documented.
- Do not embed large blocks of executable code in string literals. Prefer normal source files, typed helpers, fixtures, or templates that can be formatted, linted, typechecked, and tested. Keep string-embedded code limited to small fixtures, small generated fragments, or APIs that explicitly require source text.
- Add `try/except` or `try/catch` blocks only when they handle a specific failure path.
- Prefer failing loudly and specifically over silent fallbacks, fake estimates, brittle keyword heuristics, or broad catch-all handling. Use provider or runtime metadata, typed APIs, deterministic parsing, or explicit protocol fields instead of heuristics. Do not implement heuristic fallbacks without explicit approval.
- Follow the unreleased-product policy: replace superseded behavior directly and remove the old implementation.
- If behavior is unclear or a robust solution is not possible, stop and ask or present the real tradeoffs.
