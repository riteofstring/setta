# Chat Run Liveness And Reconciliation Plan

- **Date:** July 1, 2026
- **Status:** Draft v7. Phases 0-5 completed; Phase 6 production E2E is
  in progress. The deterministic stale-liveness and restart-recovery
  production Electron slices are covered; remaining Phase 6 shutdown-drain and
  live-provider coverage is still outstanding. The reconciliation decisions
  below are grounded in the trigger recording, current code paths, and the live
  app-server findings in Appendix A.
- **Trigger recording:** `.recordings/20260701T215826Z`
- **Scope:** Chat runs driven by Codex app-server through the production
  Electron/main/preload/renderer/HTTP/store paths.

## Goal

Make Setta represent active Codex chat work with explicit, reconciled runtime
state instead of treating an unterminated run as proof that Codex is still
working.

The backend should own durable run state, a run liveness projection, and the
reconciliation that keeps them honest. The renderer should display "Working"
only when those states justify it. After laptop sleep, network loss,
event-stream disconnects, Codex app-server restarts, or backend shutdown,
Setta should converge to one honest state without presenting a normal Working
indicator for work it cannot observe or control.

## Non-Goals

- Do not infer liveness from assistant text, terminal output, timestamps in
  prose, keywords, or UI-visible labels.
- Do not add timers or polling that guess run death. Liveness transitions come
  from explicit triggers, provider protocol facts, or user action.
- Do not make the renderer guess whether a provider run is alive.
- Do not hide unknown provider state by silently marking runs complete or
  failed.
- Do not build a durable event outbox or cross-restart event replay. The
  existing cursor + ring buffer + `chat.resync_required` + snapshot-resync
  machinery stays the delivery model (see "What Already Exists"). The delivery
  bug is an ordering bug, not a missing-outbox bug.
- Do not add compatibility shims, legacy support paths, old-field aliases,
  migrations, dual-read/write paths, or best-effort old-data interpretation.
- Do not treat skipped live-provider tests as proof of Codex integration.

## Compatibility Policy

No backward compatibility, legacy support, migrations, or transitional code —
anywhere in this work.

- This is a correction to chat run lifecycle semantics. Development app data
  can be recreated; do not write migrations for it. If existing local state
  does not fit the new model, startup recovery fails loudly with a specific
  diagnostic or marks the affected run interrupted by an explicit recovery
  rule — it does not translate old shapes.
- No runtime compatibility layers, old-field aliases, dual-read/write paths,
  or best-effort old-data interpretation.
- No transitional bridging between phases: when a phase changes semantics,
  every affected surface flips in that phase. Additive steps (exposing
  liveness in snapshots before the renderer consumes it) are fine; keeping a
  replaced path alive is not.
- Delete replaced state shapes and code paths in the same change that
  replaces them.

## Observed Failure (verified against the recording)

- A chat message created `run_04c3df0eb7fe26b7d786982e36864353` at
  `2026-07-01T22:22:05Z`.
- Chat deltas streamed until `22:22:35.678Z`; the last forwarded chat event
  is `chat.assistant_text_delta` at sequence 883. No terminal
  `chat.run.updated` followed.
- The renderer layout snapshots still reported `activeRunStatus: "running"` at
  `23:50:01` — 88 minutes later — with the Stop control enabled (screenshots
  `0043`, `0044`, `0052`).
- The backend event stream connected once at `21:58:39` and never
  disconnected, reconnected, or resynced across the whole window, including
  laptop sleep. Loopback SSE survives sleep; stream-reconnect hooks alone can
  never catch this failure.
- Codex rate-limit/account notifications flowed again around `23:49`, so the
  app-server process and its stdio pipe were healthy after wake. The turn
  itself produced nothing and never completed.
- During shutdown, Setta persisted terminal transcript state, then recorded
  `fail_turn_transition_failed: event hub is closed`; the canonical run stayed
  `status: "running"` and the assistant message stayed `streaming` until the
  next startup recovery.

## Root Causes (verified in code)

Two independent defects, plus one structural gap:

1. **A zombie provider turn is invisible.** Turn completion is detected only
   via the `turn/completed` notification
   (`internal/chat/codex_harness_notification_handlers.go:636`). `waitForTurn`
   (`internal/chat/codex_harness.go:194`) selects only on context cancellation
   and session events — if the app-server never emits turn completion (e.g.
   its upstream connection died during sleep), the turn goroutine parks
   forever. Nothing re-checks: there is no wake/focus/online handling anywhere
   in the app, snapshot loads derive the active run purely from durable
   `RunStatusRunning` (`internal/chat/service_state.go:52`), and the renderer
   clears `activeRun` only on a terminal `chat.run.updated`
   (`desktop/src/renderer/src/stores/chat-events.ts:515`). The stale view is
   self-reinforcing.
2. **A hub-publish failure aborts the canonical terminal write.** `failTurn`
   (`internal/chat/service.go:703`) persists terminal transcript blocks, then
   publishes `transcript_blocks.replaced`; if the hub is closed the publish
   error causes an early return *before* `store.FailTurn` runs
   (`service.go:731-734`). `completeTurn` and `cancelRunningTurnLocked` share
   the ordering. Shutdown makes this deterministic: `Server.Shutdown` closes
   the event hub before in-flight turn goroutines drain
   (`internal/runtime/server.go:453-461`), and the chat service has no
   drain/shutdown of its own.
3. **Stop is not honest.** Cancel requires the in-memory attachment
   (`internal/chat/service_cancel.go:25,57`), but the renderer enables Stop
   from durable status alone
   (`desktop/src/renderer/src/components/chat-composer-controls.tsx:549`), and
   the sidebar spinner uses the same durable-only projection
   (`workspace-sidebar-conversation-row.tsx:34`).

## What Already Exists (do not rebuild)

- **Event cursor and resync machinery.** Events carry
  `<streamId>:<sequence>` ids; the hub retains a 512-event in-memory ring and
  emits `chat.resync_required` on overflow or stream-id mismatch
  (`internal/chat/events.go:43,698-728`). The SSE handler honors
  `Last-Event-ID` (`internal/httpapi/event_stream.go:57`). The Electron main
  process reconnects with backoff and cursor resume
  (`desktop/src/main/backend-event-stream.ts:192-204`), and the renderer does
  duplicate/gap detection plus background snapshot resync
  (`desktop/src/renderer/src/stores/chat-store.ts:519-533`,
  `chat-store-resync.ts`). Backend restart rotates the stream id, which forces
  resync. This is a sufficient delivery model for a local single-user app.
- **Startup recovery.** `recoverInterruptedRuns`
  (`internal/chat/service_recovery.go`) fails every persisted `running` run at
  boot, and `finalizeInterruptedTranscriptBlocks`
  (`internal/chat/transcript_ingest.go:611`) reconciles exactly the
  partial-terminal mismatch from root cause 2. It runs before the HTTP server
  serves snapshots. It is startup-only.
- **The reconciliation primitive is already wired.** `thread/read` decodes
  `Thread.Status` (`idle`/`active`/`notLoaded`/`systemError`) and, with
  `includeTurns: true`, per-turn `Status`
  (`inProgress`/`completed`/`failed`/`interrupted`) plus optional error
  (`internal/codexapp/protocol_gen.go:3809,5754,6082`). The goal preflight
  already calls it (`internal/chat/codex_commands.go:701-738`), just never for
  turn liveness. Richer queries (`thread/loaded/list`, `thread/turns/list`)
  exist in the vendored protocol but are not in
  `internal/codexapp/protocolschema/supported_protocol.json`. Phase 0 probed
  them raw: they add no zombie-vs-healthy signal, so they stay unwired (see
  Appendix A).
- **A stale-interrupt precedent — currently inert.** Goal cancellation parses
  typed `error.data.activeTurnId` from a failed `turn/interrupt` and adopts
  the provider's actual active turn
  (`internal/chat/codex_goal_operation_cancel.go:61-135`). Phase 0 found the
  current app-server omits the `data` field (the id appears only in message
  text), so the adoption branch never fires today and stale interrupts
  surface as plain errors. Keep the typed parse; never parse the text.
