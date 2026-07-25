# Setta 4 Director Codex Conversation Plan

**Date:** 2026-07-25
**Status:** Active plan of record.

## Executive Summary

The Director should be one persistent Codex conversation with special Setta
meta-tools. The user talks to it naturally. Codex answers naturally when the
right response is conversation, and calls Setta tools when the right response is
controlling the app.

The visual target remains
[`docs/mockups/fullscreen_conversation_concept.html`](../mockups/fullscreen_conversation_concept.html).
That mockup is the product vision, not a mood board. When this plan is
implemented, the app should look and feel basically like the mockup. Meaningful
deviations are bugs unless they are explicitly approved.

## Core Product Model

The Director is a chat-first command center:

- It is a normal long-running Codex thread.
- It has durable conversation history.
- It can answer, explain, ask follow-up questions, and reason conversationally.
- It has a `setta` tool namespace for app-control actions.
- App-control actions happen through tool calls, not prose.
- Tool calls commit durable Setta facts and emit live events.
- The graph shows real Director, tool, workstream, and agent activity.

The Director is not a fresh tool-less classifier turn. It is not merely a
router/controller. It is a conversational Codex agent with authority to use
Setta-owned tools.

## Non-Negotiables

- No backward compatibility, migrations, compatibility shims, transitional
  adapters, old aliases, dual paths, legacy readers/writers, silent fallbacks,
  or preservation of superseded behavior.
- No pane concept. Easy-button panes, browser panes, pane identity, and pane
  presentation contracts stay gone.
- No fake production nodes. Production visualization only renders real durable
  state, provider activity, tool activity, and UI state derived from them.
- No polling for live app state. Use Codex app-server notifications, Setta
  durable-log wakes, backend push streams, IPC subscriptions, and renderer
  animation frames.
- No "Director cannot do that" for actions Setta has tools for. If Setta can do
  the action, the Director should call the tool, ask a useful clarification, or
  report a specific product failure.
- The current workspace/folder context must be visible.
- The Director must be visually distinct from ordinary workstream conversations
  only through subtle role treatment inside the same command-center UI. Do not
  build a separate Director screen, separate chatbot panel, or fundamentally
  different Director layout.

## Unreleased Product Implementation Rule

Setta is unreleased. Implement this plan as a direct replacement, not as a
transition.

When the Director moves to the persistent Codex-thread-plus-tools model:

- change current contracts and data shapes in place
- regenerate affected generated surfaces from the Go-owned contracts
- delete superseded Director decision-router/runtime code as soon as the new
  tool-thread path owns the behavior
- delete obsolete renderer assumptions instead of preserving aliases
- do not write data migrations for old Director records
- do not keep dual execution paths so old and new Director models can both run
- do not add compatibility fallbacks that hide missing new behavior by routing
  through the old decision model

If existing local development data is incompatible with the new Director model,
it may be discarded or recreated. Do not spend implementation effort preserving
it.

## Codex Integration Decision

Use Codex app-server as the Director harness.

Setta already has the required low-level pieces:

- `internal/agent/dynamic_tools.go` defines dynamic tool schemas and handlers.
- `internal/agent/thread_runtime.go` passes `ThreadStartParams.DynamicTools`.
- `internal/agent/provider_events.go` handles Codex dynamic tool call requests.
- `internal/codexapp/protocol_gen.go` includes `DynamicToolCall`,
  `DynamicToolSpec`, and thread lifecycle contracts.

The implementation should use dynamic tools first because they are already
inside Setta's Codex harness. If Codex dynamic tools cannot be made durable
across Director resume in the app-server protocol, use a Setta-owned MCP server
as the next choice. A standalone Setta CLI is acceptable only as a tool backend
behind MCP or dynamic tools, not as the primary Director architecture.

## Runtime Architecture

Replace the current Director decision runtime with a persistent Director thread.

Current mismatch to remove:

- `internal/runtime/director_decision_caller.go` explicitly creates one fresh,
  read-only, tool-less provider thread per decision.
- The `decision_*` path treats the model primarily as a schema-constrained
  decision producer.
- The failed recording showed that this architecture can answer instead of
  acting because the Director is not operating as a real tool-using Codex
  conversation.

Target runtime:

1. Setta owns one durable Director conversation record for the app profile.
2. On startup or first use, Setta starts or resumes the Director Codex thread.
3. The Director thread receives stable developer instructions that describe
   Setta, the mockup goal, and the `setta` tool namespace.
