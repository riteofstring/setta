# Setta 4 Director Command Center — Plan of Record

**Date:** 2026-07-24
**Status:** Approved direction; Phase 0 repository work and Phases 1 and 2 are
complete, the shared Phase 1/2 audit boundary is closed, and Phase 3 is complete:
the Director decision protocol and its strict trusted-target validation are
committed in `internal/director/decision_*.go` (items 1 and 9), so the Master
route decision catalog now has a Director-language replacement with no pane
presentation authority in the model-facing contract. The app-scoped workstream
registry is committed in `internal/director/registry*.go` (items 4, 5, 8's
conversation half, and 10): it folds the durable committed log — conversation
records, turns, queues, trajectory events, and artifacts, plus Director facts
committed to their own `director:facts` stream — into workstreams, aggregates,
approvals, resource requests, artifacts, selection, and graphs, and publishes the
change on an epoch-scoped push stream with typed resync. Pane identity no longer
has an application-level owner to be replaced by; it has a replacement. The
decision half of item 3 is committed in `registry_decisions.go` and
`decision_router.go`: the registry materializes a `DirectorDecisionContext` from
the same durable fold the command center renders, and the router turns one
submitted intent into one authorized decision, repairing invalid model output
through the typed ladder instead of surfacing it. The router deliberately does
not commit the decision; the executor commits it before execution, because the
work it authorizes spans additional durable writes and a provider launch and
cannot share the decision transaction. Item 3's dispatch surface is committed in
`internal/director/command_center.go`, `internal/httpapi/director_handlers.go`,
and `desktop/src/main/director-*.ts`: `DirectorCommandCenter` is the one boundary
the shell talks to, three endpoints carry it, and the desktop forwards the
app-scoped subscription through typed IPC. The Director contracts are therefore
reachable in `desktop/src/generated/backend.ts`, and Phase 1 item 13's visual
gallery now consumes them. Executing a routed decision is committed in
`internal/director/execution.go`,
`decision_execution.go`, and `internal/conversation/service_director_commands.go`
(item 6's execution half): `WorkstreamExecution` is the consumer-owned execution
port, and `DecisionExecutor.Execute` is total over a `RoutedIntent` — it commits
the durable decision, starts or delivers the work through the port, turns work a
folderless workstream cannot start yet into a durable resource request, and
commits the Director's own answers and questions as decisions that happened in no
workstream. The executor is now reachable: the `submit` intent is in the dispatch
catalog, `internal/director/decision_call.go` owns the bytes the Director is sent,
`internal/runtime/director_decision_caller.go` runs one isolated structured turn
per decision, and `internal/runtime/director_workstream_execution.go` is the local
adapter behind the port. One typed text or voice request therefore travels from
the shell's front door to a durable run. The three direct commands are committed
in `internal/director/dispatch_execution.go`: `cancel_run`, `resolve_approval`,
and `resolve_resource_request` complete item 6's move behind the boundary, so
every primary user intent is now expressible without pane identity. Item 6's
remaining product gap is recorded in the immediate next actions: work that could
not start for want of a folder is not re-delivered when the folder arrives.
Phase 2 owns the standalone renderer:
the packed GPU render snapshot, its deterministic fixture generation, and its
burst/cursor-replay fixtures are committed in
`desktop/src/renderer/src/features/director-graph/` (items 2 and 7); the WebGL2
renderer itself is committed in
`desktop/src/renderer/src/features/director-graph/render/` (items 1, 3, 4, 5);
and the measurement half is committed as `render/graph-pixel-check.ts`, the
fixture harness page in `features/director-graph/harness/`, and the workflow
`desktop/tests/electron/director-graph-renderer-performance.test.mjs` (items 6,
8, 9, and 10). The deferred production-contract visual gallery is now committed:
`cmd/generate-director-graph-gallery` projects `ProjectionFixtures()` into
generated TypeScript fixture data, `semantic-graph-visual-catalog.ts` maps the
generated semantic values exhaustively onto packed visual vocabulary,
`semantic-graph-packer.ts` packs those graphs for the existing WebGL2 canvas, and
the `director-graph-gallery` renderer entry displays the coverage-bearing
fixture catalog. Measured results for every scenario and tier are in
[`docs/reports/performance/setta-4-graph-renderer-scenarios-20260724.md`](../reports/performance/setta-4-graph-renderer-scenarios-20260724.md).
The corrective audit measurement is in
[`docs/reports/performance/setta-4-graph-renderer-phase2-audit-20260724.md`](../reports/performance/setta-4-graph-renderer-phase2-audit-20260724.md).
Real 4K, 6K, and phone hardware stays a release gate: those tiers are emulated.
The checked-in
Codex protocol snapshot is refreshed and the provider
notification adapter matrix is committed in `internal/agent/provider_notification_matrix.go`
(Phase 1 items 2 and 3). The Go-owned Setta 4 contract layer is committed in
`internal/director` (Phase 1 items 4 through 7): workstream, semantic node, edge,
evidence, status, and interpretation contracts; lifecycle tables for workstreams,
runs, queue items, approvals, resource requests, artifacts, semantic nodes, and
recovery; the source-fact-to-node mapping; and the app-scoped snapshot, cursor,
event, and `resync_required` contracts. The missing typed Director runtime events
and the pure `DirectorGraphProjector` are committed in the same package (Phase 1
items 8, 10, 11, and 12): `facts.go` owns the durable Director facts, `fixtures.go`
owns the deterministic histories, and the projector plus its replay, ordering,
lifecycle, provenance, redaction, resync, and recovery boundary tests cover every
node kind and edge kind. The Codex adapter now delivers typed provider activities
into that mapping, so `investigation` nodes, MCP tool calls, and hook executions
are reachable from live work instead of only from fixtures. Phase 1 item 14 is
complete: the remaining `normalized` notifications now have durable Setta owners —
typed provider lifecycle records for thread status, environment connection, and
thread close; a `validation_recorded` trajectory event for Guardian review and
model verification; and approval reconciliation for `serverRequest/resolved`.
Provider lifecycle failures and retry intent use exact typed reasons, raw provider
diagnostics stay behind the adapter, and Guardian risk remains a typed field.
The shared audit's final production-path evidence is green: all eight deterministic
topic-conversation Electron workflows passed; the single live-provider attempt
passed the agent protocol, conversation side-isolation, and runtime
topic-conversation suites with local ChatGPT auth and no `OPENAI_API_KEY`; and
all 19 standalone graph-renderer scenario runs passed with an empty renderer
console. The audit did not retry unavailable physical-device, interactive
baseline, or extended-soak release gates.
The ownership, surviving-path, and reusable-foundation inventories are committed in
[`docs/reports/setta-4-phase0-ownership-inventory-20260724.md`](../reports/setta-4-phase0-ownership-inventory-20260724.md),
the mockup fidelity checklist in
[`docs/reports/setta-4-mockup-fidelity-checklist-20260724.md`](../reports/setta-4-mockup-fidelity-checklist-20260724.md),
and the target performance matrix in
[`docs/reports/performance/setta-4-target-performance-matrix-20260724.md`](../reports/performance/setta-4-target-performance-matrix-20260724.md).
The only remaining Phase 0 action needs an interactive desktop session, not a
repository edit. The Phase 4 production-shell cutover has started: the primary
renderer app now mounts the Director command-center shell instead of the pane
workspace, drives the WebGL2 graph from the app-scoped Director snapshot and
pushed event stream, exposes workstream navigation and a text Director composer
through generated Director intents, captures finalized voice transcripts through
the same submit intent with voice provenance, and renders the Now,
approval/resource, and artifact rails from generated Director contracts. Director
speech playback is now committed: the Go-owned speech contract includes the
app-scoped `director` speaker, runtime synthesis resolves Director answer and
clarification receipts from durable Director decision facts, and the production
shell wraps the command center in the existing playback controller so accepted
Director replies can be spoken from the same submitted text or voice intent.
Structured approval answer collection, rich artifact detail opening, final
mockup-fidelity work, and live integrated performance reporting remain Phase 4
work.
Supply-chain release gate: `desktop/package.json` ignores `CVE-2026-14257`
only because the first patched `brace-expansion` release, `5.0.8`, was published
on 2026-07-23 and cannot satisfy the checked-in seven-day release-age policy
until 2026-07-30. Remove that audit ignore and update the override once the
patched release is eligible.

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

The binding row-by-row checklist for that review is
[`docs/reports/setta-4-mockup-fidelity-checklist-20260724.md`](../reports/setta-4-mockup-fidelity-checklist-20260724.md).
Its section 5 is the complete list of allowed differences; adding one requires a plan amendment.

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

Setta's checked-in Codex app-server protocol snapshot records upstream commit
`99744cfe04806ebaa1e5d08e3e790070f852472b` in `internal/codexapp/protocolschema/UPSTREAM`. The
refresh regenerated `internal/codexapp/protocol_gen.go`; no generated TypeScript surface changed,
because Codex protocol types stay behind the Go execution adapter and are not part of the renderer
contract surface.

That refresh added or sharpened app metadata/read APIs, environment connection and
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
      type: "resolve_approval";
      approvalId: string;
      decision: "approve" | "deny";
    }
  | { type: "open_artifact"; workstreamId: string; artifactId: string };

