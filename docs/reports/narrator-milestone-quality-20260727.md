# Is the Narrator's Output Worth Reading?

**Date:** 2026-07-27
**Phase:** `now-rail-narrator-plan.md` Phase 0 — the gate the rest of the plan
waits behind.
**Verdict:** Pass.

## The question

The Now rail is to be rebuilt on narrator milestones. The narrator's prompt
reads correctly, but nothing had ever seen its output on the work in question,
because folderless conversations never reached it. If the milestones turned out
as verbose as the graph dump they replace, the problem was the prompt and the
rest of the plan waited behind fixing it.

## What it took to see any output at all

Three gates, not one. Each was found by running a real folderless turn against
a live model and following what it dropped.

1. `narration_observer.go` returned before submitting when the conversation had
   no workspace. Removing it let observations flow, and nothing else changed:
   the narrator still produced nothing.
2. `ProjectionOperation.Validate`, `FocusOperation.Validate`, and
   `CheckpointOperation.Validate` required a workspace id unconditionally.
   `StatusOperation` already treated it as optional. So a folderless
   observation was rejected at validation and dropped **without a trace** — the
   narrator reported `status=ready` while never having been invoked, which is
   the worst kind of failure: a healthy-looking one.
3. `caller.go` allowed an empty workspace for a status call only, so focus and
   projection calls failed as an internal contract error. That one *was*
   visible, as a degradation with a diagnostic reference.

The whole path below those checks already handled folderless work — the
workspace root resolves to `folderlessRuntimeRoot`, the context materializer
yields an empty workspace for a conversation bound to no folder, and the
role-profile read takes a nil binding. Only the validators disagreed with the
code they guarded.

## What the narrator actually writes

Live Codex, folderless conversation, verbatim.

**A short single-stage task** — "write a short comparison of three ways to
store application settings, then publish it as an artifact":

> **focus** — Compare three sensible ways to store application settings and
> publish the result as a polished, directly viewable Setta artifact.
>
> **descriptor** — Application settings comparison
>
> **final summary** — The comparison is published as the Setta artifact "Three
> Ways to Store Application Settings."

No milestones. The work was one uninterrupted stage, and the prompt says to
prefer an empty milestone list for normal progress. That is the instruction
working, not the narrator failing.

**A three-stage task**, run to prove milestones appear when something material
happens — research, then build a comparison table, then publish two artifacts:

> **focus** — Research three ways to store application settings, compare them
> with at least four criteria, and publish separate outline and comparison
> artifacts.
>
> **descriptor** — Application settings storage research
>
> **milestone** — Stage 2 is complete, and the comparison now covers all three
> storage approaches across eight criteria; Stage 3 is underway.
>
> **final summary** — The outline and comparison table were published as two
> separate artifacts, and the work is complete.

## The judgment

Read against the standard the plan set — *would a reader who glanced once know
what happened?* — yes.

The strongest evidence is what is **not** there. That three-stage run covered
354 trajectory sequences over about two minutes and produced **one** milestone.
Every command, every tool call, every file read passed without comment. The
rail this replaces would have shown five rows, three of them the literal string
"Tool".

The one milestone that was emitted names a completed stage, quantifies what it
produced, and says what is happening next, in one sentence. The final summary
names the artifacts and stops rather than repeating their contents, which its
own instruction asks for.

## What this does not cover

- **A failing or blocked run.** Both observed runs succeeded. The prompt asks
  for a milestone when "a blocker needs user action", and that is the case the
  Now rail exists to surface. It is untested here.
- **A long-running conversation.** Two minutes is not an afternoon, and the
  checkpoint path that compacts older narration never ran.
- **Milestone volume under steering.** Neither run steered a turn mid-flight.

None of these block the plan. They are what to watch when the rail is real.
