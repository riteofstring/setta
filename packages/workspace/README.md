# `@setta/workspace`

A nested spatial workbench for React with pannable top-level sections, recursive ordered
containers, and host-defined sortable item trees.

The package is private and locally installable while distribution, repository hosting, licensing,
and release policy remain undecided. It requires React 19.2.8 and React DOM 19.2.8 as exact peer
dependencies.

## Install and import

Use a workspace dependency while developing in the same pnpm workspace, or install the locally
packed tarball into an unrelated application. Registry installation is intentionally unavailable.

```json
{
  "dependencies": {
    "@setta/workspace": "workspace:*"
  }
}
```

Import code from the root convenience entry point or from the narrower subpaths. Import the CSS
entry point once in the consuming application.

```tsx
import { Workspace } from "@setta/workspace/react";
import "@setta/workspace/styles.css";
```

| Entry point                   | Purpose                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `@setta/workspace`            | Convenience union of the framework-neutral and React runtime surfaces.                    |
| `@setta/workspace/core`       | Documents, validation, planning, policies, and immutable helpers.                         |
| `@setta/workspace/react`      | Workspaces, outline navigation, detachable windows, sortable trees, and React boundaries. |
| `@setta/workspace/testing`    | Testing helpers and deterministic adapter evidence.                                       |
| `@setta/workspace/styles.css` | Required package-owned styles and scoped theme tokens.                                    |

Source aliases and undeclared package internals are not consumer APIs.

## Developer guides

The locally packed artifact includes focused guides for the package's permanent host boundaries:

- [Host integration](docs/integration.md): documents, persistence, capabilities, controller
  commands, extensions, outline navigation, generic edges and ports, creation, clipboard adapters,
  detachable windows, selection, grouping, stacking, minimap, history, and external drops.
- [Recursive sections](docs/recursive-sections.md): containment, movement modes, orientation,
  locking, minimizing, sizing, overflow, snapping, chrome, accents, and tags.
- [Sortable item trees](docs/sortable-item-trees.md): controlled item data, named and filtered
  lists, canonical reconciliation, selection, pointer/touch/keyboard movement, zoom, and
  persistence.
- [Theming](docs/theming.md): required CSS, scoped appearance, semantic tokens, grid styling, and
  host-renderer colors.
- [Accessibility and keyboard](docs/accessibility-and-keyboard.md): complete keyboard tables,
  focus, announcements, host responsibilities, zoom/reflow, touch, RTL, and reduced motion.
- [Verification and support](docs/verification-and-support.md): browser policy, performance
  guidance, local gates, supply-chain policy, attribution, deferred capabilities, and non-goals.

The [guide index](docs/README.md) provides a shorter route by task. Generated declarations remain
the exact API source of truth.

## Five-minute uncontrolled example

Give the workbench a sized parent, register at least one host renderer, and provide a factory when
users should be able to create sections. Omitting both `document` and `defaultDocument` selects
uncontrolled ownership with an empty versioned document.

```tsx
import { createRoot } from "react-dom/client";
import { Workspace, type SectionDefinition, type SectionRenderProps } from "@setta/workspace/react";
import "@setta/workspace/styles.css";

type NoteData = Readonly<{ body: string }>;

function NoteSection({ data }: SectionRenderProps<NoteData>) {
  return <p>{data.body}</p>;
}

const noteDefinitions = [
  {
    kind: "note",
    displayName: "Note",
    defaultTitle: "Untitled note",
    defaultSize: { width: 280, height: 180 },
    creation: { group: "Basics", keywords: ["text", "memo"] },
    render: NoteSection,
  },
] satisfies readonly SectionDefinition<NoteData>[];

let nextSectionNumber = 1;

function App() {
  return (
    <main style={{ height: "100dvh" }}>
      <Workspace<NoteData>
        ariaLabel="Notes workspace"
        sectionDefinitions={noteDefinitions}
        sectionFactory={() => ({
          data: { body: "Write something useful." },
          id: `note-${nextSectionNumber++}`,
        })}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
```

The built-in Add section control now creates, selects, and focuses a smart-placed note. The host
still owns the note payload and any operation that changes it.

## Controlled example

Controlled ownership requires both `document` and `onDocumentChange`. The generic empty-document
factory preserves the host payload type without a cast.

```tsx
import { useState } from "react";
import { createEmptyWorkspaceDocument, type WorkspaceDocument } from "@setta/workspace/core";
import { Workspace } from "@setta/workspace/react";

function ControlledNotesWorkspace() {
  const [document, setDocument] = useState<WorkspaceDocument<NoteData>>(() =>
    createEmptyWorkspaceDocument<NoteData>(),
  );

  return (
    <Workspace
      document={document}
      onDocumentChange={(nextDocument) => setDocument(nextDocument)}
      sectionDefinitions={noteDefinitions}
      sectionFactory={() => ({
        data: { body: "Controlled by the host." },
        id: `note-${nextSectionNumber++}`,
      })}
    />
  );
}
```