interface DirectorCommandCenter {
  dispatch(intent: DirectorIntent): Promise<DirectorReceipt>;
  getSnapshot(): DirectorCommandCenterSnapshot;
  subscribe(listener: () => void): () => void;
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

| Source fact                                                                                                  | Graph output                                                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Director/workstream creation, selection, and resource binding records                                        | workstream status and registry membership                         | Add explicit records where the current conversation model has no app-scoped owner.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `user_input_accepted`                                                                                        | `user_goal`                                                       | The input event owns the user-authored summary and starts the visible causal chain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Validated Director route decision or command                                                                 | `director_decision`                                               | The model may choose only authorized decision kinds and targets; trusted code attaches ids and capabilities.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `turn_queued`, `turn_promoted`, `turn_started`, `turn_steered`                                               | `action` status updates plus selected-workstream milestones       | Queue and run state should update one durable run node rather than create noisy duplicate nodes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `plan_changed`                                                                                               | `plan` plus step `milestone` nodes                                | Current provider plan steps do not have stable ids; initial step node ids should be derived from the source event id and step index unless the contract adds step ids. Codex `PlanDelta` is a provisional live text signal only; do not create authoritative plan nodes by concatenating deltas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `activity_started`, `activity_progressed`, `activity_completed`, `activity_failed`                           | `action`, `investigation`, or `delegation`                        | Map by typed activity kind: commands, hooks, MCP tools, dynamic tools, file changes, and generated media are `action`; web search and image view are `investigation`; subagents are `delegation`. Generating media is the action that produces an artifact, not the artifact: the `artifact` node appears when `artifact_emitted` names a durable artifact, because a node claiming to be an artifact without naming one has no provenance to open. Preserve trusted plugin/script attribution as evidence metadata. `other` is not visible until a typed owner assigns a precise semantic kind. The Codex adapter reports the provider's own activity kind, so this resolver reads a reported fact rather than a bucket the adapter chose; a collab-agent call stays `other` until Setta can name the receiver it addresses. |
| `file_change_proposed`, `file_change_completed`                                                              | `action` with file-change evidence                                | Approval state comes from approval events, not inferred from file diffs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `approval_requested`, `approval_resolved`                                                                    | `approval_required`                                               | Secret answers and secret fields stay redacted in public graph state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Resource request and resolution records                                                                      | `resource_required`                                               | Add explicit Director/workstream records if the current source only exposes resource needs indirectly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `artifact_emitted`                                                                                           | `artifact`                                                        | Connect from the producing run/action with a `produced` edge. The event carries the artifact's kind and title, so a node never has to resolve a second record — or invent a label — to say what was produced.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `agent_liveness_changed`, `provider_lifecycle_changed`                                                       | `blocked`, `recovery`, or status update                           | Only typed lost/unavailable/reconciling/retryable states become visible nodes. Ready/attached states update metadata.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `model_rerouted`                                                                                             | `recovery` or `milestone`                                         | Use the typed reroute reason/status; do not infer risk from surrounding text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `turn_completed`, `turn_failed`, provider/system `turn_interrupted`                                          | `completed`, `failed`, or `cancelled`                             | Terminal run state closes the visible causal chain for that run. A user `turn_interrupted` is the accepted control request and remains metadata until the terminal fact arrives.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `public_reasoning_summary_updated`, `agent_message_completed`                                                | public summaries and detail surfaces                              | These update accessible text and summaries; they do not create nodes by default.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Normalized Codex `thread/status/changed`, environment connection notifications, and environment status reads | workstream or provider lifecycle status, `blocked`, or `recovery` | Ready, pending, and attached states update metadata. Disconnected, unknown, or unavailable states become visible nodes only when typed lifecycle state says the user or Director needs to act. `ProviderLifecycle` carries a typed reason, so a blocked or recovering node says which provider fact produced it without reading its message.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `validation_recorded`                                                                                        | `validation`                                                      | The durable owner of a typed provider check over declared work. A check with a verdict becomes a node connected to what it covered by `validated_by`; a check still running updates metadata, because a node with no verdict tells the user nothing to act on. Normalized Codex Guardian review and model verification notifications commit it. Guardian review payloads are unstable upstream, so only the review id, the reviewed item, the typed status, and the typed risk level cross the adapter.                                                                                                                                                                                                                                                                                                                       |
| Codex token usage and raw response completion notifications                                                  | accounting, context, and detail-surface telemetry                 | These are not semantic graph nodes by default. They may update cost/context/detail surfaces with explicit redaction and provenance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Codex realtime transcript and audio notifications                                                            | live voice/transcript UI state                                    | Transcript and audio deltas are transport state. Commit accepted user input, public assistant output, or public reasoning summaries as durable Setta events before changing semantic graph truth.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### Provider notification adapter rules

The Codex adapter must translate provider notifications into Setta-owned typed events at the Director
execution port. Raw provider payloads, provider ids, leases, response ids, and realtime session ids
remain evidence metadata behind trusted contracts.

`internal/agent/provider_notification_matrix.go` is the committed matrix. Every server notification
in the checked-in snapshot has exactly one rule stating the maximum authority the adapter has over
it: `normalized` (may become typed Setta agent events), `evidence` (accounting, context, and detail
surfaces only), `transport` (ephemeral live UI only), `private` (never delivered), `host` (owned by a
Setta service outside the Director execution port), or `unowned` (ignored until a typed owner exists).
The matrix drives the protocol-level notification opt-out list, and a normalizer may exist only for a
method the matrix marks `normalized`, so refreshing the snapshot cannot introduce a provider signal
that reaches product state without a decision. The rules below are the product reasoning behind those
dispositions.

- `PlanDelta` is experimental and explicitly non-authoritative. The completed plan item or a
  Setta-owned `plan_changed` event owns durable plan state.
- `ReasoningTextDelta` is private reasoning and must not be persisted, displayed, summarized into
  graph state, or used as graph evidence. Setta opts out of its delivery at initialize so it is never
  received. Reasoning summary notifications may update public summaries only.
- `RawResponseCompleted`, `RawResponseItemCompleted`, and `ThreadTokenUsageUpdated` are telemetry or
  evidence inputs, not visible semantic facts by default.
- `ContextCompactedNotification` is deprecated upstream. Prefer the durable `ContextCompaction` item
  or a Setta-owned compaction event when deciding graph history compaction.
- Guardian auto-review notifications are marked unstable upstream. Use them only through a narrow
  adapter that can change without changing Setta graph contracts.
- `GuardianWarning` is the provider's own sentence about an outcome the typed Guardian review
  notification already reports, or about a turn it is about to interrupt. Normalizing it would commit
  a second durable record built from text, so it is evidence and the typed review plus the turn's
  terminal state own the meaning.
- `ModelSafetyBufferingUpdated` changes how fast the provider delivers a response, not what the run is
  doing. It is evidence for a latency detail surface; the turn's own lifecycle owns what the user acts
  on.
- Environment connection and status notifications are lifecycle inputs. Ready states should stay as
  metadata; disconnected or unavailable states become visible only through typed blocked/recovery
  events.
- `serverRequest/resolved` is broadcast to every subscribed client, including the one that answered.
  The adapter's pending-request table is the trusted answer to whether this app is still waiting, so
  a request this runtime already answered produces no event, and one it was still showing resolves the
  durable approval as `superseded` rather than as a user cancellation.
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
   prototype-only fake data, dev controls, and demo scripts. **Done —
   `docs/reports/setta-4-mockup-fidelity-checklist-20260724.md`.**
7. Capture the current interaction and rendering performance baseline before changing renderer
   assumptions.
8. Define the target performance hardware, display, viewport, and device-pixel-ratio matrix. **Done —
   `docs/reports/performance/setta-4-target-performance-matrix-20260724.md`.**

The committed inventory is
[`docs/reports/setta-4-phase0-ownership-inventory-20260724.md`](../reports/setta-4-phase0-ownership-inventory-20260724.md).
Its section 4 lists the contract gaps Phase 1 must close, and its section 5 records the verification
that needs an interactive desktop session.

Item 7 is the only Phase 0 work left, and it is not a repository edit. Item 1 was confirmed by the
Phase 1 audit builds. Item 7 needs an interactive Electron session on the target display and is
recorded as a release gate in the inventory's section 5 and in section 7 of the performance matrix.

Exit gate:

- reproducible desktop development build — met
- Niri ownership inventory committed — met
- retained/replaced/deleted production responsibilities documented — met
- reusable foundation inventory committed — met
- fullscreen design direction is present in the branch — met
- mockup fidelity checklist is committed — met
- baseline performance report committed — release gate; needs an interactive desktop session
- target performance matrix committed — met

### Phase 1 — Extend truth before visuals

1. Start from existing Go-owned conversation statuses, input routing decisions, turn lifecycles,
   trajectory events, approval records, artifact records, snapshots, cursors, and Master route
   decisions.
2. Refresh the checked-in Codex app-server protocol snapshot from the current reference repo, record
   the upstream commit used, and regenerate affected Go and TypeScript surfaces. **Done — snapshot at
   upstream `99744cfe04806ebaa1e5d08e3e790070f852472b`; `internal/codexapp/protocol_gen.go`
   regenerated; no TypeScript surface is affected.**
3. Define the Codex-to-Setta provider notification adapter matrix for thread status, environment
   connection/status, plan deltas, reasoning summaries and private reasoning, raw response usage,
   Guardian review/warning, model verification, model safety buffering, context compaction, command
   attribution, and thread realtime. **Done — `internal/agent/provider_notification_matrix.go`
   classifies every notification in the snapshot and bounds what the adapter may do with each one.**
4. Define the missing Go-owned workstream, node, edge, evidence, status, and interpretation
   contracts. **Done — `internal/director/workstream.go`, `semantic_graph.go`, `records.go`, and
   their validators. Workstream resource bindings now have a Director-owned home, so `internal/master`
   has a replacement contract to move onto in Phase 3.**
5. Define lifecycle tables for workstreams, runs, queue items, approvals, resource requests,
   artifacts, semantic nodes, and recovery states. **Done — `internal/director/lifecycle.go`. Run
   lifecycle is expressed over the existing `conversation.TurnStatus` rather than duplicating it.**
6. Codify the initial source-fact-to-node mapping in Go-owned contracts. **Done —
   `internal/director/source_mapping.go` covers every trajectory event kind plus the Director-owned
   facts, and `source_mapping_resolvers.go` resolves activity, liveness, and provider-lifecycle
   node kinds and derives plan-step node ids.**
7. Define the app-scoped Director snapshot, cursor, event, and `resync_required` contracts. **Done —
   `internal/director/snapshot.go`, including the lossless/best-effort backpressure classes.**
8. Identify missing typed runtime events; add explicit events instead of UI inference. **Done —
   `internal/director/facts.go` commits the durable Director-owned facts a conversation cannot own:
   workstream registration, selection, and resource binding; the validated decision; the resource
   request and its resolution; the published interpretation; the recorded validation; and the
   recovery attempt. The last two close the catalog: `validation` and `retry` previously had no fact
   that could produce them, and `validated_by` and `recovered_by` had no derivation.
   `ValidateSourceFactCoverage` now proves the mapping runs in both directions, so a node kind
   nothing can produce fails loudly. `conversation.TrajectoryArtifactEmitted` carries the artifact's
   kind and title, because the graph could otherwise only label a result by resolving a second
   record. The Codex adapter now reports typed provider activities instead of a coarse bucket:
   `agent.ActivityKind` matches `conversation.TrajectoryActivityKind` one to one, commands carry
   their reported directory and process id, MCP and dynamic tool calls carry server, tool, and
   namespace, file changes carry typed operations and diffs, subagents carry their provider thread
   identity in a dedicated field, and generated media keeps its saved path separate from its public
   label. Hooks, MCP tool progress, and terminal interaction have normalizers. Before this, the
   durable record collapsed searches and tool calls into `dynamic_tool`, so `investigation` nodes
   were unreachable from live work and the run's working directory was assumed to be the workspace
   root. Remaining normalizer work is item 14.**
9. Generate TypeScript surfaces. **Done for the Phase 1 boundary. Director contracts are registered
   with the generator in `cmd/generate-contracts/contract_registry.go`; the generated surfaces
   materialize from the endpoint registry when the Phase 3 endpoints and events make them reachable.
   Adding a separate generated-type root or a hand-maintained TypeScript mirror would violate
   contract ownership.**
10. Build deterministic event histories covering every node lifecycle and live replay boundary.
    **Done — `internal/director/fixtures.go` commits nine histories built from production contracts:
    folderless start, queueing and steering, approval-gated file change, superseded plan and
    investigation, delegation to a child workstream and to a subagent, failure and recovery,
    resource request, validation and interpretation, and blocked/cancelled lifecycle.**
11. Implement the pure `DirectorGraphProjector`. **Done — `internal/director/projector*.go`. It holds
    no clock, randomness, I/O, or view state, and the live push path and cold replay run the same
    `Apply`. Superseded plan steps leave the live window with every reference to them repaired,
    because provider plan steps carry no stable identity.**
12. Add replay, ordering, invalid-transition, provenance, redaction, live resync, and recovery
    boundary tests. **Done — `internal/director/projector_test.go`. Replay is compared across every
    prefix boundary of every fixture, resync conditions surface as typed `ReplayError` reasons rather
    than internal errors, app-scoped and per-conversation sequence gaps fail before projection,
    cross-workstream provenance and delegation authority are validated, and the fixtures are asserted
    to exercise every node kind and edge kind.**
13. Build the exhaustive node/edge visual gallery from production contract fixtures. **Done in
    Phase 3 — `cmd/generate-director-graph-gallery` projects `ProjectionFixtures()` into
    `desktop/src/renderer/src/features/director-graph/projection-gallery-fixtures/`, including
    coverage-bearing prefix projections for transient lifecycle states. The renderer imports those
    decoded generated backend contracts, maps every generated semantic node kind, node status,
    evidence class, and edge kind through `semantic-graph-visual-catalog.ts`, packs them through
    `semantic-graph-packer.ts`, and displays them in the `director-graph-gallery` entry.**
14. Adapt the remaining notifications the matrix marks `normalized` that still have no normalizer.
    **Done.** `thread/environment/*` and `model/safetyBuffering/updated` are registered in
    `internal/codexapp/protocolschema/supported_protocol.json`, and `ThreadStatus` is generated as a
    decoded tagged union instead of raw JSON, so thread status is read from its discriminator rather
    than stringified. `internal/agent/provider_lifecycle_events.go` holds the new normalizers.
    - Thread status, environment connection and disconnection, and thread close commit provider
      lifecycle records. `agent.LifecycleEvent` now carries typed `LifecycleState` and
      `LifecycleReason` enums that match `conversation.ProviderLifecycle` one to one. Retryable and
      terminal turn errors have distinct reasons, thread statuses keep their exact typed causes, the
      loose `degraded` state that had no durable counterpart is gone, and raw provider error text
      never becomes a graph label or durable public failure.
    - Guardian review and model verification commit `conversation.TrajectoryEventValidationRecorded`,
      the durable owner a `validation` node and a `validated_by` edge are derived from.
    - `serverRequest/resolved` reserves the request against a later user answer, reconciles the
      durable approval record as `superseded`, and removes it from the adapter's pending table only
      after the lossless durable event commits. A rejected commit restores the pending request.
    - Two matrix dispositions were corrected rather than given normalizers, for the reasons recorded
      in the adapter rules above: `guardianWarning` and `model/safetyBuffering/updated` are
      `evidence`, because each is a second rendering of a fact Setta already commits typed.

The Phase 1 side of the shared audit additionally replaced the model-reroute
reason string with a Go-owned `high_risk_cyber_activity` enum across the agent,
conversation, Director, HTTP, and generated TypeScript boundaries; regenerated
protocol version 83; and made the Director projection use explicit semantic
activity summaries so raw commands, provider titles, and tool output cannot
become public graph labels.

Exit gate:

- checked-in Codex protocol inputs are current for the implementation baseline — met
- the provider notification adapter matrix is explicit and covered by fixtures — met
- every semantic value in the Phase 1 fixtures has a defined owner and provenance — met
- replay is deterministic — met
- the app-scoped live graph contract is cursored and push-driven — met; endpoint integration is
  Phase 3
- realtime transport deltas stay behind the execution adapter until committed as durable Setta
  events — met
- lifecycle transitions are explicit and validated — met
- no graph node depends on keyword heuristics or private reasoning — met
- invalid model output resolves through typed recovery policy — met at the projector boundary;
  model-driven Director integration is Phase 3
- exhaustive visual mappings compile without a fallback case — met by the generated-contract visual
  catalog and gallery packer

### Phase 2 — Prove the standalone 120 Hz renderer

1. Implement the mockup's WebGL2 visual language as normal production source files.
   **Done — `render/graph-visual-language.ts` and `render/graph-shaders.ts`.**
   Every axis of the packed vocabulary has an exhaustive `satisfies` table —
   mode colour, role sizing, emphasis, detail, and edge channel — and each table
   is uploaded as a small uniform array indexed by the packed code, so no shader
   branches on a semantic value and adding a contract value without a visual is
   a compile error. The mockup's three inferences are replaced by typed columns:
   glyphs come from the packed glyph code instead of regex-matching label text,
   the large input node comes from the `input` role instead of a mode
   comparison, and `struggle` is gone. Emphasis is a drawn difference, because
   an interpretation has to stay visibly distinguishable from a runtime fact.
   `render/graph-glyph-atlas.ts` rasterises one cell per packed glyph, in
   vocabulary order, so the atlas index _is_ the glyph code.
2. Define the packed immutable GPU snapshot boundary. **Done —
   `desktop/src/renderer/src/features/director-graph/packed-graph-snapshot.ts` and
   `packed-graph-validation.ts`. Columns are typed arrays in durable event order,
   so the snapshot at an earlier cursor is exactly a prefix of a later one and a
   cold replay lands on the columns a live push produced. Extending allocates
   fresh columns instead of writing into a previous snapshot's arrays and reports
   `changed` — the first touched index per column group — so the renderer uploads
   a range rather than a buffer. A parent's settle time is derived from its
   earliest child, which is why appending can change a node from an earlier
   batch. `packed-graph-vocabulary.ts` owns the renderer's visual vocabulary:
   mode, glyph, role, emphasis, detail, edge channel, outcome, and label
   placement. It deliberately carries no semantic strings. `internal/director`
   owns node kinds, statuses, evidence classes, and edge kinds, and the exhaustive
   catalog mapping those contract values onto this vocabulary belongs with item 13
   once the Director endpoints make the generated TypeScript contracts reachable.
   Splitting them is what lets the canvas be built and measured now without a
   hand-maintained contract mirror. Camera, selection, hover, fold, and animation
   phase stay out of the columns.**
3. Implement the fullscreen graph canvas independently of production state.
   **Done — `render/director-graph-renderer.ts`, `render/director-graph-canvas.ts`,
   `render/graph-ladder-layout.ts`, `render/graph-scene-packer.ts`,
   `render/graph-view-state.ts`, `render/graph-labels.ts`,
   `render/graph-label-layer.ts`, and `render/DirectorGraphSurface.tsx`.** Five
   passes compose the mockup: the drifting medium, edge beams, and node particle
   clusters into a capped scene framebuffer, then the halftone/CRT post pass, then
   glyphs alpha-blended on top. The ladder layout folds an answered turn onto its
   outcome node and repositions only from the first turn that moved, so a frame's
   work is proportional to what changed rather than to history. Camera follow,
   look-back, hover, selection, and manual fold pins are view state and never
   write back. Labels are pooled DOM over the canvas — one element per _visible_
   label — and the question and outcome pills are focusable buttons, which is the
   keyboard equivalent the fidelity checklist requires for the outcome-node click.
   `DirectorGraphSurface.tsx` is the React mount. Item 8's harness page is its
   first consumer, so its `desktop/knip.json` `ignoreFiles` entry is gone; Phase 4
   items 1 and 6 add the second consumer rather than restoring an exemption.
4. Add quality tiers, level of detail, buffer reuse, shader prewarming, and an idle scheduler.
   **Done — `render/graph-quality.ts` and `render/graph-frame-scheduler.ts`.**
   Three explicit tiers carry the performance matrix's clamps (device-pixel 1.5,
   3.6 MP post, 2.3 MP scene, adaptive scale in [0.4, 1]); the scale moves first
   because it is free, and a tier steps only once the scale has bottomed out or
   has been comfortable at full. Level of detail is per node — role and history
   compaction set the particle budget — and per frame: world positions grow
   monotonically with node order, so the drawn slice is a binary-searched range
   and the instance attributes bind at an offset instead of drawing all of
   history. Buffers are reused: static instance columns upload only the range the
   snapshot changed, and the only per-frame upload is one range of one RG32F node
   state texture that the node, glyph, and edge passes all sample. Every pipeline
   is exercised once before the first visible frame. The scheduler draws only
   while something moves, stops entirely while hidden, and clamps the resume
   delta so a sleep never fast-forwards the graph.
