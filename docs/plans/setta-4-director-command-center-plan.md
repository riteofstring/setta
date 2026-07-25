# Setta 4 Director Command Center — Plan of Record

**Date:** 2026-07-24
**Status:** Approved direction; Phase 0 in progress. The ownership, surviving-path,
and reusable-foundation inventories are committed in
[`docs/reports/setta-4-phase0-ownership-inventory-20260724.md`](../reports/setta-4-phase0-ownership-inventory-20260724.md).
No source cutover work has started.

## Product Decision

Setta 4 will replace the Niri-inspired pane workspace with a fullscreen AI command center organized
around a Director agent.

The user should express intent, see meaningful work unfold, respond when judgment or authorization is
needed, and receive durable results. They should not have to arrange a workspace, decide which pane
owns a request, or manually supervise every worker.

The product should:

- listen quickly and support natural voice interaction
- store voice credentials inside the desktop app
- start useful folderless conversations
- route intent across existing and new workstreams
- let the Director delegate, steer, recover, and summarize work
- show what is happening through a truthful semantic graph
- keep approvals, resource requests, artifacts, and final answers immediately accessible
- run as a native desktop experience now and support a phone client later
- sustain fluid 120 Hz interaction without hitching

This is a product and architecture cutover, not a skin over the pane system.
From the first usable Setta 4 shell onward, the product surface is the Director command center, not a
pane app with a graph added to it. Existing pane code may exist only as temporary internal
implementation inventory while its responsibilities are replaced, rehomed, or deleted. It must not
define new user-facing flows, contracts, navigation, or presentation authority.

## Design Direction

The committed fullscreen conversation mockup
[`docs/mockups/fullscreen_conversation_concept.html`](../mockups/fullscreen_conversation_concept.html)
is the visual fidelity target for Setta 4. The implemented shell should be basically this mockup
backed by real Setta contracts and data:

- one fullscreen living reasoning stream
- selected workstream navigation with adjacent context
- a left "Now" rail
- a right "Artifacts" rail
- a bottom Director composer
- compact user/final-answer history
- background workstreams represented without competing for the full screen
- dark full-canvas visual hierarchy with luminous graph nodes and edges
- floating labels tied to graph nodes
- compact top workstream navigation and status dots
- the same overall motion language for active work, branching, failure, recovery, and completion

The initial renderer should use **WebGL2**, GLSL shaders, buffers, instancing, and GPU timer queries.
Reimplement the user-visible composition, hierarchy, and motion language against Setta 4 contracts.
Prototype-only implementation details, fake demo data, dev controls, and scripted sample activity are
not production architecture.

The mockup was copied from the frozen `setta-3-fullscreen-conversation` branch at commit
`5d7c56780fc069979651cc2446f6d6b79c77a4fe`. Its production-visible UX is binding; its code and fake
data are not production contracts to merge wholesale.

### Mockup fidelity gate

Setta 4 is not a loose redesign inspired by the mockup. Before Phase 4 exits, the production shell
must pass a side-by-side visual and interaction review against the committed mockup at representative
desktop and phone-sized viewports.

The implementation must preserve:

- fullscreen command-center composition with the graph as the primary surface
- left Now rail, right Artifacts rail, bottom Director composer, and compact top workstream
  navigation
- central living graph with ladder, branching, merge, active, failed, recovered, and completed
  visual states
- floating graph labels and compact user/final-answer history
- background workstreams as lightweight visual context, not independent panes
- the mockup's dark, luminous, high-motion visual language

Allowed differences must be explicit and narrow: real data availability, accessibility, performance,
responsive layout, or a documented product correction. The dev bar, seeded demo conversations,
prototype control toggles, and exact mock text are prototype-only.

## Existing Foundations To Reuse

Setta 4 starts from current production systems, not from a blank rewrite. Reuse or rehome these
foundations where their ownership is already correct, while still changing contracts directly when
the Director product needs a better shape:

- `internal/master` already owns global intent routing, strict structured output schemas, trusted
  route authority, durable route decisions, clarification, cancellation, and route recovery records.
- `internal/conversation` already owns durable conversations, folderless conversations, local input
  routing, turns, queues, steering, cancellation, failures, approvals, artifacts, trajectory events,
  snapshots, event cursors, side conversations, narration, and replay.
- renderer conversation projection code already loads bounded snapshots, subscribes from durable
  cursors, batches event application per animation frame, preserves referential stability across
  unrelated conversations, and handles resync requirements.
- speech code already owns fast capture/playback paths, desktop voice credential storage, provider
  selection, credential validation, and safe credential restoration into the local runtime.
- existing performance recorders and reports already measure renderer frame time, long tasks, DOM
  growth, event projection bounds, and production Electron workflows.

These foundations are inputs to the cutover, not legacy contracts to preserve. Setta 4 should rename,
move, delete, or reshape them directly when pane ownership or Master terminology conflicts with the
Director command center.

### Codex protocol baseline

At this review, Setta's checked-in Codex app-server protocol snapshot records upstream commit
`2b9c05046038c038ec6bddb9db7d11394995372d`, while the local Codex reference repo is at
`99744cfe04`. Phase 1 must refresh the checked-in protocol snapshot, record the upstream commit used,
and regenerate affected surfaces before implementing the Director execution adapter or graph mapping.

