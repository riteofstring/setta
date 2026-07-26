# Setta-Owned Conversations With Ephemeral Codex Carriers

Status: in progress. Phases 1 through 5 are implemented. Phase 6's deterministic
and live Codex targets are written; running the live suite against ChatGPT auth
is the remaining release gate.

## Executive Summary

Setta should own conversation persistence. Codex provider threads should be
ephemeral execution carriers.

That means every Director and workstream conversation is long-lived from
Setta's point of view, but no Setta conversation depends on a durable
ChatGPT-visible Codex thread. If the app restarts, Setta creates a fresh
ephemeral Codex carrier and replays the Setta-owned context it needs.

This removes the current inconsistency where the Director is Setta-persistent
but regular workstreams still rely on durable provider thread bindings.

## Non-Negotiables

- No backward compatibility.
- No migrations.
- No transitional adapters.
- No dual durable/ephemeral modes.
- No old-field aliases.
- No persistent provider thread IDs in public contracts, snapshots, graph state,
  or app-owned durable conversation state.
- No ChatGPT sidebar pollution from Setta-created conversations or live tests.
- Simple product rule: Setta is durable; Codex is runtime execution.

Because Setta is unreleased, schema and contracts should be changed directly.
Existing local app data can be discarded. Do not add migration code.

## Product Model

There is one persistence model for all conversation types:

- The Director conversation is durable in Setta.
- Regular workstream conversations are durable in Setta.
- Conversation turns, queue state, artifacts, approvals, graph facts, tool
  receipts, public assistant output, and recoverable failures are durable in
  Setta.
- Codex provider threads are ephemeral carriers that exist only to run current
  model work.
- A provider thread can be reused while the current Setta process is alive, but
  it is never the durable source of truth.
- After restart, Setta does not resume provider threads. It starts new
  ephemeral carriers and replays Setta-owned context.

The Director should stop being special here. It can keep a distinct role,
tools, and light UI styling, but its persistence and carrier lifecycle should
match every other Setta conversation.

## Current State To Remove

The current workstream substrate still treats provider thread identity as
durable app state. Remove that model directly.

Delete or replace:

- `agent_thread_bindings` from `internal/conversation/schema_v1.sql`
- `AgentThreadBinding`, `ThreadBindingStatus`, and thread-binding snapshot
  fields from Go contracts and generated TypeScript
- `ConversationThreadBindingUpdatedEventPayload`
- thread-binding persistence, repair, missing-thread, and resume paths in
  `internal/conversation/service_thread_binding.go`
- provider-thread reconciliation on restart in
  `internal/conversation/service_agent_recovery.go`
- durable-provider assumptions in live tests
- durable provider fork metadata such as `providerForkThreadId`,
  `sourceProviderThreadId`, and `sourceProviderTurnId`
- durable Director provider binding in `director_thread`
- any live-test cleanup code that exists only because durable provider threads
  were created

Keep provider IDs only as runtime-private correlation data while one carrier is
actively running. They may appear in internal adapter structs for event routing,
but they must not become durable product state or renderer contract state.

## Target Architecture

### 1. Conversation Store Owns Truth

The durable record for a conversation is the Setta conversation log:

- accepted user inputs
- queued inputs
- turn lifecycle
- public assistant text
- public reasoning summaries, if exposed
- tool calls and receipts
- approvals and approval resolutions
- artifacts
- graph facts
- branch metadata based on Setta IDs
- recoverable interruptions and failures

Provider thread IDs and provider turn IDs are not part of this durable product
model.

### 2. Runtime Carrier Registry

Introduce a small in-memory carrier registry owned by the agent/conversation
runtime.

It maps Setta execution IDs to live provider state:

- Setta conversation ID
- Setta turn ID
- Setta run ID
- provider thread ID
- provider turn ID, once known
- dynamic tool scope
- cancellation and steering handles

This registry is process-local. It is empty after restart. That is correct.

