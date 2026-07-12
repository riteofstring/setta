# Topic Conversations, Global Master, And Narrator Plan

**Date:** 2026-07-11

**Status:** In progress. Phases 0-7 and Phase 8 items 1-3 are complete. Phase 8
items 4-5 and Phase 9 remain.

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

### Required reversals of recently implemented work

Two recently completed slices on the current branch implemented product
decisions that have since been rejected. They must be undone end to end rather
than hidden, deprecated, or retained for compatibility:

1. The master overlay was implemented with completed-request history and a
   renderer-facing recent-master-input read path. Remove that history UI and
   every endpoint, IPC contract, controller field, fixture, and test whose only
   purpose is to hydrate it. The master overlay is one transient active
   interaction; durable master state remains hidden for routing, recovery, and
   audit.
2. The Easy Button composer was implemented with separate Send, Queue, Steer,
   Status, Side, and Fork actions plus a pane-voice mode selector, backed by
   `ConversationInputMode`, `requestedMode`, and an explicit-mode router.
   Remove that entire user-selected-mode path. The text composer has one
   **Send** action, Enter has the same behavior, and the pane microphone remains
   outside the text composer with no mode selector. **Send** replaces the
   current Route label but retains narrator-routing semantics. Every ordinary
   pane text or finalized voice input first reaches the conversation
   narrator/router, which alone chooses the typed outcome.

Do not satisfy either reversal by merely hiding renderer controls. Remove
newly dead backend branches, persisted fields, generated contracts, IPC
surfaces, styles, fixtures, and tests. Retain operational controls such as
Stop, approvals, retry/discard, returning from an active side conversation,
and navigating fork lineage; those do not select an input-routing mode.

## Outcome

Setta becomes a conversation-centered, voice-capable multi-agent desktop
environment:

- A durable **topic conversation** owns an underlying workspace agent and its
  recent and historical work.
- A lightweight **narrator** observes that agent's authoritative trajectory,
  produces sparse milestones and final summaries, and answers direct status
  questions.
- A global **master** receives shell-level speech or text, finds or creates the
  right topic conversation, routes work, and asks the renderer to focus or open
  panes.
- The master is presented as one active routing interaction, not as a separate
  chat or completed-request transcript. Its durable session and audit state
  remain hidden.
- Input started inside an Easy Button goes to that conversation's lightweight
  **narrator/router**. It decides whether to continue, queue, or steer the
  parent agent; answer as narrator; create a side conversation or durable fork;
  escalate an unrelated topic to the master; or ask for clarification.
- An Easy Button pane is a view of a topic conversation. A conversation may
  have no pane, one pane, or multiple panes.
- Multiple topic conversations may run concurrently in one workspace. Each
  conversation still serializes its own primary turns.
- The microphone lease, transcription lifecycle, and speech queue belong to the
  application shell, not an Easy Button component. Capture ownership is global;
  each capture still has an explicit master or conversation destination.
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
4. The user submits more work through that Easy Button by text or voice. Its
   lightweight narrator/router recognizes that the input belongs to the
   current topic and dispatches it to the heavy agent, then continues observing
   and emitting presentation events.
5. The user asks for an update naturally in the pane or asks the master. The
   request reaches that conversation's narrator without steering or
   interrupting the agent.
6. If the user introduces a tangent, the conversation narrator/router may open
   an ephemeral side conversation or create a durable fork. If the input is
   unrelated, it escalates to the master, which finds or creates the right
   topic conversation.
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

### User-facing work is a topic projection, not a transcript

The topic conversation durably owns accepted inputs, turns, steering, queueing,
agent trajectory, narrator state, artifacts, and provider references. That
underlying history exists for execution, model context, recovery, and audit;
it is not rendered as user-message scrollback.

An Easy Button restores one evolving projection of the topic:

- persisted conversation title and identity
- narrator-controlled `currentFocus`, initially derived from the first request
  and revised as later work changes the active objective
- accumulated milestones and artifacts
- current work, queue, approval, error, side, and lineage state
- latest narrator status reply and latest terminal summary

Later user inputs, queued requests, and steering instructions do not become
message bubbles or a visible request list. Their effects appear through the
updated focus and projection. Do not expose separate narrator, primary-agent,
master, provider, or side-thread transcripts as parallel chat histories.

The master remains durable internally because routing, clarification,
idempotency, recovery, and audit require it. That persistence does not imply a
visible scrollback. The shell master surface presents only one active root
request, its current processing state, its unresolved clarification chain, and
its immediate result. Completed master interactions are not hydrated or
rendered as a list.