The current Codex reference adds or sharpens app metadata/read APIs, environment connection and
status signals, exact raw response usage notifications, Guardian review and warning notifications,
model verification and safety-buffering notifications, plugin/script attribution on command
executions, and experimental thread realtime. These are provider adapter inputs. They do not become
canonical Setta state unless Setta translates them into typed durable events with redaction,
provenance, and lifecycle ownership.

## Superseded Direction

For the Setta 4 client, this plan supersedes product direction in documents that assume:

- Niri-style panes are the primary interaction model
- users manually compose a workspace from highly granular panes
- a phone mirrors the desktop pane strip
- a runtime picker or provider setup wizard is the central runtime UX

Those documents remain useful historical and technical research. They are not authority for the
Setta 4 interaction model.

## Hard Lines

This is an unreleased-product cutover.

- No backward-compatibility shims.
- No dual Niri/Director product modes.
- No old-layout migration or pane-state aliases.
- No pane, tile, split, workspace-strip, resize, drag, reorder, or manual layout affordances in the
  Setta 4 primary UI.
- No graph as a decorative overlay on the old pane shell.
- No semantic nodes inferred from text keywords.
- No fake progress, fake workers, fake branches, fake struggle, or fake recovery nodes.
- No exposure or reconstruction of hidden chain-of-thought.
- No node without durable semantic meaning and provenance.
- No per-node DOM graph.
- No React state updates on each animation frame.
- No polling where a push event can express the change.
- No second WebGPU renderer until a measured limitation justifies it.
- No OpenAI API key requirement for the initial product path. Live Codex development and E2E use
  existing ChatGPT authentication and must not use `OPENAI_API_KEY`.

Remove superseded code after its replacement is proven. Do not keep it as a fallback.

## Target Experience

The fullscreen command center has one selected workstream and many lightweight background
workstreams.

```text
┌───────────────────────────────────────────────────────────────────────────┐
│ Now                         selected workstream                 Artifacts  │
│ active goal                 semantic trajectory                outputs    │
│ workers                     user / Director dialogue            approvals  │
│ blockers                    meaningful live state              resources  │
│                                                                           │
│                         Ask the Director…                                 │
└───────────────────────────────────────────────────────────────────────────┘
```

The selected workstream receives full semantic detail. Adjacent or recent workstreams receive compact
summaries. Background workstreams expose only actionable aggregate state, such as running, blocked,
awaiting approval, failed, or complete.

The UI may animate and spatially organize meaning, but it must never invent meaning.

## Director Decision Protocol

The Director decision protocol is the product rule for turning user intent into work. The current
Master route decision catalog is the starting point, but Setta 4 must express decisions in
Director/workstream language and remove pane presentation authority from the model-facing contract.

For a submitted text or voice intent, the Director must produce exactly one typed decision:

- answer directly from app-visible state
- create a new folderless or resource-bound workstream
- send work to an idle existing workstream
- queue work behind an active workstream
- steer an active run
- ask a meaningful clarification question
- select or focus an existing workstream
- retry or recover a failed routing/execution path when durable state proves that is the right next
  action

The model may select only from decision kinds and targets authorized by trusted application state.
Provider ids, renderer commands, pane ids, resource paths, approval ids, artifact ids, and execution
leases must be added only by trusted product code after the model decision validates.

Clarification is a product action, not a schema repair path. Ask the user only when their answer can
change the outcome in a meaningful way, such as choosing between plausible workstreams or deciding
whether to steer active work versus queue follow-up work.

## Model Output Recovery

Invalid model output is an implementation failure to repair or route around, not a user-facing
decision point.

Structured Director and worker declarations must be validated before side effects. If a structured
decision or declaration is malformed, unauthorized, stale, or missing required provenance:

1. Reject it before committing product effects.
2. Retry once with the same authoritative context plus a public-safe validation diagnostic.
3. If state changed during the call, rematerialize trusted context and retry once against the current
   allowed decisions.
4. If a deterministic product invariant resolves the request without model judgment, commit a
   product-invariant decision. Examples include routing to the only allowed target, sending to an
   idle selected workstream when no other target is authorized, or preserving already queued work
   after a restart.
5. If the request still cannot be resolved, create a durable recovery or blocked state with a useful
   public summary, or ask a meaningful clarification question.

Do not show raw schema, JSON, routing, projection, or provider-format errors to the user. Do not add
keyword heuristics as recovery. Recovery must be driven by typed validation errors, trusted runtime
metadata, durable state, or explicit product invariants.

## Architectural Boundaries

### 1. Director Command Center

Replace scattered pane-oriented coordination with a deep application boundary. The renderer should
dispatch user intent and subscribe to an app-scoped snapshot without knowing how routing,
conversation execution, persistence, or presentation coordination works internally.

Illustrative TypeScript shape:

```ts
type DirectorIntent =
  | { type: "submit"; text: string; modality: "text" | "voice" }
  | { type: "select"; workstreamId: string }
  | { type: "move_selection"; direction: "previous" | "next" }
  | { type: "cancel"; workstreamId: string }
  | {
      type: "resolve_approval"
      approvalId: string
      decision: "approve" | "deny"
    }
  | { type: "open_artifact"; workstreamId: string; artifactId: string }

interface DirectorCommandCenter {
  dispatch(intent: DirectorIntent): Promise<DirectorReceipt>
  getSnapshot(): DirectorCommandCenterSnapshot
  subscribe(listener: () => void): () => void
}
```

