# Chat and Workflow Parallel Runs, Liveness, Steering, and Run Settings Plan

Date: 2026-07-06

## Scope

This plan replaces the direction of the stashed
`docs/plans/chat-workflow-liveness-steering-ux-20260705.md` plan. It addresses
the same observed UX and state-model issues, but it treats concurrent execution
as the first-order requirement instead of merely improving the presentation of a
blocked run.

The implementation must make Setta correctly support an arbitrary number of
active independent Codex runs at the same time across:

- two normal chat conversations
- a normal chat conversation and a workflow-owned agent conversation
- multiple workflow-owned agent conversations started by parallel workflow nodes

The old global single-turn bottleneck is the root cause to remove or isolate
around. Liveness UI is not an acceptable substitute for actual parallel running,
and "parallel" does not mean a special case for exactly two active runs.

## Non-Negotiable Outcome

Any number of independent conversations or workflow-agent nodes must be able to
run, stream, accept steering, cancel, fail, and complete independently, subject
only to explicit resource limits and provider capacity errors.

If run A is slow, stalled, waiting on approval, producing background terminal
output, or hung in provider work, runs B through N must still be able to:

- acquire its own Codex execution capacity
- link its own provider thread and turn
- stream assistant output and activity
- accept steering once its own provider turn is linked
- cancel or complete without waiting for run A

The only intentional serialization is within one conversation/provider thread.
Setta should still reject or queue two simultaneous turns for the same
conversation or the same Codex thread. That per-thread serialization must not
block unrelated conversations or unrelated workflow nodes.

If Setta needs a resource cap to avoid unbounded local processes, memory use, or
provider overload, that cap must be explicit, configurable, observable, and
reported as backpressure. It must not be an accidental process-wide mutex, and it
must not leave extra runs pretending to be normally `Working`.

## Current Root Cause

`CodexHarness.StartTurn` currently takes `turnMu` and holds it until the
provider turn completes. That makes the Codex harness effectively process-wide
single-flight for interactive conversation turns.

Because the chat service persists a run and activates it before the harness has
linked a provider turn, a second conversation can show as running while it is
actually blocked behind another conversation's active provider turn. If the first
turn hangs, the second can hang behind it without ever reaching provider
thread/turn creation.

The previous plan correctly identified bad liveness presentation, stale
`Working` rows, steering placement, and workflow settings UI issues. It did not
make the root requirement explicit enough: independent conversations must not
share a full-turn lock.

## Replacement Policy

Do not preserve the global full-turn `turnMu` behavior as a compatibility path.
Do not keep a hidden global admission queue and call the result "parallel" just
because the UI says `Waiting for Codex`.

Do not add:

- backward compatibility paths
- legacy support
- migrations
- transitional adapters
- dual-read or dual-write behavior
- old-field aliases
- feature flags for the old execution model
- silent fallbacks to global serialization

If the existing Codex app-server protocol cannot safely multiplex multiple
active turns in one process, use isolated Codex app-server execution capacity per
active run or per independent thread. That capacity can be pooled or capped, but
the cap must be explicit backpressure, not hidden global serialization.
Correctness beats process reuse.

## Post-Implementation Audit Status

The first post-implementation audit addressed the data and control-reuse gaps:

- workflow-agent trajectory pages include uncommitted steering messages in a
  dedicated contract field so pending, cancelled, and errored steering can render
  outside committed transcript chronology
- workflow-agent trajectory steering renders immediately with the normal pending
  user-message treatment and tail placement before provider commit
- workflow-agent trajectory run settings reuse the normal chat model/reasoning
  and permission controls in disabled/read-only mode from the persisted run
  settings snapshot
- backend, renderer, and deterministic Electron tests prove pending steering is
  visible before provider commit and that settings use the normal disabled chat
  controls rather than workflow-specific pills or static labels

### Settings Layout Gap Resolution

The second post-implementation audit addressed the remaining workflow-agent
trajectory settings layout gap. The settings controls were present, but rendered
in a separate bar above the steering input, which visually produced:

- permission/model/reasoning controls on the top row
- the prompt input below them
- send/stop controls at the right edge of the input

The required layout is the normal composer layout:

- prompt input on the top row of the composer frame
- permission controls in the lower-left composer toolbar
- model/reasoning, voice, and send/stop controls in the lower-right composer
  toolbar
- no separate workflow-specific settings strip between the transcript and
  composer

