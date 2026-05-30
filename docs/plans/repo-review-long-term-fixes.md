# Repo Review Long-Term Fix Plan

This plan addresses the review findings around Codex turn status handling,
JSON-RPC lifecycle races, provider protocol drift, malformed durable state
classification, and transcript performance at large history sizes.

The guiding rule for this work is to make every ownership boundary explicit.
Provider protocol data should be mapped into typed Setta domain outcomes.
Durable state corruption should fail as app state corruption, not as a normal
user request error. UI projections should resync from authoritative backend
state when push delivery cannot be trusted. Do not add compatibility shims,
legacy aliases, dual-read paths, migrations, or heuristic fallbacks unless that
exact compatibility work is explicitly approved.

## Goals

- Classify Codex turn outcomes with explicit Setta-owned domain states.
- Broadcast Codex app-server process termination to all waiters and all pending
  JSON-RPC calls.
- Treat unknown provider protocol messages as integration drift, not normal run
  activity.
- Return and surface malformed durable state as internal/corrupt state failures.
- Make transcript rendering and run activity lookup scale to large histories.
- Add focused tests and performance guardrails that verify behavior, not
  implementation details.

## Non-Goals

- Do not build a full notification center.
- Do not introduce durable migrations or compatibility readers.
- Do not replace the file store with SQLite as part of this plan.
- Do not add polling as a substitute for event stream health.
- Do not create generator drift tests that only rerun generators and compare
  outputs.

## Library Guidance

Keep new dependencies narrow. Most backend fixes should use the Go standard
library and existing project patterns.

Recommended:

- Use `react-virtuoso` for transcript virtualization. It is a strong fit for
  variable-height chat rows, older-page loading, and bottom-pinned chat
  scrolling.
- Use `@testing-library/react` with `jsdom` or `happy-dom` if transcript
  virtualization needs component-level DOM behavior tests.

Acceptable alternatives:

- Use `@tanstack/react-virtual` instead of `react-virtuoso` only if the app
  needs lower-level control and is ready to own more scroll anchoring behavior.
- Use `tinybench` only for focused store-operation or indexing microbenchmarks.
  Prefer user-visible large-history rendering tests first.

Avoid:

- Do not add a Go JSON-RPC framework for lifecycle broadcasting. Use
  `sync.Mutex`, closed channels, and typed pending response structs.
- Do not add a second runtime validation library for generated backend
  contracts. Keep the generated strict decoders.
- Do not add a broad error-handling framework. Add small typed error wrappers in
  the owning Go packages.

If any dependency is added, pin the direct version exactly and use the repo
dependency workflow:

```sh
./update_dependencies.sh
./scripts/check_supply_chain.sh
```

## Current Findings

### Codex Turn Completion Treats Unknown Statuses As Success

`handleCodexTurnCompleted` only special-cases `failed`; every other
`turn.status` ends the harness successfully. This means `interrupted`,
cancellation statuses, or a new provider status can drive the service into
`completeTurn`, making a cancelled or unknown provider outcome look like a
successful assistant response.

### JSON-RPC Exit Is A Single-Consumer Signal

`jsonRPCClient.done` is consumed by both the run wait loop and individual RPC
calls. If the app-server exits while a cancel, steer, or approval response call
is waiting, one waiter can consume the terminal signal and leave another waiter
blocked. That can keep a run attached and active forever.

### Unknown Provider Notifications Become Completed Notices

Unsupported Codex notifications are converted into completed `notice` run
items. That can hide provider protocol drift behind ordinary-looking activity
rows.

### Malformed Durable State Maps To Request Failure

Malformed chat, workspace, or app state is often returned as a plain error.
HTTP error mapping then treats it like a 400 client/request failure unless it is
wrapped as a persistence error. Corrupt local state is an internal app state
failure and should be classified separately.

### Transcript Rendering Does Not Scale

The transcript renders every loaded message and each row filters full run item
arrays. Loading many older pages creates large DOMs and repeated O(messages *
items) work.

## Design Principles

- Provider protocol handling should be strict, typed, and source-documented.
- Unknown provider statuses and methods should fail loudly or emit diagnostics.
- A process exit should be a broadcast lifecycle event.
- Durable state errors should use typed categories that preserve root causes.
- Event-stream and provider errors should force resync where local projections
  may be incomplete.
- Renderer data should be normalized and indexed before rendering.
- Tests should exercise user-visible behavior and production paths.

## Phase 1: Typed Codex Turn Outcomes

Replace the `done bool, error` notification result with a typed harness
completion result.

Suggested domain type:

```go
type TurnOutcome string

const (
    TurnOutcomeCompleted TurnOutcome = "completed"
    TurnOutcomeCancelled TurnOutcome = "cancelled"
    TurnOutcomeFailed    TurnOutcome = "failed"
)
```

Implementation steps:

- Introduce a typed result returned by Codex notification handling.
- Map current Codex `turn.status` values into `TurnOutcome`.
- Treat unknown statuses as provider protocol errors.
- Treat cancelled/interrupted outcomes as cancellation, not completion.
- Route `TurnOutcomeCompleted` to `completeTurn`.
- Route `TurnOutcomeCancelled` to the existing cancellation transition or a new
  provider-cancelled transition that persists a cancelled run and assistant
  message.
- Route `TurnOutcomeFailed` to `failTurn` with the provider error message.
- Add a short comment above the provider status map naming the protocol source.

Tests:

- A Codex `turn/completed` status of `completed` completes the run.
- A Codex cancellation/interruption status cancels the run and does not call
  the completion path.
- A Codex `failed` status fails the run with the provider message.
- An unknown turn status fails loudly and records a provider diagnostic.
- Existing cancellation tests should assert durable service state, not only that
  `StartTurn` returns nil.

Verification:

```sh
./scripts/go.sh test ./internal/chat
```

## Phase 2: Broadcast JSON-RPC Lifecycle

Make app-server process exit observable by every waiter and every pending call.

Implementation steps:

- Replace the single-consumer `done chan error` with a lifecycle object that:
  - stores the terminal error once
  - closes a `done` channel once
  - exposes `Err() error` after closure
- When the read loop exits, close the lifecycle once and fail all pending
  request channels with the same terminal error.
- Ensure `call` waits on either its response channel, context cancellation, or
  lifecycle closure without consuming the lifecycle signal.
- Ensure `waitForTurn` also observes lifecycle closure without racing with
  individual calls.
- On client close, make pending calls fail deterministically.
- Keep response ID validation strict.

Tests:

- If the app-server exits while a call is pending, the call returns an exit
  error and the turn wait loop also returns an exit error.
- Multiple concurrent calls observe the same terminal exit.
- Closing a client fails pending calls rather than leaving them blocked.
- Unknown or malformed JSON-RPC response IDs still fail loudly.

Verification:

```sh
./scripts/go.sh test ./internal/chat
```

## Phase 3: Provider Drift Diagnostics

Separate expected provider notices from unsupported provider protocol messages.

Implementation steps:

- Keep explicit handlers for known notice-like Codex messages, such as warnings
  and deprecation notices.
- Change unknown notification handling from completed run item creation to a
  provider diagnostic with enough context to debug:
  - method name
  - run ID
  - workspace ID
  - conversation ID
  - decoded JSON parameters when safe and bounded
- Decide one policy for unknown notifications:
  - fail the active turn if the notification could affect transcript or run
    state
  - record a provider diagnostic and force resync if the notification is
    demonstrably non-state-changing
- Keep unsupported server requests as hard failures. They should not be
  converted to ordinary user-facing run activity.
- Do not add catch-all notice rows for unknown methods.

Tests:

- Known warning/deprecation notifications create visible notice activity.
- Unknown notifications record diagnostics and do not appear as completed
  activity rows.
- Unknown state-changing notifications fail the run or trigger resync according
  to the selected policy.
- Unsupported server requests still fail loudly.

Verification:

```sh
./scripts/go.sh test ./internal/chat
pnpm -C desktop test
```

## Phase 4: Typed State Error Taxonomy

Introduce explicit error categories across app state, workspace metadata, chat
state, and HTTP responses.

Suggested categories:

- `InvalidRequestError`: caller supplied invalid input.
- `NotFoundError`: requested domain object does not exist.
- `PersistenceIOError`: filesystem or OS operation failed.
- `CorruptStateError`: durable state exists but is malformed or violates
  invariants.
- `ProviderError`: provider protocol or transport failed.

Implementation steps:

- Add small typed error wrappers in the owning packages instead of a global
  constants or error junk drawer.
- Wrap malformed JSON, unknown durable fields, unsupported schema versions, bad
  durable relationships, and invalid durable timestamps as corrupt state.
- Keep missing optional app state files as explicit empty initial state.
- Keep missing required records, such as a run's assistant message, as corrupt
  state when reached through durable state loading.
- Map corrupt state to HTTP 500 with a stable error code such as
  `corrupt_chat_state`, `corrupt_workspace_state`, or `corrupt_app_state`.
- Record a durable diagnostic when a corrupt state error is encountered through
  chat/runtime paths that have access to diagnostics.