5. Reuse existing frame and long-task instrumentation where applicable. **Done —
   `render/graph-instrumentation.ts` rehomes the sampler, the long-task observer,
   and the percentile convention rather than importing them.**
   `workspace-layout/metrics.ts` is inside the Phase 5 deletion scope, so
   importing it would tie the Setta 4 renderer to code that is being removed.
   The percentile convention is deliberately the one the committed E2E budget
   harness already asserts against.
6. Add graph-specific fixture generation, CPU marks, GPU timer queries, and canvas-pixel checks.
   **Done.**
   `packed-graph-scenes.ts` holds six deterministic
   scenes and `packed-graph-fixtures.ts` compiles a scene into the same ordered
   batch stream a live push would deliver, plus arbitrary-size scale scenes and a
   distinct-workstream set for the navigation scenario. Between them the scenes
   draw every value in the packed vocabulary, so adding a value without a fixture
   that draws it fails the coverage test. `graph-instrumentation.ts` marks
   projection, packing, upload, and draw separately and samples GPU frame time
   through `EXT_disjoint_timer_query_webgl2`, discarding disjoint results rather
   than reporting a wrong number. Canvas-pixel checks are
   `render/graph-pixel-check.ts`, read back inside the frame that drew them
   through `DirectorGraphCanvas.requestPixelCheck`. Two properties of the picture
   shape that check: the graph floats in a drifting medium whose brightest
   _pixel_ is as bright as a node's, so blankness is judged on concentration
   rather than brightness; and the graph is letterboxed rather than stretched, so
   the grid resolves the _reference frame_ instead of the canvas and one set of
   thresholds holds from a phone to 6K. Framing is then checked against the same
   `graphFitFrame` the shaders use — content centred on the spine, inside the
   letterbox, in the live edge's band — so the check fails when the renderer and
   the layout disagree rather than when a viewport is merely unusual.