If a master exchange becomes substantive enough to need durable work, the
master must route to or create a topic conversation whose result appears
through that topic's projection. Do not turn the shell overlay into another
conversation aggregate.

### Shell input is globally routed; Easy Button input is conversation-routed

Shell-originated voice and text are two input modalities for the same global
master session and routing pipeline. The shell provides a compact `Ask Setta`
launcher in the fixed portion of the left navigator. Activating it opens an
expanded master overlay with a text composer and one active routing
interaction. A global keyboard shortcut and an app-chrome control open the
same overlay when the left pane is collapsed; these are presentations of one
controller, not separate master sessions.

The overlay behaves like an action-oriented command palette, not a master chat.
While a request is active it shows that request, progress, the current
clarification when one is unresolved, and the immediate result. A successful
focus/open/create action dismisses or clears the overlay so the destination is
visible. A non-navigating answer remains only until dismissed or replaced.
Closing the overlay does not cancel routing, and an unresolved clarification
survives close, reload, and restart. Completed interactions never rehydrate as
scrollback.

Shell text and finalized shell voice still enter the same hidden master
session. That shared session is a routing and continuity boundary, not a
user-facing interaction history.

An Easy Button composer and microphone have deliberately different scope from
the shell master controls. Text or voice started inside an Easy Button is
addressed to that topic conversation's narrator/router, which makes a typed
conversation-local routing decision. It does not enter the global master by
default. Text or voice started from `Ask Setta`, the global shortcut, app
chrome, or the fixed shell microphone control is routed by the master and
includes the focused workspace/conversation as a hint, not as a forced
destination.

The application-level speech controller owns both kinds of capture, but it is
not an implicit router. The initiating control supplies a typed destination at
capture start, and that destination remains fixed even if pane focus changes
while transcription is in progress. A normal Easy Button submission requests
AI routing. There is no user-selected send, queue, steer, status, side, or fork
mode and no direct-to-agent submit path.

### Master and narrator have different routing scopes

The master is the only actor authorized to make app-global routing decisions.
A topic narrator/router is authorized to make typed decisions within its bound
conversation: dispatch to the parent agent, answer a status question, create an
ephemeral side conversation, create a durable child fork, or ask for
clarification. It may also escalate an input to the master, but it may not
search, focus, or dispatch to arbitrary unrelated conversations itself.

Both actors emit constrained decisions; neither directly manipulates renderer
state or receives unrestricted shell/filesystem tools. The backend validates
and executes the decision, and the pane coordinator applies any resulting
presentation intent. Workspace work is delegated to the chosen topic or side
agent.

### Narrator is persistent logically and reconstructable physically

Narrator continuity lives in Setta-owned durable state, not only in a model
thread. The narrator has a durable cursor, checkpoint, prior outputs, current
focus, topic descriptor, and prior input-routing decisions per conversation.

The first implementation uses fresh schema-constrained narrator model calls.
Every call is rehydrated from the authoritative trajectory and previous
narration state. A persistent provider narrator thread is not required for
correctness and is not part of this plan. It may be evaluated later only as a
measured latency or cost optimization.

Projection and input routing use the same independently configurable
lightweight narrator role and durable context, but separate strict call schemas.
Routing a user input never advances the narrator's trajectory projection cursor.

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

A conversation routing decision is a control output, not a fifth narration
presentation channel. It has its own durable input, schema, validation, and
audit record.

### Voice is global

One application-level speech coordinator owns the microphone lease,
transcription lifecycle, global enablement, playback queue, preemption, and
source attribution. Here, global describes resource ownership and availability,
not the destination of every utterance. A capture request has one explicit
destination:

```text
SpeechCaptureDestination =
  master
  conversation(conversationId)
```

Shell master controls request `master`. An Easy Button requests its bound
`conversationId`. The destination is frozen when capture begins. Later focus
and renderer keyword heuristics never change it; the lightweight
narrator/router always makes the semantic decision from the transcript and
authoritative conversation context. Easy Button panes render capture and
shared state, but do not own capture or playback controllers and do not expose
a voice-mode selector.

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
  genuinely ambiguous; the responsible master or narrator/router asks a
  clarification question instead
- speech wake-word selection or continuous-listening privacy UX details beyond
  the explicit click-to-talk baseline and ownership/lifecycle boundary needed
  by the architecture
- PWA feature work, PWA parity, PWA-specific acceptance, or deletion of the
  retained PWA
- removal of local/remote runtime pairing, discovery, selection, or connection
  infrastructure
