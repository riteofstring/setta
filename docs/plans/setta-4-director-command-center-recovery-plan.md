# Setta 4 Director Command Center - Recovery Plan

## Purpose

This plan closes the gap between the Setta 4 command-center implementation and the actual product
vision: a Director-led command layer with a live visualization of real workstream and agent activity.

The existing Setta 4 plan correctly names the target experience, but the current app still fails the
core workflow shown in the latest recording. This document is the corrective plan for that failure.
It is not a cosmetic polish list.

This is the current Setta 4 plan of record. It supersedes the completion status and immediate next
actions in `setta-4-director-command-center-plan.md`; that document remains the implementation
foundation and historical verification record.

Reference recording:

- `.recordings/20260725T211050Z`

Product vision source:

- [`docs/mockups/fullscreen_conversation_concept.html`](../mockups/fullscreen_conversation_concept.html)

The mockup is not a mood board. It spells out the product vision. Recovery work must make the
production app deliver that vision: a fullscreen command center where the Director is the distinct
command layer, workstreams are visible graph entities, and live agent activity is the primary visual
subject. The implementation may replace mockup-only demo data with real typed Setta state, but it
should not reinterpret the mockup as a generic chat UI, a passive ambient canvas, or a pane
replacement.

## Current Failure

The latest recording shows the app has not reached the intended experience.

- The user asks the Director to start a new conversation in a folder.
- The Director answers conversationally instead of acting.
- The Director even says "I can't create a new conversation" despite the app having the capability.
- The folder picker can create workstreams, but created workstreams are empty and visually inert.
- The graph emits no `director.graph.updated` events during the recording.
- The central canvas is mostly ambient background, not a visualization of activity.
- The UI says "No work has been selected" even after the backend selected a workstream.
- The anonymous circles at the top are not legible as workstreams or useful controls.
- The current folder/workspace is not prominent enough.
- The Director command layer is not visually or behaviorally distinct enough from regular
  conversations.

Backend evidence from the recording:

- Natural-language "start a new conversation" requests returned `answer_directly`.
- Picker actions returned successful `create_workstream` receipts with selected workstream ids.
- Selection events were pushed for those workstreams.
- No graph update events were pushed.

The problem is therefore not one missing button. The product is missing the end-to-end connection
between Director command intent, durable workstream state, and visible graph activity.

## Product Decision

The Director is not a regular conversation.

The Director is the app-global command layer. It accepts user intent, chooses or asks for the
necessary target, and causes typed Setta actions. Workstreams are the regular conversations/work
contexts. The graph is the visual representation of those workstreams and the real activity inside
them.

The user should experience:

- one distinct Director command surface
- visible workstream/conversation nodes
- visible selected workspace/folder context
- action receipts when the Director does something
- live graph movement and node updates from real durable events

The Director may speak or show short command receipts, but it must not feel like another ordinary
thread in the same conversation list.

## Hard Lines

- Do not add fake agent nodes.
- Do not use decorative graph activity as a substitute for durable Setta state.
- Do not restore panes or pane-era concepts.
- Do not preserve backward compatibility. Setta is unreleased; change contracts, data shapes, and
  implementations directly to the target design. Do not add migrations, compatibility shims,
  transitional adapters, dual-read/write paths, old-field aliases, silent compatibility fallbacks, or
  support for superseded behavior.
- Do not rely on polling for "live" updates.
- Do not let the Director answer "I can't do that" when a supported typed action exists.
- Do not make the user understand internal routing, projection, or model failures.
- Do not make empty selected workstreams look like no workstream is selected.

## Target Experience

### Starting work

When the user says one of these:

- "Start a new conversation in this folder."
- "Create a new workstream for setta."
- "Open a new conversation in a new folder."
- "Make a new conversation for me."

Setta should do one of the following:

- create and select a workstream in the current folder when the current folder is unambiguous
- open or present the folder picker when the user asked for a new folder
- ask a useful clarification when multiple meaningful folder choices exist

It should not answer with a passive conversational statement.

### Director vs workstreams

The Director surface should read as a command console:

- persistent "Director" identity
- explicit current target line such as `Target: setta`
- typed command receipts, not normal chat bubbles
- clear states for listening, deciding, acting, and done
- no implication that the Director itself is a workstream conversation

Workstreams should read as the work:

- graph nodes and edges
- selected workstream label
- workspace/folder badge
- status and history tied to real events
- activity and artifact nodes when work runs

### Visualization

The graph must show real Setta state from the beginning of a workstream's life.

An idle workstream should still be visible because the workstream registration is durable state. That
is not a fake task node. It is a real workstream anchor.

Agent activity should appear when real trajectory/provider events exist:

- user goal accepted
- Director decision committed
- run started
- command/tool activity started, progressed, completed, or failed
- file changes proposed or completed
- approvals requested or resolved
- subagents started, updated, completed, or failed
- artifacts emitted
- run completed, cancelled, failed, or recovered

The mockup's visual vocabulary should remain the target, but the rendered entities must map to real
typed state.

## Root Causes To Fix

### 1. Director actionability is incomplete

The structured decision layer currently authorizes `answer_directly` and `create_workstream` in
every context. With no existing work candidate, it does not authorize `ask_clarification`, and its
deterministic product rule only resolves a single existing-workstream candidate. An actionable
folder-choice request can therefore become a passive answer or a folderless creation, with no typed
outcome that presents the native picker. The natural-language decision catalog also does not yet
cover the direct command-center actions for cancellation, approval resolution, and resource
resolution.

Needed changes:

- Make supported app actions first-class Director outcomes, not suggestions.
- Treat workstream creation, workstream selection, folder targeting, queueing, steering,
  cancellation, approval resolution, and resource resolution as actions the Director can take.
- Tighten `answer_directly` authority so it is not valid for supported app-control requests.
- Add recovery for invalid/passive decisions so the app retries, repairs, or applies a product rule.
- Add a typed folder-choice/picker presentation outcome. Do not accept model-invented paths or use
  keyword heuristics to infer one.
- Make useful clarification possible when authorized workspace choices, rather than existing
  workstream candidates, are what change the outcome.
- Add command receipts that tell the user what action happened.

The product invariant is: if Setta can do the thing through a typed action, the Director must not
pretend it cannot.

### 2. Workstream registration has no visual anchor

The backend already derives a `workstream_registered` fact from each durable conversation record,
but the source catalog classifies it as metadata-only. Projection is intentionally lazy until the
first graph fact so a child conversation's parentage, committed after its conversation record, is
available before delegation is derived. A cold snapshot already includes empty graph envelopes for
selected and adjacent unprojected workstreams; registration still produces no node and pushes no
graph update, so empty workstreams disappear into the ambient background.

Needed changes:

- Add a real semantic workstream-anchor representation sourced from durable workstream registration.
- Replace the registration fact's metadata-only mapping with anchor projection after durable
  parentage is available; do not weaken child/fork ordering or delegation provenance.
- Ensure selected and adjacent idle workstreams carry an anchor node in snapshots and pushed graph
  updates, rather than merely an empty graph envelope.
- Preserve the bounded level-of-detail contract: adjacent projection retains the anchor, while
  background workstreams remain aggregate-only context and receive no graph content.
- Keep anchor nodes visually distinct from action/task nodes.
- Keep anchors out of current-activity, history, and last-milestone fallbacks.
- Make the anchor the stable graph root for later `followed_by` activity, and
  preserve the existing cross-workstream `delegated_to` resolution when a child
  anchor becomes the child's first node.
- Connect child/forked workstreams with real durable parentage edges.
- Make selection a view state/highlight, not fake graph truth.

### 3. The renderer treats "no graph history" like "no selection"

The recording shows selected workstreams, but the UI says "No work has been selected."
During the live session the renderer retained the empty graph list from launch because registration
pushed no graph update. A cold snapshot after registration would instead contain empty selected and
adjacent graph envelopes. Both states produce empty graph-derived history, and the renderer
currently mistakes that for absent selection.

Needed changes:

- Separate `selectedWorkstream == null` from `selectedWorkstream has no activity yet`.
- Show "No activity yet" or equivalent for selected idle workstreams.
- Keep Now, History, graph, and composer target text consistent.

### 4. Workspace/folder context is under-presented

The user should always know where the next command will act.
The renderer already receives trusted folder state through the selected workstream's
`resourceScope` and the workspace session used by the workspace-start panel, including the root
path. That state is not carried consistently into Now, History, the graph, and the composer. The
model-facing decision context deliberately receives only authorized workspace ids and display
names, not filesystem paths, so a full-path status answer must be constructed or grounded by
trusted product code rather than model recall.