### 3. Setta Run IDs Replace Provider Identity

Every model attempt gets a Setta-owned run ID.

Durable trajectory and graph records should reference:

- conversation ID
- turn ID
- run ID
- activity ID
- artifact ID
- approval ID

Provider IDs remain adapter-local. Dynamic tool calls and provider events are
validated against the in-memory active run, then committed as Setta-owned
events without leaking provider IDs into durable public state.

### 4. Ephemeral Thread Start Is The Only Conversation Start

All Setta conversation carriers start with `Ephemeral: true`.

The agent runtime should expose a clear API such as:

- `StartCarrier`
- `RunCarrierTurn`
- `InterruptCarrierTurn`
- `SteerCarrierTurn`
- `InjectCarrierItems`

The old durable-thread API should be deleted from conversation use:

- no `ResumeThreadWithConfiguration`
- no `ReadThread` for conversation recovery
- no `ListThreads` or `SearchThreads` for Setta-owned conversation state
- no durable `ForkThread` path

If low-level agent tests still need durable Codex characterization, keep that in
isolated agent tests only. Product code should not depend on it.

### 5. Context Replay

Before running a turn on a new carrier, Setta builds provider context from its
own durable state.

The context builder should be deterministic and boring:

- role developer instructions
- workspace/folder authority
- conversation title and current objective
- recent user and assistant turns
- relevant tool receipts and artifact summaries
- pending approvals or resource requests
- branch origin, if this conversation came from another Setta conversation
- active turn context when creating side work during a live run

The replay should use ordinary injected provider items, like the current
Director carrier already does.

Budgeting rule:

- include complete recent turns first
- drop whole oldest turns when over budget
- include compact Setta-owned summaries only when such summaries already exist
- do not invent unsourced memory
- do not add a new summarizer just to complete this migration

Long-history compaction can be a later Setta-owned feature. It must not block
removing durable provider threads.

### 6. Restart Recovery

Restart recovery becomes much simpler.

On startup:

- any running or stopping turn without a terminal Setta event becomes
  interrupted with reason `runtime_restarted`
- queued work remains queued
- the queue promoter starts the next eligible run using a fresh ephemeral
  carrier
- active approvals tied to a dead run become unavailable or retryable through
  Setta-owned state
- no provider thread is resumed
- no provider turn is reconciled

This is the principled behavior. If the process died, the ephemeral carrier is
gone. Setta should not pretend it can continue that provider run.

### 7. Branches, Forks, And Side Work

Product branches should be Setta branches, not provider forks.

Replace durable provider forks with Setta-owned branch context:

- a child conversation records its Setta parent conversation ID
- it records the source Setta turn or event boundary
- its first carrier is started ephemeral
- context replay includes the parent history up to the Setta boundary

Side work follows the same rule:

- side carriers are ephemeral
- side state uses Setta side IDs and run IDs
- if a side carrier dies, Setta marks the side run interrupted or failed
- parent contamination checks read Setta state, not provider thread history

If a feature only existed to clone provider history, delete it or rebuild it on
Setta replay context. Do not preserve provider-fork behavior as a compatibility
mode.

### 8. Director Unification

Remove the durable `director_thread` provider binding.

The Director should keep:

- one durable Setta Director conversation log
- Director-specific role profile
- Director meta-tools
- Director graph styling

The Director should not keep:

- a durable provider thread binding
- special carrier persistence rules

It should use the same in-memory carrier registry and replay path as a regular
conversation, with Director-specific instructions and tools.

### 9. Renderer And Graph Contracts

Generated backend contracts should stop exposing provider thread bindings.

Renderer state should show:

- conversation identity
- selected workspace/folder
- turn status
- run status
- queue state
- tool/activity/artifact nodes
- Director versus workstream styling

Renderer state should not show or depend on:

- provider thread ID
- provider turn ID
- thread binding status
- provider resume status