The callback receives one immutable document proposal and one compact change reason per committed
package action. Persist or reject that proposal in the host; pointer previews, selection, and live
measurements do not produce per-frame document changes.

## Integrated controlled configuration

The following composition shows the main host extension points together. Application-specific
renderers, ID allocation, persistence, and policies remain host-owned.

```tsx
const controller = useRef<WorkspaceController<NoteData>>(null);

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
  {
    kind: "group",
    displayName: "Section group",
    defaultTitle: "Group",
    defaultSize: { width: 480, height: 360 },
    defaultSizeMode: { width: "fixed", height: "content" },
    canContainSections: true,
    defaultChildOrientation: "vertical",
    render: ({ data }) => <GroupSummary value={data} />,
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
  groupFactory={({ sectionIds }) => ({
    id: allocateSectionId("group"),
    kind: "group",
    title: `Group (${sectionIds.length} sections)`,
    data: createGroupData(sectionIds),
  })}
  onDocumentChange={(nextDocument, change) => {
    setDocument(nextDocument);
    console.log(change.reason);
  }}
  capabilities={{ editStructure: canEditStructure }}
  appearanceOptions={{ appearance: "system" }}
  clipboardAdapter={clipboardAdapter}
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
  sectionMoveMode="sort"
  validateSectionMove={({ plan }) =>
    plan.destinationParentId === reservedSectionId
      ? { allowed: false, reason: "This container is reserved for generated sections." }
      : { allowed: true }
  }
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

## Section registry and creation

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
If a controlled host declines a creation proposal, the picker restores its invoking control,
announces the retained canonical document, and clears the deferred selection/focus request.

### External drops

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

## Section frame, title, and presentation

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
`section-title` change. A controlled host that declines the resulting title proposal keeps the
editor open with a specific error instead of reporting success against unchanged canonical state.

## Detachable sections

Set `detachable: true` on an eligible `SectionDefinition`, then wrap the workbench in
`WorkspaceDetachmentProvider`. The package opens a same-origin `about:blank` window directly from
the built-in button's user gesture and portals the existing renderer into it. React context,
controlled document ownership, renderer data, title changes, resolved appearance, and read-only
state therefore remain live rather than creating a second workspace.

```tsx
import { Workspace, WorkspaceDetachmentProvider } from "@setta/workspace/react";

<WorkspaceDetachmentProvider
  getInitialWindowBounds={({ sectionId }) => savedWindowBounds.get(sectionId)}
  onWindowChange={({ bounds, open, sectionId }) => {
    saveWindowPreference(sectionId, { bounds, open });
  }}
  renderWindowHead={({ kind }) =>
    kind === "note" ? <meta content="note" name="application-section-kind" /> : null
  }
  validateDetachment={({ kind }) =>
    kind === "note"
      ? { allowed: true }
      : { allowed: false, reason: "This section must stay in the workspace." }
  }
>
  <Workspace sectionDefinitions={sectionDefinitions} />
</WorkspaceDetachmentProvider>;
```

The docked frame keeps a measured placeholder with Focus window and Redock section actions. The
detached window receives package metadata, styles, current theme tokens, an accessible title, and
an explicit Return to workspace action; `renderWindowHead` lets the host add only the metadata or
styles its renderer needs. Popup rejection is announced with recovery guidance. Closing,
reloading, navigating away, losing the live opener, minimizing, deleting, or unmounting the section
redocks or releases it predictably and restores focus when its original control survives.

Window bounds and open state are host preferences reported through `onWindowChange`; they never
enter `WorkspaceDocument` or history. Cross-window dragging is intentionally absent. A detached
section, selected ancestor, or selected descendant must be redocked before package movement,
grouping, ungrouping, or resizing can change its container or geometry.

## Sortable item trees

Host renderers can place a controlled `SortableItemTree` or `SortableItemLists` surface inside a
section without exposing item data to `WorkspaceDocument`. The package owns native selection and
movement controls, normalized selected-root movement, pointer/touch/keyboard feedback, focus
restoration, cycle prevention, and atomic move plans; the host owns item values, labels,
containment policy, persistence, and whether an accepted move participates in host history.

```tsx
<SortableItemTree
  ariaLabel="Profile fields"
  tree={fieldTree}
  selectedItemIds={selectedFieldIds}
  onSelectedItemIdsChange={setSelectedFieldIds}
  getItemLabel={(itemId) => fields[itemId].label}
  renderItem={(itemId) => <FieldEditor field={fields[itemId]} />}
  canContainChildren={(itemId) => fields[itemId].type === "group"}
  canMove={(plan) => hostPolicyAllows(plan)}
  onMove={(plan) => setFieldTree((tree) => applySortableItemMove(tree, plan))}
