# Background Terminal Lifecycle Plan

## Goal

Support Codex background terminals that continue running after the assistant has
finished the current turn. The UI should make active background terminals visible,
let the user inspect their live output by opening a background-terminal monitor,
and let the user kill individual processes with a clear UI control.

Do not add `/ps` or `/stop` slash commands in this plan. Viewing and process
control are GUI-only: clicking the compact footer opens the monitor surface, and
that surface handles per-process kill plus any bulk kill action.

This is not a transcript styling tweak. Background terminals have a lifecycle
that is independent from a chat run. They need their own backend-owned state,
events, endpoints, contracts, and renderer surface.

## Non-Goals

- Do not keep representing background terminals as ordinary per-run command
  activity rows after the run ends.
- Do not keep a run active just because a background terminal is still running.
- Do not infer background terminals from command text, process ID shape, title
  text, output text, or keyword heuristics.
- Do not add polling for process state or output.
- Do not add compatibility shims for old run-item shapes.
- Do not preserve old generated contracts, renderer fields, or storage shapes
  only to keep a partially implemented phase working.

## Compatibility Policy

This plan is a clean replacement where needed. Implementation must not include
any backward compatibility, legacy support, migrations, transitional code,
dual-read/write paths, old-field aliases, compatibility fallbacks, or best-effort
old-data parsing.

Development data can be recreated. If old or malformed background-terminal state
is encountered after this work lands, fail loudly and specifically rather than
silently rendering or repairing it.

## Reference Behavior

The Codex TUI treats background terminals as `unified exec` state, not as normal
turn activity:

- `/ps` is described as `list background terminals`.
- `/stop` is described as `stop all background terminals`.
- `unified_exec_processes` is a separate process list on `ChatWidget`.
- A compact footer/status line summarizes active background terminals:

```text
1 background terminal running · /ps to view · /stop to close
```

Setta adopts the lifecycle and footer concept, but not the slash-command
interaction model. In this plan, the footer itself is the click target and opens
the background terminal monitor; process control is done from that monitor.

- Turn completion preserves the background process list.
- Late background process completion after task completion is suppressed from
normal transcript history.
- The process list includes live output chunks.

Useful reference files:

- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/tui/src/bottom_pane/unified_exec_footer.rs`
- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/tui/src/chatwidget/command_lifecycle.rs`
- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/tui/src/chatwidget/exec_state.rs`
- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/tui/src/history_cell/exec.rs`
- `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/tui/src/chatwidget/tests/exec_flow.rs`

## Visual Mockup

Use `docs/mockups/chronological_chat_transcript_mockup.html` as the visual
reference for the chronological transcript, compact background-terminal footer,
and background-terminal monitor treatment. The mockup is a UX reference; typed
Go projections, generated contracts, and backend events remain the implementation
source of truth.

## Current Gap

Setta can show a running command while a run is active, and later assistant text
can stream below that row. That covers:

```text
assistant text
running command row
assistant text
working indicator
```

It does not cover a process that continues after the run is terminal. Today
`finalizeTranscriptBlocksLocked` converts every still-streaming block to the run
outcome. That is correct for normal run-scoped tools but wrong for background
terminals.

The Codex app-server protocol already carries the key discriminator we need:

```ts
CommandExecutionSource =
  "agent" | "userShell" | "unifiedExecStartup" | "unifiedExecInteraction"
```

Setta currently drops that field when projecting Codex `commandExecution` items
into `RunItem`. Without preserving it, the backend cannot distinguish command
source classes without heuristics. Preserving it is necessary but not sufficient:
live Codex also uses `unifiedExecStartup` for short foreground shell commands, so
the backend must not treat source alone as proof of a persistent background
terminal.

## Product Contract

- Normal command executions remain normal chronological transcript activity.
- Background terminal startup is visible in the transcript at its original
  chronological start position once the process proves it outlives the physical
  turn. Until then, `unifiedExecStartup` commands remain normal command activity.
- A background terminal can remain running after the assistant has completed,
  failed, or been interrupted.
- A persistent compact indicator near the composer or transcript tail shows
  active background terminals while any exist.
- The compact indicator does not duplicate an active run's working indicator.
  If both are visible, the background terminal summary is visually secondary.
- Clicking the compact indicator opens a background terminal monitor showing the
  active terminal list and live output.
- The monitor exposes a discoverable per-process `Kill` action. A bulk kill
  action is allowed, but it must not be the only process-control path.
- Background process output is retained as background-terminal output, not only
  as run-item output.
- Background terminal process updates are push-based over the existing event
  stream.