This is a boundary sketch, not permission to hand-maintain cross-language mirrors. Go owns backend
contracts and values; affected TypeScript surfaces are generated.

The boundary must:

- support folderless and resource-bound workstreams
- preserve durable ordering and replay
- expose stable identities and typed statuses
- use structural sharing and narrow selectors
- avoid rerendering unrelated workstreams
- keep trusted routing and resource bindings out of model-authored data
- allow local and future managed execution through the same execution contract

### 2. App-Scoped Workstream Registry

Pane identity must stop being the owner of conversational work.

A workstream registry should project canonical backend state into:

- selected workstream
- ordered recent/adjacent workstreams
- background status summaries
- unresolved approvals
- unresolved resource requests
- available artifacts
- connection and replay state

Conversation identity, workstream identity, and resource binding must be explicit. A filesystem
workspace may be a resource of a workstream; it is not the prerequisite or identity for one.

The current conversation snapshot, event subscription, and navigator stores are reusable inputs, but
they are not the final registry. The Setta 4 registry must add:

- first-class folderless workstreams in the app-wide list
- a selected workstream persisted without pane identity
- app-wide aggregation of unresolved approvals, unresolved resource requests, artifacts, failures,
  and active/running/blocked counts
- app-scoped snapshot versioning and cursor recovery
- narrow selectors that keep unrelated workstreams referentially stable
- explicit mapping from existing conversation identity to workstream identity for the initial cutover

The registry replaces app-pane observation, pane-scene routing context, pane focus/open resolution,
and persisted layout as the application-level authority.

### 3. Director Execution Port

The Director should depend on a small consumer-owned execution boundary rather than provider-owned UI
concepts.

The execution boundary must cover:

- resolve an execution target from trusted capability state
- submit a turn
- steer an active turn
- cancel a run
- read a durable snapshot
- subscribe from a durable event cursor

Local and future managed-runtime adapters must pass the same contract suite. Provider identity,
credentials, leases, and accounting remain behind the boundary.

### 4. Semantic Graph Projector

The graph is a projection, not canonical state.

```text
durable typed events
        ↓
DirectorGraphProjector
        ↓
semantic graph snapshot
        ↓
packed GPU render snapshot
        ↓
WebGL2 renderer
```

The projector is deterministic and independently testable. Replaying the same ordered events must
produce the same semantic graph. Rendering code receives an immutable packed snapshot and owns no
business decisions.

## Visualization Projection Model

The command-center graph is a live semantic map of Setta workstreams. It is not a visualization of
raw provider packets, hidden model reasoning, token deltas, or every stored transcript item.

The mockup's visual vocabulary must survive, but it must map to real typed state. If Setta lacks a
source fact for a visually dramatic event, the renderer should show quieter activity on an existing
run or workstream node rather than inventing a new semantic node.

### Workstream identity

`workstream_id` is a Setta-owned durable identity. For the initial cutover, existing conversation
identity may be mapped one-to-one into a workstream registry record, but the renderer must receive a
workstream id and must not depend on pane ids.

`run_id` is the durable Setta turn/run identity. Provider thread ids, provider turn ids, provider
item ids, leases, and execution details remain evidence metadata behind trusted contracts. They are
not user-facing graph identities.

A durable child conversation or fork becomes a child workstream connected by a `delegated_to` edge. A
provider subagent without a durable Setta conversation remains a `delegation` node inside the parent
workstream; it does not become a background workstream until product state gives it a durable
address.

### Visual state vocabulary

The production renderer should preserve the mockup's visual feel without preserving its fake demo
semantics:

- listening/user-input visuals map to accepted text or voice input and capture state.
- active/thinking visuals map to an active run or public reasoning-summary/activity state, not hidden
  reasoning content.
- doing visuals map to typed commands, tools, file changes, hooks, searches, or other typed
  activities.
- amber/risk visuals map to typed approval waits, resource waits, blocked states, validation
  failures, retry, recovery, provider unavailability, or other explicit lifecycle facts. Do not add a
  generic `struggling` semantic node.
- branch visuals map to durable parallel activities, subagent delegations, forks, or workstream
  relationships with real causality.
- merge/synthesis visuals map to explicit plan updates, delegation joins, Director interpretations,
  public summaries, or final-answer production with provenance.
- success, failure, cancellation, and recovery visuals map to terminal or recovery lifecycle states.

Animation can express energy, focus, recency, and continuity. It cannot express facts the backend did
not commit.

### Initial event mapping

The first graph projector should implement this mapping from Go-owned facts. Missing source facts
must be added as typed events or records; do not fill gaps by parsing text.

