# Easy Button Presentation, Artifact, and Global Voice Recovery Plan

**Date:** 2026-07-15

**Status:** Implemented and verified. Phase 0 is verified; Phases 1, 2, 3, 4,
and 5 have implementation evidence. Ready for final audit.

**Scope:** Easy Button presentation, typed artifacts, narrator projection and playback,
global-master voice input, keyboard shortcuts, and production-path verification

**Latest Review:** Workstream 1 is complete: conversation snapshots and artifact-created events
now publish metadata-only artifact records, typed payloads are read through `ReadArtifact`, the
Easy Button rail loads only visible cards with immutable-ID caching, the deterministic recovery
workflow verifies the required artifact-policy matrix, and a ChatGPT-authenticated live Codex
workflow produced and read back a typed table artifact over a small supplied dataset.

**Next Step:** Final audit.

## Why This Plan Exists

The latest desktop recording at `.recordings/20260716T044251Z` exposed a set of related
regressions. The application currently treats durable conversation state, transient narrator
updates, spoken playback, global speech status, and Easy Button layout as though they were one
presentation stream. That produces too many highlights, stale speech, unstable focus text,
mis-scoped voice UI, lost request context, and nested scrolling.

The missing table artifact is also a confirmed regression, not a capability that never existed:

- Commit `9f05b071e` added `setta.emit_artifact`, strict markdown/table/bar-chart/file payloads,
  persistence, production-path tests, and typed artifact renderers.
- Commit `34467051e` removed that implementation with the obsolete Easy Run stack during the
  topic-conversation cutover.
- The replacement conversation domain retained artifact kind names such as `table` and
  `bar_chart`, but it did not retain the typed payloads or the agent tool. The current renderer
  consequently treats every artifact as a generic URI/file reference.

The fix is to port the proven capability into the current conversation aggregate. Do not restore
`internal/easyrun`, add a compatibility adapter, or build a second artifact domain.

## Clean-Break Rule

This implementation has no backward compatibility, legacy support, migrations, transitional
adapters, dual reads or writes, old-field aliases, compatibility fallbacks, or feature flags
between the current and target behavior.

Replace superseded contracts, storage, endpoints, prompts, and renderer paths outright. Use a new
owner-defined store schema/namespace where persistence shapes change; leave old data untouched and
unread rather than importing it. Delete the replaced code in the same implementation sequence once
the new production path is verified. A missing new capability fails loudly instead of falling back
to the current generic behavior.

## Prompt Design Rule

Production system/developer prompts for the master, router, narrator, and topic agent must describe
stable product roles, typed inputs, output schemas, and general decision principles only. They must
not mention, special-case, or include examples derived from the recorded line-count request—or any
other individual acceptance scenario.

The role-specific rules are:

- the master reasons about global intent and typed routing candidates, independent of work domain
- the router returns only its typed route decision from authoritative conversation/app context
- the narrator distinguishes stable topic/objective, sparse phase change, requested status, and
  terminal summary without using task-specific vocabulary
- the topic agent chooses artifacts from the shape of the deliverable—narrative, tabular,
  quantitative comparison, or file—not from hardcoded task names or keywords

The line-count request belongs in recording evidence only. It is too expensive for routine test
execution and must not appear in production prompts. Prompt reviews must verify that no recording
language leaked into production instructions. Generalization is proved with small, bounded,
unrelated acceptance tasks, not by adding examples to prompts.

## Evidence From The Recording

- The voice request was: “figure out how many lines of code are in this repo and then also break
  it down by language.” No `conversation.artifact.created` event was produced.
- The narrator created activity-completion updates and periodic updates, sometimes two for the
  same source range. Roughly three dozen items reached synthesis during the run.
- The speech queue reached five pending items. Milestones started 20–50 seconds after creation,
  and stale milestones resumed after the terminal answer had already played.
- The accepted request appeared only in the compact speech indicator beside the footer mic. The
  conversation projection does not otherwise render authored user input.