Needed changes:

- Show current workspace/folder prominently in the command surface.
- Show full path or path disclosure where useful, not only the display name.
- Make folderless state explicit.
- Use the same workspace identity in the picker, composer target line, Now rail, and graph label.
- When no folder is available, make the next action obvious.

### 5. Workstream controls are visually ambiguous

The three circles at the top are not self-explanatory.

Needed changes:

- Replace anonymous dots with labeled or tooltip-backed workstream controls.
- Make selected, adjacent, idle, running, blocked, and failed states legible.
- Avoid controls that look like decorative mockup artifacts.

## Status

| Phase | Status |
| --- | --- |
| 1 - Rebaseline Against The Recording | Complete |
| 2 - Make Workstream Anchors Real Graph State | Not started |
| 3 - Make The Director Action-Capable | Not started |
| 4 - Separate Director UI From Workstream UI | Not started |
| 5 - Visualize Real Agent Activity | Not started |
| 6 - Recording-Based Acceptance Pass | Not started, blocked on a new interactive recording |

## Proposed Implementation Sequence

### Phase 1 - Rebaseline Against The Recording

Status: complete. Delivered by
[`docs/reports/setta-4-recovery-phase1-recording-baseline-20260725.md`](../reports/setta-4-recovery-phase1-recording-baseline-20260725.md).

Use `.recordings/20260725T211050Z` as the failing baseline.

Deliverables:

- short written baseline of the failure sequence
- expected fixed sequence for the same user actions
- list of backend events that must appear
- list of visible UI states that must appear

Exit criteria:

- the team agrees the target is not "the picker exists"
- the target is "Director can start work and the graph shows real state"

The baseline report rejects picker completeness as the target on the recording's
own evidence: three `create_workstream` dispatches produced three durable,
correctly folder-scoped workstreams, and the experience still failed, because
zero `director.graph.updated` events were pushed and the renderer denied the
selection the backend had already made. The sign-off named in the exit criteria
is an external agreement and is recorded as a release gate in that report, along
with the new interactive recording Phase 6 needs.

Root-cause seams the report pins for the phases that follow:

- `allowedDecisionKinds` in `internal/director/registry_decisions.go` always
  authorizes `answer_directly` alongside `create_workstream`, authorizes
  clarification only when existing-work candidates exist, and
  `ProductInvariantDecision` never resolves creation. `DecisionRejectionReason`
  has no member for a schema-valid passive or refusing answer, so nothing
  recovers from one (Phase 3).
- The model-facing workspace option intentionally contains only id and display
  name, while `AskClarificationDecision` contains only free text. Phase 3 needs a
  typed authorized workspace-choice/picker path; it must not expose raw paths to
  the model or add keyword matching.
- `SemanticNodeKind` has no workstream-anchor member, and
  `DirectorFactWorkstreamRegistered` is explicitly metadata-only in
  `source_mapping.go`. `ensureProjected` is lazy to preserve child parentage
  committed after the conversation record, so Phase 2 must add anchors without
  regressing branch/delegation ordering.
- `snapshotGraphs` already returns empty graph envelopes for selected and
  adjacent idle workstreams. Phase 2's acceptance condition is an actual anchor
  node and pushed graph delta, not merely a non-empty `graphs` array. Adjacent
  LOD currently prunes non-waiting, non-milestone nodes, while background LOD
  deliberately carries aggregate status and no graph.
- Adding a node kind also affects generated TypeScript, exhaustive renderer
  catalogs and labels, source identity/mapping, graph fixtures/packing, and
  milestone/activity classification. Those surfaces must change together in
  Phase 2, with generated outputs regenerated rather than edited.
- `DirectorCommandCenterShell.tsx:775-795` and `DirectorHistoryOverlay.tsx:97-100`
  key "No work has been selected." off graph-derived history length rather than
  selection (Phase 4).
- `DirectorCommandCenterShell.tsx:728` and `director-workstream-status.ts:44`
  fall back to a fabricated `Setta` target when nothing is selected. The shell
  already owns a workspace session and selected workstreams already carry a
  trusted folder `rootPath`; Phase 4 must present that existing state
  consistently rather than invent another backend contract.

