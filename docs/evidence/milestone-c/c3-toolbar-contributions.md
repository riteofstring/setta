# C3 design record — host toolbar contributions

Recorded with C3, which lets a host place its own controls in the viewport toolbar. The commands
those controls run are unchanged: the command registry from [C1](c1-command-registry.md) and the
creation catalog whose pointerless placement [C2's fourth batch](c2-creation-bindings.md) ported.
This batch adds where a host command appears, not what it does.

## What frozen main does

Main's toolbar (`forks/xyflow/controls/Controls.tsx`) renders four groups top to bottom: its edge
toggles, its viewport controls, its minimap controls, and — interleaved between them — plugin
canvas controls at three placements from its plugin runtime (`Project` before the viewport group,
`Viewport` and `Utility` after it and before the minimap group).

- **A contributed control is an opaque mount.** `PluginCanvasControlRendererHost` gives the plugin
  a `div` and calls `renderer.mount/update/unmount` on it with the plugin id, control id, label,
  placement, server mode, and effective capabilities. The plugin paints whatever it wants inside a
  24 px `nodrag nopan nowheel` box, and main attaches its floating-box tooltip from
  `description ?? label`.
- **Each non-empty contributed group is closed by a rule.** `PluginCanvasControls` renders its
  controls and then one `ControlsDivider`; an empty placement renders nothing at all, divider
  included. Main's own groups have no rule between them.
- **The toolbar is memoized** (`export default memo(Controls)`), because a contributed control
  updates itself through the plugin runtime rather than through main's render.

## What the package does

- **The divider rule is ported exactly.** A non-empty contributed group is followed by the
  reference's rule, an empty one renders nothing, and the package's own viewport and minimap groups
  still have no rule between them — the accepted toolbar with no contributions is byte-identical.
- **The package paints the control.** A contribution supplies an icon and names a command; the
  package renders the toolbar's own button class, compact touch target, focus ring, 15 px icon box,
  tooltip, accessible name from the command's label, and pressed state from the command's checked
  state. A host cannot produce a control that is visually or behaviorally unlike the accepted
  toolbar, and no plugin runtime, imperative mount, XYFlow `Panel`, or package store is exposed.
- **Contributions are a registration, atomically replaced**, like commands, creation commands, key
  bindings, section kinds, and item handlers. Unknown ids, a command that does not offer the
  toolbar surface, a repeated command, an unknown placement, a missing icon, and a blank
  description all fail at registration.
- **Neither command registry can strand a control.** Registering commands or a creation catalog
  revalidates the standing contributions against the catalog that is about to take effect and
  throws before it applies, the same rule the key bindings already follow.

## Package-only decisions

- **Two placements, not the reference's three.** `before-viewport` and `before-minimap` name the
  package group each contributed group precedes, so the order survives direction and orientation.
  Two of the reference's three bands are adjacent with no control of its own between them; keeping
  both would only add a second rule between contributed controls.
- **A contribution names a command in either public vocabulary.** `kind: "command"` names a
  pane-scope command that lists the new `toolbar` surface; `kind: "creation"` names a creation
  command. The kind is explicit rather than resolved by search, so a host that reuses one id in
  both vocabularies still gets the control it asked for. Section and item commands have no target
  on the toolbar and cannot be contributed.
- **`WorkspacePaneCommandContext.workspacePosition` is now nullable.** A pane menu opens at a
  point; a toolbar control acts from a fixed place on the shell that means nothing in canvas
  coordinates. It reports `null` rather than inventing a position, exactly as
  `WorkspaceCreationContext` already does for a chord. This is a public type change with no
  compatibility path. The pane menu keeps its own non-null pointer position on its invocation, so
  its creation entries still create exactly where they were asked to.
- **A creation control creates in empty space.** It runs the same canonical operation as the
  creation chord: the package resolves the placement, inserts, and travels to the section when it
  had to land out of sight. The pane menu is unchanged.
- **`isChecked` moved from package commands to every command.** A toolbar built from toggles needs
  the toggle state, and the state belongs to the command so that a menu and the toolbar agree.
  `isApplicable` stays package-only: a host command is always offered on the surfaces it declares,
  so a contributed control keeps its place in the column instead of appearing and vanishing, and
  applicability never runs host code for a surface nobody opened.
- **A refusing control stays focusable.** The package's own zoom controls stop at the zoom limits
  with nothing to say and keep the reference's real `disabled`. A command that refuses has a
  sentence, so a contributed control refuses through `aria-disabled`, keeps the reference's 0.4
  disabled opacity, names its reason through `aria-describedby`, and shows the same sentence in the
  tooltip that the menus attach to their items.
- **A creation control explains a disabled state no more than the pane menu does.** The creation
  catalog is a list of sections to make, not actions over workspace state, and it has no
  disabled-reason vocabulary on any surface.
- **The toolbar is no longer memoized.** The reference can memoize because its contributed controls
  update themselves; the package paints contributed controls from host-owned command state, so the
  toolbar re-renders with the host's tree exactly as the panes, the Outline, the Inspector, and the
  canvas already do. Package state changes still repaint it through the same command-state
  subscription every other command surface uses.
- **The toolbar does not announce a command's status message.** Like the menus, and unlike the
  Inspector's action rows, it has no live region of its own; the toolbar's existing status region
  belongs to the zoom level.

## Deliberate consequences for the acceptance gate

- The playground contributes three controls: "Host note" creation above the zoom group, and a
  highlight toggle plus "Clear host action status" between the zoom and minimap groups. The toggle
  is also in the pane menu, where it paints as a checked item; the clear action refuses with its
  sentence until a host action has published a status. The packed-consumer fixture contributes the
  packed note creation control, so the public entry is exercised from the tarball too.
- A host toggle repaints when the host's own state change re-renders the workspace, which is what
  the playground's readout subscription already does. A host that mutates command state outside
  React will not see the control repaint until something else re-renders it.
- The toolbar column still clips rather than scrolls when it outgrows the canvas, exactly as the
  reference's does. A host contributing many controls into a short canvas loses the bottom of the
  column.
- Contributed controls join the toolbar's tab order in placement order, between the package groups
  they precede.