| Source fact | Graph output | Notes |
| --- | --- | --- |
| Director/workstream creation, selection, and resource binding records | workstream status and registry membership | Add explicit records where the current conversation model has no app-scoped owner. |
| `user_input_accepted` | `user_goal` | The input event owns the user-authored summary and starts the visible causal chain. |
| Validated Director route decision or command | `director_decision` | The model may choose only authorized decision kinds and targets; trusted code attaches ids and capabilities. |
| `turn_queued`, `turn_promoted`, `turn_started`, `turn_steered` | `action` status updates plus selected-workstream milestones | Queue and run state should update one durable run node rather than create noisy duplicate nodes. |
| `plan_changed` | `plan` plus step `milestone` nodes | Current provider plan steps do not have stable ids; initial step node ids should be derived from the source event id and step index unless the contract adds step ids. Codex `PlanDelta` is a provisional live text signal only; do not create authoritative plan nodes by concatenating deltas. |
| `activity_started`, `activity_progressed`, `activity_completed`, `activity_failed` | `action`, `investigation`, `delegation`, or `artifact` | Map by typed activity kind: commands, hooks, MCP tools, dynamic tools, and file changes are `action`; web search and image view are `investigation`; subagents are `delegation`; generated media is `artifact`. Preserve trusted plugin/script attribution as evidence metadata. `other` is not visible until a typed owner assigns a precise semantic kind. |
| `file_change_proposed`, `file_change_completed` | `action` with file-change evidence | Approval state comes from approval events, not inferred from file diffs. |
| `approval_requested`, `approval_resolved` | `approval_required` | Secret answers and secret fields stay redacted in public graph state. |
| Resource request and resolution records | `resource_required` | Add explicit Director/workstream records if the current source only exposes resource needs indirectly. |
| `artifact_emitted` | `artifact` | Connect from the producing run/action with a `produced` edge. |
| `agent_liveness_changed`, `provider_lifecycle_changed` | `blocked`, `recovery`, or status update | Only typed lost/unavailable/reconciling/retryable states become visible nodes. Ready/attached states update metadata. |
| `model_rerouted` | `recovery` or `milestone` | Use the typed reroute reason/status; do not infer risk from surrounding text. |
| `turn_completed`, `turn_failed`, `turn_interrupted` | `completed`, `failed`, or `cancelled` | Terminal run state closes the visible causal chain for that run. |
| `public_reasoning_summary_updated`, `agent_message_completed` | public summaries and detail surfaces | These update accessible text and summaries; they do not create nodes by default. |
| Normalized Codex `thread/status/changed`, environment connection notifications, and environment status reads | workstream or provider lifecycle status, `blocked`, or `recovery` | Ready, pending, and attached states update metadata. Disconnected, unknown, or unavailable states become visible nodes only when typed lifecycle state says the user or Director needs to act. |
| Normalized Codex Guardian review, Guardian warning, model verification, and model safety-buffering notifications | `validation`, `approval_required`, `blocked`, or status update | Treat Guardian review notification payloads as unstable provider evidence behind the adapter. Durable Setta approval, validation, and recovery records own graph meaning. |
| Codex token usage and raw response completion notifications | accounting, context, and detail-surface telemetry | These are not semantic graph nodes by default. They may update cost/context/detail surfaces with explicit redaction and provenance. |
| Codex realtime transcript and audio notifications | live voice/transcript UI state | Transcript and audio deltas are transport state. Commit accepted user input, public assistant output, or public reasoning summaries as durable Setta events before changing semantic graph truth. |

### Provider notification adapter rules

The Codex adapter must translate provider notifications into Setta-owned typed events at the Director
execution port. Raw provider payloads, provider ids, leases, response ids, and realtime session ids
remain evidence metadata behind trusted contracts.

- `PlanDelta` is experimental and explicitly non-authoritative. The completed plan item or a
  Setta-owned `plan_changed` event owns durable plan state.
- `ReasoningTextDelta` is private reasoning and must not be persisted, displayed, summarized into
  graph state, or used as graph evidence. Reasoning summary notifications may update public summaries
  only.
- `RawResponseCompleted`, `RawResponseItemCompleted`, and `ThreadTokenUsageUpdated` are telemetry or
  evidence inputs, not visible semantic facts by default.
- `ContextCompactedNotification` is deprecated upstream. Prefer the durable `ContextCompaction` item
  or a Setta-owned compaction event when deciding graph history compaction.
- Guardian auto-review notifications are marked unstable upstream. Use them only through a narrow
  adapter that can change without changing Setta graph contracts.
- Environment connection and status notifications are lifecycle inputs. Ready states should stay as
  metadata; disconnected or unavailable states become visible only through typed blocked/recovery
  events.
- Thread realtime notifications are useful for live voice, transcript previews, output audio, and
  handoff state. They are not durable semantic graph state until committed through Setta's own event
  model.

### Edge derivation

Edges are derived from durable identity and event causality:

- `followed_by` connects ordered visible facts inside one run or workstream.
- `delegated_to` connects a Director decision or subagent activity to a durable child workstream or
  subagent node.
- `depends_on` connects queued work, resource waits, and explicit prerequisites.
- `blocked_by` connects blocked/recovery/action nodes to approvals, resources, provider lifecycle,
  or execution failures.
- `produced` connects actions or completed runs to artifacts.
- `validated_by` connects actions to explicit validation facts.
- `recovered_by` connects failed, interrupted, or unavailable states to retry/recovery actions.

Visual proximity, animation, force-layout attraction, or text similarity must not create semantic
edges.

### Level of detail and compaction

The selected workstream renders the full recent semantic trajectory. Adjacent or recent workstreams
render current status, last meaningful milestone, unresolved blockers, and produced artifacts.
Background workstreams render aggregate state only: active, queued, blocked, awaiting approval,
failed, complete, and counts.