- Renderer display decisions come from Go-owned typed projections. The renderer
  does not inspect raw provider protocol.

## Protocol Mapping

Add a Go-owned command execution source enum:

```go
type RunItemCommandSource string

const (
    RunItemCommandSourceAgent                  RunItemCommandSource = "agent"
    RunItemCommandSourceUserShell              RunItemCommandSource = "user_shell"
    RunItemCommandSourceUnifiedExecStartup     RunItemCommandSource = "unified_exec_startup"
    RunItemCommandSourceUnifiedExecInteraction RunItemCommandSource = "unified_exec_interaction"
)
```

Map Codex app-server values explicitly:

```text
agent                  -> agent
userShell              -> user_shell
unifiedExecStartup     -> unified_exec_startup
unifiedExecInteraction -> unified_exec_interaction
```

Unknown values are provider protocol drift and must fail loudly. Do not fall
back to `agent`.

`RunItem` should keep this source field for command executions and terminal
interactions. Normal transcript activity can still use run items, but background
terminal lifecycle must key off the source field rather than command text or
process ID patterns.

## Domain Model

Introduce a backend-owned background terminal process registry. Suggested shape:

```go
type BackgroundTerminalStatus string

const (
    BackgroundTerminalRunning     BackgroundTerminalStatus = "running"
    BackgroundTerminalTerminating BackgroundTerminalStatus = "terminating"
    BackgroundTerminalExited      BackgroundTerminalStatus = "exited"
    BackgroundTerminalLost        BackgroundTerminalStatus = "lost"
)

type BackgroundTerminalProcess struct {
    SchemaVersion int                      `json:"schemaVersion"`
    ID            string                   `json:"id"`
    WorkspaceID   string                   `json:"workspaceId"`
    ConversationID string                  `json:"conversationId"`
    ThreadID      string                   `json:"threadId"`
    StartedRunID  string                   `json:"startedRunId"`
    ProviderItemID string                  `json:"providerItemId"`
    ProcessID     string                   `json:"processId"`
    Source        RunItemCommandSource     `json:"source"`
    Status        BackgroundTerminalStatus `json:"status"`
    Command       string                   `json:"command"`
    Cwd           string                   `json:"cwd"`
    ExitCode      int                      `json:"exitCode"`
    Error         string                   `json:"error"`
    StartedAt     string                   `json:"startedAt"`
    UpdatedAt     string                   `json:"updatedAt"`
    CompletedAt   string                   `json:"completedAt"`
    RecentOutput  []string                 `json:"recentOutput"`
}
```

Use a stable `ID` generated by Setta. `ProcessID` is the provider process handle
needed for write, resize, and terminate operations. For Codex unified exec
startup, require a non-empty `processId`; if the provider omits it, emit a
specific diagnostic and do not invent a fake interactive process.

Persist output separately:

```go
type BackgroundTerminalOutput struct {
    SchemaVersion int    `json:"schemaVersion"`
    ID            string `json:"id"`
    ProcessID     string `json:"processId"`
    Stream        string `json:"stream"`
    Ordinal       int    `json:"ordinal"`
    Text          string `json:"text"`
    CreatedAt     string `json:"createdAt"`
}
```

Retain recent non-empty output lines on the process projection for compact
summaries. Keep full output paginated by process ID for the monitor surface.

## Storage Model

Store background terminal state under the conversation, separate from run
transcript blocks:

```text
workspaces/<workspace>/conversations/<conversation>/background_terminals/<process-id>.json
workspaces/<workspace>/conversations/<conversation>/background_terminal_output/<process-id>/<ordinal>_<id>.json
```

The exact file names should follow current store conventions, but the important
boundary is that background terminal state is not stored inside a run's
transcript block directory and is not finalized by run terminal state.

On backend startup, any persisted `running` or `terminating` terminal should
become `lost` with a clear reason such as `backend restarted; provider process
handle is no longer attached`. Codex `command/exec` sessions are
connection-scoped, so a backend restart cannot honestly claim the process is
still controllable.

## Transcript Integration

Add a transcript block kind for background terminal lifecycle entries:

```go
TranscriptBlockKindBackgroundTerminal
```

Suggested projection:

```go
type BackgroundTerminalBlockProjection struct {
    ProcessID string `json:"processId"`
    Command   string `json:"command"`
    Cwd       string `json:"cwd"`
    Label     string `json:"label"`
}
```

This block records that the assistant started or interacted with a background
terminal at a specific chronological position. It is not a normal
`activity_item`, and its status is not coerced by run finalization.

Rules:

- `unified_exec_startup` is recorded as normal command activity first. If it is
  still running at a run terminal transition, or a late output/completion arrives
  after a physical turn boundary while the logical run is still active, the
  backend promotes it to a background terminal process and converts the original
  activity block in place to a transcript `background_terminal` start block.
- The start block may show a live status by joining with the background process
  projection in the renderer, but the process registry is the source of truth.
- Empty `terminalInteraction` events represent waiting/polling. During an active
  run they update the live run status line to `Waiting for background terminal`;
  they do not create permanent transcript noise.
- Non-empty `terminalInteraction` events create a slim transcript block such as
  `Interacted with background terminal`, linked to the process.
- Process completion after the run is done updates the process registry and
  compact indicator only. It does not append a late transcript row to a completed
  turn.

## Event Model

Add typed chat events:

```text
chat.background_terminal.created
chat.background_terminal.updated
chat.background_terminal.output_delta
chat.background_terminals.replaced
```

Use incremental events for normal changes:

- process created
- process status changed
- process recent output changed
- one output chunk appended

Use `background_terminals.replaced` only for authoritative snapshots such as
startup recovery, backend reconnection, or resync. Do not republish the full
process list on every output chunk.

Renderer state should keep:

```ts
backgroundTerminalsById
backgroundTerminalIdsByConversationId
backgroundTerminalOutputIdsByProcessId
backgroundTerminalOutputsById
backgroundTerminalOutputPagesByProcessId
```

Raw run item events should not be load-bearing for this UI.

## Endpoints

Add backend endpoints through the `internal/httpapi` endpoint registry:

- `ListBackgroundTerminals`
- `GetBackgroundTerminalOutput`
- `KillBackgroundTerminal`
- `KillAllBackgroundTerminals`

The renderer drives these directly from the background-terminal surface: clicking
the footer opens a monitor that lists terminals, streams live output, and exposes
kill controls. The backend owns the displayable list as a typed projection so the
renderer never parses human-readable text:

```go
type BackgroundTerminalListProjection struct {
    Terminals []BackgroundTerminalProcess `json:"terminals"`
}
```

Do not add slash-command plumbing for this feature in this plan. The product
surface is the footer, monitor, and kill controls.

## Provider Control

The Codex harness needs background terminal operations at the provider boundary:

- Track `commandExecution` items with source `unifiedExecStartup`.
- Record output deltas by `itemId` and by process ID.
- Handle `commandExecution` completion for unified exec even after the current
  turn is complete.
- Handle `terminalInteraction` notifications as process waits or interactions.
- Send provider terminate requests when the user kills a terminal.

If the current Codex harness only processes notifications while a turn sink is
active, refactor it so background terminal notifications are routed through a
thread-scoped or conversation-scoped sink that remains alive for the provider
connection. This is the core architectural change. Late background process
events must not require an active `Run`.

## Renderer UI

Add a compact background-terminal surface near the composer or transcript tail:

```text
1 background terminal running
```

Expected behavior:

- Shows only when at least one terminal is `running` or `terminating`.
- Uses a colored spinner while any terminal is running.
- Is itself the click target: clicking the footer opens a background-terminal
  monitor with commands, statuses, live output, and per-process controls. This is
  the viewing surface for background terminals in this plan.
- The monitor offers per-process `Kill` controls. A `Kill all` control is allowed
  but secondary.
- The footer and monitor render from the same typed
  `BackgroundTerminalListProjection` and update from push events — never a stale
  snapshot.
- The monitor subscribes to `chat.background_terminal.output_delta` and appends
  output live without requiring a manual refresh.
- Does not create layout churn in the transcript when process output arrives.
- Does not duplicate process output in normal assistant text or activity rows.

The transcript `background_terminal` block should be slim, visually closer to a
command/activity row than to a card. The persistent footer/monitor owns process
state; the transcript block records chronology.

### Monitor Host

The monitor can be hosted in either of these forms:

- In-app overlay or panel: opens over the chat or shifts the chat upward while it
  is open.
- Separate Niri window: opens a dedicated window for the same monitor surface.

Both hosts must use the same renderer component, store state, endpoints, and event
stream. The choice of host must not create separate behavior or a second process
state model. If the Niri window path is chosen, it still needs the same live output
updates and per-process kill controls as the in-app overlay.

## Run Finalization Rules

Update transcript finalization so it only finalizes run-scoped streaming blocks.
It must not convert active background terminals to completed merely because the
assistant run completed.

Recommended rule:

```text
run_status finalization applies to user_message, assistant_text, reasoning, and
run-scoped activity_item blocks.

background_terminal blocks are lifecycle markers and are not finalized by run
outcome.
```

If a normal command is still running when a run completes, it may still be
coerced to the run outcome as today. Completed in-turn `unifiedExecStartup`
commands remain normal run-scoped activity. Only promoted `background_terminal`
marker blocks bypass run finalization.

## Lifecycle Scenarios

### Startup Then Final Answer

Provider stream:

```text
assistant: "I'll start the dev server."
commandExecution(source=unifiedExecStartup, processId=proc1, status=inProgress)
assistant: "The server is running in the background."
turn completed
```

Expected UI:

```text
assistant text
background terminal started: npm run dev
assistant text

composer/footer: 1 background terminal running
```

The run is completed. The process remains running.

### Process Completes After Turn

Provider later emits completion for `proc1`.

Expected UI:

```text
composer/footer disappears when no terminals remain
```

No late transcript row is appended to the completed turn.

### Opening The Monitor

User clicks the background-terminal footer.

Expected monitor (rendered from `BackgroundTerminalListProjection` plus live
output events):

```text
Background terminals

  npm run dev                                      running     Kill
    [live stdout/stderr output appends here]

  vite --host 0.0.0.0                             running     Kill
    [live stdout/stderr output appends here]
```

The monitor is a live process surface, not just a recent-output summary. It keeps
appending output while open and uses paged output loading for older chunks.

When no terminals are running the footer is hidden, so there is nothing to open.

### Killing Processes

User clicks a per-process `Kill` control in the monitor. A `Kill all` action may
also exist for bulk cleanup, but individual kill is required.

Expected behavior:

- Backend sends a terminate request for the selected running process.
- Processes move to `terminating` immediately.
- Each process moves to `exited` or `lost` when provider confirmation arrives or
  the provider connection ends.
- UI updates from events.

### Interaction During A Later Turn

A later assistant turn writes stdin to an existing background terminal.

Expected transcript:

```text
assistant text
interacted with background terminal: <command or stdin preview>
assistant text
```

The process remains owned by the background terminal registry.

## Implementation Phases

### Phase 0: Fixture And Contract Tests First

- Extend the fake Codex app-server fixture with:
  - unified exec startup
  - assistant final response while the process remains running
  - listing terminals through the monitor projection after turn completion
  - live output while the monitor is open
  - process completion after turn completion
  - killing one terminal while another keeps running
- Add failing Go tests proving the current bug:
  - a unified exec process is incorrectly finalized with the run
  - `commandExecution.source` is dropped
  - late process completion cannot update UI state after run completion
- Add deterministic E2E expectations for the full user-visible flow.

#### Phase 0 Status (characterization harness complete; 3 fixture items deferred)

Implemented as a characterization harness, matching the team's prior Phase 0
convention (commit `Add chronological transcript Phase 0 characterization
harness`). The bug tests freeze current behavior and pass now, so the required
gates stay green; each is wired to flip in a named later phase rather than
committed red. This covers the contract/bug-proof core of Phase 0; three
full-flow fixture items have no consumer yet and are deferred to the phases that
build their surfaces (see below) — so Phase 0 is not the literal full list.

Done:

- Fixtures: `scriptedBackgroundTerminalTurn` (ScriptedWorkflowHarness, prompt
  `background terminal workflow`) starts two background terminals and leaves both
  running at turn completion; fake Codex app-server mode `unified-exec-background`
  emits two `commandExecution` items with `source: unifiedExecStartup` plus a late
  `item/completed` after `turn/completed`.
- `TestCodexUnifiedExecCommandSourceIsDropped` freezes that `commandExecution.source`
  and `processId` are dropped (a startup projects identically to an agent command).
  Flips in Phase 1.
- `TestServiceFinalizesBackgroundTerminalWithRun` freezes that still-running
  background terminals are coerced to `complete` by run finalization. Flips in
  Phase 4.
- `TestCodexHarnessDropsLateUnifiedExecCompletion` freezes that a process
  completion arriving after `turn/completed` never reaches the turn sink (the sink
  is per-turn/session-scoped). Flips in Phase 2.
- Fixture-chronology freeze tests (`TestBackgroundTerminalFixture*`) pin the
  provider stream; these stay stable across phases.
- Deterministic Electron step `background-terminal` freezes that the terminals
  render as ordinary per-run activity rows and that no
  `background-terminals-footer` exists yet. Flips in Phase 4.

Deferred (still owed, tracked to their consuming phase) — three Phase 0 fixture
bullets cannot be exercised until the surfaces they drive exist, so adding them
now would be unconsumed dead fixture code:

- listing terminals through the monitor projection after turn completion — needs
  `ListBackgroundTerminals` + the `BackgroundTerminalListProjection` (Phase 3),
  rendered by the monitor (Phase 4).
- live output while the monitor is open — needs `GetBackgroundTerminalOutput` +
  `chat.background_terminal.output_delta` (Phase 3) and the monitor (Phase 4).
- killing one terminal while another keeps running — needs
  `KillBackgroundTerminal` (Phase 3) and the per-process kill control (Phase 4).

When those phases land, extend the fixtures (the fake Codex app-server emitting a
two-terminal stream + a kill/terminate round-trip) and add the matching E2E
assertions. The JS fake Codex app-server is intentionally not extended in Phase 0
because the deterministic chat E2E drives the ScriptedWorkflowHarness, not the JS
Codex process; it is extended in the phase that wires a real-Codex
background-terminal E2E path.

### Phase 1: Protocol And Domain Model

- Add `RunItemCommandSource` and parse Codex `commandExecution.source`.
- Also set `Source` on the Phase 0 scripted fixture
  (`scripted_background_terminal.go` `emitBackgroundTerminalStartup`), not just
  the Codex projection. Until the scripted path carries the discriminator,
  `TestServiceFinalizesBackgroundTerminalWithRun` is only "any still-running
  command is coerced to complete"; it becomes background-terminal-specific (and
  its Phase 4 flip becomes meaningful) once the fixture marks the items.
- Add `BackgroundTerminalProcess` and `BackgroundTerminalOutput` contracts.
- Add generated TypeScript types.
- Add store save/load/list/delete/page methods with fail-loud validation.
- Mark running persisted processes as `lost` on backend startup.

#### Phase 1 Status (complete)

Done:

- `RunItemCommandSource` (`agent`, `user_shell`, `unified_exec_startup`,
  `unified_exec_interaction`) added in `types.go` and registered as a contract
  value set. `RunItem` gained `Source *RunItemCommandSource` (nil for items with
  no command source, so the renderer decodes it as `null` instead of coercing a
  default). The Codex projection (`codex_protocol.go`
  `codexRunItemExecutionFieldsFromItem`) now parses `commandExecution.source` and
  `processId`; an unknown source fails loudly via `mapCodexCommandSource` rather
  than falling back to `agent`.
- Review fixes (round 2): `mergeRunItem` now preserves `Source` across upserts
  (`keepCommandSource`), so an update that omits the optional `source` cannot
  silently clear a background terminal's discriminator. The
  `terminalInteraction` notification handler was decoding a non-existent `text`
  field; it now uses the generated `DecodeTerminalInteractionNotification`
  (`itemId`/`processId`/`stdin`/`threadId`/`turnId`), carries `ProcessID` and
  `Source = unified_exec_interaction`, and treats an empty `stdin` as a wait
  no-op. The wait/interact routing (status line vs slim block) remains Phase 2.
  Empty/invalid lifecycle identifiers (`itemId`, `processId`) are rejected
  loudly. Likewise, `codexRunItemCommandSourceFromItem` distinguishes an absent
  `source` (nil, for item types with no command source) from a present-but-empty
  or null one (protocol drift, fails loudly) since `CommandExecutionSource` is an
  enum.
- The Phase 0 scripted fixture (`emitBackgroundTerminalStartup`) marks its
  startups with `RunItemCommandSourceUnifiedExecStartup` plus a provider
  `processId`, so `TestServiceFinalizesBackgroundTerminalWithRun` is now
  background-terminal-specific (still green: finalization still coerces them to
  complete; that flips in Phase 4).
- The Phase 0 bug test flipped: `TestCodexUnifiedExecCommandSourceIsDropped`
  became `TestCodexUnifiedExecCommandSourcePreserved`, and
  `TestCodexUnifiedExecUnknownCommandSourceFailsLoud` covers the fail-loud path.
- Domain model in `background_terminal.go`: `BackgroundTerminalStatus`
  (`running`, `terminating`, `exited`, `lost`), `BackgroundTerminalProcess`,
  `BackgroundTerminalOutput`, `BackgroundTerminalOutputPage`, with validation in
  `validate.go` (terminal status requires `completedAt`; active status forbids
  it). `BackgroundTerminalStatus` is registered as a value set but is not yet
  emitted to TypeScript: the generator only emits types reachable from an
  endpoint or event, which arrive in Phase 3.