4. User text and voice turns go into that same Director thread.
5. Each Director turn can produce normal assistant text and zero or more Setta
   tool calls.
6. Setta handles tool calls through typed Go handlers.
7. Tool handlers commit durable Setta facts, update the workstream registry,
   and return typed receipts to Codex.
8. Provider notifications and durable Setta events drive the graph and UI by
   push.

The Director thread is distinct from workstream threads. Workstream threads are
the Codex conversations that do user work in a workspace. The Director thread
coordinates them.

## Initial Setta Tool Catalog

Implement the first tool namespace as `setta`. Tool schemas are Go-owned and
generated into TypeScript where the renderer needs them.

Required tools:

- `setta.list_workspaces`: return authorized local workspaces/folders the
  Director can target.
- `setta.create_workstream`: create a new workstream in a chosen workspace or
  as a folderless draft when that is explicitly requested.
- `setta.select_workstream`: make a workstream the visible selected workstream.
- `setta.list_workstreams`: summarize active, queued, blocked, completed, and
  recently touched workstreams.
- `setta.submit_work`: start work in a workstream or create-and-start when the
  request includes enough workspace context.
- `setta.steer_work`: send additional user instructions to an active
  workstream, or queue them when the run is busy.
- `setta.cancel_run`: cancel the active run for a workstream.
- `setta.resolve_approval`: answer a pending approval with the structured
  choice the provider requested.
- `setta.resolve_resource_request`: attach a workspace/folder or other missing
  resource to blocked work.
- `setta.read_activity`: return the current app/workstream activity snapshot so
  the Director can answer "what is happening?" from real state.
- `setta.rename_workstream`: rename a workstream when the user asks.
- `setta.archive_workstream`: remove completed or unwanted work from the active
  navigation surface.

Tool outputs must be receipts, not private implementation dumps. They should
include the action taken, affected IDs, selected workspace/workstream, and any
next user-visible state.

## Tool-Use Behavior

Setta should not narrow the Director into a small decision menu. Codex should
decide how to respond in a normal conversation. The app-control boundary is the
tool layer:

- If the user asks for conversation, explanation, status, or planning, Codex can
  answer normally.
- If the user asks Setta to create, select, start, steer, cancel, approve,
  attach, rename, archive, or inspect app state, Codex should use the relevant
  Setta tool.
- If the request is ambiguous, Codex should ask a useful clarification or call a
  tool that returns authorized choices.
- The Director must not invent local paths. Workspace choice comes from
  `setta.list_workspaces` or an app-rendered picker backed by authorized IDs.

Recovery should stay inside the Director conversation. If a Director turn tries
to answer an app-control request without using an available Setta tool, Setta
should feed the issue back into the same Director thread and ask it to either
call the appropriate tool or ask a useful clarification. Do not revive the old
fresh-thread decision router as the primary control plane.

Setta never treats prose as proof that app state changed. State changes require
a committed tool call.

## Live Visualization Model

The graph is live because real events are pushed through the system:

1. Codex app-server emits thread, turn, item, dynamic-tool, MCP, reasoning,
   output, approval, and lifecycle notifications.
2. Setta maps those provider notifications into typed conversation trajectory
   events and Director facts.
3. The durable conversation store wakes subscribers when commits land.
4. The Director registry folds the durable log into app/workstream state.
5. The graph projector emits semantic graph updates.
6. The backend pushes snapshot and graph deltas to the desktop.
7. The renderer updates graph buffers from those deltas.
8. The star field and graph animation run continuously with
   `requestAnimationFrame`, independent of clicks or backend event cadence.

No production graph node is synthetic filler. Empty workstreams still need a
visible anchor because durable workstream registration is real state. Director
turns, Setta tool calls, tool receipts, created workstreams, selected
workstreams, runs, approvals, artifacts, file changes, cancellations, failures,
and completions are all real graph sources.

## Mockup Fidelity Requirements

The active UI must match the spirit and structure of the mockup:

- fullscreen command-center canvas
- continuously moving star field/background
- graph-like conversation/workstream activity visualization
- Director composer at the bottom
- compact top navigation for workstreams/conversations
- visible current workspace/folder context
- left/right activity and artifact rails
- Director conversation subtly distinguished from ordinary workstream
  conversations while sharing the same space background, live graph, command
  center layout, and composer pattern
- no pane grid, pane cards, browser-pane chrome, or easy-button pane UI

