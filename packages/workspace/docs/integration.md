# Host integration

This guide covers the permanent boundary between `@setta/workspace` and a consuming React
application. Import runtime components from `@setta/workspace/react`, framework-neutral helpers
from `@setta/workspace/core`, and the required CSS once from `@setta/workspace/styles.css`.

## Document contract

`WorkspaceDocument<TSectionData>` is the only canonical package document:

```ts
type WorkspaceDocument<TSectionData> = {
  schemaVersion: 2;
  viewport: { x: number; y: number; zoom: number };
  rootSections: Array<{
    sectionId: string;
    position: { x: number; y: number };
  }>;
  sections: Record<
    string,
    {
      id: string;
      kind: string;
      title: string;
      positionAndSizeLocked: boolean;
      isMinimized: boolean;
      size: {
        width: { mode: "fixed" | "content"; value: number };
        height: { mode: "fixed" | "content"; value: number };
      };
      presentation: {
        chrome: "default" | "compact" | "transparent" | "none";
        accentColor: string | null;
        tagColor: string | null;
      };
      data: TSectionData;
      childLayout:
        | {
            orientation: "vertical" | "horizontal";
            overflow: "grow" | "scroll";
            positioning: "ordered";
            sectionIds: string[];
          }
        | {
            overflow: "grow" | "scroll";
            positioning: "freeform";
            positions: Record<string, { x: number; y: number }>;
            sectionIds: string[];
          }
        | null;
    }
  >;
};
```

Roots have free workbench positions. Every nested section appears once in its immediate parent's
canonical `sectionIds`; there is no serialized `parentId`. An ordered layout also carries an
orientation. A freeform layout instead carries exactly one finite, non-negative local `x`/`y`
position for every direct child ID and no other keys. Root order is persistent stacking order, and
each child list is deterministic traversal and sibling stacking order. IDs are non-empty and
unique, every section is placed exactly once, containment is reachable and acyclic, dimensions and
viewport values are finite, and section payloads must be JSON-serializable without accessors or
cycles. Schema-v1 discriminator-less child layouts are rejected rather than migrated or inferred.

Use `validateWorkspaceDocument` for unknown values, `parseWorkspaceDocument` for JSON text, and
`serializeWorkspaceDocument` before storage or export. Structural validation cannot know the host
schema for `data`: validate every payload and registered `kind` before narrowing the parsed
`WorkspaceDocument<unknown>` to an application type.

```ts
import {
  createEmptyWorkspaceDocument,
  parseWorkspaceDocument,
  serializeWorkspaceDocument,
  type WorkspaceDocument,
} from "@setta/workspace/core";

type NoteData = Readonly<{ body: string }>;

function isNoteData(value: unknown): value is NoteData {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { body?: unknown }).body === "string"
  );
}

function parseNoteWorkspace(serialized: string): WorkspaceDocument<NoteData> {
  const parsed = parseWorkspaceDocument(serialized);
  if (Object.values(parsed.sections).some((section) => !isNoteData(section.data))) {
    throw new TypeError("The workspace contains an invalid note payload.");
  }
  return parsed as WorkspaceDocument<NoteData>;
}

const initialDocument = createEmptyWorkspaceDocument<NoteData>();
localStorage.setItem("notes-workspace", serializeWorkspaceDocument(initialDocument));
const restoredDocument = parseNoteWorkspace(localStorage.getItem("notes-workspace")!);
```

Treat storage reads, schema errors, quota failures, and rejected imports as host UI states. Keep the
last valid in-memory document when recovery fails. Persist appearance, grid visibility, snapping,
minimap visibility, and other host preferences separately unless the host deliberately embeds them
in its own project format.

## Adapter-driven copy and paste

Copy and paste is available only when `Workspace` receives a `clipboardAdapter`. The package owns
Control/Command+C and Control/Command+V outside local editing surfaces, normalized selection-root
and complete-subtree extraction, the versioned
`application/vnd.setta.workspace.sections+json` frame, untrusted-input validation, relative root
offsets, non-overlapping placement, controlled-host reconciliation, selection/focus recovery, and
one `section-paste` history entry. Copy remains available in read-only mode; paste requires
`editStructure`.