- **Process-death detection.** App-server exit already fails the active turn
  via lifecycle events (`internal/codexapp/manager.go:333`,
  `codex_harness.go:326`). The uncovered case is only the live-process,
  dead-turn zombie.

## Product Principle

Run status is not provider liveness.

Setta must distinguish:

- **Durable run state:** persisted chat truth such as `queued`, `running`,
  `completed`, `failed`, and `cancelled`.
- **Run liveness:** whether Setta is attached to the provider turn that owns
  the running work, and whether that attachment has been verified since the
  last disruption.
- **Renderer presentation state:** the UI label and controls derived from the
  backend-owned states.

"Working" means the durable run is running, the attachment is live, and fresh
provider evidence supports it. It must not mean "no one has told us the run
ended yet."

## State Model

Collapse liveness to four states. The v1 draft's six states over-specified:
`reconnecting`/`reconciling` render identically, and `detached` vs
`unavailable` differ only in retry semantics, which belong in a typed reason.

```go
type RunLivenessStatus string

const (
    // Turn goroutine attached, provider evidence fresh since last trigger.
    RunLivenessAttached    RunLivenessStatus = "attached"
    // A trigger fired; provider truth is being (re)established, or the
    // provider claims active but no fresh turn event has arrived since.
    RunLivenessReconciling RunLivenessStatus = "reconciling"
    // Reconciliation concluded Setta can no longer observe the provider
    // turn. Local control of the Setta run remains (see Cancellable).
    RunLivenessLost        RunLivenessStatus = "lost"
    // Durable run state is terminal.
    RunLivenessTerminal    RunLivenessStatus = "terminal"
)

type RunLivenessReason string // typed; e.g. wake_recheck, stream_resync,
                              // provider_unavailable, turn_not_found,
                              // provider_restarted, user_retry

type RunLiveness struct {
    WorkspaceID         string            `json:"workspaceId"`
    ConversationID      string            `json:"conversationId"`
    RunID               string            `json:"runId"`
    Harness             HarnessKind       `json:"harness"`
    Status              RunLivenessStatus `json:"status"`
    Reason              RunLivenessReason `json:"reason"`
    Retryable           bool              `json:"retryable"`
    Cancellable         bool              `json:"cancellable"`
    ProviderThreadID    string            `json:"providerThreadId"`
    ProviderTurnID      string            `json:"providerTurnId"`
    LastProviderEventAt string            `json:"lastProviderEventAt"`
    LastReconciledAt    string            `json:"lastReconciledAt"`
    Error               string            `json:"error"`
}
```

Decisions:

- **Liveness is a runtime projection, not a persisted record.** Attachment is
  process-local by nature; a persisted liveness row is stale by definition
  after restart, and startup recovery already terminalizes every persisted
  running run before snapshots are served. Maintain the projection in the chat
  service beside the `active` map, expose it in snapshots, publish changes as
  a typed chat event.
- `LastProviderEventAt` is informational (display/diagnostics only). It must
  never drive a state transition — no timer may move a run out of `attached`.
- `Cancellable` is backend truth: true when the run is attached to this
  process (context cancel plus a deterministic local terminal transition
  always exists). Stop has two distinct semantics, and only the backend knows
  which applies: in `attached`, Stop interrupts the provider turn; in
  `reconciling`/`lost`, Stop terminalizes the Setta run locally with a
  best-effort provider interrupt — it does not claim to control the provider
  work. The renderer never computes this itself.

## Provider Reconciliation Contract

Reconciliation asks the provider for turn truth and applies exactly one of
these outcomes. The primitive is `thread/read` with `includeTurns: true`,
matching the run's linked provider thread/turn ids.

- **Turn status terminal (`completed`/`failed`/`interrupted`):** perform the
  normal terminal transition using the provider outcome and error metadata.
- **Turn not present, or thread `idle`/`notLoaded` while our turn should be
  active:** the turn died without a terminal notification. Fail the run with a
  typed interruption reason. This is a protocol fact, not a heuristic.