"Distinct Director UI" means minor styling differences such as role labeling,
accent treatment, avatar/icon, tool-call badges, or graph node treatment inside
the same mockup-faithful command center. It does not mean a different app
surface.

The confusing "three circles at the top" problem should be fixed by making the
top control communicate real workstream selection and state. Dots are fine when
they are meaningful and labeled by interaction affordances; unexplained chrome
is not.

Web/native content display is not a goal of this plan. If future product work
needs it, it should be designed as a new command-center surface, not by
resurrecting panes.

## Implementation Phases

### Phase 0 - Reset The Plan Surface

Status: complete in this change set.

Deliverables:

- delete the incorrect recovery plan
- keep the old Setta 4 plan as historical context only
- make this document the active plan of record
- remove or revert uncommitted implementation leftovers from the killed loop

### Phase 1 - Persistent Director Codex Thread

Status: complete.

Deliverables:

- add a durable Director conversation/thread binding
- start or resume one Director Codex thread for the app profile
- send Director text and voice turns to that same thread
- persist Director user turns, assistant output, tool calls, and tool receipts
  separately from ordinary workstream conversations
- attach the `setta` dynamic tool namespace at thread start
- confirm tool availability after app restart; if app-server cannot preserve or
  reattach dynamic tools, implement Setta MCP tools for the Director
- remove the fresh, tool-less Director decision caller as the active path; do
  not keep it as a compatibility fallback

Exit criteria:

- "create a new conversation" in the Director conversation causes a Setta tool
  call, a durable workstream, and visible selection
- the Director can also answer normal conversational questions without losing
  the long-running thread

#### Resolved: dynamic tools do not survive a resumed thread

Codex app-server accepts `dynamicTools` only on `thread/start`.
`ThreadResumeParams` has no such field, and `resume_thread_with_history` passes
an empty dynamic-tool set into the spawned session
(`codex-rs/core/src/thread_manager.rs`). A Director thread resumed after a
restart would therefore come back able to talk and unable to act.

Setta owns the Director conversation instead of the provider. Director user
turns, assistant replies, tool calls, and tool receipts are durable in
`director_conversation_entries`, and the first turn of each app run starts a
fresh provider thread with the `setta` namespace attached and that history
replayed into it. `director_thread` records which provider thread is carrying
the conversation now.

This keeps a single path, so MCP is not needed for the Director. It should be
revisited only if Codex adds dynamic tools to thread resume, or if the Director
needs provider-side state that history replay cannot reproduce.

### Phase 2 - Setta Meta-Tools

Status: complete.

Phase 1 shipped the tools its own exit criteria need: `list_workspaces`,
`list_workstreams`, `create_workstream`, `select_workstream`, `submit_work`,
`steer_work`, and `recover_run`. This phase completes the catalog.

Deliverables:

- implement the rest of the required `setta` tool catalog: `cancel_run`,
  `resolve_approval`, `resolve_resource_request`, `read_activity`,
  `rename_workstream`, and `archive_workstream`
- validate every tool input against authorized Setta state
- commit every successful tool call as a durable fact/event
- return concise tool receipts that Codex can explain to the user
- remove superseded direct decision outcomes and action-specific router code in
  the same phase; do not preserve old decision kinds as aliases

Exit criteria:

- create/select/start/steer/cancel/approve/resource-resolution flows work
  through Director tool calls
- ambiguous workspace requests produce authorized choices instead of invented
  paths or passive refusal

#### Resolved: which tool calls commit a Director decision

Only the actions with no durable record of their own do. Creating, selecting,
sending, steering, and recovering commit `DirectorDecisionCommitted`, because
that fact is what the graph explains the work with. Stopping a run, retitling a
workstream, retiring one, answering an approval, and attaching a folder do not:
the conversation already commits the interruption, the changed record, and the
approval resolution, so a second Director account of the same event could only
disagree with it. Every call is durable either way — the Director conversation
keeps the tool call and the receipt it was given — so the decision catalog did
not grow with this phase.

#### Resolved: what the Director is not allowed to answer

An approval whose answer is a secret is refused, specifically, and the Director
is told to ask the user to answer it in the app. The answer is a credential that
reaches the provider which asked for it and never becomes durable, so a model
authoring one would be inventing the user's secret rather than relaying it.

Archiving is refused while anything is still outstanding on a workstream — a run
in flight, queued work, an unanswered approval, or an open resource request —
and the refusal names what is outstanding. The check is the record rule an
archived workstream is validated against, so the registry can never be asked to
fold an archived record it would then reject.