- guaranteed globally unique voices or colors across an unbounded conversation
  archive; uniqueness is best-effort among simultaneously active/visible
  conversations and explicit reuse is allowed when a finite catalog is
  exhausted

## Baseline Findings That Motivated The Refactor

At the plan's 2026-07-11 baseline, the repository could not express the target
behavior without changing its primary ownership boundaries:

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
Shell text / shell voice ---> Master router <--- escalated unrelated pane input
                                  |
                       global RouteDecision
                                  |
Easy Button text / pane voice     v
              |          Conversation registry ---> Pane coordinator
              v                    ^                       ^
 Conversation narrator/router     |                       |
              |                    |                       |
   ConversationRouteDecision -----+-----------------------+
       |          |          |
       |          |          +--> durable fork conversation
       |          +-------------> ephemeral side conversation
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
  topic conversation aggregate, durable input intake, local route decisions,
  validated decision execution, turns, artifacts, trajectory ledger,
  persistence, event stream, snapshots, branch relationships, presentation
  profile persistence

internal/narration
  narrator context builder, durable state, actor mailbox, input router,
  triggers, routing/projection output validation, narration events

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
  global speech store/controller with one frozen destination per capture
  one master input/presentation controller shared by shell voice, shell text,
  launcher, shortcut, and overlay
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
  submits every ordinary text/voice input to conversation routing
  renders one text Send action plus focus, milestones, artifacts, summary,
  approval, recovery, and operational controls
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

### ConversationInput and local route decision

Every ordinary Easy Button text or voice submission first becomes a durable,
idempotent conversation input rather than an agent turn:

```text
ConversationInput
  id
  conversationId
  sourcePaneId?
  replyToInputId?
  text
  modality: text | voice
  status: accepted | routing | awaiting_clarification | dispatched | failed
  submittedAt
```

The lightweight conversation narrator/router reads every input with
authoritative parent context and emits one strict decision:

```text
ConversationRouteDecision =
  send_to_parent(authoredInput)
  queue_parent_turn(authoredInput)
  steer_parent_turn(authoredInput)
  answer_as_narrator(question)
  create_side_conversation(input)
  fork_conversation(forkedAtTurnId, input, proposedTitle)
  escalate_to_master(input)
  clarify(question)
```

There is no user-authored decision-family override. The backend validates
conversation state, fork point, scope, and permissions before atomically
recording and executing the narrator/router's decision. A model decision never
names an endpoint, pane id, provider thread id, or arbitrary conversation
outside its bound parent. Unrelated-topic escalation carries the original
input and parent context reference to the master, which owns global retrieval
and destination selection.

For a working parent, `queue_parent_turn` preserves the active turn and
`steer_parent_turn` changes it. The narrator/router selects between them from
the user's meaning and current turn state; when that distinction is materially
ambiguous it emits `clarify` instead of silently defaulting.

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
- conversation input intake and local route decisions
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
- master input intake, master session, and route decisions
- persisted pane bindings/layout references

Use an append-only trajectory plus transactional current-state projections; do
not force every setting or layout operation into full event sourcing.

Critical transactions include:

1. Persist an accepted conversation input and its committed intake event.
2. Persist a validated local route decision and the resulting parent command,
   side/fork record, clarification, narrator request, or master escalation.
3. Create/queue a turn and append the corresponding trajectory event.
4. Apply a normalized provider notification, update turn state, and append its
   trajectory event.
5. Persist working/terminal narrator projection output and its permitted
   `observedThroughSequence` advance atomically; persist a status reply without
   changing that projection cursor.
6. Persist a narrator checkpoint and advance `checkpointThroughSequence`
   atomically without changing `observedThroughSequence`.
7. Create a conversation branch and its provider binding atomically after the
   provider fork succeeds.
8. Apply a master route decision and persist the resulting conversation command
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

### Projector and input router

The narrator is one logical lightweight AI role with two coordinated,
reconstructable responsibilities per topic conversation:

- the **projector** observes agent trajectory and produces milestones, status
  replies, final summaries, topic descriptors, and checkpoints
- the **input router** classifies ordinary pane input before it becomes agent
  work and emits a `ConversationRouteDecision`

The input router is not a renderer heuristic and does not share the global
master's arbitrary conversation index. It receives the durable input, parent
conversation identity and topic, current objective and turn state, active
steering and plan, recent authoritative trajectory, prior narration and local
routing decisions, valid completed fork points, and the exact bounded set of
allowed decision variants. This is enough to decide whether an input continues
the current work, asks about it, branches from it, or requires global routing.