- **Turn status `inProgress`:** do **not** immediately mark `attached`. Set
  `reconciling` and return to `attached` only when a fresh turn-scoped event
  (delta, item, or turn event observed after the reconcile point) arrives.
  Rationale: the recording is consistent with an app-server that does not know
  its own turn is dead; trusting a single status read would reproduce the
  observed failure with extra steps. If the provider claims active but nothing
  arrives, the run stays honestly in `reconciling` — Stop remains available,
  and every later trigger re-runs reconciliation. No timer forces the
  transition either way.
- **`thread/read` fails or the provider needs restart:** mark `lost` with
  reason `provider_unavailable`, `retryable: true`.
- **Provider protocol drift:** fail loudly with a diagnostic; do not guess.

Phase 0 confirmed the important zombie outcome: a live app-server with its
upstream traffic silently blackholed continues to report the thread as
`active` and the target turn as `inProgress`. `thread/read`,
`thread/resume`, `thread/loaded/list`, and `thread/turns/list` do not
distinguish that zombie from a healthy active turn. Therefore the
`inProgress` outcome above is load-bearing: reconciliation must remain in
`reconciling` until a fresh post-reconcile turn-scoped event arrives.

### Triggers, ranked

The recording proves the stream never reconnects across sleep, so
stream-based triggers alone can never fix the observed failure. Required:

1. **Electron `powerMonitor` resume** (main process → reconcile request). This
   is the only signal that fires in the recorded scenario. Load-bearing, not
   optional.
2. **Active-run snapshot load** — workspace open / conversation select with a
   persisted running run reconciles before or alongside serving the snapshot.
3. **Event-stream resync/reconnect** — cheap to hook where main already
   handles reconnect and `chat.resync_required`.
4. **Explicit user retry** from `lost`/`reconciling` presentation.
5. **Provider process restart** (manager `Failed` → `Restarting`) for runs
   whose turns were not already failed by lifecycle events.

Renderer `online`/`visibilitychange` hooks are optional hardening, not
substitutes for 1 and 2. Reconciliation is a bounded, explicit request per
trigger — never recurring background polling.

## Event Delivery Contract

Replace v1's durable-outbox proposal with an ordering fix. The invariant:

> A hub-publish failure can never abort, skip, or reorder durable store
> writes. Publishes happen after the durable writes they describe, and their
> failures are logged/traced, never returned as transition failures.

Concretely:

- In `failTurn`/`completeTurn`/`cancelRunningTurnLocked`, keep the existing
  write order but strip the publish out of the transcript finalize step:
  persist the terminal transcript blocks, then persist the canonical run +
  assistant-message terminal record, then publish all events, collecting
  publish errors as diagnostics only. The order is load-bearing: startup
  recovery scans only `RunStatusRunning` runs and repairs transcript state
  only from that interrupted-run path
  (`internal/chat/service_recovery.go`), so the one recoverable crash
  direction is transcript-terminal + run-still-running. Writing the canonical
  record first would invert the mismatch into one recovery never repairs.
  With this order the inverse direction is unreachable by construction, and
  the remaining crash window (file-per-record store, no transactions) is
  exactly the direction recovery already reconciles; Phase 1 pins that
  guarantee down.
- Fix shutdown ordering in `runtime/server.go`: stop accepting new sends,
  cancel and drain in-flight turn goroutines (bounded), let their terminal
  transitions complete against an open hub, then close event streams, HTTP,
  and the provider. `fail_turn_transition_failed: event hub is closed` must
  become unreachable. Phase 2 implements graceful shutdown as an explicit
  local terminal failure with error `run interrupted by backend shutdown`;
  startup recovery keeps using `run interrupted by backend restart` for
  persisted running runs left by ungraceful exit.
- Keep the existing ring buffer, cursor replay, `chat.resync_required`, and
  stream-id rotation exactly as they are. Add coverage that overflow/mismatch
  actually forces a renderer snapshot resync if none exists.

## Backend Invariants

- A non-terminal `Run` has at most one active provider owner.
- A terminal `Run` has terminal liveness.
- A terminal transcript `run_status` block cannot coexist permanently with a
  canonical run record that remains `running`; that crash direction is
  repaired by startup recovery before snapshots are served. The inverse — a
  terminal run with non-terminal transcript blocks — must stay unreachable by
  write order, because recovery does not scan terminal runs.