7. Add burst-update fixtures that simulate pushed event batches and cursor replay.
   **Done — `packed-graph-burst.ts`. Storm, steady, and replay-catch-up arrival
   profiles schedule a fixture's batches; `coalesceDeliveriesByFrame` merges a
   frame's arrivals into the single batch it applies, keeping a burst from
   producing one snapshot and one upload per pushed event. Coalesced application
   is asserted to reach the same columns as applying the parts one at a time, and
   resuming from every cursor boundary is asserted to reach the same columns as a
   cold build of the whole stream.**
8. Run the required scale and viewport scenarios against deterministic fixtures.
   **Done — `desktop/tests/electron/director-graph-renderer-performance.test.mjs`,
   registered in the `performance` tier of the Electron workflow manifest.** It
   opens the committed harness page in the production Electron renderer and
   runs every scenario in the matrix's section 4 at the tiers in its section 3.
   The harness page (`features/director-graph/harness/`) is a second renderer
   entry rather than a mode of the app shell, because the shell would put its
   own React work and DOM into every frame sample and every pixel check.
   Scenario plans are data — replay, burst, navigate, restart, sustained,
   occlusion — and the runner turns them into pushes on real frames through the
   committed fixtures, so the renderer is measured against the arrival cadence a
   live subscription produces. Thresholds live with the workflow, not in the
   renderer bundle: the pass/fail rule is a measurement decision that belongs
   next to the matrix. The phone DPR-3 tier closes the matrix's first capability
   gap — no E2E had ever set a device scale factor above 1.