Input routing uses fresh schema-constrained model calls resolved through the
conversation's narrator role profile. It does not wait behind automatic
projection or checkpoint work, does not advance projection/checkpoint cursors,
and serializes accepted inputs in submission order. A clarification leaves the
input pending and links the next answer through `replyToInputId`; the router
then resolves one final decision from the combined exchange.

The text composer exposes one **Send** action and the pane microphone exposes no
mode selector. Both create the same kind of routed conversation input. There is
no renderer or backend bypass that lets the user preselect a decision family;
the narrator/router must interpret the input or ask for clarification.

### Actor and cursor

Each topic conversation has one narrator projector mailbox. The mailbox
serializes:

- automatic projection requests
- routed status questions
- terminal projection
- checkpoint generation
- retry after recoverable provider failure

Only the actor may advance narrator state. A terminal event queued behind an
in-flight working projection is processed next; it does not start a competing
goroutine and wait on ad hoc channels.

Mailbox priority is explicit: terminal and approval-required projection,
routed status, other automatic projection, recoverable retry, then checkpoint
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
- `status_requested`
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

A routed user status request receives a clear failure response if narration
cannot run. It is not silently rerouted to the workspace agent.

Input-router failure leaves the durable conversation input undispatched and
retryable with an explicit diagnostic. It never silently converts the input
into parent-agent work, a master input, a side conversation, or a fork.

## Master And Routing Architecture

### Shell master surface

The global master surface is one shell-owned interaction controller with
multiple entry points:

```text
left-pane Ask Setta launcher ---+
global keyboard shortcut -------+--> master overlay --> MasterInput
app-chrome master control ------+
shell voice transcription ------+
```

The compact left-pane control is always above the scrollable conversation
list. It may accept a short one-line submission directly, but focus or a
multi-line request expands the overlay. The overlay owns one active shell
interaction: its root request, processing state, unresolved clarification, and
immediate result. It must not list completed inputs or expose master audit
records. Collapsing or reopening it does not create or resume a different
provider thread, but only an unresolved active interaction is restored to the
surface.

Every master submission normalizes into one contract containing input id,
text, modality (`text` or `voice`), source (`shell` or
`conversation_escalation`), timestamp, and optional focused/originating
workspace, conversation, pane, and conversation-input ids. Routing behavior
does not diverge by modality. The renderer may show interim shell voice
transcription, but only a finalized master submission enters durable master
intake and routing state.

Easy Button input first enters its local narrator/router; only an explicit
`escalate_to_master` decision creates a linked master input.

The master surface is not a topic conversation and does not appear as a row in
the conversation navigator. It has no recent-transcript or audit UI. Logs and
desktop recordings expose structured audit data for diagnosis without turning
that data into product scrollback.

The active shell request, clarification, and immediate result use the shared
master overlay. A route result or clarification caused by pane escalation is
delivered to the originating pane instead of populating the shell overlay.
Both paths still use the same durable hidden master session; neither creates a
per-pane master.

The baseline voice interaction for this plan is explicit click-to-talk. The
fixed shell microphone control opens the active master interaction and starts
capture, enabling the global preference first when necessary. The same control
finishes and submits the request. Wake phrase and continuous-listening behavior
remain future decisions.

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
  queue_agent_turn(conversationId, authoredInput)
  steer_active_turn(conversationId, authoredInput)
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

The master chooses `send_to_agent`, `queue_agent_turn`, or
`steer_active_turn` explicitly. Queueing preserves the active turn and
schedules a later turn; steering changes the active turn. If an app-global
request targets a working conversation but does not make that distinction
clear, the master asks a clarification rather than guessing.

The conversation narrator/router makes the equivalent decision within its
bound parent through `ConversationRouteDecision`, including side, fork, and
escalation outcomes. A local decision is not a global `RouteDecision`, and an
explicit Easy Button action may bypass model classification while using the
same validated executor.

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

Both routing levels may choose these outcomes. The global master may emit
`create_side_conversation` or `fork_conversation` for shell input or an
escalated pane input. A conversation narrator/router may emit the corresponding
local decision only for its own parent. Explicit Side and Fork pane actions
request the same validated operations without model classification.

The routing policy is semantic and schema-constrained:

- continue, queue, or steer the parent when the input belongs to the same work
- use a side conversation for a related, temporary tangent that benefits from
  parent context but should not alter the parent agent's turn or durable topic
- use a fork for a related direction that should persist independently with its
  own future turns, narrator, navigator row, and panes
- escalate from the pane narrator to the master when the input is unrelated or
  may belong to another existing global topic
- clarify when the intended parent, fork point, or durable-versus-ephemeral
  choice is materially ambiguous