- A `running` run with liveness `reconciling` or `lost` does not present as
  normal Working in the UI.
- Stop is offered exactly when the backend reports `cancellable`; local
  cancellation (context cancel + deterministic local terminal transition +
  best-effort provider interrupt) is always available for runs attached to
  this process. Interrupt failures — including stale-turn `-32600` errors,
  which today carry no typed `data.activeTurnId` — must never block the local
  terminal transition. This resolves v1's open question: a
  provider-unavailable run stays locally cancellable.
- Startup recovery reconciles or explicitly interrupts every persisted running
  run before the workspace snapshot is served (already true; keep it tested).
- Event publication failure cannot invalidate or abort a durable transition.

## Renderer Contract

The renderer consumes backend-owned state and displays distinct states:

- **Working:** run `running`, liveness `attached`, no approval blocking.
- **Reconnecting:** run `running`, liveness `reconciling` — keep transcript
  visible, suppress the normal animated working indicator, show a compact
  reconnecting state.
- **Connection lost:** run `running`, liveness `lost` — show retry when
  `retryable`, Stop when `cancellable`. Presentation must convey that Stop
  ends the Setta run (with best-effort provider interrupt), not that Setta
  still controls the provider work.
- **Interrupted/Failed/Cancelled/Complete:** durable terminal run state.

The renderer treats chat events as cache invalidation, not sole truth. On
event-stream resync, wake, explicit retry, or liveness change to `lost`, it
reloads the typed snapshot (existing `runChatStoreBackgroundResync` path)
rather than keeping the previous active-run view indefinitely. A
`reconciling` liveness event is already the typed snapshot state for the run
and must update presentation without immediately re-entering snapshot-load
reconciliation. The sidebar active-run indicator consumes the same liveness
summary so it cannot say Working while the pane says lost.

## HTTP And Generated Contracts

Contracts are owned by `internal/httpapi` and generated into TypeScript.

Additions (keep minimal):

- active-run response (`/chat/runs/active`) includes the liveness projection;
- `ConversationListItem` gains a single active-run liveness summary field
  (same projection source, for the sidebar);
- typed chat event for run liveness updates;
- reconcile endpoint (e.g. `POST /chat/runs/reconcile`) accepting optional
  workspace/conversation scope, used by powerMonitor resume, renderer focus
  recovery, and user retry.

Not needed: message-page liveness embedding (the active-run snapshot covers
it), new resync event shapes (`chat.resync_required` exists). Do not maintain
a separate generated-type list in the contract generator. After editing
Go-owned contracts, regenerate affected outputs before cleanup and before
finishing implementation.

## UX Requirements

- Stop appears exactly when the backend reports `cancellable`; retry appears
  exactly when `retryable`. No renderer guesses.
- The transcript tail must not show the normal animated working indicator
  while liveness is `reconciling` or `lost`.
- Existing transcript content stays visible during reconciliation.
- Compact status labels and tooltips; no in-app prose explaining
  implementation details.

## Implementation Phases

### Phase 0 - Provider Truth Spike

Status: Complete. Findings are recorded in Appendix A.

Before freezing the state machine, establish what codex app-server actually
reports for a dead-but-unreported turn. Against a real app-server (ChatGPT
auth, no `OPENAI_API_KEY`):

- `thread/read` (`includeTurns: true`) during a healthy active turn;
- the same after severing the app-server's upstream network mid-turn
  (sleep-equivalent), including whether a late `turn/completed` with
  `status: "failed"` ever arrives;
- `turn/interrupt` against a stale/dead turn — error shape, `activeTurnId`
  data, and whether it terminalizes the thread;
- whether `thread/resume` on such a thread reports the stuck turn.

Record findings in an appendix to this plan. The reconciliation outcome table
and the reachable liveness states in Phases 2-4 are finalized from these
findings. If `thread/read` cannot distinguish the zombie, evaluate wiring
`thread/loaded/list` / `thread/turns/list` into the supported protocol subset
via `cmd/generate-codex-protocol`.

