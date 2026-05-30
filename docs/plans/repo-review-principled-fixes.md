# Repo Review Principled Fix Plan

This plan addresses the latest review findings around surprising composer
behavior, silent corrupt-state isolation, stringly typed frontend contracts,
provider event mismatches, run output pagination, and manually mirrored
frontend contract types.

The common fix is to make ownership and failure boundaries explicit. User
actions should be intentional. Durable state should either load completely or
fail with a typed app-state error. Provider protocol data should be strictly
validated at the adapter boundary. TypeScript should consume generated Go-owned
contracts and values, not maintain local mirrors.

## Goals

- Remove hidden or surprising user commands from the chat composer.
- Make corrupt durable state fail loudly in user-facing service paths.
- Generate TypeScript literal unions for Go-owned status/type/value contracts.
- Treat mismatched provider events as protocol drift, not harmless noise.
- Make run-output pagination honest, bounded, and fully reachable from the UI.
- Remove manually maintained TypeScript mirrors of generated HTTP contracts.

## Non-Goals

- Do not add migrations, legacy readers, old-field aliases, compatibility
  shims, dual-read paths, or transitional adapters.
- Do not add heuristic recovery for malformed chat data.
- Do not add polling as a substitute for event-stream correctness.
- Do not build a general notification center as part of this work.
- Do not replace the file store with another persistence layer in this plan.

## Guiding Principles

- A normal text-editing key must not submit, queue, approve, deny, or cancel
  work.
- Backend state corruption is not a bad request. It is an internal state
  failure and should be reported through typed errors and diagnostics.
- A diagnostic can add context, but it must not be the only signal when the
  caller needs a hard failure.
- Provider messages that do not belong to the active thread or turn are
  integration drift unless a specific protocol guarantee says otherwise.
- Frontend switches over backend-owned states should be exhaustive at compile
  time.
- Pagination contracts must tell the truth: if more data exists, callers must
  have a deterministic way to load it.

## Phase 1: Make Composer Commands Explicit

Problem:

- `Tab` currently queues the draft message.
- When no run is active, queueing immediately promotes the message into a
  running turn.
- This turns a common focus-navigation and text-editing key into a hidden submit
  command.

Principled fix:

- Remove `Tab` as a queue shortcut.
- Keep `Enter` submit only if product direction explicitly wants chat-style
  send-on-enter. Otherwise move to `Cmd/Ctrl+Enter`.
- Add an explicit Queue button only when a queue action makes sense.
- When a run is active, separate the concepts of:
  - send steering message now
  - queue follow-up message for later
  - stop current run
- Disable or hide queue controls when queueing would immediately run the same
  prompt and provide no meaningful distinction from Send.

Implementation steps:

- Replace `isQueueShortcut` with either no shortcut or a conventional modified
  shortcut.
- Add tests for keyboard behavior:
  - `Tab` does not call `queueMessage`.
  - submit shortcut calls `sendMessage` or `steerMessage` exactly once.
  - queue action is reachable only through the explicit queue control.
- Add renderer tests for active-run and idle composer controls.
- Keep backend `QueueUserMessage` semantics strict; do not add backend behavior
  shims to compensate for old UI behavior.

Verification:

```sh
pnpm -C desktop test
pnpm -C desktop typecheck
```

## Phase 2: Fail Closed On Corrupt Durable State

Problem:

- `ScanConversations` and `ScanRuns` collect corrupt records and continue.
- `ListConversations` records diagnostics but returns a partial list.
- Queued-state helpers skip corrupt queued messages or missing trigger messages.
- This can make chats, active runs, or queued work disappear from the UI.

Principled fix:

- User-facing service methods must fail if any durable state required for the
  requested view is corrupt.
- Corrupt state should be returned as `CorruptStateError` and mapped to HTTP
  500 `corrupt_chat_state`.
- Diagnostics should be recorded before returning the hard failure when possible.
- A partial list is allowed only for an explicitly named administrative or
  repair-oriented API, which does not exist yet in this app.

Implementation steps:

- Replace user-facing uses of `ScanConversations` and `ScanRuns` with strict
  wrappers that return the first corrupt error after recording diagnostics.
- Keep lower-level scan helpers only if internal startup or future repair tools
  need to inspect multiple errors. Name them to make partial behavior explicit,
  for example `ScanConversationsAllowingCorrupt`.
- Change `ListConversations` so any corrupt conversation, message list, run, or
  run/message relationship fails the request.
- Change queued-state computation so missing trigger messages and corrupt
  queued messages fail the request instead of disappearing from `QueueState`.
