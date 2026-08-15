# C2 key bindings design record — focus scopes and section navigation

Recorded with C2's third batch, which adds the bindings that move the keyboard rather than the
document: next and previous top-level section, and focus for each shell pane and the canvas. The
binding model itself — chords, host replacement, conflict detection, per-platform labels, reserved
gestures — is unchanged and recorded in [C2 key bindings](c2-key-bindings.md). The chords are
frozen main's shipped defaults: `Alt + J`, `Alt + K`, `Ctrl + Shift + 2`, `Ctrl + Shift + 3`, and
`Ctrl + Shift + 4`.

## The focus-scope seam

Frozen main tracks focus through a scope registry (`utils/focusManager.ts`): each pane and the
canvas register a root element, the registry remembers the element focus last reached inside each
one, and a shortcut asks a scope to take focus back. The package now has the same seam for the
surfaces its own chrome owns:

- **`leading-pane`, `canvas`, `trailing-pane`.** The shell pane region registers itself — rail
  included — and the canvas wrapper registers itself, exactly the roots the reference registers.
  The reference's fourth scope is the application header, which the package does not have.
- **The canvas offers its sections in layout reading order** (top to bottom, then left to right,
  then stacking order, then id), which is the reference's `getCanvasFocusableElements` and
  `getOrderedTopLevelSectionIds`. DOM order on the canvas follows the stacking order instead, so
  the two disagree as soon as sections are raised.
- **A scope remembers where focus was**, and forgets a remembered element once it unmounts, leaves
  the scope, or stops being focusable.
- The reference's cross-scope Tab roving is not part of this seam. It belongs to an application's
  pane composition, and `Tab` already carries the accepted parameter-indent binding.

## What the operations do

- **Next and previous top-level section** port the reference's `focusAdjacentTopLevelSection` and
  the `focusOnSection` it calls: from the section the keyboard is currently inside, move one step
  along the canvas reading order, make the target the single active section through the reference's
  `go-to` intent, and leave focus where a click on that section would leave it — on a group as a
  whole, and otherwise on a leaf's first control. From anywhere outside the canvas the move starts
  at the near end of the order. The canvas travels to the focused element with the reference's
  `movePaneToIncludeElement`: the smallest translation that clears the pane edges by 100px, and
  nothing at all when the element is already inside.
- **Pane and canvas focus** run the reference's `focusScope`: restore the scope's remembered
  element, or take its first offered control.

## Package-only decisions

- **`Ctrl + Shift + 1` ships unbound.** It is the reference's application-header chord and the
  package has no header, so the remaining three keep their reference positions — the leading pane
  answers to the Overview chord and the trailing pane to the UI-editor chord — rather than being
  renumbered from 1.
- **A closed pane hands focus to the tab that reopens it.** The package's closed pane keeps its
  rail visible and marks only the panel `inert`, so the scope's first offered control is the
  selected tab. The reference's Overview has no equivalent state.
- **Focusability is decided from explicit markers, not from measured geometry.** The reference asks
  for client rectangles; the package skips `disabled`, `aria-hidden="true"`, `inert`, and `hidden`
  subtrees, which are exactly the markers its own chrome sets, so the answer never depends on
  layout timing.
- **A live CodeMirror is remembered but never offered.** Focus genuinely reaches its contenteditable
  content element, so a scope remembers it; the offered list holds the idle control that owns the
  same value, which is the tab stop. This is the reference's own split. Because the idle control is
  a new element after each edit, a scope whose remembered editor has closed falls back to its first
  control rather than to that row.
- **A move that cannot land changes nothing.** The reference sets the active section and then
  focuses whatever mounted; the package resolves the target element first, so a section that has
  not mounted leaves selection, focus, and the viewport untouched and hands the chord back to the
  browser. This follows the accepted rule that an operation with nothing to act on declines.

## Deliberate consequences for the acceptance gate

- The workspace now answers to five chords it did not have: `Alt + J`, `Alt + K`,
  `Ctrl + Shift + 2`, `Ctrl + Shift + 3`, and `Ctrl + Shift + 4`. All are reference defaults and
  all are rebindable and conflict-checked.
- None of them is a native editing chord under the accepted chord rules, so — as in the reference —
  they run while typing and suppress the browser default. That is what makes them the way out of an
  editor: the keypress moves focus instead of inserting a character.
- `Alt + J` and `Alt + K` are pressed with the same Alt that holds the free parameter-drag gesture.
  Adding a letter to the held set ends that gesture before the move runs, which is the accepted
  exact-pressed-set rule and not a new interaction.
- Walking to a section makes it the single active section, so the Inspector follows the keyboard.
  The move stops at both ends of the order instead of wrapping.
- Focusing a section can scroll the canvas. The travel is the reference's minimum-distance
  translation and never changes the zoom level.

## Remaining C2 work

Section creation is the last C2 group, and it landed in the next batch with the empty-space
placement contract it needed:
[C2 creation chords and empty-space placement](c2-creation-bindings.md).