- Store CRUD + paging in `store_background_terminals.go`, keyed under the
  conversation (`background_terminals/<process-id>.json` and
  `background_terminal_output/<process-id>/<ordinal>_<id>.json`) where
  `<process-id>` is the stable Setta `ID`. `BackgroundTerminalOutput.ProcessID`
  is that stable join key, not the provider handle.
- Startup recovery (`service_recovery.go` `recoverBackgroundTerminals`, wired in
  `NewService`) marks every persisted `running`/`terminating` terminal `lost`
  with `backgroundTerminalLostOnRestartReason`; `exited`/`lost` are untouched.

Deferred to later phases (unchanged from the plan): provider ingestion routing
(Phase 2), events + HTTP endpoints + IPC and the `BackgroundTerminalStatus` /
`BackgroundTerminalProcess` TypeScript surface they make reachable (Phase 3),
renderer store + footer + monitor + transcript marker block (Phase 4).

### Phase 2: Provider Ingestion

- Refactor Codex notification routing so unified exec lifecycle events can update
  background terminal state outside the active turn sink.
- Preserve `unifiedExecStartup` as a normal command item until it proves it
  outlives the physical turn; then promote it to a process and transcript marker
  block while preserving the original chronology.
- Route output chunks into run-item output before promotion, and into background
  terminal output storage + recent-output summaries after promotion.
- Route process completion into background terminal status updates.
- Route terminal interactions into wait/interact semantics.

#### Phase 2 Status (complete)

Implemented per the "Full / faithful to bullets" scope decision: Phase 2 creates the
process registry records AND the transcript marker blocks and routes output to the
registry, replacing the per-run command activity-row representation. The Phase 0/1
"flips in Phase 4" forecasts for `TestServiceFinalizesBackgroundTerminalWithRun`
and the deterministic `background-terminal` E2E step were superseded: they flip in
Phase 2 because the representation genuinely changes here.

Done:

- `TranscriptBlockKindBackgroundTerminal` + `BackgroundTerminalBlockProjection`
  (`processId`/`command`/`cwd`/`label`) added to the transcript block contract with
  validation and a generated TS decoder. The generator's tagged-union spec
  (`cmd/generate-contracts/contract_registry.go`) was extended with the new branch;
  without it the generated `assertTaggedUnionBranch` mapping omitted
  `backgroundTerminal` and the renderer decoder rejected the block ("found 0
  branches"). `marker.ProcessID` is the stable Setta `BackgroundTerminalProcess.ID`
  (the registry/join key), not the provider handle.
- Startup routing is path-agnostic (scripted + Codex) through the existing
  TurnSink, but `unified_exec_startup` no longer creates the registry record
  immediately. Live Codex sends that source for ordinary short shell commands too,
  so startup items first persist as normal run items/activity blocks. Promotion
  happens only when the item is still `running` at run completion/cancel/failure,
  or when late output/completion arrives after a physical turn boundary while the
  logical run is still active. Promotion creates the
  `BackgroundTerminalProcess`, converts the original activity block in place to a
  `background_terminal` marker (preserving chronology), and copies buffered
  run-item output into the background terminal output store + recent-output
  summary. Completed in-turn `unified_exec_startup` commands remain ordinary
  completed command activity and create no registry process. `unified_exec_interaction`
  still creates a slim "Interacted with background terminal" marker linked to the
  process by provider handle. Marker blocks are `complete`, so run finalization
  never rewrites them.
- Late lifecycle (the core architectural change) uses connection-scoped handlers
  registered on the shared `codexapp.Manager` (the codexaccount precedent), in
  `codex_harness_background_terminal.go`: `turn/completed`, `item/completed`, and
  command-exec output-delta. A per-thread turn-active flag is set in `StartTurn` and
  cleared by the connection-scoped `turn/completed` handler; because the flag
  transition and the late-event handlers all run on the single manager dispatch
  goroutine in provider order, a completion emitted right after `turn/completed` is
  deterministically observed as late (flag already cleared) rather than racing turn
  teardown. Late output/completion route to a conversation-scoped
  `BackgroundTerminalSink` the chat service implements and attaches to the harness
  via `SetBackgroundTerminalSink` (optional interface, Codex-only). Registry updates
  are idempotent (already-terminal completion is a no-op; unknown process ignored).
- `TestCodexHarnessDropsLateUnifiedExecCompletion` flipped to
  `TestCodexHarnessRoutesLateUnifiedExecCompletion` (the late completion now reaches
  the connection-scoped sink). `TestServiceFinalizesBackgroundTerminalWithRun`
  became `TestServiceBackgroundTerminalsSurviveRunCompletion` (marker blocks +
  registry processes survive run completion still running, output in the registry).
  New `TestServiceBackgroundTerminalLateLifecycle` covers the connection-sink
  service methods. Post-Phase-4 live characterization added
  `TestServiceUnifiedExecStartupCompletedInTurnStaysActivity`, freezing the
  recording-derived bug: a `unifiedExecStartup` command that completes in the same
  turn stays a completed activity row and creates no background-terminal process
  or marker. The deterministic `background-terminal` E2E step asserts the marker
  blocks render, the run activity projection is empty for promoted terminals, and
  the footer is still absent.

Deferred to later phases (per the plan): the `chat.background_terminal.*` events +
list/output/kill HTTP endpoints + IPC (Phase 3); the footer, monitor, kill controls,
and polished marker rendering (Phase 4). The empty-`terminalInteraction` wait is a
no-op (no permanent transcript noise); the live "Waiting for background terminal"
status-line text is a Phase 4 renderer concern. Gates: `check_quality --git-changes`
EXIT 0; full chat Go suite + affected packages green; deterministic
`background-terminal` E2E step passes (the pre-existing `chat-activity-projection`
reasoning-summary-expand flake blocks the earlier steps in this sandbox); live
`live-codex-electron` E2E passes.

Review-round fixes:

- Multi-turn same-thread (High): a background terminal started in an earlier turn
  can emit output/completion while a LATER turn is active on the same Codex thread;
  the notification carries the earlier turn's id, which Codex still delivers to the
  active session, where strict turn-scope matching would fail the active turn.
  `routeCrossTurnBackgroundNotification` (a session-path intercept in
  `applyCodexSessionEventForWait`, run BEFORE the turn-rebind step) routes such a
  cross-turn event to the background terminal registry and skips the run path, so
  the active turn continues. It must precede rebind: if a cross-turn notification is
  the FIRST scoped event of the active turn, the rebind window is still open and its
  earlier turn id would otherwise rebind the active turn and then fail the real one.
  Cross-turn completions are identified by `source==unifiedExecStartup`; cross-turn
  output (which carries no source) is identified by a connection-scoped item-ID set
  populated by a new `item/started` connection handler. Same-turn lifecycle
  (matching turn id) still flows through the normal run path. Regressions:
  `TestCodexHarnessRoutesCrossTurnUnifiedExecCompletion` and, for the
  first-scoped-notification ordering, `TestCodexHarnessInterceptsCrossTurnCompletionBeforeRebind`
  — both proven non-vacuous (they fail with `codex_notification_scope_drift` / a
  rebind to the earlier turn id without the fix). Clean under `-race`.
- Turn-active flag leak (Medium): `StartTurn` now also `defer`s
  `endBackgroundTerminalTurn`, so a turn that errors before any `turn/completed`
  cannot leave the thread's flag stuck true and suppress its later background-terminal
  events. The connection-scoped `turn/completed` clear is KEPT (it is required for
  deterministic late routing — a defer alone would let the dispatch goroutine race
  ahead and re-drop the late event); the defer is only the error-path safety net,
  and it preserves the thread's conversation context (asserted by
  `TestCodexHarnessBackgroundTurnEndClearsFlagKeepsContext`).
- Goal-operation detour (complete): the temporary `/goal` continuation bypass was
  replaced by the logical goal operation lifecycle plan
  (`docs/plans/codex_goal_operation_lifecycle_plan.md`, commits
  `71368baef` through `27e941ff5`). The old simplified
  `codexGoalContinuation` path is gone from executable code; `/goal set` and
  `/goal resume` now run through `HarnessGoalOperation` / `codexGoalOperation`.
  Background-terminal routing on goal-owned Codex threads is owned by that
  operation before normal turn-id rebind. The operation delegates
  background-terminal output/completion to the registry with original provider ids
  and without logical turn-id rewrite; ordinary run-stream events are still
  coalesced into the logical goal run. Connection-scoped late-routing now checks
  `hasRoutableGoalOperation` and defers to the goal owner instead of independently
  routing through `turnActiveByThread`. Both paths share
  `classifyBackgroundTerminalNotification`, so goal-owned and standalone
  cross-turn routing cannot drift on what counts as background-terminal lifecycle.
  Regressions landed in the goal-operation detour include
  `TestCodexHarnessGoalOperationRoutesBackgroundTerminalDuringIdleGap`,
  `TestCodexHarnessGoalOperationRoutesBackgroundTerminalDuringPhysicalTurnB`,
  `TestCodexHarnessGoalOperationDelegatesBackgroundTerminalBeforeLogicalRewrite`,
  `TestCodexHarnessBackgroundTerminalClassificationSharedByGoalAndStandaloneRouters`,
  and the renamed
  `TestCodexHarnessGoalOperationEnablesBackgroundTerminalLateRouting`.

