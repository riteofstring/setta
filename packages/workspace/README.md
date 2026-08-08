# `@setta/workspace`

Private blank-slate implementation of the standalone Setta workspace package.

The package exposes the versioned recursive `WorkspaceDocument`, strict parsing and validation,
controlled and uncontrolled React ownership, granular edit capabilities, `readOnly`, and a stable
controller ref. The canvas uses exact-pinned upstream XYFlow behind an internal adapter: root
sections are derived projections, live viewport and root-drag transforms remain transient, and one
completed viewport or root-movement gesture publishes one document change.

```tsx
const controller = useRef<WorkspaceController>(null);

const sectionDefinitions = [
  {
    kind: "note",
    displayName: "Note",
    defaultTitle: "Untitled note",
    defaultSize: { width: 280, height: 180 },
    creation: { group: "Basics", keywords: ["text", "memo"] },
    render: ({ data, appearance, readOnly }) => (
      <NoteEditor value={data} appearance={appearance} readOnly={readOnly} />
    ),
  },
] satisfies readonly SectionDefinition<NoteData>[];

<Workspace
  controllerRef={controller}
  document={document}
  sectionDefinitions={sectionDefinitions}
  sectionFactory={({ kind }) => ({
    id: allocateSectionId(kind),
    data: createSectionData(kind),
  })}
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
  selectionOptions={{ marqueeMode: "partial" }}
  validateExternalDrop={({ event }) =>
    event.dataTransferTypes.includes("application/x-example-note")
      ? { allowed: true, label: "Import note" }
      : { allowed: false, reason: "Only example notes can be dropped here." }
  }
  onExternalDrop={({ candidate, dataTransfer, position }) => {
    const note = dataTransfer.getData("application/x-example-note");
    importNote({ candidate, note, position });
  }}
  validateSectionTitle={async ({ sectionId, title }) => {
    const available = await titleService.isAvailable(sectionId, title);
    return available ? null : "Choose a different title. This title is unavailable.";
  }}
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

Every populated document kind must have one matching `sectionDefinitions` entry. Registrations are
validated before rendering: kinds must be unique, default dimensions and resize constraints must be
finite and compatible, content-sized axes must be enabled, child-layout defaults require a
container kind, and persisted lock/minimize/size/containment state must be supported by the matching
definition. Unknown kinds fail specifically rather than rendering guessed content.

Supplying `sectionFactory` enables the built-in Add section control and searchable section picker.
The factory owns stable ID allocation and host payload data; the package combines that result with
the registered title, size, chrome, and containment defaults. Right-clicking blank canvas space
opens the same picker at the pointer's workbench position, while toolbar creation uses deterministic
visible, non-overlapping smart placement with optional grid alignment. Search matches display name,
kind, group, and keywords. Escape restores the invoking control; accepted creation selects and
focuses the new frame without changing zoom. The same strict path is available through
`controller.createSection(kind, { position })`, where omitting `position` requests smart placement.

Supplying `onExternalDrop` enables the generic browser-drop boundary. During drag enter and
dragover, the package converts client coordinates into workbench coordinates and resolves the
deepest measured container that can accept children, falling back to the spatial canvas. The
request includes that candidate parent, its orientation-aware insertion index, the original
`DataTransfer`, a snapshot of MIME types and file count, modifier keys, and both client and
workbench positions. `validateExternalDrop` is an optional synchronous, side-effect-free preview
policy; without it, configured drops are allowed. Its labeled acceptance or specific rejection is
shown visually and announced without changing the document. `editStructure: false` rejects the
package-owned handoff before the host callback runs.

The final callback owns every semantic decision, including whether to call a controller command,
update controlled host state, reject the payload, or start asynchronous import work. Read custom
data or capture `File` references synchronously before the browser leaves the drop event, then pass
those values into asynchronous work. The package never detects file kinds, uploads data, accesses
the filesystem, or maps a payload to a section. Invalid drops are consumed without invoking the
host so the browser cannot navigate to a dropped file.

The package-owned frame supplies the visible title and section-kind label, then renders the host
component with `sectionId`, serialized `data`, resolved `light` or `dark` appearance, and the
resolved workbench `readOnly` state. Its content boundary automatically prevents inputs and
scrollable host content from starting viewport pan or wheel gestures. Headerless chrome retains an
accessible title, and minimized sections unmount the host body while retaining serialized data and
size state. Each root frame also exposes a native, named movement handle. Selected frames expose
package-owned lock, minimize, title, and style controls. Lock uses pressed-state semantics and the
layout capability; minimize uses expanded-state semantics and the presentation capability. A
section definition with `minimizable: false` omits the minimize control. Minimized roots measure as
compact chrome without changing their serialized fixed/content size modes or finite fallbacks, and
expansion restores focus and canonical sizing even when headerless chrome replaces the control
subtree. Controlled hosts that decline either proposal retain and announce the canonical state.
Title input is trimmed, rejects empty values, supports Enter to save and Escape to cancel, restores
focus, and keeps an asynchronously rejected proposal open with an associated error.
`validateSectionTitle` may perform host validation or persistence before the package commits one
`section-title` change.

Accent and tag choices are serialized section presentation. The default editor provides six
gamut-safe OKLCH choices plus reset; `sectionColorPalette` can replace those labeled choices with
other supported CSS colors. Accents derive only frame-local decorative chrome tokens, tags retain a
visible “Tagged” cue, and selection, focus, invalid, lock, and movement states keep their independent
semantic colors. Chrome, accent, and tag updates each use one `section-presentation` change. The
host renderer stays mounted but inert while the style panel covers it, preserving local host state.

Selection is package-owned transient state rather than part of `WorkspaceDocument`. Click a frame
or its named pressed button to select it, and Shift-click to toggle membership. Shift-drag from the
blank canvas to marquee-select measured frames; `selectionOptions.marqueeMode` chooses partial
intersection (the default) or full containment. Control/Command+A selects every section, Escape or
a blank-canvas click clears selection, and assistive announcements report the resulting state. A
measured viewport overlay outlines the normalized selection roots without making XYFlow selection
state public or canonical.

Drag a root section from its movement handle to arrange it spatially. Pointer updates stay inside
the adapter projection until release, then publish one `section-move` change without rewriting root
stacking order. The active root receives only a transient render lift. Focus the same handle and use
the arrow keys for equivalent keyboard movement: with snapping on, each press advances to the next
grid line; with snapping off, each press moves 10 workbench units. The handle is unavailable when
`editLayout` is false or the section is position-and-size locked. A controlled host that declines
the proposed document keeps the canonical position and the frame reconciles without retaining the
transient move.

Dragging or using the arrow keys on a selected top-level root moves the complete selected block and
preserves its relative workbench offsets. One completed block gesture still publishes one
`section-move` change. If any selected root is locked, block movement is disabled with specific
feedback; selection itself remains available and does not publish a document change.

Selected top-level roots expose logical inline-end, block-end, and corner resize controls according
to their registered `resize.axes` policy. The controls mirror in right-to-left layouts, retain
40-pixel desktop and 44-pixel coarse-pointer targets, and enforce registered minimums, maximums,
aspect-ratio preservation, the current canvas zoom, and optional grid snapping. Pointer updates stay
transient and one completed gesture publishes one `section-resize` change; detaching the canvas
cancels an active gesture without a document write. Arrow keys on a focused control use the same
constraints and snapping, or 10 workbench units when snapping is disabled. Locked and minimized
sections expose no active resize controls.

Width and height remain independent serialized `fixed` or `content` modes. Double-click a resize
control, or press Enter or Space while it is focused, to return every affected axis supported by
`contentSizing` to content mode. The finite serialized value remains a stable fallback. Starting a
later pointer or keyboard resize measures the rendered frame, promotes only the affected axes to
fixed mode, and applies the resize from that measurement. Live `ResizeObserver` measurements update
the shared geometry index but do not publish canonical document changes.

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

The default vertical toolbar provides Add section when a factory is registered, zoom in/out, reset
zoom, fit sections, snap-to-grid, and minimap visibility controls. `toolbarControls` adds
native-button host actions at the typed
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
deliberately returns that gesture family to the canvas. Set `preventExternalDrop` when a nested host
surface owns native drops itself; that opt-out does not change pan or wheel arbitration.

Unmounting the workspace cancels active transient viewport and root-movement gestures, releases its
persistent geometry observers and global listeners, rejects pending measurement subscriptions, and
leaves the accepted document unchanged for an exact later remount.

The controller's measured navigation helpers wait for visible frame geometry, propose one canonical
viewport change, and resolve after the upstream viewport reconciles to the host's current canonical
value. Accepted `focusSection` calls preserve the current zoom and move programmatic focus with
scroll prevention; focusing also replaces the current selection with the target section. Rejected or
superseded controlled proposals settle without moving stale focus.
`fitSection` and `fitSections` honor the configured zoom bounds, reserve a default chrome-safe
padding, and accept an optional non-negative padding value. Spatial next/previous navigation orders
roots by workbench `y`, then `x`, persistent order, and stable ID, with descendants following
canonical child order.

```tsx
await controller.current?.focusSection("details");
await controller.current?.fitSections(["summary", "details"], { padding: 0.16 });
await controller.current?.focusNextSection("summary");
controller.current?.selectSections(["summary", "details"]);
controller.current?.getSelectedSectionIds();
controller.current?.clearSelection();
controller.current?.createSection("note");
controller.current?.createSection("note", { position: { x: 120, y: 80 } });
controller.current?.setSectionTitle("details", "Details");
controller.current?.setSectionPresentation("details", {
  accentColor: "oklch(0.62 0.14 255)",
  chrome: "compact",
  tagColor: null,
});
```

Testing-only exports continue to exercise exact-pinned upstream XYFlow and dnd-kit behind
package-owned geometry, command, and interaction boundaries without making their types public.
