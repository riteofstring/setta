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
turns, assistant replies, tool calls, and tool receipts are durable in the
app-scoped committed log, and the first turn of each app run starts a fresh
provider thread with the `setta` namespace attached and that history replayed
into it. `director_thread` records which provider thread is carrying the
conversation now.

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

Status: complete.

Deliverables:

- project Director user turns, assistant turns, Setta tool calls, and tool
  receipts into semantic graph state
- project workstream registration as a real anchor node
- project workstream run/activity/provider events from existing trajectory
  records (already true before this phase)
- push graph updates when Director or workstream state changes
- keep fixture/demo data out of production graph state

Exit criteria:

- the graph appears after the first real Director/workstream action
- a newly created idle workstream is visible as a real anchor
- active Codex/tool activity appears without reload or polling

#### Resolved: a workstream is a node, and it exists from the moment it does

Registration projects a `workstream` anchor node instead of being metadata the
graph ignores. It is the only node kind whose status never resolves: the
workstream's own work is what succeeds or fails, and the registry row already
reports whether it is running, blocked, or retired. Every later fact in the
workstream chains from the anchor, so a created workstream is on the canvas, and
is drawn as itself, before anything has been asked of it.

The registry projects it when it admits the workstream rather than when the
workstream produces its first graph fact, so the anchor and its pushed delta
arrive with the conversation record. The committed `conversation.updated` event
owns the anchor's provenance, and a later rename advances that same anchor
without rewinding the workstream's causal chain. Parentage is therefore
published ahead of the conversation record it describes: a reader that admits
work as soon as it exists must know where that work came from before it draws
it. A create decision draws its `delegated_to` edge onto the child's anchor,
which is what the decision delegated to, rather than onto whichever fact the
child happens to produce first.

#### Resolved: the Director is drawn in a lane of its own

The Director's request, tool calls, receipts, and reply happen in no workstream.
Attaching them to one would have meant inventing a workstream for a conversation
that has no folder, no run, and no work of its own — the fake production node the
plan forbids. The Director conversation therefore projects into an app-scoped
graph scope, `director`, that is a first-class lane on the canvas and not a
registry row: a row carries a folder, a status, a queue, approvals, and
artifacts, and the Director has none of them.

The lane also gives the decision that starts a root workstream a home. That
decision is made before the workstream it creates exists, so it used to project
nothing at all; it now draws where the Director was, beside the request that
asked for it. It earns no `delegated_to` edge, because a root workstream answers
to nobody and claiming delegation would invent a parentage the registry does not
hold.

The durable conversation moved into the app-scoped committed log for this. One
log is one order, and one order is what makes a replay of the Director's dialogue
and the work it started reproduce the same graph. The separate
`director_conversation_entries` table is gone.

#### Resolved: what a Director turn is worth on the canvas

A request is drawn as the user's goal and stays active until the turn ends —
resolved by the reply, or by the next request when a turn acted without replying.
A tool call is drawn when it is made rather than after it returns, labelled by
the tool, because the arguments are provider text; its receipt resolves it and
replaces the label with Setta's own account, so a refused call is a failed node
carrying the specific reason rather than work that appears to have happened.

The reply is the one model-authored label on the canvas, so it carries the
provider thread that authored it and the evidence class that keeps it visually
separable from a fact the app observed. The durable reply records which model
said it for exactly that reason.

#### Resolved: the reply is conversation, not a decision

`answer_directly` is gone. The Director's words were durable twice — as a
conversation entry the next turn is re-established from, and as a decision fact
whose only content was the same sentence. The conversation entry is the one that
has to exist, so it is now also what the graph draws and what the spoken reply is
read out of. The decision catalog is the app actions the Director can take, and
answering is not one of them.

#### Resolved: the canvas no longer imports its own demo data

The frame's coalescing rule lived in the burst-fixture module, so the production
canvas reached demo batches to find the rule it runs every frame. The rule moved
to `packed-graph-coalescing`; the fixtures import it, and nothing in production
imports the fixtures.

### Phase 4 - Mockup-Faithful Command Center UI

Status: implemented; awaiting the side-by-side recording. The command center
names who the user is talking to, shows the folder the focused work runs in,
labels the workstream dots, keeps the composer live as the app's front door, and
holds one canvas with rails beside it at every window size. The star field is
carried by the graph's ambient field, which holds the frame loop awake with no
input. What remains is this phase's own evidence: the side-by-side recording
against the mockup needs a desktop capture that is not available here, so it is a
release gate rather than implementation work.

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

#### Resolved: the app says who is being spoken to

With nothing selected, the top bar read "Setta — Idle", the composer read
"on: Setta", and the Now rail was headed "Setta": a title and a status for a
workstream that does not exist, on the screen the user meets first. The Director
is what is being spoken to in that state, so it is what the command center names
— with a teal role marker, and the same accent the composer dot already pulses.