- Review startup recovery:
  - valid interrupted running runs may still transition to failed.
  - malformed runs should record a diagnostic and make startup fail, unless the
    UI has a dedicated corrupt-state screen that can block normal chat use.
- Stop ignoring diagnostic write failures in paths where the primary operation
  otherwise succeeds because of a skipped corrupt record. The primary operation
  should fail instead.

Test changes:

- Remove tests that require partial success for malformed conversation or run
  state.
- Add tests that assert:
  - corrupt conversation metadata makes `ListConversations` return
    `CorruptStateError`.
  - corrupt run metadata makes `ListConversations` return `CorruptStateError`.
  - missing queued trigger message makes page loading fail as corrupt state.
  - HTTP maps these failures to `corrupt_chat_state` with status 500.
  - diagnostics are recorded when possible, but the request still fails even if
    diagnostic recording cannot complete.

Verification:

```sh
./scripts/go.sh test ./internal/chat ./internal/httpapi ./internal/runtime
```

## Phase 3: Generate Backend-Owned Literal Unions

Problem:

- Generated TypeScript currently exposes backend-owned values such as role,
  status, delivery, run-item type, approval kind, and diagnostic severity as
  plain `string`.
- Renderer code therefore has silent default branches for unknown values.
- The UI can render unknown run statuses as Ready or unknown activity types as
  generic tools.

Principled fix:

- Represent backend-owned value sets in Go with owner-defined typed constants.
- Expose those value sets through the contract generator.
- Generate TypeScript literal union types and strict decoders from the Go-owned
  value sets.
- Require renderer mappings and switches to be exhaustive with `satisfies` and
  `never` assertions.

Implementation steps:

- Introduce Go string alias types for owned values, for example:
  - `type MessageRole string`
  - `type MessageStatus string`
  - `type RunStatus string`
  - `type RunItemType string`
  - `type DiagnosticSeverity string`
- Update contract structs to use those typed fields where the domain owns the
  value set.
- Add a small registry in the owning package for each exported value set. The
  registry is the source of truth used by validation and generation.
- Extend `cmd/generate-contracts` to emit:
  - `export type RunStatus = "queued" | "running" | ...`
  - decoders that reject unsupported strings with precise labels
  - interfaces that reference those union types
- Update renderer code:
  - replace string comparisons with generated union types.
  - replace default UI fallbacks with exhaustive mappings.
  - fail loudly for unsupported generated values, which should be impossible
    after strict decoding.

Test changes:

- Add generator tests for literal-union output.
- Add renderer tests for exhaustive mappings where practical.
- Keep tests behavior-focused. Do not add generator drift tests that only rerun
  the generator and compare checked-in output.

Verification:

```sh
./scripts/go.sh test ./cmd/generate-contracts ./internal/chat
./scripts/go.sh run ./cmd/generate-contracts
pnpm -C desktop typecheck
pnpm -C desktop test
```

## Phase 4: Treat Provider Thread/Turn Mismatches As Drift

Problem:

- Codex notifications with a different `threadId` or `turnId` are silently
  ignored.
- This can drop assistant text, run activity, or completion-relevant events
  without any user-visible error.

Principled fix:

- A mismatched notification on a per-turn app-server client is provider
  protocol drift.
- State-changing mismatches should record a provider diagnostic and fail the
  active turn.
- Known non-state-changing messages may record a diagnostic and request resync,
  but only with an explicit reason documented in code.

Implementation steps:

- Replace `notificationMatchesTurn` boolean filtering with a function that
  returns a typed result:
  - matches
  - missing required IDs
  - mismatched IDs
- For handlers that require a turn match, return a provider-drift error on
  mismatch.
- Record diagnostic context:
  - method
  - expected thread ID
  - expected turn ID
  - received thread ID
  - received turn ID
  - bounded params
- Keep unsupported provider notifications and unsupported server requests as
  hard failures.
- Do not convert unknown or mismatched provider messages into ordinary notice
  activity rows.

Test changes:

- Add Codex harness tests for mismatched assistant delta, item upsert, output
  delta, and completion events.
- Assert that mismatches:
  - record provider diagnostics
  - do not mutate transcript or run activity
  - fail the active turn or force resync according to the handler policy
- Add one test for a genuinely ignorable message only if the protocol explicitly
  documents that it may not be scoped to the current turn.

Verification:

```sh
./scripts/go.sh test ./internal/chat
```

## Phase 5: Make Run Output Pagination Complete And Bounded

Problem:

- The store reads all output chunks before applying `limit`.
- Message pages embed only a capped preview.
- The renderer loads one extra page on expansion and then ignores `hasMore` and
  `nextOrdinal`.
- Large command output can be expensive to read and not fully reachable from
  the UI.

Principled fix:

- Store-level pagination should avoid reading more files than the requested
  page needs.
- API responses should expose whether more output exists and the cursor needed
  to continue.
- Renderer state should preserve per-item pagination state.
- Expanded output rows should either load until complete through explicit user
  action or present a clear Load more control.

Implementation steps:

- Change `runItemOutputFiles` usage so `LoadRunItemOutputPage` slices filenames
  before reading payloads.
- Define output pagination in the API contract:
  - `afterOrdinal`
  - `limit`
  - `hasMore`
  - `nextOrdinal`
- Add per-run-item output page state in the chat store:
  - loaded through ordinal
  - has more
  - loading state
  - error state
- Update `RunActivityRow`:
  - load first page on expansion if needed.
  - show Load more when `hasMore` is true.
  - pass `nextOrdinal` back to `loadRunItemOutput`.
- Keep message-page embedded output as a preview only. Do not imply that the
  preview is complete.

Test changes:

- Backend tests:
  - `LoadRunItemOutputPage` reads and returns only the requested page.
  - `hasMore` and `nextOrdinal` are correct.
  - negative cursors and limits fail loudly.
- Renderer store tests:
  - multiple output pages append without duplicates.
  - per-item `hasMore` state is tracked separately.
  - loading item B does not mutate item A pagination state.
- Renderer component tests:
  - expanded output with `hasMore` renders a Load more control.

Verification:

```sh
./scripts/go.sh test ./internal/chat
pnpm -C desktop test
pnpm -C desktop typecheck
```

## Phase 6: Remove Manual TypeScript Contract Mirrors

Problem:

- `SubmitApprovalInput` manually mirrors generated `SubmitApprovalRequest`.
- IPC contracts and preload APIs can drift from generated HTTP contracts.

Principled fix:

- Use generated request and response types at every TypeScript boundary where
  the backend owns the contract.
- Manual TypeScript types are allowed only for Electron-only concepts that are
  not backend HTTP contracts, such as runtime versions or backend process
  status.

Implementation steps:

- Replace `SubmitApprovalInput` with generated `SubmitApprovalRequest`.
- Audit `desktop/src/shared/types.ts` and `desktop/src/shared/ipc.ts` for other
  request/response mirrors.
- For IPC methods that only forward backend HTTP requests, use generated types
  directly.
- Consider generating the forwarding IPC contract in a later pass, but do not
  build a second generated endpoint registry. The HTTP endpoint registry remains
  the owner.

Test changes:

- Typecheck should fail if `SubmitApprovalRequest` changes but IPC/preload usage
  does not.
- Existing submit-approval store tests should continue to verify behavior.

Verification:

```sh
pnpm -C desktop typecheck
pnpm -C desktop test
```

## Suggested Sequencing

1. Composer command cleanup. This is narrow and immediately removes surprising
   user behavior.
2. Manual contract mirror removal. This is small and reduces drift before
   broader generator work.
3. Corrupt-state fail-closed behavior. This changes user-visible failure
   semantics and should be done before adding richer state diagnostics.
4. Generated value unions. This is broader but improves every renderer mapping.
5. Provider mismatch handling. This depends on strong value typing and
   diagnostic expectations.
6. Run-output pagination. This is the largest UI/data-flow change and should be
   performance measured.

## Final Verification

Before merging the full set of changes:

```sh
./scripts/format.sh
./check_quality.sh --all
./scripts/check_supply_chain.sh
```

Regenerate contracts whenever Go-owned contracts or value registries change:

```sh
./scripts/go.sh run ./cmd/generate-contracts
```

For the output pagination phase, add an append-only performance note under
`docs/performance/` with before/after numbers for large run-output loading.

## Acceptance Criteria

- Pressing `Tab` in the composer never submits, queues, cancels, approves, or
  denies anything.
- Corrupt chat state cannot silently hide conversations, runs, queued messages,
  or run activity in normal user-facing views.
- Generated TypeScript exposes backend-owned statuses and kinds as literal
  unions, and renderer mappings are exhaustive.
- Provider thread/turn mismatches produce diagnostics and do not silently drop
  state-changing data.
- Large run output can be loaded page by page without reading every chunk for
  each request.
- No generated HTTP request or response contract has a manual TypeScript mirror
  in shared or renderer code.