9. Profile with browser/Chrome developer tools and GPU timer queries.
   **Done.** Every run carries GPU timer-query percentiles and the four CPU
   marks, and the workflow captures a Chromium trace of the 4K interleaved
   scenario as a separate untimed pass, because tracing costs frame time and a
   traced run is not an accepted result. Results are in
   [`docs/reports/performance/setta-4-graph-renderer-scenarios-20260724.md`](../reports/performance/setta-4-graph-renderer-scenarios-20260724.md).
10. Fix hitches before integrating live app state. **Done.** No frame-time hitch
    was found on the primary target — every tier holds p95 CPU and GPU inside the
    budgets — and four defects were, none of which frame time alone would have
    shown:
    - `GraphLadderLayout` keyed its incremental turn ranges on the workstream id
      alone, so a snapshot _replacement_ that kept the id — a resync after
      `resync_required`, a cold replay after restart, a reloaded window — left
      ranges describing the previous snapshot. The soak reproduced it as an
      exception thrown every frame. `setSnapshot` now resets the ladder and the
      index-derived view focus alongside the packer, since a replacement is not
      an extension. The camera and turn pins survive, because they are about
      where the user is looking.
    - An exception inside the frame loop kills that frame and nothing else: the
      scenario still reports frames, still passes its budgets, and still shows
      the last good picture. The workflow now reads the recorded renderer console
      and fails on any error, rather than trusting the numbers.
    - The quality controller could never hold a tier it earned. Every frame that
      changed quality re-derived the tier from the viewport, handing back the
      viewport's starting tier immediately — 894 tier changes in one 1200-frame
      run, each a geometry rebuild. A viewport change now re-derives the tier and
      everything else only resizes, with the surface key covering the adaptive
      scale so a scale step reaches the framebuffers instead of waiting for the
      next viewport change. Tier steps per run fell to 0–2 and CPU p95 halved.
    - With the tier held, the graph ran at `full` on 4K and 6K for the first
      time, and the canvas-pixel check called those frames blank. The halftone
      cell is authored in CSS pixels so the dots stay a constant size on screen,
      but the post surface is capped at 3.6 MP: at 4K the cell shrank to about two
      surface pixels, and a cell that samples the scene once with two fragment
      centres across it erases every mid-tone dot. `graphDitherCellPixels` floors
      the cell at its authored size in surface pixels.
      The shared phase audit then closed the remaining standalone-boundary gaps:
      empty snapshots keep the valid prewarm texture instead of issuing a
      zero-texel upload; timer queries return each fresh result once and reset
      between scenarios; a hidden scheduler retains its pending wake; harness
      deadlines distinguish failed steps from the sustained scenario's allowed
      ceiling; reduced-motion mode removes autonomous shader, particle, label,
      hover, camera, and fold motion; packed snapshots validate vocabulary,
      ordering, references, and lifecycle invariants at runtime; interactive
      labels expose a named semantic region, expansion state, and 44 px targets;
      and edge shaders guard the absent-terminal-time sentinel before arithmetic.
      The performance workflow now rejects level-2 renderer console entries. The
      corrective measurement and the invalid earlier console claim are recorded
      in
      [`docs/reports/performance/setta-4-graph-renderer-phase2-audit-20260724.md`](../reports/performance/setta-4-graph-renderer-phase2-audit-20260724.md).
      The renderer's own adaptation budget is deliberately _not_ the report's frame
      budget. It comes from the single shortest frame delta ever observed, which is
      optimistic by design so a renderer stuck at half rate cannot redefine the
      target as half rate; on a ProMotion panel that lands about a millisecond
      under the real period. Reports resolve their budget through the committed
      `performance-frame-budget.mjs` convention instead.

Exit gate:

- deterministic renderer fixtures visually match the mockup's graph language, labels, rails, and
  composer integration points — met for the graph, labels, and history pills; the rails and composer
  are Phase 4 surfaces and their integration points are the mount in `DirectorGraphSurface`
- the target hardware sustains the 120 Hz budgets in representative motion — met on the primary
  target across every scenario; real 4K, 6K, and phone displays are a release gate
- p95 and p99 frame time, long tasks, memory, and dropped frames are recorded — met
- phone-scale and high-DPI behavior are bounded — met; both phone tiers and DPR 3 are measured
- graph fixture harness and report template are committed — met
- burst updates do not produce per-event React renders or animation-frame floods — met; a backlog of
  pushed batches is asserted to reach the columns in exactly one frame
- no business logic exists in the renderer — met

### Phase 3 — Introduce the Director Command Center