Old history should compact only from durable summaries, explicit compaction events, or Director
interpretations with provenance. The renderer may hide detail for performance, but it must not
replace durable facts with unsourced generated summaries.

### Packed render snapshot

The semantic graph snapshot owns ids, kinds, statuses, evidence classes, source event ids, public
summaries, and edge meaning. The packed GPU snapshot owns numeric handles, typed arrays, positions,
colors, glyph indices, edge endpoints, and level-of-detail buckets.

Selection, hover, camera position, animation phase, and expansion state are view state. They can
influence rendering, but they must not write back into semantic graph truth.

## Live Update Model

The live graph should be push-driven end to end. It should not use renderer polling, app-state
polling, or periodic HTTP refreshes for ordinary updates.

The existing Setta/Codex path already has the pieces for a non-polling implementation:

1. Codex exposes turn progress as stream/notification events such as turn started, item updated,
   plan updated, thread status changed, environment connection changed, realtime transcript/audio
   updates, and turn completed.
2. `codexapp.Manager` routes provider notifications into scoped session event channels.
3. `agent.Runtime` reads `session.Events()` and normalizes provider notifications into typed Setta
   agent events.
4. Conversation services commit typed trajectory, approval, artifact, routing, and lifecycle events
   into the durable store.
5. Store commits call a committed-event wake notification after the transaction is durable.
6. Backend subscriptions read from a cursor, then block on the committed-event wake channel when no
   events are available. That wait is not polling; it is an event-driven sleep with replay from the
   durable cursor.
7. Electron main/preload forwards committed events through the typed conversation subscription IPC.
8. The renderer loads a snapshot with its cursor, subscribes from that cursor, batches pushed events
   into projection work, and requests animation frames only while visible changes or motion require
   drawing.

The current Codex reference also exposes experimental `thread/realtime/*` requests and pushed
notifications for thread-scoped realtime sessions over WebSocket or WebRTC. Setta can use that as a
non-polling execution-port adapter for live voice, transcript preview, output audio, and Codex
handoff state. Because the upstream surface is experimental, it must stay behind the execution
adapter. Realtime transcript and audio deltas may update ephemeral live UI, but semantic graph state
changes only after Setta commits durable accepted-input, public-output, summary, lifecycle, approval,
artifact, or recovery events.

Setta 4 should extend this pattern to an app-scoped Director subscription instead of creating a new
timer loop. The Director command center should expose:

- an initial app-scoped snapshot with a durable cursor
- a pushed committed-event stream from that cursor
- an explicit `resync_required` event when cursor replay cannot continue
- backpressure rules that keep semantic events lossless and allow only non-semantic text or process
  output deltas to be best effort
- renderer-side frame batching so a burst of provider events produces at most one semantic projection
  flush per frame

Provider liveness timeouts, if needed, belong in backend runtime reconciliation and must emit typed
lifecycle events. They are not a reason for the renderer to poll conversation state.

## Semantic Node Contract

Every visible node must represent a real event, state transition, declared intent, result, or
explicit Director interpretation.

Animations may decorate existing nodes and edges, including active pulses between committed events.
They must not create extra semantic nodes, imply a specific hidden reasoning step, or turn missing
provider data into fake work.

### Evidence classes

1. **Runtime fact** — emitted by execution, persistence, approval, resource, or artifact systems.
2. **Structured declaration** — explicitly emitted by the Director or worker through a typed
   protocol field.
3. **Director interpretation** — a public, attributable interpretation of supplied facts.
4. **View state** — selection, hover, expansion, or level of detail; never stored as semantic truth.

Interpretations must be visibly distinguishable from runtime facts. An interpretation requires:

- a public summary
- source event IDs
- the interpreting actor and model/runtime identity
- a confidence value when confidence is meaningful
- a timestamp

Do not store or display private reasoning. The public summary describes the conclusion needed for
coordination.

### Initial node kinds

The first catalog should be deliberately small:

- `user_goal`
- `director_decision`
- `plan`
- `milestone`
- `delegation`
- `investigation`
- `action`
- `resource_required`
- `approval_required`
- `artifact`
- `validation`
- `blocked`
- `retry`
- `recovery`
- `completed`
- `failed`
- `cancelled`

Do not add a generic `struggling` node. It is subjective, hard to validate, and does not tell the user
what action is needed. Represent observable states such as `blocked`, `retry`, `investigation`,
`validation` with failure status, or `recovery`. If the Director believes a run is at risk, it may
emit a sourced public interpretation with a precise meaning.

### Node fields

The Go-owned contract should include at least:

```text
id
kind
workstream_id
run_id, when applicable
actor
status
public_summary
evidence_class
source_event_ids
artifact_ids
created_at
updated_at
completed_at, when applicable
interpretation metadata, when applicable
```

Validation must reject:

- unknown kinds or statuses
- missing source evidence
- cross-workstream references without explicit authority
- impossible lifecycle transitions
- invented artifact, run, approval, or resource identifiers
- interpretations presented as runtime facts

### Edge kinds

Use typed edges:

- `followed_by`
- `delegated_to`
- `depends_on`
- `blocked_by`
- `produced`
- `validated_by`
- `recovered_by`

Do not use visual proximity as a substitute for a semantic relationship.