### Phase 2 - Make Workstream Anchors Real Graph State

Extend the semantic graph projection so durable workstream registration creates visible graph state.

Deliverables:

- semantic representation for a workstream anchor
- projection from durable workstream registration to anchor state after
  parentage is durable
- graph snapshots whose selected/adjacent idle entries contain anchor nodes
- pushed graph updates when a workstream first appears
- adjacent LOD that retains anchors, with background workstreams still
  aggregate-only
- renderer styling for idle, selected, and adjacent anchors, plus legible
  aggregate-only background controls
- stable `followed_by` and cross-workstream `delegated_to` edges rooted in the
  new anchor
- exhaustive semantic-kind/generated-contract updates and activity, history,
  and milestone classifications that do not present registration as work

Exit criteria:

- creating a workstream immediately makes a visible graph element
- idle workstreams no longer look like empty space
- no fake task/agent nodes are introduced

### Phase 3 - Make The Director Action-Capable

Tighten the Director decision protocol so supported commands become typed actions.

Deliverables:

- explicit action path for "create/start a conversation/workstream"
- action path for "use current folder"
- typed presentation path for "choose/open a new folder"
- authorized workspace-choice clarification that also works when no workstream
  exists
- action path for "what folder are we in?"
- natural-language paths for cancellation, approval resolution, and resource
  resolution through the existing typed command-center actions
- typed authority and recovery when the model returns a passive answer for an
  actionable command, without keyword heuristics
- command receipts for successful actions

Exit criteria:

- the recording's "make a new conversation" request does not return "I can't create a new
  conversation"
- the Director either creates the workstream, opens/presents folder choice, or asks a useful
  clarification
- status/folder questions answer from trusted app state; the model need not receive a raw path

### Phase 4 - Separate Director UI From Workstream UI

Make the Director visibly and behaviorally distinct from regular workstream conversations.

Deliverables:

- Director command surface with app-global identity
- target line showing current folder/workstream context
- command receipts instead of chat-like thread presentation
- distinct visual treatment for Director decisions versus worker activity
- corrected empty states for selected idle workstreams

Exit criteria:

- a user can tell what is Director control and what is workstream conversation
- the selected target is obvious before sending a command
- "No work selected" appears only when no workstream is selected

### Phase 5 - Visualize Real Agent Activity

Complete the activity path from provider/conversation events to graph nodes.

Deliverables:

- real-time graph updates for run lifecycle
- visible nodes for user goal, Director decision, run, tool activity, file changes, approvals,
  subagents, artifacts, failures, and completion
- label/detail behavior matching the mockup's spirit
- selected workstream focus with adjacent graph context and aggregate-only
  background context
- no polling

Exit criteria:

- while an agent is working, the graph visibly changes from pushed durable events
- the graph is not just ambient background
- the mockup's activity-focused vision is recognizable in the production app

### Phase 6 - Recording-Based Acceptance Pass

Re-run the workflow from the failing recording and compare it to the intended behavior.

Required acceptance scenario:

1. Launch the app with no selected workstream.
2. Ask the Director to start a new conversation in a folder.
3. Choose or confirm the `setta` folder.
4. Observe a selected workstream anchor in the graph.
5. Ask what folder is active.
6. Observe a trusted answer with the actual folder context.
7. Submit a real work request.
8. Observe live graph nodes as the agent runs.

Exit criteria:

- Director acts instead of dodging.
- Current folder is obvious.
- Workstream is visibly selected.
- Idle workstream has a real anchor.
- Agent activity appears as graph updates.
- Director and workstream conversations are visually distinct.

## Completion Definition

This recovery plan is complete when:

- the Director is clearly an app-global command layer, not a regular conversation
- supported user commands result in typed Setta actions
- workstream creation appears immediately in the graph without fake task nodes
- real agent activity is visible as live graph updates
- selected-but-empty workstreams have truthful empty states
- current folder/workspace context is obvious
- the anonymous top controls are replaced or made legible
- the latest-recording workflow succeeds end to end
- the production app visibly delivers the mockup's core idea: a live command center for underlying
  Codex/workstream activity

## Non-Goals

- Restoring panes.
- Showing fake demo nodes in production.
- Showing raw provider packets or hidden chain-of-thought.
- Making web/native content a primary requirement.
- Treating ambient canvas motion as the graph visualization.