#### Resume Point After Goal Operation Detour

Background-terminal implementation resumes at Phase 3. The remaining work is the
event/API surface and renderer monitor; it should build on the existing registry,
marker block, output storage, connection-scoped late routing, and goal-operation
route ownership. Do not reintroduce the old `/goal` start-as-set-plus-normal-wait
path, do not add compatibility shims, and do not make the renderer depend on raw
run-item events.

From this point forward, every backend or E2E test added for list/output/kill or
renderer state should cover the two route owners explicitly where relevant:

- a normal Codex/chat turn, where `turnActiveByThread` owns during-turn vs late
  routing; and
- a logical goal operation, where `codexGoalOperation` owns the thread route and
  background-terminal lifecycle delegates through that operation exactly once.

### Phase 3: Events And HTTP API

- Add background terminal event contracts.
- Add list/output/kill endpoints through the endpoint registry.
- Kill endpoints fail loudly when provider termination is unavailable rather than
  reporting a process stopped.
- Wire main/preload/shared IPC from generated contracts.
- Ensure output deltas do not republish the full terminal list.
- Emit events from the existing background-terminal registry/output store updates;
  do not derive UI state from `chat.run_item.created/updated`.
- List/output endpoints must return typed projections that work for terminals
  started by normal turns and by logical goal operations.
- Kill endpoints must address the provider through the retained Codex connection
  route when available. If no live controllable provider route exists, fail
  specifically; do not mark the process stopped optimistically.

### Phase 4: Renderer Store And UI

- Add background terminal state to the chat store.
- Apply background terminal events.
- Add the compact footer/status surface; clicking it opens the monitor.
- Add the monitor surface (terminal list + live output), available while a run is
  active and after it completes.
- Host the monitor as an in-app overlay/panel or a dedicated Niri window, using
  the same component and store state either way.
- Add required per-process `Kill` controls and optional `Kill all`.
- Render transcript `background_terminal` blocks.
- Keep the renderer ignorant of raw Codex protocol and raw run-item source
  semantics.
- Extend deterministic E2E coverage for a terminal started during a logical goal
  operation, with output in both the idle gap between physical goal turns and while
  a later physical goal turn is active.

### Phase 5: Verification And Cleanup

- Remove any temporary raw run-item display paths that were only needed during
  implementation.
- Verify no background terminal UI depends on `chat.run_item.created/updated`.
- Verify no compatibility aliases or migration paths were added.
- Verify old run finalization still applies to normal commands.
- Verify background terminals survive turn completion and interrupt.
- Verify background terminals survive logical goal-operation completion,
  cancellation, and cross-physical-turn output/completion without duplicate
  registry events.
- Verify backend restart marks running terminals as `lost`.

## Verification

Required focused checks:

- Go tests for Codex protocol parsing, background terminal store, startup
  recovery, event emission, list/kill endpoints, and run finalization.
- Renderer tests for store events, compact footer, the monitor surface, and
  transcript marker blocks.
- Deterministic Electron workflow covering startup, final assistant response,
  opening the monitor, live output, process completion after turn, and killing one
  terminal while another continues running.
- Live Codex E2E when ChatGPT auth is available.

Required final gates before commit:

```text
./scripts/format.sh
./check_quality.sh --git-changes
node desktop/tests/electron/chat-workflows.test.mjs --deterministic-only --keep-artifacts
node desktop/tests/electron/chat-live-auth.mjs
node desktop/tests/electron/chat-workflows.test.mjs --live-only --keep-artifacts
```

Skip the live workflow only when ChatGPT auth is unavailable, and report that
skip explicitly.

## Open Risks

- The provider connection and goal-operation routing risks that blocked the first
  version of this plan are now resolved by Phase 2 plus the completed
  `codex_goal_operation_lifecycle_plan.md` detour. The remaining risk is
  regression: future phases must not bypass the existing connection-scoped router,
  the goal-owned route owner, or the shared background-terminal classifier when
  adding events, endpoints, kill controls, or renderer state.
- The current transcript block model assumes most visible blocks belong to a
  run. Background terminal markers belong chronologically to a run but their
  lifecycle belongs to the process registry. The implementation must keep that
  boundary explicit.
- Killing requires a real provider terminate operation. If the provider cannot
  terminate a process, the UI must fail specifically instead of pretending the
  process stopped.