The live graph remains push-based. It projects Setta durable events and
runtime-active Setta run events, not provider history.

## Implementation Phases

### Phase 1: Delete Durable Provider Thread Contracts — DONE

- DONE: Remove `AgentThreadBinding` from domain contracts and snapshots.
- DONE: Remove thread-binding event payloads and generated TypeScript surfaces.
- DONE: Remove `agent_thread_bindings` from `schema_v1.sql`.
- DONE: Remove `director_thread` from `schema_v1.sql`.
- DONE: Regenerate affected TypeScript and protocol surfaces.
- DONE: Update frontend code to use conversation/run status instead of thread
  binding. The only renderer-side reader was the session recorder's
  `agent_thread_binding_observed` projection, which is gone.

Expected result: no public or durable Setta contract treats provider thread
identity as app state.

The Director slice landed first. `director_thread`, `DirectorThreadRecord`, and
its store read/write are gone; the carrier the Director runs on is now a
`CarrierRegistry` entry for the app run (Phase 5). `DirectorConversationModel` and
`InterpretationModelIdentity` now attribute a reply to provider and model alone,
so no provider thread id reaches the durable Director conversation log or the
semantic graph. This also completes the first bullet of Phase 5.

The `agent_thread_bindings` axis landed with Phases 2 and 3, as predicted:
`ConversationSnapshot.ThreadBinding` was the only source of the provider thread
id the workstream launch path used.

### Phase 2: Add The Carrier Runtime — DONE

- DONE: Add a process-local carrier registry. It is keyed by Setta conversation
  id rather than run id, because a carrier serves every run of one conversation
  for the life of the process while the run-scoped half — Setta turn id,
  provider turn id, dynamic tool scope, cancellation and steering handles —
  already lives on `activeConversationTurn`. Splitting the same fact across two
  process-local maps would only let them disagree.
- DONE: Start all carriers with `Ephemeral: true`.
- DONE: Make provider thread and turn IDs runtime-private. No durable
  conversation record holds a provider thread id.
- DONE: Route provider events through the active run mapping.
- DONE: Route dynamic tool calls through Setta run scope.
- DONE: Delete cleanup machinery that only exists to remove durable test
  threads. `DeleteDurableThreadsOnShutdown`, the created-durable-thread set, the
  attached-thread resume cache, and `live_codex_cleanup_test.go` are gone,
  because no Setta path creates a durable thread to clean up.

Expected result: provider identity exists only while a run is active in memory.

### Phase 3: Replace Workstream Launch And Recovery — DONE

- DONE: Replace `ensureAgentThreadBindingLocked` with ephemeral carrier creation
  plus Setta context replay (`internal/conversation/carrier.go`).
- DONE: Remove provider-thread repair and missing-thread logic. A carrier the
  provider has lost is dropped from the registry so the next turn starts a fresh
  one.
- DONE: Replace restart reconciliation with Setta-owned interruption recovery.
  `ReconcileTurn` and `ResumeThreadWithConfiguration` are deleted; in-flight
  turns become interrupted with reason `runtime_restarted`.
- DONE: Preserve queue promotion using Setta state only.
- DONE: Preserve steering and cancellation only for currently active in-memory
  runs.

Restart settlement also cancels every pending approval owned by the dead run in
the same durable mutation, before its `runtime_restarted` terminal fact. The
Director therefore stops offering approvals that no live carrier can answer.
The old `agent_liveness_changed` contract and its reconciliation-only status
surface are removed; provider lifecycle facts remain the typed source for live
execution-substrate state.

Expected result: regular workstreams behave like the Director: Setta persists
conversation state, Codex only runs current work.

### Phase 4: Replace Branch And Side Provider Forks — DONE

Codex cannot fork an ephemeral thread — it is never written to a rollout, so
`thread/fork` cannot read it — which means Phase 3 could not land without taking
the provider forks with it. The fork removal is therefore done:

- DONE: Remove durable provider fork paths. `executeDurableForkDecision` is now
  `executeBranchDecision` and touches no provider; side conversations start
  their own ephemeral carrier instead of forking the parent's.
- DONE: Make child conversations replay parent Setta context up to a Setta
  boundary.
- DONE: Make side work replay parent Setta context and active in-flight context.
- DONE: Remove provider fork metadata from branch records.
  `ConversationBranch.ProviderMetadata` is gone with the fork that filled it.
- DONE: Remove tests that assert stable provider thread IDs across turns.

- DONE: Move side provider identity into the runtime carrier registry.
  `SideConversation.ProviderThreadID`, `SourceProviderTurnID`, and
  `ActiveProviderTurnID` are gone from the durable record, the schema, and the
  generated TypeScript. A side's carrier is now a `carrierRegistry` entry keyed
  by its Setta side id, and its live provider turn is a field on
  `activeSideConversationTurn`.
- DONE: Remove durable provider identity from run audit.
  `TrajectoryEvent.ProviderThreadID` and
  `ResolvedInvocation.ProviderReferences.ThreadID` are gone; a trajectory event
  and an invocation now name a Setta conversation, turn, and sequence plus the
  provider turn/request ids that identify the call, never the carrier it ran on.

Two invariants had to move from provider identity to Setta identity as a result.
A side conversation was "still open" when it still held a provider thread; it is
now open until `DisposedAt` is set, so a failure with nothing left to clean up
disposes the side on the spot. And the parent turn a side was cut from was
recorded as `SourceProviderTurnID`; it is now `SourceTurnID`, the same Setta
boundary the in-flight context frame is built around.

Provider subagents now receive a Setta-owned durable activity id from the active
run's process-local correlation map; their provider thread id stays inside that
map and the agent adapter. Restart recovery also fails and disposes an
interrupted `preparing` side in one pass, so it cannot block the parent's next
side until another restart.

Expected result: branch and side behavior no longer requires provider history.

### Phase 5: Unify Director Carrier Handling — DONE

- DONE: Delete durable Director provider binding.
- DONE: Move Director carrier lifecycle onto the same carrier registry. The
  registry is `conversation.CarrierRegistry`, the conversation runtime owns the
  one instance an app run has (`Service.Carriers()`), and the Director keys its
  carrier by `director.DirectorConversationID`. That id is also what names the
  Director in the agent runtime, so the carrier key and the provider's
  active-turn key are the same Setta fact instead of two constants.
- DONE: Keep Director conversation history in the committed Setta log.
- DONE: Keep Director-specific tools and styling.

Two things followed from sharing the registry. A carrier the provider has lost
now leaves the Director's registry entry the same way a workstream's does: the
port reports it as `ErrDirectorCarrierLost`, the Director forgets the carrier,
and the next turn replays the durable conversation into a fresh one. And the
Director's remaining thread vocabulary became carrier vocabulary —
`DirectorThread` is `DirectorConversation`, `DirectorThreadPort` is
`DirectorCarrierPort`, `DirectorProviderThread` is gone (the port returns the
provider id it started, and Setta owns the identity around it), and
`internal/runtime/director_thread_caller.go` is `internal/runtime/director_carrier.go`.
A fresh Director carrier that rejects Setta history replay is unsubscribed
before the start fails, matching the cleanup invariant used by workstream and
side carriers.

Expected result: Director and workstreams share the same persistence model.

### Phase 6: Update Tests And Verification Targets

Do not run tests during implementation unless the user asks.

When verification is requested, update the deterministic tests first:

- DONE: conversation creation has no thread binding. Creating a conversation
  reaches no provider and holds no carrier, and the durable record it produces
  keeps the provider turn that identifies a call while never naming the carrier
  that call ran on.
