# The Now Rail Says What Happened

**Date:** 2026-07-27
**Status:** Not implemented.

## Outcome

The Now rail carries narrator-written highlights: at most a few sentences, each
one something the user learned. Nothing else. The Director can answer "what is
happening in that conversation?" because it reads the same sentences. The top
bar is the mockup's, and the macOS traffic lights stop landing on the logo.

## What is true today

Every claim here was read out of the code, not inferred.

**The Now rail is a graph dump.** `currentDirectorActivity` takes the last five
semantic nodes and renders `node.publicSummary`
(`DirectorNowActivityList.tsx:76`). Those summaries are three things:

- Hardcoded constants. `"Tool"`, `"Command"`, `"Hook"`, `"Web search"` come
  from a lookup table (`projector_work.go:134`). A row reading
  "Tool / Action / Done" carries no information at all.
- Raw provider text. The user's own prompt verbatim
  (`projector_conversation.go:105`), and the worker's final message with its
  `**markdown**` unrendered and truncated mid-word.
- Occasionally, a real Director sentence.

Each row also prints `Worker · Observed · 3 sources` — actor, evidence class,
and source-event count. That is provenance for debugging a projector.

**The rail says the same thing three times.** The activity row, the Summary
disclosure, and the live-status line all render the same text. The Summary
disclosure is `workstream.lastMilestone.publicSummary` — a Director *decision*
milestone, which in practice carries the worker's final message.

**"See thread history" shows the user their own prompt.** It renders the last
five `user_goal`/`completed`/`failed`/`cancelled` nodes
(`DirectorHistoryOverlay.tsx:13`). In a short thread that is one row: the
prompt just typed.

**The Narrator already exists and was built for this.** `internal/narration/`
is 24 non-test files. Its own instructions say so, verbatim
(`caller.go:575`):

> Milestones are shown in the Now rail and read aloud when narrator voice is
> enabled; treat each milestone as an audible interruption.

Its milestone schema asks for one sentence of 12–24 words describing "a new
result, action-needed blocker, or material phase change", and its instructions
already say to emit nothing otherwise:

- "Emit at most one milestone only when the user learned a new result, a
  blocker needs user action, or the work entered a materially different phase."
- "Prefer an empty milestone list for normal progress, repeated blocked states,
  waiting updates, partial output streaming, or when semanticEvents do not show
  a meaningful change."
- "Do not infer phases from keywords or command names."
- "Avoid: 'Continued working on the current objective.' Prefer: no milestone."

**The Director cannot see inside a conversation either.** Its thirteen tools
carry no conversation content at all. `read_activity` — the tool whose own
description says to call it to answer "what is happening?" instead of guessing
— returns this per workstream, and nothing else (`setta_tools.go:81`):

```go
WorkstreamID, Title, Status, Selected,
HasActiveRun, QueuedRunCount, RecoverableFailures, WorkspaceID
```

Counts and titles. No account of the work, no last output, no artifacts.
`list_workstreams` returns the same struct. Asked what a conversation is doing,
the Director answers with everything it has, which is "running". That is not a
prompting failure, and no instruction can fix it.

**Two things stop any of it reaching the screen.**

1. `narration_observer.go:42` returns early when
   `conversation.WorkspaceID == nil`, so a folderless conversation never
   reaches the narrator. Every screenshot that prompted this plan says "No
   folder". The `semantic` value computed on the line above is discarded.
   `internal/narration/folderless_runtime_root.go` exists, so the narrator
   package already supports folderless work — the gate is a leftover.
2. `registry_fold.go:53` states that "narration, presentation, and side
   conversations — are not registry inputs and change nothing". The Director
   registry drops `conversation.narration.created`, so the command center
   cannot see a milestone even when one is written.

## Decisions

**The Director is not narrated.** Recorded from the product owner, 2026-07-27.
It is a conversation, and its decisions already produce public sentences, but it
does not need an account of itself written for a reader — it *is* the reader.
Narration describes work; the Director dispatches it.

## Hard Rules

- **The Now rail never falls back to graph contents.** If the narrator has said
  nothing, the rail says nothing. A rail that degrades into a node dump is the
  defect this plan exists to remove, and a fallback would reintroduce it under
  a different name.
- **No compatibility layer, no migration, no transitional path.** The graph
  projection is deleted, not kept behind a flag. Conversations that predate
  narrator milestones show an empty rail.
- **A narrator milestone is not a Director decision milestone.**
  `Workstream.LastMilestone` belongs to the decision authority. Reusing that
  field would conflate two authorities that answer different questions.
- **No new AI role.** The narrator is written, prompted, and tested. This plan
  wires it up; it does not design it.
- **Nothing in the rail is provenance.** Actor, evidence class, and source
  counts are for debugging a projector and do not belong on a reading surface.

## Phase 0 — Is the narrator's output actually good?

Everything after this phase assumes real milestone text is worth reading. The
prompt is right; the output has never been seen, because the folderless gate
means it has never run on the work in question.

Lift the gate locally, drive one real folderless session against a live model,
and capture the milestones it writes verbatim into a report.

