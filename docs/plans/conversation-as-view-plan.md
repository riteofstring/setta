# One Conversation, One View

**Date:** 2026-07-27
**Status:** Complete. Phases 1-5 landed 2026-07-27.

## Outcome

Every conversation is a view. The arrows in the top bar move between them, and
everything on screen belongs to the one you are looking at: the canvas, the Now
rail, the artifacts, and what you type or say.

The Director is one of those views, and it is the one you land on. Its view is
the whole constellation — every workstream at once — because that is what the
Director actually sees. The multi-thread canvas stops being a permanent mode
and becomes the Director's own perspective, which is the first time it means
anything.

## What is true today

The app is not one of the two designs. It is both, half each.

| Surface | Follows selection? | Where |
| --- | --- | --- |
| Canvas | **No** — composes every workstream | `DirectorCommandCenterShell.tsx:844` packs `snapshot.graphs` |
| Artifacts rail | **No** — app-wide, unfiltered | `DirectorCommandCenterShell.tsx:589` passes `snapshot.artifacts` whole |
| Now rail | Yes | `currentDirectorActivity(graph)` |
| Top bar | Yes | title, status, folder, and the arrows |
| Composer | **No** — always the Director | `DirectorComposer.tsx:160` dispatches `submitIntent` |

So the arrows change two surfaces and leave three alone. Selection is a control
with no consistent consequence, which is why no part of the screen reads as
having a job. The canvas failing to follow selection has been an open defect
for exactly this reason: there is no answer to what it should do, because
selection does not mean anything yet.

**Two things already exist that this plan needs.**

- `selectedWorkstreamId == null` already renders as the Director
  (`director-focus.ts:62` returns `kind: "director"`). The Director-as-a-view
  model is half-built; it is spelled as an absence rather than a destination.
- Input aimed at a conversation is already a routed decision, not a raw pipe.
  `internal/runtime/conversation_route_command_executor.go` executes the
  router's choice — `send_to_parent`, `steer_parent_turn`, `queue_parent_turn`,
  `answer_as_narrator`, `clarify` — and `narration.NotifyConversationInput`
  starts it. Only the conversation surface reaches it today.

## Decisions

Recorded from the product owner, 2026-07-27.

**Each conversation gets its own view.** Per-conversation highlights and
artifacts are the point, and speaking directly to a running conversation is
something a user wants to do.

**The all-threads canvas is kept, as the Director's view.** It is the best
thing about the app to look at. Making it a view rather than a mode keeps it
and gives it a meaning.

**Talking to the Director stays the default, not a constraint.** The Director
is the landing view. The property worth keeping is "you do not have to choose
who to address" — and that is a default, not a lock. It also breaks down
exactly when it matters most: telling a running worker "no, not like that" is
steering, and steering is the thing you would most want to do directly.

## What the mockup settled

`docs/mockups/fullscreen_conversation_concept.html` was extended to carry the
Director's view, and driving it decided several things this plan had left open
or had wrong. The mockup is the specification for them.

- **The Director's own conversation is a column of its own view.** It is a
  conversation like any other — you ask, it decides where the work goes — and
  it was missing from the one view you talk to it in.
- **The Director's view has no rails.** Not slimmed: gone. The Now rail's text
  collided with the first column's title, and an artifact belongs to the thread
  that produced it, one arrow away. This answers open question 1, which asked
  whether the Director's view lists every thread's artifacts. It does not list
  any.
- **What needs an answer rides the composer line**, where it can be acted on:
  it names the waiting thread and opens it. A rail could only have told you.
- **Level of detail replaces shrinking.** Columns are readable to about four
  threads; beyond that every other thread becomes a tile — its latest turn,
  collapsed — while the Director keeps its full column. A twelve-column
  constellation is a partial view of everything rather than a complete view of
  anything.
- **Clicking a thread opens it.** On the Director's view a thread is something
  you open, not something you unfold.
- **A tile reports on its conversation's clock, not the canvas's.** It looked
  static when driven by render state; the work's own progress is what makes it
  live. This is the trap to avoid when building it.

## Hard Rules

- **One meaning for selection.** After this plan there is no surface that
  ignores the current view. A rail that shows everything while the bar names one
  thing is the defect being removed.
- **No compatibility layer, no migration, no dual mode.** There is no setting to
  keep the composed canvas while viewing a workstream, and no transitional
  state where some surfaces have moved and others have not within a shipped
  build.
- **The composer does not gain a target picker.** What you are looking at is
  what you are talking to. A dropdown for "who am I addressing" is the choice
  this design exists to avoid.
- **Input to a conversation stays routed.** Typing at a workstream view is a
  router decision, never a direct append to a running turn. The router already
  distinguishes steering from queuing, and the user must not have to.