The adapter owns clipboard transport, authorization, every new section ID, and cloning or remapping
host payloads and domain references. `cloneSections` receives structurally validated source
sections and their root IDs, then returns either a specific `invalid`, `unauthorized`, or
`unsupported` rejection or exactly one `{ sourceSectionId, id, data }` result for every source
section. A controlled host may await a backend clone in that method before returning the accepted
subtree mapping. Missing, duplicate, colliding, accessor-backed, cyclic, or otherwise invalid clone
results reject the complete paste; no partial subtree is inserted.

The backend-free JSON path uses `createWorkspaceJsonClipboardAdapter`. It deliberately requires a
host data validator and ID allocator, uses the supplied text clipboard, and calls
`structuredClone` only after validation. It does not claim that arbitrary payloads are cloneable.

```tsx
import { createWorkspaceJsonClipboardAdapter } from "@setta/workspace/core";

const clipboardAdapter = createWorkspaceJsonClipboardAdapter<NoteData>({
  clipboard: navigator.clipboard,
  allocateSectionId: ({ kind }) => allocateSectionId(`${kind}-copy`),
  validateSectionData: ({ data, kind }) => kind === "note" && isNoteData(data),
});

<Workspace
  clipboardAdapter={clipboardAdapter}
  document={document}
  onDocumentChange={setDocument}
  sectionDefinitions={noteDefinitions}
/>;
```

Treat every `read()` result as hostile even when the operating-system clipboard was written by the
same application. Before `cloneSections` runs, the package validates the MIME and clipboard schema,
document structure, containment, dimensions, colors, and registered kinds. After cloning, it
validates the complete ID mapping and JSON-safe payloads again before proposing a document, so no
renderer mounts on an invalid or only partly cloneable frame. The default paste origin is the last
meaningful canvas point, then the current measured selection, then the visible viewport. The
deepest eligible destination receives the complete pasted block: ordered parents receive one
insertion index, while the canvas and nested freeform parents receive collision-aware spatial
positions in their own coordinate system. Spatial paste preserves measured root offsets, avoids
existing direct siblings, follows the active snap grid, and never leaves a partial child list or
stale freeform position key.

## Controlled and uncontrolled ownership

Pass neither `document` nor `defaultDocument` for an empty uncontrolled workbench, or pass one
`defaultDocument` for an uncontrolled initial value. Controlled ownership requires both `document`
and `onDocumentChange`; the two ownership modes are mutually exclusive.

One completed package command proposes one immutable document and one `WorkspaceDocumentChange`
reason. Pointer previews, selection, measurements, and transient render lift do not call the
change handler per frame. A controlled host accepts a proposal by rendering it back. If it retains
the prior document, the package reconciles to canonical host state and reports the rejection where
the initiating UI has a pending workflow.

Section payload changes remain host-owned. `SectionRenderProps` provides the current `data`,
`sectionId`, resolved `appearance`, and resolved `readOnly` state; update the payload by producing a
new controlled document in the host. Durable renderer state belongs in `data` because minimizing a
section unmounts its host body.

## Capabilities and read-only state

Capability overrides default to `true`. `readOnly` resolves all three package capabilities to
`false` and wins over individual overrides.

| Capability         | Package actions it gates                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `editLayout`       | Spatial movement, structural reorder/reparent, batch movement, resize, fixed/content transitions, container positioning, orientation and overflow, direct lock changes, and persistent stacking. |
| `editStructure`    | Section creation, deletion, grouping, ungrouping, paste, and the package-owned external-drop handoff.                                                                                            |
| `editPresentation` | Title edits, minimize/expand, chrome, accent, and tag changes.                                                                                                                                   |

