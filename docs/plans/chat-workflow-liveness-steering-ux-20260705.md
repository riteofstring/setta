# Chat and Workflow Liveness, Steering, and Run Settings Plan

Date: 2026-07-05

## Scope

This plan covers the chat/workflow issues observed in:

- `.recordings/20260705T230756Z`, the previous session recording
- `.recordings/20260705T231206Z`, the current session recording

It addresses four related problems:

- chat and workflow runs can appear stuck in `Working` even when no active
  provider work is visible or steerable
- Setta renders `Working` as a hardcoded active-run row instead of treating it as
  the fallback status headline used by reference Codex
- steering messages are rendered at submission time instead of at their eventual
  provider insertion point
- workflow-agent run settings do not use the same disabled/read-only controls as
  normal chat settings, even though the previous UX plan required that shape

This is a planning document only. It does not implement the changes.

## Replacement Policy

Do not preserve old liveness, steering placement, reasoning-headline, or
workflow-agent settings display behavior for this work. The implementation must
replace the old behavior and make the corrected state model canonical
immediately.

Specifically, do not add:

- backward compatibility paths
- legacy support
- migrations
- transitional adapters
- dual-read or dual-write behavior
- old-field aliases
- feature flags for the old UX
- silent fallbacks to previous liveness, reasoning-headline, steering, or
  workflow-agent settings behavior

If a backend-owned contract changes, update the owner-defined Go/httpapi
contract, regenerate TypeScript outputs, and update callers to the new shape.
Remove obsolete code instead of carrying it alongside the new path. If existing
development data does not satisfy the new contract, fail loudly with a specific
error rather than introducing a migration or compatibility shim.

## Findings

The previous session did not merely end because the app was killed. The app was
killed after both the workflow and direct chat had already appeared stuck in a
working state for several minutes.

The workflow run made real progress before it became stale. The workflow-owned
chat streamed assistant text, ran tool commands, accepted a workflow steering
message, and emitted additional command activity after that steering. Later, the
workflow execution and node execution still reported `running`, and the child
chat liveness still appeared attached/working even though useful provider output
had stopped.

The direct chat run also entered `running`/`Working`, but the recording does not
show assistant deltas, run item activity, or other useful progress after the run
start. The run remained visually active until the app was killed. After restart,
recovery marked it interrupted by backend shutdown, which is correct recovery
behavior but not the cause of the pre-shutdown stuck state.

The reference Codex TUI uses `Working` as an initial/fallback status header. When
the app-server sends public reasoning summary deltas, Codex accumulates the
summary text and uses the first bold summary heading as the active status
headline. If no reasoning headline exists yet, `Working` remains the fallback.

Setta currently diverges from that model. The backend appends a live-only
`run_status` transcript block with label `Working`, and the renderer displays
that label directly. Public reasoning summary deltas are received and stored as
reasoning run-item progress, but the active status row does not consume the
current public reasoning headline. In Setta, `Working` can therefore become the
visible status for the entire run even when reference Codex would have shown a
reasoning headline.

The direct-chat hang had a second concrete cause. Setta persists and publishes a
`running` run, activates the transcript, and renders the live `Working` row
before the Codex harness has necessarily acquired its global turn slot and
linked a provider turn. `CodexHarness.StartTurn` currently holds the harness-wide
turn mutex for the entire provider turn. While the workflow turn was still
active, the direct chat turn could be visually running while blocked before
provider thread/turn creation. In that state steering cannot work because there
is no provider turn to steer, but the renderer still maps provider-ref-pending
liveness to normal `Working`.

For the workflow-owned chat, the recording proves the provider turn had been
linked and had emitted real activity before going quiet. The recording does not
prove whether Codex app-server itself was hung, whether the upstream provider
turn stopped producing events, or whether completion/error delivery was lost.
The app-server process did not log an error or exit before the app was killed.
The correct diagnosis is "attached provider turn went silent and Setta kept
showing normal Working," not "frontend string got stuck."