- Ask Setta rendered the app-global speech status, so narration from the background topic appeared
  to belong to the master interaction.
- The NOW rail renders the full milestone collection inside an `overflow-y: auto` region. The
  center terminal summary and error each have their own independent vertical overflow rules.
- `currentFocus` is returned and committed by every working or terminal narrator projection, so
  routine activity projections can rewrite it even when the user’s objective did not change.

The recording samples screenshots every ten seconds, so it does not reconstruct every wheel
gesture. The event logs and source are sufficient to establish the queueing, ownership, and
overflow problems.

## Product Semantics

These concepts must be distinct in both contracts and UI:

| Concept | Meaning | Allowed update cadence |
| --- | --- | --- |
| Live topic transcript | Provisional words for the initial request or a follow-up, shown in the Current Focus location | While topic-directed capture is active |
| Authored topic input | The user’s exact accepted initial request or follow-up, shown while its route/focus effect is pending | On acceptance; removed when routing/narration resolves it |
| Current focus | The stable, general topic/objective of the conversation | First narrator focus, then only input or steering that materially changes that topic/objective |
| Milestone | A sparse, meaningful phase transition | Occasionally during work |
| Status reply | A direct answer to “what is happening?” | Only when requested |
| Final summary | A short terminal conclusion | Once per terminal turn |
| Artifact | A durable, self-sufficient deliverable | Whenever the agent produces a deliverable |
| Speech status | State belonging to one capture or playback source | Only in that source’s presentation surface |

`currentFocus` is not a second milestone channel. Tool completion, plan bookkeeping, subagent
activity, artifact emission, and elapsed time must not rewrite it.

## Non-Negotiable Outcomes

1. Structured deliverables produce real typed artifacts across task domains.
2. The narrator is quiet by default and never accumulates an archival speech backlog.
3. The visibly active highlight is the highlight currently being spoken, not merely the newest
   stored event.
4. Initial and follow-up live transcription use the Current Focus location at readable size. After
   acceptance, the exact words remain there only until routing/narration resolves them.
5. Current focus remains stable while implementation mechanics change underneath it.
6. Global-master voice can be started directly by mouse or keyboard without first opening Ask
   Setta.
7. Ask Setta never presents unrelated topic narration as master capture state.
8. The NOW rail does not scroll. Older highlights fade away and leave the rendered window.
9. Passive content below the Easy Button mic has no nested scroll regions in the normal layout.

## Workstream 1: Restore Typed Artifacts In Topic Conversations

### Restore the agent capability

Add a generic dynamic-tool execution seam to `internal/agent`, then define the product tool at the
owning `internal/conversation` boundary:

```text
setta.emit_artifact
  markdown(markdown)
  table(columns, rows)
  bar_chart(items)
  file(path, description?)
```

The provider bridge owns dynamic-tool specification, request scoping, call completion, and failure
responses. The conversation service owns artifact validation, persistence, events, and access
control. Do not make `internal/agent` understand table or chart payloads.

Install the tool on topic-agent threads and include task-agnostic developer instructions:

- durable user-facing deliverables are emitted through `setta.emit_artifact`
- naturally tabular deliverables use the table branch
- quantitative comparisons use the bar-chart branch when magnitude is important
- final prose summarizes the outcome but is not a substitute for the artifact

These are structural output rules, not examples of tasks. This is an agent-visible semantic
contract, not a renderer keyword classifier. The service must not guess artifact suitability from
words in the user request or final answer.

Re-establish strict branch validation and bounded payloads. The previous safe limits are the
starting point: 20 artifacts per turn, 16 KiB markdown, 12 table columns, 100 table rows, and 24
bar-chart items. Unknown fields, mixed payload branches, row-width mismatches, non-finite chart
values, and calls outside the owning conversation/turn fail specifically.

### Restore typed persistence and transport