### Visual catalog

Icons, color, shape, animation, and emphasis are exhaustive mappings over node kind, evidence class,
and status. Use TypeScript discriminated unions, `satisfies`, and `never` assertions so adding a
contract value cannot silently fall through to a generic visual.

A development gallery should render deterministic fixtures for every valid node, edge, status,
evidence class, and relevant combination. Gallery fixtures are produced from real contract shapes,
not a parallel mock vocabulary.

## Privacy And Durable Data Boundaries

Setta 4 must distinguish public coordination state from private or sensitive implementation data.

Durable semantic events and graph nodes may contain user-authored requests, public assistant output,
public reasoning summaries, public Director interpretations, artifact metadata and payloads, approval
and resource request metadata, and non-secret approval resolutions.

They must not contain:

- hidden chain-of-thought or reconstructed private reasoning
- OpenAI API keys, voice-provider credentials, ephemeral transcription secrets, or runtime tokens
- raw provider protocol payloads that may contain credentials or unrelated private context
- secret approval answers, except through an explicit encrypted owner contract
- unsanitized diagnostic blobs in user-visible summaries, recordings, or performance reports

Secret structured-input answers may be sent to the provider path that requested them, but public
trajectory events, graph nodes, renderer snapshots, recordings, and logs must carry redacted state
and enough provenance to explain what happened without revealing the secret.

## Rendering and Performance Contract

### Renderer choice

Use one **WebGL2** canvas for the semantic trajectory. Keep React/DOM for the composer, rails,
dialogs, accessible controls, and detailed text views.

WebGL2 is the current prototype technology and provides the cross-platform reach needed for desktop
and a future phone client. WebGPU may be reconsidered only if profiling demonstrates a concrete
WebGL2 limitation that affects the product.

### Frame budget

At 120 Hz, one frame has approximately **8.33 ms**. Treat this as an end-to-end interaction budget,
not merely a shader target.

Initial budgets:

- main-thread frame work: no more than 2 ms at p95 during steady animation
- GPU frame time: no more than 4 ms at p95 during steady animation
- no synchronous work proportional to total conversation history during interaction
- no task longer than one frame during workstream navigation
- no shader compilation, large allocation, or texture upload on an interaction-critical path

Record p50, p95, and p99. Average FPS alone is not an acceptance metric because it hides hitching.

### Render architecture

- pack render data into reusable typed arrays
- reuse GPU buffers and update changed ranges
- precompile and prewarm shaders
- batch compatible geometry and use instancing
- keep layout/projection off the main thread when measurement shows it threatens the budget
- never read layout in the animation loop
- never update React state per frame
- run `requestAnimationFrame` only while motion or visible live changes require it
- sleep when the graph is static, occluded, or the app is backgrounded
- resume without a catch-up burst
- clamp device pixel ratio or render scale through explicit quality tiers
- use GPU timing where supported and CPU marks around projection, packing, upload, and draw

### Level of detail

Rendering cost must scale with what the user can perceive, not with all durable history.

- selected workstream: full meaningful trajectory
- adjacent workstreams: compact summaries
- background workstreams: aggregate status only
- old history: compacted semantic milestones and outcomes
- text: bounded labels in the canvas; full accessible text in DOM detail surfaces

### Required scenarios

Baseline and remeasure:

- one active workstream
- interleaved Director and worker activity
- navigation among 100 workstreams
- a large history compaction boundary
- an approval or artifact arriving during animation
- cancellation, failure, retry, and recovery
- restart and durable replay
- phone-sized viewport at realistic device pixel ratios
- desktop 4K and 6K viewports
- sustained activity that exposes garbage collection or thermal degradation
- foreground/background and occlusion transitions

Append immutable before/after reports under `docs/reports/performance/`. Include hardware, display
refresh rate, viewport, device pixel ratio, scenario, build identity, measurement method, p50/p95/p99
CPU and GPU frame times, long tasks, dropped frames, memory behavior, and profiler artifacts.

### Measurement ownership

Reuse the existing Electron workflow recorder, renderer frame sampler, long-task observer, DOM budget
checks, and append-only performance report format where they fit. The WebGL2 graph renderer also
requires new measurement ownership:

- deterministic graph fixture generation at the packed snapshot boundary
- CPU marks for projection, packing, buffer upload, and draw submission
- GPU timer-query sampling where the platform supports it
- canvas-pixel checks for nonblank rendering and correct framing
- an explicit target hardware, display refresh-rate, viewport, and device-pixel-ratio matrix before
  Phase 2 exits

## Implementation Sequence

Each phase ends with a coherent boundary and explicit deletion or acceptance gate. Do not begin by
deleting Niri; replace its product responsibilities first.

### Phase 0 — Establish the implementation baseline

1. Confirm the current app can produce a reproducible desktop development build.
2. Inventory Niri/pane responsibilities and assign each one to retain, replace, or delete. **Done —
   inventory section 1.**
3. Identify the conversation, approval, resource, speech, credential, and Electron production paths
   that must survive the cutover. **Done — inventory section 2.**
4. Inventory existing Master, conversation, renderer projection, speech, and performance foundations
   that should be reused, rehomed, reshaped, or deleted. **Done — inventory section 3.**