The source was the standalone `WorkflowAgentRunSettingsBar` in
`desktop/src/renderer/src/features/workspace-graph/workflow-node-details-components.tsx`,
which called read-only settings controls outside the `Composer` frame. The
workflow-agent trajectory now renders the persisted read-only settings snapshot
through the normal composer frame/control placement, with mutation actions
disabled or omitted.

Renderer and Electron tests now fail if a separate settings bar is rendered
above the input, and they verify completed nodes hide the steering input while
preserving read-only settings in the normal bottom-toolbar presentation.

## Codex Reference Protocol Findings

The reference Codex source at
`/Users/kevin/Documents/AppDevelopment/reference_repos/codex` changes the
routing requirement from "avoid every unscoped event" to "keep active-turn
events scoped and keep standalone process streams out of active-turn routing."

Relevant protocol facts:

- normal assistant command output is `item/commandExecution/outputDelta`; it
  carries `threadId`, `turnId`, and `itemId`
- `command/exec` is a standalone app-server request "without creating a thread
  or turn"; its `command/exec/outputDelta` notifications are connection-scoped
  by client-supplied `processId`
- `process/spawn` is also standalone; its `process/outputDelta` and
  `process/exited` notifications are connection-scoped by `processHandle`
- modern turn-affecting server requests such as command approvals, dynamic tool
  calls, structured user input, and MCP elicitation carry thread and usually turn
  metadata; truly unscoped requests are global or legacy and must not be claimed
  by every active turn session
- the reference Codex TUI derives the live reasoning status header by extracting
  the first complete Markdown bold span from the accumulated public reasoning
  summary buffer

Therefore, Setta should not route `command/exec/outputDelta`,
`process/outputDelta`, or `process/exited` through normal active chat turn sinks.
Those channels need explicit process ownership maps keyed by `processId` or
`processHandle`, or they should remain outside chat transcript ingestion unless a
feature has deliberately spawned and owns that standalone process. Normal Codex
agent command output should continue through the turn-scoped
`item/commandExecution/outputDelta` path.

## Execution Model

### Required Semantics

Setta's chat service should continue to own conversation-level policy:

- one active or queued turn per normal conversation
- one active turn per workflow-owned agent conversation
- queued follow-up messages within a conversation
- steering only for the active run in that conversation

The Codex harness must own provider-level policy:

- no two active turns on the same Codex thread
- independent turns on different Codex threads can run concurrently up to the
  explicit configured execution capacity
- cancellation and steering target the correct run/thread/turn only
- turn-scoped command execution, approval, dynamic tool, structured input, and
  lifecycle events route to the correct owning run even while other runs are
  active
- standalone `command/exec` and `process/spawn` streams route by explicit
  process ownership and do not append to arbitrary active run sinks

### Preferred Architecture: Per-Thread Concurrency In One App-Server

The reference Codex app-server protocol gives normal active-turn notifications
and requests enough metadata to route by thread, turn, provider item, and request
id once the thread is owned. Implement the shared app-server path around those
scoped fields.

Replace the global full-turn mutex with narrower synchronization:

- protect only shared harness maps with short critical sections
- add a per-thread lock or active-thread registry so one Codex thread cannot run
  two turns concurrently
- allow different thread ids to start and wait concurrently
- register session ownership before `turn/start`
- own the returned turn id immediately after `turn/start`
- route provider requests and notifications by session ownership instead of
  process-wide unscoped matching
- keep approvals keyed by stable request id plus run/thread/turn metadata
- keep agent command execution routing on `item/commandExecution/*`, not
  standalone `command/exec/*`
- keep background terminal routing thread-safe and scoped by thread/process/item
  when it belongs to a Codex turn, and by explicit process ownership when it was
  spawned through standalone `process/spawn`
- do not enable full-turn `AcceptUnscopedNotifications()` or
  `AcceptUnscopedRequests()` for every active session

`StartTurn` should not block unrelated runs while it waits for provider events.
Its long wait loop must be per-run/per-session, not guarded by a global harness
mutex.

### Fallback Architecture: Isolated App-Server Capacity

The standalone `command/exec` and `process/spawn` channels being unscoped is not
by itself a reason to isolate active chat turns. Route those channels by explicit
process ownership outside the turn session model.

If any future active-turn notification or provider request that must mutate a
chat run is genuinely unscoped and cannot be attributed safely when two turns are
active in one app-server process, do not keep the global lock. Instead,
introduce explicit isolated Codex execution capacity:

- allocate one manager/app-server process per active independent run, or
  otherwise one isolated provider connection per independent execution lane
- keep reusable per-thread state only where it can be safely isolated
- route all events from that manager/session to the owning run
- shut down or pool idle managers only after their owning turns and late
  background-terminal lifecycles are safely complete

This is more expensive than multiplexing, but it is correct. The implementation
must choose the first architecture only if tests prove routing is safe.

## Implementation Plan

### 1. Add A Codex Harness Concurrency Characterization

Before changing behavior, add deterministic harness/app-server tests that
describe the real protocol constraints.

Tests should cover multiple simultaneous turns with different
conversations/threads. Use two turns for the smallest regression test and at
least three turns for fan-out/backpressure coverage:

- both turns link distinct provider thread ids and turn ids
- assistant text from each turn reaches only its owning sink
- scoped command execution output, approval, dynamic tool, structured input, and
  lifecycle notifications do not cross streams
- standalone `command/exec/outputDelta`, `process/outputDelta`, and
  `process/exited` notifications do not append to unrelated active turn sinks
- cancellation of one turn does not cancel or unblock by completing the other
- a stalled first turn does not prevent later turns from linking and streaming

Use the scripted/fake app-server where possible. If the real app-server protocol
is needed to characterize scope, add a narrow deterministic test harness around
the manager/session routing rather than relying on live provider calls.

### 2. Remove Full-Turn Global Serialization

Replace `CodexHarness.turnMu` with concurrency primitives that match the real
ownership domain.

The target shape is:

- `harness.mu` protects `active`, approvals, and short-lived routing maps
- a per-thread active registry rejects concurrent turns on the same thread
- new conversations with no linked thread do not share a lock after ID
  allocation/startup bookkeeping
- `waitForTurn` runs concurrently for independent sessions
- `RunTask` for workflow-agent conversation turns uses the same concurrent path
- any configured concurrency cap is enforced by an explicit admission component
  with observable backpressure state

The implementation must fail loudly if it cannot determine the thread ownership
for a linked-thread request. It must not silently fall back to a global lock.

### 3. Make Session Routing Explicit

Audit `codexapp.Manager` and `codexapp.Session` routing for concurrent active
sessions.

The desired behavior is:

- a scoped provider notification goes to exactly one owning session
- a scoped provider request goes to exactly one owning session
- standalone `command/exec` output is routed by `processId` to the owner of that
  request, not by active chat turn session
- standalone `process/spawn` output and exit are routed by `processHandle` to the
  owner of that process, not by active chat turn session
- an unscoped request during concurrent turns fails loudly in tests unless it is
  explicitly handled by an owning request map
- unscoped notification acceptance is not enabled for the full lifetime of every
  active turn if that causes broadcast or ambiguous delivery

If a startup window requires temporary unscoped routing, keep it narrowly scoped
and close it as soon as thread/turn ownership is known.

### 4. Preserve Conversation-Level Queueing

Do not confuse "parallel conversations" with "parallel turns inside one
conversation."

Keep existing per-conversation rules:

- sending into an idle conversation starts a run
- sending into a conversation with an active run creates queued work or steering,
  depending on the command
- queued work promotes only after that conversation's active run becomes
  terminal

Update tests so one conversation's active run does not block another
conversation's start path.

### 5. Make Workflow Parallel Nodes Actually Parallel

Workflow-owned agent nodes that are semantically parallel must start independent
workflow-owned conversations/runs and execute concurrently.

The workflow runner should not rely on the Codex harness global lock for
accidental ordering. If graph semantics require an ordering, the workflow
orchestrator should express that dependency explicitly through graph edges,
gateway waits, or node scheduling rules.

For parallel workflow nodes:

- each node execution owns a distinct chat conversation/run unless the workflow
  explicitly asks to continue a prior thread
- each node's child chat run links its own provider thread/turn
- one node hanging or waiting does not prevent another node from streaming,
  completing, or failing
- workflow execution state reflects per-node progress independently

### 6. Add Real Liveness On Top Of Parallel Execution

After runs are truly independent, add backend-owned liveness semantics so the UI
does not collapse distinct states into `Working`.

The liveness contract should distinguish:

- run exists but provider start has not begun
- waiting for execution capacity, only if capacity is intentionally bounded
- provider thread/turn linked
- provider fresh and working
- public reasoning headline available
- waiting for approval or explicit user action
- stale provider activity
- reconnecting/reconciling
- connection lost or provider turn not found
- terminal

