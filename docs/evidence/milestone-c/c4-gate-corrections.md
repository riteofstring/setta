# C4 gate corrections design record — press activation and physical viewport insets

Recorded after the fact for the two source changes the C4 live gate produced, and for the one
defect the post-acceptance milestone audit found in them. The command registry, bindings, and
toolbar contributions themselves are unchanged and recorded in the C1–C3 records.

- `c10e5c9da` — the zoom controls respond on press.
- `a371f749b` — the viewport reads the shell's physical pane insets.
- The audit correction below — a canvas the panes cover completely frames against itself instead of
  refusing.

## Zoom on press

The reference activates both zoom buttons on `click`
(`frontend/src/forks/xyflow/controls/Controls.tsx`). The package runs the same zoom on the primary
pointer's `pointerdown` instead, and the `click` that follows it does not repeat the zoom.

- **This is package behavior, not main parity.** Zooming is the one toolbar action a person repeats
  quickly, and waiting for the button release made the control feel unresponsive at the gate. The
  developer accepted the pressed activation there.
- **Only the two zoom controls press.** Fit view, reset zoom, snap to grid, the minimap controls,
  and every contributed control keep the button's standard click activation, because each of them
  is a single decision rather than a repeated nudge.
- **Keyboard and assistive technology keep the button's semantics.** A native activation arrives as
  a click with `detail` 0 and runs the zoom; a pointer activation arrives with `detail` 1 or more
  and is ignored, because the press already ran it. Nothing else about the control changes: it is
  still a `button`, still disabled at the configured zoom limit, and still named the same.

## Physical viewport insets

The shell paints its two pane regions over a full-size canvas, so the canvas store now carries the
edges they cover and every viewport consumer frames content against the area that is left.

- **This restores reference behavior at the package seam.** Frozen main subtracts its Overview and
  UI-editor rail widths in `getPaneRect`, adds `overviewTrueWidth` in `setCenter`, and translates
  the minimap by the rail width in `ResponsiveMiniMap`. Extraction had cut those offsets as
  application chrome and centered on the canvas wrapper alone; the gate showed what that costs —
  fit view framed sections behind the Outline pane and the minimap sat underneath it.
- **One physical inset contract replaces the application's two rail widths.** The shell owns
  `viewportInsets` and publishes them where it measures its panes; fit view, `setCenter`, focus
  travel, the minimap mask, empty-space placement, and edge auto-pan all read the same rectangle.
  Hosts do not set them, and the store resets them when the shell unmounts.
- **The insets are physical, so RTL is answered once.** The shell maps its leading and trailing
  panes onto left and right from the resolved writing direction. The reference is LTR-only.
- **The minimap stays beside the obstruction on its own side.** It translates by the inset on the
  side it is docked to, exactly as the reference does, including when that pushes it out of view
  behind a pane that covers the canvas — better than reappearing as a sliver inside the rail.

## Audit correction: a canvas the panes cover completely

A compact host's open pane spans the whole canvas between the two rails, and any host pane can be
toggled to full width. The insets then leave an empty rectangle, and the first implementation
raised `Cannot fit bounds without a visible workspace canvas area.` from there.

- **The failure was reachable from ordinary use.** At a 320 px host — the width this milestone's own
  gate covers — activating an Outline row threw before the section was selected or focused, because
  that is the path `focusWorkspaceSection` runs. The `Z` chord, a minimap click, and the travel a
  keyboard creation performs raise the same error from `setCenter`.
- **The insets are a framing preference, not a constraint.** When they leave no unobscured area
  there is nothing to frame against, so `getVisibleCanvasRect` answers with the canvas itself and
  every consumer travels as it did before the insets existed. The reference clamps the same
  situation to zero and never refuses.
- **The explicit failures that remain mean an unmeasured canvas.** `setCenter` and
  `getViewportForBounds` still refuse a canvas with no measurable bounds, which is the state
  `focusWorkspaceSection` already rejected by name, and fit view still declines there.

## Deliberate consequences for the accepted baseline

- Desktop framing is unchanged: with both panes open at 1512 px the visible rectangle is the same
  one the accepted captures show, so the locked baseline still describes the package.
- The compact host now travels the canvas behind its own pane instead of failing. Nothing is
  visible while the pane covers the canvas; closing it reveals the section the travel framed.
- Builds after this audit differ from the built-artifact hashes in
  [`computed/package-baseline-metrics.json`](computed/package-baseline-metrics.json), which remain
  the accepted commit's.
