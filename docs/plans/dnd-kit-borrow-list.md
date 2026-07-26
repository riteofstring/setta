# dnd-kit: What to Borrow (Not Migrate To)

Date: 2026-06-26

## Decision

Keep Setta's bespoke workspace pane drag-and-drop. Do not migrate to dnd-kit.

Verified against `@dnd-kit/dom@0.5.0` source (reference checkout, commit
`64598506`): to make dnd-kit safe in the niri host-pool architecture you must
disable nearly everything it provides — `feedback: "none"`, no Sortable, custom
collision, AutoScroller off. Crucially, `feedback: "none"` returns *before*
dnd-kit sets the source drag shape (`Feedback.ts:144-151`, `:399-400`), so its
collision detection can't target the source either — you are committed to
Setta's own `paneDropTargetFromPointer` geometry regardless. What remains is
pointer plumbing plus a per-move reactive layer the bespoke path does not pay.
The hard part — pane / column / plane drop intent — stays bespoke under every
option.

The bespoke system is already at the performance floor: zero React commits
during drag, one coalesced preview update + one clear per drag. The
`PaneDropIntent` / `previewPaneDropIntent` / `applyPaneDropIntent` boundary keeps
the interaction layer swappable, so this decision is cheap to revisit if a real
second use-case for a shared DOM drag substrate ever appears. (The Pixi workflow
graph is canvas and stays separate, so it can never share that substrate — name
the concrete future DOM drag interactions before reconsidering.) If dnd-kit is
ever adopted, prove it on a trivial DOM-list interaction first; panes are the
last thing it should touch, never the first.

## Borrow (patterns, not the dependency)

Ranked by value. File references point into the dnd-kit reference checkout.

1. **Accessibility announcements — the one real capability gap.**
   `Accessibility.ts`, `LiveRegion.ts`, `HiddenText.ts`. An `aria-live` region, a
   "picked up / now over / dropped / canceled" announcement vocabulary, and a
   visually-hidden instructions node. Copy the *shape* and wire it to the
   existing `PaneDropIntent` transitions if/when a11y is wanted. (Keyboard pane
   movement already exists as shift-arrow; this is about screen-reader support.)

2. **Activation-constraints model.** `PointerSensor.ts:44-72` — distance-or-delay
   constraints with per-input-type defaults (mouse-on-handle activates
   immediately, touch `Delay(250, 5)`, pen / text-input delayed). Upgrades a flat
   threshold and gives sane touch/pen behavior cheaply.

3. **`preventActivation` for interactive descendants.**
   `PointerSensor.ts:73-86` — never arm a drag when the `pointerdown` lands on a
   button / input / link inside the pane chrome.

4. **Cancel-path checklist.** dnd-kit cancels on Escape
   (`PointerSensor.ts:309-314`), `pointercancel`, a competing native `dragstart`
   (`:239-244`), and window-resize-during-keyboard-drag (Feedback registers
   resize → `stop`). Audit the bespoke drag session against this set — the
   native-`dragstart` and resize cases are easy to miss.

## Leave behind

The reactive graph (per-move signal/effect churn), Feedback's transform/DOM
mutation, collision detection, Sortable / `OptimisticSortingPlugin`, and the
always-on `Scroller` / `ScrollListener` (not removable via the `plugins` option).