### Phase 1 - Characterize And Freeze The Failure

Status: Complete. Added deterministic coverage for the closed-event-hub
terminal mismatch and startup recovery of terminal `run_status` blocks left
beside a still-running canonical run.

Deterministic coverage reproducing both root causes without real sleep:

- provider turn emits deltas, then never emits terminal turn completion; the
  event stream stays connected; renderer keeps an active run; the frozen test
  shows today's indefinite normal Working, and flips after Phases 2-5 to show
  reconciling/lost presentation instead;
- a focused backend test for terminal transition during event-hub shutdown,
  pinning the invariant: either the durable terminal transition fully
  persists, or startup recovery reconciles it before snapshots are served —
  and (after Phase 2) that a publish failure cannot abort the canonical write;
- a startup-recovery test over the exact recorded mismatch (terminal
  `run_status` block + running canonical run).

### Phase 2 - Terminal Transition Ordering And Shutdown Drain

Status: Complete. Terminal transcript/run writes now happen before terminal
event publishes, publish failures are recorded as diagnostics instead of
aborting durable transitions, and runtime shutdown drains active chat turns
while the chat event hub is still open.

The small, surgical fix for root cause 2 (see Event Delivery Contract):
durable writes before publishes, publish failures demoted to diagnostics,
shutdown drains in-flight turns before closing the hub. Independent of the
liveness work and shippable first.

### Phase 3 - Backend Liveness Projection

Status: Complete. Runtime liveness now sits beside active turns, is exposed
through active-run and conversation-list snapshots, and publishes typed
liveness events. Phase 4 still owns provider reconciliation and the ranked
trigger wiring that moves existing runs back into `reconciling`.

- runtime liveness projection beside the active-turn map; attached on turn
  start with linked thread/turn refs;
- `reconciling` set on the ranked triggers; `terminal` set by terminal
  transitions;
- liveness in active-run snapshot + conversation-list summary;
- typed liveness chat event published on change;
- `cancellable`/`retryable` computed backend-side.

This phase pins the state model with service tests before any UI work.

### Phase 4 - Codex Reconciliation And Triggers

Status: Complete. Codex `thread/read` reconciliation is implemented through the
chat harness using typed protocol fields only. Provider `inProgress` keeps the
run at `reconciling` until a fresh turn-scoped event restores `attached`;
provider-unavailable reads mark `lost`; missing/idle provider turns fail the
run with an explicit interruption. Snapshot-load, event-stream resync/reconnect,
Electron `powerMonitor` resume, and user-retry IPC/HTTP triggers are wired.
Provider interrupt failure is now best-effort for local cancellation, with typed
active-turn adoption retained when the provider supplies `error.data`.

- implement the reconciliation operation per the contract above, using typed
  protocol fields only (no text/time heuristics);
- fresh-evidence rule: `inProgress` claims hold at `reconciling` until a
  post-reconcile turn event arrives;