Selection, focus, fit, minimap navigation, pan, and zoom remain available. The package cannot make
arbitrary host-rendered controls read-only; use the `readOnly` render prop to enforce the host's
content policy. Authorization and persistence remain authoritative in the application even though
the package prevents locally unavailable gestures before they start.

## Registry, creation, and smart placement

Every populated document kind needs exactly one `SectionDefinition`. The definition declares frame
defaults, creation metadata, containment and size support, and the host component. The optional
`sectionFactory` owns stable ID allocation and payload creation; registering it enables the built-in
Add section control and searchable picker.

Toolbar creation calls `controller.createSection(kind)` and searches visible non-overlapping space.
Right-click creation supplies the pointer's workbench position. An explicit
`controller.createSection(kind, { position })` always wins over smart placement. For host-owned
placement outside React, `planWorkspaceSectionPlacement` accepts root rectangles, viewport bounds,
new size, padding, and an optional grid, then returns a deterministic `position` and optional
`panTarget` without mutating a document.

Search covers display name, kind, group, and keywords. A successful package creation selects and
focuses the new frame. The host owns additional creation items, asynchronous domain work, and any
payload validation.

## Top-level auto layout and rectangle packing

`controller.autoLayoutRootSections({ gap })` measures every canonical top-level frame through the
package geometry index, orders rectangles by measured height and width with persistent root order
as the stable tie-breaker, and shelf-packs them into a deterministic near-square area. The default
gap is 48 workbench units. An explicit gap must be finite and non-negative.

The command preserves the roots' existing minimum x/y anchor, persistent stacking order, section
records and sizes, hierarchy, viewport, and transient selection. It requires `editLayout`, rejects
the complete operation when any root is locked or any root geometry is unavailable, and commits all
new positions as one `section-move` history entry. Repeating the command against the resulting
geometry is a no-op.

Hosts that need planning without a mounted React workbench can import the pure core helpers.
`packWorkspaceRectangles` packs positive finite rectangles from an explicit origin;
`planWorkspaceRootAutoLayout` additionally derives the origin from the supplied root rectangles and
returns a prototype-safe position record. Both validate dense inputs, unique non-empty section IDs,
finite geometry, and the gap without reading section payloads or mutating the input.

Expose the command through a host toolbar control when it fits the product:

```tsx
const autoLayoutControl: WorkspaceToolbarControl = {
  icon: <ArrangeIcon />,
  id: "auto-layout",
  label: "Arrange sections",
  onPress: (controller) => controller.autoLayoutRootSections({ gap: 48 }),
  placement: "project",
};
```

## Detachable section windows

Detachment is explicit at both boundaries: the section definition sets `detachable: true`, and the
host renders `Workspace` under `WorkspaceDetachmentProvider`. Without either opt-in, no detachment
control is rendered. The provider opens a same-origin `about:blank` popup synchronously from the
native control's user gesture and uses a React portal, preserving renderer context and the one live
controlled or uncontrolled document.

```tsx
<WorkspaceDetachmentProvider
  getInitialWindowBounds={({ sectionId }) => windowPreferences[sectionId]?.bounds}
  onWindowChange={({ bounds, open, sectionId }) => {
    updateWindowPreference(sectionId, { bounds, open });
  }}
  renderWindowHead={({ kind }) =>
    kind === "note" ? <meta content="note" name="application-section-kind" /> : null
  }
  validateDetachment={({ kind }) =>
    kind === "note"
      ? { allowed: true }
      : { allowed: false, reason: "This section must stay docked." }
  }
>
  <Workspace document={document} onDocumentChange={setDocument} {...workspaceOptions} />
</WorkspaceDetachmentProvider>
```

`getInitialWindowBounds` may return positive width/height and finite screen coordinates.
`onWindowChange` reports actual bounds with `open: true` after opening and `open: false` after
redocking or loss; persist these as host preferences, never in `WorkspaceDocument`. The optional
synchronous validator must return a strict allowed decision or a non-empty rejection reason.
`renderWindowHead` portals explicit host metadata, styles, or same-origin resources into the popup
head; the package already owns its charset, viewport metadata, base styles, title, and live theme
tokens.