The liveness model has enough concepts to represent attachment, reconciliation,
loss, and terminal state, but it currently lacks precise active-turn phase and
freshness semantics. Fresh provider events also do not update
`LastProviderEventAt` while liveness is already `attached`, so the backend can
underreport recent provider activity and then fail to make freshness decisions
from accurate data.

The recording does not show a direct-chat `chat:steer-message` IPC call after the
direct run became stuck. That means the failure to steer was not a recorded
backend steering endpoint rejection. The direct run also had no provider turn id,
so steering should have been explicitly unavailable. The important bug is that
the UI made the run look normally working while the backend had not linked a
steerable provider turn.

The workflow-agent settings issue is a gap against
`docs/plans/workflow-agent-chat-ux-20260705.md`. That plan required a split
between the message input and an always-visible read-only settings bar, using the
same visual language as normal chat composer controls. The current implementation
has a workflow-agent run settings row, but it is a bespoke pill display rather
than the same disabled model, reasoning, and permission controls. The composer
session can still expose placeholder labels such as `Workflow node`.

The current steering placement is also a state-model problem. A steering message
submitted during an active run is pending user intent until the provider commits
it into the conversation. Rendering that pending message as a transcript block at
submission time gives it a false conversation position. It should not become
transcript chronology until the provider emits the commit/insertion event.

## Principles

Run lifecycle, provider attachment, provider freshness, and live headline are
separate concepts. `running` means the run is terminally incomplete; it does not
by itself mean a provider turn exists, is healthy, is producing output, or can
accept steering.

`Working` is a fallback headline, not the state model. A healthy attached run
with no more specific public status can show `Working`; a run with a current
public reasoning headline should show that headline; a run waiting for provider
admission, reconnecting, stale, lost, blocked, or terminal should show that
specific state instead.

Provider-turn admission must be explicit. If a turn is waiting behind a harness
slot or provider start gate, the UI should say so and steering should be
disabled. Do not represent provider-ref-pending as normal provider work.

Public reasoning summary is the only reasoning source for live reasoning
headlines. Raw/private reasoning must not be displayed. Follow the reference
Codex behavior: consume public `ReasoningSummaryTextDelta` content, use the
public summary heading when present, and fall back to `Working` only when no
public headline exists.

Run freshness should be explicit. A run with no recent provider events should
move to a distinct waiting, stalled, reconnecting, or lost presentation based on
backend reconciliation, not remain indefinitely in normal `Working`.

Chat and workflow should share the same liveness vocabulary. A workflow agent
node backed by a chat run should surface the child chat run's freshness, stale
state, retryability, steerability, and stop capability instead of inventing a
separate interpretation.

Transcript blocks should represent committed conversation chronology. Pending
queue items, pending steering, uploads, and other user intents should be visible,
but they should be separate from transcript order until they are committed.

Steering should never silently disappear. If steering is available, submitting a
non-empty steering draft should produce a backend steering call. If steering is
not available, the composer should show the reason and offer the appropriate
next action.

Workflow-agent run settings are historical facts. Once a run starts, model,
reasoning, and permission values should be rendered from the persisted run
snapshot and should not be recomputed from current defaults.

Read-only workflow-agent run settings should reuse the normal chat settings
controls in disabled mode. A historical run should look like the normal chat
controls, but should not imply the values can be changed.

## Target UX

### Live Status Headline

The active status row should be composed from two backend-owned facts:

- active-turn phase: starting, provider-queued, attached, blocked, reconnecting,
  lost, or terminal
- public headline: current public reasoning summary headline, command/wait
  headline, approval headline, or no headline

When a run starts but no provider turn has been linked, the row should show a
provider-start state such as `Starting Codex` or `Waiting for Codex`, not
`Working`. Steering is disabled in this phase because there is no provider turn
to steer.

Once a provider turn is attached and fresh, the row should show the best current
public headline:

- public reasoning summary headline when Codex supplies one
- foreground command/wait/approval headline when that state has priority
- `Working` only when the provider is fresh or in a known active wait and no
  more specific public headline exists