- robust cancel: stale-turn interrupt failures never block the local terminal
  transition; keep the typed `data.activeTurnId` adopt-and-retry as an
  opportunistic path only (inert against today's app-server per Appendix A),
  and never parse the error message text;
- wire the triggers: Electron `powerMonitor` resume → reconcile endpoint,
  snapshot-load reconciliation, stream-resync hook, user retry.

### Phase 5 - Renderer Resync And Presentation

Status: Complete. The renderer now stores active-run liveness from snapshots
and typed events, resyncs the selected conversation when liveness is lost,
derives Working/Reconnecting/Lost transcript and composer presentation from
backend capability fields, and uses the same liveness projection in the
sidebar conversation indicator.

- consume the liveness projection and events;
- distinct Working/Reconnecting/Lost presentation; gate Stop/retry from
  backend capability fields;
- snapshot reload on liveness-lost, resync, and wake (existing background
  resync path); `reconciling` events update presentation without another
  immediate snapshot-load reconciliation;
- sidebar indicator uses the same projection.

### Phase 6 - Production E2E

Status: In progress. Added deterministic production Electron coverage for a
Codex turn that emits a provider delta, then remains silent while
`thread/read` reports the turn `inProgress`; the renderer reconciles through
the preload/main/HTTP path and leaves normal Working for the reconciling state.
Also added deterministic production Electron restart-recovery coverage for a
persisted active run left by an ungraceful backend exit. Remaining Phase 6
coverage: shutdown-drain persistence and live Codex provider regression checks
when ChatGPT auth is available.

Audit note, July 2, 2026: ChatGPT auth was available. The existing
`live-codex-electron` workflow was attempted after the deterministic Phase 6
slices passed, but it failed in the pre-existing live semantic cartographer
smoke while waiting for cartographer processed state. That run is not evidence
for or against liveness reconciliation; dedicated live-provider liveness
regression coverage remains outstanding.

Deterministic Electron E2E through production main/preload/renderer/HTTP and
store paths:

- open a workspace, create a chat, send a message, receive streamed output;
- simulate provider silence after deltas (scripted fake provider); trigger a
  reconcile (simulated wake/resync); verify the UI leaves normal Working and
  shows the honest state; verify Stop/retry follow backend capability;
- restart/reload with persisted active run state; verify recovery terminalizes
  and the UI converges;
- shutdown during an active turn; verify no partial terminal persistence
  survives to the next start;
- queue/steering behavior remains correct where touched.

When local Codex CLI is signed in with ChatGPT auth, run live Codex E2E for
the reconciliation path (including Phase 0's scenarios as regression checks
where feasible). Do not use `OPENAI_API_KEY`. If ChatGPT auth is unavailable,
skip live-provider tests narrowly and state that the skip is not proof of
provider integration.

## Test Strategy

Narrow tests first:

- Go store/service tests for transition ordering, publish-failure demotion,
  shutdown drain, and startup recovery of the recorded mismatch;
- Go service tests for liveness transitions, the fresh-evidence rule, and
  reconciliation outcomes (scripted provider fixtures shaped by Phase 0
  findings);
- backend event-stream tests for replay, overflow, and resync-required (cover
  existing machinery; do not rebuild it);
- renderer store tests for liveness-derived presentation and capability-gated
  controls.

Then production-path tests per Phase 6. Avoid tautological generator drift
tests; after Go-owned contract changes, run the generators and test behavior
through the generated surfaces.

## Resolved Decisions (from v1 open questions)

- **Reconciliation primitive:** `thread/read` with `includeTurns: true`;
  already wired and decoded. Phase 0 found it cannot distinguish a silent
  upstream zombie from a healthy active turn, so `inProgress` keeps liveness
  at `reconciling` until fresh post-reconcile turn evidence arrives. Raw
  `thread/loaded/list` and `thread/turns/list` probes did not add a zombie
  signal and should not be wired solely for liveness.
- **Liveness persistence:** runtime projection, not a persisted record;
  startup recovery makes persisted liveness meaningless across restarts.
- **Local cancellation while provider-unavailable:** always allowed for runs
  attached to this process — Stop performs a deterministic local terminal
  transition plus best-effort provider interrupt.
- **Replay depth:** unchanged — existing 512-event ring plus
  `chat.resync_required` plus snapshot resync; no durable outbox.

## Open Questions

- Whether upstream Codex can add typed `error.data.activeTurnId` to stale
  `turn/interrupt` errors. Phase 0 found the current direct app-server reports
  the actual active turn only in message text for the stale cases tested; later
  implementation must not parse that text.
- Is `powerMonitor` resume reliable across macOS sleep variants (short lid
  close vs long sleep vs lock screen), and is `unlock-screen` worth adding as
  a second wake trigger? Validate during Phase 4/6.

## Done Criteria

This work is complete when:

- a laptop sleep/network-loss style provider interruption cannot leave the UI
  in normal Working indefinitely — specifically, the wake and snapshot-load
  triggers reconcile the recorded scenario;
- Stop is offered exactly when the backend reports a real cancellation path,
  and retry exactly when reconciliation is retryable;
- backend snapshots expose durable run state and run liveness separately, and
  the sidebar consumes the same projection;
- a hub-publish failure can no longer abort or reorder durable terminal
  writes, and `fail_turn_transition_failed: event hub is closed` is
  unreachable under shutdown;
- startup recovery continues to reconcile every persisted running run before
  serving snapshots, now covered by tests over the recorded mismatch;
- event-stream overflow/mismatch forces a verified snapshot resync using the
  existing machinery;
- deterministic production Electron tests cover the stale-working and
  shutdown-drain workflows;
- live Codex provider tests (including the Phase 0 scenarios) pass when
  ChatGPT auth is available, or are narrowly and explicitly skipped.

## Appendix A - Phase 0 Provider Truth Spike

Completed on July 1, 2026 local time against direct `codex app-server
--listen stdio://` with ChatGPT auth available and `OPENAI_API_KEY` unset.
All probes used temporary workspaces under the OS temp directory and initialized
the app-server with Setta's `experimentalApi` capability.

### Probe Setup

- Healthy-turn probe: started a normal thread and a long no-tools turn, then
  called `thread/read` with `includeTurns: true` before any `turn/completed`
  notification arrived.
- Silent upstream-loss probe: started the same kind of turn through a local
  per-process HTTPS proxy. After `turn/started` and the first item event, the
  proxy stopped forwarding the active upstream tunnel while leaving Codex's
  local TCP connection open. The proxy confirmed app-server traffic through
  CONNECT tunnels to `chatgpt.com`, `developers.openai.com`, and `github.com`.
- Stale-interrupt probes: called `turn/interrupt` first with a fabricated stale
  turn id, then with a real previous turn id while a later turn was active.
- Fallback-method probes: raw-called upstream `thread/loaded/list` and
  experimental `thread/turns/list` during the blackholed active turn. These
  methods are present in upstream schemas, but are not in Setta's generated
  supported protocol list today.

### Findings

- Healthy active `thread/read` returned thread status
  `{ "type": "active", "activeFlags": [] }`. The target turn was present in
  `thread.turns` with status `inProgress`, `itemsView: "full"`, and no error.
- After silent upstream blackhole, no late `turn/completed` arrived during the
  observed wait windows (20 seconds in the main probe, 10 seconds in the resume
  probe). `thread/read` still returned thread `active` and target turn
  `inProgress` with no error.
- `thread/resume` while the turn was still blackholed reported the same
  `active` thread and `inProgress` turn. It does not identify the zombie.
- `thread/loaded/list` reported only that the thread id was loaded both before
  and during the stuck turn. It adds no turn-liveness signal.
- Raw `thread/turns/list` during the stuck turn returned the same target turn
  as `inProgress` with no error. It adds pagination/history access, not a
  zombie-vs-healthy distinction.
- `turn/interrupt` against the blackholed active turn id returned `{}` and
  emitted `turn/completed` with status `interrupted`; a follow-up `thread/read`
  reported thread `idle` and the turn `interrupted`. This confirms a local
  cancellation path exists while upstream provider traffic is unavailable.
- `turn/interrupt` with a stale turn id returned JSON-RPC code `-32600` and a
  message shaped like `expected active turn id <requested> but found <actual>`.
  The error had no `data.activeTurnId`/`data.activeTurnID` field in the
  fabricated-stale or real-previous-turn case. The stale interrupt did not
  terminalize the active turn; retrying with the actual active turn id did.

### Consequences For Later Phases

- Do not treat provider `inProgress` from reconciliation as proof of liveness.
  The backend must keep the run in `reconciling` until a fresh turn-scoped
  event arrives after the reconcile point.
- Do not wire `thread/loaded/list` or `thread/turns/list` solely for zombie
  detection; direct probes showed they do not distinguish the blackholed turn.
- Keep Stop available for attached runs even when liveness is
  `reconciling`/provider-unavailable: `turn/interrupt` can terminalize the
  blackholed active turn locally.
- Do not parse the stale `turn/interrupt` error message to discover an active
  turn id. If a future stale-turn adoption path needs that id, require typed
  `error.data.activeTurnId` from the provider or fail loudly with a provider
  drift diagnostic.