The original frame retains a measured placeholder and native focus/redock controls. Closing or
reloading the popup, navigating it away, losing its live opener, minimizing or deleting the
section, or unmounting the provider closes the transient session predictably. Popup blocking and
host rejection leave the renderer docked and announce a specific recovery. Movement, resizing,
grouping, and ungrouping that would affect a detached section are unavailable until it is redocked;
cross-window drag-and-drop is not a supported contract.

## Toolbar, overlay, and pane extensions

`toolbarControls` covers the common native-button case. IDs must be unique and cannot shadow a
built-in control. A descriptor supplies `project`, `viewport`, or `utility` placement, an accessible
`label`, decorative `icon`, optional `pressed` and `disabled` state, and an `onPress` callback that
receives the public controller.

Use `overlaySlots` for richer project, viewport, utility, or transformed canvas content. Each slot
is a render function receiving the same controller. Fixed overlays isolate pointer and wheel input
from the viewport. Wrap interactive transformed content in `WorkspaceInteractionBoundary` when it
must suppress pan, wheel, or external-drop handling. Direct `Workspace` children are not an overlay
contract, and none of these extension surfaces receives an internal store.

Use `panes` when richer content should reserve workbench layout space. Registrations are strict,
dense, and unique. Each supplies a host ID, visible label, decorative icon, logical `start` or
`end` placement, and a render function that receives only the public controller. The package owns
the corresponding utility-toolbar disclosure button, one-active-pane rule, complementary landmark,
native close action, focus restoration, gesture isolation, and responsive layout. An inactive pane
renderer is not mounted, so keep durable pane data in host state.

```tsx
import {
  Workspace,
  WorkspaceOutline,
  type WorkspacePaneRegistration,
} from "@setta/workspace/react";

const panes = [
  {
    icon: <SectionsIcon />,
    id: "sections",
    label: "Sections",
    placement: "start",
    render: (controller) => (
      <WorkspaceOutline ariaLabel="Document sections" controller={controller} />
    ),
  },
] satisfies readonly WorkspacePaneRegistration<SectionData>[];

const [activePaneId, setActivePaneId] = useState<string | null>("sections");

<Workspace
  activePaneId={activePaneId}
  document={document}
  onActivePaneChange={setActivePaneId}
  onDocumentChange={setDocument}
  panes={panes}
  sectionDefinitions={sectionDefinitions}
/>;
```

Controlled pane state requires both `activePaneId` (a registered ID or `null`) and
`onActivePaneChange`; proposals remain host-authoritative until the controlled value changes.
Uncontrolled usage may set `defaultActivePaneId` and optionally observe changes. Visibility,
registration order, and placement are host UI preferences outside `WorkspaceDocument`; pane
changes do not create structural history. Generated pane-control IDs use a reserved
`workspace-pane:` prefix, so host `toolbarControls` cannot claim that namespace.

## Viewport culling

`viewportCullingOptions` is an optional React rendering preference for workbenches whose host
renderer DOM is materially larger than the visible canvas. Culling is disabled by default and is
not serialized in `WorkspaceDocument` or recorded in structural history.

```tsx
import { type WorkspaceViewportCullingOptions } from "@setta/workspace/react";

const viewportCullingOptions = {
  enabled: true,
  overscan: 160,
} satisfies WorkspaceViewportCullingOptions;

<Workspace
  document={document}
  onDocumentChange={setDocument}
  sectionDefinitions={sectionDefinitions}
  viewportCullingOptions={viewportCullingOptions}
/>;
```

`overscan` is a finite non-negative CSS-pixel margin around the measured canvas. One shared
`IntersectionObserver` watches root and recursive section frames. An offscreen frame remains as an
exact-size lightweight named article while its host renderer and descendant subtree unmount, so
ordered flex layout and root geometry remain stable. The all-depth geometry index retains the last
canonical measurements for focus and fit, then reconnects them when frames remount.