If the attached provider turn goes quiet past the freshness budget, the row
should transition out of normal `Working` and into the backend-owned liveness
presentation. The liveness presentation should explain whether Setta is waiting,
reconciling, stalled, or disconnected.

### Run Liveness

A running chat or workflow-agent run can present as:

- `starting`: the run exists, but the provider thread/turn has not been linked
- `waiting for provider`: the run is queued behind an explicit harness/provider
  admission gate
- `working`: an attached provider is fresh, and no more specific public headline
  is available
- `thinking`: an attached provider is fresh, and a public reasoning summary
  headline is available
- `waiting`: the provider is known to be active in a specific wait state but has
  not emitted user-visible output recently
- `stalled`: the provider has not emitted activity within the freshness budget
  and reconciliation is pending or inconclusive
- `reconnecting`: the app is actively reconciling provider state
- `connection lost`: the provider turn cannot be found or the provider is
  unavailable
- `blocked`: the run is waiting for approval or another explicit user action
- `finished`: the run is terminal

The exact copy can be tuned during implementation, but the state model must
distinguish "run exists," "provider turn exists," "provider is fresh," "provider
is steerable," and "public reasoning headline exists."

The run footer/composer should keep stop and retry controls aligned with the
liveness state:

- stop remains available when the backend still has a cancellable provider
  operation
- retry/reconnect appears when reconciliation is retryable
- steering appears only when the backend has an active turn that can accept
  steering
- if steering is hidden or disabled, the UI shows the specific reason

### Steering Messages

Pending steering should render in the pending tail area, positionally like queued
messages, while preserving steering-specific styling and copy. It should not be
inserted into the transcript block list at submission time.

When the provider commits the steering message, the backend should create or
update the transcript block at the provider insertion point, mark the message
complete, and remove the pending tail row.

If the run is cancelled, fails, or loses provider attachment before commit, the
pending steering message should become cancelled or errored pending state. It
should not be promoted into transcript chronology unless the provider actually
committed it.

### Workflow-Agent Run Settings

The workflow-agent trajectory surface should split the bottom area into two
conceptual pieces:

1. A message input, visible only when the node run is steerable.
2. A run settings bar, visible for any workflow-agent node with a backing run and
   persisted run settings.

The run settings bar should use the same components and visual vocabulary as the
normal chat composer controls:

- permission control
- model control
- reasoning control

Those controls should be disabled/read-only. They should not open pickers or
mutate drafts.

For a running node, the input may sit above the settings bar. For a completed,
failed, or cancelled node, the input should disappear, but the settings bar
should remain attached to the trajectory pane or run header.

The bar must consume the effective run settings object from the workflow
trajectory/read response. It must not derive labels from current chat defaults.

## Backend Plan

### 1. Define Provider Turn Admission

Make provider admission a backend-owned phase instead of an invisible goroutine
blocked inside the harness.

The run start path must publish one of these explicit states:

- provider turn not requested yet
- waiting for harness/provider admission
- provider thread/turn linked
- provider turn terminal or lost

If the Codex harness still needs a global turn slot, keep that queue explicit in
run liveness and control capabilities. If global serialization is not required,
replace the full-turn mutex with narrower synchronization around shared harness
state. In either case, do not let a run render as normal `Working` while it is
blocked before provider thread/turn creation.

Steering capability must be false until the backend has a linked provider turn
that accepts steering. Stop capability should reflect whether there is a
cancellable local admission/start operation, a cancellable provider turn, or both.

### 2. Define Live Public Headline Semantics

Add backend-owned semantics for the active status headline.

For Codex runs:

- accumulate public reasoning summary deltas by provider item
- derive the live reasoning headline from the public summary heading using the
  same convention as reference Codex
- never use raw/private reasoning text for UI headline or transcript display
- keep `Working` as the fallback only while the provider is fresh or in a known
  active wait and no more specific public headline exists

The live headline can be backed by the active reasoning run item, by liveness
presentation fields, or by another backend-owned projection. The important
contract is that the renderer receives a typed active status/headline projection
instead of inferring from a hardcoded live transcript block label.