Do not implement this with transcript keywords, renderer heuristics, or a
silent default from side to fork. The model selects a typed decision from the
supplied valid actions, and the backend owns validation and execution.

A pane-local side decision uses the originating pane. A master-authored side
decision first asks the pane coordinator to focus an existing parent pane or
open one, then binds the ephemeral side to the resolved pane. If no renderer is
available, the master decision remains durably pending and cancellable until a
coordinator reconnects; it does not start an invisible pane-owned side session.
If the originating pane for a local decision disappears before binding, that
decision fails explicitly and remains retryable rather than silently choosing a
different pane. A durable fork has no presentation dependency and may continue
with zero open panes.

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
and public assistant commentary and omits the active command item. The durable
child core marks the cloned in-flight turn `interrupted`, while the pathless
ephemeral `thread/fork` response projects the source turn as `inProgress`.
Later parent output does not enter the child snapshot and the parent continues
without interruption. Because the gap is now proven, the side lifecycle
injects a typed `SideInFlightContextFrame` together with the boundary before
accepting the side user's turn. The frame is built
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
- the frozen master or conversation destination for the active capture
- delivery of finalized text to that typed destination
- explicit cancellation on runtime disconnect or sign-out

Starting capture from a shell master entry point targets `master`; its finalized
transcript becomes a `MasterInput`. Starting capture from an Easy Button targets
the pane's bound conversation and enters its narrator/router. It bypasses the
master unless the local AI later emits `escalate_to_master`. Pane capture
always enters conversation routing, so the user does not choose an action
before speaking. The renderer never infers the resulting action from transcript
wording; the narrator/router makes the semantic choice through its strict model
schema. Closing or changing focus away from the initiating pane does not
retarget an active capture; the original durable conversation and source pane
reference remain the origin. User cancellation or runtime disconnect cancels
it, and an unavailable destination or presentation-dependent side action fails
explicitly.

The provider transcription endpoint remains app-global and is not
parameterized by an implicit selected conversation. Runtime/auth identity
remains explicit. Capture destination is a separate typed application command,
not provider transcription state and not a focused-pane lookup performed after
the transcript is finalized.

Global microphone enablement means capture is available throughout the app; it
does not force every capture through the master and does not mean the app is
continuously listening. This plan's baseline is an explicit shell or pane
click-to-talk control: activate it to begin capture and activate it again to
finish. Starting shell capture opens the active master interaction. Local voice
activity detection, continuous listening, and wake phrases remain future
decisions and must not change the ownership boundary or create one microphone
controller per pane.

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
- submit/retry/discard a durable routed conversation input
- read local routing clarification and decision state
- execute validated send, queue, steer, narrator-status, side, fork, and master
  escalation outcomes
- stop the active turn
- submit an approval or structured input response
- read/update per-conversation role overrides
- read/update the conversation presentation profile
- subscribe to conversation events

### Master commands

- read the active shell interaction and unresolved clarification state
- submit shell-originated or linked conversation-escalation input
- subscribe to master replies and presentation intents
- cancel an active master operation

Do not expose a recent-master-input or master-transcript read boundary solely
for renderer scrollback. Durable master inputs and route decisions remain
backend-owned for idempotency, recovery, semantic context, and structured
audit.

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
- dispatch a finalized transcript to its frozen master or conversation-input
  target
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

**Status:** Complete.

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

**Status:** Complete. The characterized live snapshot requires the typed Phase
6 in-flight context frame specified above.

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
   Phase 6 side-conversation design depends on. Record which persisted and
   in-flight history items the child receives at the fork boundary, whether the
   parent continues without interruption, and confirm that later parent events
   do not leak into the child snapshot.

The scripted provider proves Setta's request and lifecycle handling but is not
evidence of live Codex snapshot behavior. If ChatGPT-authenticated live testing
is unavailable or the result is inconclusive, record the test as skipped and
leave the active-turn side path blocked. Completed-turn durable forks may
proceed. If live behavior exposes a context gap, revise Phase 6 explicitly as
required by the side-conversation section; do not make the fake provider
simulate the desired answer and call it proof.

Exit criteria:

- one durable topic conversation can run multiple sequential turns
- two conversations in one workspace can run concurrently
- restart/reload resumes or reports missing provider state explicitly
- no new code depends on chat presentation types
- live active-turn fork snapshot semantics are established and recorded, or
  the dependent Phase 6 path is explicitly blocked rather than assumed

### Phase 3: Conversation-keyed Easy Button cutover

**Status:** Complete.

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

