# Codex Goal Operation Lifecycle Plan

## Goal

Make Setta's `/goal` command match Codex app-server goal-operation semantics.
A goal is not just a persisted thread field plus one normal turn. In Codex, an
active goal is a thread-scoped logical operation that can start multiple physical
turns until the goal becomes terminal or is cleared. Setta should represent that
operation as one chat run, route provider notifications through the operation,
and finish the run only when the logical goal operation is actually finished.

This plan is a detour before continuing work that depends on correct run and
provider lifecycle routing, especially background terminal routing.

## Non-Goals

- Do not redesign the goal editor or goal command UI beyond lifecycle-correct
  behavior.
- Do not add local-only goal semantics that diverge from Codex provider state.
- Do not infer goal completion from assistant text, item content, or keyword
  heuristics.
- Do not preserve old generated contracts, fake harness behavior, or storage
  shapes only to keep the current partial `/goal` implementation working.
- Do not add compatibility shims, old-field aliases, dual routing paths, or
  best-effort fallbacks for malformed provider goal notifications.

## Compatibility Policy

Treat this as a correction to an incomplete feature. Development data can be
recreated. If persisted local goal state disagrees with the provider during this
work, prefer provider truth and fail loudly when the disagreement cannot be
resolved explicitly.

No backward compatibility layer is required for the current simplified
goal-continuation path.

## Reference Behavior

Useful reference files:

- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/sdk/python/src/openai_codex/_message_router.py`
- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/sdk/python/src/openai_codex/_goal.py`
- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/sdk/python/src/openai_codex/client.py`
- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/sdk/python/tests/test_app_server_goal_operations.py`
- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/ext/goal/src/api.rs`
- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/ext/goal/src/runtime.rs`
- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/app-server/tests/suite/v2/thread_resume.rs`

Codex SDK behavior to mirror:

- The client reserves a private goal operation for a thread before starting the
  operation.
- A new goal operation requires an idle, persisted, non-ephemeral thread.
- Starting a new goal clears any existing provider goal before setting the new
  objective active.
- Goal routing is activated after the clear and before the set.
- The client waits for the runtime-generated first physical `turn/started` and
  uses that turn id as the logical turn id.
- Multiple physical goal turns are exposed as one logical stream.
- Intermediate physical `turn/completed` notifications are suppressed.
- The final logical `turn/completed` is emitted only when the provider goal is
  terminal or cleared.
- The final logical completion rewrites the final physical turn id and duration
  to the logical operation.
- `thread/goal/updated` and `thread/goal/cleared` are lifecycle inputs for the
  logical operation, not normal transcript noise.
- Cancelling the logical operation best-effort pauses the provider goal and
  interrupts the current or stale physical turn.
- A normal turn must not start on a thread while a goal operation owns that
  thread route.

Provider behavior to account for:

- `thread/goal/set` with an objective updates an existing provider goal if one
  exists. It preserves the existing goal id and accumulated usage.
- `thread/goal/clear` deletes the provider goal and applies runtime clear
  effects.
- When a goal is active and the thread becomes idle, the runtime can
  automatically start another physical turn with goal-continuation steering.

## Current Setta Gaps

Setta currently has a partial goal-continuation path:

- `BeginGoalContinuation` opens a session, starts or resumes a thread, owns the
  thread, calls the goal command RPC, and returns a continuation.
- `codexGoalContinuation.Wait` registers an active run and calls the normal
  `waitForTurn` path.
- `/goal <objective>` directly calls `thread/goal/set` with objective and active
  status.
- The fake Codex goal-continuation fixture emits one physical turn and one
  terminal goal update.

This misses several reference requirements:

- A new `/goal <objective>` does not clear the provider goal first, so raw
  provider semantics can edit and preserve old goal state instead of replacing
  it.
- The wait path returns on the first physical `turn/completed`, even if the
  provider goal remains active and the runtime starts a second physical goal
  turn.
- Goal notifications are not routed through a private thread-scoped logical
  operation.
- Physical turn ids are not rewritten to one logical goal turn id.
- Intermediate physical completions are not suppressed.
- Cancellation and cleanup do not pause the provider goal or interrupt the
  current physical turn.
- Tests do not exercise multi-turn goal continuations, provider clear-before-set
  behavior, persisted-thread requirements, or cancellation cleanup.

## Product Contract

- `/goal <objective>` replaces the current provider goal and starts one logical
  goal run.
- `/goal resume` resumes the existing provider goal and starts one logical goal
  run when the resumed status is active.
- The chat run created for `/goal` represents the whole logical goal operation,
  not just the first physical Codex turn.
- The run remains active while Codex automatically continues the goal through
  additional physical turns.
- The run completes only after the provider goal is terminal or cleared and the
  last physical goal turn has completed.
- Intermediate physical turn starts and completions do not create multiple Setta
  runs or visible duplicate lifecycle rows.
- Assistant text, reasoning, tool activity, approvals, background terminal
  events, and goal state updates still stream through production chat paths.
- The conversation's stored goal state follows provider `thread/goal/updated`
  and `thread/goal/cleared` notifications.
- User cancellation of the Setta run pauses the provider goal and interrupts the
  current provider turn when one is known.
- Starting a normal chat turn on a thread with an active logical goal operation
  is rejected or queued by Setta's existing run gating before it reaches Codex.

## Harness Design

Add an explicit Codex goal operation abstraction in `internal/chat`, separate
from normal `StartTurn` and separate from a raw command RPC.

Suggested shape:

```go
type codexGoalOperation struct {
    harness       *CodexHarness
    session       *codexapp.Session
    threadID      string
    logicalTurnID string
    currentTurnID string
    status        codexapp.ThreadGoalStatus
    started       bool
    completed     bool
    cleared       bool
    interrupted   bool
    finished      bool
}
```

The actual implementation can use a smaller or split shape, but it needs these
capabilities:

- Reserve one goal operation per thread before provider mutation.
- Reject a second goal operation for the same thread.
- Activate physical turn routing only after provider clear has completed.
- Buffer goal notifications that arrive before the Setta run sink exists.
- Bind the logical turn id to the first provider `turn/started`.
- Track the current physical turn id for cancellation and scoped routing.
- Suppress intermediate physical turn lifecycle events.
- Emit one logical start and one logical completion to the Setta run sink.
- Rewrite physical turn ids to the logical turn id before they reach generic
  run handling.
- Unregister the operation exactly once on terminal completion, clear, startup
  failure, cancellation, or session failure.

Do not make normal `waitForTurn` understand all goal semantics by adding special
cases throughout the normal turn path. The goal operation should be the owner of
goal-specific routing and coalescing, then call shared notification handlers only
after it has decided an event belongs to the logical stream.

## Start And Replace Semantics

For `/goal <objective>`:

1. Start or resume the Codex thread.
2. Own the thread on the session.
3. Read the thread and require idle, persisted, and non-ephemeral provider state.
4. Reserve a goal operation route for the thread.
5. Call `thread/goal/clear`.
6. Activate physical turn routing for the operation.
7. Call `thread/goal/set` with the new objective and status `active`.
8. Wait for the first runtime-generated `turn/started`.
9. Return the command result and continuation with a bound logical turn id.

If any step after reservation fails:

- Pause the provider goal when it may have been activated.
- Interrupt the current physical turn when known.
- Finish and unregister the operation.
- Close the session.
- Return a specific command error.

For `/goal resume`:

1. Require an existing provider goal.
2. Require an idle, persisted, non-ephemeral provider thread.
3. Reserve and activate a goal operation route.
4. Set provider goal status to `active`.
5. Wait for the first runtime-generated `turn/started`.
6. Stream until terminal or cleared using the same logical operation path.

For `/goal pause` and `/goal clear`:

- Continue to mutate provider goal state through RPCs.
- If a logical goal operation is active for the thread, route the resulting
  lifecycle notifications through that operation so the Setta run finishes
  coherently.
- Do not start a new continuation run for pause or clear.

## Logical Stream Rules

The goal operation receives provider notifications and decides what reaches the
normal Setta run sink:

- First physical `turn/started`: emit one logical `turn/started`, bind
  `logicalTurnID`, and link the thread to the Setta conversation.
- Later physical `turn/started`: update `currentTurnID`, but do not emit another
  logical start.
- Assistant deltas, reasoning, tool activity, approvals, and background terminal
  events from any physical goal turn: rewrite turn id to `logicalTurnID` before
  normal handling.
- `thread/goal/updated`: update local goal state through `sink.GoalUpdated`, but
  do not create transcript text by itself.
- `thread/goal/cleared`: clear local goal state through `sink.GoalUpdated(nil)`
  and mark the logical operation eligible to finish after the current physical
  turn completes.
- Non-final physical `turn/completed`: store the completion for accounting, but
  do not finish the Setta run.
- Final physical `turn/completed`: emit one logical completion when the provider
  goal is terminal, cleared, interrupted, or failed without a subsequent active
  continuation.
- Provider session close before final logical completion is a goal-operation
  failure, not a completed run.

Unknown goal status, missing thread id, missing turn id where required, or
out-of-thread goal notifications are provider drift and must fail loudly.

## Cancellation

Setta cancellation of a goal run should invoke a goal-operation cancel path, not
only close the session.

Required behavior:

- Mark the operation as cancellation requested.
- Best-effort call `thread/goal/set` with status `paused`.
- Interrupt the known current physical turn.
- If Codex reports a stale active turn id, retry interrupt with the active id
  reported by the provider when it can be parsed deterministically.
- Finish and unregister the operation.
- Close the session and release `turnMu`.

Do not swallow provider errors silently except for best-effort cleanup after the
run has already been cancelled. Errors that affect the user-visible command
result or run state must still be surfaced.

## Background Terminal Integration

The Phase 2 background terminal fix that mirrors `StartTurn` setup inside
`codexGoalContinuation.Wait` should be preserved conceptually, but it should
move under the new logical goal operation.

Rules:

- The logical goal operation registers the thread's workspace and conversation
  before any physical goal notification can be handled.
- Background-terminal lifecycle state remains keyed by provider item/process id,
  not by physical goal turn id.
- Cross-turn background notifications from earlier physical goal turns in the
  same logical goal operation route to the background terminal registry, not to
  normal turn rebind.
- Background terminal output or completion must not cause the logical goal run to
  finish.
- Goal operation routing must run before normal turn-id rebind, just like the
  Phase 2 cross-turn background notification interceptor.

## Service Integration

The service can keep using one Setta run with `MessageDeliveryGoal`, but the
continuation interface should become explicit about logical goal operations.

Suggested interface direction:

```go
type HarnessGoalOperation interface {
    Wait(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error)
    Cancel(ctx context.Context) error
    Close()
}
```

Implementation notes:

- `startGoalContinuationLocked` should keep creating one assistant message and
  one run for a `/goal` operation.
- The run should stay active across provider physical turn boundaries.
- `runHarnessGoalContinuation` should use operation-aware cancellation if the
  run context is cancelled.
- Goal command persistence should not claim local terminal status before the
  provider's goal lifecycle notification is processed.
- Command confirmation for replacing a local non-terminal goal remains useful,
  but provider replacement must still use clear-before-set after confirmation.

## Tests First

Add characterization tests before implementation changes where possible.

### Go Unit And Harness Tests

- `TestCodexHarnessGoalSetClearsBeforeSetAndWaitsForRuntimeTurn`
  - Fake provider has an existing goal.
  - `/goal new objective` must send `thread/goal/clear` before
    `thread/goal/set`.
  - The continuation must not return before the first `turn/started` is observed
    or buffered.

- `TestCodexHarnessGoalOperationCoalescesRuntimeContinuations`
  - Fake provider emits physical turn A, non-terminal goal update, completion A,
    physical turn B, terminal goal update, completion B.
  - Setta sink sees one logical start, content from both turns, one logical
    completion, and one run completion.

- `TestCodexHarnessGoalOperationDoesNotFinishOnIntermediateCompletion`
  - Assert that the run remains active after completion A when provider goal
    status is still active.

- `TestCodexHarnessGoalSetDoesNotPreserveOldProviderGoal`
  - Fake provider models Codex raw set behavior: set-with-objective updates old
    goal unless clear came first.
  - The test fails if Setta omits the clear.

- `TestCodexHarnessGoalOperationRequiresPersistedIdleThread`
  - Thread read response with busy status, ephemeral true, or missing path fails
    before provider mutation.

- `TestCodexHarnessGoalOperationCancelPausesAndInterrupts`
  - Cancelling an active goal run sends provider pause and interrupt for the
    current physical turn.

- `TestCodexHarnessGoalOperationRejectsConcurrentThreadTurn`
  - Starting a normal turn or second goal operation for the same thread while a
    goal operation owns it fails before issuing provider `turn/start`.

- `TestCodexHarnessGoalOperationRoutesBackgroundTerminalAcrossPhysicalTurns`
  - A background terminal started in physical turn A can emit output/completion
    during physical turn B without rebind drift or dropped registry updates.

### Service Tests

- `/goal <objective>` creates one Setta run and that run remains active across
  multiple physical provider turns.
- Final provider terminal goal state completes the Setta run.
- Provider clear during a goal operation clears local goal state and completes
  the Setta run after current physical completion.
- Cancelling the Setta goal run invokes harness goal cancellation.
- Replacement confirmation still gates user intent, but confirmed replacement
  clears provider state before setting the new objective.

### Deterministic E2E Tests

Extend the chat workflow deterministic fake provider with:

- Start `/goal objective`.
- Stream assistant output from physical turn A.
- Emit non-terminal goal update.
- Complete physical turn A.
- Automatically start physical turn B.
- Stream assistant output from physical turn B.
- Emit terminal goal update.
- Complete physical turn B.

Expected UI and store behavior:

- One user-visible goal run.
- One assistant message for the logical goal operation.
- Assistant content from both physical turns in order.
- One final completed run state.
- Goal status shown from provider notifications.
- No duplicate turn-completed rows.
- No active-run gap between physical turns.

Add an E2E cancellation variant when the deterministic harness can assert
provider RPCs:

- Start `/goal objective`.
- Cancel while physical turn B is active.
- Assert provider pause and interrupt were issued.
- Assert the UI run becomes cancelled or failed according to the existing
  service cancellation contract.

## Implementation Phases

### Phase 0: Reference Fixtures And Failing Tests

- Add fake Codex protocol modes for multi-turn goal operations, raw
  set-preserves-old-goal behavior, busy/ephemeral thread read responses, and
  cancellation.
- Add the Go tests listed above as failing characterization tests.
- Add deterministic E2E coverage for the multi-turn logical goal flow.
- Document any pre-existing flaky broad E2E steps separately from goal failures.

Exit criteria:

- Tests prove the current implementation completes after the first physical
  turn, omits clear-before-set, and lacks cancellation cleanup.

### Phase 1: Goal Operation Routing Skeleton

- Add `codexGoalOperation` state and one-operation-per-thread registration.
- Route `thread/goal/updated`, `thread/goal/cleared`, and goal physical turn
  notifications through the registered operation before normal turn routing.
- Buffer notifications until the service run sink is available.
- Unregister the operation on startup failure, final completion, cancellation,
  or session close.
- Keep normal non-goal turns on the existing path.

Exit criteria:

- Goal notifications no longer depend on ordinary turn rebind for routing.
- A second goal operation for the same thread fails loudly.
- Normal chat turns continue to pass existing focused tests.

### Phase 2: Correct Provider Start Semantics

- Add provider thread-read decoding for idle, persisted, non-ephemeral
  validation.
- Implement `/goal <objective>` as clear-before-set with route activation between
  the clear and set.
- Implement `/goal resume` as route activation plus set-status-active for an
  existing goal.
- Wait for the runtime-generated first physical turn and bind the logical turn
  id before handing the operation to the service run.
- Add cleanup on startup errors.

Exit criteria:

- Clear-before-set tests pass.
- Persisted/idle requirement tests pass.
- Provider start timeout fails specifically and cleans up operation state.

### Phase 3: Logical Stream Coalescing

- Rewrite physical goal turn ids to the logical turn id before generic run
  handling.
- Emit one logical start and one logical completion.
- Suppress intermediate physical starts/completions.
- Keep the Setta run active across provider runtime continuations.
- Preserve ordered assistant/tool/reasoning streaming from all physical turns.

Exit criteria:

- Multi-turn goal harness tests pass.
- Deterministic E2E shows one completed goal run containing output from both
  physical turns.

### Phase 4: Cancellation, Pause, Clear, And Concurrency

- Add operation-aware cancellation from service run cancellation.
- Best-effort pause provider goal and interrupt the current physical turn.
- Route pause/clear lifecycle notifications through an active operation.
- Reject or queue normal turns while a logical goal operation owns the thread.
- Add stale-turn interrupt retry only when provider error metadata exposes the
  active turn id deterministically.

Exit criteria:

- Cancellation tests pass.
- Clear and pause during an active goal operation finish the run coherently.
- No normal turn can bind to a goal-owned thread route.

### Phase 5: Integration With Background Terminal Phase 2+

- Move the temporary goal continuation background-terminal setup under the goal
  operation lifecycle.
- Ensure background-terminal routing happens before normal rebind inside goal
  operation event handling.
- Extend background terminal deterministic cases to include a background terminal
  started during a multi-physical-turn goal operation.

Exit criteria:

- Existing background terminal Phase 2 tests still pass.
- New goal plus background-terminal tests pass without special cases in normal
  `waitForTurn`.

### Phase 6: Cleanup And Contract Regeneration

- Remove the old simplified `codexGoalContinuation` path or collapse it into the
  new operation type.
- Remove fake harness shortcuts that only model one physical goal turn.
- Regenerate TypeScript contracts if owner-defined Go contracts changed.
- Update command and lifecycle comments to describe logical goal operations.

Exit criteria:

- No remaining raw `/goal` start path directly models start as set-plus-normal
  wait.
- Generated outputs are current if contracts changed.

## Verification

Narrow checks during implementation:

```text
./scripts/go.sh test ./internal/chat -run 'Goal|goal|CodexHarness'
./scripts/go.sh test ./internal/chat -run 'BackgroundTerminal|Goal'
```

Full chat package after the implementation stabilizes:

```text
./scripts/go.sh test ./internal/chat
```

Required deterministic E2E:

- Multi-turn `/goal` logical operation.
- `/goal` cancellation.
- `/goal` with background terminal lifecycle when Phase 5 lands.

Required live-provider E2E:

- Run live Codex E2E when local Codex CLI is signed in with ChatGPT auth.
- Do not use `OPENAI_API_KEY` for live-provider proof.
- If ChatGPT auth is unavailable, report the live-provider skip explicitly.

Final gate before commit:

```text
./scripts/format.sh
./check_quality.sh --git-changes
```

Use `./check_quality.sh --staged` only when validating exactly the staged commit.

## Open Risks

- Provider notification order around `thread/goal/updated`, physical
  `turn/completed`, and automatic next `turn/started` must be characterized with
  fake and live Codex runs. The plan should not assume an order that Codex does
  not guarantee.
- Setta's current service creates the local goal run after the command RPC
  returns. The operation may need buffering to avoid losing notifications during
  that gap.
- Current local command result persistence may need adjustment so provider goal
  notifications remain the source of truth for terminal status.
- Live provider cancellation may report stale active turn ids. Retry logic must
  parse only deterministic provider metadata and otherwise stop after the direct
  interrupt attempt.
- Background terminal routing and goal routing both intercept cross-turn
  notifications. The final architecture must define ordering explicitly so one
  route cannot hide events the other owns.