Replace the current reference-only `Artifact` shape outright with a Go-owned, strictly tagged
artifact union containing common identity plus exactly one typed payload branch. Typed content
lives in the conversation-owned artifact store and is read through endpoints registered in
`internal/httpapi`; payloads must not be hidden in `metadata` strings.

Use a clean artifact/conversation store schema namespace for this contract. Do not migrate or read
current reference-only artifacts, preserve an old endpoint variant, or turn an unknown/missing
payload into a generic file card.

The publish invariant is:

```text
validated content durable -> typed artifact record committed -> trajectory + created event published
```

A committed artifact must never reference missing content. Missing or malformed content is a
specific corruption/error path, not a generic file-card fallback.

The HTTP endpoint registry remains the request/response owner, and generated TypeScript surfaces
must be regenerated from the Go contract. Do not create a separate generated-type list or manually
edit generated files.

If `tool_output` has no real typed producer and renderer after this work, remove it from the
advertised artifact-kind contract. Do not retain a nominal kind that the product cannot realize.

### Restore typed rendering

The artifact rail dispatches exhaustively on the generated discriminant:

- markdown uses the existing sanitized markdown renderer
- table uses semantic `table`, `thead`, `tbody`, `th`, and `td` elements
- bar chart uses accessible labels, numeric values, and CSS bars
- file shows a concrete path/reference and optional description

Artifact content is loaded only for visible cards and cached by immutable artifact ID. Large
artifact collections must not create an unbounded DOM.

The recorded line-count request remains historical evidence of the regression, not an automated
test. Artifact acceptance uses a small supplied dataset that requires no workspace scan and can
produce a table or bar chart immediately.

## Workstream 2: Make Current Focus Stable And Milestones Sparse

### Separate focus projection from progress projection

Remove `currentFocus` and `topicDescriptor` mutation from ordinary working/terminal milestone
projections. Add a dedicated focus projection that can run only for:

- a newly accepted primary turn input
- accepted user steering that may materially change the objective

Until the initial focus projection commits, display the exact authored request rather than a
mechanical placeholder. If steering does not change the objective, the focus projector explicitly
preserves the previous value. Plan changes, activity completion, subagent completion, artifact
events, progress timers, and terminal events cannot commit a focus revision.

Keep the distinctions explicit:

- conversation title: short navigator identity
- topic descriptor: broader routing/retrieval metadata
- current focus: stable user-facing topic/objective of the conversation’s active work

Current focus remains visible after terminal completion and changes only when a later accepted
input materially changes the conversation’s topic or objective.

### Tighten milestone eligibility

Change the narrator trigger and output policy:

- activity completion and subagent completion do not immediately request a milestone
- periodic progress windows may advance narrator observation/checkpoint state, but elapsed time
  alone is not a user-visible milestone
- plan changes may make accumulated work eligible for semantic phase evaluation
- approval, failure, explicit status, and terminal output remain separate channels
- one projection call can commit at most one milestone
- automatic milestones have a deterministic minimum 30-second spacing and a maximum of six per
  primary turn; exceptional approval/failure/final messages do not consume that budget
- a source trajectory range can produce at most one committed milestone
- exact prior text is rejected; semantic novelty remains the narrator’s schema-constrained
  decision, not string-similarity code

A short or single-phase task should commonly complete with zero or one working milestone. Silence
is valid.

## Workstream 3: Replace FIFO Narration With Freshness-Aware Playback

The speech coordinator is a live state presenter, not an audiobook queue.

Implement these scheduler invariants:

- at most one pending automatic milestone per conversation
- a newer milestone replaces an older pending milestone from the same conversation
- final summary, approval, failure, or explicit master output clears lower-priority pending speech
  for the same source
- terminal output permanently invalidates all earlier pending milestones; they never resume
- automatic milestones that cannot begin within a small freshness window are dropped and logged
  rather than spoken late