5. Keep the approved fullscreen concept artifact present under `docs/mockups/`, or expand this plan
   into a self-contained visual specification if that artifact is superseded. **Done —
   `docs/mockups/fullscreen_conversation_concept.html`.**
6. Convert the approved mockup into a fidelity checklist that separates required production UX from
   prototype-only fake data, dev controls, and demo scripts.
7. Capture the current interaction and rendering performance baseline before changing renderer
   assumptions.
8. Define the target performance hardware, display, viewport, and device-pixel-ratio matrix.

The committed inventory is
[`docs/reports/setta-4-phase0-ownership-inventory-20260724.md`](../reports/setta-4-phase0-ownership-inventory-20260724.md).
Its section 4 lists the contract gaps Phase 1 must close, and its section 5 records the verification
that needs an interactive desktop session.

Exit gate:

- reproducible desktop development build
- Niri ownership inventory committed — met
- retained/replaced/deleted production responsibilities documented — met
- reusable foundation inventory committed — met
- fullscreen design direction is present in the branch — met
- mockup fidelity checklist is committed
- baseline performance report committed
- target performance matrix committed

### Phase 1 — Extend truth before visuals

1. Start from existing Go-owned conversation statuses, input routing decisions, turn lifecycles,
   trajectory events, approval records, artifact records, snapshots, cursors, and Master route
   decisions.
2. Refresh the checked-in Codex app-server protocol snapshot from the current reference repo, record
   the upstream commit used, and regenerate affected Go and TypeScript surfaces.
3. Define the Codex-to-Setta provider notification adapter matrix for thread status, environment
   connection/status, plan deltas, reasoning summaries and private reasoning, raw response usage,
   Guardian review/warning, model verification, model safety buffering, context compaction, command
   attribution, and thread realtime.
4. Define the missing Go-owned workstream, node, edge, evidence, status, and interpretation
   contracts.
5. Define lifecycle tables for workstreams, runs, queue items, approvals, resource requests,
   artifacts, semantic nodes, and recovery states.
6. Codify the initial source-fact-to-node mapping in Go-owned contracts.
7. Define the app-scoped Director snapshot, cursor, event, and `resync_required` contracts.
8. Identify missing typed runtime events; add explicit events instead of UI inference.
9. Generate TypeScript surfaces.
10. Build deterministic event histories covering every node lifecycle and live replay boundary.
11. Implement the pure `DirectorGraphProjector`.
12. Add replay, ordering, invalid-transition, provenance, redaction, live resync, and recovery
    boundary tests.
13. Build the exhaustive node/edge visual gallery from production contract fixtures.

Exit gate:

- checked-in Codex protocol inputs are current for the implementation baseline
- the provider notification adapter matrix is explicit and covered by fixtures
- every displayed semantic value has a defined owner and provenance
- replay is deterministic
- the app-scoped live graph subscription is cursored and push-driven
- realtime transport deltas stay behind the execution adapter until committed as durable Setta events
- lifecycle transitions are explicit and validated
- no graph node depends on keyword heuristics or private reasoning
- invalid model output resolves through typed recovery policy
- exhaustive visual mappings compile without a fallback case

### Phase 2 — Prove the standalone 120 Hz renderer

1. Implement the mockup's WebGL2 visual language as normal production source files.
2. Define the packed immutable GPU snapshot boundary.
3. Implement the fullscreen graph canvas independently of production state.
4. Add quality tiers, level of detail, buffer reuse, shader prewarming, and an idle scheduler.
5. Reuse existing frame and long-task instrumentation where applicable.
6. Add graph-specific fixture generation, CPU marks, GPU timer queries, and canvas-pixel checks.
7. Add burst-update fixtures that simulate pushed event batches and cursor replay.
8. Run the required scale and viewport scenarios against deterministic fixtures.
9. Profile with browser/Chrome developer tools and GPU timer queries.
10. Fix hitches before integrating live app state.

Exit gate:

- deterministic renderer fixtures visually match the mockup's graph language, labels, rails, and
  composer integration points
- the target hardware sustains the 120 Hz budgets in representative motion
- p95 and p99 frame time, long tasks, memory, and dropped frames are recorded
- phone-scale and high-DPI behavior are bounded
- graph fixture harness and report template are committed
- burst updates do not produce per-event React renders or animation-frame floods
- no business logic exists in the renderer

### Phase 3 — Introduce the Director Command Center

1. Adapt the existing Master route decision catalog into the Director decision protocol.
2. Rename product-facing Master concepts to Director where they represent the new product role.
3. Implement the deep `DirectorCommandCenter` boundary.
4. Add the app-scoped workstream registry with push subscriptions and durable cursors.
5. Include folderless and resource-bound conversations as first-class workstreams.
6. Move folderless routing, clarification, conversation creation, queueing, steering, cancellation,
   approval, resource requests, model-output recovery, and product-invariant decisions behind the
   boundary.
7. Replace pane presentation intents with workstream presentation intents.
8. Fan in current conversation and Master event streams through the Director registry without adding
   UI polling.
9. Preserve strict trusted-target validation.
10. Keep current conversation stores and event streams as canonical inputs where their ownership is
   already correct.

Exit gate:

- all primary user intents can be expressed without pane identity
- folderless workstreams appear in the app-scoped registry
- the Director registry delivers app-scoped live updates from durable cursors without polling
- 100 background workstreams do not cause unrelated renderer rerenders
- reload reconstructs the same selected workstream and semantic graph
- malformed Director output does not surface as an internal routing/schema error
- local execution passes the Director execution contract suite

### Phase 4 — Build the native fullscreen shell

1. Replace the app shell with a production implementation of the mockup's fullscreen composition:
   selected workstream, semantic graph, rails, top workstream navigation, compact history, and
   Director composer.
2. Connect speech capture and playback through the same Director intents as text.
3. Implement previous/next and direct workstream selection.
4. Render approvals and resource requests as first-class actionable state.
5. Render artifacts as typed outputs; open rich details in accessible DOM/native surfaces.
6. Integrate the WebGL2 canvas through packed snapshots, not component-level node state.
7. Connect the live Director subscription to graph projection, packing, buffer updates, and frame
   scheduling.
8. Reprofile all required live scenarios and record a second append-only report.

Exit gate:

- side-by-side screenshots and screen recordings show the production shell is recognizably the
  approved mockup, with only documented fidelity differences
- the fullscreen workflow covers ordinary chat and active agent work
- the UI remains useful when no folder has been selected
- semantic facts and Director interpretations are visually distinguishable
- every mockup-inspired visual state is backed by typed Setta state or explicit view state, not fake
  semantic nodes
- no pane, tile, split, resize, reorder, or manual layout affordance is visible in the Setta 4 shell
- live provider, routing, approval, artifact, and lifecycle events appear without user refresh or
  renderer polling
- keyboard, pointer, voice, focus, and screen-reader paths are explicit
- integrated performance still meets the frame-time budgets

### Phase 5 — Remove Niri and pane ownership

Delete the old system only after Phase 4 owns its product responsibilities.

Remove:

- `desktop/src/renderer/src/workspace-layout/`
- pane layout stores, coordinators, camera/navigation machinery, and persisted layout
- pane-bound conversation routing and presentation resolution
- pane drag, resize, reorder, overview, and manual layout controls
- Niri-specific shortcuts, toolbar, mobile pane controls, and CSS
- workspace-layout endpoints, IPC, and generated contracts with no Setta 4 owner
- Niri-specific Electron E2E workflows

Retain or rehome:

- canonical conversation stores and projections
- conversation event stream/replay infrastructure
- Director routing and clarification behavior
- approvals and resource requests
- speech and safe credential storage
- browser/native content only where it becomes a typed capability or artifact view

Exit gate:

- no primary workflow references pane identity
- no dead pane/layout persistence remains
- no dual UI path remains
- generated contracts are regenerated after owner changes
- a full source search finds no accidental Niri product dependency

### Phase 6 — Production-path verification and Setta 4 checkpoint

When the implementation is ready for final verification and the user asks verification to begin:

1. Run focused projector, registry, renderer, and Director boundary tests.
2. Run deterministic Electron E2E through production
   main/preload/renderer/HTTP/store paths.
3. Cover folderless start, routing, streaming, queueing during a run, steering, approvals, resource
   requests, completion, cancellation, failure, retry/recovery, artifact arrival, workstream
   switching, and restart/replay.
4. Run live Codex E2E with local ChatGPT auth and without `OPENAI_API_KEY`.
5. Run final performance scenarios and compare them with the recorded baselines.
6. Run the repository's requested verification gates and inspect generated output.
7. Freeze a named green Setta 4 checkpoint.

The deterministic E2E suite is the product cutover proof. Component tests alone are insufficient.

## Completion Definition

Setta 4 is complete when:

- a user can open the app with no selected folder and start useful work immediately
- the production UI visibly matches the approved fullscreen mockup in first-screen composition,
  visual hierarchy, graph language, rails, composer, compact history, and motion feel, except for
  explicitly documented differences forced by real data, accessibility, responsiveness, or measured
  performance
- the Director can route, create, delegate, steer, cancel, clarify, and recover through typed paths
- invalid model outputs recover or become useful durable state without exposing internal errors
- approvals, resources, artifacts, and outcomes are durable and actionable
- public semantic state respects credential, secret, and private-reasoning boundaries
- every semantic node and edge has real meaning, provenance, and deterministic replay
- live graph updates are pushed from durable provider/conversation events and do not depend on
  renderer polling
- the fullscreen WebGL2 command center meets the measured 120 Hz budgets on target hardware
- the experience scales down to a phone-sized viewport without adopting the old pane model
- Niri/manual pane control is absent from the production path
- deterministic production Electron E2E covers the mission-critical lifecycle
- live Codex E2E passes with ChatGPT auth and no OpenAI API key

## Immediate Next Actions

1. Convert the fullscreen mockup into a committed fidelity checklist: required production UX,
   prototype-only demo behavior, typed-state requirements for every visual mode, and any known
   implementation risks to matching the mockup.
2. Define the target performance hardware, display, viewport, and device-pixel-ratio matrix.
3. Capture the current interaction and rendering performance baseline.
4. Refresh the Codex app-server protocol snapshot and define the Codex-to-Setta provider notification
   adapter matrix.
5. Start Phase 1 by extending the existing routing, trajectory, snapshot, subscription, approval,
   artifact, speech, realtime, lifecycle, and telemetry contracts into the Setta 4 workstream and
   semantic graph contracts.
