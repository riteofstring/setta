# Chat Scroll and Terminal Surface Plan

Date: 2026-07-04

## Problem

Recent recordings show three related UI contract problems:

1. Transcript auto-follow can detach while the transcript is still effectively at
   the bottom.
2. The jump-to-latest button can appear when it is not actionable, including
   when the transcript is already at the bottom or when the conversation fits in
   the visible area.
3. The background terminal footer can show `1 background terminal needs
   attention` for a terminal that has already exited. Closing the monitor can
   hide that terminal locally until reload, even though no backend state changed.

The earlier terminal close prompt issue has the same root shape: renderer UI is
making decisions from coarse or local state instead of a backend-owned or
geometry-owned truth. A `running` terminal lifecycle state is not enough to know
whether closing is destructive, and a local dismissed set is not enough to know
whether a background terminal still matters.

## Recording Evidence

The latest recording at `.recordings/20260704T213632Z` confirms the scroll and
background-terminal failures:

- `chat:list-background-terminals` returned one terminal:
  - `status: "exited"`
  - `exitCode: 130`
  - `completedAt: "2026-07-04T21:23:14.126696Z"`
  - the recording started around `21:36:34Z`
- The footer still rendered `1 background terminal needs attention`.
- The monitor close button only updated renderer-local state, so the backend
  still returned the exited terminal on every refresh.
- Scroll snapshots repeatedly showed `jumpToLatestButton.visible: true` while
  `transcriptScrollDebug.atBottom: true` and `distanceFromBottom` was `0-8px`.
- The scroll trace showed mode changes from `auto_follow` to `user_detached`
  from `scroll_decision` events even when there was no wheel or pointer intent.

## Principles

1. One owner per truth.
   - Backend owns process lifecycle, terminal close safety, and background
     terminal records.
   - Renderer owns only presentation state such as whether a monitor is open.
   - DOM geometry owns whether the transcript is scrollable, at bottom, or away
     from bottom.

2. User intent must be explicit.
   - Detach transcript follow only from a user action that actually moves away
     from the bottom.
   - Reattach when the user clicks jump-to-latest or scrolls back to the bottom.
   - Opening or closing a monitor is not the same thing as dismissing a terminal.

3. Do not hide unresolved state.
   - There should be no local "dismiss terminal" path.
   - If a terminal should not appear, the backend or surface model should stop
     classifying it as relevant.
   - If a terminal still needs action, the action must be a real backend action,
     not a renderer-only hide.

4. No compatibility layer.
   - Replace incorrect contracts in place.
   - Do not add backward-compatibility shims, legacy aliases, migrations,
     transitional adapters, dual paths, old-field support, or silent fallbacks.

## Target Product Contract

### Transcript Follow

The transcript has a small, explicit state machine:

- `auto_follow`: new transcript content should keep the bottom visible.
- `user_detached`: the user intentionally moved away from the bottom.

The state machine accepts only typed inputs:

- `content_changed`
- `programmatic_scroll_started`
- `programmatic_scroll_finished`
- `user_scroll`
- `jump_to_latest`
- `conversation_changed`
- `viewport_changed`

`user_detached` should only be entered when all of these are true:

- the event is caused by user scroll intent, not a programmatic scroll, browser
  scroll anchoring, virtualizer correction, layout shift, or DOM growth;
- the current transcript has scrollable overflow;
- the transcript is farther than the bottom threshold from the bottom.

`auto_follow` should be entered when any of these are true:

- the user clicks jump-to-latest;
- the user scrolls to the bottom;
- the transcript has no scrollable overflow;
- a new conversation is selected and its initial geometry is at bottom.

### Jump-To-Latest Button

The button is visible only when it can do useful work:

- transcript has scrollable overflow;
- transcript is not at bottom according to the same bottom classifier used by
  the follow state machine;
- follow state is `user_detached`.

The button must not be visible when the transcript fits in the viewport, when
`distanceFromBottom` is within the bottom threshold, or while auto-follow is
active.

### Background Terminal Footer

The footer is a live terminal monitor, not a historical notification center.

It should render for terminals that are currently actionable:

- `running`
- `terminating`

Exited terminals should not create a persistent footer. A successful exit can
briefly dwell only when the current surface observed the terminal transition
from active to exited. A nonzero exit can be represented in the transcript or
inside an already-open monitor while the user is looking at it, but it should
not become a persistent global `needs attention` footer after the terminal is no
longer running.

`lost` terminals need a product decision because they are not controllable. The
principled default is to treat them as historical terminal outcomes, not as
live monitor entries, unless a real backend action exists that can resolve the
lost state.

### Background Terminal Interaction

Remove terminal dismissal from the renderer.

The footer row should toggle the monitor:

- click closed footer: open monitor;
- click open footer: close monitor.

There should be no footer dismiss x button. Closing the monitor must only close
the monitor. It must not hide a terminal, alter terminal attention state, or
write to a local dismissed set.

If the monitor keeps a close affordance in its header, it must be equivalent to
clicking the open footer: close the monitor only. The simpler target is to
remove the close x and make the footer toggle the monitor.

### Terminal Pane Close

Use the backend-owned close safety plan in
`docs/plans/terminal-close-safety.md`.

The terminal pane should not decide from `running` or `starting` whether close
requires confirmation. The backend must assess whether close is safe,
destructive, or unknown, and the renderer should show confirmation only for the
backend-provided confirmation-required result.

## Implementation Plan

### 1. Replace Background Terminal Surface Semantics

Remove the local dismissed terminal model:

- delete `dismissedTerminalIds`;
- delete `dismissAttentionTerminals`;
- delete `addDismissedBackgroundTerminalIds`;
- delete footer dismiss action wiring;
- delete attention footer x rendering.

Replace `nextBackgroundTerminalSurfaceModel` with a model that separates live
monitor state from historical terminal outcomes:

- active surface: `running` or `terminating` terminals;
- completed dwell surface: successful exits observed from an active surface;
- no persistent attention surface for `exited` terminals;
- no renderer-local hidden terminal state.

Make footer click a toggle:

- closed monitor opens;
- open monitor closes;
- refresh can still happen on open, but close should not refresh just to hide
  state.

### 2. Define a Single Scroll Geometry Classifier

Create one helper that computes:

- `hasScrollableOverflow`;
- `distanceFromBottom`;
- `atBottom`;
- `awayFromBottom`.

Every scroll decision, button visibility decision, recorder snapshot, and test
assertion should use that classifier. Do not keep separate bottom checks with
different thresholds.

Use a named threshold such as `bottomEpsilonPx`, owned by the transcript scroll
module. It should absorb normal sub-pixel rounding, virtualizer measurement
settling, and tiny browser scroll anchoring corrections.

### 3. Make Follow State Intent-Based

Replace the current mode-change logic with an explicit transition reducer.

Programmatic scrolls should carry a token or counter so scroll events caused by
Setta's own `scrollToLatest` path cannot detach follow mode.

DOM growth, virtualizer range changes, and resize observations should not
produce user-detach transitions. They can update geometry and schedule a
follow scroll when mode is `auto_follow`.

Wheel, touch, pointer, keyboard, and scrollbar interactions should be
classified as user intent, but should detach only when the resulting geometry is
outside the bottom threshold.

### 4. Make Auto-Follow Stable Under Streaming

When in `auto_follow` and content changes:

- schedule a scroll to the latest row after the virtualizer has measured the
  new layout;
- verify the bottom classifier after the scroll;
- repeat on the next animation frame only while layout is still settling and
  the state remains `auto_follow`.

This is a bounded layout-stabilization loop, not polling. It runs only in
response to content/layout events.

### 5. Replace Terminal Close Contract

Implement `docs/plans/terminal-close-safety.md` as a separate but aligned
change:

- backend returns close safety assessment;
- renderer asks confirmation only for backend-required confirmation;
- safe idle terminal close removes the pane without waiting for the kill
  timeout.

## Non-Goals

- Do not keep a renderer terminal dismissal feature.
- Do not add persistence for dismissed terminal ids.
- Do not show a persistent footer for historical exited terminals.
- Do not infer terminal relevance from command text.
- Do not parse transcript text to infer scroll state.
- Do not add renderer polling.
- Do not keep old terminal close request or response shapes.
- Do not add migrations, compatibility aliases, transitional branches, or
  fallback support for old behavior.

## Verification

### Unit Tests

Background terminal surface model:

- running terminal shows footer;
- terminating terminal shows footer;
- exited zero terminal can dwell only after an observed active surface;
- exited nonzero terminal does not create a persistent attention footer;
- lost terminal does not create a live monitor footer unless a real backend
  action is introduced;
- closing the monitor does not alter terminal visibility or terminal ids;
- there is no dismiss action in the footer model.

Scroll reducer and geometry classifier:

- no overflow means at bottom and button hidden;
- distance within threshold means at bottom and button hidden;
- user scroll away from bottom enters `user_detached`;
- programmatic scroll events never enter `user_detached`;
- DOM growth while `auto_follow` schedules follow instead of detaching;
- user scroll back to bottom enters `auto_follow`;
- jump-to-latest enters `auto_follow`.

Terminal close:

- covered by `docs/plans/terminal-close-safety.md`.

### Deterministic Electron Workflow Tests

Use temporary app data and production Electron/main/preload/renderer/HTTP/store
paths.

Scroll workflow:

- open a conversation that fits in the viewport and assert no jump button;
- stream assistant output while at bottom and assert auto-follow remains active;
- assert the jump button stays hidden while `atBottom` is true;
- scroll away and assert the button appears;
- click jump-to-latest and assert the button disappears and follow resumes.

Background terminal workflow:

- create a conversation with a running background terminal and assert the footer
  appears;
- click footer and assert monitor opens;
- click footer again and assert monitor closes while footer remains correct for
  the running terminal;
- transition terminal to exited zero and assert dwell then disappearance;
- transition terminal to exited nonzero and assert no persistent footer after
  reload;
- assert there is no x button that dismisses terminal state.

Terminal close workflow:

- covered by `docs/plans/terminal-close-safety.md`.

### Recording Assertions

Keep the current recording fields until the scroll fix is verified:

- `distanceFromBottom`;
- `jumpToLatestButton.visible`;
- `transcriptScrollDebug.mode`;
- `transcriptScrollDebug.atBottom`;
- recent transition trace.

Add background terminal surface fields to recordings during implementation:

- footer visible;
- footer phase;
- monitor open;
- visible terminal ids and statuses.

After the fix, recordings should have no snapshots where:

- `jumpToLatestButton.visible` is true while `atBottom` is true;
- the footer phase is attention for an exited terminal that is no longer live;
- closing the monitor removes backend-returned terminal ids from the rendered
  model.

### Final Gates

For implementation changes:

- `./scripts/format.sh`
- `./check_quality.sh --git-changes`

Because this file is a plan-only documentation change, automated code gates are
not required beyond diff inspection.