/>
```

Use one `SortableItemLists` owner when a section contains multiple named lists and items may move
between them:

```tsx
<SortableItemLists
  ariaLabel="Profile field lists"
  lists={fieldLists}
  selectedItemIds={selectedFieldIds}
  onSelectedItemIdsChange={setSelectedFieldIds}
  getItemLabel={(itemId) => fields[itemId].label}
  renderItem={(itemId) => <FieldEditor field={fields[itemId]} />}
  canContainChildren={(itemId) => fields[itemId].type === "group"}
  canMove={(plan) => hostPolicyAllows(plan)}
  onMove={(plan) => setFieldLists((lists) => applySortableItemListMove(lists, plan))}
/>
```

Each list supplies a stable `listId`, visible `label`, and its own `SortableItemTree`. Item IDs are
unique across the complete list set. Public cross-list plans include both source and destination
list IDs, so root parent IDs remain scoped to their list and internal aggregation IDs never reach
the host.

`canContainChildren` and `canMove` are synchronous, side-effect-free policies. Every item that
already owns children must be accepted by `canContainChildren`; the component rejects an
inconsistent controlled tree instead of hiding that item's descendants.

Click a named selection button to replace selection; Control/Command/Shift-click toggles an item.
Dragging an unselected handle moves only that item. Dragging a selected handle moves normalized
selection roots in canonical tree order, even when they begin under different parents or named
lists. The active normalized root anchors the first keyboard direction. Focus a handle and press
Enter or Space to start,
Up/Down to reorder, logical forward to indent, logical backward to outdent, Enter or Space to
commit, or Escape to cancel. In `SortableItemLists`, Page Up or Page Down moves the active block to
the previous or next named list; horizontal commands never escape the current list root. Logical
horizontal commands mirror in right-to-left layouts. The placeholder is measured in workbench
units from the captured client rectangle and zoom, while the portal overlay retains client-pixel
geometry. Item ownership disables section and viewport activators until completion or
cancellation. Inputs in `renderItem` remain editable because only the explicit item handle starts
movement.

`applySortableItemMove` validates the accepted post-removal destination index, exact shared source
parent, canonical item order, known parents, and cycles before returning a new serializable tree.
It returns the original tree for a no-op and preserves unaffected host arrays. The callback is the
only item mutation boundary: the package never writes item data to the workspace document unless
the host explicitly stores the returned tree in a section payload.

`applySortableItemListMove` performs the same strict revalidation for list-aware plans. A moved
item carries its complete descendant subtree, cross-list moves update both affected trees in one
result, and untouched list objects and tree arrays retain their identities.

Pass an ancestry-closed `visibleItemIds` array to either React surface when the host renders a
filtered view. Movement feedback uses visible positions, while `canMove` and `onMove` receive a
plan reconciled to the complete canonical tree. Hidden items retain relative order and hidden
descendants move with their visible subtree root. The framework-neutral
`createFilteredSortableItemTree` and `reconcileFilteredSortableItemMove` helpers expose the same
projection and canonical-anchor rules outside React. The host owns query input, result-count
announcements, clearing hidden selection, and transient filter persistence.

## Section selection and movement

Accent and tag choices are serialized section presentation. The default editor provides six
gamut-safe OKLCH choices plus reset; `sectionColorPalette` can replace those labeled choices with
other supported CSS colors. Accents derive only frame-local decorative chrome tokens, tags retain a
visible “Tagged” cue, and selection, focus, invalid, lock, and movement states keep their independent
semantic colors. Chrome, accent, and tag updates each use one `section-presentation` change. The
host renderer stays mounted but inert while the style panel covers it, preserving local host state.
The panel reconciles each controlled proposal before announcing whether that style actually
changed.

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

### Recursive structural movement

`sectionMoveMode` is a host-owned interaction preference and defaults to `sort`. In sort mode,
top-level handles retain ordinary XYFlow spatial dragging while nested handles activate the
package's structural DnD owner. In `free` mode, root and nested handles both activate that structural
owner. The mode captured when a gesture starts remains in force until completion or cancellation;
changing the prop affects the next gesture. Root layout, structural DnD, and viewport gestures
exclude their competing activators and restore them when the active owner releases.

For structural keyboard movement, focus a named section movement handle and press Enter or Space.
ArrowUp and ArrowDown move through vertical sibling positions; ArrowLeft and ArrowRight move
through horizontal positions and mirror their logical order in right-to-left layouts. In free mode,
an arrow at the edge of the current container previews the nearest valid measured container in that
direction. Each preview announces its container and position. Press Enter or Space to commit the
displayed plan, or Escape to cancel and restore focus. A normalized selection block follows the same
path as one atomic move. In free mode, normalized roots from different source parents use
deterministic visual/hierarchy order and the active root anchors the first keyboard direction. When
no measured container is available beyond a nested block's edge, the
next arrow previews the canvas while preserving that block's measured workbench placement; after
commit, switch to sort mode for ordinary root arrow-key positioning.

`validateSectionMove` is an optional synchronous, side-effect-free host policy for structural
moves. It receives the current document and an immutable `SectionMovePlan` after package-owned
source-placement, containment, cycle, destination, and lock checks. Return a specific rejection reason
for host relationships the generic document cannot express. Rejected targets never publish a
document change; the reason is shown as non-color-only feedback and announced through the
pre-mounted polite movement region. Locked sections cannot be moved directly, while a locked
container remains a valid destination unless this host policy rejects it.

## Resizing and size modes

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

## Ownership, persistence, and capabilities

Use `defaultDocument` instead of `document` for uncontrolled ownership. The two modes are mutually
exclusive, and a controlled workspace requires `onDocumentChange`. `readOnly` disables package-owned
layout, structure, and presentation edits while viewport navigation and arbitrary host-rendered
content remain available.

Persistence remains host-owned. Use `serializeWorkspaceDocument` and `parseWorkspaceDocument` for
canonical JSON, then validate each registered kind's host payload before accepting imported data.
The backend-free playground demonstrates versioned local document storage, separate host preference
storage, strict import recovery, export, and confirmed reset without putting storage or native file
semantics in the package.

## Viewport, grid, and appearance

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

## Toolbar, overlays, and minimap

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

`WorkspaceOutline` is an optional ready-made utility overlay built only on that controller and the
canonical document hierarchy. It renders visible branches as an accessible multiselect tree,
focuses a section on ordinary activation, supports modifier selection, and keeps disclosure state
transient. Top-level containers start expanded by default; `defaultExpandedSectionIds` can choose a
different set of known initial branches.

```tsx
import { Workspace, WorkspaceOutline } from "@setta/workspace/react";

