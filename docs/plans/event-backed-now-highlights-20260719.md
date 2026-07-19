# Event-Backed NOW Highlights and Artifact-First Completion Plan

**Date:** 2026-07-19

**Status:** Follow-up implementation pass required. The prior loop completed
the event-backed renderer, artifact-first completion, and yolo default cutover.
This pass corrects the speech rule: `NOW` highlights are sparse because every
highlight is speech-worthy and should be spoken. Do not implement compatibility
shims, migrations, transitional rendering, dual highlight sources, or legacy
narrator milestone behavior as part of this work.

## Implementation Status

- [x] Renderer: `NOW` is projected from trajectory events, artifact metadata,
  pending approval state, and terminal turn state. The rail no longer uses
  narrator milestones as highlight sources, and the rail item type is now
  progress-highlight oriented.
- [x] Speech: every newly created event-backed `NOW` highlight should be
  spoken exactly once when narrator speech is enabled. If a progress item would
  be annoying when spoken, it should not be a `NOW` highlight.
- [x] Completion: artifact-bearing terminal turns now use compact,
  artifact-first center summaries derived from typed artifact data.
- [x] Defaults: the primary topic-agent role default now uses the yolo
  permission cutover.
- [ ] Phase audit and release gates: run the broader deterministic coverage and
  any remaining live-provider checks at the audit point.

## Intent

The Easy Button `NOW` rail should remain visible and useful. It should show the
small number of moments a user can glance at or hear to understand the run:

- work started;
- the run is blocked on the user;
- a blocker cleared;
- an artifact became available;
- the turn completed, failed, or was cancelled.

It should not be a narrator diary, command log, or periodic "nothing visible
yet" feed. The speech layer is not a second severity filter. The way to avoid
annoying speech is to make the highlight set meaningful, not to create
visual-only highlights.

## Source Recording

This plan is grounded in the LOC workflow captured in:

- `.recordings/20260719T193221Z`
- `.recordings/20260719T193619Z`

The actual user request was:

```text
Hey, can you figure out how many lines of code are in this repo and also break it down by language?
```

The useful product moments in that run were:

- turn accepted and started at `19:32:59` to `19:33:01`;
- command activity began at sequence `44`;
- an approval request was emitted at trajectory sequence `172`;
- the approval was resolved at trajectory sequence `173`;
- the table artifact was emitted at trajectory sequence `244`;
- the turn completed at trajectory sequence `452`.

The noisy current `NOW` milestones were narrator-generated:

```text
The repository scan is underway, but there is still no line count yet.
There isn't a dedicated LOC counter installed, so the repository count will come from Git's tracked files and exclude build outputs and local caches.
The download-based line counter is blocked for now, so the repository totals still haven't been produced.
The repository totals are still blocked because downloading the standard line counter now needs approval before an accurate per-language report can be produced.
The blocked line-count step has cleared, but no repository totals or language breakdown are visible in this span yet.
The line-counting pass is complete, but the repository totals and language breakdown still aren't visible in this span.
```

Those entries are short enough, but they are low-signal. They mostly describe
absence of results or the narrator's limited view of a window.

## Target UX for the Recorded Conversation

With default yolo permissions, the same conversation should show this `NOW`
progression. Each entry should be spoken once when it first appears:

```text
Counting repo LOC
Scanning tracked files and grouping them by language.

Counting with cloc
Running a comment-aware language breakdown.

Table ready
The repository LOC table is ready with language totals.

Complete
Source total: 245,293 LOC; the table has the full breakdown.
```

If approvals are explicitly enabled for that role profile, the same conversation
should show one approval step. Every displayed entry is still spoken:

```text
Counting repo LOC
Scanning tracked files and grouping them by language.

Needs approval
Download cloc to /tmp for comment-aware counts?

Counting with cloc
Approval received. Running a comment-aware language breakdown.

Table ready
The repository LOC table is ready with language totals.

Complete
Source total: 245,293 LOC; the table has the full breakdown.
```

No mode chip is part of this plan.

## Product Rules

### NOW Is Event-Backed

The renderer must stop treating `snapshot.narration.events` milestones as the
source of `NOW` highlights. `NOW` is a projection from conversation trajectory,
conversation status, pending approval, artifacts, and terminal turn state.

Narration can still provide wording for an approved event-backed highlight, but
it cannot decide that a highlight exists.

### Highlight Eligibility

Promote these events to `NOW` highlights:

- `turn_started`: create the active work entry.
- `approval_requested`: replace the active work entry with a blocked entry.
- `approval_resolved`: replace the blocked entry with resumed work.
- `artifact_emitted`: create an artifact-ready entry.
- `turn_completed`: create a completion entry.
- `turn_failed`: create a failure entry.
- `turn_interrupted` or cancelled terminal state: create a stopped entry.

Do not promote these events by themselves:

- `agent_public_text_delta`;
- `agent_message_completed`;
- `public_reasoning_summary_updated`;
- routine `activity_started`, `activity_progressed`, or `activity_completed`;
- `conversation.narration.created`;
- `conversation.narrator_state.updated`;
- narrator `progress_window_elapsed` output.

Ordinary command churn belongs to the active work entry, not to new highlights.
The recorded LOC run had many command events; rendering each one would simply
replace narrator noise with command noise.

Failed command activity is only a `NOW` highlight if it changes the user-visible
run state to failed, cancelled, or waiting for approval. Recovered failed
attempts remain internal activity.

### Wording Rules

Every `NOW` entry should have:

- a short title, ideally under 32 characters;
- one concrete body line, ideally under 120 characters;
- no sequence numbers, provider names, "narrator", "span", or "visible in this
  window" language;
- no claims that nothing exists unless the conversation is actually blocked,
  failed, or cancelled.

For the recorded run, the approval entry comes from the actual approval prompt:

```text
May I temporarily download the standard cloc counter to /tmp for an accurate language and comment-aware LOC report?
```

The display copy can shorten that prompt, but it must remain tied to the
approval request payload rather than inferred from keywords.

### Speech Cadence

Automatic narrator speech should be driven by the same event-backed `NOW`
projection. A `NOW` highlight is speech-worthy by definition.

Every newly created `NOW` highlight should enqueue narrator speech exactly once
when narrator speech is enabled for that conversation. The spoken text can be
derived from the same title/body facts, or from a sibling `speechText` field
computed by the same projection, but it must describe the same event-backed
fact. It must not come from an independent narrator milestone decision.

Do not demote routine-looking highlights to visual-only speech behavior. If the
highlight would be tedious or annoying when spoken, tighten highlight
eligibility or wording so that the item is not emitted as a `NOW` highlight.

Restored historical highlights after reload should remain visible but should
not automatically replay. Speech is for live creation of new highlights, not for
snapshot hydration.

The recorded routine milestone playbacks would not occur.

Explicit user status replies remain supported as status replies. They are not
`NOW` highlights, and their speech behavior remains separate from this
highlight-driven progress speech.

## Artifact-First Completion

When a turn emits a structured artifact, the artifact is the primary answer.
The center completion should be compact.

For the recorded run, the current center paragraph restated:

- source total;
- top languages;
- generated-source caveat;
- JSON/YAML/Markdown totals;
- physical-line total;
- cloc version and counting scope.

That information already belonged in the table artifact and should not fill the
middle of the screen.

Target center completion:

```text
Done. The source total is 245,293 LOC; the full breakdown is in the table.
```

If the artifact does not expose a typed headline value, use the artifact title:

```text
Done. I put the result in the artifact.
```

Do not use keyword heuristics to decide whether a final message is redundant.
Use typed turn/artifact metadata: same turn, artifact emitted, artifact kind, and
structured artifact contents when available.

The provider's raw final text can remain in stored trajectory data for audit and
debugging, but the Easy Button primary completion view should render the compact
artifact-first completion.

## Permission Default Cutover

The primary topic agent default should be yolo:

```text
approvalPolicy: never
providerPermissionProfile: :full-access
approvals: false
workspaceMutation: true
toolAccess: all
```

This is a hard default cutover in `DefaultAgentRoleProfile`. Do not add a mode
chip. Do not add a migration. Do not preserve the old default through a
compatibility branch.

The approval card remains a supported UI for explicit role profiles that enable
approvals. The card itself worked well in the recording.

## Implementation Shape

### Renderer

Current `easy-button-surface` builds `milestones` from
`snapshot.narration.events`. Replace that projection with a pure
trajectory/artifact/turn projection.

Likely renderer ownership:

- add a focused progress projection helper near the Easy Button feature;
- feed `HighlightRail` from that helper instead of narrator milestones;
- rename the local type from `EasyButtonMilestone` to a progress-oriented name;
- keep the left rail label as `NOW`;
- keep the max visible item count small;
- update speaking/highlight state to use event-backed highlight identities for
  every spoken `NOW` entry, not narrator milestone identities.

### Narration

