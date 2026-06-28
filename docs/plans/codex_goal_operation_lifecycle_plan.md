# Codex Goal Operation Lifecycle Plan

## Goal

Make Setta's `/goal` command match Codex app-server goal-operation semantics.
A goal is not just a persisted thread field plus one normal turn. In Codex, an
active goal is a thread-scoped logical operation that can start multiple physical
turns until the goal becomes terminal or is cleared. Setta should represent that
operation as one chat run, route provider notifications through the operation,
and finish the run only when the logical goal operation is actually finished.

This plan is a detour before continuing work that depends on shared cross-turn
provider notification routing, especially the parts of background terminal work
that touch the same pre-rebind routing chokepoint. Background terminal phases
that only add projections, HTTP endpoints, or monitor UI can proceed in parallel
if they do not change cross-turn provider routing.

## Non-Goals

- Do not redesign the goal editor or goal command UI beyond lifecycle-correct
  behavior.
- Do not add local-only goal semantics that diverge from Codex provider state.
- Do not infer goal completion from assistant text, item content, or keyword
  heuristics.
- Do not preserve old generated contracts, fake harness behavior, or storage
  shapes only to keep the current partial `/goal` implementation working.
- Do not add compatibility shims, legacy support paths, migrations,
  transitional adapters, dual-read/write paths, old-field aliases, dual routing
  paths, or best-effort fallbacks for malformed provider goal notifications.

## Compatibility Policy

Treat this as a correction to an incomplete feature. Development data can be
recreated. If persisted local goal state disagrees with the provider during this
work, prefer provider truth and fail loudly when the disagreement cannot be
resolved explicitly.

No backward compatibility layer is allowed for the current simplified
goal-continuation path.

Forbidden implementation work:

- no legacy support paths;
- no migrations for old local goal operation data;
- no compatibility shims;
- no transitional adapters;
- no dual-read or dual-write behavior;
- no old-field aliases;
- no fallback parsing of prior provider or Setta shapes;
- no "try old path, then new path" routing;
- no preserving old generated contracts or renderer fields while the new route
  is being introduced.

When old, partial, malformed, or mismatched goal-operation state is encountered,
the implementation must fail loudly with a specific error or recreate
development data through an explicit developer action outside the application
runtime. The application runtime must not silently repair, migrate, or interpret
legacy goal-operation state.

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

## Foundational Decisions Before Phase 1

The following decisions are not cleanup work. They must be pinned down before
the routing skeleton lands, because they shape the first implementation phase.

### Router Composition

Goal routing and background-terminal routing share the same dangerous
chokepoint: provider notifications must be classified before normal turn-id
rebind. A notification from physical goal turn A can arrive while physical goal
turn B is active, and it can be both:

- part of the logical goal operation, because it belongs to the goal-owned
  thread; and
- part of background-terminal lifecycle, because it is output or completion from
  a long-lived unified-exec process.

The goal operation is the outer thread-route owner. It runs before normal rebind
and before the non-goal cross-turn background-terminal interceptor for any
notification on a goal-owned thread. It then delegates by provider type:

1. Background-terminal lifecycle events are handed to the background-terminal
   registry with original provider item ids, process ids, and physical turn ids.
   They are not rewritten to the logical goal turn id and they do not determine
   logical goal completion.
2. Goal lifecycle events such as `thread/goal/updated` and
   `thread/goal/cleared` update the operation and the Setta goal projection.
   They do not create transcript text by themselves.
3. Ordinary run-stream events such as assistant deltas, reasoning, approvals,
   and run-scoped tool activity are rewritten from the physical turn id to the
   logical goal turn id before shared run handling sees them.
4. If no goal operation owns the thread, the existing background-terminal
   cross-turn interceptor may handle late unified-exec notifications before
   normal rebind.
5. Only after those routes decline the event may `applyNotificationRebindForWait`
   consider rebinding the active turn id.

