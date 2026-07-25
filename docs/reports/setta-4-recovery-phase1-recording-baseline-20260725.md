# Setta 4 Director Recovery - Phase 1 Recording Baseline

Date: 2026-07-25

## Scope

This report closes the four Phase 1 deliverables in
`docs/plans/setta-4-director-command-center-recovery-plan.md`:

- the written baseline of the failure sequence;
- the expected fixed sequence for the same user actions;
- the list of backend events that must appear;
- the list of visible UI states that must appear.

The baseline is taken from `.recordings/20260725T211050Z`, a production desktop
recording (Electron 41.7.0, Chrome 146, renderer viewport 1280x820, backend
protocol version 94) that ran from `21:11:05Z` to roughly `21:13:16Z`.

The lists in sections 3 and 4 are the acceptance surface for Phases 2 through 6.
They are stated as required observations against a re-recording, not as test
names, because the recovery work spans backend projection, decision policy, and
renderer presentation.

### Evidence used

| Artifact | Contents relied on |
| --- | --- |
| `events.jsonl` | 35 `director_event` records, 16 screenshot markers |
| `ipc.jsonl` | 61 IPC round trips, including 15 `director:dispatch-intent` |
| `backend-http.jsonl` | 38 request/response pairs |
| `renderer-console.jsonl` | 17 records: one CSP warning, 16 speech-playback telemetry lines |
| `screenshots/0001..0016` | periodic captures every 10s |

`renderer-console.jsonl` contains no application error. The failure is entirely
a product-behavior failure, not a crash or an exception path.

## 1. Baseline failure sequence

### 1.1 Timeline

| Time (Z) | User action | What the app did | Evidence |
| --- | --- | --- | --- |
| 21:11:05.601 | launch | `GET /director/snapshot` returns `selectedWorkstreamId: null`, `workstreams: []`, `graphs: []`, `workstreamCount: 0`; renderer subscribes from cursor `director:m0` sequence 0 | `ipc.jsonl` `director:read-snapshot`, `director:subscribe-events` |
| 21:11:15.9 | none | NOW rail reads `Setta` / `Idle`; composer target reads `on: Setta Idle`; History reads "No work has been selected."; canvas is ambient dots only | `screenshots/0004-periodic.png` |
| 21:11:15.9 - 21:11:24.6 | voice capture 1 | "I want to start a new conversation in a new folder. Can you help me with th..." | `speech:start/finish-local-macos-voice-capture` |
| 21:11:24.9 -> 21:11:28.9 | submit | 3.94s later: `answer_directly`, `resolution: "model"`, `workstreamId: null`, publicText "I can help you start a new conversation in a new folder." No workstream, no folder request, no resource request. Spoken aloud. | `ipc.jsonl` dispatch result; `renderer-console.jsonl` playback |
| 21:11:33.0 - 21:11:43.9 | voice capture 2 | "Okay, so yeah, the folder is my home directory /document/appdevelopmen..." | `screenshots/0007-periodic.png` |
| 21:11:44.2 -> 21:11:48.4 | submit | 4.15s later: `answer_directly` "Thanks-your folder is /document/appdevelopment/setta." The Director echoes the user's dictated path back as if it were app state. No workspace was open at this point; the first `POST /workspaces/open` is 24s later. | `ipc.jsonl` dispatch result; `backend-http.jsonl` |
| 21:11:52.5 - 21:11:58.2 | voice capture 3 | "Yeah, so can you can you make a new conversation for me, please?" | `screenshots/0011-periodic.png` composer |
| 21:11:58.5 -> 21:12:02.2 | submit | 3.74s later: `answer_directly` "I can't create a new conversation." | `ipc.jsonl` dispatch result |
| 21:12:08.5 | next-workstream control | dispatch `move_selection` returns `selectedWorkstreamId: null` - the control is live with nothing to move between | `ipc.jsonl` |
| 21:12:09.5 -> 21:12:12.4 | Choose folder | `workspace:open-local-folder`, then `POST /workspaces/open` for `workspace_848be839...` at `/Users/kevin/Documents/AppDevelopment/setta`, then dispatch `create_workstream` -> `workstream:conversation_7a01f3f0...`, title "setta", status `idle`, folder-scoped | `ipc.jsonl`, `backend-http.jsonl`, `events.jsonl` |
| 21:12:15.2, 21:12:16.4 | Choose folder x2 | two more `create_workstream` dispatches; three idle workstreams all titled "setta", all bound to the same folder | `ipc.jsonl` |
| 21:12:18.1 - 21:12:26.9 | circle clicks | seven `select_workstream` dispatches | `ipc.jsonl` |
| 21:12:25.9 | none | three workstreams exist and one is selected, yet History still reads "No work has been selected."; canvas still ambient only | `screenshots/0011-periodic.png` |
| 21:12:30.0 - 21:12:33.3 | voice capture 4 | "What folder are we in now?" | `screenshots/0013-periodic.png` |
| 21:12:33.6 -> 21:12:37.8 | submit | 4.22s later: `answer_directly`, publicText "setta". A bare display name, no path, `resolution: "model"` - not read from the workspace record the app had opened 25s earlier. | `ipc.jsonl` dispatch result |