1. Adapt the existing Master route decision catalog into the Director decision protocol. **Done —
   `internal/director/decision_protocol.go`, `decision_authority.go`, `decision_schema.go`,
   `decision_output.go`, `decision_validation.go`, `decision_recovery.go`, and `decision_commit.go`.**
   The trusted context (`DirectorDecisionContext`) generates the strict output schema, and the
   returned decision is validated against that same context again, so a provider that ignores its own
   schema cannot widen authority. Five catalog changes are product requirements rather than renames:
   - Targets are workstreams. No pane id, provider id, execution lease, approval id, artifact id, or
     filesystem path appears anywhere in the context, the schema, or a decision. A folder resource is
     chosen as a `workspaceId` from an authorized enum; trusted code resolves the absolute path into a
     `WorkstreamResourceBinding`.
   - `focus_conversation` became `select_workstream`, which moves app-wide selection. The old kind
     had to state in its own schema description that it was not a renderer command, which is the
     shape of a contract holding the wrong authority.
   - `create_conversation`, `create_side_conversation`, and `fork_conversation` collapsed into
     `create_workstream` with a typed `root`/`child`/`fork` origin, because the product difference
     between them is the new workstream's parentage and the graph already derives `delegated_to`
     from parentage. Only a root origin chooses a scope; a child or fork inherits the parent's, so
     the model cannot rescope existing work.
   - `ask_narrator` is gone. The Director holds the app-scoped snapshot and the selected workstream's
     semantic trajectory, so a status question is `answer_directly`. Delegating it to a
     per-conversation narrator was a consequence of the router only knowing pane-visible state.
   - `recover_path` is new, and it names the durable failure event it is acting on.

   `NextDecisionRecovery` implements the plan's model-output recovery policy as a typed ladder —
   retry with a public-safe diagnostic, rematerialize and retry, product invariant, clarify, blocked.
   The diagnostic is a fixed sentence keyed by the typed rejection reason, so provider text, user
   text, and internal error strings never reach a retry prompt or the user. `NewCommittedDecision`
   derives the durable `DirectorDecisionCommitted` public summary from the decision kind plus titles
   and summaries the app already committed, so a decision cannot label the graph with model text.

2. Rename product-facing Master concepts to Director where they represent the new product role. The
   decision catalog half of this is done with item 1; the remaining `internal/master` session, input,
   route-service, and IPC naming moves with item 3, because renaming them before the boundary exists
   would churn call sites that are about to be replaced.
3. Implement the deep `DirectorCommandCenter` boundary. **Done —
   `internal/director/registry_decisions.go`, `decision_router.go`,
   `command_center.go`, and the transport and runtime adapters listed below.**
   The registry materializes a `DirectorDecisionContext` from durable state, and
   the router runs one intent through the protocol: generate the schema from
   that context, decode and authorize the output against the same context, and
   run the recovery ladder when it does not validate. Four decisions are
   load-bearing:
   - A target's authority is derived, never claimed. Send is offered only with
     no active run, queue and steer only with one, recovery exactly when a
     durable failure is unrecovered, and a completed run is the only thing that
     becomes a fork point.
   - A failure stops being recoverable when a recovery fact names it or a later
     run of the same workstream completes, because durable state then shows the
     workstream moved past it.
   - `ask_clarification` is authorized only when at least one workstream can
     take work. With nothing to choose between, a question cannot change the
     outcome, so asking one would stall the request instead of routing it.
   - The router does not commit the decision. `DirectorDecisionCommitted` is a
     public claim that the app decided something, so the executor commits it
     before asking the execution port to carry it out. Starting work spans
     several durable writes and a provider launch, so it cannot share that
     transaction; a later execution failure leaves the decision the app
     truthfully made and returns the execution error.

   `DirectorDecisionCommitted` gained the intent it answered and, for a
   clarification, the question and the candidates it offered. Without them a
   restart would ask the same question again, and the answer could be applied to
   a workstream the question never named. `WorkstreamDecisionTarget.LastMilestone`
   became `DecisionMilestone`, which drops the graph node id: a node id is a
   renderer identity, and it carried approval and artifact ids into the one
   place that must contain none.

   **The dispatch surface is committed** — `internal/director/command_center.go`,
   `internal/httpapi/director_handlers.go`, `internal/runtime/director_services.go`,
   `desktop/src/shared/director-ipc.ts`, and `desktop/src/main/director-*.ts`.
   `CommandCenter` is `dispatch`/`getSnapshot`/`subscribe` and nothing else, and
   three endpoints carry the whole boundary: read one bounded snapshot with its
   cursor, subscribe from that cursor, dispatch one intent. Five decisions are
   load-bearing:
   - The intent catalog is what the app can carry out: `submit`,
     `select_workstream`, `move_selection`, `cancel_run`, `resolve_approval`,
     and `resolve_resource_request`. `submit` joined it once item 6's
     executor became reachable, because a dispatch that accepted work it could
     not perform would be a stub in the product's front door; the three direct
     commands joined it with their execution-port operations for the same reason.
   - `move_selection` is resolved by the app, not the caller. The renderer sends
     a direction; the registry resolves it over the same bounded, recency-ordered
     window the snapshot draws, so selection can only land on something the user
     can see. It clamps at both ends rather than wrapping, and with nothing
     selected either direction starts at the most recent workstream.
   - Selection no longer restamps the workstream's `UpdatedAt`. Selecting is not
     a change to the work, and stamping it made the selected workstream the most
     recently changed one — so the ordered strip the user navigates reshuffled
     under the keystroke that navigated it.
   - The boundary separates a rejected intent from an unavailable command center
     with typed errors (`ErrDirectorIntentRejected`, `ErrDirectorUnavailable`),
     so the shell can tell the caller's mistake from a runtime condition instead
     of reading an error string.
   - The subscription is required to carry a cursor, and a resync ends the
     desktop stream rather than reconnecting. A subscriber with no cursor has no
     snapshot to apply events to, and retrying a cursor the server just refused
     would only ask to resync again.

   `internal/director/FolderResourceBinding` became `WorkstreamFolderResource`:
   the generated TypeScript surface is one namespace, and the pane world's
   `applayout.FolderResourceBinding` still owns that name until Phase 5 deletes
   it. Executing a routed decision is item 6.

4. Add the app-scoped workstream registry with push subscriptions and durable cursors. **Done —
   `internal/director/registry*.go`.** The registry folds the durable committed log into the
   app-scoped state and publishes what changed. Five decisions are load-bearing:
   - The app-scoped stream _is_ the existing committed log. Director facts are committed to their own
     `director:facts` stream beside conversation events, so the log's commit order is already the
     app-scoped order and the registry needs no second ordering to interleave the two owners.
   - Workstream registration is derived from the durable conversation record rather than written. The
     record already says the workstream exists, and a second durable record of the same fact could
     disagree with it. Registration reaches the graph projector immediately before a workstream's
     first graph fact, because a fork's parentage is committed _after_ the conversation record that
     names it.
   - Selection is the one fact the registry writes. It names the selection it replaces, so the write
     is serialized: two selections must not reach the log in the opposite order to the one they were
     decided in.
   - Status is computed from durable inputs, not claimed. The workstream lifecycle table validates a
     transition a caller asserts; a projection asserts nothing, because its status is a function of
     what is durably true right now.
   - The pushed stream is scoped to a materialization epoch — the durable commit position it started
     from — with a retained replay window. A cursor from an earlier epoch or older than the window
     receives the typed resync it needs to take a fresh snapshot, which is why nothing polls.

   `DirectorGraphProjector` now reports what each fact touched, so a graph event carries the changed
   nodes and edges instead of a replacement graph. A delta larger than one event's bound is split
   rather than truncated, and a background workstream receives no graph content at all.

5. Include folderless and resource-bound conversations as first-class workstreams. **Done.** A
   folderless conversation is admitted with the folderless scope, and a folder-bound one resolves its
   binding from durable workspace metadata through `workspace.Manager.LookupLocal` rather than from
   the session's open list, because a workstream keeps its folder resource after the folder is
   closed.