This order is required for the concrete case where physical goal turn A starts a
background terminal, physical goal turn B becomes active, and the terminal from
turn A emits output. The output must update the background-terminal registry
without rebinding turn B and without being rewritten into an ordinary logical
goal transcript event.

Connection-scoped background-terminal handlers must also be goal-route-aware.
Today `turnActiveByThread` is a per-physical-turn flag: it is set when a turn
starts and cleared by the connection-scoped `turn/completed` handler. A logical
goal operation spans multiple physical turns and idle gaps, so that flag cannot
be the authority for goal-owned threads. Do not keep `turnActiveByThread` true
for the whole logical operation. Instead:

- if a thread has an active goal route owner, connection-scoped
  background-terminal handlers must defer to the goal operation route and must
  not independently route the same event through the standalone late-BT path;
- the goal operation tracks `currentTurnID` for physical-turn coalescing and
  cancellation, while `turnActiveByThread` remains a normal-turn/background
  terminal helper outside goal-owned threads;
- background-terminal classification must be shared by the goal-operation router
  and the standalone cross-turn background-terminal router, so the two paths
  cannot drift on what counts as a background-terminal lifecycle event.

### Route Ownership And Locking

Do not hold the harness-global `turnMu` for the full lifetime of a logical goal
operation. The current simplified `codexGoalContinuation` path inherits that
pattern, but a real goal operation can span many physical turns and idle gaps. A
long-running goal in one conversation must not block unrelated conversations
from starting Codex turns.

Use a per-thread route-ownership model instead:

- A goal operation owns one Codex thread route in a dedicated route registry.
- Normal `StartTurn` checks that registry before issuing provider `turn/start`
  for a thread.
- A second goal operation for the same thread fails loudly before provider
  mutation.
- The global turn lock may still protect short critical sections that already
  require global serialization, but it must not be held while waiting for the
  whole logical goal to finish.
- Goal operation cleanup releases the per-thread route owner exactly once.

### Live Provider Order Characterization

The coalescer cannot assume a notification order until the provider is
characterized. Phase 0 must capture live Codex ordering, when ChatGPT-auth live
Codex is available, for at least:

- new goal start: clear, set, first `turn/started`;
- active continuation: non-terminal goal update, physical `turn/completed`, next
  physical `turn/started`;
- terminal completion: terminal goal update relative to final
  `turn/completed`;
- provider clear while a goal turn is active;
- cancellation: pause, interrupt, interrupted completion, and any stale active
  turn error shape.

If live auth is unavailable, Phase 0 must say so explicitly and the fake
fixtures must cover each plausible order that affects finality, especially
terminal status before completion and terminal status after completion. Do not
ship an order-specific coalescer that has only been proven against one fake
ordering.

### Pre-Sink Buffering

The provider can emit the first `turn/started` before the service has created
the Setta run sink. The operation therefore needs an ordered pre-sink buffer,
not an implicit assumption that the sink exists.

Buffer rules:

- Buffer only notifications for the reserved goal-owned thread.
- Preserve provider receipt order exactly.
- Replay the buffer synchronously into the sink before consuming later live
  events through the same operation.
- Use an explicit hard cap, initially 1024 notifications or 4 MiB of serialized
  payload, whichever is reached first.
- On overflow, finish the operation as failed, unregister the route, close the
  session, and surface a specific error. Do not drop old events or continue with
  a partial stream.
- Once replay starts, do not process live events concurrently with buffered
  events.

### State Machine And Exactly-Once Finish

The implementation should use an explicit state enum plus an idempotent finish
chokepoint, not a collection of independent lifecycle booleans.

Suggested state direction:

```go
type codexGoalOperationState string

const (
    codexGoalOperationReserved      codexGoalOperationState = "reserved"
    codexGoalOperationRouteActive   codexGoalOperationState = "route_active"
    codexGoalOperationSinkAttached  codexGoalOperationState = "sink_attached"
    codexGoalOperationStreaming     codexGoalOperationState = "streaming"
    codexGoalOperationFinishing     codexGoalOperationState = "finishing"
    codexGoalOperationFinished      codexGoalOperationState = "finished"
)
```

