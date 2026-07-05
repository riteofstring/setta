# Easy Button Pane: Hidden Multi-Agent Runs, Narrated Highlights, And Artifacts Plan

Date: 2026-07-08

## Scope

This plan turns `docs/mockups/easy_button_pane_mockup.html` into a real product
surface: a new `easy-button` `SurfaceKind` where the user states a request and
the system does the work invisibly. The pane shows exactly three things while a
request runs:

- occasional, high-level highlight lines on the left rail
- finished, self-sufficient artifact cards on the right rail
- the button/state center with the user's own request text

There is no agent transcript, no tool-call feed, no command output, and no
approval traffic in this pane. Underneath, the backend runs a hidden
orchestrator agent (later: plus sub-agents) on the existing chat/run substrate,
and a cheap narrator model distills the raw event stream into the few phase
highlights and completion summary the user sees. Artifact cards are not
narrator guesses; they are deliberate typed outputs emitted by the orchestrator
through the artifact tool.

The mockup is the visual/interaction spec for the pane body (states `idle`,
`listening`, `working`, `complete`; swirl field; rail behavior; footer input).
This plan is the functional and architectural spec.

## Non-Negotiable Outcome

A user types a request into the pane and, without seeing any agent mechanics:

- the pane enters `working`, with the request text shown faintly (their own
  words — never AI transcript)
- a small number of high-level highlights appear over the run's lifetime,
  written at the level of "Benchmarking paint cost per frame", never at the
  level of "Ran `pnpm test`" or "Wrote foo.ts"
- finished artifacts (markdown, tables, bar charts, file references) land on
  the right rail as the run produces deliverables
- completion shows an honest summary ("Done in 2m 14s · 3 artifacts", or what
  failed / that it was stopped)
- tapping the button mid-run cancels the hidden run(s); already-emitted
  artifacts stay
- everything the user sees is a first-class typed contract produced by the
  backend — the renderer never derives highlights or artifacts from raw
  transcript events

The magic is a separation of planes: the **execution plane** (hidden internal
conversations with full tool access and normal persisted transcripts) and the
**presentation plane** (typed `EasyHighlight` / `EasyArtifact` / summary
contracts that only the backend can produce). The pane renders only the
presentation plane.

## Decisions Already Made

Recorded from product review on 2026-07-08:

- **Input is text-first.** v1 ships with the footer text input as the real
  path. Voice/STT is explicitly deferred (see Deferred Work); the repo has zero
  STT today (`VoiceInputUnavailableButton` in
  `desktop/src/renderer/src/components/chat-composer-controls.tsx` is the whole
  voice surface). v1 ships no voice stubs and no unreachable `listening`
  state — the run contract has no listening status and pane state is
  renderer-local, so voice lands later without contract churn and without
  dead code in the meantime.
- **v1 interrupt policy is "yolo mode".** The orchestrator runs with the most
  permissive existing permission preset (approvals never; pick the existing
  preset from `internal/chat/codex_permission_presets.go` — do not invent a new
  one) and is instructed to proceed on reasonable assumptions rather than ask.
  Assumptions do NOT surface as highlights. The long-run direction is
  "the button becomes the question" (glyph swap + question text + re-armed
  input); that is deferred, not rejected.
- **Highlights are phase-level and sparse.** Agents write files and run
  commands constantly; none of that may appear on the left rail. Silence is the
  default state of the rail; a highlight is an event. This is a hard product
  constraint, encoded in the narrator trigger policy below.
- **Artifacts are self-sufficient, with a hidden escape hatch.** Cards render
  fully in-pane. A deliberately hidden affordance (pane context menu) exposes
  debug access to the underlying internal conversation. No visible click-through
  into the transcript world.
- **v1 agent topology is master + narrator; fan-out is the next phase.** One
  hidden orchestrator conversation does the work; a cheap narrator watches. A
  fast-follow phase enables fan-out through Codex's native collab-agent tools
  (verified stable and enabled by default in the reference Codex source — see
  the fan-out phase); Setta builds no spawn tool of its own. The UI contract
  (agent-count chip) supports N agents from day one.
- **Milestones are explicit.** The single-agent v1 milestone is the product
  surface with hidden orchestrator runs, typed artifacts, narrator highlights,
  honest terminal summaries, restart/stop behavior, and the required
  production-path tests and performance report. Native Codex collab fan-out is
  part of the full-plan completion milestone, not a prerequisite for the
  single-agent v1 ship decision. The automation stop sentinel is reserved for
  full-plan completion unless the plan is updated with a genuine blocker.
- **Rails reset per request.** A new request clears both rails (the honest
  reading of the mockup). The latest run, its highlights, and its artifacts are
  persisted and restored into the pane via snapshot on reopen/restart.

## Substrate Verdict: Chat/Run Layer, Not The Workflow Engine

The workflow engine (`internal/orchestrator`) was evaluated and rejected as the
execution substrate:

- Workflow graphs are snapshotted into an immutable
  `WorkflowDefinitionVersion` at `StartExecution`
  (`internal/orchestrator/service.go`); the reducer only ever reads
  `version.Graph`. There is no API to add nodes/edges to a running execution.
  Runtime-decided fan-out ("master decides to spawn 3 sub-agents") is
  structurally impossible within one execution.
- `ValidateExecutableGraph` gates every start; one active execution per
  definition. Both fight ephemeral machine-generated plans.

The chat/run substrate already provides everything needed, battle-tested by
three existing subsystems:

- **Hidden conversations:** `Conversation.Internal: true`
  (`internal/chat/types.go`); `ListConversations` skips them. Workflow agent
  conversations already use this exact pattern
  (`internal/chat/service_workflow.go`, `newWorkflowAgentConversation`).
- **Backend-initiated turns:** `chat.Service.SendWorkflowAgentTurn` is the
  proven backend-facing turn entrypoint; the easy-run service adds a sibling.