- starting microphone capture cancels active playback to prevent echo and clears stale pending
  speech; after capture, only fresh or high-priority output may play
- visual “speaking” state begins on the playback-start event and ends on playback completion,
  cancellation, or failure

The user may see a new stored milestone before speech starts, but it must not be styled as the
currently spoken highlight. The scheduler records source event ID, enqueue time, replacement/drop
reason, synthesis time, playback start, and completion so latency is measurable from recordings.

Acceptance target: automatic narration starts within four seconds of its source event or is
dropped. No terminal run may play an older milestone after its final summary begins.

## Workstream 4: Make Global-Master Voice First-Class

### Direct keyboard command

Add a configurable global-master voice command to the existing shortcut settings. Default:

```text
Command+Shift+K on macOS
Ctrl+Shift+K elsewhere
```

The existing `Command/Ctrl+K` continues to open the text-focused Ask Setta overlay. The new
shortcut starts master capture immediately and opens the overlay only as the presentation for that
capture; the user does not need to open it first.

Shortcut behavior is deterministic:

- idle: start global-master capture
- capturing for the master: finish and submit
- Escape: cancel capture
- capturing for a topic: explicitly preempt that capture and show that the destination changed to
  Global master; never silently submit topic speech to the master

The command must work from renderer-owned panes and forwarded native BrowserViews, participate in
shortcut conflict validation, and be exposed in tooltips, the overlay, settings, and accessible
shortcut metadata.

### Correct the overlay ownership

Add a dedicated mic button beside the Ask Setta composer, backed by the same global-master command
and controller as the shortcut. Replace the overlay’s app-global speech-status component with a
master-destination presentation:

- master listening/transcribing/committing state and transcript are shown in the overlay
- topic narration and topic capture state are not shown in the overlay
- ambient background playback, when useful, remains a compact shell-level indicator
- master capture preempts topic narration; stale topic narration does not resume afterward

Typed and spoken master requests continue through the same `MasterInput` and routing pipeline with
the correct modality recorded.

## Workstream 5: Recover The Easy Button Information Hierarchy

### Use one central intent slot for focus and topic transcription

The Current Focus location is one central intent slot with explicit presentation states:

```text
stable              -> Current focus: narrator-owned stable topic/objective
capturing_initial   -> Listening: live initial transcript
pending_initial     -> You asked: exact accepted initial request
capturing_followup  -> Listening to follow-up: live follow-up transcript
pending_followup    -> Follow-up: exact accepted follow-up
```

For the initial request, the first valid narrator focus replaces `pending_initial`. For a follow-up,
preserve the last stable focus in state while the same visual slot shows capture/pending text. When
routing resolves the follow-up:

- objective-changing steering keeps the pending text until the new narrator focus commits, then
  replaces it with that focus
- a status question restores the prior stable focus while its answer appears in the separate
  status-reply channel
- a follow-up routed elsewhere restores the prior stable focus after the handoff is acknowledged
- cancellation or capture/submission failure restores the prior stable focus immediately
- steering that does not materially change the objective restores the prior focus unchanged

Do not render the prior focus and follow-up transcript as two competing center regions. The label
changes with the slot state so provisional speech is never presented as an already-settled focus.
Typed follow-ups use the same `pending_followup` state after submission; only voice adds the live
capture state.

The footer mic is an input control and compact state indicator; it is not the content container for
the user’s words. Exact authored inputs remain durable conversation data after the central slot
returns to focus, but they are not persistently duplicated there.

### Replace the scrolling NOW rail with a fading window

Render only the latest five milestones: the current item plus four predecessors. The newest item
is fully opaque; older items use progressively lower opacity and a vertical mask so they fade out.
Remove older items from the rendered list rather than retaining them in a scroll container.

The durable narration event history remains in the conversation store for reload, diagnostics,
and future history surfaces. The Easy Button NOW rail is deliberately not that history surface.
It has no vertical scrollbar and requires no “stick to bottom” behavior.