**Status:** Complete.

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
7. Typed narrator-status outcome path that never steers the primary agent.

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
- routed status and terminal work are not delayed behind checkpoint
  maintenance
- asking for status returns a narrator reply while the agent continues
- a narrator process/session failure can be recovered from Setta state

### Phase 5: Global speech infrastructure

**Status:** Complete.

The completed slice included the now-rejected pane input-mode plumbing. Phase 7
item 8 removes that plumbing while retaining the app-global capture, delivery,
voice, and playback infrastructure.

Existing foundation:

- app-shell microphone controller and global preference
- finalized shell transcript delivery to durable master intake
- typed provider voice catalog plus global master and per-conversation narrator
  voice-selection foundations

Remaining sequence:

1. Add Go-owned `ConversationInput` validation, schema, idempotent persistence,
   committed intake event, and focused store tests. Do not add HTTP, generated,
   or renderer wiring in this slice.
2. Register conversation-input intake in the Go HTTP endpoint registry,
   regenerate contracts, and wire the active-runtime main/preload boundary.
3. Add the typed `master | conversation(conversationId)` destination to the
   app-shell capture controller and pane capture requests. Freeze the
   destination and source pane at capture start.
4. Deliver finalized pane transcripts exactly once to conversation input intake
   for narrator routing, including frozen-input retry, discard, runtime-switch
   handling, and deterministic production Electron coverage. Preserve the
   existing shell-to-master path.
5. Implement stable `auto_distinct` allocation, exact overrides,
   finite-catalog reuse, and explicit unavailable-voice behavior.
6. Add generic speech synthesis contracts keyed by narration/master event and
   resolved speaker voice.
7. Add one source-aware playback queue with explicit priority and supersession.
8. Render global speaking/capture state in panes and app chrome.
9. Delete Easy Button-owned speech controllers, Easy Run speech endpoints, and
   pane-local playback subscriptions.

Exit criteria:

- microphone capture works with no Easy Button pane mounted
- opening or closing panes does not restart global capture
- shell-originated voice enters the master pipeline
- Easy Button-originated voice enters the bound conversation's durable input
  intake for narrator routing and does not become a global master input
- pane voice exposes no mode selector and cannot bypass the narrator/router;
  the renderer does not infer intent from transcript text or final focus
- narration from multiple conversations is queued and attributed correctly
- the master and active narrators use stable distinct voices when available;
  restart preserves assignments and finite-catalog reuse is visible
- recording preempts playback according to explicit policy
- highlights/final summaries/status replies have deterministic speech behavior

This phase targets the desktop app shell. It establishes capture and playback
infrastructure, not the final AI input-routing cutover. Do not add or repair PWA
speech behavior or PWA-specific acceptance coverage, and do not delete the
retained PWA.

### Phase 6: Side conversations and durable forks

**Status:** Complete.

Implement:

1. Durable fork through `thread/fork` at a validated completed turn.
2. Ephemeral `thread/fork` linked to parent and pane, using the resolved
   `side_agent` profile.
3. Side boundary and typed in-flight context-frame injection matching the
   characterized Codex lifecycle.
4. Active-parent status projection, isolated events, disposal, restart, and
   explicit failure handling.
5. One validated backend executor for narrator- or master-authored side/fork
   decisions; the model never receives provider ids or arbitrary pane commands.
6. Parent/child presentation and durable-fork lineage controls.
7. Re-verification of the active-turn fork snapshot semantics established in
   Phase 2 through the full side-conversation lifecycle.

Exit criteria:

- side output never enters the parent agent thread or transcript history
- durable forks appear as independent topic conversations with their own agent,
  narrator, navigator row, and panes
- side conversations remain associated with the parent pane and are absent
  from global topic search
- branch source turn/trajectory sequence and decision source are auditable
- the active side lifecycle uses the proven typed context correction and no
  synthetic or heuristic fallback

### Phase 7: Master, conversation index, and AI routing cutover

**Status:** Complete.

Implement:

1. Complete the `ConversationInput` lifecycle with clarification and
   `ConversationRouteDecision` contracts, ordered processing, and atomic
   validated execution.
2. Conversation-local input router using the lightweight narrator role,
   authoritative context, strict output, and independent invocation audit.
3. Topic-card index and bounded global candidate retrieval.
4. Durable restricted master thread and independent role configuration.
5. One shell-owned master controller shared by shell text and voice, including
   linked pane escalations and source-aware clarification delivery.