### 1.2 Aggregate backend facts for the session

Director events emitted across the whole 2m10s session:

| Event kind | Count |
| --- | --- |
| `director.workstream.updated` | 22 |
| `director.selection.changed` | 10 |
| `director.aggregates.updated` | 3 |
| `director.graph.updated` | **0** |

Intent dispatch results:

| Dispatch kind | Count | Outcome |
| --- | --- | --- |
| `submit` | 4 | `answer_directly` 4/4, `workstreamId: null` 4/4 |
| `create_workstream` | 3 | selected workstream returned each time |
| `select_workstream` | 7 | selection returned each time |
| `move_selection` | 1 | `selectedWorkstreamId: null` |

Every workstream in the recording reached `status: "idle"` with a real
`resourceScope` of kind `folder` bound to `workspace_848be839...`. Durable
workstream state existed and was pushed. Graph state never did.

### 1.3 Root cause attribution against the plan

Each numbered root cause in the recovery plan maps to a specific fact and a
specific code seam.

**Root cause 1 - Director actionability is incomplete.**
`allowedDecisionKinds` (`internal/director/registry_decisions.go:286`) seeds every
context with `answer_directly` and `create_workstream`, so at 21:11:58 the model
held authority to create the workstream and returned a refusal string instead.
The recovery layer cannot catch this: `DecisionRejectionReason`
(`internal/director/decision_recovery.go:20-51`) enumerates malformed output,
unknown/unauthorized kind, invalid payload, unknown/unauthorized target,
unauthorized fork point, unauthorized failure, unauthorized resource scope, and
stale context. A schema-valid `answer_directly` carrying a refusal is not a
rejection reason, so nothing retries, repairs, or overrides it. The prompt text
at `internal/director/decision_schema.go:220` already tells the model never to
use `answer_directly` as a refusal; the recording shows instruction alone does
not hold, and there is no enforcement behind it.

**Root cause 2 - Workstream registration has no visual anchor.**
Three `create_workstream` dispatches produced 22 `director.workstream.updated`
events and zero `director.graph.updated` events. `SemanticNodeKind`
(`internal/director/semantic_graph.go:13-29`) has no workstream-anchor member;
the catalog starts at `user_goal`. Durable registration therefore has no
semantic representation to project into.

**Root cause 3 - The renderer treats "no graph history" like "no selection".**
The History section keys its empty state off graph-derived node history, not off
selection: `history.length > 0 ? ... : "No work has been selected."`
(`DirectorCommandCenterShell.tsx:775-795`, same string at
`DirectorHistoryOverlay.tsx:97-100`). Because `graphs` is `[]` for a newly
registered workstream, the copy denies a selection the backend had already made
and pushed.

**Root cause 4 - Workspace/folder context is under-presented.**
The NOW rail renders `workstream?.title ?? "Setta"`
(`DirectorCommandCenterShell.tsx:728`) and the composer target line does the same
via `director-workstream-status.ts:44`. With no workstream the surface presents a
target named "Setta" in state "Idle" that does not exist, and once a real
workstream titled "setta" appears the two are indistinguishable. No screenshot in
the recording shows the folder path anywhere in the UI, which is why the folder
question at 21:12:33 had nothing trustworthy to answer from.

**Root cause 5 - Workstream controls are visually ambiguous.**
Screenshots 0011 and 0013 show three identical unlabeled circles for three
workstreams that share the title "setta". Selection is a ring on one circle. The
`move_selection` control at 21:12:08 was active while zero workstreams existed.

## 2. Expected fixed sequence for the same user actions

Same four utterances, same picker clicks, same order.

1. **Launch, no workstream.** The surface states that no work is selected and
   names the next action. It does not present a target named "Setta" in state
   "Idle". If a workspace is open, its identity and path are shown; if not, the
   folderless state is explicit.
2. **"I want to start a new conversation in a new folder."** The Director takes a
   typed action. Because the user asked for a *new* folder, the correct outcome
   is to present folder choice - either `ask_clarification` naming the folder
   options the app supplied, or driving the folder picker. It does not reply with
   a passive statement of willingness.
3. **"the folder is my home directory /document/appdevelopment/..."** The
   Director resolves the named folder against app-supplied workspace options. If
   it resolves, it creates and selects a folder-scoped workstream and emits a
   receipt naming what it created and where. If it does not resolve, it says so
   and offers the picker. It does not echo the user's dictated path back as
   though it were app state.
4. **"can you make a new conversation for me, please?"** This is
   `create_workstream`. The workstream is created, selected, and visible. The
   string "I can't create a new conversation." must not be reachable while
   `create_workstream` is in `allowedDecisionKinds`.
5. **Choose folder x3.** Same three workstreams, but each one becomes a visible
   graph anchor at creation, distinguishable from the others by workspace and
   creation order rather than by position in a row of identical circles.