The role treatment is a label, a dot, and an accent inside the same top bar,
rail, and composer a workstream uses. The Director never becomes a workstream
row for the same reason its graph lane is not one: it has no folder, no run, and
no status of its own. It therefore has no dot in the strip and no place in the
selection order — selection moves between workstreams, and the Director is who
that selection is described to.

#### Resolved: a workstream's folder is part of what it is

Work runs somewhere, and until now the only way to see where was to open a
resource request in the artifacts rail. The focused workstream's folder is drawn
beside its title in the top bar and beside its status in the Now rail, named by
the folder itself and carrying its absolute path on hover. A folderless
workstream says "No folder" rather than nothing, because being folderless is a
real state the Director can create on request, not missing information.

The folder name is derived in the renderer from the workstream's own bound root
path, not looked up in the workspace session. A workstream carries its binding
whether or not that workspace is currently open, so a lookup could only add a
way to render nothing for work that plainly has a folder.

#### Resolved: the front door never closes

The composer used to disable itself for the whole of a Director turn. That threw
the caret out to the document, and the arrow keys the user thought they were
typing with silently became workstream selection instead. A submitted request is
a turn of a conversation that already orders its own turns, so a request sent
while the Director is answering is simply the next turn; the renderer was holding
back work the backend was ready to accept in order.

Typing anywhere on the command center now lands in the composer. Only a plain
printable character redirects — a modifier carries an app shortcut, a space
activates the control that has focus, and an editable target is already taking
the text. The composer is deliberately not focused on open: the arrow keys have
to keep meaning "move between workstreams" until the user is actually typing, and
the first keystroke is what says they are.

The one busy flag behind all of this is split, because its two halves wait
differently. A Director turn runs for as long as the model takes and is now
reported on the composer's own hint line: the dot pulses and the status slot
names the Director rather than the workstream, which the top bar and the Now rail
still carry. A direct command is a single durable write, and it is what disables
the approval and resource controls it belongs to. Conflated, a slow Director turn
locked the artifacts rail's approvals for the length of an answer.

The workstream's `active` flag went with the old pulse. It described whether the
work was live, and the composer's dot is the Director's.

Dots became meaningful the same way: each names the workstream it selects, what
that workstream is doing, and the folder it does it in, both as its accessible
name and as its tooltip.

#### Resolved: a narrow window is still one canvas

The shell had three rail breakpoints. Under 940px the rails became full-width
bars stacked down the screen, each with its own opaque background, and together
with the composer they covered the graph — the pane workspace this plan removed,
rebuilt out of rails. Under 760px they became floating cards again, so the
stacked layout only ever existed in the band between the two, which is the width
a small desktop window actually opens at.

There is now one breakpoint, and it is the width the disclosure state machine
already watched. Above it the rails flank the canvas and give inline size back as
the window narrows, so narrowing changes their width and never their shape.
Below it a rail is a card the top-bar disclosure opens over the graph, one at a
time; the card takes its own pointer events, because a surface a finger can drag
must not pan the canvas behind it.

The rails' bottom inset was also counting the composer twice. The composer is a
row of the stage rather than something floating over it, so a rail already ends
where the composer begins, and the inset was the mockup's rail padding plus the
composer's whole height again — it stopped rail content about a composer above
where the mockup ends it.

#### Resolved: the front door keeps one order

Keeping the composer enabled exposed a renderer assumption the disabled state
had hidden: two quick submissions could enter the provider concurrently even
though they are turns in one Director conversation. Submissions now join a
runtime-scoped FIFO before they cross the preload boundary. Direct durable
commands stay independent, and changing runtimes retires the old queue so late
work cannot enter the new Director conversation.

A failed turn also no longer replaces text entered while it was in flight. The
failed request is restored ahead of the newer draft, and the public message says
that the turn did not finish instead of claiming the backend never accepted it.

The shell now keeps the same focus identity everywhere when the selected
workstream disappears: the top bar, Now rail, composer, dot strip, and heading
hierarchy all return to the Director without selecting the first remaining
workstream in the renderer. History empty states describe history rather than
selection, modal history suppresses background shortcuts, and arrow navigation
never takes over an editable field, even with modifiers.

At the minimum supported compact width, the top bar explicitly gives its
remaining column to workstream navigation after the brand leaves, hides
secondary metadata, and keeps navigation separate from the view controls. The
compact state is derived before first paint, so rails do not briefly render in
their wide layout.

#### Phase 4 audit verification

After the coherent static review and corrections were stable, the applicable
broad deterministic gate ran once:

```sh
./scripts/test_topic_conversation_workflows.sh --deterministic-only --keep-artifacts
```