- **In-process event consumption:** `chat.Service.SubscribeEvents(EventCursor)`
  over the `EventHub` (`internal/chat/events.go`) is consumed in-process today
  by `internal/notify` (`StartChatObserver`), the semantic-graph cartographer
  observer, and the workflow reconciler. The narrator is a fourth consumer of
  the same pattern.
- **Cheap one-shot JSON model calls:**
  `chat.Service.HarnessTaskRunner().RunTask` with
  `TurnMode=HarnessTurnStructuredTask` + `HarnessOutputStrictJSON` opens an
  ephemeral read-only, approvals-never, no-tools Codex session returning
  schema-validated JSON (`internal/chat/codex_harness_structured.go`). The
  cartographer uses it today.
- **App-provided agent tools:** the `setta` dynamic-tool namespace
  (`internal/chat/agent_tools.go`, `agent_tools_setta.go`;
  `setta.workflow_result` is the template) is the deliberate-artifact channel.
- **Parallelism:** independent conversations run concurrently
  (`internal/chat/service_parallel_test.go`), and Codex itself provides native
  runtime sub-agents (collab tools), which the fan-out phase rides.

## Relationship To The Workflow Feature (Planned Removal Is Safe)

The workflow feature (the workflow pane kinds, the `internal/orchestrator`
engine, and its event/activity plumbing) may be removed from the app entirely.
This plan does not depend on it. Everything the easy button builds on is
chat-core (`internal/chat`): internal conversations, the event hub, structured
tasks, dynamic tools, run liveness, cancel/recovery. Workflow is merely the
current _user_ of some of those mechanisms. If removal proceeds, three
keep-alives for the removal work:

- Keep the `Conversation.Internal` capability. Workflow is today its only
  producer (`internal/chat/service_workflow.go`), and
  `internal/chat/validate.go` couples internal conversations to workflow
  metadata — decouple/generalize that validation rather than deleting the
  mechanism; easyrun becomes its next producer with its own metadata.
- Keep the structured-task path (`internal/chat/codex_harness_structured.go`,
  `HarnessTaskRunner`). Its only current consumer is the semantic
  cartographer; if the cartographer is removed before this plan lands, the
  narrator becomes its sole consumer — do not let dead-code gates take it.
- Keep the shared trajectory/transcript components the escape hatch reuses —
  main chat renders through them; deleting workflow panes must not delete
  chat-shared machinery.

Removal also strengthens the substrate verdict above (the easy button was
deliberately not built on the engine being removed), and if the cartographer
goes, its dependency on the legacy assistant-text event surface goes with it
(that surface also serves recovery/validation — verify before deleting).

## Replacement Policy

This is a new feature; there is nothing to migrate. Still, do not add:

- heuristic highlight generation (keyword matching on transcript text, "looks
  like a phase change" string rules) — highlights come from the narrator model
  or not at all
- mechanical lifecycle highlights ("Started", "Running commands…") — these are
  exactly the noise this pane exists to hide
- silent fallbacks when the narrator fails — degrade visibly via a typed
  `narratorStatus` field, never with fabricated content
- raw HTML or SVG artifact payloads rendered via `dangerouslySetInnerHTML` —
  artifact payloads are typed structures rendered by typed components;
  markdown renders through the existing sanitizing `MarkdownText`
- polling anywhere — snapshot + cursor + push events end to end
- renderer-side derivation of presentation state from chat transcript events —
  the easy-run store consumes only easy-run contracts
- backward compatibility, legacy support, migrations, transitional adapters,
  dual-read/dual-write paths, old-field aliases, or feature flags between old
  and new behavior — none, anywhere, including between this plan's own phases:
  if a later phase changes an easy-run contract or stored shape, replace it
  outright; easy-run state persisted by an earlier phase is discarded or fails
  loudly, never dual-read
- speculative code for deferred work — no unreachable states, no voice stubs,
  no disabled placeholder affordances; the Deferred Work section documents
  direction, and the code ships when its phase does
- a new provider abstraction — Codex is the only provider; use the existing
  harness paths

## Architecture

### Execution plane

New Go package `internal/easyrun`, wired up in `internal/runtime/server.go`
alongside the notify/cartographer starts.

Starting a request (`EasyRunService.Start`):

1. Reject if this workspace already has an active easy run (one at a time;
   fail loudly with a typed error the pane surfaces as helper text).
2. Persist an `EasyRun` record (see Contract Plan) and publish
   `easyrun.run.updated`.
3. Create a fresh `Internal: true` chat conversation tagged with easy-run
   metadata (sibling of `ConversationWorkflowMetadata` — a typed
   `ConversationEasyRunMetadata{EasyRunID}` field on the conversation, not a
   string convention).
4. Start the orchestrator turn through a dedicated backend-facing entrypoint
   (`SendEasyRunTurn`), modeled on `SendWorkflowAgentTurn` but not shared with
   it — do not extract a common abstraction with a feature that may be
   removed. Turn settings:
   workspace chat defaults for model/effort (`ChatCodexDefaults`), the existing
   most-permissive permission preset (yolo), `cwd` = workspace root.
5. The orchestrator's developer-instructions addendum defines its role: do the
   work end to end; never ask the user anything; make reasonable assumptions
   and proceed; every user-facing deliverable MUST be emitted through
   `setta.emit_artifact` (final answers that live only in assistant prose are
   lost — the user never sees the transcript).

A fresh conversation is created per request (clean context; honest
reset-per-request rails). The conversation persists afterward as the audit
trail behind the escape hatch.

Completion is push-driven, mirroring the workflow reconciler pattern
(`internal/orchestrator/service_actions.go` `startChatEventReconciler`): the
easy-run observer watches chat events for its conversations; when the backing
run goes terminal, the easy run is marked `completed` / `failed` / `stopped`,
the final summary is produced (see narrator), and `easyrun.run.updated` is
published.

Zero-artifact completion is explicit. A run may complete successfully with no
artifacts only when the request produced no durable user-facing deliverable; the
summary then says that plainly ("Done in 42s · no artifacts"), the right rail
stays empty, and the service does not fabricate a placeholder card. The
orchestrator is still instructed to emit artifacts for every deliverable. Tests
and live acceptance tasks that request a concrete deliverable, such as a table
or report, require at least one artifact; zero artifacts for those tasks is a
failure of the run behavior, not a renderer fallback case.

Stop: `EasyRunService.Stop` cancels the active backing chat run via the
existing cancel path (`CancelActiveRunByID`); state becomes `stopped`;
artifacts already emitted are kept. In the fan-out phase, stop also interrupts
every live sub-agent thread (parent interrupt does not cascade — see the
fan-out phase).

Restart: chat startup recovery already marks interrupted runs failed
("run interrupted by backend restart", `internal/chat/service_recovery.go`).
Easy-run startup recovery mirrors it: any persisted easy run still `working`
is marked `failed` with that reason. No resurrection.

### Presentation plane: the narrator

The narrator is an in-process observer goroutine in `internal/easyrun`,
subscribed via `chat.Service.SubscribeEvents` exactly like
`internal/notify/service.go`. It:

1. Filters events to conversations owned by active easy runs.
2. Maintains a per-run **digest buffer**: mechanically condensed entries built
   in Go from typed events (assistant text fragments, reasoning summary
   headlines, command titles, file-change file names, artifact titles), each
   tagged with its source kind so the narrator can distinguish phase evidence
   from action noise. The digest is bounded (cap entries and bytes; drop
   oldest), and it never includes raw command output, full tool output, diffs,
   or file contents. This is data condensation, not interpretation — no
   heuristic "importance" scoring.
3. On the trigger policy firing, runs a structured task via
   `HarnessTaskRunner().RunTask` with a strict JSON schema and a prompt
   containing: the original request, all previously emitted highlights, and
   the new digest entries since the last call.
4. Persists and publishes any returned highlights
   (`easyrun.highlight.created`).

Structured-task plumbing: add a new `HarnessSurface` constant (e.g.
`HarnessSurfaceEasyRunNarrator`) and relax
`validateCodexStructuredTaskShape` / the cartographer-only surface gate in
`internal/chat/codex_harness_structured.go` to accept it. The narrator task
runs with the workspace default model at `minimal` reasoning effort (constants
owned by `internal/easyrun`, tunable).

**Highlight selectivity policy (hard product constraint).** The left rail must
read like the mockup: ~6 lines over a 2-minute run, each a phase, not an
action.

- The narrator schema returns `highlights: []` as the normal case. The prompt
  instructs: emit a highlight only when the _phase_ of work has meaningfully
  changed since the previous highlight; file edits, command runs, test runs,
  and retries are never highlights by themselves.
- Trigger policy (code, not prompt): call the narrator at most once per
  `minNarratorInterval` (initial: 15s) and only when at least
  `minNewDigestEntries` (initial: 8) accumulated since the last call; always
  call once on run terminal for the summary. Initial values are tunable
  constants in `internal/easyrun`.
- Per-call output cap: at most 2 highlights accepted per narrator call; a
  run-level soft cap (initial: 12) is enforced in code — excess is dropped
  with a logged warning, never rendered.
- Narrator calls are serialized per run (no concurrent calls for one run) and
  the digest consumed by an in-flight call is not re-sent.

**Enforcement boundary.** Code enforces the source of rail content, trigger
cadence, caps, schema validity, no renderer-side transcript derivation, and
the absence of mechanical lifecycle highlights. Code cannot prove arbitrary
model-authored prose is semantically phase-level. That product-quality bar is
enforced by the narrator prompt, by keeping the digest sparse and source-tagged,
and by deterministic E2E fixtures that include noisy command/file/test activity
while asserting only scripted phase highlights render. Live-provider tests are
evidence, not proof; if live output repeatedly looks mechanical, tighten the
digest or narrator prompt before accepting the phase rather than adding
renderer heuristics.

**Failure policy.** A narrator failure must never affect the execution plane.
On structured-task error: log loudly, set `EasyRun.NarratorStatus = degraded`
(typed enum, published via `easyrun.run.updated`), and continue. The pane
renders a faint "narration degraded" indicator. Never fabricate highlights.
If the run completes while the narrator is degraded, the completion summary
contains only the mechanical fields (duration, artifact count) — facts the
service computes itself, not narration.

**Event-hub caveats (from `internal/chat/events.go`):** the hub is global and
lossy under backpressure (slow subscribers are dropped and must resync via
cursor replay). The observer must drain its channel promptly (buffer internally,
never block on narrator calls) and must handle re-subscription from a cursor
after a drop without duplicating digest entries it already consumed.

### Artifacts: deliberate, typed, tool-emitted

Artifacts are authored by the **orchestrator**, not inferred by the narrator.
Register a new dynamic tool in the `setta` namespace
(`internal/chat/agent_tools.go` registry; handler pattern from
`agent_tools_setta.go`):

- `setta.emit_artifact` — input schema is a tagged union on `kind`:
  - `markdown`: `{ title, kicker?, markdown }`
  - `table`: `{ title, kicker?, columns: [{key, label}], rows: [[string]] }`
  - `bar_chart`: `{ title, kicker?, items: [{label, value, unit?}] }`
  - `file`: `{ title, kicker?, path, description? }`
- The handler resolves the owning easy run from the tool-call runtime context
  (`AgentToolRuntimeFromContext`); if the conversation is not an easy-run
  conversation, the call fails loudly (tool error back to the model). If
  per-thread tool selection is cheap to add at `thread/start`
  (`codexThreadStartParams` in `internal/chat/codex_dynamic_tools.go`), scope
  the tool to easy-run conversations instead; either way the handler validates
  ownership.
- Validation is strict and fail-loud with size caps (initial: markdown ≤ 16KB,
  table ≤ 100 rows × 12 columns, chart ≤ 24 items, ≤ 20 artifacts per run).
  A rejected call returns a specific error message so the model can retry
  smaller.
- The handler persists the `EasyArtifact` and publishes
  `easyrun.artifact.created`. Artifact emission also lands in the narrator's
  digest (titles only) so highlights can reference deliverables.

Rendering: `markdown` renders through the existing `MarkdownText`
(`react-markdown` + `remark-gfm`; GFM tables, images stripped, http/https links
only). `table`, `bar_chart`, and `file` render as typed components styled per
the mockup (`.a-table`, `.a-bar-*`). No chart library is added; bars are plain
divs. No SVG/diagram kind in v1 (see Non-Goals).

### Pane UX contract

- **States.** Renderer pane state derives from the easy-run contract: `idle`
  (no run / after reset), `working` (run active), `complete` (terminal —
  completed, failed, or stopped, with tone/summary reflecting which).
  `listening` is deliberately not implemented in v1 — no unreachable states
  ship; the mockup documents it for the voice phase, and `idle` must not
  promise speech (no mic glyph, no "Tap to speak" helper) until voice exists.
  Visuals otherwise per the mockup: swirl field opacity/deceleration, confirm
  pulse on completion, helper text per state; the listening rings arrive with
  voice.
- **Center.** The button is the single control: `idle` → focus the footer
  input (until voice exists); `working` → stop (cancel); `complete` → reset to
  idle (rails clear when the _next_ run starts). The request text shows
  faintly during working/complete (user's own words). The agent chip shows
  `EasyRun.ActiveAgentCount` while working ("1 agent" is honest in v1).
- **Left rail.** Highlights, newest at the bottom, age-fade per the mockup,
  elapsed time computed from `EasyRun.StartedAt` vs `Highlight.At`. Rail label
  hidden while empty.
- **Right rail.** Artifact cards stack from the top, arrival animation,
  overflow scrolls with the soft mask per the mockup.
- **Footer input.** Lives inside the surface component (there is no chrome
  footer slot — the chat composer precedent). Enter submits; disabled while a
  run is active.
- **Chrome.** Title mirrors state via `setHostPaneChromeTitle`
  ("Easy Button · working"); icon via `pane-title-metadata.ts` (+ new glyph in
  `pane-title-icons.ts`); tone `cyan`; pane limit 1
  (`defaultRealWorkspacePaneLimits`).
- **Full width.** There is no "opens maximized" precedent and maximize is
  transient (cleared on any pane open). Open the pane with
  `widthSpec: { unit: "proportion", value: 1 }` in its `OpenPaneRequest` — a
  durable full-viewport column; other panes open beside it in the scrolling
  column canvas. Do not build new maximize machinery.
- **Freeze / runtime policy.** Runtime category `heavy-dom`; mirror the
  memberships of `workflow-node-details`/`chat-dom` in the runtime-policy kind
  sets and the `surface-registry.ts` predicates (`bitmapSnapshotSurfaceKind`,
  `resizeDefersSurfaceViewport`), verifying each set's semantics at
  implementation time. All pane animation is pure CSS (as in the mockup — no
  rAF loop, so the shared `ReactDomSurfaceAdapter` suffices; no custom adapter
  class). Add an explicit CSS rule pausing all easy-button animations under
  `.workspace-pane-host[data-surface-frozen="true"]`, and honor
  `prefers-reduced-motion` per the mockup's reduced block and the
  `setta-live-headline-shimmer` precedent in `styles.css`.
- **Escape hatch.** Pane context menu gains two hidden actions: "Copy debug
  info" (easy-run ID, conversation ID, run ID — Phase 2c) and "Open underlying
  run (debug)" (Phase 6): a read-only trajectory view of the internal
  conversation reusing the block-driven machinery the workflow node-details
  pane uses (`LoadRunTranscriptPage` + the shared trajectory surface). Not
  discoverable from the normal UI.

## Contract Plan

Go-owned contracts in `internal/easyrun/types.go`; register value sets, tagged
unions, and event contracts in `cmd/generate-contracts/contract_registry.go`;
regenerate with `./scripts/go.sh run ./cmd/generate-contracts` (writes
`desktop/src/generated/backend.ts` + `internal/httpapi/contract_schema_snapshot.json`).
Never hand-edit generated outputs.

- `EasyRun`: `ID`, `WorkspaceID`, `Status` (`working | completed | failed |
stopped`), `RequestText`, `ConversationID`, `StartedAt`, `EndedAt?`,
  `Summary?` (final one-liner), `Error?`, `NarratorStatus` (`ok | degraded`),
  `ActiveAgentCount`, `ArtifactCount`, `HighlightCount`.
- `EasyHighlight`: `ID`, `EasyRunID`, `Ordinal`, `Text`, `At`.
- `EasyArtifact`: `ID`, `EasyRunID`, `Ordinal`, `Kind`, `Title`, `Kicker?`,
  `CreatedAt`, plus exactly one populated payload branch
  (`Markdown | Table | BarChart | File`). This is a tagged union: it needs
  `taggedUnionBranch` entries in `contractTaggedUnions()` (discriminator
  `kind`) so the generated decoder fails loudly on malformed payloads — a
  missing branch entry is a runtime decode throw ("found 0 branches").
- Events (own hub + own SSE stream, following the workflow/terminal pattern,
  with `EventContracts()` feeding codegen): `easyrun.run.updated`,
  `easyrun.highlight.created`, `easyrun.artifact.created`, plus a
  `easyrun.resync_required` pathway consistent with the other hubs.
- Endpoints (`internal/httpapi/endpoints.go` registry + handlers):
  `POST /easy-runs/start`, `POST /easy-runs/stop`,
  `GET /easy-runs/snapshot` (latest run for the workspace + its highlights +
  artifacts + event-stream cursor — the snapshot-then-subscribe convention),
  and the SSE event stream endpoint.
- `internal/workspaceui/types.go`: `SurfaceKindEasyButton = "easy-button"`
  const + `ContractValueSets()` entry; `internal/workspaceui/store.go`
  `validSurfaceKind()`. No persisted pane config struct is needed in v1 (the
  pane binds to its workspace's latest easy run).
- Persistence for easy-run records follows the chat store precedent
  (`internal/chat/store_*.go`) — same storage layer, new tables/files owned by
  `internal/easyrun`.

## Implementation Plan

Each phase lands independently green: `./scripts/format.sh` +
`./check_quality.sh --git-changes` during development, `--all` for the
contract-changing phases, deterministic Electron E2E through production paths,
live Codex E2E where flagged (skip loudly without ChatGPT auth). Renderer code
is a directory of small modules from day one
(`features/easy-button/easy-button-surface.tsx` + submodules;
`stores/easy-run-store.ts` + `easy-run-events.ts`): the 1000-line cap,
complexity 10, max-depth 4, and max-params 5 are enforced by
`scripts/quality/check.sh`.

### 1. Register The Easy Button Surface End-To-End

Add the `easy-button` product kind across every registration site, with the
pane rendering the `idle` state only (center button with breathing glow,
hidden rail labels, empty rails) and no backend wiring. The footer input and
the working/complete visuals (swirl layers, dot pulse, confirm pulse) ship
with Phase 2b, when the states they express become reachable — nothing dead
ships early.

Sites (from the verified checklist; the four `satisfies Record<SurfaceKind,…>`
maps drive most of it, the silent ones are listed so they are not forgotten):
`internal/workspaceui/types.go`, `internal/workspaceui/store.go`, regenerate
contracts, `workspace-layout/types.ts` `productSurfaceKinds`,
`surface-adapters.ts` `defaultSurfaceAdapterFactories`,
`react-dom-surface-adapter.tsx` import + branch (runtime throw if missed),
`runtime-policy.ts` `surfaceRuntimeCategories` + kind sets,
`surface-dom-content.ts` `staticSnapshotRenderers`, `benchmark-scene.ts`
`surfaceKindLabels`, `pane-title-metadata.ts` + `pane-title-icons.ts`,
`workspace-scene.ts` `defaultRealWorkspacePaneLimits` (1),
`workspace-toolbar.tsx` `openPaneActions` (button + `shortcutKey`),
`surface-registry.ts` predicates. Open requests pass
`widthSpec: { unit: "proportion", value: 1 }` and tone `cyan`.

Port the mockup's idle-state CSS into the pane's stylesheet with the
production adjustments: animations pause under `[data-surface-frozen="true"]`,
`prefers-reduced-motion` honored, no `innerHTML` anywhere. Working/complete
CSS arrives with Phase 2b alongside the states themselves.

Before merging the first easy-button animation/CSS, capture the baseline with
the existing frame-metrics pipeline and append a report under
`docs/reports/performance/`. Baseline the current workspace surface behavior
first, then re-measure after the idle swirl lands in Phase 1 (idle, frozen, and
pan/resize if the harness supports it). If the measured cost is already
unacceptable, fix the visual implementation in Phase 1 rather than deferring the
problem to the hardening phase.

### 2. Add The Easy-Run Domain And Hidden Orchestrator Vertical Slice

Phase 2 is intentionally split into independently committable subphases. Do
not combine them just to reduce commit count; each subphase should leave the
repo green and should expand the deterministic production-path workflow only as
far as the implemented behavior can honestly support.

**2a. Domain, contracts, store, and empty snapshot.** Create
`internal/easyrun` ownership for service/store/types, register the Go-owned
contracts from the Contract Plan, regenerate generated outputs, and add the
event hub/SSE contract shape plus `GET /easy-runs/snapshot`. Snapshot may return
"no latest run" at this point. Do not expose public start/stop endpoints until
Phase 2b unless they are fully wired; avoid not-implemented endpoint stubs. Add
the renderer easy-run store modules with snapshot hydration, event decoding, and
resync handling exercised by focused tests, but keep the pane visually idle.
Verification for 2a is contract generation, store/backend unit coverage, and
quality gates; no chat-run E2E is required because no chat run is started.

**2b. Hidden run lifecycle through production UI.** Add start/stop handlers and
`EasyRunService.Start` / `Stop`. Start creates the `Internal` conversation with
typed easy-run metadata and launches the orchestrator turn (yolo preset,
workspace-default model/effort, orchestrator developer-instructions addendum).
The observer goroutine subscribes to chat events, tracks the backing run, and
marks the easy run terminal when the chat run ends (completed -> summary fields
mechanical-only for now: duration/artifact count including zero; failed/stopped
honest). Stop cancels via `CancelActiveRunByID`. The pane footer input and
working/complete visuals land here with real submit: submit -> `working`
(button = stop, swirl on, request text faint) -> `complete` (confirm pulse,
mechanical summary). Left rail stays empty in this subphase -- no mechanical
highlights, per the Replacement Policy. Deterministic Electron E2E through
toolbar/preload/HTTP/store/renderer paths is required for this subphase because
it starts real hidden chat runs, even if artifacts and narrator are still
absent.

**2c. Lifecycle hardening before artifacts.** Add startup recovery for orphaned
`working` easy runs, active-run rejection in the same workspace, latest-run
snapshot restore after reload/restart, `easyrun.resync_required` handling, rails
reset on the next request, and the "Copy debug info" context-menu action.
Extend the deterministic Electron workflow for reload/restart, active-run
rejection, second-request reset, and stop-mid-run behavior. Do not proceed to
artifact work until these lifecycle edges are covered.

### 3. Add Deliberate Artifacts Via A setta.emit_artifact Dynamic Tool

Register the tool with the strict tagged-union input schema, ownership
resolution from runtime context, fail-loud validation, size caps, persistence,
and `easyrun.artifact.created` publication. Add the orchestrator instruction
that all deliverables must be artifacts. Renderer: artifact card components
(`markdown` via `MarkdownText`, `table`, `bar_chart`, `file`), right-rail
stacking/overflow/animation per the mockup, artifact count in the summary
line. Extend the fake Codex app-server fixture
(`desktop/tests/electron/fixtures/fake-codex-app-server.mjs`) to script
dynamic-tool calls if it does not already.

### 4. Add The Narrator: Selective Highlights And Completion Summary

Add `HarnessSurfaceEasyRunNarrator` + validator relaxation in
`internal/chat/codex_harness_structured.go`. Implement the digest buffer, the
trigger policy (interval + entry thresholds + per-call and per-run caps,
serialized calls), the strict highlight/summary JSON schema, persistence and
publication, `NarratorStatus` degradation, and the completion-summary call on
terminal (narrative sentence + mechanical duration/artifact-count). The
trigger policy and digest condensation are pure functions with focused unit
tests. Deterministic E2E scripts the narrator's structured-task responses
through the fake app-server; the left rail renders scripted highlights with
age-fade and elapsed times.

### 5. Add Sub-Agent Fan-Out Via Native Codex Collab Agents

Fan-out uses Codex's native collab surface, not a Setta-side spawn tool.
Verified against the reference Codex source
(`/Users/kevin/Documents/AppDevelopment/reference_repos/codex`): the V1 collab
feature (`Feature::Collab`, key `multi_agent`) is **stable and enabled by
default**, exposing `spawn_agent` / `send_input` / `wait_agent` /
`resume_agent` / `close_agent` to the model. Each spawned agent is a real
thread with its own `threadId` in the same app-server process; a connected
client is **auto-attached to every child thread's full event stream**
(item notifications scoped by child `threadId`); children **inherit the parent
turn's sandbox, approval policy, and cwd** (the yolo preset propagates);
`spawn_agent` accepts per-child `model` / `reasoning_effort` / role. Provider
defaults bound the tree: 6 concurrent agents, spawn depth 1 (workers cannot
sub-spawn). Setta's work is observation, control, and truthful presentation:

- Orchestrator instructions must explicitly authorize spawning (Codex's tool
  prompt tells the model to refuse unless the user asked) and must instruct
  the master to collect worker results and author all artifacts itself.
  Fresh sub-agents do not receive client-provided dynamic tools (protocol
  fact: spawn passes an empty `dynamicTools` list; only full-history forks
  recover them), so `setta.emit_artifact` is master-only — which also keeps a
  single curating author for deliverables.
- Extend collab-item ingestion (`collabAgentToolCallRunItem` in
  `internal/chat/codex_protocol.go`) to retain `receiverThreadIds`,
  `agentsStates`, `prompt`, and `model` — today Setta keeps only
  id/tool/status and drops the rest.
- Register child threadIds (learned from collab items) as owned by the easy
  run so child-scoped notifications and server requests route deliberately —
  condensed into the narrator digest or explicitly discarded with logging,
  never claimed by unrelated runs, never a crash. Child-scoped approval or
  dynamic-tool requests must be answered if they arrive.
- `ActiveAgentCount` derives from `agentsStates` (1 + children in
  pendingInit/running); this drives the agent chip.
- Stop semantics need characterization first: parent `turn/interrupt` does
  **not** cascade to children (verified in the reference source), so stop must
  interrupt the master and every live child thread. Prove client-side
  interrupt of a V1 child works through Setta's harness before building on
  it; if the provider rejects it, resolve stop semantics before shipping —
  do not ship fan-out with unstoppable workers. The same applies when the
  master run ends with workers still live: terminal handling closes them.
- Narrator fidelity in this phase comes from parent-side signals (collab
  items with per-agent states and final messages, injected sub-agent
  notifications, master text). Condensing child event streams into the digest
  is an optional follow-up if highlight quality needs it — phase-level
  highlights may not.

If characterization shows the native surface is unusable through Setta's
harness, halt this phase and re-decide with the real tradeoffs on the table.
Do not build a Setta-owned spawn mechanism alongside the native one, and do
not ship both behind a flag.

### 6. Harden And Polish

- Escape hatch: "Open underlying run (debug)" context-menu action rendering a
  read-only trajectory view of the internal conversation via the existing
  block-driven trajectory machinery.
- Performance: baseline and re-measure the swirl's cost with the existing
  frame-metrics pipeline (frame times, long tasks) in idle/working/frozen
  states; record an append-only report under `docs/reports/performance/`. If
  the blur-over-animating-conic stack is too hot, replace with a pre-blurred
  sprite before shipping — measured, not assumed.
- Edge cases: artifact-cap overflow messaging, very long request text, easy
  run start rejection while one is active, resync-required handling in the
  pane, reduced-motion audit, restart-recovery E2E.

### Deferred Work (explicitly out of scope for this plan)

- **Voice input.** Requires an STT decision (local Whisper-class sidecar
  preferred over cloud STT for a local-first app), `getUserMedia` capture,
  Electron mic-permission handling, and adding the `listening` pane state,
  mic glyph, and rings — all deliberately absent from v1, not stubbed.
- **Button-as-question interrupts.** The agreed long-run direction for
  clarifying questions and approvals; requires steering plumbing and question
  UI on the button. v1 is yolo mode.
- **Narrator-inferred artifacts, diagram/SVG artifact kind, artifact
  click-through, cross-request history browsing, per-request model/effort
  controls in the pane.**

## Verification Plan

This work touches chat behavior, Codex harness behavior (dynamic tools,
structured tasks), run lifecycle, event streaming, generated contracts, and
renderer state — deterministic production-path Electron tests are required,
plus live Codex E2E when ChatGPT auth is available (report skips loudly).
Those tests grow with the phases: Phase 1 proves pane registration and freeze
behavior; Phase 2b is the first phase that must exercise hidden chat-run
lifecycle through Electron; artifact, narrator, and fan-out assertions become
required only after their respective phases land.

### Backend Tests

- Start creates an `Internal` conversation invisible to `ListConversations`,
  with easy-run metadata and the yolo preset applied to the turn.
- Second start in the same workspace while active is rejected with the typed
  error; start in a different workspace proceeds.
- `emit_artifact` from a non-easy-run conversation fails loudly; oversized and
  malformed payloads are rejected with specific errors; valid payloads persist
  and publish.
- Trigger policy: no narrator call before thresholds; serialized calls; digest
  not double-consumed; per-call and per-run highlight caps enforced.
- Narrator structured-task failure sets `NarratorStatus=degraded`, run
  continues, terminal summary contains only mechanical fields.
- Chat run terminal (completed / failed / cancelled) drives easy-run terminal
  status; stop cancels the backing run and keeps artifacts.
- Startup recovery marks orphaned `working` easy runs failed.
- Observer survives event-hub subscriber drop via cursor resubscribe without
  duplicated digest entries or duplicated highlights.
- Fan-out: collab-item ingestion retains thread ids, agent states, prompt,
  and model; child-thread events route only to their owning easy run;
  `ActiveAgentCount` transitions derive from `agentsStates` and are
  published; stop interrupts master and all live children (characterization
  test for client-side child interrupt through the harness).

### Renderer Tests

- Store reducer: snapshot hydration, run.updated transitions, highlight and
  artifact appends, resync handling.
- Pane state machine: idle → working → complete; button action per state;
  input disabled while active; rails reset when the next run starts (not on
  completion).
- Artifact cards: each kind renders from typed payloads; markdown goes through
  `MarkdownText`; no raw HTML path exists.
- Highlight rail: bottom-newest ordering, age-fade classes, elapsed-time
  rendering from contract timestamps.
- Narrator-degraded indicator renders from the typed field.

### Deterministic Electron E2E

One workflow file (registered in `desktop/tests/electron/workflows.mjs`, tier
`required`, with a live variant like chat's), scripted against the fake Codex
app-server. The workflow is expanded phase by phase rather than waiting for the
entire plan:

- Phase 1: open workspace → open easy-button pane (toolbar + shortcut) → pane
  occupies a full-width column; idle/frozen visuals render and animation pause
  rules apply.
- Phase 2b: type a request → `working` state (swirl on, title "Easy Button ·
  working", request text faint, input disabled) → completion → confirm pulse,
  mechanical summary line with duration + artifact count, including the
  explicit zero-artifact case when appropriate.
- Phase 2c: second request → rails reset → stop mid-run → `stopped` summary,
  artifacts retained if any exist; active-run rejection and reload/restart
  recovery are exercised.
- Phase 3: scripted orchestrator emits two artifacts via the dynamic tool →
  cards appear on the right rail in order.
- Phase 4: scripted narrator structured-task responses → exactly the scripted
  highlights appear on the left rail; no other rail content ever appears (the
  test asserts the rail count stays at the scripted number while commands and
  file changes stream in the hidden conversation).
- Hardening: freeze the pane (background it) → animations paused
  (`[data-surface-frozen]` computed style asserted) → resume
- Hardening: reload/restart → snapshot restores the last run's rails and
  summary; interrupted-run recovery shows failed state honestly.
- Fan-out phase: scripted spawn of 2 children → agent chip shows 3 agents →
  stop cancels all.

### Live Codex E2E

With ChatGPT-authenticated Codex CLI (never `OPENAI_API_KEY`): a small real
request ("summarize this repo's README into a table") must produce a working →
complete cycle with ≥1 artifact emitted through the real dynamic-tool path and
≤ the capped number of highlights from the real narrator. If auth is
unavailable, the live test is reported skipped and skips are not proof.

### Performance

Baseline before Phase 1 merges the first swirl/animation CSS, re-measure after
Phase 1 idle/frozen behavior, and re-measure again after Phase 2b working-state
animation lands (idle, working, frozen, during pan where supported). Append each
report under `docs/reports/performance/`. The frozen state must contribute zero
animation work.

## Acceptance Criteria

### Single-agent v1 milestone

The single-agent v1 milestone is shippable only when:

- the pane exists as a persisted, full-width-column `easy-button` surface,
  openable from toolbar and shortcut, pane limit 1, surviving reload
- a typed request runs a real hidden Codex orchestrator; nothing about the
  conversation appears in the normal chat UI
- the left rail shows only narrator-authored, phase-level highlights, bounded
  by the caps; command/file/test activity never appears there
- deliverables arrive as typed artifact cards emitted through
  `setta.emit_artifact`, rendered without any raw-HTML path
- successful zero-artifact completion is explicit and honest; tests/live tasks
  that request concrete deliverables fail if no artifact is emitted
- completion, failure, stop, and backend-restart interruption all present
  honest summaries; stop preserves artifacts
- narrator failure degrades visibly via the typed status and never blocks or
  fails the run
- no compatibility, migration, transitional, feature-flagged-old-path, or
  speculative-stub code exists anywhere in the v1 feature
- v1-required tests exist and pass through production paths; the performance
  report is recorded; every v1 contract is Go-owned and regenerated, with the
  artifact payload union failing loudly at the decode boundary

### Full-plan completion

The full plan is complete only when the single-agent v1 criteria are still true
and:

- fan-out rides native Codex collab agents; stop reliably terminates the master
  and all workers; the agent chip reflects real per-agent states
- the hidden debug escape hatch opens the underlying run read-only without
  exposing transcript mechanics in the normal pane
- all listed fan-out and hardening tests pass through production paths
- the automation stop sentinel is emitted only after a fresh audit finds no
  remaining actionable work, or after this plan records a genuine blocker and
  the remaining work is explicit

## Progress Log

### 2026-07-08 — Phase 1 complete

Implemented the `easy-button` surface registration end to end:

- Go-owned `SurfaceKindEasyButton` contract value and workspace UI validation,
  with generated backend TypeScript regenerated.
- Renderer product-surface registration, React DOM adapter branch, runtime
  policy membership, static snapshot renderer, title metadata/icon, toolbar
  action (`Mod+Alt+E`), pane limit 1, and durable full-width
  `widthSpec: { unit: "proportion", value: 1 }`.
- Idle-only pane body under `features/easy-button/`: empty rails, centered
  round button with breathing glow, no footer input, no listening state, no
  working/complete visuals, no transcript, and no backend wiring.
- Frozen and reduced-motion CSS handling; the Electron workflow caught and
  fixed the pseudo-element pause rule for the button glow.
- Deterministic Electron coverage for toolbar open, shortcut open, persisted
  reload restore, full-width layout spec, idle render, and frozen CSS pause.
- Performance report recorded at
  `docs/reports/performance/easy-button-pane-phase1-20260708.md`.

Verification performed:

- `./scripts/go.sh run ./cmd/generate-contracts`
- `./scripts/go.sh test ./internal/workspaceui`
- `pnpm -C desktop exec vitest run
src/renderer/src/workspace-layout/workspace-scene.test.ts
src/renderer/src/workspace-layout/workspace-toolbar.test.tsx
src/renderer/src/workspace-layout/pane-title-metadata.test.ts
src/renderer/src/workspace-layout/runtime-policy.test.ts
src/renderer/src/workspace-layout/react-dom-surface-adapter.test.tsx
src/renderer/src/workspace-layout/surface-registry.test.ts
src/renderer/src/workspace-layout/workspace-interactions.test.ts`
- `pnpm -C desktop typecheck`
- `pnpm -C desktop build`
- `node desktop/tests/electron/easy-button-pane-workflow.test.mjs --skip-build`
- `node desktop/tests/electron/easy-button-pane-performance.test.mjs --skip-build`
- `./scripts/format.sh`
- `./check_quality.sh --all`

Baseline note: the pre-change
`pane-drag-drop-benchmark-performance.test.mjs` baseline was attempted before
implementation and failed before frame assertions because the benchmark read its
driver API before installing the driver extension. The failure and artifact path
are recorded in the performance report.

Remaining work: Phase 2a is next. It should create the `internal/easyrun`
domain, contracts, store, event/SSE shape, empty snapshot endpoint, generated
contracts, and renderer easy-run store modules while keeping the pane visually
idle and without exposing start/stop endpoints until Phase 2b.

### 2026-07-08 — Phase 2a complete

Implemented the easy-run contract and empty snapshot slice without exposing
start/stop:

- Added `internal/easyrun` ownership for typed runs, highlights, artifacts,
  generated value sets, strict artifact/event tagged unions, an owned event
  hub with replay/resync behavior, an empty snapshot store/service, and
  shutdown wiring in the runtime.
- Added `GET /easy-runs/snapshot?workspaceId=...` and
  `/easy-runs/events` SSE endpoints through the HTTP endpoint registry, with
  generated TypeScript contracts regenerated and backend protocol version
  bumped to 8 for the schema hash change.
- Added the Electron/preload/web typed `easyRun` API surface: main handles
  snapshot reads, and both desktop and web event subscriptions are backed by
  the generated easy-run contracts and push event streams. Pane hydration stays
  deferred until Phase 2b has real easy-run lifecycle events. No start/stop
  endpoints, no hidden chat run launch, and no raw chat transcript event
  consumption were added.
- Added renderer `stores/easy-run-store.ts` and `easy-run-events.ts` with
  snapshot hydration, duplicate/gap/stream-change handling, resync handling,
  run-change rail reset, and focused reducer/store tests. The pane remains
  visually idle.

Verification performed:

- `./scripts/go.sh run ./cmd/generate-contracts`
- `./scripts/go.sh test ./internal/easyrun ./internal/httpapi ./internal/runtime ./cmd/generate-contracts`
- `pnpm -C desktop exec vitest run
src/main/backend-supervisor.test.ts
src/main/easy-run-event-forwarding.test.ts
src/main/easy-run-event-stream.test.ts
src/renderer/src/stores/easy-run-store.test.ts
src/shared/backend-runtime.test.ts`
- `pnpm -C desktop typecheck`
- `pnpm -C desktop build`
- `node tests/electron/chat-workflows.test.mjs --codex-protocol-only`
- `./scripts/format.sh`
- `./check_quality.sh --all`

E2E/live note: Phase 2a does not start chat runs or touch hidden Codex
orchestrator lifecycle, so the plan does not require live Codex E2E for this
slice. Deterministic production-path Electron workflows were still exercised by
the broad quality gate, and `chat-workflows --codex-protocol-only` was run as a
protocol/runtime regression check after the backend protocol bump. Live Codex
coverage begins in Phase 2b when real hidden runs are introduced.

Remaining work: Phase 2b is next. It should add real start/stop endpoints,
hidden internal conversations, yolo orchestrator turn launch, terminal status
observation, and the first production-path Electron workflow for the working
and complete states while keeping the left rail empty until narrator work.