### Remove passive nested scrolling below the mic

The central caption area, current focus, terminal summary, and error message must not each own
vertical scrolling. The final summary remains short; detailed structured results belong in
artifacts. Errors show concise user-facing text with diagnostic detail available elsewhere.

At normal supported pane sizes there are zero passive scroll containers below the mic. At unusually
short sizes, compact the layout first and then permit one clearly owned pane-body scroll region if
content still cannot fit. Do not clip content silently.

The artifact rail may remain independently scrollable because it is a labeled collection of
durable deliverables. A long active textarea may scroll while the user edits it; neither is
presented as a second status/result region.

## Implementation Order

### Phase 0 — Lock the regressions into executable acceptance

**Status:** Implemented and verified

- Add a fast deterministic production-path Electron scenario using a small supplied dataset; do
  not scan or count the repository.
- Record narrator event count, speech latency, focus revisions, rendered scroll owners, and
  artifact output before implementation.
- Preserve the recording as evidence; do not turn the session logs into brittle golden fixtures.

Verification:

- Workflow: `easy-button-presentation-recovery-phase0`
- Report: `docs/reports/performance/easy-button-presentation-recovery-phase0-20260716.md`

### Phase 1 — Restore typed artifacts

**Status:** Implemented and verified

- Add the generic dynamic-tool bridge in `internal/agent`.
- Add the conversation-owned artifact tool, typed content repository, validation, and endpoint.
- Regenerate Go-owned backend contracts and TypeScript.
- Restore exhaustive markdown/table/bar-chart/file renderers.
- Verify emission, restart/reload, malformed tool calls, and missing-content failure behavior.

Verification:

- Workflow: `easy-button-presentation-recovery-phase0`
- Report: `docs/reports/performance/easy-button-presentation-recovery-phase1-20260716.md`
- Live Codex: `./scripts/test_topic_conversation_workflows.sh --skip-build --live-only`

### Phase 2 — Correct narrator semantics

**Status:** Implemented and verified

- Split focus updates from milestone/terminal projection output.
- Remove activity-completion milestone triggers and enforce cadence/source-range budgets.
- Add durable idempotency tests for duplicate or overlapping projection requests.
- Verify current focus stability across commands, subagents, artifacts, and completion.

### Phase 3 — Correct playback arbitration

**Status:** Implemented and verified

- Replace FIFO milestone accumulation with per-source coalescing and expiry.
- Add terminal/master/capture preemption and playback-start-driven visual state.
- Add timing and replacement/drop observability to desktop recordings.

### Phase 4 — Finish global-master voice UX

**Status:** Implemented and verified

- Add the configurable shortcut and native-view forwarding.
- Add the Ask Setta composer mic.
- Scope overlay voice presentation to master capture only.
- Verify capture preemption, cancellation, modality, routing, and reload behavior.

### Phase 5 — Recover the Easy Button layout

**Status:** Implemented and verified

- Implement the central intent-slot states for initial and follow-up transcription, pending input,
  stable focus, cancellation, and routing outcomes.
- Render the bounded fading milestone window.
- Remove nested summary/error/focus scrollers and establish the small-height compact layout.
- Baseline and re-measure rendering with long conversations and many artifacts.

Verification:

- Workflow: `easy-button-presentation-recovery-phase0`
- Report: `docs/reports/performance/easy-button-presentation-recovery-phase5-20260716.md`

## Required Verification

Changes in this plan cross topic-conversation, provider protocol, run lifecycle, streaming, speech,
IPC/preload, generated contracts, persistence, and renderer projection boundaries. Verification
therefore includes all of the following.

### Focused checks during implementation

- Go domain/tool validation and store tests through `./scripts/go.sh`
- agent protocol tests for dynamic-tool registration, scoping, response, cancellation, and failure
- narrator actor/projector tests for trigger eligibility, rate budgets, idempotency, and stable focus
- speech scheduler tests using a deterministic clock and synthesis harness
- renderer tests for exhaustive artifact dispatch, authored-request projection, scoped master voice
  state, bounded highlights, and overflow ownership