If there is no global queue anymore, a second conversation should usually move
quickly from start to linked provider turn. A long `waiting for provider` state
should be exceptional and diagnosable, not the normal behavior under parallel
use.

### 7. Fix `Working` As A Fallback Headline

Keep `Working` as a fallback headline only when the backend says the provider is
fresh and no more specific public headline exists.

For Codex runs:

- accumulate public reasoning summary deltas
- derive the live headline from the first complete public Markdown bold summary
  span, in parity with reference Codex behavior
- leave the existing headline unchanged until the closing `**` arrives; do not
  fall back to a partial first line while a bold span is still incomplete
- never display raw/private reasoning as a live headline
- render command, approval, waiting, stale, reconnecting, lost, and terminal
  states from backend-owned liveness, not renderer heuristics

The renderer should not infer that any `running` run is healthy or working.

### 8. Fix Steering Placement And Capability

Steering must be scoped to the owning active run and provider turn.

Required behavior:

- steering is available only after that run has a linked provider turn that can
  accept steering
- steering for run A never targets run B, even when both are active
- after the user submits steering, the steering message appears immediately as
  pending user intent, using the same pending/tail visual treatment as queued
  messages
- pending steering is visible before Codex accepts, sends, commits, or inserts
  it into the provider turn
- pending steering remains outside committed transcript chronology
- the steering message becomes a transcript block only when the provider emits
  the commit/insertion event
- if the run fails, cancels, or loses attachment before commit, pending steering
  becomes cancelled or errored and stays out of committed chronology
- workflow-agent trajectory surfaces must render these pending steering rows
  too; do not restrict this behavior to normal chat transcripts

Matching provider commits to pending steering must use stable provider metadata
where available. Text-only matching must be deterministic and must fail loudly
when ambiguous.

### 9. Fix Workflow-Agent Run Settings UI

Workflow-agent run settings remain part of this work because the same details
surface shows the liveness and steering state.

The workflow-agent trajectory surface should use the normal chat composer
settings controls in disabled/read-only mode:

- model
- reasoning effort
- permission profile

The values must come from the persisted effective run settings snapshot, not
current defaults. Active steerable nodes should show those controls in the
composer toolbar, in the same placement as normal chat. Completed nodes should
hide the steering input but keep the read-only settings controls in a composer
settings presentation that preserves the normal bottom-toolbar placement.

Do not satisfy this requirement with a workflow-specific custom summary row,
pill strip, static labels, or text-only facsimile. The trajectory viewer should
reuse the same settings control components, styling, disabled states, and
accessibility semantics as the normal chat composer/settings bar, with mutation
actions omitted or disabled because the run snapshot is read-only.

Do not render a standalone settings bar between the transcript and the composer.
The layout must not put permission/model/reasoning controls above the prompt
input. If the current `Composer` cannot render read-only snapshot settings
without live mutation actions, extend the composer contract or extract a shared
composer-frame read-only variant rather than creating workflow-only chrome.

## Contract Plan

Prefer backend-owned typed fields over renderer heuristics.

Add or revise Go-owned contracts for:

- active execution lane or provider ownership identity, if needed for debugging
- provider thread id and turn id
- standalone `command/exec` `processId` or `process/spawn` `processHandle`
  ownership, if those streams surface in Setta UI
- active status kind and headline
- headline source
- liveness phase and reason
- last provider event timestamp
- last visible activity timestamp
- steerability and disabled reason
- cancellability and retryability
- pending steering state
- workflow-agent effective run settings

Regenerate TypeScript outputs after changing owner-defined contracts. Do not
manually edit generated files.

## Verification Plan

These changes touch chat behavior, Codex harness behavior, provider protocol
handling, run lifecycle, queueing, steering, event streaming, IPC/preload
contracts, renderer chat state, workflow execution, and transcript UI.
Production-path deterministic Electron tests are required.

### Backend Tests

Add focused Go tests for:

- multiple different conversations can have active harness turns at the same time
- the second conversation links a provider turn while the first is still active
- three active runs do not receive each other's assistant deltas, tool calls,
  approvals, scoped command execution output, lifecycle events, or completion
- standalone `command/exec` and `process/spawn` output does not create or mutate
  command-execution run items for unrelated active turns
- cancelling one active run leaves the other active run alive
- a hung/stalled first run does not prevent later runs from starting,
  streaming, steering, cancelling, or completing