- Preserve the original path and root cause in the error message.

Tests:

- Malformed chat JSON returns an internal/corrupt-state HTTP error, not 400.
- Malformed workspace metadata returns an internal/corrupt-state HTTP error.
- Invalid user requests still return 400.
- Missing app state still loads as empty state.
- A run referencing a missing assistant message fails as corrupt durable state.

Verification:

```sh
./scripts/go.sh test ./internal/appstate ./internal/workspace ./internal/chat ./internal/httpapi
```

If endpoint contracts change, regenerate:

```sh
./scripts/go.sh run ./cmd/generate-contracts
pnpm -C desktop test
```

## Phase 5: Resync Semantics For Untrusted Projections

Ensure every event-stream or provider condition that makes the renderer's local
projection unreliable has a clear resync path.

Implementation steps:

- Keep `chat.resync_required` as the backend-to-renderer resync event.
- Add provider diagnostics for protocol drift that include whether resync is
  required.
- When the main event stream sees malformed event payloads, report `resyncing`
  and reconnect with the last valid cursor.
- When provider drift occurs inside a run, publish a diagnostic and a run update
  if durable state changes.
- Keep stale projection state visible to users through existing backend/event
  stream status badges.

Tests:

- Malformed event payload reports `resyncing` and reloads the selected
  conversation.
- Provider drift diagnostics appear in the active workspace.
- Resync failure leaves a visible error rather than clearing state silently.

Verification:

```sh
pnpm -C desktop test
./scripts/go.sh test ./internal/chat ./internal/httpapi
```

## Phase 6: Transcript Data Model And Virtualization

Make the renderer transcript a scalable view over normalized state.

Implementation steps:

- Normalize chat store state:
  - messages by ID plus ordered message IDs
  - conversations by ID plus ordered conversation IDs
  - run items by run ID
  - run item output by run item ID
- Replace per-row filtering of all run items with indexed lookup by `runId`.
- Replace per-row filtering of all outputs with indexed lookup by `runItemId`.
- Add virtualization for the transcript using `react-virtuoso` by default.
- Preserve current chat behavior:
  - load older pages without dropping newer streamed updates
  - pinned-to-bottom behavior
  - scroll preservation after loading older messages
  - approval card visibility
  - run activity expansion and item-scoped output loading
- Keep DOM node count bounded for large histories.
- Avoid rendering hidden full transcripts as offscreen DOM.

Tests:

- Loading older pages preserves current latest messages.
- Streaming deltas update the normalized message and visible row.
- Expanding one run item loads and displays only that item's output.
- A large transcript fixture renders a bounded number of message rows.
- Scroll position is preserved after loading older messages.
- Pinned-to-bottom behavior still follows new streamed messages.

Performance verification:

- Add an automated large-history renderer test that asserts bounded DOM row
  count.
- Add component-level DOM tests for virtualization behavior if store-only tests
  cannot verify scroll anchoring or row mounting behavior.
- For substantial virtualizer changes, capture before/after performance notes in
  an append-only report under `docs/performance/`.
- Use Chrome DevTools profiling if automated checks reveal regressions or if
  the virtualizer behavior is unclear.

Verification:

```sh
pnpm -C desktop test
pnpm -C desktop build
```

## Phase 7: End-To-End Verification And Cleanup

Final cleanup should remove obsolete test assumptions and any notice-based
provider drift paths.

Checklist:

- No unsupported provider method is represented as normal completed activity.
- No provider status falls through to successful completion.
- No JSON-RPC waiter depends on consuming a single shared terminal value.
- Corrupt durable state has typed classification and HTTP 500 mapping.
- Renderer transcript rendering remains bounded under large histories.
- Generated TypeScript is regenerated only if Go-owned contracts changed.
- No generated output is manually edited.

Final verification for source changes:

```sh
./scripts/format.sh
./check_quality.sh --all
```

If dependency manifests, lockfiles, package manager configuration, Go module
configuration, or supply-chain tooling changed, also run:

```sh
./scripts/check_supply_chain.sh
```

## Suggested Implementation Order

1. Implement typed Codex turn outcomes.
2. Implement broadcast JSON-RPC lifecycle handling.
3. Convert unknown provider notifications to diagnostics or hard failures.
4. Add typed state error taxonomy and HTTP mappings.
5. Tighten resync semantics around untrusted projections.
6. Normalize transcript renderer state and add virtualization.
7. Run full quality checks and update performance documentation where relevant.

This order fixes correctness and stuck-run risks before performance work, and it
adds diagnostics before making previously silent provider drift fail more
strictly.