Reasoning summary deltas should continue to create committed reasoning transcript
blocks only when the transcript model says a public reasoning block should exist.
The live status headline and committed transcript chronology are related but not
the same lifecycle.

### 3. Define Run Freshness

Add backend-owned freshness semantics for active runs.

The service should track, at minimum:

- last provider event time
- last transcript block or run item event time
- last reconciliation attempt time
- provider thread and turn identifiers
- whether the active turn can still accept steering
- whether the active turn can still be cancelled

Fresh provider events should update the freshness timestamp even when liveness is
already `attached`. The event stream should publish liveness updates when the
visible freshness state changes.

### 4. Add Stale Detection

Add a push-based stale detector for active runs. Do not add renderer polling.

When an active run has no provider or transcript activity beyond the configured
freshness budget, the backend should:

1. mark the run stale or reconciling
2. publish liveness and conversation updates
3. reconcile with the provider using the provider thread and turn ids
4. transition to attached/waiting, stalled, lost, or terminal based on the
   provider result

The detector should be owned by the chat service or harness lifecycle, not by an
individual renderer surface, so chat panes and workflow node details receive the
same state.

### 5. Reconcile Workflow Agent State Through Child Chat Liveness

Workflow node trajectory reads should include the child chat run liveness and
freshness/headline presentation data needed by the renderer.

The workflow execution/node execution can remain `running` while the child chat
run is stale, but the node details surface must be able to show that distinction.
The workflow runner should not mask child chat liveness behind a generic
workflow `running` state.

### 6. Separate Pending Steering From Transcript Blocks

Persist steering submissions as user messages with steering delivery and pending
status, but do not create transcript blocks at submission time.

On provider commit:

- find the matching pending steering message by provider commit metadata
- mark it complete
- create or update the committed transcript block at the current ingest ordinal
- publish message, transcript, liveness, and conversation updates

Prefer provider commit identifiers or explicit metadata for matching. If the
provider only supplies text, keep the matching deterministic and fail loudly when
ambiguous rather than silently committing the wrong pending steering message.

### 7. Preserve Error State For Uncommitted Steering

When an active run terminates before pending steering commits, mark those
steering messages as cancelled or errored. Keep them out of the committed
transcript.

The visible message state should make it clear that the steering was submitted
but never became part of the provider conversation.

## Frontend Plan

### 1. Render Active Status From Backend State

Update chat and workflow node surfaces to render the backend active-status
projection instead of mapping any running or provider-ref-pending run to normal
`Working`.

The renderer can still format labels and icons, but it should not independently
decide that provider-pending, stale provider activity, or missing provider
activity is healthy. Backend liveness/headline state should own those semantic
distinctions.

The live transcript tail should no longer be a hardcoded `Working` row. It should
render the active status projection:

- provider-start/admission state before thread/turn link
- public reasoning headline when available
- command/wait/approval headline when that state has priority
- `Working` fallback only when the backend explicitly supplies it as the active
  fallback
- stale/reconnecting/lost state when freshness or reconciliation requires it

### 2. Make Steering Submission Observable

The composer should have one clear submit path for active-run steering:

- non-empty draft and steerable run: call the steering action
- non-empty draft and unsteerable run: do not submit, and show the disabled
  reason
- empty draft: no-op with no misleading state change

The UI should not infer steerability from `running`. It should follow the
backend-supplied capability and disabled reason. A provider-pending run must
show steering as unavailable because no provider turn has been linked.

### 3. Render Pending Steering From Message State

Pending steering rows should be derived from pending steering messages for the
active run, not from transcript blocks.

The chat view model should provide pending steering messages in the same
positional layer as queued messages. Styling can remain distinct from queued
follow-up prompts, but layout should communicate that the message is pending
outside committed transcript chronology.

### 4. Reuse Chat Settings Controls For Workflow Runs

Extract or parameterize the normal chat settings controls so they can render:

- interactive mode for normal chat draft settings
- disabled/read-only mode for workflow-agent historical run settings

