# `@setta/workspace`

Private blank-slate implementation of the standalone Setta workspace package.

The package exposes the versioned recursive `WorkspaceDocument`, strict parsing and validation,
controlled and uncontrolled React ownership, granular edit capabilities, `readOnly`, and a stable
controller ref. The Phase 1 canvas shell uses exact-pinned upstream XYFlow behind an internal
adapter: root sections are derived projections, live viewport transforms remain transient, and one
completed viewport gesture publishes one document change.

```tsx
const controller = useRef<WorkspaceController>(null);

<Workspace
  controllerRef={controller}
  document={document}
  onDocumentChange={(nextDocument, change) => {
    setDocument(nextDocument);
    console.log(change.reason);
  }}
  capabilities={{ editStructure: canEditStructure }}
  appearanceOptions={{ appearance: "system" }}
  gestureOptions={{
    minZoom: 0.5,
    maxZoom: 2,
    panOnScroll: true,
    zoomOnScroll: false,
  }}
  gridOptions={{
    visible: true,
    snap: true,
    spacing: [24, 24],
    pattern: "dots",
    markSize: 1,
  }}
  minimapOptions={{ placement: "right", visible: true }}
  toolbarControls={[
    {
      id: "open-inspector",
      placement: "utility",
      label: "Open inspector",
      icon: <InspectorIcon />,
      onPress: (workspaceController) => openInspector(workspaceController),
    },
  ]}
  overlaySlots={{
    project: (workspaceController) => <ProjectPicker controller={workspaceController} />,
  }}
/>;
```

Use `defaultDocument` instead of `document` for uncontrolled ownership. The two modes are mutually
exclusive, and a controlled workspace requires `onDocumentChange`. `readOnly` disables package-owned
layout, structure, and presentation edits while viewport navigation and arbitrary host-rendered
content remain available.

`gestureOptions` configures pan-on-drag, pan-on-scroll, wheel, pinch, double-click zoom, zoom bounds,
scroll direction and speed, and temporary activation keys without exposing XYFlow types. The
document viewport must be inside the configured bounds so a valid persisted viewport restores
exactly instead of being silently clamped. Temporary wheel zoom remains available when ordinary
wheel zoom is disabled, and the adapter coordinates native scrolling with the active wheel policy.

`gridOptions` keeps grid visibility and spatial snapping independent while sharing one two-axis
spacing in workbench units. Dot, line, and cross backgrounds stay phased with the viewport across
pan, zoom, and negative coordinates. Snapping can remain enabled while the decorative grid is
hidden, and showing the grid does not require snapping.

`appearanceOptions` selects scoped `light`, `dark`, or live `system` appearance and accepts partial
light/dark overrides for the documented semantic tokens. The workbench sets its own `color-scheme`
and CSS custom properties without changing the host document element, global classes, viewport,
document, or host-rendered state. Default palette values are gamut-safe OKLCH colors with distinct
roles for canvas, grid, section surfaces and text, toolbar, minimap, selection, focus, and invalid
states.

The default vertical toolbar provides zoom in/out, reset zoom, fit sections, snap-to-grid, and
minimap visibility controls. `toolbarControls` adds native-button host actions at the typed
`project`, `viewport`, or `utility` placement; every action receives only the public controller.
Control IDs must be unique and cannot replace a built-in ID. Icons are decorative, noninteractive
React nodes, while `label`, `pressed`, and `disabled` provide the control's accessible contract.

`overlaySlots` supplies richer `project`, `viewport`, `utility`, or transformed `canvas` content.
Every slot is a render function that receives the same public controller. Fixed slots and the
toolbar isolate their pointer and wheel input from the viewport; transformed canvas content can use
`WorkspaceInteractionBoundary` for the same isolation. Direct `Workspace` children are not an
overlay API.

The minimap is visible on the right by default and can be placed on either physical side.
`gridOptions.snap` and `minimapOptions.visible` are locally toggleable when their change callback is
omitted. Supplying `onGridSnapChange` or `onMinimapVisibilityChange` makes that preference
controlled; keep the corresponding option and callback ownership mode stable for the mount.

Wrap interactive or scrollable content rendered inside the canvas with
`WorkspaceInteractionBoundary`. It independently suppresses canvas panning and wheel handling while
leaving the host control usable; consumers do not need to know the adapter's internal marker class
names. The transformed canvas-slot wrapper is neutral, so setting either boundary option to `false`
deliberately returns that gesture family to the canvas.

Unmounting the workspace cancels an active transient viewport gesture, releases its persistent
geometry observers and global listeners, rejects pending measurement subscriptions, and leaves the
accepted document viewport unchanged for an exact later remount.

The controller's measured navigation helpers wait for visible frame geometry, propose one canonical
viewport change, and resolve after the upstream viewport reconciles to the host's current canonical
value. Accepted `focusSection` calls preserve the current zoom and move programmatic focus with
scroll prevention; rejected or superseded controlled proposals settle without moving stale focus.
`fitSection` and `fitSections` honor the configured zoom bounds, reserve a default chrome-safe
padding, and accept an optional non-negative padding value. Spatial next/previous navigation orders
roots by workbench `y`, then `x`, persistent order, and stable ID, with descendants following
canonical child order.

```tsx
await controller.current?.focusSection("details");
await controller.current?.fitSections(["summary", "details"], { padding: 0.16 });
await controller.current?.focusNextSection("summary");
```

Testing-only exports continue to exercise exact-pinned upstream XYFlow and dnd-kit behind
package-owned geometry, command, and interaction boundaries without making their types public.