It passed the production typecheck and Electron/Vite build; the Director,
conversation, HTTP API, and runtime Go packages; all 72 desktop test files and
570 tests; and the Director command-center, local Director voice, and microphone
permission Electron workflows. The production-path artifacts are:

- `.recordings/director-command-center/20260726T034250514Z/`
- `.recordings/director-command-center-local-voice/20260726T034305461Z/`
- `.recordings/microphone-permissions/20260726T034317113Z/`

The already-green Phase 3 live-provider matrix postdates every backend and
provider-protocol change in the current plan. Phase 4 changes only the renderer,
styles, and deterministic Electron harness, so that external gate was not
duplicated. The unavailable side-by-side desktop recording remains the release
gate stated above and was not retried as repository verification.

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

#### Resolved: every workstream the Director creates answers to nobody

The child and fork origins are gone, and nothing was given a product entry point
to keep them. `CreateWorkstreamDecision` now carries the resource scope directly
instead of an origin union whose two other arms no Setta tool could reach, so a
created workstream chooses its folder and has no parent to inherit one from.
`WorkstreamStartRequest` lost its origin, and `DirectorWorkstreamStart` lost the
parent conversation and fork turn it passed to the conversation service.

The fork points went with them. Trusted context offered every completed run of
every workstream as a fork origin, and a `create_workstream` call could not name
one, so the registry was folding, bounding, and validating a list the Director
was never able to act on.

The delegation projection follows, because it was the graph half of the same
feature. A create decision no longer waits for the workstream it authorized to
appear so it can draw an edge into it: the decision is committed in the Director
lane, and the workstream anchor already says the work exists. The one delegation
left is the provider's — a run to the subagent it handed work to — which never
leaves the workstream that ran it. So a semantic edge is now a relationship
inside one workstream: `SemanticEdge` carries a single `workstreamId`, both
endpoints resolve in that workstream's graph, and the parent/child edge authority
that existed only to license the crossing is gone. Snapshot windowing and delta
validation drop their cross-workstream carve-outs with it.

Durable parentage stays. It is written by the conversation router's own fork
decisions, which is a different feature with its own entry point, and the
registry still folds a branch record ahead of the conversation it describes. What
went is the branch kind only the Director wrote: a `child` branch was durable
parentage with no carried history, created by nothing else, and `director` as a
branch decision source went with it.

#### Resolved: a Director fact nothing commits is not a fact

Three Director fact kinds survived only because the fixtures still wrote them.
Production committed none of them, and each had already been replaced.

`workstream_registered` was the clearest: the registry rejected it on arrival
with an error explaining that the anchor is derived from the conversation record
instead, so the projector held two ways to mint a workstream and the app could
reach exactly one. The rejection went with the fact, because a guard against a
value the type system no longer has is a guard against nothing.

`interpretation_published` was the Director's conclusion drawn as a node, which
is what the Director's reply now is. Phase 3 already made the durable
conversation entry the single record the graph, the provider replay, and the
spoken reply are read from; the second way to say the same thing outlived it.
Its `interpretation` node identity went too, and so did the confidence value on
`InterpretationMetadata` — a reply carries the model that authored it, not a
number no code path could ever set. The renderer stopped offering to print a
percentage that could not exist.

`validation_recorded` was the Director half of validating a structured
declaration before it took effect, and the schema-constrained declaration it
checked was removed in Phase 1. A refused tool call is already drawn as a failed
node carrying Setta's own reason. The provider's own validation is a different
fact, in the trajectory, and it still projects the `validation` node and the
`validated_by` edge.

The fixtures now register a workstream through the same `conversation.updated`
projection production folds, so a fixture addresses work by an id the app would
actually mint, and they gained the lane they were missing: a Director turn that
calls a Setta tool, commits the create decision before the workstream exists,
receives its receipt, and answers the user. That fixture is where the
interpretation evidence class comes from now, which is the point — the coverage
comes from the path the product runs. The gallery generator therefore emits the
Director lane the way the snapshot fetches it, by name, and only when the
Director actually said something.

#### Verify in the phase audit

- the decision-router deliverable above: what is left of `decision_*` is the
  durable fact catalog, the trusted authority context, and the executor, which
  Phase 1 recorded as the surface the tool layer uses directly — confirm no
  router remnant survives beyond that
- stale docs that describe the wrong Director model
- the Director command-center Electron workflow now asserts that a workstream
  anchor cites no Director fact at all, which is the surviving half of an
  assertion written against `workstream_registered`

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
- Answered in Phase 3: a Director reply is not a decision. `answer_directly` is
  removed, and the durable conversation entry is the single record the graph, the
  provider replay, and the spoken reply all read.

None of these questions changes the product model: the Director is a persistent
Codex conversation with Setta meta-tools, and the UI should match the mockup.
