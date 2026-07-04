# Codex App-Server Backpressure Plan

Date: 2026-07-05

## Problem

Setta can fail an active chat run when Codex app-server emits a burst of command
output. The shell command itself succeeds, but the active Codex session closes
and Setta records the run as failed with:

```text
codex app-server session is closed
```

This has now reproduced several times:

- `/goal Implement docs/plans/chat-scroll-and-terminal-surfaces.md` failed while
  `./scripts/format.sh` was emitting output. The command exited `0`; the run
  failed with `codex app-server session closed before goal operation completed`.
- A normal chat turn failed immediately after a broad `rg` command started. The
  command exited `0` and produced about `18M` of background-terminal output.
- Another normal chat turn failed while dumping trace JSON. The command exited
  `0` and produced about `2.7M` of background-terminal output.
- The Codex-reference investigation failed after a broad `rg` over
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex`. That command
  exited `0`, and only about `448K` of background-terminal output was persisted,
  which shows burst rate and event fan-out matter, not only total output size.

The terminal output shown by the recorder contains repeated
`UND_ERR_BODY_TIMEOUT` event-stream disconnect messages. Those are renderer
event-stream reconnect noise. The persisted run traces point to the Codex
app-server session closing, not to the shell command failing or the Electron
backend HTTP API returning an error.

## Root Cause

Setta currently treats the Codex app-server session event queue as an
all-or-nothing control path:

- `internal/codexapp.Client` reads JSON-RPC messages from Codex app-server
  stdout.
- Notifications are buffered in a blocking channel of size `128`.
- Requests are buffered in a blocking channel of size `32`.
- `internal/codexapp.Manager` dispatches matching messages to a per-session
  channel of size `256`.
- The per-session dispatch uses nonblocking send.
- If that session channel is full, `Manager` calls `closeWithEvent` and removes
  the session.

That is a fragile policy for mixed-priority traffic. High-volume command-output
notifications can fill the same session queue used for assistant text,
completion notifications, approvals, turn lifecycle, and server requests.

The error that reaches the user is often masked. On overflow, Setta attempts to
enqueue a lifecycle event with `codex app-server session event buffer overflow`,
but when the queue is already full that event may not be delivered. The
consumer can then drain already-buffered notifications and call `OwnTurn`, which
returns the surfaced error:

```text
codex app-server session is closed
```

Background-terminal processing makes the problem worse. Each output chunk is
handled synchronously by the session consumer:

- find the registered background terminal;
- allocate a background terminal output id;
- write the output record;
- rewrite the background terminal process record with recent output;
- publish `chat.background_terminal.output_delta`;
- publish `chat.background_terminal.updated`.

That is useful state, but it is too much work to put on the raw session-drain
path without an explicit backpressure policy.

## Reference Behavior

The current Codex TUI does use app-server. In the reference repo, the old
`tui_app_server` feature flag is retained only as a removed compatibility flag;
the TUI always uses the app-server implementation.

Codex avoids this failure class by separating event priorities:

- assistant text deltas, reasoning deltas, `ItemCompleted`, and `TurnCompleted`
  are lossless;
- command-output deltas and progress-style updates are best-effort;
- best-effort events may be dropped under pressure and represented by a lag
  marker;
- server requests that cannot be delivered are rejected with an explicit
  overload error;
- a noisy command-output stream does not close the whole app-server session.

Setta should adopt the same product contract at its app-server boundary, not
copy the implementation mechanically.

## Decision

Replace the current session-overflow behavior with a typed backpressure model.

Do not make session overflow a generic chat failure. Do not rely on larger
buffers as the fix. A larger buffer only moves the threshold and still lets
best-effort output traffic kill the control plane.

Implement a lossless/best-effort event split and make overflow behavior
specific to the event class:

- lossless events must be delivered, with real backpressure or a dedicated
  priority path;
- best-effort events may be dropped, coalesced, or summarized under pressure;
- server requests must be either delivered or rejected with a specific overload
  JSON-RPC error;
- session closure should be reserved for actual app-server/process lifecycle
  failure or unrecoverable protocol corruption.

Replace the incorrect behavior in place. Do not add backward-compatibility
shims, legacy aliases, migrations, transitional adapters, dual event paths,
old-field support, or silent fallback behavior.

## Event Classes

### Lossless

Lossless events are required to keep chat state correct:

- app-server lifecycle events;
- server requests that require a response;
- turn started and turn completed;
- item completed;
- assistant text deltas;
- reasoning text and reasoning summary deltas;
- plan deltas;
- approvals and guardian review state;
- thread goal updates;
- thread status/settings updates that affect current run control;
- background terminal completion and terminal exit state.

Lossless events must not be dropped. If the consumer cannot keep up, Setta
should apply backpressure instead of closing the session.

### Best Effort

Best-effort events enrich the UI but are not required for correctness:

- command execution output deltas;
- background terminal output deltas;
- frequent background terminal `updated` snapshots caused only by output;
- progress/status deltas that are superseded by later authoritative state;
- repeated terminal recent-output summaries.

Best-effort events may be dropped or coalesced when queues are saturated, but
Setta must preserve enough metadata to report that output was skipped.

## Target Product Contract

The app-server bridge must maintain these guarantees:

1. A successful command cannot fail the active chat solely because it produced
   too much output.
2. Assistant text and final turn state remain correct under output bursts.
3. Final command state remains authoritative: command completion, exit code,
   and terminal completion must be delivered even if some output deltas were
   skipped.
4. UI surfaces can show that output was omitted due to backpressure.
5. Server requests are never silently lost. They are handled or rejected with a
   typed overload error.
6. The original cause of a session failure is preserved in logs/traces. If a
   queue overflows, the trace should say which queue overflowed and what event
   class was affected.

## Implementation Plan

### 1. Add Event Classification

Add a classifier owned by `internal/codexapp` that maps app-server JSON-RPC
messages to:

- `lossless_notification`;
- `best_effort_notification`;
- `server_request`;
- `lifecycle`.

The classifier should use protocol method names and typed decode helpers where
available. Do not classify by command text, output content, or brittle keyword
heuristics.

### 2. Replace Session Dispatch Overflow Semantics

Replace `Session.send(Event) bool` with dispatch APIs that understand event
class:

- lossless events block until delivered or until the session/app-server context
  is canceled;
- best-effort events use nonblocking delivery and report dropped/skipped counts
  when full;
- requests use nonblocking delivery and respond with a typed overload
  JSON-RPC error if they cannot be delivered.

Do not close the session for best-effort notification overflow.

For lifecycle events, preserve the current nonblocking shutdown behavior so a
dead consumer cannot deadlock backend shutdown, but store the lifecycle error on
the session so later reads can surface the original cause.

### 3. Preserve Original Failure Cause

Store a terminal session error separately from the channel close state.

When a session closes, consumers should be able to distinguish:

- app-server process exited;
- manager shutdown;
- protocol decode failure;
- lossless delivery failed;
- best-effort output was dropped but the session remained healthy.

The user-facing run error should not be the generic `codex app-server session is
closed` when a more specific cause exists.

### 4. Add Lag Markers

Introduce an internal lag event for skipped best-effort notifications. It should
include:

- skipped count;
- event class;
- method name when known;
- run/thread/turn ids when available;
- first and last skipped timestamps when available.

Renderer-facing chat state can use this to show a compact "output skipped"
marker for background terminals or command activity.

The lag marker itself should not be allowed to starve lossless events.

### 5. Coalesce Background Terminal Output Work

Move heavy background-terminal output processing off the raw session-drain
critical path.

Target behavior:

- append output chunks in bounded batches;
- persist output records in batches or with fewer process rewrites;
- update `RecentOutput` from the batch;
- publish one output event per batch, or a bounded sequence if the UI contract
  requires individual ordinals;
- publish `chat.background_terminal.updated` at a lower cadence or only on
  status changes and batch boundaries.

Terminal completion must flush any queued output needed for chronological
correctness before publishing final terminal state.

### 6. Keep Final State Authoritative

Even when output deltas are dropped:

- command execution item completion must be persisted;
- command exit code and error text must be persisted;
- background terminal process status must be updated;
- run completion/failure/cancellation must be delivered;
- assistant final text must remain correct.

For background terminals, skipped output should affect only the transcript of
raw terminal bytes, not the final terminal lifecycle state.

### 7. Add Focused Repro Coverage

Add deterministic tests for burst output through production paths.

At minimum:

- a fake app-server/provider emits more command-output notifications than the
  old `256` session buffer before the consumer can process them;
- the run remains active until authoritative completion;
- the command exits `0`;
- assistant text and turn completion are delivered;
- some output may be represented as skipped;
- the session remains open for the next turn.

Cover both normal turns and goal operations, because both failed in recordings.

### 8. Update Recording Diagnostics

Extend recording/debug output enough to diagnose future regressions:

- per-session queue depth/high-water mark when available;
- dropped best-effort event counts;
- lag marker payloads;
- original session close cause;
- method names for dropped/coalesced notifications.

This instrumentation should not change behavior.

## Non-Goals

- Do not increase channel capacities as the primary fix.
- Do not make command output fully lossless at the expense of chat correctness.
- Do not parse terminal output to decide event importance.
- Do not silently discard server requests.
- Do not keep the old close-on-best-effort-overflow behavior behind a flag.
- Do not add compatibility shims, migrations, transitional adapters, or dual
  dispatch paths.

## Verification

Use narrow checks first, then broaden after the event policy is stable.

1. Unit tests for event classification:

   - assistant/reasoning/plan deltas are lossless;
   - item and turn completion are lossless;
   - command-output deltas are best-effort;
   - background terminal output is best-effort;
   - server requests are never classified as best-effort.

2. `internal/codexapp` dispatch tests:

   - best-effort overflow does not close the session;
   - lossless dispatch blocks or otherwise preserves delivery;
   - request overflow returns a typed overload JSON-RPC error;
   - lifecycle close preserves the original close cause.

3. Chat harness tests:

   - burst command output does not fail the run;
   - skipped output produces a lag marker;
   - command completion and exit code are still stored;
   - goal operation burst output does not fail the goal operation.

4. Background terminal tests:

   - batched output preserves monotonic ordinals;
   - terminal completion flushes required output and updates final state;
   - repeated output does not publish one process update per raw chunk under
     pressure.

5. Deterministic Electron workflow test through production main, preload,
   renderer, HTTP, store, and event-stream paths:

   - start a temporary app data directory;
   - create a chat;
   - run a scripted command that emits output well beyond the old session
     buffer threshold;
   - assert the chat run completes;
   - assert the UI shows completion and, when output was skipped, a compact
     skipped-output marker instead of a failed run;
   - send a follow-up message and assert the session is still usable.

6. Final gates for implementation changes:

   - `./scripts/format.sh`
   - `./check_quality.sh --git-changes`

For this plan-only document, automated code gates are not required beyond diff
inspection.