- **The Now rail's content is out of scope here.** It is already scoped to
  selection; what it *says* is `now-rail-narrator-plan.md`. The two plans meet
  at the point where per-view highlights become worth having.

## Phase 1 — Selection names a view

**Done.** Four things had to agree that a nil selection means something: the
resolver could not express it (returning nil meant "no move"), fact validation
required a workstream, the fold assumed a nil workstream meant a committed
decision, and the projector recorded the Director's *lane id* as the selection —
which made the next selection's previous-selection check disagree with the log
and stop the follower one dispatch later, with no recorded cause.

### Original phase text

`selectedWorkstreamId == null` becomes the Director's view rather than the
absence of a selection: a real destination the arrows land on, ordered first,
and the state the app opens in.

Nothing visual changes in this phase except that arrowing past the first
workstream reaches the Director instead of stopping. It is the model change
every later phase reads.

**Verification.** Arrow navigation driven end to end, wrapping through the
Director; `director-command-center` workflow; Go director suite.

## Phase 2 — The canvas follows the view

**Done.** The graph performance workflow passed 19 scenario runs, so the composed
view did not get slower on its way to becoming one view among several. A
workstream with no graph draws nothing rather than falling back to the
composition.

### Original phase text

The Director's view composes every workstream's graph *and its own*. A
workstream's view draws that workstream's graph alone.

Past about four threads the composition changes representation rather than
scale: the Director's conversation keeps a full column and every other thread
becomes a tile carrying its latest turn. Clicking any thread opens it.

**This closes an open defect by making it a specification.** The canvas not
following selection has been recorded as a bug with no agreed fix; there was no
fix because there was no answer to what it should show. Now there is.

Watch the frame cost in both directions: one workstream should be cheaper than
the composition, and the Director's view is unchanged from today, so neither
should regress.

**Verification.** The navigation workflow driven with two workstreams, showing
the canvas changing between them and returning to the composition on the
Director's view; the graph performance workflow, to prove the composed view did
not get slower.

## Phase 3 — The rails follow the view

**Done.** What needs an answer already rode the composer through PendingActions,
so there was nowhere else for it to go.

### Original phase text

A workstream's view lists its own artifacts. `WorkstreamArtifact` already
carries `workstreamId`, so that is a filter rather than a contract change.

The Director's view has no rails at all. What is waiting on an answer moves to
the composer, naming the thread and opening it when clicked — which is also
where the app already puts pending approvals, so this is one home rather than
two.

**Verification.** A driven session with artifacts in two workstreams, each view
showing only its own and the Director's view showing neither rail;
`director-command-center` workflow, whose rail assertions move to the composer.

## Phase 4 — The composer speaks to the view

**Done.** The receipt requirement was met by waiting for the routing decision
rather than reporting acceptance: `waitInputState` returns the router's
decisions, and a unit test holds every outcome to a distinct sentence. Voice
kept a private path to the Director and now goes through the same door.

### Original phase text

On the Director's view, the composer dispatches a Director intent, as it does
today. On a workstream's view, it hands the text to that conversation and the
router decides what it means — send, steer, queue, answer, or ask for
clarification.

The executor for that already exists and is reached today only from the
conversation surface. This phase gives the command center a scoped submit
intent that starts it.

**Voice follows text.** The dictation path ends in the same submit, so there is
one routing rule, not two.

**The risk is that a steer is not obviously a steer.** A user typing at a
running workstream may mean "change what you are doing" or "do this next", and
the router chooses. The receipt has to say which one happened, in the rail,
every time — a silent wrong guess here is worse than the current design's
inability to guess at all.

**Verification.** A driven session typing at a running workstream and seeing a
steer receipt, and at an idle one and seeing new work start; the conversation
route command executor's Go suite.

## Phase 5 — The bar says where you are

**Done.** Selection can name the Director rather than only be arrowed to, which
the strip needed. On a compact bar the strip collapses: the arrows do the same
job and only one of them fits.

### Original phase text

The dot strip includes the Director as its first destination, so the strip
shows where you are among all views rather than among workstreams only. The
counter counts views.

This is also where the strip earns its place again: it is a navigator between
views, which is what the mockup's dots always were.

**Verification.** The bar driven at one, two, and many workstreams, read
against `docs/mockups/fullscreen_conversation_concept.html`.

## Open questions

1. **What does a workstream's view show while it is archived or has no graph
   yet?** An empty canvas is honest but startling after the constellation.
2. **Does arrowing away from a running workstream keep its narration warm?**
   Narration is per conversation and unaffected by what is on screen, but the
   cost question — narrating five conversations while looking at one — belongs
   with `now-rail-narrator-plan.md` Phase 3.