- DONE: first turn starts an ephemeral carrier.
- DONE: second turn uses Setta replay, not provider resume. Every turn of one app
  run shares the carrier the first turn opened and is replayed into it exactly
  once; after a restart the conversation runs on a fresh ephemeral carrier
  carrying its own committed history.
- DONE: restart interrupts active work without provider reconciliation.
- DONE: queued work promotes after restart. The restarted provider fake now
  forgets the threads the dead process opened, so promotion proves a fresh
  carrier rather than a reused id.
- DONE: branches replay Setta context (`service_forks_test.go`).
- DONE: side work does not require provider fork history
  (`service_sides_test.go`, `service_side_lifecycle_test.go`).
- DONE: Director and workstreams both use ephemeral carriers. The Director's
  carrier start is asserted directly — ephemeral, its own tools, seeded with the
  durable Director history, or the inert marker when there is none.

Then update live Codex tests:

- DONE: live tests must not create durable provider threads. Every carrier a
  live test can reach starts ephemeral — the three product `StartThread` call
  sites and the fresh structured call — and `MaterializeThread`, the one API
  that could turn a carrier into durable provider history, is deleted rather
  than left callable.
- DONE: live test prompt tokens must not appear in provider thread list/search.
  Every live test stamps the prompts it submits through the product path with
  one tracking token and, as test cleanup so an early failure cannot skip it,
  asks the provider to list and search for that token.
- DONE: ChatGPT-authenticated runs should not pollute the ChatGPT sidebar. The
  token check is the sidebar check: a Setta conversation the sidebar could show
  is a thread the provider can find.

The live tests carry the token because a product-level test cannot see the
provider ids its carriers used — that is the point of the phase. The prompt is
the only thing the test and the provider both know about, so it is what the
test asks the provider to forget.

Release gate: these live assertions have not been run against ChatGPT auth yet.
`SETTA_LIVE_CODEX=1` runs of `TestBackendDirectorCommandCenterWithLiveCodex`,
`TestBackendTopicConversationWorkflowWithLiveCodex`,
`TestBackendTopicConversationArtifactWithLiveCodex`,
`TestBackendTopicConversationControlsAndRestartWithLiveCodex`,
`TestLiveConversationServiceActiveSideLifecycle`, and
`TestLiveCodexRuntimeEphemeralThreadLifecycleAndDiscoveryIsolation` are the
remaining evidence for this phase.

## Code Deletion Checklist

The implementation is not complete until these searches are either empty or
limited to low-level provider characterization tests:

- `agent_thread_bindings` — empty.
- `ThreadBinding` — empty.
- `ConversationThreadBindingUpdated` — empty.
- `ResumeThreadWithConfiguration` — empty. `ResumeThread` remains as low-level
  provider characterization in `internal/agent`, used by nothing in product
  code.
- `ReconcileTurn` — empty.
- `providerForkThreadId` — empty.
- `sourceProviderThreadId` — empty.
- `sourceProviderTurnId` — empty.
- `director_thread` — empty. No durable table, record, or store call remains,
  and Phase 5 renamed the runtime adapter and its types to carrier vocabulary.
- `DeleteDurableThreadsOnShutdown` — empty.
- `live_codex_cleanup` — empty.
- `MaterializeThread` — empty. Making an ephemeral carrier durable is the one
  thing this product must never do, so the API that did it is gone rather than
  left callable.

The remaining product vocabulary should be Setta vocabulary:

- conversation
- turn
- run
- activity
- artifact
- approval
- branch
- side conversation
- Director conversation

## Definition Of Done

- All Setta-created conversation provider threads are ephemeral.
- Setta conversations remain persistent across restart from Setta-owned state.
- The Director is not special in persistence model.
- Regular workstreams do not create ChatGPT-visible provider history.
- Live tests no longer leave ChatGPT sidebar conversations behind.
- Restart behavior is explicit, simple, and Setta-owned.
- No backward compatibility, migrations, shims, or dual paths remain.
