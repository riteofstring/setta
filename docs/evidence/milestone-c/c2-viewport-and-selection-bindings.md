# C2 key bindings design record — viewport and selection operations

Recorded with C2's second batch, which adds the bindings for what the canvas shows and what is
selected on it: fit view, zoom in, zoom out, reset zoom, zoom to the pointer, select all, and
select the top-level non-group sections. The binding model itself — chords, host replacement,
conflict detection, per-platform labels, reserved gestures — is unchanged and recorded in
[C2 key bindings](c2-key-bindings.md). The chords are frozen main's shipped defaults: `F`,
`Equal`, `Minus`, `Mod + Comma`, `Z`, `Mod + A`, and `Mod + Shift + A`.

## What the operations do

- **The viewport operations already existed** behind the accepted toolbar: fit view, zoom in, zoom
  out, and reset zoom are the same functions its buttons call, so a chord and a button produce one
  result. Zoom to the pointer is new to the package and ports the reference's
  `zoomToMouseLocation`: re-center on the pointer at the default zoom level, snapping the same way
  every other screen-to-flow conversion does.
- **Select all is the reference's two-branch action.** With exactly one active section the chord
  selects that section's parameters; otherwise it selects every section, nested ones included.
- **Select top-level non-group sections** commits the reference's companion action: every top-level
  section that is not a group, so the selection carries the workspace's own sections without the
  containers around them.

## Package-only decisions

- **The single-section branch of select-all is package behavior.** The reference declares it and
  never finished it — it resolves the visible parameter ids and logs them behind a `TODO`. The
  package selects those rows for real, in canonical tree order, over exactly the rows the section
  is showing: a row hidden by the B2 filter is left out and so is its whole subtree, which is the
  membership the rendered list views already resolve for drag and keyboard movement. This is not
  main parity and is open for developer judgement at the C4 gate.
- **An operation with nothing to act on hands its chord back**, the rule the command bindings
  already follow. `Mod + A` returns to the browser when the single active section has no
  parameters to select or has not mounted a list view; the viewport chords return to the browser
  before the zoom pane initializes. The reference suppresses the browser default for every chord
  it recognizes.
- **A zoom chord stops where the toolbar's button stops.** The toolbar disables zoom in and zoom
  out at the configured zoom limits, so the chords decline there too rather than relying on the
  zoom runtime to clamp silently. Fit view declines on an already-fit canvas, which is what its
  active toolbar button does when it is pressed again.
- **Zoom to the pointer declines until there is a pointer.** The reference seeds its pointer at the
  client origin and will re-center there before the pointer has ever moved. The package tracks the
  pointer only while a canvas is mounted, forgets it on unmount, and declines while it has none.
- **Selecting every section keeps the reference's membership**, including sections nested inside
  groups, and the empty result of the top-level action clears the selection exactly as the
  reference commits it.

## Deliberate consequences for the acceptance gate

- The workspace now answers to seven chords it did not have: `F`, `Equal`, `Minus`, `Mod + Comma`,
  `Z`, `Mod + A`, and `Mod + Shift + A`. All are reference defaults and all are rebindable.
- `F`, `Z`, `Equal`, and `Minus` are bare keys: they stand down inside any editor and never take
  the browser's default. `Q + F` still freezes quick info rather than fitting the view, because the
  held gesture owns the whole pressed-key set.
- `Mod + A` stands down inside an editor so the caret keeps its select-all. `Mod + Shift + A` and
  `Mod + Comma` are not native editing chords on either platform, so — as in the reference — they
  run while typing and suppress the browser default.
- Selecting all parameters of one section is a single document notification, and it leaves the
  active section selection alone.

## Remaining C2 work

Section creation, next and previous top-level section, and pane/Outline focus need package
operations that do not exist yet: an empty-space placement contract for creation, and a focus-scope
seam for the two navigation groups. They land in the next C2 batch with their reference chords
(`N`, `G`, `Alt + J`, `Alt + K`, and `Ctrl + Shift + 1`–`4`).