6. Move folderless routing, clarification, conversation creation, queueing, steering, cancellation,
   approval, resource requests, model-output recovery, and product-invariant decisions behind the
   boundary. **Executing a routed decision is committed** — `internal/director/execution.go`,
   `decision_execution.go`, `registry_execution.go`, and
   `internal/conversation/service_director_commands.go`. `WorkstreamExecution` is the
   consumer-owned execution port: start a workstream, send, queue, steer, recover.
   Every request names Setta identities minted by trusted code — the conversation
   a workstream runs on, the folder it is bound to, and the run the work becomes
   immediately before execution — so no provider id, thread, credential, or
   lease crosses it, and a managed-runtime adapter satisfies the same contract.
   `DecisionExecutor.Execute` is total over `RoutedIntent`, which covers
   folderless routing, clarification, conversation creation, queueing, steering,
   resource requests, and every resolution the model-output recovery ladder and
   the product invariants produce. Six decisions are load-bearing:
   - The decision is committed _before_ the work it authorizes, not in the same
     transaction as it. One transaction is not available: starting a run spans
     several durable writes and a provider launch. Committing first is the
     honest order anyway — a create decision names a workstream that does not
     exist until the work runs, the ids it carries are the ids the work is then
     addressed by, and work that fails to start leaves a decision the app
     truthfully made plus an error the caller receives.
   - Work a workstream cannot start yet becomes a durable
     `DirectorResourceRequestOpened` rather than an error. Setta runs work inside
     a folder resource, so a folderless workstream is not broken: it exists, it
     is selectable, and the durable request says what it is waiting for. That is
     the affordance the pane world could only derive from a routing failure code.
   - An answer and a clarification are committed as decisions that happened in
     no workstream. `DirectorFactEvent.WorkstreamID` is now optional for exactly
     that case: they start work nowhere, so no workstream's graph owns them, and
     an answer may be given when the app holds no workstream at all. They are
     still durable, because the answer is what the user was told and the question
     is what their next request is answering.
   - `DirectorDecisionCommitted` gained `Answer`, mirroring `Clarification`. It
     is the one place model text becomes durable; the public summary beside it
     stays derived, so an answer can be read back to the user without ever
     labelling the graph.
   - A root create decision also happens in no workstream, because it was decided
     before the workstream it created existed. A create decision that does name a
     workstream delegated from it, which is what the projector draws
     `delegated_to` from.
   - Recovery restarts the run a durable failure interrupted. The model names the
     failure event; the registry resolves which run that was, so a recovery
     re-delivers the work that failed instead of work the decision re-authored.

   Setta's durable child conversation gained a second shape for this:
   `BranchKindChild` records parentage with no fork point, because a delegated
   child starts its own work rather than resuming the parent's, and a fork needs
   a completed parent run that a running parent does not have.
   `BranchDecisionSourceDirector` is the app-scoped source. A branch's workspace
   check now compares two optional folders, so a folderless parent and child are
   a legitimate pair.

   **The routed path is now reachable from the shell.** `submit` joined the
   dispatch catalog, and the two pieces between the router and the app are
   committed: `internal/runtime/director_decision_caller.go` is the structured
   decision caller, and `internal/runtime/director_workstream_execution.go` is the
   local adapter behind `WorkstreamExecution`. `internal/director/decision_call.go`
   owns what the Director is sent, and `DirectorReceipt` carries the
   `ExecutedDecision` back. Six decisions are load-bearing:
   - The intent's identity and its accepted-at stamp are minted by the command
     center. The shell supplies the words and the modality only, because a caller
     that could choose an intent id could replay another request's identity.
   - Every decision runs on a fresh, read-only, tool-less provider thread with no
     durable Director session. The protocol supplies the model's entire authority
     in one context bundle and re-supplies it on a retry, so thread history is not
     merely unnecessary: a decision influenced by a previous request's history
     would be authorized by something the app never validated. This is also why
     the Director does not share the Master session's durable thread, whose
     developer instructions carry the Master route catalog.
   - The Director decides under the same durable app-global role profile the
     Master session resolves, so a model, effort, permission, or budget change
     reaches both without a second source of truth. The runtime now builds that
     resolver once and shares it.
   - That role's input budget is enforced rather than worked around. A request
     whose routing context does not fit is rejected as too large, because a
     decision made from a clipped context would be authorized against something
     the app never showed the Director.
   - The retry diagnostic travels as one `validationDiagnostic` field beside the
     context in the same payload, and the task directive states what it means. The
     context stays the top-level object, because the frozen directive addresses it
     by path.
   - A Director the app could not reach is `ErrDirectorUnavailable`; a target
     trusted state does not hold is `ErrDirectorIntentRejected`. Execution
     failures pass through as themselves, because calling a durable-write conflict
     an unavailable command center would name the wrong thing.

   The local adapter maps the authorized origin kind onto durable parentage rather
   than inferring it from which field is populated, and it translates exactly one
   error class: work that cannot run until the user supplies a resource crosses as
   the typed resource error the executor turns into a durable request. Everything
   else crosses unchanged, because the Director does not interpret execution
   failures.

   **The three direct commands are committed** — `internal/director/dispatch_execution.go`,
   the `CancelRun`/`ResolveApproval`/`BindWorkstreamResource` operations on the
   execution port, the trusted resolutions in `registry_execution.go`, and
   `CancelDirectorTurn`/`SubmitDirectorApproval` in
   `internal/conversation/service_director_commands.go`. Cancelling a run,
   answering an approval, and supplying a folder are the user acting on something
   the command center is already showing them, so none of them is routed: there is
   nothing for a model to decide, only trusted state to resolve and one port
   operation to run. Five decisions are load-bearing:
   - Cancelling names the run, not just the workstream. Setta promotes queued work
     the moment a run ends, so a cancel that named only its workstream could stop
     the successor — work the user never chose to stop. `ActiveRunTarget` rejects a
     run the workstream has moved past, and the conversation service re-checks the
     named turn inside the lock that read the active one, which is where the
     remaining race actually closes.
   - Resolving an approval carries structured answers. Setta's approval catalog
     includes questions a run cannot continue without, so an approve/deny boundary
     would leave every structured-input approval unanswerable through the command
     center. The plan's secret boundary holds unchanged: answers reach the provider
     path that asked for them, the conversation redacts them out of the durable
     trajectory, and the app-scoped record still carries only that an answer was
     secret.
   - The app resolves what an approval belongs to. The shell names the approval;
     the workstream, conversation, folder, and waiting run all come from the same
     durable fold the rail drew it from, and an approval whose run has ended is
     rejected rather than answered into a provider request that no longer exists.
   - Cancelling and answering commit no Director fact. The conversation already
     commits the interruption and the resolution durably, and the registry folds
     those into the same rails the command came from, so a second Director record
     of the same event could only disagree with it. Supplying a resource is the
     exception, because no conversation event says the app's own request closed.
   - Supplying a folder binds the durable substrate before the app records that it
     has one, which is the opposite order to a decision. A decision is true whether
     or not the work starts; a binding fact is a claim about what the workstream
     can now reach, so committing it first would leave the registry asserting a
     folder the conversation does not have. In this order a lost fact leaves the
     request open — the state the user can act on again — and binding the same
     folder twice is the same durable state, so acting on it again resolves it. The
     folder itself is authorized against the workspaces the app can currently
     reach, the same authority a Director decision's scope is checked against.

   One product gap remains inside this item and is not a boundary gap: work that
   could not start for want of a folder is not re-delivered when the folder
   arrives. The workstream exists, is selectable, and can now run, but the request
   the user made is not durably attached to the resource request, so their next
   message is what starts the work. Closing it is a product decision rather than a
   rewiring — whether the app re-sends the authored text or re-routes the original
   intent through the Director — and it is recorded in the immediate next actions.

7. Replace pane presentation intents with workstream presentation intents. **The
   replacement exists and now carries work, control, and presentation** —
   `DirectorIntent` submits a request, moves app-wide selection by workstream id
   or by direction, cancels a run, answers an approval, and supplies a resource,
   and no dispatched intent, receipt, or pushed event carries a pane id. The
   Master presentation intent the pane shell still resolves leaves when the shell
   stops dispatching Master input, which is Phase 4's cutover.
