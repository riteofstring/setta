# C2 key bindings design record — creation chords and empty-space placement

Recorded with C2's fourth and last batch, which adds the bindings that create sections. The binding
model itself — chords, host replacement, conflict detection, per-platform labels, reserved gestures
— is unchanged and recorded in [C2 key bindings](c2-key-bindings.md). This batch adds the one thing
creation needs that no other binding does: a place to put the section when nobody pointed at one.

## What frozen main does

Main binds three creation shortcuts — `newCardShortcut` "N", `newGroupShortcut` "G", and
`newTerminalShortcut` "Ctrl + `" — to `addCallableSectionInEmptySpace`, `addGroupInEmptySpace`, and
`addTerminalInEmptySpace`. Each posts `CreateTopLevelSection` with a **null position**, the current
top-level layout, and the visible viewport bounds, and its backend
(`internal/projectstate/top_level_section_creation.go`) answers with both the resolved position and
an optional `panTo` the canvas centers on.

That backend search, which the package now owns, is:

1. **Prefer the visible pane.** Step a grid over the pane, in reading order, and take the first
   slot where the new section clears every existing top-level rectangle by 24px. The step is
   `min(width, height) / 3`, clamped to 20–80px, so a small section can use a small gap.
2. **Otherwise, beside the pane** — a band to its right, then a band below it.
3. **Otherwise, after the workspace** — a gap inside what the workspace already occupies, then a
   band to its right or below it, choosing whichever keeps the occupied area closest to square
   (`candidateAspectScore`), and finally past its right edge.
4. **A pane looking at empty space far from the workspace is skipped entirely**
   (`shouldUseCreateTopLevelSectionViewport`): the section joins the workspace instead of being
   stranded, and the canvas travels to it.

Sizes come from main's auto-layout sizing policy (`resolveAutoLayoutDimension`): a measured or
explicit dimension wins; an automatic one reserves the policy's minimum for that axis, never below

1. The pan target is the section's own middle, pushed out to at least its minimum width.

## What the package does

- **The placement search is ported whole**, with the package reading directly what main sends over
  the wire: the stored top-level layout with the canvas's own measurements written over it
  (`createTopLevelSectionLayoutDict`), and the pane rectangle in flow coordinates. The frozen
  reference's numbers travel with it — 24px padding, the 20–80px clamped grid step, the aspect
  choice, and the 200ms pan.
- **Sizes resolve through the package's own sizing policy**, which is the trimmed port of main's:
  `SECTION_SIZING_POLICY` for the generic minimum and the registered per-control minimums for
  direct-on-canvas kinds. An automatic width therefore reserves 200px and an automatic height
  reserves 1px, exactly what main's `max(1, MinWidth/MinHeight)` produces for a section type whose
  policy minimum is zero.
- **A section's size has one owner.** `resolveWorkspaceSectionSize` is the rule loading already
  used — the section's own size, then its kind's registered default, then the meta-control
  projection, then auto/auto — and creation now asks the same function before the section exists.
- **The creation operation is canonical.** Capability, the command's own disabled state, placement,
  insertion, and the travel run in one place for every surface that creates without a pointer.

## Package-only decisions

- **A creation command carries its own chord.** The package ships no creation commands — the
  catalog is host-registered — so there is no package default to port. A host writes `chord` beside
  the command's label, and the package treats it as a binding under the command's id: listed by
  `getWorkspaceKeyBindings`, rebound or unbound through `registerWorkspaceKeyBindings`, and
  conflict-checked against package operations and reserved gestures. Creation ids cannot contain
  the dot that every package binding id carries, so the two vocabularies cannot collide.
- **Registration order is explicit and fails loudly.** Registering a creation catalog revalidates
  the whole binding set before it takes effect, so a colliding chord — or a host rebinding left
  naming a command the new catalog drops — throws at registration instead of silently unbinding or
  failing at the keypress.
- **`WorkspaceCreationContext.workspacePosition` is now nullable.** A pane request carries the
  pointer's canvas position; a chord carries none. Rather than invent a position for the command to
  read, the context reports `null` and the package places the section after the command builds it.
  This is a public type change with no compatibility path, which is what the plan requires.
- **The pan is skipped, not deferred, before the zoom pane initializes.** A chord can reach
  creation that early; the section is still created and still becomes active, and the canvas simply
  has nowhere to travel — the same rule the focus bindings follow.
- **No retry loop.** Main retries on animation frames until its created node appears
  (`ensureSectionOnTop`) because its creation is a round trip. Package insertion publishes the
  document, the node geometry, and the active section in one atomic change, so the created section
  is already the single active, top-most section when the operation returns.
- **Creation does not move keyboard focus**, in either direction of invocation. The pane menu
  restores focus to where the menu was opened from, so a chord that focused the new section would
  make the two surfaces disagree. Both leave the created section active and selected, and the
  keyboard where it was.
- **The playground binds "N" and "G"** — main's own creation defaults — to its two host creation
  commands, so the acceptance gate can exercise a bare-letter creation chord, a rebinding, and a
  conflict against the package's own chords.

## Deliberate consequences for the acceptance gate

- A host catalog with chords adds bare-letter chords to the workspace. Under the accepted chord
  rules a bare letter stands down inside an editable target, so typing "n" in a parameter's text
  editor still types "n".
- A chord that creates suppresses the browser default; a chord that declines — structural editing
  off, or the command's own disabled state — hands the keypress back to the browser, the rule every
  command binding already follows.
- Creating from the keyboard makes the new section the single active section, so the Inspector
  follows it, and can move the canvas when the section could not be placed in view. The travel
  never changes the zoom level.
- The pane menu is unchanged: a right-click still creates exactly under the pointer, with no
  search and no travel.
- A section placed against measured geometry can still be overlapped later, because a section with
  an automatic dimension grows past the space reserved for it once it mounts. That is frozen main's
  behavior too.
