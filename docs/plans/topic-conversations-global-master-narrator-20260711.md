# Topic Conversations, Global Master, And Narrator Plan

**Date:** 2026-07-11

**Status:** In progress; Phases 0-3 and Phase 4 items 1-6 are complete

**Scope:** Desktop runtime, Easy Button, Codex agent lifecycle, narration,
global speech, conversation routing, pane binding, persistence, and removal of
obsolete chat/terminal/workflow/git product paths

This plan supersedes the future architectural direction in
[Easy Button Pane](easy-button-pane-20260708.md) and
[Easy Button Speech](easy-button-speech-20260709.md) wherever they conflict.
Their completed-work logs remain historical records. In particular, this plan
replaces these earlier decisions:

- one active Easy Run per workspace
- one Easy Button pane per workspace
- one fresh hidden conversation per request
- a workspace-global latest-run snapshot
- an ephemeral narrator fed only incremental digest fragments
- narrator settings inherited from chat/Easy Run defaults
- pane-owned microphone and speech playback

The implementation is a clean break. There will be no backward compatibility,
legacy support, migrations, transitional adapters, dual reads or writes,
old-field aliases, or silent fallbacks for the replaced architecture.

## Outcome

Setta becomes a conversation-centered, voice-capable multi-agent desktop
environment:

- A durable **topic conversation** owns an underlying workspace agent and its
  recent and historical work.
- A lightweight **narrator** observes that agent's authoritative trajectory,
  produces sparse milestones and final summaries, and answers direct status
  questions.
- A global **master** receives app-level speech or text, finds or creates the
  right topic conversation, routes work, and asks the renderer to focus or open
  panes.
- An Easy Button pane is a view of a topic conversation. A conversation may
  have no pane, one pane, or multiple panes.
- Multiple topic conversations may run concurrently in one workspace. Each
  conversation still serializes its own primary turns.
- The microphone and speech queue belong to the application shell, not an Easy
  Button component.
- The master has a stable global voice, and each topic narrator has a stable
  per-conversation voice selected to be distinct from other active speakers
  when the synthesis catalog permits it.
- Each topic conversation has a stable accessible color palette shared by all
  of its Easy Button views, making concurrently visible conversations easier
  to distinguish.
- Agent, narrator, and master model profiles are independent and configurable.
  The default agent may be heavy while the default narrator is explicitly
  lightweight.
- Side conversations and durable forks are first-class relationships, not
  slash-command text passed through a message endpoint.

The intended experience is:

1. The user opens Setta with global microphone capture enabled.
2. The user asks the master to bring up a recent conversation about a topic.
3. The master retrieves the conversation, focuses an existing pane or opens a
   new Easy Button pane, and reports what it did.
4. The user submits more work to that topic. Its heavy agent runs while its
   lightweight narrator observes and emits presentation events.
5. The user asks for an update. The request routes to that conversation's
   narrator without steering or interrupting the agent.
6. If the user changes topics, the master either routes to another existing
   topic, creates a new one, asks for clarification, or deliberately creates a
   side conversation.
7. Conversation work and narration continue even when no Easy Button pane is
   mounted.

## Non-Negotiable Product Decisions

### Topic conversation is the aggregate root

`EasyRun` is not retained as a parallel top-level domain. A user request is a
turn inside a durable topic conversation. Run/turn state, artifacts,
highlights, narrator state, and provider thread references are children of that
conversation.

Setta owns conversation identity. A Codex thread id is an external provider
reference and must never become the application's primary key.

### Panes are views, not owners

An Easy Button pane contains a typed `conversationId`. Mounting or unmounting a
pane does not create, stop, resume, or destroy the conversation. Pane layout
state and conversation execution state have separate lifecycles.

The pane coordinator owns this mapping:

```text
conversationId -> zero or more paneIds
```

When the master requests presentation of a conversation, the coordinator
focuses an existing pane when appropriate and otherwise creates one.

### The left pane is a conversation navigator

Retain the resizable, collapsible application-shell left pane, but replace its
current chat/workflow ownership with a conversation navigator. It lists one
row per durable topic conversation, grouped by workspace, regardless of
whether that conversation currently has zero, one, or multiple Easy Button
panes.

Selecting a row focuses the most recently focused existing pane for that
conversation or opens an Easy Button pane when none exists. Opening another
view is an explicit secondary action; multiple panes do not create duplicate
conversation rows. Closing the last pane does not remove, archive, stop, or
hide the conversation from the navigator.

The navigator does not expose the master thread, narrator threads, provider
thread ids, or ephemeral side threads as ordinary topic conversations. A
durable fork is listed as a conversation with lineage. An active ephemeral
side conversation may be indicated beneath its parent while open, but it is
not globally indexed or independently navigable after disposal.

There is no replacement for the old application-wide
`selectedConversationId`. Pane focus, conversation identity, and navigator
selection are distinct state. The navigator is virtualized and paginated or
incrementally loaded so every durable conversation remains addressable without
rendering an unbounded DOM.

The intended information architecture is:

```text
Ask Setta…  [microphone state]    fixed global master entry
Search conversations…            fixed navigator filter
Workspace A
  Pinned / working topics
  Recent topics
Workspace B
  Topics
Runtime/account/settings          fixed shell controls
```

### Master input is shell-owned and multimodal

Voice and text are two input modalities for the same global master session and
routing pipeline. The shell provides a compact `Ask Setta` launcher in the
fixed portion of the left navigator. Activating it opens an expanded master
overlay with a text composer, recent master exchanges, route results, and room
for clarification turns. A global keyboard shortcut and an app-chrome control
open the same overlay when the left pane is collapsed; these are presentations
of one controller, not separate master sessions.

The overlay may look and behave like a command palette for quick requests, but
it is not dismiss-on-submit command execution. It remains open when the master
asks a clarification or returns a conversational answer. Voice transcripts
and typed submissions appear in the same master interaction history.

An Easy Button composer and the global master composer have deliberately
different scope. Input sent from an Easy Button is explicitly addressed to
that topic conversation. Input sent from the shell master surface is globally
routed and includes the focused workspace/conversation as a hint, not as a
forced destination.

### Master owns cross-conversation routing

The master is the only actor authorized to make app-global routing decisions.
A topic narrator may identify that an utterance appears unrelated or propose a
side conversation, but it may not directly move the user to another topic,
create panes, or dispatch work to another conversation.

The master has conversation-management and presentation tools. It does not
have shell, filesystem mutation, or unrestricted workspace tools. Workspace
work is delegated to the chosen topic agent.

### Narrator is persistent logically and reconstructable physically

Narrator continuity lives in Setta-owned durable state, not only in a model
thread. The narrator has a durable cursor, checkpoint, prior outputs, current
focus, and topic descriptor per conversation.

The first implementation uses fresh schema-constrained narrator model calls.
Every call is rehydrated from the authoritative trajectory and previous
narration state. A persistent provider narrator thread is not required for
correctness and is not part of this plan. It may be evaluated later only as a
measured latency or cost optimization.

### Narration has distinct presentation channels

Do not overload one `highlights` array with every kind of narrator output.
Narration is a discriminated union:

- `milestone`: a sparse automatic phase change suitable for the NOW rail
- `status_reply`: a direct answer to a user asking what is happening
- `final_summary`: the terminal result for one agent turn
- `topic_descriptor`: retrieval metadata describing the conversation

A short or single-phase task may legitimately produce no working milestone. If
the product later wants periodic spoken updates regardless of phase change,
that is a separate `status_update` policy and event type, not a relaxation of
milestone semantics.

### Voice is global

One application-level speech coordinator owns the microphone lease,
transcription lifecycle, global enablement, playback queue, preemption, and
source attribution. Easy Button panes render controls and state but do not own
capture or playback controllers.

### Presentation identity belongs to the conversation

The master has one app-global speech identity. Each topic conversation owns a
stable presentation profile containing its narrator voice selection and color
palette. The identity is independent from the narrator model and from pane
instances:

- two panes showing the same conversation use the same palette and narrator
  voice
- different concurrently visible conversations use different palettes when
  the palette catalog has capacity
- the master voice is reserved, and active narrator voices differ from it and
  from one another when the synthesis catalog has capacity
- assignments survive pane close/reopen and application restart
- exact user overrides remain exact; automatic assignment is an explicit
  selection mode rather than a silent fallback

Voice and color catalogs are finite. When there are more simultaneously active
conversations than available choices, the allocator records and exposes the
reuse instead of pretending uniqueness. Titles, status labels, source
attribution, and accessible contrast remain required; neither voice nor color
is the sole identifier.

### Models are configured by role

There is no cross-role model inheritance. Agent, narrator, master, and side
agent profiles resolve independently. Model availability and reasoning efforts
come from the provider model catalog. Missing or unsupported configured models
fail loudly with an actionable configuration error; Setta does not guess a
replacement from model-name strings.

### Functional correctness precedes visual refinement

The current application appearance is an acceptable starting point. Further
mockup iteration, pixel-level parity with an existing mockup, broad restyling,
and screenshot matching are not implementation priorities or acceptance
gates. Preserve existing visual language where practical and add only the UI
needed to make new behavior, state, errors, and controls understandable.

The implementation order is lifecycle correctness, persistence, concurrency,
recovery, observability, and production-path verification before nonessential
visual polish. Accessibility, legibility, and large-DOM performance remain
requirements because they affect functional use. The basic conversation color
identity is implemented with semantic tokens; refining those palettes later
must not block the architecture cutover.

### The PWA is frozen but retained

The existing PWA is outside this plan's product and acceptance scope. Do not
spend implementation effort on PWA feature parity, replacement wiring, repair,
or PWA-specific acceptance coverage. PWA behavior is not a release gate for
this desktop architecture cutover.

This plan also does not delete the PWA. Retain its entrypoint, manifest,
service worker, web build, and web-app serving path. Obsolete fixtures or
contracts coupled only to a deleted product path may be removed without
building PWA replacements. Any eventual PWA removal belongs to a separate
future plan.

### Local and remote runtime connectivity survives

Retain the generic local/remote Setta connection boundary: runtime pairing,
runtime registry, runtime picker, shared connection state and transport,
external-backend attachment, and their account/auth/settings ownership. Pane
and product deletion may remove feature-specific events or handlers from these
surfaces, but it must not remove or desktop-localize the underlying ability to
connect to either a local or remote runtime.

### Clean persistence break

The new conversation store uses a new schema and namespace. Existing chat,
Easy Run, workflow, semantic graph, terminal, and workspace-layout files are
not imported or read. The implementation does not delete user files
silently—it simply does not treat the old application state as valid input.
Development and acceptance environments start with fresh app data.

## Explicit Non-Goals

This plan does not include:

- further mockup design work, pixel-perfect visual parity, or a broad visual
  redesign as a prerequisite for functional acceptance
- migration or import of existing chat or Easy Run history
- compatibility endpoints for old renderer builds
- a chat-transcript pane under a new name
- a manual terminal pane
- a workflow graph or workflow execution engine
- a git graph pane
- preservation of semantic graph/cartographer APIs for possible future reuse
- heuristic topic routing based on keywords alone
- heuristic highlight generation
- a narrator that reads private chain-of-thought
- an always-privileged global master
- a provider-neutral abstraction with speculative implementations; Codex is
  the provider, while the domain remains insulated from Codex identifiers and
  wire payloads
- automatic creation of a new conversation when routing confidence is
  genuinely ambiguous; the master asks a clarification question instead
- speech wake-word selection or continuous-listening privacy UX details beyond
  the ownership and lifecycle boundary needed by the architecture
- PWA feature work, PWA parity, PWA-specific acceptance, or deletion of the
  retained PWA
- removal of local/remote runtime pairing, discovery, selection, or connection
  infrastructure
- guaranteed globally unique voices or colors across an unbounded conversation
  archive; uniqueness is best-effort among simultaneously active/visible
  conversations and explicit reuse is allowed when a finite catalog is
  exhausted

## Current-State Findings That Require The Refactor

The current repository cannot express the target behavior without changing
its primary ownership boundaries:

- `internal/easyrun/service.go` rejects a new start when any Easy Run is working
  in the workspace.
- `internal/chat/service_easyrun.go` creates a fresh internal conversation for
  every request.
- `internal/easyrun/store.go` exposes the latest run snapshot per workspace,
  not a conversation-keyed collection.
- `desktop/src/renderer/src/workspace-layout/workspace-scene.ts` limits
  `easy-button` to one pane.
- `WorkspacePane` has a `surfaceKind` but no conversation binding.
- `desktop/src/renderer/src/stores/easy-run-store.ts` is a singleton keyed by
  the selected workspace and latest run.
- `internal/chat/codex_harness_structured.go` starts a new ephemeral Codex
  thread for every narrator call.
- `internal/easyrun/narrator_digest.go` reduces streamed activity into bounded
  first-line digest entries and triggers calls by entry count and elapsed time.
- `internal/easyrun/narrator_runner.go` resolves the narrator model through the
  Easy Run agent settings and hardcodes narrator reasoning effort separately.
- `EasyButtonSurface` mounts its own speech capture and playback controllers.
- `desktop/src/renderer/src/App.tsx` owns one selected chat conversation and
  converts sidebar selection into focus of the singleton `chat-dom` surface.
- `desktop/src/renderer/src/components/workspace-sidebar.tsx` and its model are
  coupled to the old chat store, workflow rows, runtime shortcuts, and
  application-wide selection. The shell pane boundary is useful, but these
  contents cannot become the new conversation navigator by retaining their
  contracts.

The recording at `.recordings/20260711T172220Z` demonstrated the practical
effect: working narrator calls completed successfully but returned no
milestones, while the terminal narrator emitted the only milestone together
with the final summary. The logs were sufficient to diagnose the behavior. The
architectural problem is that the narrator saw lossy incremental fragments and
shared the agent's model selection, not that the renderer failed to display
events.

## Codex Capability Baseline

Current official Codex app-server documentation and the checked Codex source
at `/Users/kevin/Documents/AppDevelopment/reference_repos/codex` (inspected at
commit `2b9c050460`) expose the primitives this plan needs:

- `thread/start`
- `thread/resume`
- `thread/fork`
- `thread/inject_items`
- `thread/read`
- `thread/list`
- `thread/search`
- `turn/start`
- `turn/steer`
- `turn/interrupt`
- streamed thread, turn, and item notifications
- `model/list`

The checked upstream protocol schema also includes thread
fork/injection/list/search/read, pagination, parent/ancestor relationships, and
experimental realtime speech methods. Setta's current generated
supported-protocol registry intentionally allows only a subset and omits the
additional methods needed here.

The implementation must extend the Go-owned supported-protocol input and
regenerate the generated protocol output. Do not hand-edit
`internal/codexapp/protocol_gen.go` or generated TypeScript.

Codex's `/side` and `/btw` commands are TUI presentation behavior, not a
documented app-server `side` RPC. The source implementation is nevertheless a
direct reference design: it creates an ephemeral `thread/fork`, applies hidden
side-specific developer instructions, injects a boundary item, keeps inherited
history available to the model while hiding it from the child transcript, and
discards the child when normal navigation leaves it. The command remains
available while the parent task is running.

Setta owns the product semantics and presentation, but it should reproduce
that provider lifecycle instead of inventing a synthetic side protocol. Codex
TUI currently inherits the parent model, effort, and service tier for `/side`;
Setta deliberately overrides those values through the explicit `side_agent`
role profile so role configuration remains independent.

Sources:

- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Codex built-in slash commands](https://learn.chatgpt.com/docs/developer-commands#built-in-slash-commands)
- Codex source: `codex-rs/tui/src/app/side.rs`
- Codex protocol: `codex-rs/app-server-protocol/src/protocol/v2/thread.rs`

`thread/read` and provider rollout history are useful for reconciliation, but
they do not replace Setta's live normalized trajectory. The narrator must be
able to observe in-flight work, Setta artifacts, routing decisions, and
application state that are not guaranteed to be represented as complete
provider history.

## Target Architecture

```text
Global microphone / shell master text input
                   |
                   v
             Master actor
                   |
        deterministic candidate retrieval
                   |
                   v
         typed RouteDecision
             /           \
            v             v
 Conversation registry   Pane coordinator <--- Left conversation navigator
            |             focus/open view       ^
            |                                   |
            +---------- topic projections ------+
            |
            v
 Topic conversation actor
      |              |
      v              v
 Agent runtime    Narrator projector
      |              ^
      v              |
 Codex thread -> Trajectory ledger
                         |
                         v
                 Narration event stream
                    /             \
                   v               v
          Easy Button panes   Global speech queue
```

### Backend package boundaries

The target package layout is:

```text
internal/codexapp
  low-level app-server process, session, generated protocol, JSON-RPC

internal/agent
  Codex thread runtime, turns, steering, cancellation, approvals,
  provider notification normalization, liveness, model catalog

internal/conversation
  topic conversation aggregate, turns, artifacts, trajectory ledger,
  persistence, event stream, snapshots, branch relationships, presentation
  profile persistence

internal/narration
  narrator context builder, durable state, actor mailbox, triggers,
  structured output validation, narration events

internal/conversationindex
  global topic cards, full-text candidate retrieval, recency ranking,
  optional future semantic retriever seam

internal/master
  durable master session, route-decision schema, candidate orchestration,
  conversation commands, renderer presentation intents

internal/speech
  provider capabilities and voice catalog, voice assignment, transcription
  sessions, generic synthesis, source-aware speech contracts

internal/workspaceui
  surviving pane/layout contracts, accessible palette catalog/allocation, typed
  conversation pane config
```

Avoid a generic `common`, `shared`, or global constants package. Event kinds,
role values, branch kinds, and status values live at their owning domain
boundary and are exported through generated contracts when needed.

### Frontend ownership

The renderer target is:

```text
application shell
  global speech store/controller
  one master input/presentation controller shared by voice, text, launcher,
  shortcut, and overlay
  workspace and pane coordinator

ConversationNavigator
  shell-owned, virtualized rows keyed by durable conversationId
  groups conversations by workspace and displays execution/pane status
  renders the conversation's stable palette identity without relying on color
  alone
  focuses an existing pane or requests a new Easy Button view

conversation stores
  normalized Map<conversationId, ConversationProjection>
  event cursors keyed by conversationId

EasyButtonSurface
  receives conversationId from pane config
  selects only that conversation's projection
  derives semantic color tokens from the conversation presentation profile
  emits conversation commands
  renders focus, milestones, artifacts, summary, approval/status controls
```

The conversation store may be one normalized Zustand store or narrowly split
stores, but it must not create one hook/controller instance per conversation
that subscribes to an unbounded global event stream. Event application is
keyed, batched, and push-driven to preserve large-DOM performance.

## Domain Model

The Go domain owns these conceptual records. Exact field names may change while
implementing the first generated contract, but the ownership and relationships
are settled.

### TopicConversation

```text
TopicConversation
  id
  workspaceId
  title
  topicDescriptor
  status: idle | working | waiting_for_approval | failed
  createdAt
  updatedAt
  archivedAt
  parentConversationId?
  branchKind?: fork
  forkedAtTurnId?
  agentThreadBinding?
  roleOverrides
  presentationProfile
```

`status` describes conversation execution, not pane visibility. Completion of
one turn returns the conversation to `idle`; it does not complete the
conversation permanently.

An ephemeral side interaction is not a `TopicConversation` and never acquires
a topic-index document merely because a provider thread exists for it.

### SideConversation

```text
SideConversation
  id
  parentConversationId
  parentPaneId
  providerThreadId
  sourceProviderTurnId?
  sourceTrajectorySequence
  status: preparing | active | disposing | failed
  resolvedSideAgentInvocation
  createdAt
```

This is a lifecycle child of a parent conversation/pane association, not a
durable topic aggregate. Persist enough state to recover or clean up an
interrupted disposal and retain an audit record, but do not surface it through
normal conversation list/search contracts. A later explicit promotion feature
would create a new durable fork; it would not mutate this record into a topic
conversation.

### ConversationTurn

```text
ConversationTurn
  id
  conversationId
  authoredInput
  delivery: normal | queued | steering
  status: queued | running | completed | cancelled | failed
  startedAt
  endedAt?
  requestedRoleProfile
  resolvedInvocation
  providerTurnId?
  error?
```

There is at most one running primary turn per conversation. Queued turns and
steering are scoped to the conversation, not the workspace. Different
conversations may run in parallel.

### AgentThreadBinding

```text
AgentThreadBinding
  conversationId
  provider: codex
  threadId
  status: linked | missing | unavailable
  createdAt
  lastResumedAt
  lastTurnId?
  providerMetadata
```

The binding is replaceable provider state. If reconciliation proves it missing,
the conversation exposes a typed unavailable state. Do not silently start an
unrelated fresh thread under the same conversation.

### TrajectoryEvent

```text
TrajectoryEvent
  id
  conversationId
  turnId
  sequence
  emittedAt
  kind
  actor
  providerEventId?
  providerThreadId?
  providerTurnId?
  payload
```

The initial normalized event union includes:

- user input accepted
- turn queued, promoted, started, steered, interrupted, completed, failed
- agent public text delta and completed message
- public reasoning summary update
- plan created or changed
- tool/command started, progressed, completed, or failed
- file change proposed or completed
- approval requested and resolved
- subagent started, updated, and completed
- artifact emitted
- liveness or provider lifecycle changed
- model rerouted

Large tool output is stored separately and referenced by typed metadata. The
narrator context builder receives bounded, complete representations rather
than arbitrary byte chunks.

Raw provider payloads may be retained in diagnostic recordings when safe, but
renderer and narrator contracts consume only normalized events.

### NarratorState

```text
NarratorState
  conversationId
  observedThroughSequence
  checkpointThroughSequence
  checkpointText
  currentFocus
  currentFocusRevision
  topicDescriptor
  lastInvocationAt?
  status: ready | running | degraded
  degradation?
```

Milestones, status replies, and final summaries are separate immutable records
with source sequence ranges. Previous narrator output is never reconstructed
from rendered DOM or synthesized audio.

`observedThroughSequence` is specifically the contiguous working/terminal
projection cursor. It is not the highest sequence a read-only status request
has inspected. `checkpointThroughSequence` can advance only within that
contiguous observed prefix.

### RoleProfile

```text
RoleProfile
  role: master | agent | narrator | side_agent
  provider: codex
  modelSelection
  reasoningEffort
  serviceTier?
  permissionProfile
  contextBudget
```

`modelSelection` is either an exact provider model id or an explicit
`provider_default` mode where that role permits it. Narrator defaults must use
an exact lightweight model selected by the release configuration; they must not
inherit `provider_default` from the agent.

Resolved invocation metadata is captured at every turn so later settings
changes do not rewrite history.

### ConversationPresentationProfile

```text
ConversationPresentationProfile
  conversationId
  paletteSelection: auto_distinct | exact
  resolvedPaletteId
  narratorVoiceSelection: auto_distinct | exact
  resolvedNarratorVoiceId?
  narratorSpeechEnabled
  updatedAt
```

The profile is created with the conversation and persists independently from
pane layout and narrator process/session lifetime. `auto_distinct` uses the
backend-owned catalog and allocator; `exact` records a user selection and fails
specifically if that selection is unavailable. Automatic re-resolution after
a provider voice-catalog change is allowed only because the user selected an
explicit automatic mode, and every resolved change is logged.

The application shell owns the corresponding global master voice selection.
The narrator voice allocator excludes the resolved master voice and voices
already assigned to other active narrators when possible. The palette
allocator avoids palettes already used by other visible conversations when
possible. Catalog exhaustion produces an explicit reused assignment with a
reason.

### Pane configuration

`WorkspaceUIPane` gains an Easy Button-specific discriminated configuration:

```text
EasyButtonPaneConfig
  conversationId
```

Palette and voice are deliberately absent from pane configuration. They are
resolved from the conversation presentation profile so duplicate views cannot
drift into different identities.

Do not add a generic untyped `metadata` bag. Terminal and workflow configuration
fields are deleted with their surface kinds.

## Persistence And Transactions

Use a Setta-owned SQLite database for the new local conversation system. This
is justified by concurrent actors, atomic narrator cursors, global search, and
multi-record lifecycle transitions that are brittle across independent JSON
files.

SQLite gives this system ACID transactions and full-text search, not
concurrent writes. The conversation, narrator, and master actors are
concurrent readers but share one serialized writer. Open the database in WAL
mode with one dedicated write connection fed by a bounded, context-aware write
queue and a separate bounded read pool; do not give each actor a write
connection. Apply and verify connection-scoped pragmas, including a bounded
`busy_timeout`, on every applicable connection.

Write jobs contain only short database work. They never wait on a model,
provider, renderer, speech, or other external operation while holding a
transaction, and they never call back into an actor from inside the writer.
Queue admission has explicit backpressure and cancellation, and shutdown
drains or rejects pending writes deterministically. Simultaneous completion of
multiple conversations must serialize at that writer without exposing raw
`SQLITE_BUSY` or `database is locked` errors to callers.

The initial schema includes logical tables for:

- conversations
- conversation branches
- ephemeral side-conversation lifecycle/audit records
- thread bindings
- turns and queued inputs
- trajectory events
- artifacts
- narrator state
- narration events
- topic index documents
- role profile overrides
- conversation presentation profiles and the global master voice selection
- master session and route decisions
- persisted pane bindings/layout references

Use an append-only trajectory plus transactional current-state projections; do
not force every setting or layout operation into full event sourcing.

Critical transactions include:

1. Persist accepted input, create/queue a turn, and append the corresponding
   trajectory event.
2. Apply a normalized provider notification, update turn state, and append its
   trajectory event.
3. Persist working/terminal narrator projection output and its permitted
   `observedThroughSequence` advance atomically; persist a status reply without
   changing that projection cursor.
4. Persist a narrator checkpoint and advance `checkpointThroughSequence`
   atomically without changing `observedThroughSequence`.
5. Create a conversation branch and its provider binding atomically after the
   provider fork succeeds.
6. Apply a master route decision and persist the resulting conversation command
   before emitting a presentation intent.

Publication uses an in-process outbox/event-hub boundary sourced from committed
records. A crash may replay a committed event, so consumers are idempotent by
stream id and sequence. A crash must not advance a narrator cursor without its
corresponding narration records.

The new database starts at schema version 1. This plan includes schema creation,
not migration from legacy stores. If a new direct dependency is needed for
SQLite, pin it exactly through `./update_dependencies.sh` and run the supply
chain gate required by repository policy.

## Agent Runtime

Replace the presentation-oriented `chat.Harness` surface/mode abstraction with
a thread runtime focused on provider operations:

```text
ListModels
StartThread
ResumeThread
ReadThread
ListThreads
ForkThread
StartTurn
SteerTurn
InterruptTurn
SubmitApproval
ReconcileTurn
SubscribeEvents
```

The interface remains Codex-shaped where that reflects real capabilities; do
not invent support for other providers. Domain callers receive Setta types,
not app-server JSON objects.

Preserve and rehome the difficult existing behavior that remains load-bearing:

- app-server process/session management
- strict protocol validation and generated decoders
- turn notification scoping
- steering and cancellation
- liveness and restart reconciliation
- approvals and structured user input
- provider model catalog and supported efforts
- command/file/tool/subagent lifecycle normalization
- background process cleanup required for an agent-created process

Delete chat-transcript presentation projections, composer history, read
markers, pinning, message pagination, slash-command UI machinery, and manual
background-terminal inspection endpoints.

Agent background processes are not the manual Terminal pane. Retain only the
provider lifecycle needed to stop, reconcile, and report processes started by
an agent. Surface their meaningful state through normalized trajectory and
typed controls.

## Narrator Architecture

### Actor and cursor

Each topic conversation has one narrator mailbox. The mailbox serializes:

- automatic projection requests
- explicit status questions
- terminal projection
- checkpoint generation
- retry after recoverable provider failure

Only the actor may advance narrator state. A terminal event queued behind an
in-flight working projection is processed next; it does not start a competing
goroutine and wait on ad hoc channels.

Mailbox priority is explicit: terminal and approval-required projection,
explicit status, other automatic projection, recoverable retry, then checkpoint
maintenance. Checkpoint generation starts only while no higher-priority work
is pending. If higher-priority work arrives during a checkpoint model call, the
actor cancels or supersedes that call and invalidates its generation token; a
late checkpoint response cannot commit. State commits remain serialized, and
there is at most one commit-eligible narrator invocation per conversation.

### Context materialization

Every working or terminal projection call receives a
`NarratorContextBundle` assembled from the authoritative store:

```text
conversation identity and topic
current user objective and all still-applicable constraints
active turn input and accepted steering
latest durable checkpoint of older trajectory
all normalized events after that checkpoint within the context budget
current plan and active tool/approval/subagent states
artifact metadata
prior current focus
all prior milestones for the active turn
prior final summaries needed for conversation continuity
invocation trigger and requested output channel
```

A status call receives a separate read-only `NarratorStatusContext` containing
the authoritative current objective, constraints, plan, active
tool/approval/subagent state, artifact metadata, current focus, latest bounded
events, and recent summaries needed to answer the question. It may omit an old
unobserved middle range during backlog catch-up because it does not advance the
projection cursor. Any omitted range is represented explicitly in the bundle;
the model is never shown noncontiguous events as though they were contiguous.
Checkpoint calls use the separate historical compaction schema below.

Context trimming is deterministic and typed:

1. Never remove current user constraints or unconsumed steering.
2. Prefer complete recent events over text-delta fragments.
3. Replace older covered events with the durable checkpoint.
4. Preserve prior narration needed for novelty decisions.
5. Fail loudly when required context alone exceeds the configured budget.

Do not use keyword rules, first-line extraction, or command-name matching to
fabricate a semantic phase.

### Checkpoint generation

`checkpointText` is produced by the narrator actor itself, not a separate
process. It is allowed only over a contiguous trajectory prefix the narrator
has already evaluated. The state invariant is:

```text
checkpointThroughSequence <= observedThroughSequence <= latestTrajectorySequence
```

When already-observed trajectory after `checkpointThroughSequence` grows past
a configured event or token bound, the actor issues a dedicated
schema-constrained checkpoint call that folds the prior checkpoint and a
complete contiguous range ending at or before `observedThroughSequence` into a
new bounded historical summary. It must never cover an unobserved event. The
new `checkpointText` and advanced `checkpointThroughSequence` commit in one
transaction without advancing `observedThroughSequence`.

Checkpoint output is a separate strict schema:

```text
CheckpointOutput
  coveredThroughSequence
  historicalSummary
```

`coveredThroughSequence` must equal the requested contiguous range end, the
summary is size-bounded and non-empty, and unknown fields are rejected. The
schema has no field capable of updating the current objective, constraints,
steering, focus, milestones, status reply, final summary, or topic descriptor.

The checkpoint call receives the current objective and still-applicable
constraints so it can interpret historical events, but those fields remain
separate authoritative inputs. The checkpoint schema is historical context and
cannot redefine, preserve as current, or override an objective, constraint, or
steering instruction. A context bundle always labels the checkpoint as
historical and states that the current structured fields win.

If an outage creates more unobserved trajectory than fits in one context
window, recovery evaluates contiguous bounded windows in sequence and advances
`observedThroughSequence` atomically with any narration output before those
events become checkpoint-eligible. It never jumps to the newest events by
summarizing across an unobserved gap. A status-only request may use the
authoritative current-state projection while catch-up is pending, but it does
not advance `observedThroughSequence` across omitted events.

Checkpoint generation is low-priority serialized maintenance. A failed,
cancelled, superseded, or stale-generation call retains the prior checkpoint
and retries without advancing either cursor or fabricating a summary. Current
required fields plus the latest checkpoint that still exceed the budget fail
loudly rather than truncating silently.

### Triggers

Trigger reasons are typed and logged:

- `progress_window_elapsed`
- `plan_changed`
- `phase_activity_completed`
- `approval_required`
- `user_steered`
- `explicit_status_requested`
- `turn_terminal`

Event triggers are debounced through the actor. Time windows use scheduled
timers, not polling. A trigger asks the narrator to evaluate the accumulated
trajectory; it does not guarantee a milestone.

`checkpoint_window_exceeded` is a separate typed maintenance reason. It is
logged and scheduled through the mailbox but is not a user-visible projection
trigger and cannot itself emit a milestone, status reply, or final summary.

### Structured output

Narrator projection output is a strict discriminated union rather than one
object with optional cross-channel fields:

```text
NarratorCallOutput =
  working_projection(
    observedThroughSequence,
    currentFocus,
    milestones[],
    topicDescriptor?
  )
  | terminal_projection(
      observedThroughSequence,
      currentFocus,
      milestones[],
      finalSummary,
      topicDescriptor?
    )
  | status_reply(
      sourceThroughSequence,
      statusReply
    )
```

Working and terminal projections receive a complete contiguous range beginning
after the durable projection cursor. Their observed sequence must fall within
that supplied range, and committing their output advances
`observedThroughSequence` atomically. A status call is a read-only query over
the supplied current-state/status bundle: it persists an immutable reply and
source sequence but never advances the projection cursor, changes current
focus, or suppresses later milestone evaluation.

Validation additionally requires:

- terminal projections emit exactly one non-empty final summary
- status calls emit exactly one non-empty status reply and no projection fields
- milestones are short, voice-ready, and bounded per call
- projection current focus is non-empty and bounded
- no unknown fields

Previous milestones are always supplied to projection calls. An exact duplicate
milestone for the active turn is rejected. A requested status reply may
legitimately restate an unchanged status; do not reject or rewrite it merely
because its text matches an earlier reply. Semantic milestone novelty remains
the narrator's decision rather than a string-similarity heuristic.

### Failure behavior

Narrator failure never fails or cancels the agent turn. It produces a typed
degraded narrator state with a diagnostic reference. The UI says narration is
temporarily unavailable and retains the last valid projection. It does not
generate a mechanical replacement highlight or pretend the agent stopped.

An explicit user status request receives a clear failure response if narration
cannot run. It is not silently rerouted to the workspace agent.

## Master And Routing Architecture

### Shell master surface

The global master surface is one shell-owned interaction controller with
multiple entry points:

```text
left-pane Ask Setta launcher ---+
global keyboard shortcut -------+--> master overlay --> MasterInput
app-chrome master control ------+
global voice transcription -----+
```

The compact left-pane control is always above the scrollable conversation
list. It may accept a short one-line submission directly, but focus or a
multi-line request expands the overlay. The overlay retains the recent master
exchange, candidate/route result presentation, and unresolved clarification so
it behaves conversationally rather than like a fire-and-forget command
palette. Collapsing or reopening it does not create or resume a different
provider thread.

Every submission normalizes into one contract containing input id, text,
modality (`text` or `voice`), timestamp, and optional focused workspace,
conversation, and pane hints. Routing behavior does not diverge by modality.
The renderer may show interim voice transcription, but only a finalized
submission enters master history.

The master surface is not a topic conversation and does not appear as a row in
the conversation navigator. Its recent transcript and audit information are
available from the overlay.

### Master session

The master is app-global for the local Setta runtime/user. It has a durable
Codex thread plus Setta-owned route history and application context. Its model
profile is independent from every workspace conversation. A per-workspace
master was considered and rejected: routing is inherently a cross-workspace
concern, and one master session keeps global topic retrieval and
disambiguation coherent. The focused workspace is a routing hint, never a
partition.

The master sees compact application state:

- open workspaces
- focused workspace and pane
- open conversation-pane bindings
- active topic conversations and statuses
- candidate topic cards returned by the conversation index
- recent master route decisions

It does not receive arbitrary full workspace trajectories unless it explicitly
asks a topic narrator for a compact status.

### Conversation index

Setta owns a global index containing one topic card per durable conversation:

```text
conversationId
workspaceId and workspace name
title
topicDescriptor
recent user requests
recent final summaries
updatedAt
active status
open pane ids
```

The first implementation uses SQLite full-text search plus deterministic
recency and workspace filters to produce a bounded candidate set. The master
reranks and selects from those candidates. An embedding-backed retriever may be
added behind `conversationindex` later, but the plan does not add a fake
semantic score or preserve the current semantic graph as a substitute.

Codex `thread/list`, its title `searchTerm`, and full-text `thread/search` are
reconciliation and provider-discovery tools. They do not replace the Setta
conversation index.

The left conversation navigator reads this Setta-owned index/projection rather
than listing raw Codex threads. Semantically every non-archived durable
conversation is available, while the visible UI may prioritize pinned,
working, waiting, and recent rows and retrieve older rows through search or
incremental paging. Grouping by workspace remains useful because topic agents
operate against workspace roots; global search may cross those groups.

Each row exposes title, recency, running/waiting/error or unread state, durable
fork lineage, and whether an Easy Button pane is already open. Clicking a row
is a deterministic navigation command, not a model-routing request: focus the
last-focused existing pane or open one. The master uses the same validated
presentation command after a route decision.

### Route decision

Master output is strict, typed, and auditable:

```text
RouteDecision =
  send_to_agent(conversationId, authoredInput)
  ask_narrator(conversationId, question)
  focus_conversation(conversationId)
  create_conversation(workspaceId, initialInput, proposedTitle)
  create_side_conversation(parentConversationId, input)
  fork_conversation(parentConversationId, forkedAtTurnId, input)
  clarify(question)
  answer_global(text)
```

The backend validates that referenced conversations and workspaces exist and
that the requested operation is allowed. The model does not emit renderer DOM
commands or arbitrary endpoint names.

Each decision records:

- input transcript/text and source
- focused conversation hint
- candidate ids and compact scores
- chosen action and target
- requested and resolved master model/effort
- provider request/response ids
- timing and error

Do not rely on a self-reported confidence number as proof. Deterministic policy
requires clarification when the candidate set and action are ambiguous.

### Presentation intents

Routing and presentation are separate effects. A successful backend command
emits a typed renderer intent:

```text
focus_existing_conversation_pane
open_conversation_pane
open_side_conversation_in_parent_pane
show_master_reply
```

The renderer pane coordinator applies the intent against the current layout.
If there is no live window, conversation work remains valid and the
presentation intent may be delivered when a renderer reconnects. The backend
does not mutate persisted workspace layout by pretending to be the renderer.

## Side Conversations And Forks

Use separate domain meanings:

- **Fork:** a durable child topic conversation indexed and independently
  pane-addressable. Its agent thread starts with parent history through a
  completed turn using `thread/fork`.
- **Side conversation:** an ephemeral child associated with a parent pane and
  fork point. It is not included in global topic retrieval and does not append
  messages or model output to the parent thread.

The side agent has its own explicit role profile. It does not inherit narrator
or primary-agent settings implicitly, even though the Codex TUI currently
inherits its parent model settings.

For an ephemeral side conversation, reproduce the checked Codex TUI lifecycle:

1. Call `thread/fork` without `lastTurnId`, with `ephemeral: true` and the
   resolved `side_agent` model, permissions, service tier, and developer
   instructions.
2. Inject the explicit side-conversation boundary through
   `thread/inject_items` before accepting the side user's turn.
3. Keep forked history in provider context but omit it from the rendered side
   transcript.
4. Record the source provider thread and Setta trajectory sequence visible at
   branch creation, and keep the parent status observable while the side is
   active.
5. Dispose the ephemeral provider thread and pane association when the user
   leaves the side conversation according to the declared lifecycle policy.

The Phase 2 live characterization established a real public-context gap in the
pinned provider behavior: an active-turn fork contains the current user input
and public assistant commentary, marks the cloned in-flight turn interrupted,
and omits the active command item. Later parent output does not enter the child
snapshot and the parent continues without interruption. Because the gap is now
proven, the side lifecycle injects a typed `SideInFlightContextFrame` together
with the boundary before accepting the side user's turn. The frame is built
from the authoritative normalized trajectory and contains the source sequence,
current objective and steering, current plan, active activity metadata,
approval state, and artifact metadata. It never includes private reasoning,
raw tool output, or a heuristic digest. The exact live evidence is recorded in
[the Phase 2 active-fork report](../reports/topic-conversations-phase2-active-fork-20260711.md).

Promotion of an ephemeral side conversation into a durable fork is deferred.
Do not add replay, copy, or compatibility machinery for it in this plan.

## Global Speech Architecture

### Capture

Move capture ownership out of `features/easy-button` into an application-shell
speech controller. One controller owns:

- microphone permission and device errors
- one active media stream/track lease
- transcription session creation and teardown
- global enabled/disabled preference
- capture state and transcript preview
- submission of completed text to the master
- explicit cancellation on runtime disconnect or sign-out

The transcription endpoint becomes app-global. It is not parameterized by the
currently selected Easy Run. Runtime/auth identity remains explicit.

The plan does not settle whether global enablement means push-to-talk, local
voice activity detection, or a wake phrase. Those UX decisions must not change
the ownership boundary or create one microphone controller per pane.

### Playback

One playback coordinator subscribes to narration and master speech intents. It
owns:

- synthesis request cancellation
- audio caching and URL lifecycle
- one ordered queue across conversations
- master and per-conversation narrator voice resolution
- source identity and UI speaking state
- global mute/output mode
- user-requested replay
- preemption and supersession

Initial priority order:

1. Direct user-requested status reply or master answer
2. Approval/error requiring user attention
3. Final summary
4. Automatic milestone

A final summary may supersede an unplayed milestone from the same turn when the
summary covers that milestone. The decision and reason are logged. Output from
different simultaneous conversations is never silently dropped; it remains
queued or is announced with topic attribution according to explicit policy.

Every speech intent identifies `master` or `narrator`, and narrator intents
carry `conversationId`. The coordinator resolves the global master voice or
the conversation's narrator voice before synthesis. The resolved voice remains
stable across reloads while it is available. Automatic assignment prefers a
voice different from the master and other active narrators; finite-catalog
reuse is explicit, retains topic attribution, and is recorded.

An unavailable exact voice produces a typed speech-configuration error rather
than silently changing the speaker. An `auto_distinct` selection may resolve
again against a changed provider catalog because that behavior is part of the
declared selection mode; the old/new voice and reason are observable.

Synthesis endpoints become generic narration/master speech endpoints keyed by
source event id. Delete endpoints named specifically for Easy Run highlights
and summaries.

### Experimental Codex realtime speech

Keep the speech provider boundary independent from Codex thread realtime. The
checked protocol contains experimental realtime methods, but this plan keeps
the existing separate transcription/synthesis architecture until those methods
are intentionally evaluated. Do not add an unused adapter or feature flag.

## Model, Voice, And Permission Configuration

### Resolution precedence

Each role resolves independently through:

```text
built-in role default
  -> user-global role override
  -> workspace role override
  -> conversation role override
```

Master has no workspace override unless the master is explicitly executing
within a workspace-scoped subcontext. Narrator and side-agent profiles may be
overridden per conversation.

### Defaults

Release configuration owns exact provider-specific defaults:

- primary agent: heavy/capable model, higher reasoning effort, workspace
  permission profile
- narrator: explicit lightweight model, low or none reasoning effort, no tools,
  no approvals, read-only supplied context
- master: capable general model, restricted Setta management capabilities
- side agent: explicit model and restricted capabilities suitable for focused
  follow-up

Do not hardcode model ids in renderer code or scatter them across Go packages.
The backend role-configuration boundary owns defaults and exposes generated
views. Validate defaults against `model/list` at configuration read/update and
before starting a new provider thread.

### Effective invocation audit

Every master, agent, narrator, and side call records:

- role
- requested model, effort, service tier, and permission profile
- resolved model, effort, service tier, and permission profile
- provider model reroute notification, if any
- input/context byte and token estimates
- provider thread/turn/request/response ids
- start/end timestamps and outcome

This metadata is available in logs and recording artifacts without exposing
chain-of-thought.

### Voice and palette configuration

Speech capabilities expose the provider's typed voice catalog. Presentation
configuration exposes the Go-owned accessible palette catalog. Its palette
ids, metadata, and renderer token data are generated; do not maintain a
handwritten TypeScript/CSS mirror of backend values. Settings allow:

- a global master voice selection
- the default narrator voice mode, initially `auto_distinct`
- a per-conversation exact or automatic narrator voice override
- a per-conversation exact or automatic palette override
- disabling narrator speech without disabling visual narration

The renderer consumes generated resolved presentation profiles. It does not
invent voice ids, palette ids, or collision policy.

## HTTP, IPC, And Generated Contracts

The endpoint registry remains the owner of HTTP request and response
contracts. Generate TypeScript from Go-owned contracts. Do not maintain a
separate endpoint/type list in the generator.

The replacement surface needs endpoints or streams for these operations:

### Conversation commands

- list/search topic conversations
- create/read/archive a topic conversation
- read a conversation snapshot
- send or queue a turn
- steer or stop the active turn
- submit an approval or structured input response
- ask the narrator for status
- create a side conversation
- fork a durable conversation
- read/update per-conversation role overrides
- read/update the conversation presentation profile
- subscribe to conversation events

### Master commands

- read master state
- submit global text/transcribed utterance
- subscribe to master replies and presentation intents
- cancel an active master operation

### Role configuration

- read role defaults and effective model options
- update global role defaults
- read model catalog and supported effort options

### Presentation configuration

- read the synthesis voice and accessible palette catalogs
- read/update the global master voice selection and default narrator voice mode
- read resolved voice/palette assignments and explicit reuse reasons

### Speech

- read speech capabilities
- create/cancel transcription sessions
- synthesize a typed narration/master source event

Conversation and master event unions have exhaustive payload branches. The
renderer uses generated decoders and `never` assertions for event handling.

Delete old chat, Easy Run, workflow, semantic graph, workspace activity, and
terminal endpoints from `internal/httpapi/endpoints.go`; do not leave handlers
registered but unreachable.

## Deletion Plan

Deletion is part of the architecture, not optional cleanup after the new
feature works.

Deleting a pane means deleting its complete unused vertical slice, not only
removing its renderer registration. For each old chat, terminal, workflow, git,
semantic-graph, and workspace-activity surface, inventory and remove associated
backend handlers, packages, event streams, IPC/preload contracts, generated
contracts, persistence, runtime wiring, commands, fixtures, and tests that have
no named surviving consumer. Shared code is retained only when the finished
product uses it directly; speculative future usefulness is not a consumer.

### Renderer and desktop deletion

Delete:

- `chat-dom` product surface and all chat panel, transcript, composer,
  chat-specific sidebar contents, chat command-palette, message-action, and chat
  store code; the replacement master overlay and conversation navigator are
  new shell-owned surfaces, not retained chat components
- `terminal` product surface, xterm adapter/session code, terminal profiles,
  terminal IPC/preload contracts, and terminal-specific CSS
- workflow graph, workflow settings, workflow node details, approval overlays,
  workflow stores, workflow IPC, and workspace activity projection UI
- git graph surface/worker/layout and diagnostic registrations intended only
  for that pane
- semantic node details and semantic graph projection UI when their backend is
  removed
- Easy Run singleton store and Easy Run-specific IPC/event forwarding
- Easy Button-owned speech hooks/controllers after their global replacements
  are connected
- toolbar actions, keyboard shortcuts, pane icons/titles, runtime policies,
  benchmark fixtures, snapshots, and tests for deleted surface kinds

Keep and simplify:

- the resizable/collapsible left application pane boundary, rebuilt around the
  conversation navigator and compact master launcher
- the workspace layout engine, compositor/runtime budgeting, drag/drop,
  overview, resize, and persistence machinery
- Easy Button presentation components that remain useful as pure projections
- settings and any separately retained browser surface
- the frozen PWA entrypoint, manifest, service worker, web build, and web-app
  serving path
- global runtime/workspace connection stores, including local/remote pairing,
  registry, picker, transport, and external-backend attachment

### Backend deletion

Delete:

- `internal/easyrun` after its replacement conversation/narration vertical slice
  is connected
- chat-specific storage and public presentation behavior in `internal/chat`
- `internal/orchestrator`
- `internal/terminal`
- `internal/semanticgraph`
- `internal/semanticcontext`
- `internal/workspaceactivity`
- workflow, semantic graph, chat, Easy Run, manual terminal, and workspace
  activity HTTP handlers, contracts, event streams, runtime wiring, seed tools,
  and tests
- old Chat Codex defaults once role profiles replace them
- old workspace selected-conversation state that existed only for the chat pane

Move—not wrap—the load-bearing Codex runtime pieces from `internal/chat` into
the new agent boundary. Once callers are cut over, delete the old package paths.
Do not leave type aliases or forwarding services to preserve old imports.

Review `internal/notify` independently. Retain a generic notification service
only if it has a product consumer after chat/workflow removal; otherwise delete
it. A chat observer is not kept merely in case it becomes useful.

### Persistence deletion

Remove code that reads or writes:

- chat conversation/message/run JSON trees
- Easy Run directories and latest snapshots
- workflow definitions/executions
- semantic graph/cartographer state
- workspace activity state
- terminal pane/session state
- old workspace layouts containing deleted surface kinds

Do not write a cleanup migration. Tests and development instructions use fresh
app data.

## Implementation Sequence

These phases describe dependency order on one cutover branch. They are not
permission to ship dual systems. Intermediate local work may temporarily have
old and new packages present, but no completed cutover or release may contain
dual reads/writes, compatibility endpoints, renderer feature flags, or adapters
between the old and new domains.

### Phase 0: Freeze scope and baseline

Before source changes:

1. Record the current deterministic Easy Button workflow and working-state
   frontend performance baseline. This is a behavioral/performance baseline,
   not a mockup-parity or screenshot-matching baseline.
2. Capture file/package/endpoint ownership inventories for the deletion diff.
3. Confirm ChatGPT-authenticated live Codex tests are available without
   `OPENAI_API_KEY`.
4. Record the current generated-contract hash and supported Codex protocol
   registry.
5. Confirm the exact release-time role defaults to use for master, agent,
   narrator, and side agent.
6. Capture the synthesis voice capabilities and approve the initial accessible
   conversation palette catalog; this is configuration inventory, not visual
   mockup work.

Exit criteria:

- baseline recordings and performance report exist
- deletion inventory is reviewed
- model defaults are explicit, available in `model/list`, and documented
- master/narrator voice selection modes and the palette catalog are explicit

### Phase 1: New persistence and core contracts

**Progress:** Complete.

Implement:

1. SQLite store bootstrap and schema version 1 in WAL mode with a dedicated
   writer connection, bounded write queue, bounded read pool, and verified
   connection pragmas including `busy_timeout`.
2. Conversation, turn, thread-binding, trajectory, artifact, narrator-state,
   narration-event, role-profile, presentation-profile, and branch domain
   types.
3. Transaction helpers and committed-event outbox.
4. Conversation snapshot/event contracts and generated TypeScript.
5. Focused store tests for atomic state/event/cursor transitions, corruption,
   concurrent actor writes, queue backpressure/cancellation, deterministic
   shutdown, and restart.

Do not connect old chat/Easy Run records to the new store.

Exit criteria:

- new state is created from an empty app-data directory
- old state is never read
- narrator output and cursor commit atomically
- generated contracts contain no manual mirrors
- concurrent actor writes serialize at the single writer without surfacing
  `SQLITE_BUSY`
- a cancelled or saturated write request has a typed outcome, and shutdown
  cannot silently discard an accepted write

### Phase 2: Codex agent runtime extraction

**Progress:** Complete. The live snapshot result requires the typed Phase 7
in-flight context frame specified above; the active side path is no longer
blocked on unknown provider behavior.

Implement:

1. Move app-server turn lifecycle behind `internal/agent`.
2. Add generated support for `thread/fork`, `thread/list`, `thread/search`, and
   `thread/inject_items`; regenerate.
3. Normalize provider notifications into trajectory events.
4. Preserve turns, queueing, steering, cancellation, approvals, liveness,
   restart reconciliation, model catalog, and necessary background-process
   cleanup.
5. Add provider protocol contract and fake-app-server tests.
6. Add a live Codex test that creates, resumes, reads, lists, searches, forks,
   and injects boundary items through the new runtime.
7. Establish, with deterministic and live tests against the pinned Codex
   revision, the exact active-turn `thread/fork` snapshot semantics that the
   Phase 7 side-conversation design depends on. Record which persisted and
   in-flight history items the child receives at the fork boundary, whether the
   parent continues without interruption, and confirm that later parent events
   do not leak into the child snapshot.

The scripted provider proves Setta's request and lifecycle handling but is not
evidence of live Codex snapshot behavior. If ChatGPT-authenticated live testing
is unavailable or the result is inconclusive, record the test as skipped and
leave the active-turn side path blocked. Completed-turn durable forks may
proceed. If live behavior exposes a context gap, revise Phase 7 explicitly as
required by the side-conversation section; do not make the fake provider
simulate the desired answer and call it proof.

Exit criteria:

- one durable topic conversation can run multiple sequential turns
- two conversations in one workspace can run concurrently
- restart/reload resumes or reports missing provider state explicitly
- no new code depends on chat presentation types
- live active-turn fork snapshot semantics are established and recorded, or
  the dependent Phase 7 path is explicitly blocked rather than assumed

### Phase 3: Conversation-keyed Easy Button cutover

**Progress:** Complete.

Implement:

1. Add `EasyButtonPaneConfig{conversationId}` to Go-owned workspace UI
   contracts and regenerate.
2. Replace the workspace/latest-run store with normalized
   conversation-keyed state.
3. Make `EasyButtonSurface` a pure projection of its pane's conversation.
4. Remove the one-Easy-Button pane limit.
5. Replace the selected-chat sidebar with the virtualized conversation
   navigator and deterministic focus-existing-or-open behavior.
6. Support create, send, queue, steer, stop, approval, artifact, terminal
   result, close pane, reopen pane, and reload through production paths.
7. Delete the old Easy Run store, service, endpoints, IPC, renderer store, and
   persisted shapes.

Exit criteria:

- two Easy Button panes show independent conversations and active runs
- closing a pane does not stop its conversation
- reopening/focusing a conversation restores its projection
- one navigator row represents the conversation even when multiple panes show
  it, and a conversation with no pane remains navigable
- no Easy Run endpoint, type, store, or persisted directory remains

### Phase 4: Narrator projector

**Progress:** Items 1-6 complete.

Implement:

1. Priority-aware narrator actor/mailbox per conversation with stale-generation
   invalidation for cancelled or superseded checkpoint work.
2. Durable context checkpoint, cursor invariants, ordered backlog catch-up, and
   deterministic context materialization.
3. Role-specific lightweight model resolution.
4. Typed triggers and schema-constrained fresh narrator/checkpoint calls.
5. Milestone, status reply, final summary, and topic descriptor persistence and
   events.
6. Typed degradation and retry behavior.
7. Explicit narrator-status command path that never steers the primary agent.

Exit criteria:

- every call logs its trigger, model, context range, prior-output counts, and
  result
- previous milestones are always in narrator context
- terminal projection cannot race a working projection
- checkpoint compaction never crosses `observedThroughSequence`, cannot hide an
  unevaluated milestone candidate, and a stale checkpoint response cannot
  commit
- current objective, constraints, and steering remain authoritative over
  historical checkpoint text
- explicit status and terminal work are not delayed behind checkpoint
  maintenance
- asking for status returns a narrator reply while the agent continues
- a narrator process/session failure can be recovered from Setta state

### Phase 5: Global speech cutover

Implement:

1. App-shell microphone controller and global preference.
2. Global transcription submission to the master boundary.
3. Typed provider voice catalog plus global master and per-conversation
   narrator voice selections.
4. Stable `auto_distinct` allocator, exact overrides, finite-catalog reuse, and
   explicit unavailable-voice behavior.
5. Generic speech synthesis contracts keyed by narration/master event and
   resolved speaker voice.
6. One source-aware playback queue with explicit priority and supersession.
7. Global speaking/capture state rendered by panes and app chrome.
8. Delete Easy Button-owned speech controllers, Easy Run speech endpoints, and
   pane-local playback subscriptions.

This phase targets the desktop app shell. Do not add or repair PWA speech
behavior or PWA-specific acceptance coverage, and do not delete the retained
PWA.

Exit criteria:

- microphone capture works with no Easy Button pane mounted
- opening or closing panes does not restart global capture
- narration from multiple conversations is queued and attributed correctly
- the master and active narrators use stable distinct voices when available;
  restart preserves assignments and finite-catalog reuse is visible
- recording preempts playback according to explicit policy
- highlights/final summaries/status replies have deterministic speech behavior

### Phase 6: Master and conversation index

Implement:

1. Topic-card index and bounded candidate retrieval.
2. Durable restricted master thread and role configuration.
3. One shell-owned master interaction controller accepting normalized voice and
   text input.
4. Compact left-pane launcher plus an expanded, conversational master overlay
   reachable by global shortcut and app chrome while the pane is collapsed.
5. Strict `RouteDecision` generation and validation.
6. Conversation commands and renderer presentation intents.
7. Pane focus/open coordinator behavior shared by master decisions and direct
   navigator selection.
8. Clarification behavior for ambiguous routing without dismissing the master
   overlay.
9. Route/model/context observability in desktop recordings.

Exit criteria:

- the master can find and open a recent topic by description
- it focuses an existing pane rather than duplicating it when policy says so
- global typed master input remains available when the left pane is collapsed
  and shares history/routing behavior with voice input
- unrelated work creates a new conversation only after an unambiguous route
- direct status questions route to the narrator, not the primary agent
- the master cannot invoke filesystem or shell mutation directly

### Phase 7: Side conversations and durable forks

Implement:

1. Durable fork through `thread/fork` at a completed turn.
2. Ephemeral `thread/fork` linked to parent and pane, using the resolved
   `side_agent` profile.
3. Side boundary injection and hidden inherited transcript matching the Codex
   source lifecycle.
4. Active-parent status projection, isolated events, disposal, and failure
   handling.
5. Parent/child presentation and durable-fork lineage controls.
6. Re-verification of the active-turn fork snapshot semantics established in
   Phase 2, now exercised through the full side-conversation lifecycle.

Exit criteria:

- side output never enters the parent agent thread or transcript history
- durable forks appear as independent indexed topic conversations
- side conversations are not returned by global topic search
- branch source turn/trajectory sequence is auditable
- no synthetic in-flight context fallback exists without an explicitly proven
  and designed provider gap

### Phase 8: Obsolete surface and backend eradication

Complete the deletion inventory and remove all remaining dead code:

1. Chat, terminal, workflow, git, semantic graph, and workspace activity
   renderer paths.
2. Backend packages, handlers, runtime wiring, seed commands, contracts, and
   generated types associated with deleted panes that have no surviving
   consumer.
3. Pane kinds/config fields, toolbar actions, shortcuts, runtime-policy
   branches, snapshots, CSS, assets, and tests.
4. Old app-data paths and test fixtures.
5. Temporary development scaffolding used during the cutover.

Run `rg` audits for deleted endpoint names, surface kinds, package imports, old
storage paths, and compatibility vocabulary.

Exit criteria:

- no old surface kind or endpoint is accepted
- no compatibility/migration/dual-path code remains
- no generated output contains removed contracts
- production and test builds contain only surviving product paths

### Phase 9: Hardening and acceptance

1. Exercise crashes and restarts during agent, narrator, master, speech, and
   branch operations.
2. Profile large numbers of conversation events and multiple Easy Button panes.
3. Validate audio arbitration under simultaneous conversation completions.
4. Audit permission boundaries and secret/raw-audio/log handling.
5. Run the functional deterministic and live production-path acceptance suites
   before presentation-identity polish.
6. Assign and apply one stable accessible palette per conversation, shared by
   duplicate panes and distinct among visible conversations when catalog
   capacity permits.
7. Run the focused palette identity, contrast, reload, and multi-pane tests;
   these validate the requested identity feature rather than mockup parity.
8. Record append-only before/after frontend performance results under
   `docs/reports/performance/`.
9. Refine conversation palette presentation only after functional acceptance;
   do not add a mockup-parity gate or expand this phase into broad restyling.

## Verification Plan

Repository verification rules apply throughout. Use `./scripts/go.sh` for Go
commands, generate contracts from owner-defined Go inputs, and never edit
generated output manually.

### Focused backend tests

Cover:

- conversation/turn state transitions
- concurrent conversations in one workspace
- serialized-writer queue backpressure, cancellation, shutdown, and absence of
  raw busy/locked errors under concurrent actor completion
- queue promotion and steering isolation
- provider thread start/resume/read/list/search/fork/item-injection
- provider event normalization and ordering
- approval and structured-input lifecycle
- cancellation/failure/restart reconciliation
- narrator context construction and deterministic trimming
- narrator cursor/output and checkpoint transaction atomicity
- checkpoint cursor ordering, contiguous coverage, failed/stale response
  rejection, and crash/retry behavior
- ordered catch-up of an over-budget unobserved backlog without skipped
  milestone evaluation
- narrator priority, checkpoint supersession, status responsiveness, and
  terminal ordering
- status-only context/reply persistence without projection-cursor advancement
  or later milestone suppression
- current constraints and steering overriding historical checkpoint text
- route decision validation and missing targets
- topic index retrieval and archive filtering
- side/fork parent relationships and isolation
- role-profile precedence and model/effort validation
- presentation-profile persistence and deterministic palette allocation
- master/narrator voice selection, exact-unavailable failure, automatic
  re-resolution, and finite-catalog reuse
- speech synthesis source and resolved-voice validation

### Focused renderer tests

Cover:

- conversation-keyed event application
- multiple Easy Button pane isolation
- pane focus/open reuse policy
- pane close without conversation cancellation
- stable accessible conversation palettes: distinct visible conversations when
  available, identical palettes for duplicate views, and non-color identity
  labels
- one navigator row per durable conversation across zero, one, or multiple
  panes; workspace grouping, paging, and large-list virtualization
- master launcher/overlay state shared across sidebar, shortcut, app chrome,
  text, and voice entry points
- explicit scope separation between the global master composer and an Easy
  Button conversation composer
- global capture state independent of pane mounts
- global playback priority, preemption, and attribution
- exhaustive generated event unions
- large-event-list rendering and batching
- deleted surface kinds absent from registries and toolbar actions

### Deterministic Electron E2E

Through production Electron/main/preload/renderer/HTTP/store paths with
temporary app data and a scripted Codex app-server, cover:

1. Open a workspace and create two topic conversations through the left
   navigator and global text master surface.
2. Open one Easy Button pane for each conversation, verify distinct palettes,
   then open a second view of one conversation and verify it retains one
   navigator row and the same palette.
3. Start both agents and receive interleaved streamed events.
4. Queue and steer one conversation without affecting the other.
5. Ask one narrator for status while its agent remains active.
6. Accumulate an over-budget trajectory while narration is unavailable, then
   recover through ordered catch-up; verify checkpoint maintenance cannot hide
   a milestone or delay a requested status/terminal projection.
7. Produce milestones, artifacts, an approval, completion, cancellation, and
   failure through real contracts.
8. Close a working pane, let work continue, and reopen it.
9. Restart/reload during active work and reconcile provider state while
   preserving voice and palette assignments.
10. Use global speech with no pane, one pane, and multiple panes; verify the
   master and active narrators receive distinct stable voices when available
   and explicit reuse when the catalog is exhausted.
11. Route typed and spoken master input to an existing topic, focus its pane,
    create a new topic, retain an ambiguous clarification in the master
    overlay, and open a side conversation while the parent is active.
12. Fork a durable conversation and verify parent/child isolation.
13. Verify old chat/terminal/workflow/git panes and endpoints do not exist.

The scripted provider must exercise production code paths rather than mocks or
test-only bypasses. Treat it as a first-class, separately budgeted
deliverable, not a fixture detail: it grows across phases as new provider
methods—fork, item injection, steering, interruption, liveness, and restart
reconciliation—come into use. Building and maintaining it is explicit
scheduled work in every phase that adds provider behavior.

The harness and Electron workflow use event-driven readiness, temporary app
data, bounded condition waits, and deterministic teardown. Fix sources of
flakiness; do not normalize them with fixed sleeps, blanket retries, broad
skips, weakened assertions, or test-only production bypasses.

### Live Codex E2E

When the local Codex CLI is signed in with ChatGPT auth, run live tests without
`OPENAI_API_KEY` covering:

- durable topic thread across multiple turns
- two conversations running concurrently
- steering and cancellation
- narrator fresh structured calls using the configured lightweight model
- master routing using the configured master model
- thread read/list/search/fork/item-injection behavior
- restart/reload reconciliation
- side/fork isolation where supported

If ChatGPT auth is unavailable, report the live-provider tests as skipped. A
skip is not evidence of provider integration.

### Performance

Baseline before frontend cutover and re-measure after:

- workspace layout frame time with multiple Easy Button panes
- renderer commits and DOM writes during interleaved conversation streams
- event-store application throughput for large trajectories
- conversation navigator scrolling, paging, and row updates with a large
  cross-workspace topic collection
- hidden/snapshot pane resource behavior
- microphone controller stability across pane churn
- playback queue behavior during simultaneous completions
- semantic palette-token updates across multiple visible Easy Button panes

Record results append-only under `docs/reports/performance/`.

### Broad gates

After the implementation is stable and generated outputs are current:

```bash
./scripts/format.sh
./check_quality.sh --all
./scripts/check_supply_chain.sh
```

The supply-chain gate is required if SQLite or other dependency manifests and
lockfiles change. Run the deterministic and live chat/agent workflow gates
required by `AGENTS.md` before the final source commit.

## Recording And Observability Requirements

Desktop recordings must make future narrator/routing/speech diagnoses possible
without adding emergency logging. Record structured events for:

### Agent invocation

- Setta conversation/turn ids
- provider thread/turn ids
- requested and resolved role profile
- model/effort/service tier/permission profile
- lifecycle and liveness changes

### Narrator invocation

- conversation/turn ids
- call kind (`projection`, `status`, `terminal`, or `checkpoint`) and typed
  trigger/maintenance reason
- context kind, checkpoint, included sequence range(s), and any intentionally
  omitted status-only backlog range
- pre-call `checkpointThroughSequence` and `observedThroughSequence`, proposed
  checkpoint/cursor-advance range, cursor-advance decision, and post-commit
  cursors
- invocation generation token plus completed, cancelled, superseded, stale, or
  committed outcome
- event counts by kind and input size/token estimate
- previous milestone/final-summary counts
- requested and resolved model/effort
- structured output or validation failure
- cursor commit

### Master routing

- input source and focused-conversation hint
- candidate conversation ids and retrieval metadata
- route decision and validation result
- presentation intent
- requested/resolved model metadata
- shared master interaction/session id across text and voice entry surfaces

### Presentation identity

- conversation id
- requested palette selection, resolved palette id, catalog version, and
  allocation/reuse reason
- open pane ids sharing the presentation identity
- contrast/accessibility validation failure

### Speech

- capture lifecycle and transcription operation id
- narration/master source event id
- requested selection mode, requested exact voice if any, resolved voice id,
  catalog version, and allocation/reuse reason
- synthesis request/result
- queue position and priority
- play, stop, preempt, supersede, or drop reason

Do not record private chain-of-thought, secrets, unredacted approval secrets, or
raw microphone audio by default.

## Acceptance Criteria

This plan is complete only when all of the following are true:

- Topic conversations, not Easy Runs, are the persistent user-facing unit.
- A conversation owns a durable primary agent thread and reconstructable
  narrator state.
- Multiple conversations can work concurrently in one workspace.
- Easy Button panes are keyed by conversation and may be absent while work
  continues.
- The left pane remains as a virtualized workspace-grouped navigator with one
  row per durable conversation; selecting a row focuses an existing pane or
  opens one.
- The master can retrieve, focus, open, create, and route conversations through
  typed decisions.
- The same global master is reachable through voice and shell-owned text UI,
  including while the left pane is collapsed.
- Asking for an update reaches the narrator without steering the primary agent.
- Narrator input includes an authoritative recent trajectory plus prior
  narration, not only new digest fragments.
- Checkpoint compaction covers only contiguous already-observed trajectory;
  backlog recovery cannot skip milestone evaluation, and checkpoint work cannot
  delay explicit status or terminal narration.
- Narrator defaults are explicitly lightweight and independently configurable.
- Agent defaults may be heavy and are independently configurable.
- Global microphone and playback work without an Easy Button pane.
- The master and each active conversation narrator use stable distinct voices
  when the provider catalog permits it; exact failures and finite-catalog reuse
  are explicit rather than silent.
- Audio from simultaneous conversations follows explicit, observable policy.
- Different visible conversations use stable accessible palettes when
  available, while multiple panes for the same conversation share one palette
  and color is never the sole identifier.
- Side conversations and forks do not contaminate parent threads.
- Provider thread list/search/read/fork/item-injection primitives are supported
  through generated contracts and verified live.
- Chat, terminal, workflow, git, semantic graph, workspace activity, and old
  Easy Run product/backend paths that became dead are deleted.
- No migration, compatibility, alias, adapter, dual read/write, or feature flag
  for the old architecture remains.
- Generated TypeScript matches Go-owned contracts.
- Deterministic Electron production-path tests pass with temporary app data.
- Live Codex tests pass when ChatGPT auth is available, or the lack of auth is
  reported explicitly.
- Functional acceptance does not depend on mockup parity, pixel matching, or
  broad visual restyling.
- Final performance reports show that multiple live Easy Button panes and large
  trajectories remain within established workspace UI budgets.

## Progress Log

- 2026-07-11: Plan reviewed and the motivating current-state findings verified
  against the code (one-active-run gate, one-Easy-Button-pane limit, singleton
  Easy Run store, narrator model coupled to agent settings, lossy narrator
  digest, fresh ephemeral thread per structured call). Folded in the SQLite
  single-writer model, the narrator checkpoint-generation mechanism,
  scripted-provider budgeting, and an early Phase 2 proof of active-turn fork
  snapshot semantics. Settled two open decisions: the master is app-global
  (per-workspace rejected) and the semantic graph/cartographer are deleted
  entirely.
- 2026-07-11: Follow-up review made checkpoint coverage subordinate to the
  contiguous observed cursor, added ordered backlog catch-up and low-priority
  checkpoint cancellation, kept current constraints authoritative outside
  historical summaries, made the SQLite writer queue lifecycle explicit, and
  replaced flake-tolerance wording with deterministic E2E synchronization
  requirements. Live active-turn fork behavior is now a Phase 7 prerequisite,
  not something the scripted provider may claim to prove.

Implementation is in progress under this plan.

- 2026-07-11: Completed the Phase 0 freeze/baseline slice. The
  [functional and performance baseline](../reports/performance/topic-conversations-phase0-baseline-20260711.md)
  records a fresh production Electron Easy Button workflow and 1,200 ms idle,
  working, terminal, and frozen-working frame samples. The
  [ownership and configuration inventory](../reports/topic-conversations-phase0-inventory-20260711.md)
  reviews all 146 endpoint registrations, backend/renderer/desktop owners,
  obsolete persistence paths, generated contract and supported-protocol
  fingerprints, the pinned Codex source, live ChatGPT auth and `model/list`,
  exact independent role defaults, the synthesis voice catalog/selection
  modes, and the initial seven-palette accessible catalog. This closes the
  Phase 0 exit criteria without changing production code or reading legacy
  state through a new path.
- 2026-07-11: Phase 0 verification passed with `pnpm -C desktop build`, the
  deterministic production-path `easy-button-pane-workflow.test.mjs`, the
  production-path `easy-button-pane-performance.test.mjs`, and
  `env -u OPENAI_API_KEY node desktop/tests/electron/chat-live-auth.mjs`.
  The authenticated app-server returned every selected role model and effort
  from `model/list`. Generated outputs changed: none; the exact schema and file
  hashes are recorded in the inventory. Remaining work starts at Phase 1's new
  SQLite persistence/core-contract owner. There is no blocker to Phase 1. Live
  active-turn fork snapshot semantics remain deliberately unclaimed and must
  still be established in Phase 2 before the dependent Phase 7 active side
  path; neither Phase 0 scripted workflow is evidence for that prerequisite.
- 2026-07-11: Completed Phase 1 item 1. The new `internal/conversation` owner
  bootstraps schema version 1 only at
  `<app-data>/topic-conversations/conversations.sqlite`; malformed legacy files
  placed at the inventoried old paths are ignored, while a malformed,
  unsupported, incomplete, or nonempty unversioned database at the new path is
  rejected explicitly. The version-1 schema establishes the plan-owned tables,
  named indexes, and FTS5 topic-search boundary for conversations, turns and
  queue entries, branches and side-conversation audit state, thread bindings,
  trajectory and artifacts, narrator state and output, role/presentation
  configuration, topic documents, master state and decisions, pane bindings,
  and committed events. Domain types and transaction-specific methods remain
  Phase 1 items 2-3; this slice does not expose a compatibility or legacy read
  path.
- 2026-07-11: The store holds one dedicated SQLite writer connection behind a
  bounded queue and a fixed query-only read pool. Every held connection applies
  and verifies `foreign_keys`, `journal_mode=WAL`, `synchronous=NORMAL`, and a
  bounded `busy_timeout`; readers additionally verify `query_only`. Write
  admission reports typed `cancelled`, `saturated`, and `store_closed`
  outcomes, accepted jobs always receive a result, and shutdown closes
  admission before draining accepted writes. Focused verification passed with
  `./scripts/go.sh test -race ./internal/conversation` and
  `./check_quality.sh --files internal/conversation/store.go
  internal/conversation/store_schema.go internal/conversation/store_test.go
  internal/conversation/schema_v1.sql`. Generated inputs and outputs changed:
  none. The next incomplete step is Phase 1 item 2, the Go-owned domain types;
  there is no blocker.
- 2026-07-11: Final slice verification also passed `./scripts/format.sh` and
  `./check_quality.sh --git-changes`. An additional `./check_quality.sh --all`
  run passed every Go package, static analysis, desktop formatting/typecheck,
  all 1,139 Vitest tests, and the production build, then stopped in the
  pre-existing `codex-protocol-notifications` Electron workflow because the
  completed fake-provider run never projected its assistant text. The focused
  `node tests/electron/chat-workflows.test.mjs --codex-protocol-only` rerun
  reproduced the same timeout; `internal/conversation` is not imported by any
  runtime composition root in this slice. The additionally run supply-chain
  gate reached `govulncheck` and reported `GO-2026-5856` in the repository-pinned
  Go 1.26.4 standard library, fixed in Go 1.26.5, with example traces through
  existing runtime, semantic-graph, generator, and speech code. No dependency
  manifest or pinned toolchain was changed as part of this persistence step.
- 2026-07-11: Phase 1 item 1 review corrected the version-1 schema's role
  override scope to include the plan-owned workspace layer between global and
  conversation overrides. Focused coverage now accepts all three valid scope
  shapes and rejects an empty workspace scope. The review also removed the
  hardcoded table/index inventory mirror: schema validation derives every
  owned definition from `schema_v1.sql` and compares the normalized stored SQL,
  so a version-1 database with the right object names but a wrong table or
  index definition is rejected as corrupt rather than failing later at use.
  Verification passed with the race-enabled focused conversation test and the
  focused `./check_quality.sh --files` gate.
  Generated inputs and outputs changed: none. Phase 1 item 2 remains next and
  there is no external blocker.
- 2026-07-11: Completed Phase 1 item 2. `internal/conversation` now owns the
  durable topic-conversation, turn/queue, Codex thread-binding, artifact,
  branch, ephemeral-side, role-profile, resolved-invocation audit,
  presentation-profile, narrator-state, narration-event, and normalized
  trajectory types. Domain validation makes lifecycle state explicit, keeps
  provider ids replaceable rather than using them as Setta identity, enforces
  `checkpointThroughSequence <= observedThroughSequence`, separates the four
  narration channels, and rejects mismatched or multiply populated trajectory
  and narration payload branches. The 27 trajectory variants cover the
  plan-owned turn, public agent text/reasoning, plan, activity, file-change,
  approval, subagent, artifact, liveness, provider-lifecycle, and model-reroute
  facts without importing legacy chat/Easy Run types or Codex wire objects.
- 2026-07-11: Role profiles now model exact versus explicit
  `provider_default` selection, provider-advertised reasoning-effort strings,
  service tier, explicit tool/approval/mutation permissions, context budgets,
  all three override scopes, and requested-versus-resolved invocation audit.
  The clean `internal/workspaceui/conversationpalette` owner defines the seven
  approved accessible palettes and semantic token pairs in deterministic
  allocator order; conversation presentation profiles persist exact or
  `auto_distinct` palette/voice selection and explicit catalog-exhaustion
  reuse. Focused race tests, repository formatting, and the git-change quality
  gate passed for both new owners. Generated inputs and outputs changed: none;
  these domain types are
  deliberately not registered as HTTP/event surfaces until Phase 1 item 4.
  No production composition root changed, so a chat/Electron workflow gate is
  not evidence needed for this isolated type slice. Phase 1 item 3 is next,
  with no external blocker.
- 2026-07-11: The Phase 1 item 2 review tightened the committed domain
  invariants before persistence helpers begin. A turn's accepted role profile
  and provider turn reference must now match its resolved invocation, and
  running/completed/failed/cancelled turn status cannot disagree with the
  invocation outcome. Model-reroute audit chains must begin at the resolved
  model. Status-only narrator calls cannot emit milestones or topic
  descriptors, narrator degradation records require diagnostic references and
  coherent timestamps, presentation reuse cannot identify the owning
  conversation as its own conflict, and structured-input questions/resolutions
  reject ambiguous shapes. Focused race tests and the focused quality gate pass
  for `internal/conversation` and `internal/workspaceui/conversationpalette`.
  Generated inputs and outputs changed: none. Phase 1 item 3 remains next, with
  no external blocker.
- 2026-07-11: Completed Phase 1 item 3. The conversation store now exposes a
  bounded-writer transaction boundary whose value expires with its callback;
  validated helpers persist every Phase 1 aggregate record without exposing a
  raw SQL transaction. A transaction that mutates current state must append at
  least one committed event, so conversation/turn/queue/trajectory changes,
  narrator cursor/output changes, presentation and role configuration, and
  fork/binding creation can commit or roll back with their publication record
  as one unit. Optimistic expectations reject stale conversation, turn,
  narrator, side-conversation, queue, and trajectory updates explicitly.
  Trajectory appends advance only the next contiguous per-conversation
  sequence; narrator state/output writes enforce source coverage; artifact and
  binding references are conversation-owned; and a durable fork helper accepts
  only a completed parent turn.
- 2026-07-11: The committed-event outbox assigns a durable global commit
  sequence and an independent contiguous sequence per stream inside the writer
  transaction. Bounded global and per-stream reads replay records after a crash
  or restart, payloads are copied at the boundary, and waiters use commit
  notifications plus a durable reread rather than polling. Invalid, null, or
  duplicate records roll back atomically, SQL nullable JSON remains SQL
  `NULL`, state-only transactions are rejected, and a transaction object
  cannot be used after commit. Focused verification passed with
  `./scripts/go.sh test -race ./internal/conversation` and the focused
  `./check_quality.sh --files` gate. No schema, dependency, generated input,
  generated output, runtime composition root, or Codex protocol surface
  changed, so no production Electron or live-provider workflow is implicated
  by this isolated persistence slice. Phase 1 item 4 is next, with no external
  blocker. Final repository formatting and `./check_quality.sh --git-changes`
  also passed; 100 repeated outbox wake/restart-focused runs were clean. The
  supply-chain gate again reached `govulncheck` and reported the pre-existing
  `GO-2026-5856` in repository-pinned Go 1.26.4, fixed in Go 1.26.5. This slice
  did not change the pinned toolchain or any dependency manifest.
- 2026-07-11: The Phase 1 item 3 review closed persistence-boundary gaps before
  generated contracts begin. New conversations must now start at trajectory
  sequence zero, so callers cannot create a ledger whose missing prefix can
  never be filled. Turn and ephemeral-side updates enforce forward lifecycle
  transitions, queue rows cannot be reordered after their turn is promoted,
  and durable forks cannot cross workspace roots. Narrator checkpoint text,
  topic descriptors, and current focus are tied to their owning cursor or
  revision, preventing a same-version overwrite from silently changing
  reconstructable state. Focused rollback tests cover every rejected path and
  the valid atomic queue-promotion path. Race-enabled conversation tests and
  the focused quality gate pass. Generated inputs and outputs changed: none.
  Phase 1 item 4 remains next, with no external blocker.
- 2026-07-11: Completed Phase 1 item 4. `internal/conversation` now owns a
  bounded cold-start `ConversationSnapshot` with explicit recent turn,
  trajectory, artifact, and narration windows; queue, narrator cursor,
  presentation identity, lineage, side-lifecycle, role-override, and durable
  event-cursor state remain conversation-keyed and validate ownership and
  source coverage. The new `ConversationEvent` envelope carries a sealed
  thirteen-variant payload union for conversation, turn, queue, binding,
  trajectory, artifact, narrator, narration, role, presentation, branch, side,
  and resync changes. Event ids are durable conversation-stream cursors, and
  malformed cross-conversation ownership or mismatched discriminators fail at
  the contract boundary.
- 2026-07-11: The HTTP endpoint registry now owns `ReadConversationSnapshot`
  and `ConversationEventStream`, including their request and stream roots; no
  parallel generator type list was added. Protocol version 14 and the schema
  snapshot were regenerated with `desktop/src/generated/backend.ts`. The
  generator now projects registered union discriminators as exact TypeScript
  literals and validates them at decode time, so renderer switches over all
  conversation event variants narrow exhaustively and support `never`
  assertions. The transport service seam is deliberately not installed in the
  production runtime composition root in this contract-only slice; the
  conversation store/service production wiring remains part of the Phase 3
  cutover rather than a second live domain path.
- 2026-07-11: Item 4 verification passed race-enabled conversation tests and
  the new HTTP handler tests, the complete non-race HTTP and generator suites,
  generated-artifact reproducibility, the focused generated TypeScript decoder
  tests, desktop typecheck/build, and the deterministic production Electron
  Easy Button workflow. Running the entire legacy HTTP package under the race
  detector additionally exposed pre-existing chat/workflow response races in
  old harness transcript objects; the traces do not enter the new conversation
  package or handlers, and the narrowed new-handler race run is clean. The next
  incomplete step is Phase 1 item 5's focused store hardening matrix; there is
  no blocker.
- 2026-07-11: Completed Phase 1 item 5 and the phase exit review. The focused
  matrix now proves that a failed publication rolls back both narrator cursor
  and narration output, corrupt committed records are rejected with a typed
  corruption error after restart, and concurrent aggregate transactions
  serialize state plus publication without surfacing SQLite lock errors. The
  existing matrix also covers schema corruption, state/event/cursor atomicity,
  queue backpressure and cancellation, accepted-write draining, deterministic
  shutdown, read-pool bounds, outbox wake/replay, and restart. Phase 2 is next;
  there is no external blocker.
- 2026-07-11: Completed Phase 2. `internal/agent` now owns Codex thread
  start/resume/read/list/search/fork/injection/unsubscribe, turn execution,
  per-conversation concurrency, steering, interruption, approvals, model
  catalog validation, reconciliation, background-process termination, and
  normalized provider events without importing chat presentation types. The
  Go-owned supported-protocol registry includes fork, list, experimental
  search, item injection, and unsubscribe; generated protocol contracts were
  regenerated from the pinned schema inputs.
- 2026-07-11: The race-enabled scripted app-server suite passed sequential and
  concurrent conversations, strict thread primitives, model resolution,
  streaming normalization, steering, cancellation, approval response, and
  restart reconciliation paths. The ChatGPT-authenticated live suite passed
  without `OPENAI_API_KEY`, including exact role-model availability, durable
  multi-turn threads, concurrent conversations, read/list/search, completed
  forks, injection, and active-turn snapshot isolation. The live
  characterization proved that the active fork omits the in-flight command
  while retaining current user input and commentary; Phase 7 therefore owns
  the typed normalized `SideInFlightContextFrame` correction now specified in
  the plan. There is no external blocker to Phase 3.
- 2026-07-11: Completed Phase 3 item 1. `internal/workspaceui` now owns
  `EasyButtonPaneConfig{conversationId}`, and `WorkspaceUIPane` carries its
  typed nullable envelope rather than an untyped metadata bag. Supplied
  bindings are valid only on Easy Button panes and require an exact nonblank
  conversation id. The renderer imports the generated config, preserves it
  through pane open/configure and layout save/reload, and clears it when a pane
  changes to another surface kind. Backend protocol version 15, the contract
  schema snapshot, and `desktop/src/generated/backend.ts` were regenerated
  from the Go-owned endpoint graph; reproducible regeneration produced no
  further diff.
- 2026-07-11: Focused verification passed the race-enabled workspace UI store
  suite, the race-enabled workspace layout HTTP tests, the complete non-race
  HTTP and contract-generator suites, 59 focused renderer layout tests,
  desktop typecheck/build, and the deterministic production Electron Easy
  Button workflow including close, reopen, and reload. This contract slice
  does not invent a conversation id for the legacy Easy Run toolbar path;
  production conversation-keyed state and creation/binding remain Phase 3
  items 2-6. Item 2, the normalized conversation-keyed renderer state, is next
  with no external blocker.
- 2026-07-11: The additionally run `./check_quality.sh --all` passed repository
  formatting/static analysis, every changed owner, all 1,143 Vitest tests, and
  the production build, but it was not clean. The obsolete `internal/chat`
  protocol-coverage test nondeterministically inspected its sink before all
  notification callbacks completed: a single focused run and ten race-enabled
  repetitions passed, while 100 non-race repetitions reproduced different
  missing tail notifications. The required Electron manifest later reached
  the previously recorded `codex-protocol-notifications` timeout. Neither
  failure enters the workspace UI contract or renderer layout paths changed by
  this slice; the dedicated production Easy Button workflow is clean.
- 2026-07-11: Completed Phase 3 item 2. The renderer now has one normalized
  Zustand `Map<conversationId, ConversationProjection>` whose entries own a
  bounded generated snapshot plus independent load, error, cursor, and typed
  resynchronization state. Snapshot hydration rejects cross-workspace or
  cross-conversation ownership and cannot regress a projection after newer
  live events. Event application is immutable and batched: an interleaved
  event batch produces one store commit, replaces only affected conversation
  projections, and preserves referential identity for every unrelated topic
  selector.
- 2026-07-11: The generated thirteen-variant conversation event union is
  applied through an exhaustive `satisfies` mapping. Duplicate envelopes are
  ignored without notifying subscribers; pre-hydration events, schema or
  stream changes, sequence gaps, and server-requested resyncs retain an
  explicit minimum snapshot cursor, so an older reload cannot silently clear
  stale state. Focused coverage exercises every payload branch, two
  interleaved conversations, batching/reference stability, cursor recovery,
  stale snapshot races, cleanup, and ownership rejection. The focused desktop
  quality gate passed formatting, lint/complexity, typecheck, all 1,154 Vitest
  tests, production build, and dead-code analysis after removing three unused
  type exports. The deterministic production Electron Easy Button workflow
  also passed and recorded under `.recordings/easy-button-pane/`.
- 2026-07-11: The currently mounted legacy Easy Button continues to read only
  `useEasyRunStore` until Phase 3 item 3 switches the surface to its typed pane
  `conversationId`; no mirror, adapter, or dual read/write was added between
  the stores. Generated inputs and outputs changed: none. Phase 3 item 3, making
  `EasyButtonSurface` a pure projection of its bound conversation, is next with
  no external blocker.
- 2026-07-11: ChatGPT authentication was available without `OPENAI_API_KEY`.
  The live Codex Electron regression completed its real goal, ordinary-message,
  and image turns, then did not pass the unrelated legacy semantic-cartographer
  smoke: it timed out waiting for a workflow-generated graph update. Evidence
  is under `test-results/electron-integration/chat-workflows/live-codex/`. The
  new conversation store is not imported by the production surface until item
  3, and the failing semantic path does not enter the changed files; this live
  result is therefore recorded as a regression failure, not treated as proof
  of conversation-store provider integration or expanded into obsolete-path
  repair in this slice.
- 2026-07-11: The Phase 3 item 2 review fixed control-event ordering in the
  normalized renderer store. A server-required resync now retains its typed
  reason and authoritative current cursor when it arrives before hydration or
  with a duplicate or gapped envelope; an older control envelope cannot be
  discarded merely because its payload reports a newer committed cursor.
  Existing later resync coverage is never reduced. The review also preserves
  snapshot-load errors while pre-hydration events record required recovery,
  avoids no-op Zustand commits for rejected stale snapshots, and dispatches
  the generated event union through an explicit exhaustive `never` branch.
  Focused regression coverage passes. Phase 3 item 3 remains next; this review
  did not connect the store to `EasyButtonSurface` or begin the next plan item.
- 2026-07-11: Completed Phase 3 item 3. The React surface adapter now passes
  the pane's typed `conversationId` into `EasyButtonSurface`, which subscribes
  to only that entry in the normalized conversation map. The surface no longer
  reads selected-workspace state or `useEasyRunStore`. Its bounded presentation
  is derived entirely from the generated conversation snapshot: conversation
  execution state, exact-turn terminal outcome, narrator current focus and
  degradation, milestone and final-summary channels, artifacts, active
  subagents, and the resolved palette identity. Missing bindings, unloaded or
  failed projections, and resynchronization are explicit states rather than
  legacy fallbacks.
- 2026-07-11: Legacy Easy Run submission and pane-owned speech presentation
  are detached from the mounted Easy Button, and the now-unreachable React
  speech presentation/hook/style layer was removed. Conversation controls remain
  visibly unavailable until Phase 3 item 6 adds their production command
  contracts; this slice does not dispatch a topic request into old Easy Run or
  chat state. Lower-level capture/playback provider primitives are not claimed
  as the Phase 5 global speech cutover and remain for that dedicated lifecycle
  work.
- 2026-07-11: Focused projection, rail, summary, adapter, and surviving speech
  helper coverage passed, as did all 1,161 renderer tests, desktop typecheck,
  production build, and dead-code analysis. The new deterministic production
  Electron `topic-conversation-pane-projection` workflow passed through the
  real workspace-layout HTTP/main/preload/renderer path, preserving the typed
  binding across reload and proving an absent snapshot remains an explicit
  unloaded conversation projection; evidence is under
  `.recordings/topic-conversation-pane-projection/`. Generated inputs and
  outputs changed: none. The supply-chain gate again reached `govulncheck` and
  reported the pre-existing `GO-2026-5856` in repository-pinned Go 1.26.4,
  fixed in Go 1.26.5; this slice changed no dependency manifest or toolchain
  pin.
- 2026-07-11: ChatGPT authentication remained available without
  `OPENAI_API_KEY`. The live Codex Electron regression reached the obsolete
  semantic-cartographer smoke after its real provider work, then timed out
  waiting for the expected graph update; evidence is under
  `test-results/electron-integration/chat-workflows/live-codex/`. The new topic
  projection has no provider transport until Phase 3 item 6 and is not involved
  in that legacy semantic path, so the result is recorded as a regression
  failure rather than provider proof. Phase 3 item 4, removing the one-Easy-Button
  pane limit, is next with no external blocker.
- 2026-07-11: The Phase 3 item 3 review fixed three projection gaps without
  beginning item 4. The contract generator now emits the complete accessible
  palette catalog and dark/light semantic renderer tokens directly from the
  Go-owned `conversationpalette.Catalog`; `EasyButtonSurface` applies those
  exact tokens instead of recording only a palette id while every pane retained
  the cyan default. Retained snapshots now expose loading and failed refreshes
  in visible helper copy, and cancelled turns use explicit cancelled copy,
  accessible labeling, and a stop glyph rather than a success check.
- 2026-07-11: The review also removed obsolete pane-owned Easy Button, speech,
  performance, and live workflows from the active Electron manifest after
  confirming the former required Easy Button workflow timed out against the
  deliberately disabled legacy input. The replacement
  `topic-conversation-pane-projection` workflow remains required; the standalone
  historical files remain for the later planned obsolete-path deletion rather
  than expanding this review into that step. Focused generator/catalog and
  renderer tests passed, all 1,163 desktop tests passed, and desktop typecheck,
  lint, dead-code analysis, production build, and the deterministic production
  Electron topic-projection workflow passed. The generated backend TypeScript
  changed; the HTTP contract schema snapshot did not. The final broad gate
  cleared file limits, every Go package, formatting/static analysis, all desktop
  tests, and the build, then reproduced the previously recorded unrelated
  `codex-protocol-notifications` Electron timeout after all preceding chat cases
  passed; focused production evidence for this slice remained clean. The
  supply-chain audit likewise reproduced the existing `GO-2026-5856` finding in
  pinned Go 1.26.4, fixed in 1.26.5; no dependency or toolchain pin changed.
  Phase 3 item 4 remains next with no external blocker.
- 2026-07-11: Completed Phase 3 item 4. The production workspace policy no
  longer treats Easy Button as a singleton: it uses the same bounded ten-pane
  allowance as the other repeatable workspace surfaces. Multiple panes may
  carry the same typed `conversationId`, and layout serialization/reload keeps
  their pane and surface identities distinct while preserving the shared
  conversation binding.
- 2026-07-11: Focused workspace-scene and layout-store coverage passed (60
  tests), as did desktop typecheck and the production build. The deterministic
  production Electron `topic-conversation-pane-projection` workflow opened a
  second view through the real renderer pane-open event, observed both bindings
  in the workspace-layout HTTP store, reloaded the application, and rendered
  both bound projections under distinct pane ids. Evidence is under
  `.recordings/topic-conversation-pane-projection/20260712T032258683Z/`.
  Generated inputs and outputs changed: none. Phase 3 item 5, the virtualized
  conversation navigator and deterministic focus-existing-or-open behavior,
  is next with no external blocker.
- 2026-07-11: The Phase 3 item 4 review fixed the workspace host pool remaining
  frozen at its initial pane count. A second Easy Button binding was persisted,
  but from a one-pane restored layout only the newly focused surface could mount
  until reload. The runtime area now sizes and remounts its presentation host
  pool from the current scene after pane-count changes. The deterministic
  production Electron workflow now requires both same-conversation views to be
  rendered with distinct pane ids immediately after the real pane-open event and
  again after reload. Focused layout tests, desktop typecheck/build, and the
  corrected Electron workflow passed. Phase 3 item 5 remains next; this review
  did not begin the navigator work.
- 2026-07-11: Completed Phase 3 item 5. The runtime now exposes a generated,
  authenticated topic-conversation navigator endpoint backed by the durable
  conversation store. It returns non-archived conversations with their owned
  presentation profiles and optional branch lineage, uses deterministic
  `updatedAt DESC, id ASC` keyset pagination, supports bounded title/topic
  search, and rejects corrupt ownership or missing profile state. Backend
  protocol version 16, the contract schema snapshot, and generated TypeScript
  were regenerated from the Go-owned endpoint registry.
- 2026-07-11: The selected-chat sidebar was replaced with a workspace-grouped
  virtualized conversation navigator. Its normalized renderer store isolates
  workspace pages and stale search generations; durable rows expose topic
  status, stable generated palette identity, branch attribution, pane count,
  and pane focus without using global chat selection. One conversation produces
  one row across zero, one, or multiple views. Activation focuses the most
  recently focused matching Easy Button pane or opens a typed bound pane when
  none exists, while layout persistence and reload preserve the binding.
- 2026-07-11: Focused conversation, HTTP, runtime, IPC/preload, navigator-store,
  pane-index, coordinator, sidebar, and application coverage passed. The clean
  changed-file quality gate passed file and complexity limits, Go vet/tests and
  static analysis, all 1,173 desktop tests, formatting, lint, typecheck,
  dead-code analysis, and the production build. The deterministic production
  Electron topic-conversation workflow proved one row for two views, focus
  without a third view, zero-pane navigation, reopen, and reload through real
  Electron/main/preload/renderer/HTTP/store paths. Evidence is under
  `.recordings/topic-conversation-pane-projection/20260712T044850767Z/`.
- 2026-07-11: The broad quality gate cleared all Go packages and all non-Electron
  desktop gates, then the required legacy chat workflow reached its retired
  `New chat` sidebar action and stopped; its workspace-open assertion now uses
  the replacement navigator labels. That old selected-chat action is not a
  valid navigator contract, and Phase 3 item 6 owns replacement topic create and
  command paths, so the failure is recorded rather than reintroducing an old
  sidebar control. The supply-chain audit again reported the pre-existing
  `GO-2026-5856` in repository-pinned Go 1.26.4, fixed in Go 1.26.5; no
  dependency or toolchain pin changed. The Codex source reference was not
  needed because this slice introduced no provider-protocol behavior. Phase 3
  item 6 is next.
- 2026-07-11: The Phase 3 item 5 review fixed navigator activation while an
  unrelated pane was maximized. The runtime previously focused or opened the
  requested conversation and then unmaximized the old pane, whose layout-store
  side effect restored focus to that old pane. Maximization teardown now belongs
  to the pane coordinator and runs before the requested focus/open mutation,
  while blocked presentations leave the existing maximized view intact. Focused
  coordinator regressions cover existing and newly opened conversation panes.
  The deterministic production Electron workflow now maximizes a non-topic
  pane, activates the durable navigator row, and requires the intended existing
  topic pane to become focused with maximization cleared before continuing its
  close, reopen, persistence, and reload checks. Desktop typecheck/build, focused
  renderer tests, focused conversation/HTTP/runtime Go suites, and the corrected
  Electron workflow passed; evidence is under
  `.recordings/topic-conversation-pane-projection/20260712T050345370Z/`. Phase 3
  item 6 remains next; this review did not begin it.
- 2026-07-11: Completed Phase 3 item 6. The production conversation service now
  owns topic creation, snapshot/event replay, send, queue, steer, stop,
  structured approval response, durable agent progress, artifacts, terminal
  outcomes, queue promotion, restart reads, and bounded shutdown on top of the
  Phase 2 Codex runtime. The authenticated endpoint registry owns those command
  contracts; protocol version 17, the contract schema snapshot, and
  `desktop/src/generated/backend.ts` were regenerated from the Go owners. The
  Electron main process keeps one ordered SSE stream per conversation target,
  preload/web APIs expose the generated command boundary, and the renderer
  projection runtime shares a conversation across duplicate panes while
  retaining active zero-pane subscriptions through close, reopen, and reload.
- 2026-07-11: The Easy Button and navigator now provide production topic
  creation and conversation-keyed send/queue/steer/stop controls, structured
  approval answers, live agent output, artifact projection, queued-work state,
  and explicit completed/cancelled/failed results. Deterministic verification
  exercised two concurrent conversations, duplicate panes, active-run close and
  reopen, active-run reload, queue promotion, steering, approval, artifact,
  cancellation, failure, persistence, and final reload through the real
  Electron/main/preload/renderer/HTTP/SQLite paths. Evidence is under
  `.recordings/topic-conversation-pane-projection/20260712T065249015Z/`. All
  1,176 desktop tests, desktop typecheck/build, focused conversation/HTTP/runtime
  Go tests, the new HTTP path under the race detector, and conversation snapshot
  contention repeated under the race detector passed. The test matrix caught
  and corrected queue ordinals after promotion and cross-generation snapshot
  reads by compacting the durable queue atomically and assembling each snapshot
  in one SQLite read transaction.
- 2026-07-11: ChatGPT-authenticated live verification passed without
  `OPENAI_API_KEY`. The new backend workflow created a topic and completed two
  sequential production HTTP turns on one durable Codex thread; the established
  live thread lifecycle, concurrent execution, fork, and active-turn snapshot
  characterization also remained clean. Generated inputs and outputs changed:
  the HTTP endpoint graph/protocol input, contract schema snapshot, and generated
  backend TypeScript. The Codex source reference was not needed because the new
  service consumes the already established Phase 2 normalized runtime rather
  than adding provider-protocol behavior. Phase 3 item 7, deleting the obsolete
  Easy Run path, is next with no external blocker.
- 2026-07-11: Final formatting, file-size, complexity, vet, static analysis,
  generated-contract reproducibility, desktop typecheck, all 1,176 tests,
  dead-code analysis, production build, focused race checks, and the dedicated
  production Electron workflow passed on the final tree. The final
  `./check_quality.sh --git-changes` gate was clean. The broad quality gate was
  not clean: the previously recorded nondeterministic legacy `internal/chat`
  goal-operation test observed its sink before notification callbacks completed,
  and the required legacy chat Electron workflow stopped at its removed `New
  chat` sidebar control. Neither path enters the new topic service or workflow;
  Phase 3 item 7 and the later obsolete-product deletion phases own removal of
  those retired surfaces rather than reintroducing them.
- 2026-07-11: The post-refactor live backend topic workflow passed again with
  ChatGPT auth and no `OPENAI_API_KEY`. A repeat of the broader Phase 2 live
  lifecycle/fork characterization timed out in its existing signaling sink after
  the same test had passed earlier in this slice; no `internal/agent` behavior
  changed between those runs, so the timeout is recorded rather than treated as
  contrary provider evidence. The supply-chain audit again reported the
  pre-existing `GO-2026-5856` in repository-pinned Go 1.26.4, fixed in Go 1.26.5;
  this slice changed no dependency manifest or toolchain pin.
- 2026-07-11: The Phase 3 item 6 review hardened the conversation command
  lifecycle without beginning item 7. A full queue now retains its controllable
  running turn, queueing during approval preserves the approval state, terminal
  failure keeps accepted promotion working, controls validate durable workspace
  and provider scope before side effects, missing terminal notifications fail
  explicitly, and shutdown admission no longer races the turn wait group.
  Approval decisions are request-specific, denial persists without invalid
  free-form text, secret questions stay masked and their answers are redacted
  from durable trajectory, stale approvals are not projected, and Codex
  subagent activity projects through the typed lifecycle. Authoritative event
  cursor rollback and resync-read races are handled in both desktop and web
  projections, while filtered navigator pages remain backend-owned. Protocol
  version 18, the contract schema snapshot, and generated backend TypeScript
  were regenerated from the Go owners.
- 2026-07-11: Review verification passed the conversation package and focused
  conversation HTTP endpoints under the race detector, all 1,184 desktop tests,
  desktop typecheck/build/lint/dead-code checks, the clean
  `./check_quality.sh --git-changes` gate, the ChatGPT-authenticated live topic
  workflow, and the live thread/fork characterization without `OPENAI_API_KEY`.
  The production Electron workflow passed with queueing, steering, structured
  approval, command denial, terminal outcomes, close/reopen, active reload, and
  persistence evidence under
  `.recordings/topic-conversation-pane-projection/20260712T075055072Z/`. The
  broad gate reached the already retired chat Electron workflow and failed on
  its removed `New chat` control; a deliberately broad HTTP race run likewise
  reproduced pre-existing legacy chat/workflow response mutation races. The
  supply-chain audit still reports only the recorded Go 1.26.4
  `GO-2026-5856` finding. Phase 3 item 7 remains next and was not started.
- 2026-07-12: Completed Phase 3 item 7 and the Phase 3 cutover. The obsolete
  `internal/easyrun` store, service, narrator, event stream, artifact tool, and
  persisted JSON shapes were deleted together with their HTTP handlers,
  runtime wiring, desktop event forwarder, IPC/preload API, web API, renderer
  store, pane-local submission/playback consumers, and retired production-path
  fixtures. The old hidden-chat turn path, Easy Run conversation metadata,
  harness surfaces, dynamic artifact tool registration, and special Codex
  developer instructions were removed rather than retained as compatibility
  contracts. Easy Run summary/highlight synthesis endpoints were necessarily
  removed with their deleted persistence owner; the provider transcription and
  synthesis primitives remain available for the Phase 5 global speech design.
- 2026-07-12: Protocol version 19, the HTTP contract schema snapshot, generated
  backend TypeScript, and the checked-in web build were regenerated from the Go
  endpoint and domain owners. Production and generated-source audits find no
  Easy Run endpoint, type, store, IPC channel, event stream, web client method,
  or persistence writer. The sole retained old-path literal is a negative
  `internal/conversation` store test fixture that proves malformed legacy
  `workspaces/<id>/easy-runs` data is ignored; it is not a production read or
  write path. The Codex source reference was not needed because this deletion
  added no provider-protocol behavior.
- 2026-07-12: Focused chat, speech, HTTP, runtime, generator, renderer, web,
  main-process, and preload checks passed, as did all 1,122 desktop tests,
  desktop typecheck/lint/dead-code/build, generated-contract reproducibility,
  and the deterministic production Electron topic-conversation workflow.
  Evidence is under
  `.recordings/topic-conversation-pane-projection/20260712T081319550Z/`.
  ChatGPT-authenticated live topic verification passed without
  `OPENAI_API_KEY`. The broad gate cleared file/shell/tooling checks, every
  changed-path static check, all desktop unit tests, build, and dead-code
  analysis; its full Go pass reproduced a nondeterministic legacy chat harness
  process-exit failure that passed immediately in isolation, and the Electron
  manifest then reached the already retired chat workflow and failed at its
  removed `New chat` control. The replacement topic workflow remained clean.
  The supply-chain audit again reports the pre-existing `GO-2026-5856` in
  repository-pinned Go 1.26.4, fixed in 1.26.5. Phase 4 item 1, the
  priority-aware narrator actor/mailbox, is next.
- 2026-07-12: Clarified two retained boundaries before Phase 4. The existing
  PWA remains checked in but is frozen outside this plan: no feature-parity,
  replacement-wiring, repair, or PWA acceptance work is required, and deleting
  it requires a separate future plan. Generic local/remote runtime
  connectivity also survives, including pairing, registry, picker, connection
  state/transport, external-backend attachment, and related account/auth
  ownership. Product-specific events may be removed from those shared owners,
  but the connection boundary itself must remain.
- 2026-07-12: Completed Phase 4 item 1. The new `internal/narration` boundary
  owns a lazily created actor/mailbox per durable conversation. Each actor uses
  stable FIFO ordering within the plan's explicit priority classes: terminal
  and approval-required projection, explicit status, other automatic
  projection, recoverable retry, then checkpoint maintenance. Commit-eligible
  work for one conversation prepares and commits serially, while different
  conversation actors can run concurrently. A cancelled checkpoint provider
  call may still be returning while the next commit-eligible invocation runs.
- 2026-07-12: External narrator work now returns a prepared commit to the actor
  instead of mutating narrator state directly. Every invocation receives a
  monotonically increasing per-conversation generation. Higher-priority work
  cancels an in-flight checkpoint, completes it with a typed superseded
  outcome, invalidates that generation, and immediately makes the next request
  commit-eligible; even a deliberately late checkpoint response cannot execute
  its prepared commit. Shutdown closes admission, cancels active work, rejects
  pending work explicitly, and waits for preparation workers within the
  caller's deadline.
- 2026-07-12: Focused validation passed with the new narrator package's vet and
  quality checks, 100 repeated race-enabled mailbox test runs, and a
  race-enabled joint run of `internal/conversation` and `internal/narration`.
  The tests cover exact priority order, terminal ordering behind an in-flight
  working projection, explicit-status checkpoint preemption, stale-response
  rejection, same-conversation serialization, cross-conversation concurrency,
  request validation, and deterministic shutdown. Final
  `./scripts/format.sh` and `./check_quality.sh --git-changes` runs passed.
  Generated inputs and outputs changed: none. Deterministic Electron and live
  Codex workflows were not run because this isolated scheduling boundary is not
  yet composed into a production, HTTP, renderer, or provider path; the Codex
  source reference was not needed. Phase 4 item 2, durable context/checkpoint
  materialization and cursor invariants, is next with no external blocker.
- 2026-07-12: Phase 4 item 1 review corrected recoverable-retry scheduling so
  the retry marker no longer replaces the projection, status, or checkpoint
  operation kind that later workers need to materialize the right typed
  context. Checkpoint retries remain low-priority checkpoint maintenance and
  can therefore be superseded by terminal, approval-required, status, or
  automatic projection work; their late responses remain unable to commit.
  The completion note now also distinguishes serialized commit-eligible work
  from a cancelled checkpoint provider call that is still returning. Focused
  validation passed with 100 race-enabled narrator mailbox repetitions and a
  joint race-enabled conversation/narration run. Final formatting and changed-
  file quality checks passed. Generated inputs and outputs changed: none.
  Electron and live-provider workflows remained out of scope because this
  scheduling boundary is not composed into a production path. Phase 4 item 2
  was not started.
- 2026-07-12: Completed Phase 4 item 2. The conversation store now assembles
  one read-transaction narrator source snapshot containing the durable cursor,
  target turn objective and every accepted steer, latest plan, active
  activity/approval/subagent projections, artifact metadata, all active-turn
  milestones, bounded recent final summaries, and the exact trajectory window
  requested by projection, status, or checkpoint work. Map-backed active state
  is sorted deterministically, projection/checkpoint reads return the earliest
  contiguous prefix after the durable checkpoint, and status reads return the
  latest contiguous suffix with explicit omitted-trajectory and
  omitted-unobserved ranges.
- 2026-07-12: `internal/narration` now owns typed projection, status, and
  checkpoint bundles with exact JSON-byte accounting and deterministic
  trimming. Current objective and steering carry an explicit authority marker
  over historical checkpoint text; required current fields, artifacts, prior
  milestones, and requested continuity summaries fail with a typed budget
  error instead of being silently truncated. Projection context exposes the
  contiguous evaluation range and rejects a future observed-cursor advance
  outside it. An over-budget observed tail returns a typed checkpoint-required
  result, so catch-up compacts only already-evaluated prefixes and resumes at
  the exact next sequence rather than jumping to recent events. Status remains
  read-only and can omit an old unobserved middle only when the omission is
  represented explicitly.
- 2026-07-12: Checkpoint output is constrained to the exact requested range end
  and a bounded nonempty historical summary. The SQLite commit verifies every
  sequence in the checkpoint prefix, never crosses the optimistic observed
  cursor, changes only checkpoint-owned narrator fields, and publishes the
  updated narrator state atomically. Stale expectations, missing trajectory,
  and failed publication leave both cursor and text unchanged; the actor's
  existing generation invalidation remains the outer guard against a late
  superseded provider response. Focused conversation/narration tests and vet,
  the changed-file quality gate, the joint race-enabled suites, 50 repeated
  race-enabled materializer runs, and 30 repeated race-enabled persistence
  runs passed. Final repository formatting and
  `./check_quality.sh --git-changes` passed. Generated inputs and outputs
  changed: none. Electron and live Codex workflows were not run because this
  store/materialization boundary is not composed into a production HTTP,
  renderer, or provider call path; the Codex source reference was not needed.
  Phase 4 item 3, independent lightweight narrator-model resolution, is next
  with no external blocker.
- 2026-07-12: The Phase 4 item 2 review froze every projection read and bundle
  to the trajectory sequence accumulated for that request. A delayed working
  or earlier-turn projection therefore cannot consume a later terminal event
  or later turn and advance the durable cursor past work that still requires
  its own evaluation. Status materialization now also requires the newest
  complete trajectory event whenever post-checkpoint trajectory exists; if
  that event and the authoritative current state do not fit together, it
  returns the typed context-budget error instead of silently omitting current
  evidence while claiming the latest source cursor. Store-backed cutoff tests,
  materializer regressions, focused vet and package tests, joint race-enabled
  tests, 50 repeated race-enabled materializer runs, and 30 repeated
  race-enabled persistence runs passed. Generated inputs and outputs changed:
  none. Phase 4 item 3 remains next and was not started.
- 2026-07-12: Completed Phase 4 item 3. The backend role-profile owner now
  keeps the primary-agent and narrator defaults together while preserving
  independent exact selections. The narrator release default is the approved
  `gpt-5.4-mini` model at `low` effort, with a 64 KiB byte budget, 16,384
  estimated input tokens, 2,048 reserved output tokens, read-only provider
  permissions, no tools, no workspace mutation, and no approvals. It never
  reads the primary agent's `gpt-5.6-sol`/`high` profile.
- 2026-07-12: The conversation store resolves complete role profiles in one
  read transaction using the declared built-in, global, workspace, then
  conversation precedence. It verifies conversation/workspace ownership,
  validates every stored profile, and reports malformed or role/provider-
  inconsistent configuration as corrupt state. `internal/narration` now owns
  a model resolver that reads only the narrator hierarchy and calls the real
  `internal/agent` catalog boundary before every future narrator invocation.
  Missing models and unsupported efforts or tiers preserve the actionable
  catalog failure; exact model or effort changes are rejected instead of being
  treated as a silent fallback. Unsafe narrator overrides are rejected before
  catalog lookup unless they remain read-only, tool-free, mutation-free, and
  approval-free.
- 2026-07-12: Focused conversation/narration tests and vet, the changed-file
  quality gate, the joint race-enabled agent/conversation/narration suites, 50
  repeated race-enabled role-profile persistence runs, and 100 repeated race-
  enabled narrator resolver runs passed. Generated inputs and outputs changed:
  none. Deterministic Electron and live Codex workflows were not run because
  item 3 introduces a store/catalog resolution boundary but does not yet
  compose a provider call, HTTP path, or renderer behavior; the Codex source
  reference was not needed. Phase 4 item 4, typed triggers and schema-
  constrained fresh narrator/checkpoint calls, is next with no external
  blocker.
- 2026-07-12: The Phase 4 item 3 review froze the pointer-bearing requested
  service tier before crossing the model-catalog boundary, so an in-place
  catalog mutation can no longer alter both sides of the no-reroute comparison
  and silently replace an exact request. Catalog results now also pass the
  durable resolved-settings validation before they can enter invocation audit,
  and an exact tier mismatch reports the actual returned value rather than a
  pointer address. Regression tests cover request mutation, exact-tier
  fallback, and malformed provider-default results. Focused vet and package
  quality checks, joint race-enabled agent/conversation/narration tests, 100
  repeated race-enabled role-profile reads, and 200 repeated race-enabled
  narrator resolver runs passed. Generated inputs and outputs changed: none.
  Phase 4 item 4 remains next and was not started.
- 2026-07-12: Completed Phase 4 item 4. `internal/agent` now owns one generic
  fresh structured-call primitive that creates a new ephemeral provider thread
  per invocation without reserving the topic conversation's primary-turn
  slot. Every call explicitly disables provider model fallback, approvals,
  selected environments and capability roots, dynamic tools, web search,
  image generation, and workspace project-instruction loading; it uses a
  read-only turn sandbox and rejects any provider tool activity or server
  request. A cancelled or rejected call interrupts its provider turn and waits
  for the matching terminal notification before closing its session, while a
  completed call accepts exactly one completed assistant JSON object.
- 2026-07-12: `internal/narration` now carries the typed explicit-status and
  checkpoint triggers inside their materialized bundles, alongside the
  existing projection trigger. Its caller validates exactly one context branch,
  resolves the independent narrator profile and live model catalog immediately
  before every call, verifies the exact materialized JSON byte count against
  the resolved role budget, and retains generation, trigger, model, provider
  references, and structured input/output sizes for the later invocation
  audit. Working, terminal, status, and checkpoint calls each receive only
  their exact strict root-object schema; every property is required, nullable
  topic descriptors are explicit, and unknown or cross-channel fields are
  rejected.
- 2026-07-12: Projection validation constrains cursor advances to the supplied
  contiguous evaluation window, requires a nonempty Current focus of at most
  320 Unicode characters, permits at most three 240-character milestones, and
  rejects exact duplicates within the call or against prior active-turn
  milestones. Final summaries and status replies are bounded to 1,200
  characters, topic descriptors to 320, and voice-ready fields reject control
  characters. Status output must report the exact read-only source sequence;
  checkpoint output must cover the exact requested observed prefix and remains
  subject to its byte bound.
- 2026-07-12: The Codex source reference confirmed that `outputSchema` is
  strict and turn-scoped, final structured output is delivered as the agent
  message text, ephemeral threads are in-memory/pathless, and an explicit empty
  environment selection removes shell execution surfaces. Focused agent,
  conversation, and narration tests and vet passed, as did the changed-file
  quality gate, joint race-enabled suites, 100 repeated race-enabled provider
  calls, and 100 repeated race-enabled narrator validations. The deterministic
  production Electron topic workflow passed at
  `.recordings/topic-conversation-pane-projection/20260712T105134041Z/`.
  ChatGPT-authenticated live structured-output and full thread/fork lifecycle
  tests passed with `OPENAI_API_KEY` removed; the full live run first exposed
  and then corrected a test-only active-parent signal-channel saturation bug.
  Generated inputs and outputs changed: none. Phase 4 item 5, narration output
  persistence and committed events, is next with no external blocker.
- 2026-07-12: The Phase 4 item 4 review pinned provider-default selections and
  default service tiers to the exact model-catalog resolution before starting
  the fresh provider thread. The generic structured-call boundary now requires
  that catalog-resolved exact model and effort, so its no-fallback check also
  covers roles configured to select the provider default. Narrator output is
  validated against a frozen copy of the exact serialized context rather than
  caller-owned context that can change while the provider runs, and failed
  output validation returns the generation, trigger, resolved model, provider
  references, and input/output sizes needed by the later invocation audit.
- 2026-07-12: The same review made a zero-valued status source sequence
  explicitly required and kept interruption cleanup attached after rejecting
  a provider request until the matching terminal notification arrives.
  Focused tests and vet, joint race-enabled agent/conversation/narration tests,
  50 repeated race-enabled structured-provider runs, and 100 repeated
  race-enabled narrator-caller validations passed. The deterministic production
  Electron topic workflow passed at
  `.recordings/topic-conversation-pane-projection/20260712T112315304Z/`, and
  ChatGPT-authenticated live structured-output and full thread/fork lifecycle
  tests passed with `OPENAI_API_KEY` removed. Generated inputs and outputs
  changed: none. Phase 4 item 5 remains next and was not started.
- 2026-07-12: Completed Phase 4 item 5. Successful working and terminal
  projections now commit their permitted contiguous observed-cursor advance,
  current focus revision, immutable milestones, optional topic descriptor, and
  required final summary in one serialized SQLite writer transaction. Topic
  descriptor output updates both reconstructable narrator state and the durable
  conversation projection. Every state, conversation, and narration mutation
  publishes its existing typed conversation event from the same transaction;
  a failed publication, stale cursor, or gapped trajectory rolls back the
  entire output commit. Terminal commits additionally require a terminal turn
  and matching terminal trajectory event at the exact source boundary.
- 2026-07-12: Explicit status replies use a separate atomic commit that records
  the question, answer, source range, and successful narrator invocation while
  preserving `observedThroughSequence`, checkpoint state, current focus, and
  focus revision exactly. The narrator output adapter freezes and revalidates
  the structured result before returning the actor's bounded commit closure,
  records exact requested/resolved model settings, provider thread/turn/request
  references, context byte counts, and call timing, and rejects mismatched
  generations or caller-owned mutation. Checkpoint calls now use the same
  prepared-commit adapter without acquiring a second persistence path.
- 2026-07-12: Focused file/complexity, vet, test, and dead-code gates passed,
  as did the joint race-enabled conversation/narration suites, 50 repeated
  race-enabled output-adapter runs, 30 repeated race-enabled persistence runs,
  desktop typecheck/build, and the deterministic production Electron topic
  workflow at
  `.recordings/topic-conversation-pane-projection/20260712T115524632Z/`.
  ChatGPT-authenticated live structured output passed with `OPENAI_API_KEY`
  removed. The unchanged full Phase 2 live fork characterization was not clean:
  one run's semantic isolation probe answered `YES`, and its focused rerun did
  not receive `activity_started` before the existing wait expired. No
  `internal/agent` code changed in this slice, so these results are recorded as
  live-characterization failures rather than evidence against the successful
  narrator call or persistence path. Generated inputs and outputs changed:
  none; the Codex source reference was not needed because no provider protocol
  behavior changed. Phase 4 item 6, typed degradation and retry behavior, is
  next with no implementation blocker.
- 2026-07-12: The Phase 4 item 5 review bound every prepared output commit to
  the exact serialized context, workspace root, resolved model audit, provider
  references, structured result, and call timeline validated by the caller. A
  same-sized context mutation or altered result metadata can no longer rebind
  a successful provider response before the actor commits it. The obsolete
  exported checkpoint-preparation helper was removed, leaving projection,
  status, and checkpoint output on the one caller-witnessed adapter path.
- 2026-07-12: Terminal output schemas and local validation now require the
  observed cursor to reach the supplied terminal boundary, and persistence
  requires completed/interrupted/failed trajectory events to match the durable
  completed/cancelled/failed turn outcome. Focused file/complexity, vet, test,
  dead-code, race, and repeated output/persistence checks passed. Desktop
  typecheck/build and the deterministic production Electron topic workflow
  passed at
  `.recordings/topic-conversation-pane-projection/20260712T121756057Z/`.
  ChatGPT-authenticated live structured output passed with `OPENAI_API_KEY`
  removed. Generated inputs and outputs changed: none. Phase 4 item 6 remains
  next and was not started.
- 2026-07-12: Completed Phase 4 item 6. Narrator failures now cross an explicit
  typed boundary for provider unavailability, invalid provider output, model
  configuration, required-context budget, durable-state availability or
  corruption, and internal-contract failure. Classification is based on the
  stage that observed the error or repository-owned typed errors; no error-text
  heuristic decides retryability. A failed attempt atomically persists a safe
  `NarratorDegradation` plus its conversation-stream state event while retaining
  both cursors, the checkpoint, current focus, topic descriptor, prior
  narration, and the primary agent turn unchanged. The submitting boundary
  receives a typed degraded error with the diagnostic reference only after that
  state commit succeeds.
- 2026-07-12: Recoverable projection and checkpoint failures use the narrator
  actor's finite one-, five-, and thirty-second retry policy. Each timer is
  push-based, cancellable on shutdown, preserves the original typed operation,
  increments an explicit attempt, and enters below new automatic/status/urgent
  work; a checkpoint retry remains supersedable by higher-priority work. A
  failed degradation commit cannot schedule a retry, exact status requests do
  not produce a delayed unsolicited answer, and nonrecoverable or exhausted
  failures remain visibly degraded. A successful projection, status call, or
  checkpoint retry clears degradation. The Easy Button renders the persisted
  safe failure message while retaining the last valid focus instead of adding
  a mechanical replacement highlight or implying that the agent stopped.
- 2026-07-12: Focused conversation/narration tests, vet, file/complexity and
  dead-code checks passed, as did the joint race-enabled suites and 100 repeated
  race-enabled retry ordering, checkpoint supersession, and shutdown runs. All
  1,122 desktop tests, desktop typecheck, production build, and the deterministic
  production Electron topic workflow passed; evidence is under
  `.recordings/topic-conversation-pane-projection/20260712T124318056Z/`.
  ChatGPT-authenticated live structured output and the live backend topic
  workflow passed with `OPENAI_API_KEY` removed. Generated inputs and outputs
  changed: none; the Codex source reference was not needed because this slice
  adds failure handling around the established structured-call protocol rather
  than changing provider wire behavior. Phase 4 item 7, the explicit narrator
  status command path, is next with no implementation blocker.
- 2026-07-12: The Phase 4 item 6 review preserved repository-owned durable-state
  failure types through narrator model resolution and now classifies SQLite
  persistence failures and a closed conversation store as retryable state
  unavailability instead of configuration or internal-contract failures. The
  actor also batches ready external work and delayed retries before selecting
  the next request or committing a completed checkpoint, so a retry that became
  eligible during checkpoint work cannot lose its higher mailbox priority and
  allow that checkpoint generation to commit.
- 2026-07-12: Focused narrator and renderer tests, narrator vet, 50 repeated
  race-enabled narrator runs, the joint race-enabled conversation/narration
  suites, all 1,122 desktop tests, desktop typecheck/build, and the deterministic
  production Electron topic workflow passed. Workflow evidence is under
  `.recordings/topic-conversation-pane-projection/20260712T130345713Z/`.
  ChatGPT-authenticated live structured output and the live backend topic
  workflow passed with `OPENAI_API_KEY` removed. Generated inputs and outputs
  changed: none. Phase 4 item 7 remains next and was not started.