8. Fan in current conversation and Master event streams through the Director registry without adding
   UI polling. **Done for the conversation side.** Every conversation's durable events reach the
   registry through one app-scoped follower that blocks on the store's committed-event wake, so
   adding a workstream adds no subscription and no timer. The routing the Master streams carry is now
   behind the boundary, so those streams are retired by the same trigger as item 7: the shell stops
   dispatching Master input at Phase 4's cutover, and what is left of them is deleted with the pane
   code in Phase 5.
9. Preserve strict trusted-target validation. **Done —
   `internal/director/decision_validation.go`, the target invariants in
   `decision_authority.go`, and the executor's live target resolution.**
   A target may offer `send_to_workstream` only with no active run, `queue_behind_run` and `steer_run`
   only with one, and `recover_path` exactly when it carries a recoverable failure, so an authority
   set that contradicts its own run state fails at the boundary instead of producing an unexecutable
   decision. Every workstream the Director can see is selectable. Fork points and recoverable
   failures are per target, and the schema emits one branch per parent, so a run id or failure id
   cannot be paired with the wrong workstream. `Registry.DecisionContext` in item 3 now materializes
   that context from the live registry, so the ids the schema offers and the ids validation accepts
   come from one durable fold rather than from two derivations that could disagree. The executor
   resolves the durable substrate again before each effect and refuses to steer a successor run
   that replaced the one the authorized context named.
10. Keep current conversation stores and event streams as canonical inputs where their ownership is
    already correct. **Done.** The registry reads conversation records, turns, queues, trajectory
    events, and artifacts from the durable log and adds nothing that duplicates them. It owns only
    what no conversation can own: workstream identity, selection, resource requests, and the
    app-scoped aggregates.

Exit gate:

- all primary user intents can be expressed without pane identity — met by the
  generated command-center contract and production Electron dispatch workflow
- folderless workstreams appear in the app-scoped registry — met by deterministic
  registry coverage and the production Electron resource-binding workflow
- the Director registry delivers app-scoped live updates from durable cursors
  without polling — met, including lossless overload resync, bounded collection
  windows, and renderer cursor handoff
- 100 background workstreams do not cause unrelated renderer rerenders — met by
  the deterministic registry isolation case
- reload reconstructs the same selected workstream and semantic graph — met by
  the production Electron restart comparison and the live-provider restart suite
- malformed Director output does not surface as an internal routing/schema error
  — met by typed recovery coverage and the production Electron repair path
- local execution passes the Director execution contract suite — met

Phase 3 audit verification:

- `./scripts/test_topic_conversation_workflows.sh` completed the production
  build/typecheck, all 1,199 desktop contract tests, all nine deterministic
  Electron workflows, and all four available live Codex workflows, including
  the Director command center and restart/reload paths.
- The final broad run's only non-green assertion was a stale fixture expectation
  that still called the user's cancellation request terminal. The executable
  replay fix had already passed the exact restart workflow and the complete
  Electron/live matrices; after aligning that test-only expectation with the
  provider-confirmed terminal fact,
  `./scripts/go.sh test ./internal/director -run '^TestMilestoneKeepsBackgroundWorkstreamsActionable$' -count=1`
  passed. No executable code changed after the broad run, so its already-green
  gates were not duplicated.

### Phase 4 — Build the native fullscreen shell

1. Replace the app shell with a production implementation of the mockup's fullscreen composition:
   selected workstream, semantic graph, rails, top workstream navigation, compact history, and
   Director composer. **Initial production shell committed** —
   `desktop/src/renderer/src/App.tsx` now mounts
   `features/director-command-center/DirectorCommandCenterShell.tsx` as the primary product
   surface instead of `WorkspaceLayoutArea`. The shell draws the top workstream navigation, left Now
   rail, right approvals/resources/artifacts rail, bottom text composer, compact semantic-history
   list, and fullscreen `DirectorGraphSurface` against the generated Director snapshot contract.
   Phase 5 still owns deleting the old pane modules; they are no longer the primary app mount.
2. Connect speech capture and playback through the same Director intents as text. **Done for
   Director receipt playback** — the production shell now owns a Director-specific speech capture
   controller, reuses the existing desktop voice provider/capability/credential paths, preserves a
   finalized transcript for retry if Director dispatch fails, and submits it as `kind: "submit"`
   with `modality: "voice"` through the same command-center dispatch function used by text. The
   playback side is committed with a first-class app-scoped `director` `SpeechSource` speaker,
   generated TypeScript contract coverage, a runtime resolver that rehydrates answer and
   clarification text from durable `DirectorFactDecisionCommitted` records, and command-center
   enqueueing through the existing speech playback controller. The Director source currently uses
   the existing global assistant voice selection; a separate Director voice-setting surface is not
   part of this Phase 4 item.
3. Implement previous/next and direct workstream selection. **Done for the initial shell** — the
   top navigation dispatches `move_selection` for previous/next and `select_workstream` for direct
   visible-workstream selection; no pane id crosses the renderer boundary.
4. Render approvals and resource requests as first-class actionable state. **Partially done** — the
   right rail renders generated `ApprovalRequest` and `ResourceRequest` records, dispatches
   `resolve_approval` for approve/deny/cancel actions that do not require hidden question fields,
   and dispatches `resolve_resource_request` against active workspace ids from the preload workspace
   session. Structured approval answer collection remains because the app-scoped approval record
   intentionally does not yet carry the question catalog needed to answer it.
5. Render artifacts as typed outputs; open rich details in accessible DOM/native surfaces. **Partially
   done** — typed artifact metadata is rendered in the rail from generated `WorkstreamArtifact`
   records. Opening rich payload details remains, because the rail still needs a trusted
   workstream-to-conversation/workspace resolution path before it can call the conversation artifact
   reader.
6. Integrate the WebGL2 canvas through packed snapshots, not component-level node state. **Done for
   the initial shell** — the shell packs generated `WorkstreamGraph` snapshots through
   `semantic-graph-packer.ts` and hands immutable packed snapshots to `DirectorGraphCanvas`; React
   owns mount lifecycle and semantic-event state, not per-node frame state.
7. Connect the live Director subscription to graph projection, packing, buffer updates, and frame
   scheduling. **Done for the initial shell** —
   `director-command-center-state.ts` applies the app-scoped pushed event catalog to the snapshot,
   treats graph updates as semantic deltas, advances the durable cursor, and triggers a fresh
   snapshot/subscription on `resync_required` or sequence drift.
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
- invalid model outputs recover, ask a useful durable clarification, or return a public-safe blocked
  receipt without exposing internal errors
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

1. Decide how a workstream resumes the work it could not start. Supplying a folder now closes the
   durable resource request and binds the workstream, but the request the user made is not attached to
   that request, so nothing restarts. The two candidate answers are different products: re-send the
   authored text as the workstream's first run, or re-route the original intent through the Director
   against the workstream's new authority. The first needs the user's words to become durable on the
   resource request, which today only `DirectorDecisionCommitted.Answer` does; the second needs the
   submitted intent to survive the request. This is a product decision, not rewiring, so it should be
   brought to the user before either contract changes.
   Retiring the Master presentation intent in item 7 waits for Phase 4's shell cutover, and the
   remaining Master-to-Director renaming in item 2 should move with the code Phase 5 does not delete.
   Phase 3 has production-path Electron coverage that dispatches through the renderer preload,
   main-process IPC, HTTP, and durable store. The initial user-visible fullscreen renderer surface
   now owns those dispatches for text, voice capture, selection, approval, resource, and graph
   updates; the remaining shell work is structured approval answer collection, rich artifact
   details, fidelity polish, and integrated performance reporting.
2. Capture the pre-cutover interaction and rendering performance baseline when an interactive desktop
   session is available, using the tiers and required report fields in the performance matrix.