Focus within a frame pins its ancestry. Controller focus reveals the exact target path before
geometry and DOM focus work begins. Detachment, movement, resizing, title editing, and presentation
editing also pin the affected frame. Server rendering emits complete section content; the browser
starts culling after mount. When enabled, a browser without `IntersectionObserver` fails
specifically rather than silently changing the requested rendering policy.

Treat culling like minimization for host-local component state: renderer instances can unmount and
mount again. Put durable content in the section payload or separate host state. Choose overscan
from representative host content and DOM profiles; the package does not impose an arbitrary
cross-machine timing threshold or mutate the document to remember this preference.

## Optional outline navigator

`WorkspaceOutline` is a ready-made hierarchical navigator for a registered pane or fixed overlay.
It reads the current document and selection through the public controller, flattens only visible
branches in canonical order, and reports explicit tree level, sibling position, expansion, and
selection state. It does not add fields to `WorkspaceDocument`, create another store, or interpret
section kinds or payloads.

```tsx
import { Workspace, WorkspaceOutline } from "@setta/workspace/react";

<Workspace
  defaultActivePaneId="sections"
  document={document}
  onDocumentChange={setDocument}
  panes={[
    {
      icon: <SectionsIcon />,
      id: "sections",
      label: "Sections",
      placement: "start",
      render: (controller) => (
        <WorkspaceOutline
          ariaLabel="Document sections"
          controller={controller}
          defaultExpandedSectionIds={["planning"]}
        />
      ),
    },
  ]}
  sectionDefinitions={sectionDefinitions}
/>;
```

Top-level containers with children start expanded when `defaultExpandedSectionIds` is omitted. An
explicit initial list must be dense, unique, and identify known sections. Disclosure state remains
local to the mounted outline; changing it does not publish a document change or create history.
Ordinary pointer, Enter, or Space activation selects, centers, and focuses the section. Control,
Command, or Shift activation toggles selection and announces the new count while focus remains in
the tree. Logical forward expands or enters a branch; logical backward collapses or returns to its
parent, so horizontal keys mirror in RTL. Up/Down, Home, and End use roving focus across visible
rows.

Render the component through `panes` or `overlaySlots` so the workspace rerenders it with current
controller state and supplies scoped theme tokens plus gesture isolation. A host that places it
elsewhere must rerender it when its controlled document or package selection changes and provide an
equivalent sized, themed container. For very large documents, keep inactive branches collapsed so
the outline adds DOM only for rows users are currently navigating.

## Saved viewport presets

`WorkspaceViewportPresets` is an optional registered pane or utility overlay for host-persisted viewport shortcuts.
The package validates and renders ordered `{ id, name, viewport }` records, captures the current
canonical viewport, restores a selected preset through `controller.setViewport`, and owns native
save, restore, rename, and delete controls with local validation, focus recovery, and polite
announcements. The host remains the only owner of preset IDs, storage, authorization, and accepted
collection changes.

```tsx
import {
  parseWorkspaceViewportPresets,
  serializeWorkspaceViewportPresets,
  type WorkspaceViewportPreset,
} from "@setta/workspace/core";
import { Workspace, WorkspaceViewportPresets } from "@setta/workspace/react";

const [presets, setPresets] = useState<readonly WorkspaceViewportPreset[]>(() => {
  const saved = localStorage.getItem("workspace-views");
  return saved ? parseWorkspaceViewportPresets(saved) : [];
});

function updatePresets(next: readonly WorkspaceViewportPreset[]) {
  setPresets(next);
  localStorage.setItem("workspace-views", serializeWorkspaceViewportPresets(next));
}

<Workspace
  document={document}
  onDocumentChange={setDocument}
  overlaySlots={{
    utility: (controller) => (
      <WorkspaceViewportPresets
        controller={controller}
        onCreatePreset={({ name, viewport }) =>
          updatePresets([...presets, { id: allocateViewId(), name, viewport }])
        }
        onDeletePreset={(presetId) => updatePresets(presets.filter(({ id }) => id !== presetId))}
        onRenamePreset={({ name, presetId }) =>
          updatePresets(
            presets.map((preset) => (preset.id === presetId ? { ...preset, name } : preset)),
          )
        }
        presets={presets}
      />
    ),
  }}
  sectionDefinitions={sectionDefinitions}
/>;
```

