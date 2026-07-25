# Setta 4 Director Command Center — Plan of Record

**Date:** 2026-07-24
**Status:** Approved direction; implementation has not started.

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

## Source Branches and Ownership

### `setta-3`

`setta-3` is the implementation source and the parent of `setta-4`. It owns the current production
backend and the behavior that must survive the cutover:

- app-scoped and folderless conversation routing
- durable conversations, turns, queues, steering, cancellation, and recovery
- approvals and typed resource requests
- conversation event streams and projections
- speech capture, playback, and credential storage
- Master/Director reasoning foundations
- Electron main/preload/renderer production paths

Create `setta-4` directly from the final green `setta-3` commit. A direct branch preserves the real
lineage; do not manufacture a merge commit.

### `setta-3-fullscreen-conversation`

This branch is frozen design evidence. Its
`docs/mockups/fullscreen_conversation_concept.html` establishes the visual and interaction direction:

- one fullscreen living reasoning stream
- selected workstream navigation with adjacent context
- a left "Now" rail
- a right "Artifacts" rail
- a bottom Director composer
- compact user/final-answer history
- background workstreams represented without competing for the full screen

The prototype uses **WebGL2**, GLSL shaders, buffers, instancing, and GPU timer queries. Setta 4 will
begin with WebGL2 as well. Do not merge this branch wholesale, and do not port its prototype gallery
or later Niri workspace integration. Reimplement the selected concepts against Setta 4 contracts.

### `setta-3-sprites`

This branch is behavior archaeology for a later phase. It contains useful runtime-provider,
credential, installation, accounting, managed-runtime, and conformance work, but it diverged before
many important `setta-3` changes and overlaps risky shared contracts.

Do not merge it wholesale into either `setta-4` or `setta-4-sprites`.

After the Setta 4 Director UI is implemented, measured, and stable, create `setta-4-sprites` from that
green Setta 4 checkpoint. Port Sprites capabilities in bounded slices against current Setta 4
contracts.

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
- No semantic nodes inferred from text keywords.
- No exposure or reconstruction of hidden chain-of-thought.
- No node without durable semantic meaning and provenance.
- No per-node DOM graph.
- No React state updates on each animation frame.
- No polling where a push event can express the change.
- No second WebGPU renderer until a measured limitation justifies it.
- No wholesale merge from either the fullscreen prototype branch or Sprites.
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

The registry replaces app-pane observation, pane-scene routing context, pane focus/open resolution,
and persisted layout as the application-level authority.

### 3. Director Execution Port

The Director should depend on a small consumer-owned execution boundary rather than provider- or
Sprites-owned UI concepts.

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

## Semantic Node Contract

Every visible node must represent a real event, state transition, declared intent, result, or
explicit Director interpretation.

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

## Implementation Sequence

Each phase ends with a coherent boundary and explicit deletion or acceptance gate. Do not begin by
deleting Niri; replace its product responsibilities first.

### Phase 0 — Establish the Setta 4 baseline

1. Finish and verify the intended `setta-3` baseline.
2. Push or otherwise back up the source branches before surgery.
3. Create `setta-4` directly from the green `setta-3` tip.
4. Record exact source commits for `setta-3`, the fullscreen prototype, and Sprites.
5. Inventory Niri/pane responsibilities and assign each one to retain, replace, or delete.
6. Capture the current fullscreen prototype performance baseline before changing it.

Exit gate:

- clean `setta-4` lineage
- reproducible desktop development build
- branch/source manifest committed
- Niri ownership inventory committed
- baseline performance report committed

### Phase 1 — Define truth before visuals

1. Define Go-owned workstream, node, edge, evidence, status, and interpretation contracts.
2. Map existing production events to the initial node catalog.
3. Identify missing typed runtime events; add explicit events instead of UI inference.
4. Generate TypeScript surfaces.
5. Build deterministic event histories covering every node lifecycle.
6. Implement the pure `DirectorGraphProjector`.
7. Add replay, ordering, invalid-transition, and provenance boundary tests.
8. Build the exhaustive node/edge visual gallery from production contract fixtures.

Exit gate:

- every displayed semantic value has a defined owner and provenance
- replay is deterministic
- no graph node depends on keyword heuristics or private reasoning
- exhaustive visual mappings compile without a fallback case

### Phase 2 — Prove the standalone 120 Hz renderer

1. Extract the useful WebGL2 concepts from the fullscreen prototype into normal source files.
2. Define the packed immutable GPU snapshot boundary.
3. Implement the fullscreen graph canvas independently of production state.
4. Add quality tiers, level of detail, buffer reuse, shader prewarming, and an idle scheduler.
5. Run the required scale and viewport scenarios against deterministic fixtures.
6. Profile with browser/Chrome developer tools and GPU timer queries.
7. Fix hitches before integrating live app state.

Exit gate:

- the target hardware sustains the 120 Hz budgets in representative motion
- p95 and p99 frame time, long tasks, memory, and dropped frames are recorded
- phone-scale and high-DPI behavior are bounded
- no business logic exists in the renderer

### Phase 3 — Introduce the Director Command Center

1. Rename product-facing Master concepts to Director where they represent the new product role.
2. Implement the deep `DirectorCommandCenter` boundary.
3. Add the app-scoped workstream registry with push subscriptions and durable cursors.
4. Move folderless routing, clarification, conversation creation, queueing, steering, cancellation,
   approval, and resource requests behind the boundary.
5. Replace pane presentation intents with workstream presentation intents.
6. Preserve strict trusted-target validation.
7. Keep current conversation stores and event streams as canonical inputs where their ownership is
   already correct.

Exit gate:

- all primary user intents can be expressed without pane identity
- 100 background workstreams do not cause unrelated renderer rerenders
- reload reconstructs the same selected workstream and semantic graph
- local execution passes the Director execution contract suite

### Phase 4 — Build the native fullscreen shell

1. Replace the app shell with the selected workstream, semantic graph, rails, and Director composer.
2. Connect speech capture and playback through the same Director intents as text.
3. Implement previous/next and direct workstream selection.
4. Render approvals and resource requests as first-class actionable state.
5. Render artifacts as typed outputs; open rich details in accessible DOM/native surfaces.
6. Integrate the WebGL2 canvas through packed snapshots, not component-level node state.
7. Reprofile all required live scenarios and record a second append-only report.

Exit gate:

- the fullscreen workflow covers ordinary chat and active agent work
- the UI remains useful when no folder has been selected
- semantic facts and Director interpretations are visually distinguishable
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

When the implementation is ready to merge and the user asks verification to begin:

1. Run focused projector, registry, renderer, and Director boundary tests.
2. Run deterministic Electron E2E through production
   main/preload/renderer/HTTP/store paths.
3. Cover folderless start, routing, streaming, queueing during a run, steering, approvals, resource
   requests, completion, cancellation, failure, retry/recovery, artifact arrival, workstream
   switching, and restart/replay.
4. Run live Codex E2E with local ChatGPT auth and without `OPENAI_API_KEY`.
5. Run final performance scenarios and compare them with both baselines.
6. Run the repository's requested merge gates and inspect generated output.
7. Freeze a named green Setta 4 checkpoint.

The deterministic E2E suite is the product cutover proof. Component tests alone are insufficient.

## Setta 4 Sprites Follow-On

Only after the Setta 4 checkpoint:

1. Create `setta-4-sprites` from the green Setta 4 commit.
2. Maintain a migration ledger with source commit, behavior, new owner, tests, and disposition.
3. Port behavior in independently reviewable slices:
   - provider contracts and conformance harness
   - runtime capabilities and setup state
   - credentials and authentication
   - signed installation
   - backup, accounting, and leases
   - private gateway/control-plane behavior
   - Setta 4 Go contracts and generated TypeScript
   - secure desktop automatic runtime binding
   - local and managed Director execution adapters
   - deterministic production Electron E2E
   - offline hosted-provider harness
4. Require both execution adapters to pass the same Director contract suite.
5. Reprofile the command center under local and hosted event latency.
6. Begin real hosted provisioning only under a separately authorized live plan with short-lived
   credentials, a spend cap, a cleanup deadline, and explicit resource inventory.

Do not port:

- the runtime picker as a primary UX
- the provider wizard as a primary UX
- Niri or pane integration
- web/PWA paths
- terminal-centric acceptance criteria
- BYO/Tailscale compatibility paths removed by later Sprites cleanup
- any older contract when Setta 4 owns a newer shape

The Director should choose and explain execution placement from trusted capability state. The user
may inspect or override a meaningful decision, but should not have to operate provider plumbing.

## Completion Definition

Setta 4 is complete when:

- a user can open the app with no selected folder and start useful work immediately
- the Director can route, create, delegate, steer, cancel, clarify, and recover through typed paths
- approvals, resources, artifacts, and outcomes are durable and actionable
- every semantic node and edge has real meaning, provenance, and deterministic replay
- the fullscreen WebGL2 command center meets the measured 120 Hz budgets on target hardware
- the experience scales down to a phone-sized viewport without adopting the old pane model
- Niri/manual pane control is absent from the production path
- deterministic production Electron E2E covers the mission-critical lifecycle
- live Codex E2E passes with ChatGPT auth and no OpenAI API key
- a green checkpoint exists from which `setta-4-sprites` can begin

## Immediate Next Actions

1. Review and accept this plan as the Setta 4 plan of record.
2. Finish the final `setta-3` merge-ready verification when requested.
3. Create `setta-4` from that verified commit.
4. Commit the branch/source manifest and Niri ownership inventory.
5. Start Phase 1 with the semantic node and edge contracts.