- same-conversation concurrent sends still queue or reject according to existing
  conversation rules
- same-provider-thread concurrent turns are rejected or serialized per thread
  only
- workflow parallel agent nodes create distinct child chat runs and progress
  independently
- provider-ref-pending or capacity-waiting states do not present as healthy
  `Working`
- public reasoning updates the active headline, while private reasoning does not
- steering is pending until provider commit and commits at the provider
  insertion point

### Manager And Routing Tests

Add tests around `codexapp.Manager` and `Session` routing for:

- two sessions owning different threads receive only their own scoped events
- two sessions owning different turns on different threads do not conflict
- `item/commandExecution/outputDelta` routes by `threadId`/`turnId`/`itemId`
- `command/exec/outputDelta` routes only by explicit `processId` ownership
- `process/outputDelta` and `process/exited` route only by explicit
  `processHandle` ownership
- a server request with ambiguous ownership fails loudly
- unscoped event handling is either eliminated for concurrent turns or narrowly
  bounded to startup with deterministic ownership
- session backpressure on one run does not block lossless events for another
  independent run

### Renderer Tests

Add focused renderer tests for:

- two active conversations show independent sidebar indicators and active state
- switching conversations does not overwrite the selected run's liveness with
  another run's state
- steering controls use the selected run's capability, not a global active-run
  assumption
- after submitting steering, pending steering rows render immediately before
  provider send/commit and outside transcript chronology
- pending steering rows use the same pending-message presentation expected for
  queued messages, including workflow-agent trajectory surfaces
- committed steering moves into transcript chronology at provider commit
- workflow-agent details show child-run liveness and disabled run settings
  controls
- workflow-agent run settings tests fail if the implementation uses a
  workflow-specific pill strip or static text instead of the normal disabled
  chat settings controls
- workflow-agent run settings tests fail if permission/model/reasoning controls
  render in a separate bar above the steering input instead of inside the normal
  composer bottom toolbar

### Deterministic Electron E2E

Add production-path Electron coverage for:

- create chat A, start a run that intentionally waits
- create chats B and C while A is still active
- prove B links a provider turn and streams output before A completes
- prove C can also link and stream, or receives explicit configured-capacity
  backpressure if the test intentionally configures capacity below three
- steer B while A remains active
- verify B's steering message appears immediately as pending UI before the fake
  provider accepts or commits it
- cancel A and prove B continues
- complete B and prove A's cancellation did not corrupt B
- start a workflow with two parallel agent nodes
- prove both workflow child chats link provider turns and stream independently
- make one workflow node stall and prove the other still completes
- submit steering to a workflow child node and verify the pending steering row
  appears in that node's trajectory viewer before provider commit
- verify liveness, sidebar indicators, transcript rows, pending steering,
  workflow trajectory disabled settings controls, and workflow node details
  after restart/reload
- assert the workflow-agent details DOM has one normal composer frame with the
  read-only permission/model/reasoning controls in the composer toolbar, and no
  standalone `workflow-agent-run-settings` strip between transcript and composer

### Live Codex E2E

When local Codex CLI is signed in with ChatGPT auth, run live-provider E2E tests
that start multiple real Codex-backed Setta conversations concurrently. Do not
use `OPENAI_API_KEY`.

If ChatGPT auth is unavailable, report the live tests as skipped. Do not treat
the skip as proof that provider integration works.

## Acceptance Criteria

The work is complete only when:

- there is no process-wide full-turn lock blocking unrelated conversations
- an arbitrary number of independent normal conversations can run concurrently
  in the app, subject only to explicit configured capacity
- normal chat and workflow-owned agent runs can run concurrently
- parallel workflow agent nodes can run concurrently beyond a hardcoded pair
- one hung or cancelled run does not hang, misroute, or corrupt another active
  run
- steering, approvals, tool calls, background terminal events, and completion
  route to the correct active run under concurrency
- `Working` is only a backend-supplied fallback for fresh active work
- pending steering appears immediately after submission with the same pending UI
  treatment as queued messages, including in workflow-agent trajectory viewers
- pending steering is not committed transcript chronology until provider commit
- workflow-agent settings use the normal disabled settings controls from the
  persisted run snapshot
- custom workflow-specific settings pills, labels, or facsimiles do not satisfy
  the workflow-agent settings requirement
- deterministic Electron tests cover the concurrent behavior through production
  paths

For this documentation-only plan, inspect the diff. No automated code checks are
required unless implementation changes are made in the same commit.