6. Compact left-pane launcher plus an action-oriented master overlay reachable
   by global shortcut, app chrome, and the shell microphone while the navigator
   is collapsed. Undo the recently implemented completed-request history
   renderer and remove any recent-master-input read endpoint, IPC surface, or
   controller state whose only consumer was that renderer. Retain durable
   master inputs, route decisions, provider session state, and recording audit.
   Present only the active shell request, unresolved clarification, processing
   state, and immediate result; successful navigation clears or dismisses the
   overlay.
7. Strict global `RouteDecision` generation and validation.
8. Undo the recently implemented multi-action Easy Button composer and explicit
   pane input-mode plumbing. Remove the Queue, Steer, Status, Side, Fork,
   direct-to-agent Send, and voice-mode controls; remove `ConversationInputMode`,
   `requestedMode`, the explicit-mode router, and every now-dead backend,
   persistence, endpoint, IPC, generated, style, fixture, and test path. Render
   one text **Send** action in place of the current Route action; its
   submission, like every finalized pane voice input, always enters the local
   narrator/router. Keep the pane microphone outside the text composer as a
   separate capture affordance and retain operational/presentation controls
   such as Stop, approvals, retry/discard, Return to parent, and fork-lineage
   navigation. Do not hide or preserve explicit modes as compatibility code.
9. Pane focus/open behavior shared by validated master/local decisions and
   direct navigator selection.
10. Route/model/context observability in desktop recordings.

Exit criteria:

- ordinary pane text and voice reach the conversation narrator/router before
  becoming agent work
- the local AI can choose parent send/queue/steer, narrator answer, side, fork,
  master escalation, or clarification from one strict schema
- side/fork choices execute through the Phase 6 lifecycle and never contaminate
  the parent
- unrelated pane input reaches the global master, which finds or creates the
  destination and returns clarification to the originating pane when needed
- the master can find and open a recent topic, reusing an existing pane when
  policy says so
- shell text and voice share one durable master session even when the navigator
  is collapsed
- topic inputs and turns remain durable but hidden; the Easy Button restores an
  evolving current-state projection rather than request scrollback, and the
  master overlay never hydrates or renders completed requests
- an unresolved shell clarification survives close/reload/restart, while a
  completed interaction clears and shell microphone activation opens the
  active interaction
- the Easy Button text composer has one Send action, pane voice has no mode
  selector, and neither path can bypass AI classification
- no explicit pane input-mode contract, persisted field, router, or compatibility
  path remains
- neither routing AI can invoke unrestricted filesystem, shell, endpoint, or
  renderer operations

### Phase 8: Obsolete surface and backend eradication

**Status:** In progress. Items 1-3 are complete; items 4-5 remain.

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
- conversation-input idempotency, clarification linkage, ordered routing, and
  restart recovery
- local routing context bounds and strict decisions for parent send/queue/steer,
  narrator answer, side, fork, master escalation, and clarification
- absence of user-selected input modes or any classification bypass
- normalized master input validation, idempotent durable acceptance, changed-key
  conflicts, committed intake events, concurrent retries, and restart reads
- active shell-master interaction recovery, clarification continuity, terminal
  clearing, and the absence of a completed-input scrollback projection
- typed speech destination validation and routed conversation-input delivery
- global route decision validation, typed send/queue/steer semantics, linked
  pane escalations, and missing targets
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
- initial work seeds the topic projection; later routed inputs update
  `currentFocus`, queue, milestones, artifacts, and terminal state without
  rendering user-message bubbles or a request list
- a text composer containing only the input and one Send action, with identical
  Enter behavior; the microphone remains outside it and there are no Queue,
  Steer, Status, Side, Fork, direct-to-agent Send, or voice-mode controls
- stable accessible conversation palettes: distinct visible conversations when
  available, identical palettes for duplicate views, and non-color identity
  labels
- one navigator row per durable conversation across zero, one, or multiple
  panes; workspace grouping, paging, and large-list virtualization
- active master interaction state shared across sidebar, shortcut, app chrome,
  shell text, and shell voice entry points
- shell microphone activation opens the overlay; close/reload/restart restores
  only an unresolved clarification, successful navigation clears the active
  interaction, and completed requests never render as scrollback
- explicit scope separation between shell master text/voice and Easy Button
  conversation text/voice
- pane clarification and routing-result state shared across duplicate views of
  one conversation without leaking into another conversation
- global capture state independent of pane mounts
- finalized shell transcripts submitted exactly once to the master boundary,
  with exact-input retry, failure retention, and stale-runtime result rejection
- finalized Easy Button transcripts delivered exactly once to their frozen
  conversation input target for narrator routing
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
4. Submit natural-language inputs that the narrator routes as queue and steer
   for one conversation without affecting the other. Verify those durable
   inputs update the topic projection without appearing as message scrollback.