The workflow-agent run settings bar should pass display-ready run snapshot
values into those controls and omit all picker actions.

Do not use generic labels such as `Workflow node` for model, reasoning, or
permission. If run settings are unavailable, the UI should either hide the bar or
show a specific missing-settings error, depending on whether the backend
contract says settings are required for that run.

### 5. Keep Input Visibility Separate From Settings Visibility

The workflow-agent input should be controlled by steerability. The settings bar
should be controlled by whether the node has backing run settings.

These conditions are independent:

- running and steerable: show input plus settings bar
- running but not steerable: hide or disable input with a reason, keep settings
  bar
- completed/failed/cancelled: hide input, keep settings bar
- no backing run: hide both run input and run settings bar

## Contract Plan

Prefer backend-owned typed fields over renderer heuristics.

If current contracts are insufficient, add or revise Go-owned contract fields
for:

- provider turn admission phase
- provider thread and turn identifiers
- active status kind
- active public headline
- active headline source
- run liveness freshness/presentation state
- last provider event timestamp
- last visible activity timestamp
- stale/reconciliation reason
- steerability and disabled reason
- cancel capability
- retry capability
- workflow-agent effective run settings
- pending steering message state

Regenerate TypeScript outputs after changing owner-defined contracts. Do not
manually edit generated files.

The new fields should replace renderer-derived status heuristics. Do not keep old
renderer-only status derivation as a compatibility path after the contract carries
the canonical state.

## Verification Plan

Because these changes touch chat behavior, workflow run lifecycle, queueing,
steering, event streaming, IPC/preload contracts, renderer chat state, and
transcript UI, deterministic end-to-end app workflow tests are required through
the production Electron/main/preload/renderer/HTTP/store paths.

Focused backend tests should cover:

- provider-ref-pending or harness-admission-pending runs do not present as normal
  `Working`
- steering is unavailable until a provider turn id is linked
- public reasoning summary deltas update the active status headline from the
  `Working` fallback to the public reasoning headline
- raw/private reasoning never contributes to active status headline or transcript
  display
- fresh provider events update liveness freshness while attached
- inactive attached runs become stale/reconciling without renderer polling
- reconciliation returns attached, lost, and terminal states correctly
- steering submission creates no transcript block before provider commit
- provider commit creates the transcript block at the ingest insertion point
- uncommitted pending steering becomes cancelled or errored when a run ends

Focused renderer tests should cover:

- provider-pending runs render as starting/waiting for Codex, not `Working`
- a backend-supplied public reasoning headline replaces the `Working` fallback in
  the live status row
- stale/reconnecting/lost liveness renders differently from working
- disabled steering shows a reason
- pending steering rows render in the pending tail area, not transcript order
- committed steering moves into transcript order after provider commit
- workflow-agent running nodes show input plus disabled settings controls
- workflow-agent completed nodes hide input but keep disabled settings controls
- no generic `Workflow node` model, reasoning, or permission labels appear in
  the run settings UI

Deterministic E2E tests should cover:

- opening a workspace and creating a chat
- sending a message and receiving streamed assistant output
- a workflow-owned Codex turn occupying the provider admission path while a
  direct chat run starts, proving the direct run shows waiting/not steerable
  instead of normal `Working`
- public Codex reasoning summary deltas replacing the `Working` fallback with the
  active reasoning headline
- provider activity stopping while the run remains active
- liveness transitioning out of normal `Working`
- steering during an active run
- steering availability following backend capability state, including stale and
  provider-pending disabled cases
- provider commit of a steering message after later assistant/activity output
- cancellation/failure with pending uncommitted steering
- workflow-agent run details for running and completed nodes
- restart/reload recovery for active, stale, and pending-steering runs

Run live Codex E2E tests when the local Codex CLI is signed in with ChatGPT auth.
Do not use `OPENAI_API_KEY` for those tests. If ChatGPT auth is unavailable,
report the live-provider tests as skipped without treating the skip as proof of
provider integration.

For this documentation-only plan, inspect the diff. No automated code checks are
required unless implementation changes are made in the same commit.