### Deterministic end-to-end desktop workflows

Use temporary app data and a scripted fake Codex/speech harness while exercising the production
Electron/main/preload/renderer/HTTP/store paths. At minimum cover:

1. Open a workspace and create a conversation by voice, showing partial transcription in the
   Current Focus location.
2. Submit a fast bounded request over supplied data, keep its exact text in the central intent slot,
   and replace it only when the first narrator focus commits.
3. Stream a burst of command, subagent, plan, and artifact events.
4. Emit and render a table plus bar chart through `setta.emit_artifact`.
5. Verify no duplicate milestone range, stable current focus, bounded/fading NOW rail, and no stale
   spoken backlog.
6. Open Ask Setta while topic narration exists and verify the overlay contains no topic speech
   state.
7. Start and submit master voice with the keyboard shortcut from both a renderer pane and a native
   BrowserView.
8. Exercise queueing, steering, approval, cancellation, failure, queued-work promotion or
   preservation, and terminal completion.
9. Restart/reload and verify authored input, focus, artifacts, narration, and shortcut-owned master
   interaction recover through production stores.
10. Capture follow-up speech while a stable focus exists; verify live/pending text temporarily uses
    the same slot, then test changed-focus, unchanged-focus, status-route, handoff, and cancellation
    restoration outcomes.

Add narrow failure scenarios for invalid artifact payloads, dynamic-tool errors, synthesis failure,
expired milestones, capture preemption, and narrator degradation. Do not use test-only product
paths or mutate the repository’s real git history.

Add several small artifact-policy scenarios using supplied input—a qualitative response, a tiny
comparative dataset, a numeric comparison, a generated file, and a conversational answer that
needs no artifact. These tests share the same production prompts and prove that artifact behavior
follows deliverable shape rather than a recording-specific fixture.

### Live provider and performance gates

- When the local Codex CLI is signed in with ChatGPT auth, run a fast live Codex end-to-end workflow
  over a small supplied dataset and require a structured artifact. Do not scan the repository and
  do not use `OPENAI_API_KEY`. If ChatGPT auth is unavailable, report the live-provider skip
  explicitly.
- Baseline the current Easy Button render first, then re-measure the bounded NOW rail, lazy artifact
  cards, and speech-driven updates with large histories. Append results under
  `docs/reports/performance/`.
- Before the implementation commit, run `./scripts/format.sh` and `./check_quality.sh --all`.
  Run the supply-chain gate only if dependency, manifest, lockfile, module, or supply-chain files
  change.

## Explicit Non-Goals

- resurrecting `internal/easyrun` or its workspace-global latest-run model
- any backward compatibility, legacy support, migrations, transitional code, dual reads/writes,
  old-field aliases, compatibility flags, or silent fallback to replaced behavior
- guessing artifact suitability with keywords or parsing assistant markdown into fake artifacts
- putting acceptance-test examples or task-specific vocabulary into master, router, narrator, or
  topic-agent production prompts
- reading private chain-of-thought for narrator decisions
- adding periodic polling
- introducing a wake word or always-listening microphone in this recovery
- building a full transcript/history surface merely to house old NOW items
- broad visual redesign outside the Easy Button and master-voice ownership problems above

## Definition Of Done

The work is complete when initial and follow-up live transcription temporarily use the Current
Focus location, accepted words remain there only while resolution is pending, and every outcome
returns the slot to one stable narrator focus; fast unrelated tasks demonstrate the general
artifact policy without recording-specific production prompts; narration remains sparse and never
stale; the NOW rail fades without scrolling; the center has no nested passive scrollers; and the
user can start global-master voice directly with either the shortcut or Ask Setta’s dedicated mic
without seeing background topic speech inside the modal. The completed implementation contains
only the new production path.