Keep narrator focus, topic descriptor, explicit status replies, and any backend
state needed for routing. Stop using automatic narrator milestones as the
renderer's `NOW` source.

If narrator wording is still used for progress entries, the narrator request
must be constrained to a code-selected event:

```text
event kind
approval prompt, if any
artifact metadata, if any
terminal status, if any
current user objective
```

The allowed output is only label/body text for that event or no copy. It is not
allowed to add another highlight.

Do not reintroduce narrator milestones as a speech workaround. Narration can
help phrase a code-selected highlight, but it does not own highlight existence
or the decision to speak.

### Speech

The current implementation still treats persisted narration events as the live
automatic speech source. That is the wrong ownership boundary for `NOW`.

Replace it with highlight-driven speech:

- each event-backed `NOW` highlight has a stable source identity;
- the source identity is derived from persisted conversation data, such as the
  trajectory event id, artifact id, pending approval id, or terminal turn id;
- the backend speech resolver can authoritatively recover the highlight speech
  text from persisted trajectory, artifact, approval, turn, and presentation
  data;
- the renderer enqueues speech when a new highlight source identity first
  appears live for the conversation;
- re-renders and snapshot hydration do not replay already-seen highlights;
- no arbitrary renderer-only text is sent directly to the speech provider.

The simple mental model: `NOW` creates one product moment; that product moment
is displayed in the rail and spoken by the narrator. There is no separate
"important enough to speak" classification after the highlight exists.

### Completion

Change terminal summary projection so artifact-bearing turns prefer a compact
artifact-first summary over narrator final summary and raw agent text.

Use structured artifact data when available. For table artifacts, derive
headlines from table rows/columns through typed data, not by parsing rendered
Markdown or prose.

### Defaults

Change the Go-owned default role profile. Regenerate generated TypeScript
outputs only if a Go-owned contract or generated input changes. Do not manually
edit generated files.

## Verification Plan

This touches topic-conversation behavior, approval handling, event streaming,
renderer conversation state, topic-projection UI, and Codex provider protocol
settings. It requires deterministic end-to-end Electron tests through the
production main/preload/renderer/HTTP/store paths.

Required deterministic workflow test:

1. Open a temporary workspace.
2. Create a topic conversation.
3. Submit the LOC request.
4. Fake provider emits ordinary command activity.
5. In explicit ask-mode coverage, fake provider emits an approval request.
6. Verify the `NOW` rail shows exactly one approval highlight while blocked.
7. Submit approval.
8. Verify the approval highlight is replaced by resumed work.
9. Emit a table artifact.
10. Verify `NOW` shows `Table ready`.
11. Emit a deliberately long final assistant message.
12. Complete the turn.
13. Verify the center completion is compact and artifact-first.
14. Reload/restart with the same temporary app data.
15. Verify the same event-backed `NOW` entries and compact completion restore.

Required default-permission test:

1. Start a new default topic-agent turn.
2. Assert the resolved invocation uses `approvalPolicy: never`.
3. Assert the provider permission mode maps to full access.
4. Assert approvals are disabled.
5. Assert no approval card appears for the recorded download-to-`/tmp` style
   flow.

Required speech test:

1. Emit routine activity and text-delta events that are not eligible for `NOW`.
2. Assert they create no `NOW` highlight and enqueue no speech.
3. Emit each eligible `NOW` event: turn start, approval requested, approval
   resolved, artifact emitted, completed, failed, and cancelled/stopped.
4. Assert every created `NOW` highlight enqueues one narrator speech synthesis
   request when narrator speech is enabled.
5. Assert the speech source id maps back to the same highlighted product moment,
   not to an unrelated narrator milestone.
6. Assert re-rendering and reload/hydration preserve the visible highlights but
   do not automatically replay old highlight speech.
7. Assert explicit user status replies can still speak as status replies without
   becoming `NOW` highlights.

Run narrow checks first. Before committing implementation, run
`./scripts/format.sh` and `./check_quality.sh --git-changes`. If live Codex E2E
is available through ChatGPT auth, run it for this change set; do not use
`OPENAI_API_KEY` as a substitute.

## Non-Goals

- No mode chip.
- No command-by-command `NOW` log.
- No visual-only `NOW` highlights.
- No legacy narrator milestone renderer.
- No narrator milestone speech workaround for event-backed highlights.
- No migration of existing narrator milestones into the new projection.
- No heuristic suppression of final text based on words like "table" or
  "artifact".
- No compatibility layer that preserves `on-request` as the default primary
  agent mode.
