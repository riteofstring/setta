# Bench frontend design rationale

This document owns current non-local rationale for the `bench-frontend` module. User-facing setup
and workflow documentation belongs in `apps/bench/README.md`.

## Workspace-native composition

Bench renders one ordinary `@setta/workspace` host and `WorkspaceShell`. Workspace owns the shell,
canvas, section chrome, Outline, Inspector, toolbar, saved-view tabs, keyboard behavior, graph
interaction, and managed-window surfaces. Bench contributes only app-specific section contents,
pane contents, commands, graph projection, and managed-window bodies. It adds no second header,
parallel token system, imitation sidebar, or custom window chrome.

The Build canvas contains only top-level authored sections: one case set, each candidate, and one
shared check set. Section data contains stable domain identity, while the complete backend snapshot
remains canonical. The graph uses Workspace's existing `data` connection family. Derived edges mean
“run these cases through this candidate” and “apply these checks to this candidate's outputs.”
Cases, launches, runs, and results stay in purpose-built rows and managed windows rather than
becoming canvas nodes.

Bench registers its section kinds through the public host-scoped registry. Cards show concise
identity and readiness; app-owned Inspector contributions edit the bounded authored fields. A
coherent edit submits one complete revision-checked project replacement. Conflicts wait for or fetch
the canonical snapshot and remain explicit; the browser does not replay an edit against unseen
state.

## Build, Runs, and Compare

Build, Runs, and Compare use Workspace saved-view tabs as fixed product presentations. Build shows
the authored graph with native Outline and Inspector. Runs hides authored sections and opens one
Workspace-managed run-history window; app pane tabs navigate launches and show immutable run
details. Compare opens two Workspace-managed result windows, aligns one case from each selected
terminal run, uses an app pane to navigate differences, and records preference and note in a review
pane. Saved views own canvas visibility and camera; the app keeps a separate managed-window state
for each presentation so Workspace's window manager remains authoritative for window behavior.

The launch action is a Workspace command exposed through the native toolbar and command palette.
Its disabled reason reports invalid project state, and its status text resolves the candidate × case
matrix before execution. A trailing Launch pane may show the same small preview. There is no launch
or result section and no canvas overlay pretending to be a shell slot.

Run and comparison views consume one complete backend snapshot. Application selection—active run,
the two runs being compared, and active case—is browser state and is reconciled by stable IDs after
each snapshot. Historical output never enters authored section data. Image artifacts use same-origin
opaque URLs supplied by the backend; missing or failed artifacts remain explicit instead of being
replaced by guessed values.

## Contract and interaction boundaries

Go owns the closed JSON contract and generates TypeScript declarations. The browser validates every
external snapshot before projection. EventSource delivers complete newest-value snapshots; HTTP
responses and stream events for the same revision are acknowledgements of the same canonical state,
not independent fragments to merge.

Bench styling is limited to app-owned section bodies, tables, panes, artifact viewers, and empty or
loading states. It imports Workspace's stylesheet and uses its inherited variables, typography,
controls, borders, elevations, spacing rhythm, focus treatment, and color mode. Native form controls
inside draggable or pannable surfaces use Workspace's exported interaction-boundary classes.

The first browser journey launches two CPU-only thumbnail candidates over ten images, observes
durable completion, selects two runs, compares a visibly different case in paired managed windows,
records a preference, reloads, and sees the same evidence. This is both product verification and the
reference demonstration of Workspace composition.