5. Ask one narrator naturally for status while its agent remains active.
6. Accumulate an over-budget trajectory while narration is unavailable, then
   recover through ordered catch-up; verify checkpoint maintenance cannot hide
   a milestone or delay a requested status/terminal projection.
7. Produce milestones, artifacts, an approval, completion, cancellation, and
   failure through real contracts.
8. Close a working pane, let work continue, and reopen it.
9. Restart/reload during active work and reconcile provider state while
   preserving voice and palette assignments.
10. Use shell speech with no pane, one pane, and multiple panes; verify the
    master and active narrators receive distinct stable voices when available
    and explicit reuse when the catalog is exhausted.
11. Submit ordinary text and voice from an Easy Button and exercise every local
    AI decision: parent send, queue, steer, narrator answer, side, fork, master
    escalation, and clarification. Verify the UI exposes no decision-mode
    controls and every input has a recorded narrator/router invocation.
12. Prove non-escalated pane input creates no `MasterInput`; prove an unrelated
    pane input creates exactly one linked escalation and returns any master
    clarification to its originating pane.
13. Route typed and spoken shell master input to an existing topic, focus its
    pane, create a new topic, choose side and fork outcomes, and retain an
    ambiguous clarification in the master overlay across close/reload. Verify
    shell microphone activation opens that active interaction, successful
    navigation clears or dismisses it, and completed requests do not accumulate
    into master scrollback.
14. Verify side and durable-fork isolation, disposal/restart behavior, lineage,
    navigator visibility, and parent continuation.
15. Verify old chat/terminal/workflow/git panes and endpoints do not exist.

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

### Narrator invocation and local routing

- conversation id and turn id when applicable
- call kind (`input_route`, `projection`, `status`, `terminal`, or `checkpoint`)
  and typed trigger/maintenance reason
- event counts by kind and input size/token estimate
- requested and resolved model/effort
- completed, cancelled, superseded, stale, committed, or failed outcome
- for routing: conversation input and clarification-parent ids, authoritative
  context sequence/range, allowed decision variants, structured
  decision, validation result, and executed effect
- for projection/status/checkpoint: context kind, checkpoint, included sequence
  range(s), intentionally omitted status-only backlog range, pre/post cursors,
  proposed cursor advance, prior milestone/final-summary counts, structured
  output, validation result, and commit decision

### Master routing

- shell or conversation-escalation source, originating input id, and
  focused/originating conversation hint
- candidate conversation ids and retrieval metadata
- route decision and validation result
- presentation intent
- requested/resolved model metadata
- shared master interaction/session id across shell text and shell voice entry
  surfaces

### Presentation identity

- conversation id
- requested palette selection, resolved palette id, catalog version, and
  allocation/reuse reason
- open pane ids sharing the presentation identity
- contrast/accessibility validation failure

### Speech

- capture lifecycle and transcription operation id
- capture origin plus the frozen master or conversation destination
- finalized transcript delivery command id, target, result, and failure
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
- The same global master is reachable through shell voice and shell-owned text
  UI, including while the left pane is collapsed.
- Topic inputs and turns remain durable but hidden. The Easy Button restores an
  evolving current-state projection rather than a request transcript, and the
  master overlay shows only one active request, unresolved clarification, or
  immediate result.
- The explicit shell microphone control opens the active master interaction;
  global enablement alone never implies continuous listening.
- Ordinary Easy Button text and voice enter the bound conversation's
  lightweight narrator/router, not the heavy agent or global master directly.
- The conversation narrator/router can choose parent send/queue/steer, narrator
  answer, ephemeral side, durable fork, global escalation, or clarification
  through a strict typed decision.
- The Easy Button composer exposes one Send action, Enter behaves identically,
  and pane voice has no input-mode selector. All three submission forms enter
  the narrator/router before any outcome is selected.
- No user-facing or hidden compatibility path can force a pane send, queue,
  steer, narrator status, side conversation, or fork around classification.
- Only a typed local escalation sends pane input to the global master, and any
  clarification remains linked to the originating pane and input.
- Asking for an update reaches the narrator without steering the primary agent.
- Narrator input includes an authoritative recent trajectory plus prior
  narration, not only new digest fragments.
- Checkpoint compaction covers only contiguous already-observed trajectory;
  backlog recovery cannot skip milestone evaluation, and checkpoint work cannot
  delay routed status or terminal narration.
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
- Both the master and a conversation narrator/router can select side or fork
  when in scope; side conversations and forks do not contaminate parent threads.
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