Each callback is a host request. The panel waits for the corresponding controlled `presets` update
before clearing an editor, announcing success, or moving focus to a created or renamed entry. Omit
all three callbacks for a restore-only list. Names are trimmed by the editor; persisted IDs and
names must be non-empty without surrounding whitespace, IDs must be unique, arrays must be dense,
and every viewport must stay within the package's global finite zoom contract. The versioned parse
and serialize helpers reject extra fields, accessors, unsupported versions, and malformed JSON.

Preset collection order and panel visibility are host preferences, not `WorkspaceDocument` fields.
Restoring a preset publishes the ordinary `viewport` change, synchronizes through the existing
canvas lifecycle, preserves selection and section state, and creates no structural history entry.
It remains available in `readOnly` mode. A preset outside the live workbench's narrower gesture
zoom bounds is reported specifically instead of being clamped or partially applied.

## Generic edges and ports

`connections` projects optional host-owned relationships between section ports without changing
`WorkspaceDocument`. Each port has an ID scoped to one section, a physical `top`, `right`, `bottom`,
or `left` side, an offset from 0 through 1, and a required accessible label. An edge references two
exact section/port pairs, has a required label, and explicitly chooses directed or undirected
presentation.

```tsx
import {
  WORKSPACE_CONNECTIONS_SCHEMA_VERSION,
  parseWorkspaceConnections,
  serializeWorkspaceConnections,
  type WorkspaceConnections,
} from "@setta/workspace/core";

const connections = {
  schemaVersion: WORKSPACE_CONNECTIONS_SCHEMA_VERSION,
  ports: [
    { id: "out", label: "Review output", sectionId: "draft", side: "right", offset: 0.5 },
    { id: "in", label: "Review input", sectionId: "approval", side: "left", offset: 0.5 },
  ],
  edges: [
    {
      id: "review-flow",
      label: "Review flow",
      directed: true,
      source: { sectionId: "draft", portId: "out" },
      target: { sectionId: "approval", portId: "in" },
    },
  ],
} satisfies WorkspaceConnections;

const serialized = serializeWorkspaceConnections(document, connections);
const restored = parseWorkspaceConnections(document, serialized);

<Workspace connections={restored} document={document} onDocumentChange={setDocument} />;
```

Validation is strict and document-relative: arrays must be dense, IDs and labels are trimmed and
non-empty, edge IDs are unique, port IDs are unique within a section, endpoints must resolve, and
unknown sections, fields, accessors, schema versions, or identical endpoints fail specifically.
When a host deletes or replaces a section, derive the controlled connection collection from the
same accepted host state so one render never contains a dangling reference.

The package uses the shared measured geometry index to keep root and recursively nested endpoints
aligned through pan, zoom, nested scroll, resize, reflow, and orientation changes. Stroke widths,
port marks, arrowheads, and labels remain legible instead of scaling with canvas zoom. A hidden
named group lists every port and complete labeled edge for screen-reader navigation; the visible
SVG is non-interactive and hidden from assistive technology. Visible edge labels progressively hide
when the canvas becomes too narrow for them; the routes, ports, and complete named description
remain available.

Hosts own connection IDs, persistence, authorization, editing UI, and any domain meaning. This
surface intentionally adds no edge-creation gesture, selection, document command, history entry,
execution semantics, or XYFlow type. The backend-free all-depth fixture is available at
`/?canvas-shell&connections` in the playground.

## Controller commands

The controller is unavailable until the upstream viewport initializes. Read it through
`controllerRef` after mount. Synchronous commands return `WorkspaceActionResult` with `applied`,
`unchanged`, or a specific `rejected` reason; measurement-dependent navigation returns a promise of
the same result.