<Workspace
  overlaySlots={{
    utility: (controller) => (
      <WorkspaceOutline ariaLabel="Document sections" controller={controller} />
    ),
  }}
  {...workspaceProps}
/>;
```

The minimap is visible on the right by default and can be placed on either physical side. Once the
workbench has root sections, click empty minimap space to center that workbench point, drag the
minimap to pan, or click a root summary to select, center, and focus that section. Direct section
controls and the controller's focus, fit, and next/previous helpers provide the corresponding
keyboard navigation paths.

`WorkspaceViewportPresets` is an optional utility overlay for host-persisted saved views. It
captures the current canonical viewport, restores through the public controller, and supplies
native save, restore, rename, and delete controls with validation, focus recovery, and polite
feedback. The controlled `presets` array remains a separate host preference; callbacks request
host-owned ID allocation and collection changes. Core `parseWorkspaceViewportPresets` and
`serializeWorkspaceViewportPresets` helpers provide a strict versioned storage frame. Restoring a
view changes only the ordinary document viewport, stays available in read-only mode, and does not
create a structural history entry.

`gridOptions.snap` and `minimapOptions.visible` are locally toggleable when their change callback is
omitted. Supplying `onGridSnapChange` or `onMinimapVisibilityChange` makes that preference
controlled; keep the corresponding option and callback ownership mode stable for the mount.

## Interaction boundaries and lifecycle

Registered section renderers already receive a package-owned interaction boundary. Wrap interactive
or scrollable content in a transformed `canvas` overlay slot with `WorkspaceInteractionBoundary`.
It independently suppresses canvas panning and wheel handling while leaving the host control usable;
consumers do not need to know the adapter's internal marker class names. The transformed canvas-slot
wrapper is neutral, so setting either boundary option to `false` deliberately returns that gesture
family to the canvas. Set `preventExternalDrop` when a nested host surface owns native drops itself;
that opt-out does not change pan or wheel arbitration.

Unmounting the workspace cancels active transient viewport and root-movement gestures, releases its
persistent geometry observers and global listeners, rejects pending measurement subscriptions, and
leaves the accepted document unchanged for an exact later remount.

## Controller, grouping, and history

The controller's measured navigation helpers wait for visible frame geometry, propose one canonical
viewport change, and resolve after the upstream viewport reconciles to the host's current canonical
value. Accepted `focusSection` calls preserve the current zoom and move programmatic focus with
scroll prevention; focusing also replaces the current selection with the target section. Rejected or
superseded controlled proposals settle without moving stale focus.
`fitSection` and `fitSections` honor the configured zoom bounds, reserve a default chrome-safe
padding, and accept an optional non-negative padding value. Spatial next/previous navigation orders
roots by workbench `y`, then `x`, persistent order, and stable ID, with descendants following
canonical child order.

Right-click section chrome or press Shift+F10/Context Menu from a section control to open the
built-in selection actions. Batch lock, unlock, subtree deletion, and persistent stacking use
normalized selection roots and the same canonical command boundary. Persistent stacking accepts
section IDs at any depth, maps them to distinct top-level ancestors, and preserves selected order;
ordinary selection and dragging use only a transient render lift.

`autoLayoutRootSections({ gap })` uses measured top-level frame sizes to deterministically pack every
root into near-square shelves while preserving the current minimum x/y anchor. It changes neither
root stacking nor section sizes, hierarchy, viewport, or selection. The command requires layout
editing, rejects locked roots and incomplete geometry atomically, and records one `section-move`
history entry. The default gap is 48 workbench units. Framework-neutral consumers may call
`packWorkspaceRectangles` or `planWorkspaceRootAutoLayout` from the core entry point with explicit
geometry.

Canonical projection reuses unchanged root-node and renderer data identities. Selection, viewport,
transient movement/resize, and single-section document updates therefore avoid rerendering unrelated
host section bodies even for large root sets.

Supplying `groupFactory` enables Group when at least two normalized sections share one parent and a
registered `canContainSections` kind is available. The factory receives the canonical sibling IDs
and shared parent, then supplies the new container kind, stable ID, title, and host payload. The
package inserts that container at the first selected sibling, retains the selected IDs in canonical
order, and selects and focuses the accepted group. This behavior is identical at every rendered
depth. Ungroup promotes a selected container's direct children at the same parent index without
requiring the factory. Nested children retain their ordered layout; at the top level, the package
derives separated root positions from the measured group frame. The first promoted child receives
focus. Both operations require structure and layout editing, publish one `section-group` or
`section-ungroup` change, and reconcile the requested parent relationship against the controlled
host before changing selection or focus.

Committed section changes participate in built-in in-memory history. One accepted create, delete,
group, ungroup, move, resize, size-mode, lock, minimize, title, presentation, or persistent stacking
command creates one entry; viewport and selection changes do not. Undo and redo preserve the live
viewport, restore the recorded package selection, recover focus only when the prior focused element
was removed, and wait for controlled-host acceptance before moving either history stack. A rejected
controlled proposal leaves the entry available. A new accepted branch clears redo, and an unrelated
controlled document replacement clears both stacks rather than applying snapshots to unknown host
state. Live capabilities gate the next history action without deleting it.

Use Control/Command+Z to undo and Control/Command+Shift+Z or Control/Command+Y to redo while focus is
in the workbench. Inputs, textareas, selects, editable content, and elements marked with
`data-workspace-local-shortcuts` retain their local shortcut ownership. Hosts may expose pointer
controls through `controller.undo()`, `controller.redo()`, and `controller.getHistoryState()`.

```tsx
await controller.current?.focusSection("details");
await controller.current?.fitSections(["summary", "details"], { padding: 0.16 });
await controller.current?.focusNextSection("summary");
controller.current?.selectSections(["summary", "details"]);
controller.current?.getSelectedSectionIds();
controller.current?.clearSelection();
controller.current?.createSection("note");
controller.current?.createSection("note", { position: { x: 120, y: 80 } });
controller.current?.autoLayoutRootSections({ gap: 48 });
controller.current?.groupSections(["summary", "details"]);
controller.current?.ungroupSection("summary-group");
controller.current?.bringToFront(["summary", "details"]);
controller.current?.bringForward(["details"]);
controller.current?.sendBackward(["details"]);
controller.current?.sendToBack(["summary"]);
controller.current?.getHistoryState();
controller.current?.undo();
controller.current?.redo();
controller.current?.setSectionTitle("details", "Details");
controller.current?.setSectionPresentation("details", {
  accentColor: "oklch(0.62 0.14 255)",
  chrome: "compact",
  tagColor: null,
});
```

## Testing entry point

Testing-only exports continue to exercise exact-pinned upstream XYFlow and dnd-kit behind
package-owned geometry, command, and interaction boundaries without making their types public.