Attaching a folder binds the folder and nothing else. The work that could not
start was never accepted, so the receipt says to send it again rather than
implying the app resumed something on its own.

### Phase 3 - Real Graph Projection

Deliverables:

- project Director user turns, assistant turns, Setta tool calls, and tool
  receipts into semantic graph state
- project workstream registration as a real anchor node
- project workstream run/activity/provider events from existing trajectory
  records
- push graph updates when Director or workstream state changes
- keep fixture/demo data out of production graph state

Exit criteria:

- the graph appears after the first real Director/workstream action
- a newly created idle workstream is visible as a real anchor
- active Codex/tool activity appears without reload or polling

### Phase 4 - Mockup-Faithful Command Center UI

Deliverables:

- make the production shell visually line up with the mockup
- keep the star field moving without user interaction
- make the Director subtly distinct from workstreams without leaving the same
  space-background/live-graph command center
- make current workspace/folder context obvious
- replace confusing chrome with meaningful workstream navigation
- ensure the bottom Director composer behaves like the primary app entry point
- tune responsive layouts without reintroducing panes

Exit criteria:

- side-by-side recording against the mockup shows the same command-center
  structure, motion, and hierarchy
- common actions are visible in the graph and rails
- no production screen suggests the old pane workspace

### Phase 5 - Cleanup

Deliverables:

- delete obsolete Director decision-router code once the tool-thread path owns
  the product behavior
- delete the child and fork workstream origins unless Phase 3 or Phase 4 gives
  them a product entry point: no Setta tool creates one, so the origins, the
  fork points in trusted context, and the delegation projection derived from
  them are currently unreachable
- delete superseded generated contracts and renderer assumptions
- delete stale docs that describe the wrong Director model
- regenerate Go-owned TypeScript contracts after owner-contract changes
- keep no compatibility adapters, migrations, aliases, dual paths, silent
  fallbacks, or transitional code

Exit criteria:

- there is one Director runtime model in the codebase
- there is one active plan of record
- old pane and old decision-router concepts are not reachable product paths
- no code path exists only to preserve behavior from the superseded Director
  implementation

### Phase 6 - Verification When Requested

Per `AGENTS.md`, automated tests run only when the branch is ready to merge and
the user explicitly asks for verification.

When verification is requested, include deterministic production-path Electron
workflows for:

- Director thread persistence across restart
- Director tool call creates/selects a workspace-scoped workstream
- Director normal chat response without tool use
- create/start/steer/cancel/approve/resource-resolution tool flows
- pushed graph updates without polling
- moving star field without clicks
- current workspace context visibility
- no pane UI reachable from the command center

Live Codex verification should run only when local ChatGPT auth is available,
and it must not use `OPENAI_API_KEY`.

## Acceptance Recording

The acceptance recording should start from a clean app data directory and show:

1. Open Setta into the command center, not a pane workspace.
2. Type "Create a new conversation in <workspace name>."
3. The Director calls a Setta tool.
4. A workspace-scoped workstream appears and becomes selected.
5. The graph shows the Director turn, tool call, tool receipt, and workstream
   anchor.
6. Type a normal question to the Director.
7. The Director answers conversationally in the same long-running conversation.
8. Start real work in the selected workstream.
9. Codex activity appears live in the graph and Now rail.
10. Restart the app and confirm the Director conversation, workstream selection,
    and graph state resume.

## Open Implementation Questions

These are implementation questions, not product questions:

- Answered in Phase 1: Codex app-server does not preserve dynamic tools across a
  resumed thread. Setta owns the Director conversation durably and re-establishes
  the provider thread from it, so MCP is not required.
- Answered in Phase 1: the Director receives only Setta meta-tools. Its provider
  thread runs read-only with approvals off, because it coordinates workstreams
  and the work itself runs in workstream threads with their own permissions.
- Answered in Phase 1: the schema-constrained routing protocol is gone —
  decision router, generated output schema, output decoding, recovery ladder,
  and the fresh structured caller. What remains of `decision_*` is the durable
  fact catalog, the trusted authority context, and the executor, all of which
  the tool layer uses directly.
- Open: should a Director reply stay a durable `answer_directly` decision fact
  once Phase 3 projects Director turns into the graph from the conversation
  entries themselves? Two records of the same reply should not survive Phase 3.

None of these questions changes the product model: the Director is a persistent
Codex conversation with Setta meta-tools, and the UI should match the mockup.