All terminal paths must call one method, such as `finish(reason)`, guarded by a
single `finishOnce` or equivalent mutex-protected transition. Required triggers:

- terminal provider goal status;
- provider goal cleared;
- startup failure;
- user cancellation;
- provider session failure;
- provider interrupted or failed completion.

Add a test for every finish trigger and assert one unregister, one session
close, one run completion or failure, and no leaked route owner.

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
    state         codexGoalOperationState
    finishOnce    sync.Once
}
```

The actual implementation can use a smaller or split shape, but it needs these
capabilities:

- Reserve one goal operation per thread before provider mutation.
- Reject a second goal operation for the same thread.
- Activate physical turn routing only after provider clear has completed.
- Buffer goal notifications that arrive before the Setta run sink exists using
  the explicit ordered buffer rules above.
- Bind the logical turn id to the first provider `turn/started`.
- Track the current physical turn id for cancellation and scoped routing.
- Suppress intermediate physical turn lifecycle events.
- Emit one logical start and one logical completion to the Setta run sink.
- Rewrite physical turn ids to the logical turn id before they reach generic
  run handling, except for background-terminal lifecycle events delegated to the
  background-terminal registry.
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
- Assistant deltas, reasoning, approvals, and run-scoped tool activity from any
  physical goal turn: rewrite turn id to `logicalTurnID` before normal handling.
- Background-terminal lifecycle events from any physical goal turn: delegate to
  the background-terminal registry with original provider identifiers and do not
  rewrite to `logicalTurnID`.
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
- Finality must handle both live-observed orders where terminal goal status
  arrives before physical completion and where physical completion arrives before
  terminal goal status.
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
- Close the session and release per-thread route ownership. Do not depend on
  holding the harness-global `turnMu` across the operation.

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
- Goal operation routing owns this composition: it classifies background-terminal
  events first, delegates them to the registry without logical turn-id rewrite,
  and only coalesces ordinary run-stream events.
- Connection-scoped background-terminal handlers must check for a goal route
  owner before consulting `turnActiveByThread` for late-routing decisions. For a
  goal-owned thread, they defer to the goal operation so the same provider event
  cannot reach the registry through both the goal path and the standalone
  late-BT path.
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
- The service should not rely on the harness-global turn lock for logical goal
  lifetime exclusion. It should rely on existing run gating plus the harness
  per-thread route owner.

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

- `TestCodexHarnessGoalOperationHandlesTerminalStatusBeforeCompletion`
  - Fake provider emits terminal goal update before the final physical
    `turn/completed`.
  - Setta finishes only after the final physical completion.

- `TestCodexHarnessGoalOperationHandlesTerminalStatusAfterCompletion`
  - Fake provider emits final physical `turn/completed` before the terminal goal
    update.
  - Setta waits for the terminal goal update and then emits one logical
    completion.

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

- `TestCodexHarnessGoalOperationDoesNotHoldGlobalTurnMuAcrossIdleGap`
  - A goal operation completes physical turn A and waits for physical turn B.
  - A normal turn for a different thread can start while the goal operation is
    between physical turns.

- `TestCodexHarnessGoalOperationBuffersPreSinkEventsInOrder`
  - Fake provider emits `turn/started` and an assistant delta before the service
    run sink attaches.
  - Setta replays the buffered events before later live events, preserving order.

- `TestCodexHarnessGoalOperationFailsOnPreSinkBufferOverflow`
  - Fake provider exceeds the explicit pre-sink buffer cap.
  - Setta fails the operation specifically and does not drop or partially replay
    events.

- `TestCodexHarnessGoalOperationFinishExactlyOnce`
  - Table-drive terminal status, clear, startup failure, cancellation, session
    failure, interrupted completion, and failed completion.
  - Each trigger causes exactly one unregister, one session close, and one run
    terminal transition.

- `TestCodexHarnessGoalOperationRoutesBackgroundTerminalAcrossPhysicalTurns`
  - A background terminal started in physical turn A can emit output/completion
    during physical turn B without rebind drift or dropped registry updates.

- `TestCodexHarnessGoalOperationRoutesBackgroundTerminalDuringIdleGap`
  - A background terminal started in physical turn A emits output after physical
    turn A completes and before physical turn B starts.
  - Connection-scoped background-terminal handlers detect the goal route owner
    and do not route the event independently of the goal operation.

- `TestCodexHarnessGoalOperationRoutesBackgroundTerminalDuringPhysicalTurnB`
  - A background terminal started in physical turn A emits output while physical
    turn B is active.
  - The event reaches the registry exactly once through the goal-owned route,
    with no normal rebind and no duplicate late-BT routing.

- `TestCodexHarnessGoalOperationDelegatesBackgroundTerminalBeforeLogicalRewrite`
  - A unified-exec output notification from physical turn A arrives while
    physical turn B is active.
  - The goal operation delegates it to the background-terminal registry with the
    original provider ids and does not pass a rewritten logical turn event to the
    run sink.

- `TestCodexHarnessBackgroundTerminalClassificationSharedByGoalAndStandaloneRouters`
  - The goal-operation router and standalone cross-turn background-terminal
    router use the same typed predicate for startup, output, interaction, and
    completion classification.
  - Adding a new background-terminal source or known item id path cannot update
    one router without the other.

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

### Live Provider Characterization

Before the fake fixture order is treated as authoritative, run a focused live
Codex characterization when local Codex is signed in with ChatGPT auth:

- Capture ordered notifications for new goal start, active continuation,
  terminal completion, provider clear, and cancellation.
- Record whether terminal `thread/goal/updated` arrives before or after the
  final physical `turn/completed`.
- Record whether non-terminal active updates arrive before or after the physical
  completion that triggers the next runtime continuation.
- Record any stale-active-turn error shape used by interrupt retry.

If live auth is unavailable, document the skip and keep fake coverage for both
orders that affect finality. Do not remove the order-agnostic tests just because
one local live run used a particular order.

## Implementation Phases

### Phase 0: Reference Characterization And Failing Tests

- Run the live provider characterization above when ChatGPT-auth live Codex is
  available. If unavailable, document the skip and keep fake fixtures
  order-agnostic.
- Add fake Codex protocol modes for multi-turn goal operations, raw
  set-preserves-old-goal behavior, busy/ephemeral thread read responses, and
  cancellation.
- Add fake Codex modes for terminal status before completion, terminal status
  after completion, non-terminal active update before completion, and
  non-terminal active update after completion.
- Add the Go tests listed above as failing characterization tests.
- Add deterministic E2E coverage for the multi-turn logical goal flow.
- Add focused tests for router composition, pre-sink buffering, exactly-once
  finish, and avoiding a harness-global `turnMu` hold across goal idle gaps.
- Document any pre-existing flaky broad E2E steps separately from goal failures.

Exit criteria:

- Tests prove the current implementation completes after the first physical
  turn, omits clear-before-set, and lacks cancellation cleanup.
- Tests also prove the current path has no designed answer for router
  composition, pre-sink buffering, exactly-once finish, and global-lock
  monopolization.
- The fake provider order used by later phases is either validated by live Codex
  or deliberately covers all plausible finality-affecting orders.

### Phase 1: Goal Operation Routing Skeleton

- Add `codexGoalOperation` state and one-operation-per-thread registration.
- Add the per-thread route owner registry. Do not hold harness-global `turnMu`
  across the logical operation lifetime.
- Route goal-owned thread notifications through the registered operation before
  normal turn routing and before normal turn-id rebind.
- Implement the router composition contract: background-terminal lifecycle
  events are delegated to the background-terminal registry without logical
  turn-id rewrite; ordinary run-stream events remain owned by the goal operation.
- Make connection-scoped background-terminal handlers goal-route-aware: when a
  thread has a goal route owner, they must defer to that owner instead of using
  `turnActiveByThread` to independently route a late background-terminal event.
- Keep `turnActiveByThread` scoped to physical turns outside goal-owned routing;
  do not hold it true for the whole logical goal operation.
- Factor background-terminal event classification into a shared typed helper
  used by both the goal-operation router and the standalone cross-turn
  background-terminal router.
- Implement the explicit ordered pre-sink buffer and overflow failure.
- Implement the explicit state enum and exactly-once finish chokepoint.
- Unregister the operation through the finish chokepoint on startup failure,
  final completion, cancellation, or session close.
- Keep normal non-goal turns on the existing path.

Exit criteria:

- Goal notifications no longer depend on ordinary turn rebind for routing.
- A second goal operation for the same thread fails loudly.
- A different thread can start a normal turn while a goal operation is idle
  between physical turns.
- Background-terminal events on a goal-owned thread route exactly once through
  the goal operation during both the idle gap between physical goal turns and
  physical turn B.
- Goal-owned thread background-terminal events do not use the standalone late-BT
  route while the goal route owner exists.
- Shared background-terminal classification tests pass for goal-owned and
  standalone routing paths.
- Pre-sink replay and overflow tests pass.
- Finish trigger tests prove exactly one unregister and no leaked route owner.
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
  handling, excluding background-terminal lifecycle events delegated to the
  registry.
- Emit one logical start and one logical completion.
- Suppress intermediate physical starts/completions.
- Keep the Setta run active across provider runtime continuations.
- Preserve ordered assistant/tool/reasoning streaming from all physical turns.
- Handle terminal goal status before physical completion and terminal goal
  status after physical completion.
- Handle non-terminal active update before physical completion and non-terminal
  active update after physical completion.

Exit criteria:

- Multi-turn goal harness tests pass.
- Provider-order variant tests pass.
- Deterministic E2E shows one completed goal run containing output from both
  physical turns.

### Phase 4: Cancellation, Pause, Clear, And Concurrency

- Add operation-aware cancellation from service run cancellation.
- Best-effort pause provider goal and interrupt the current physical turn.
- Route pause/clear lifecycle notifications through an active operation.
- Reject or queue normal turns for the same thread while a logical goal
  operation owns that thread route, without blocking unrelated threads.
- Add stale-turn interrupt retry only when provider error metadata exposes the
  active turn id deterministically.

Exit criteria:

- Cancellation tests pass.
- Clear and pause during an active goal operation finish the run coherently.
- No normal turn can bind to a goal-owned thread route.

### Phase 5: Background Terminal Regression Expansion

- Move the temporary goal continuation background-terminal setup under the goal
  operation lifecycle.
- Keep the Phase 1 router composition contract: the goal operation classifies
  background-terminal events before logical turn-id rewrite and delegates them
  to the registry.
- Extend background terminal deterministic cases to include a background terminal
  started during a multi-physical-turn goal operation, with output in both the
  idle gap between physical turns and while physical turn B is active.

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

Required live-provider characterization before Phase 1, when ChatGPT auth is
available:

- Goal start event order.
- Active continuation event order.
- Terminal completion event order.
- Clear and cancellation event order.
- Stale active turn interrupt error shape.

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

- If live Codex auth is unavailable during Phase 0, fake fixtures must remain
  order-agnostic and later live-provider runs can still expose provider ordering
  not seen locally.
- Current local command result persistence may need adjustment so provider goal
  notifications remain the source of truth for terminal status.
- Live provider cancellation may report stale active turn ids. Retry logic must
  parse only deterministic provider metadata and otherwise stop after the direct
  interrupt attempt.
- The pre-sink buffer cap may need tuning after live characterization. Overflow
  must remain a loud operation failure, not a silent truncation.
- Background terminal routing and goal routing both intercept cross-turn
  notifications. The plan now defines ownership order, but implementation still
  needs focused tests proving no route hides events the other owns.