| Area                    | Public methods                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Read state              | `getDocument`, `getCapabilities`, `getSelectedSectionIds`, `getHistoryState`                                          |
| Selection               | `selectSections`, `clearSelection`                                                                                    |
| Creation and structure  | `createSection`, `deleteSections`, `groupSections`, `ungroupSection`                                                  |
| Clipboard               | Async `copySelection`, `paste` when a host adapter is configured                                                      |
| Frame state             | `setSectionTitle`, `setSectionPresentation`, `setSectionsLocked`, `setSectionMinimized`, `setSectionChildOrientation` |
| Viewport and navigation | `setViewport`, `focusSection`, `fitSection`, `fitSections`, `focusNextSection`, `focusPreviousSection`                |
| Stacking                | `bringToFront`, `bringForward`, `sendBackward`, `sendToBack`                                                          |
| History                 | `undo`, `redo`                                                                                                        |

`focusSection` selects and focuses the requested frame while preserving zoom. Fit helpers wait for
measured frame geometry, enforce configured zoom bounds, and accept non-negative padding.
Next/previous navigation orders roots spatially, then follows canonical descendants. Do not infer
completion from timeouts; await the returned promise.

## Selection, grouping, stacking, and history

Selection is transient package state. A normal selection replaces it; Shift toggles membership;
Shift-drag on blank canvas performs partial or full marquee selection according to
`selectionOptions`; Control/Command+A selects all. Structural commands normalize away a selected
descendant when its ancestor is also selected.

Supplying `groupFactory` enables grouping for at least two selected siblings with one parent. The
host supplies the container kind, ID, title, and payload; the package owns insertion, canonical
order, and resulting selection. Mixed-parent grouping is rejected. Ungroup promotes direct
children at the same parent index. In a freeform parent, grouping replaces the selected local
position keys with the measured group position, while ungrouping replaces the group key with exact
measured child-local positions. Root ungrouping resolves non-overlapping root positions from
measured geometry.

Ordinary selection and dragging only lift the active top-level ancestor transiently. Persistent
stacking commands map any selected descendants to distinct root ancestors and change root order as
one undoable command. Batch lock, unlock, deletion, grouping, ungrouping, movement, and stacking use
normalized selection roots.

Committed section changes participate in built-in in-memory history; viewport and selection do
not. Controlled rejection does not consume an entry, a new accepted branch clears redo, and an
unrelated controlled document replacement clears both stacks. Hosts that need durable or
cross-domain history should own that larger transaction boundary.

## Minimap

The minimap projects roots because they are the spatial workbench objects. It is visible on the
right by default and may be hidden or placed on either physical side. Pointer navigation can center
an empty minimap point, pan the viewport, or select and focus a root summary. The toolbar and public
focus/fit/navigation methods provide equivalent non-minimap paths.

`minimapOptions.visible` is locally toggleable when `onMinimapVisibilityChange` is omitted. Passing
that callback makes visibility controlled; keep the ownership mode stable for the mount. The same
rule applies to `gridOptions.snap` and `onGridSnapChange`.

## External drops

`onExternalDrop` enables a generic browser boundary, not a file importer. The request includes the
original `DataTransfer`, a safe metadata snapshot, client and workbench coordinates, and the deepest
measured candidate parent plus a discriminated placement. Ordered parents receive
`{ type: "ordered", index }`; the canvas and freeform parents receive
`{ type: "freeform", position }`, with nested positions expressed as non-negative coordinates
local to that parent's child surface. `validateExternalDrop` is an optional synchronous,
side-effect-free preview policy that returns a labeled acceptance or a specific rejection.

Read custom transfer strings or capture `File` references synchronously before starting
asynchronous work. The host decides whether to create a section, import data, or reject the drop.
The package never identifies file types, uploads, accesses the filesystem, or maps MIME data to a
section. Use `WorkspaceInteractionBoundary preventExternalDrop` around a nested host surface that
owns native drops itself.