6. **Circle clicks.** Selection moves the highlight between existing anchors. The
   History and Now rails keep saying a workstream is selected and that it has no
   activity yet; neither claims nothing is selected.
7. **"What folder are we in now?"** Answered from the durable workspace record -
   the folder identity and path the app opened at 21:12:12 - not from model
   recall. A bare display name is not an acceptable answer to a folder question.
8. **A real work request.** A run starts and the graph changes from pushed
   durable events while it runs.

The behavioral contract implied by steps 2 through 4: for a supported app-control
request, the Director's outcome is an action, a folder/target choice, or a
clarification that names real options. Passive acknowledgement and refusal are
both failures.

## 3. Backend events that must appear

Observed against a re-recording of the acceptance scenario. Kind names are from
`internal/director/snapshot.go:120-129`.

### 3.1 Must appear, and did not in the baseline

| Requirement | Trigger |
| --- | --- |
| `director.graph.updated` at least once per workstream creation | every `create_workstream`, before any run exists |
| `director.graph.updated` carrying a workstream-anchor node | first appearance of a workstream |
| `GET /director/snapshot` with non-empty `graphs` when at least one workstream exists | app launch with existing workstreams |
| A dispatch `submit` whose result is not `answer_directly` for an actionable command | utterances 1, 3, and 4 in section 2 |
| A folder/status answer whose content is derived from durable workspace state | utterance 7 |

### 3.2 Must continue to appear

| Requirement | Note |
| --- | --- |
| `director.workstream.updated` on registration and on status change | present in baseline |
| `director.selection.changed` on every selection move | present in baseline |
| `director.aggregates.updated` when counts change | present in baseline |

### 3.3 Must appear once real work runs (Phase 5)

Pushed `director.graph.updated` events, no polling, covering: user goal accepted,
Director decision committed, run started, command/tool activity started and
progressed and completed or failed, file changes proposed or completed,
approvals requested and resolved, subagents started and updated and completed or
failed, artifacts emitted, and run completed or cancelled or failed or recovered.
These map onto the existing `SemanticNodeKind` catalog
(`internal/director/semantic_graph.go:13-29`); Phase 5 must not need new node
kinds beyond the workstream anchor added in Phase 2.

### 3.4 Must not appear

- Any `director.graph.updated` whose nodes are not derived from durable state.
- Any polling loop standing in for a pushed update.

## 4. Visible UI states that must appear

### 4.1 No workstream selected

- NOW rail does not name a fabricated target. No `Setta` / `Idle` pair when
  `selectedWorkstreamId` is null.
- Composer target line states that no workstream is targeted and what the next
  action is.
- "No work has been selected." is correct here, and only here.
- Workspace/folder context is shown if a workspace is open; the folderless state
  is explicit if not.

### 4.2 Workstream selected, no activity yet

- NOW rail names the selected workstream and its status.
- Activity reads "No activity yet" or equivalent - never "No work has been
  selected."
- History reads an empty-history state distinct from an empty-selection state.
- The graph shows the workstream anchor for the selection, plus adjacent idle
  anchors as context.
- Composer target line names the same workstream the NOW rail and graph name.

### 4.3 Workspace/folder context

- Current workspace/folder is prominent in the command surface.
- The full path is available, not only the display name.
- The same workspace identity appears in the picker, the composer target line,
  the Now rail, and the graph label.

### 4.4 Workstream controls

- Controls are labeled or tooltip-backed, not anonymous circles.
- Selected, adjacent, idle, running, blocked, and failed are visually
  distinguishable.
- Two workstreams sharing a title are still distinguishable.

### 4.5 Director surface

- Persistent Director identity, distinct from workstream conversation
  presentation.
- An explicit target line such as `Target: setta`.
- Typed command receipts naming what happened, not chat bubbles.
- Listening, deciding, acting, and done are distinguishable states.
- No internal routing, schema, projection, or provider failure text reaches the
  user.

### 4.6 During a run

- The graph changes visibly while the agent works.
- The selected workstream is the focus; adjacent workstreams remain as context.
- The canvas is a visualization of activity, not ambient background.

## 5. Phase 1 exit criteria

The plan's Phase 1 exit criteria are agreement statements: that the target is
not "the picker exists" but "Director can start work and the graph shows real
state".

Sections 2 through 4 encode that target. The recording is unambiguous on the
point: the picker path worked three times in a row and produced three durable,
correctly folder-scoped workstreams, and the experience still failed, because
zero graph events were pushed and the UI denied the selection the backend had
made. Picker completeness is therefore explicitly rejected as the Phase 1 target.

### Release gate - unavailable external verification

Confirming the fixed sequence requires a new interactive
`./scripts/dev_record_desktop_session.sh` capture on target hardware with a real
display and a signed-in Codex CLI. That capture cannot be produced from the
repository. Phase 6 acceptance against a re-recording is recorded here as a
release gate, and the sign-off named in the Phase 1 exit criteria is an external
agreement, not a repository artifact.