**This phase can fail.** If the milestones are as verbose as the graph dump,
the problem is the prompt, and the rest of this plan waits behind fixing it.

**Verification.** A report under `docs/reports/` quoting the milestones a live
run produced, read against the standard: would a reader who glanced once know
what happened?

## Phase 1 — The macOS window chrome

Independent of everything else, and the only defect here that is not about
editing.

`titleBarStyle: "hidden"` with `trafficLightPosition {13, 13}` puts the system
buttons inside the renderer's own top bar. The settings shell reserves room for
them with `--setta-shell-top-bar-chrome-inset` on
`[data-desktop-platform="darwin"]` (`styles.css:301`). The command center's top
bar sets `data-desktop-platform` and nothing reads it, so the brand mark is
drawn under the buttons.

Reserve the same inset on the command center's leading edge.

**Verification.** The app driven on macOS unmaximized, screenshotted, with the
logo clear of the buttons; and maximized, with no stray gap.

## Phase 2 — The top bar is the mockup's

The mockup's bar is a heads-up layer, not a document header: the identity sits
in the left group, and the row is title, position dots, nothing else.

- Left-align the identity. Centring it was this author's choice and the mockup
  is right.
- Drop the folder chip. It never changes while a workstream is selected, and
  every workstream dot's accessible name and tooltip already name the folder.
- Keep the status word. It is the bar's one changing fact.

**Verification.** The command center driven and screenshotted beside
`docs/mockups/fullscreen_conversation_concept.html` at the same viewport.

## Phase 3 — Folderless conversations reach the narrator

Delete the `WorkspaceID == nil` early return in `narration_observer.go` and
give the observation the folderless runtime root the narrator package already
provides.

**The risk is real and is not layout.** The narrator runs a model per
observation. A folderless conversation is the cheap, common case today, and
turning narration on for it changes what the app costs to run. The phase is
worth doing anyway — a folderless workstream is exactly the case with no files
to look at, so narration is the only account of it — but the cost belongs in
the report, not as a surprise.

**Verification.** A driven folderless session producing
`conversation.narration.created` events, and the Go narration suite.

## Phase 4 — Narration reaches the Director

`conversation.narration.created` becomes a registry input. The workstream
record carries its recent narrator milestones, and `DirectorSnapshot` exposes
them, so the command center reads milestones the same way it reads artifacts.

This is a contract change: new Go-owned types, regenerated contracts, and a
protocol version bump.

The comment at `registry_fold.go:53` is reversed by this phase and is rewritten
rather than deleted, because the reason narration was excluded — it has no
effect on workstream lifecycle — is still true. It is a reading surface's
input, not a state transition.

**Verification.** A driven session where a narrator milestone appears in the
Director snapshot; Go director and conversation suites.

## Phase 5 — The Director reads what the narrator wrote

Inspection has two levels, because a glance and a question are different needs
and cost different amounts.

**Always, free: milestones in the receipts.** `read_activity` and
`list_workstreams` return each workstream's recent narrator milestones
alongside its status. The milestones are already on the workstream record after
Phase 4, so only the tool receipt has to carry them, and every Director turn
gets an account of every workstream without a single extra model call.

**On demand, one call: ask the narrator.** A new `ask_conversation` tool takes
a workstream and a question and returns the narrator's status reply — "current
state, evidence, and blocker or next step when relevant". The entrypoint
already exists: `narration/service.go:183` exposes `AskRoutedStatus`, with
`AskRoutedFolderlessStatus` beside it, and the trigger it raises is named
`explicit_status_requested`. Only the conversation router calls it today; the
Director has no tool that does.

**The Director does not get the raw trajectory.** Not because it should not
inspect — it should, and this phase is how — but because the narrator has that
conversation's context already materialized and answers *the question that was
asked*. "Why did the deploy fail?" gets an answer about the failure. A
transcript would make the Director re-derive, worse and at length, what the
narrator derives well, and would put the graph dump back one layer down.

**Verification.** A driven session where the Director is asked what a running
workstream is doing and answers from the milestone without a tool call, then
asked something the milestone does not cover and answers from
`ask_conversation`; Go director and narration suites.

## Phase 6 — The rail is only what the narrator said

- `DirectorNowActivityList` and `currentDirectorActivity` are deleted. So is
  the per-row provenance line.
- The Summary disclosure is deleted. It restates the row above it.
- The thread-history overlay and its button are deleted. A transcript belongs
  to a chat surface, not to a permanent control in a heads-up rail.
- The rail renders narrator milestones, newest first, bounded to three.
- With no milestones it says so plainly, in one line. It never shows graph
  contents.

**Verification.** The `director-command-center` Electron workflow, whose
current preview and activity assertions are rewritten to the new contract
rather than dropped; renderer unit tests; the rail read at the width it draws.

## Open questions

1. **Three milestones, or three sentences?** A bound in rows is simple; a bound
   in length is what actually protects the reader. Phase 0's real text should
   settle it.
2. **What happens to `Workstream.LastMilestone`?** Nothing in this plan reads
   it once the Summary disclosure is gone. If it has no other reader, it is
   dead weight on the contract and should be removed separately.
