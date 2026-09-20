# @setta/workspace

The Setta workspace UI is a standalone TypeScript/React package. Its public surface is the package
root exported from `src/index.ts`; package-relative modules are implementation details.
`@setta/workspace` is private and unpublished in this repository.

Canvas rendering uses the repository's exact-pinned upstream `@xyflow/react` dependency behind a
package-private adapter. Workspace contains no vendored XYFlow fork, and consumers do not import
XYFlow or depend on its API, state, styles, or DOM structure.

Each `createWorkspaceHost()` owns one workspace document and all of its interaction state. A host
registers its extension catalogs, loads one controlled serializable document, configures appearance,
and mounts the integrated shell or an intentionally standalone canvas. There is no default or
process-global workspace. Package changes may update this unpublished API directly; no
compatibility aliases or transition paths are provided.

## Host lifecycle

Every imperative registry, mutation, and subscription receives its `WorkspaceHost` explicitly.
Components and hooks resolve the same host from `WorkspaceProvider`.

```tsx
const host = createWorkspaceHost();
setWorkspaceColorMode(host, "light");
registerSectionKinds(host, hostKinds);

const unsubscribe = host.subscribe((document) => saveDocument(document));
host.loadDocument(initialDocument);

createRoot(rootElement).render(
  <WorkspaceProvider host={host}>
    <HostWorkspace />
  </WorkspaceProvider>,
);
```

`host.dispose()` releases every host-owned store, registry, listener, and runtime. Unmount the React
tree, remove external subscriptions such as `unsubscribe`, and dispose the host when its lifetime
ends. A disposed host rejects later reads or writes.

## Public composition surface

- `WorkspaceShell` is the package-owned integrated surface. It composes the canvas, controls,
  tooltip, logical leading/trailing rails, controlled panes, the built-in leading Outline, the
  optional leading Saved Views pane, the optional saved-view tab strip, and the built-in trailing
  Inspector. Supplying `navigator` also mounts the package-owned global Find and command palette.
  Hosts register additional typed tabs with icons and content rendered from public props only. Its optional
  `sectionTagColorPalette` is the complete host-supplied set of named Inspector categories;
  omitting it uses the captured package defaults.
- `createWorkspaceShellViewState` creates the initial serializable pane state. Hosts own that value
  and apply the shell's single `onViewStateChange` callback directly or persist it separately from
  `WorkspaceDocument`. The same value owns Outline disclosure and roving-focus state; canonical
  section selection remains in the workspace document.
- `WorkspaceCanvas`, `WorkspaceControls`, and `WorkspaceTooltip` remain public for a host that
  intentionally does not want the integrated shell. The canvas fills its host element; a
  standalone host owns the other surfaces' placement. Pass `canvas` to `WorkspaceShell` or
  `configuration` to `WorkspaceCanvas` to configure external drops and a controlled graph.
- `StandaloneWorkspaceSectionSurface` renders one section and its descendant tree without a
  canvas. It is the focused-section composition for an application route, tab, panel, or secondary
  window. The application supplies the host, route resolution, loading and error states, and any
  root-header action.
- `WorkspaceNavigator` is the optional host-scoped Find and command surface for a standalone
  composition. `openWorkspaceNavigator` and `closeWorkspaceNavigator` let application chrome open
  that mounted surface without reaching into package state.
- `registerSectionKinds` is the section extension point. Each kind supplies opaque-content
  rendering, an optional icon, an optional default size and size constraints, and an optional
  typed Inspector contribution for custom section or item content. Ordinary content is
  automatically placed in the package-owned body slot; `contentClassName` adds host padding or
  layout to that wrapper without exposing the section grid vocabulary.
- `createWorkspaceTextSection` and `createWorkspaceCodeSection` are two optional batteries-included
  content sections a host composes into that same registration call, or leaves out entirely. They
  bring their own typed document contracts, editors, and rendered Markdown surface.
- `WorkspaceItemList` and `ItemDndContext` render item trees. Items with a typed `presentation`
  use the package's editable label and built-in control directly; a list needs `renderItem` only
  for custom opaque items. Its optional `itemDiagnostics` registry supplies ephemeral host
  validation keyed by stable item id. `WorkspaceItemLabel` remains the grid-safe label helper for
  that custom renderer extension.

Application routing stays outside the shell. Navigator mode, query, active result, and modal focus
are ephemeral package runtime owned by the host; they never enter `WorkspaceDocument`. Registered
pane content may use its own application state, but receives no package store, XYFlow panel,
dnd-kit store, Tailwind utility, or package-private DOM selector as an extension API.

## Standalone section and subtree surface

Use `StandaloneWorkspaceSectionSurface` when a downstream route should focus on one section while
retaining the same section chrome, registered content, nested layout, focus, and section
drag-and-drop behavior as the workspace. The surface fills its containing block and must be
mounted under the `WorkspaceProvider` that owns the loaded document and section registrations.

```tsx
function FocusedSectionRoute({ sectionId }: { sectionId: string }) {
  return (
    <main className="h-screen">
      <StandaloneWorkspaceSectionSurface
        sectionId={sectionId}
        ariaLabel="Focused research section"
        headerActions={<OpenInCanvasButton sectionId={sectionId} />}
      />
    </main>
  );
}
```

For example, a research application can resolve `/projects/:projectId/sections/:slug`, authorize
the project, load its `WorkspaceDocument`, map the stable slug to a section id, and render that
section in a dedicated browser tab. Workspace owns section lookup, root chrome, registered-kind
rendering, group orientation, recursive descendants, descendant saved-view visibility, focus
routing, and the section drag boundary. The application owns the URL and slug, authorization,
document loading and persistence, not-found and error presentation, product data and providers,
and the `OpenInCanvasButton` navigation effect.

A focused surface is an alternative projection of stateful section content. Render either it or
the canvas/managed-window projection for a given section under one host; do not mount two live
copies of the same section content under that host.

## Canvas ingress, attention, and graphs

`WorkspaceCanvasConfiguration` is the downstream boundary for application-owned canvas data. Keep
the configuration referentially stable, normally with `useMemo`, and pass it through
`WorkspaceShell.canvas` or `WorkspaceCanvas.configuration`.

```tsx
const canvas = useMemo<WorkspaceCanvasConfiguration>(
  () => ({
    externalDrop: {
      canDrop: (transfer) => transfer.types.includes("application/x-host-card"),
      onDrop: (transfer, position) =>
        createCard(transfer.getData("application/x-host-card"), position),
    },
    graph: {
      canConnect: (connection) => validateConnection(connection),
      canReconnect: ({ connection, edgeId }) =>
        validateReplacement(edgeId, connection),
      edges,
      onConnect: (connection) =>
        setEdges((value) => addEdge(value, connection)),
      onDelete: (edgeIds) => setEdges((value) => removeEdges(value, edgeIds)),
      onReconnect: ({ connection, edgeId }) =>
        setEdges((value) => reconnectEdge(value, edgeId, connection)),
      onSelectedEdgeIdsChange: setSelectedEdgeIds,
      ports,
      selectedEdgeIds,
    },
  }),
  [edges, ports, selectedEdgeIds],
);

<WorkspaceShell canvas={canvas} {...shellProps} />;
```

External drop is a native `DataTransfer` seam on the bare canvas pane. Workspace calls `canDrop`
during drag-over and again at drop time, accepts only an exact pane hit, converts the screen point
to one workspace position, and calls `onDrop`. Drops over sections, controls, panes, or other
Workspace UI stay with those surfaces. The host owns MIME parsing, authorization, document
creation, persistence, errors, and notifications; `DataTransfer` never enters
`WorkspaceDocument`.

The graph is a complete controlled projection. Ports name a section, direction, and one of the
`data`, `agentic`, or `workflow` families; edges reference those ports. Workspace validates the
whole configuration before presenting family-specific ports and edges, connection previews,
selection, reconnect handles, and delete gestures. The host remains the edge authority and must
apply every callback to its controlled input. `canEditStructure` gates connect, reconnect, and
delete while read-only edge selection remains available. Nested-section ports are supported.
Workspace graph types deliberately contain no XYFlow types, and graph state is not stored in the
workspace document.

`canConnect` validates a new edge. A host whose replacement rules differ supplies optional
`canReconnect`, which receives the proposed connection and the ID of the edge it replaces during
both hover and drop evaluation. When omitted, reconnect validation falls back to `canConnect`.

Multi-section attention is an imperative, host-scoped presentation aid:

```tsx
fitWorkspaceSections(host, ["source", "result"]);
setWorkspaceSectionAttention(host, ["source", "result"]);

setWorkspaceSectionAttention(host, []);
```

`fitWorkspaceSections` frames the union of the mounted section shells, including nested sections,
with default padding `0.1`, maximum zoom `1`, and a reduced-motion-aware `500 ms` transition.
Conflicting viewport gestures pause until that transition settles. `setWorkspaceSectionAttention`
applies the package-owned animated outline independently; clearing it retains the outline for
`650 ms` before removal. Both commands validate every requested section before changing runtime
state and reject unknown, hidden, unmounted, or empty-bound sections. Attention is transient and is
cleared by a complete document load.

## Managed windows, section handoff, and Window Spaces

Windowing is a controlled package feature, separate from `WorkspaceDocument`. A host owns its
serializable `WorkspaceWindowingState` and any `WorkspaceWindowSpace` values, maps each stable
generic `surfaceKind` to a renderer, persists changes, owns generic content identity and renderer
data, and supplies a measured local viewport with pane insets. The package never interprets
`rendererData` or performs route, tab, backend, notification, or application-content work.

```tsx
const renderers = {
  "host-note": (window) => (
    <HostNote noteId={window.contentId} data={window.rendererData} />
  ),
} satisfies WorkspaceWindowRenderers;

const [windowingState, setWindowingState] = useState(() =>
  createWorkspaceWindowingState(),
);

// Measure the WorkspaceShell's local layer and its open-pane insets.
const viewport = createWorkspaceWindowViewport({
  width: layerWidth,
  height: layerHeight,
  insets: { left: 40, right: 40, top: 40, bottom: 0 },
});

function openNote(noteId: string) {
  setWindowingState((current) =>
    openWorkspaceFloatingWindow(
      current,
      {
        id: crypto.randomUUID(),
        contentId: noteId,
        surfaceKind: "host-note",
        title: "Note",
        rendererData: { noteId },
      },
      viewport,
    ),
  );
}

<WorkspaceShell
  {...shellProps}
  windowing={{
    layoutEditable: canEditWindowLayout,
    onStateChange: setWindowingState,
    renderers,
    state: windowingState,
    viewport,
  }}
/>;
```

The integrated `WorkspaceShell.windowing` contract is required for section handoff. Every eligible
ordinary section gets the edit-only `Open section in floating window` header action. While that
section is externally owned, its canvas location becomes a measured placeholder and the one live
registered body moves through `floating`, `bottom_docked`, and `maximized` presentation. The
placeholder remains for minimized and closed windows and offers `Focus window` plus `Show in
canvas` when layout editing is allowed. Groups, roots, list roots, and meta controls cannot be
externalized. `WorkspaceWindowManager` remains available as a standalone controlled presenter for
generic windows outside `WorkspaceShell`.

Floating and maximized window surfaces participate in their host canvas's existing wheel routing.
Canvas-owned pan and zoom gestures are canceled synchronously and applied to that canvas, while
`NO_WHEEL_CLASS_NAME`, `MANUAL_WHEEL_CLASS_NAME`, and native vertical-wheel regions keep their
documented content ownership and contain overscroll at the window boundary.

The bottom dock uses the measured usable area between shell panes. Open dock panels shrink to their
reference minimum before overflowing into the recovery strip; narrower hosts progressively use
full pills, compact pills, cycle controls, and a menu. Minimized windows reopen from the strip.
When saved-view tabs are visible, the integrated shell adds their height to the windowing viewport
inset; a host-composed `windowManager` layer is constrained above the same strip. Docked panels,
recovery pills, maximized windows, and floating bounds therefore share one bottom boundary.
The window manager appears only when a closed instance or a width-hidden dock panel needs recovery.
When present, it lists every instance, can focus visible windows, and can reopen closed windows.
For editable section instances it can also move between canvas and floating placement or hide the
external window.

Use the package constructors when data enters the host boundary, then use the pure transition
functions to produce one next controlled state. Generic windows use
`openWorkspaceFloatingWindow`; section integrations use
`showWorkspaceSectionInFloatingWindow`, `dockWorkspaceWindow`, `undockWorkspaceWindow`, and
`moveWorkspaceWindowToCanvasSection`. Focus, move, resize, snap, maximize/restore,
minimize/reopen, close, title, and atomic dock-layout transitions share the same authority. Pixel
bounds belong to the live window layer. `normalizeWorkspaceWindowBounds` and
`denormalizeWorkspaceWindowBounds` convert between that layer and a saved Window Space;
`buildWorkspaceFloatingSnapResizeSeams` and `buildWorkspaceFloatingSnapResizeBounds` cover an
already-snapped shared separator without gaps or partial multi-window writes.

`WorkspaceWindowSpacesPane` receives host-owned spaces and callbacks for save, restore, rename,
delete, reorder, and opening a dedicated view. A snapshot deliberately includes only visible,
ordinary floating windows: canvas-owned, bottom-docked, closed, minimized, and maximized instances
are excluded. Restore is a merge, preserving unrelated live content, reusing matching content
identities, ignoring saved section entries that already have a canvas or dock owner, and remapping
an instance-id collision for different content. The host owns persistence, failure messages, and
the dedicated-tab route.

```tsx
<WorkspaceWindowSpacesPane
  layoutEditable={canEditWindowLayout}
  onOpenDedicated={(space) => openSavedLayoutRoute(space.id)}
  onSave={saveCurrentWindowSpace}
  onStateChange={setWindowingState}
  spaces={windowSpaces}
  state={windowingState}
  viewport={viewport}
/>

<StandaloneWorkspaceWindowSpaceSurface
  renderers={renderers}
  revision={savedLayoutRevision}
  windowSpace={windowSpaceFromRoute}
/>
```

Set `layoutEditable={false}` in `WorkspaceShell.windowing`, on a standalone manager and Window
Spaces pane, or `allowLayoutMutations={false}` on the reusable surface, for frozen read-only
presentation. The UI removes section handoff, title editing, drag/resize/snap, docking, and layout
lifecycle controls; transition functions reject layout writes with the same option. Focus and
reopen stay available, the canvas placeholder explains how to reach its external owner, and a
read-only Window Spaces pane still offers its non-mutating dedicated-view action.

`StandaloneWorkspaceWindowSpaceSurface` is intentionally narrower than the live manager. It renders
one saved layout locally with flat frames, local focus, and existing snapped shared-separator resize.
It never persists those local changes and has no title drag, free resize, snap ghost, keyboard snap,
maximize, minimize, close, or dock controls. A new space id or revision hydrates a fresh local
layout; rerendering the same revision preserves local interaction state.

### Quick info shortcuts

Hover a package control or focus a parameter row with quick info, then hold `Q` to reveal it. While
holding `Q`, use `ArrowLeft`/`ArrowRight` to change pages, `C` to copy the current page, or `F` to
freeze the box. A frozen box receives focus, can be moved and widened, and remains open after `Q`
is released; use `ArrowLeft`/`ArrowRight`, `C`, and `Escape` directly to navigate, copy, and close
it. Creating application sections from tooltip text remains host application behavior.

## Controlled workspace shell

The built-in `Outline` is always the first leading tab. Setting
`includeBuiltInSavedViews={true}` adds Saved Views immediately after it. The built-in `Inspector` is
the first trailing tab when enabled, which is the default; `includeBuiltInInspector={false}` lets a
host own the complete trailing catalog. `WORKSPACE_OUTLINE_TAB_ID` is always reserved,
`WORKSPACE_SAVED_VIEWS_TAB_ID` is reserved while its built-in tab is enabled, and
`WORKSPACE_INSPECTOR_TAB_ID` is reserved while that built-in tab is enabled. A host supplies zero or
more additional tabs on either side with unique stable ids, non-empty labels, decorative icon
components, and render functions. The selected tab, visibility, current width, remembered non-full
width, Outline disclosure, and Outline keyboard focus are controlled serializable view state,
deliberately separate from the canonical workspace document.

`includeSavedViewTabs={true}` enables saved-view bookmarking and the package-owned bottom tab
strip. It is independent of `includeBuiltInSavedViews`: the pane shows bookmark controls in Edit
mode only when both are enabled, while a host can manage `isTab` headlessly and expose the tab
strip without the built-in pane. The default `false` hides bookmark controls, ignores `isTab` for
shell presentation, and reserves no bottom space. The strip itself appears only while at least one
view is bookmarked. When visible, it spans the shell and panes, rails, canvas, package controls,
and window chrome all stop above it.

```tsx
const leadingTabs: ReadonlyArray<WorkspaceShellTabDefinition> = [
  {
    id: "host-notes",
    label: "Host notes",
    icon: NotesIcon,
    renderContent: ({ closePane }) => <HostNotes onDone={closePane} />,
  },
];

const trailingTabs: ReadonlyArray<WorkspaceShellTabDefinition> = [
  {
    id: "host-details",
    label: "Host details",
    icon: DetailsIcon,
    renderContent: () => <HostDetails />,
  },
];

const sectionTagColorPalette = [
  ...DEFAULT_SECTION_TAG_COLOR_PALETTE,
  { color: "#0f766e", description: "Host teal" },
] satisfies WorkspaceSectionTagColorPalette;

function HostWorkspace() {
  const [viewState, setViewState] = useState(() =>
    createWorkspaceShellViewState({
      trailingTabId: "host-details",
    }),
  );

  return (
    <WorkspaceShell
      includeBuiltInSavedViews
      includeSavedViewTabs
      leadingTabs={leadingTabs}
      navigator={{}}
      sectionTagColorPalette={sectionTagColorPalette}
      trailingTabs={trailingTabs}
      viewState={viewState}
      onViewStateChange={setViewState}
    />
  );
}
```

The shell observes its own host box rather than the global window. It applies the reference width
clamps, paired-pane negotiation, full-width memory, and viewport resize normalization at embedded
and compact sizes. Rail tabs use one roving tab stop with Arrow Up/Down and Home/End; resize
separators support pointer dragging plus Arrow Left/Right and Home/End. Set
`leadingPaneShiftsCanvas={false}` to leave the canvas camera unchanged beneath the leading overlay
pane. The default `true` mirrors frozen main: leading-pane width changes shift the map by the same
delta through its 100ms viewport transition. Trailing-pane changes never move the camera.

The Outline projects top-level sections and recursive group children in document order. It uses
the registered section-kind icons, announces selection and disclosure independently, supports one
roving tab stop with Arrow keys, Home/End, Left/Right disclosure, Enter/Space activation, and name
typeahead, and restores focus deterministically after document changes. Pointer and keyboard
activation combine the canvas selection policy with the public `focusWorkspaceSection` command.
Hosts may call that command directly to fit a mounted section at no more than 100% zoom; it never
changes canonical selection.

The Inspector projects canonical section and typed-item selection. Its empty state mirrors the
frozen UI Editor; one section exposes package-owned identity, name, style accent, named color tag,
lock/minimize, authored/resolved size, group orientation, bounded overflow, and ungroup actions;
one typed item exposes its editable label, ordinary UI type, and only that type's valid
configuration. Its
canonical live value control remains in the section on the canvas rather than being duplicated in
the Inspector. Compact configuration rows commit each valid field or list action immediately;
invalid numeric/text drafts remain local until corrected or canceled with Escape. Dropdown and
color choices use dedicated item editors rather than JSON, and date/time options appear only when
their selected mode uses them. Multiple sections expose only compatible batch lock/unlock, group,
ungroup, and delete actions, including an explicit mixed lock state. Every mutation uses the
existing document funnels and host publication boundary. Custom section or item data is never
decoded: the owning section kind receives a read-only `WorkspaceInspectorContributionContext`, or
the pane shows an explicit unsupported state. The
Inspector owns inline validation, Escape restoration for its configuration fields, and a persistent
polite mutation/selection status.

Section-owned Inspector contributions can compose `WorkspaceInspectorSettingsGroup` to reuse the
same disclosure card, summary status, focus treatment, and light/dark presentation as native
Inspector settings. Compact anchored choices outside or inside the Inspector can use
`WorkspaceDropdownMenu`; callers provide grouped items and mutations while Workspace supplies the
scoped Setta menu surface, keyboard navigation, text direction, and focus restoration. Supplying
`selectedItemId` gives the choices radio-item semantics and a checked indicator without turning the
menu trigger into a toggle.

Hosts that need separate contextual panes can disable the generic Inspector with
`includeBuiltInInspector={false}` and compose `WorkspaceSectionEditor` and
`WorkspaceParameterConfigurationView` into their own trailing tabs. The matching
`WorkspaceSectionSettingsIcon` and `WorkspaceParameterConfigurationIcon` keep those tabs visually
consistent. `WorkspaceParameterConfigurationView` receives the owning `sectionId`. Host pane
content can use `useWorkspaceDocumentSnapshot()` to derive contextual availability without
creating a second document subscription.

## Saved canvas views

Saved views are opt-in named presentations of one workspace document. Each view owns a complete
top-level layout, camera, exact visibility value for every section, and an `isTab` bookmark value.
Section identity,
hierarchy, content, item values, authored sizes, shell panes, managed windows, diagnostics, and
application runtime remain shared. Outside saved-view editing, a hidden parent removes its rendered
subtree. The pane's Edit mode projects hidden sections on the canvas with reduced opacity and
replaces each section's delete control with Show or Hide. View rows stay compact until Edit exposes
rename, reorder, and delete controls. Section inclusion remains on the canvas instead of being
duplicated as a hierarchy in the pane. Inline name drafts validate as the user types; blur or Enter
restores the last valid name when a draft is invalid, while Escape cancels the draft.

The Playground provides three bookmarked examples: Overview shows the whole fixture, Content shows
only the item, code, and rendered/source text sections in a focused arrangement, and Controls shows
only the meta-control sections in a compact grid. Switching among them changes what is visible,
where the visible roots sit, and the camera without cloning any section data.

Set `WorkspaceDocument.savedViews` to `null` to disable the capability. An enabled state has one
active view and at least one validated `WorkspaceSavedView`. `createWorkspaceSavedViewsState`
creates the first all-visible view from a document, and `includeBuiltInSavedViews` exposes the
package-owned management pane:

```tsx
const documentBase: WorkspaceDocumentInput = {
  activeIds: [],
  savedViews: null,
  sections,
  topLevelSections,
  viewport: null,
};

host.loadDocument({
  ...documentBase,
  savedViews: createWorkspaceSavedViewsState(documentBase, {
    id: "overview",
    isTab: true,
    name: "Overview",
  }),
});
```

The public headless operations create, activate, rename, delete, reorder, change visibility, and
set tab visibility for views against an explicit host. `setWorkspaceSavedViewTabVisibility` owns
the bookmark mutation. `getWorkspaceSavedViewsOperationDisabledReason` exposes the same
availability used by the pane. Management and visibility changes require `canEditLayout`;
activation remains available in read-only layout mode because it selects an existing presentation.
The last view cannot be deleted. Edit mode is host-scoped presentation runtime rather than
serialized document state; leaving the pane or loading a document ends it and removes hidden
sections from focus and selection again.

Every accepted switch first captures the outgoing live layout and camera, then atomically projects
the target, prunes hidden selection, resets stale interactions, applies the camera, and publishes
once. Live movement, measurement, stacking, and viewport updates continuously refresh the active
view. Complete document commits reconcile structural drift deterministically: deleted ids are
removed, new sections start visible in every view, and new roots receive the incoming live layout.

Workspace owns these generic invariants and UI. The host owns whether the feature is enabled and
all persistence, revisions, conflicts, sharing, routes, analytics, and product-specific defaults.
For a persisted state entering with a fresh application projection, first validate it with
`parseWorkspaceSavedViewsState`, attach it to the document, and call
`projectWorkspaceDocumentSavedViews` before `loadDocument`; that helper reconciles section drift and
projects the persisted active layout and camera coherently. Persist later accepted `savedViews`
values from the ordinary host subscription.

Saved views affect canvas sections. Shell pane state remains in `WorkspaceShellViewState`, and
Window Spaces remain arrangements of managed floating and docked windows. Bookmarking changes
only which saved views receive shell tabs; it does not include managed windows in a saved view.
View management and activation are intentionally excluded from structural history.

## Global Find and command palette

Pass `navigator={{}}` to `WorkspaceShell` to enable one host-scoped navigator. The integrated shell
shows a **Find** trigger by default; set `showTrigger: false` for a keyboard- and API-only surface,
or set `defaultMode: "commands"` to make the trigger open the command palette first.

```tsx
<WorkspaceShell
  leadingTabs={leadingTabs}
  navigator={{ defaultMode: "find", showTrigger: true }}
  onViewStateChange={setViewState}
  trailingTabs={trailingTabs}
  viewState={viewState}
/>
```

A custom composition mounts `WorkspaceNavigator` once inside the same `WorkspaceProvider` as its
canvas. Its direct trigger is opt-in. Application chrome can open either mode against the explicit
host and close the current modal:

```tsx
function HostWorkspace() {
  return (
    <div className="host-workspace">
      <WorkspaceCanvas />
      <WorkspaceNavigator showTrigger />
    </div>
  );
}

openWorkspaceNavigator(host, "find");
openWorkspaceNavigator(host, "commands");
closeWorkspaceNavigator(host);
```

The default configurable operations are `workspace.open-find` on `Mod + P` and
`workspace.open-command-palette` on `Mod + Shift + P`. They participate in the existing key-binding
conflict and rebinding contract. A navigator operation declines without consuming the chord when
that host has no mounted navigator. The section-local parameter filter remains a separate surface
on `workspace.focus-item-filter`, bound to `Mod + K` by default.

Find derives its index while open from the current canonical document. It includes section names
and kinds, built-in item labels, and only the extra opaque text each section-kind owner explicitly
returns. A host can add safe domain terms without exposing the rest of its data:

```tsx
registerSectionKinds(host, {
  note: {
    renderContent: (section) => <Note data={section.data} />,
    getSectionSearchableText: (section) => readNoteSearchText(section.data),
    getItemSearchableText: ({ item }) => readNoteItemSearchText(item.data),
    itemArea: { toolbar: "filter-only" },
  },
});
```

Both callbacks receive detached, deeply frozen snapshots and must return a string synchronously.
Do not return secrets, code bodies, file contents, provider data, or arbitrary serialized objects.
Results keep canonical document order for an empty query and stable fuzzy rank otherwise. Section
activation fits the mounted section without changing selection. Item activation also scrolls and
focuses its mounted row with transient emphasis; a minimized, filtered, or unmounted row leaves its
current visibility policy intact and announces why it could not be revealed.

The command palette is a projection of the existing command and creation catalogs. Include
`"palette"` in a pane, section, or item command's `surfaces`, and optionally provide validated
search `keywords`:

```tsx
registerWorkspaceCommands(host, [
  {
    id: "host-section-details",
    scope: "section",
    surfaces: ["context-menu", "palette"],
    label: "Show host details",
    keywords: ["inspect", "metadata"],
    run: ({ section }) => showHostDetails(section.id),
  },
]);
```

Pane commands receive a null workspace position. Section commands receive the primary active
section and the complete active section set. Item commands appear only when one active section has
exactly one selected item. Creation commands appear automatically under **Create**, retain their
registered group, icon, disabled state, and resolved shortcut, and use the ordinary empty-space
creation funnel. Every entry re-resolves live applicability, disabled explanations, targets, and
capabilities before it runs, so a stale result never executes against removed content. The modal
provides labelled tabs and combobox/listbox semantics, grouped results, arrow and Home/End
navigation, Enter activation, Escape dismissal, a focus trap, focus restoration, and live status.

## Commands and creation extensions

The canvas mounts package-owned pane, section, selection, item, and Outline menus. Register the
complete host-owned command and creation catalogs before mounting it. Each registration call is
host-scoped and replaces that host's previous complete set.

```tsx
registerWorkspaceCreationCommands(host, [
  {
    id: "host-note",
    label: "Note",
    group: "Host",
    createSection: ({ workspacePosition }) => ({
      id: crypto.randomUUID(),
      kind: "note",
      name: "Note",
      data: {
        text:
          workspacePosition === null
            ? "Created from the keyboard"
            : `Created at ${workspacePosition.x}, ${workspacePosition.y}`,
      },
      isMinimized: false,
      positionAndSizeLocked: false,
      isHorizontalOrientation: false,
      styleColor: null,
      overflowMode: false,
      tagColor: null,
      children: [],
    }),
  },
]);

registerWorkspaceCommands(host, [
  {
    id: "host-section-details",
    scope: "section",
    surfaces: ["context-menu", "header", "inspector", "outline", "palette"],
    label: "Show host details",
    keywords: ["inspect", "metadata"],
    run: ({ section, selectedSections }) =>
      showHostDetails(
        section.id,
        selectedSections.map(({ id }) => id),
      ),
  },
]);
```

Creation factories receive the invocation point already converted into workspace coordinates. The
package validates the returned top-level section, resolves its registered default size, inserts and
selects it through one atomic document commit, and reports one document publication.

Commands use `pane`, `section`, or `item` scope and declare the surfaces that offer them:
`context-menu`, `header`, `inspector`, `inspector-parameters`, `outline`, `palette`, or `toolbar`. A
callback receives its host plus a deeply frozen public context, never a package store or private
selector. The same command definition owns its label, enabled explanation, checked state, status,
keywords, and work on every declared surface. `registerWorkspaceToolbarContributions(host,
contributions)` places existing pane commands or creation commands in the package toolbar;
`registerWorkspaceKeyBindings(host, bindings)` rebinds or unbinds known operations after conflict
validation.

### Top-level auto layout

The built-in pane menu and command palette offer **Auto Layout** when layout editing is enabled,
every displayed top-level section has positive measured geometry, and at least two top-level
sections are unlocked. Hosts may contribute the same command to their package toolbar. Direct hosts
use the same boundary:

```ts
const reason = getWorkspaceTopLevelAutoLayoutDisabledReason(host);
if (reason === null) {
  autoLayoutTopLevelSections(host);
}
```

The action keeps locked sections fixed as obstacles and changes only the `x` and `y` coordinates of
unlocked top-level sections. Section dimensions, nesting, stacking, selection, viewport, and opaque
data remain unchanged. One accepted arrangement publishes one complete document as a
`section-move` transaction; an already-arranged workspace or fewer than two unlocked roots returns
`"unchanged"` without publishing. A disabled capability or incomplete geometry rejects direct
invocation with the same explanation shown by the command.

`planWorkspaceTopLevelAutoLayout(rectangles, options?)` exposes the pure planner for hosts that need
to preview or compose the same behavior. Its dependency-free, deterministic shelf packer evaluates
multiple widths around the square-root-of-area baseline, prefers a compact balanced landscape,
penalizes ragged shelves and unnecessary movement, and uses 48 workspace units of spacing by
default. Locked rectangles stay at their supplied coordinates. The planner has no knowledge of
host payloads or semantic relationships; a product that needs domain-specific grouping owns that
policy before calling the package boundary.

The package retains native context menus for inputs, editors, links, buttons, and explicit no-drag
surfaces. Other menu owners support pointer, Context Menu key, and Shift+F10 invocation with
viewport-edge placement, Escape dismissal, and focus restoration. Header menu buttons additionally
support Arrow Down/Up to open at the first or last enabled item.

Group header, section context-menu, Outline, Inspector, Shift+Cmd/Ctrl+G, and direct host
invocations all call the public `ungroupSections(host, groupIds)` operation. It rejects an
unavailable structure capability and any missing, locked, non-group, mixed, or inconsistent request
before changing the document. Nested children replace their group at the same parent position.
Top-level children retain the group origin and receive fresh frontmost stacking positions in child
order.
Surviving selection is preserved, focus moves predictably from a removed group, and the host
receives exactly one document publication.

`WorkspaceSection.overflowMode` is the explicit reload-stable group layout mode: `false` keeps the
group intrinsic, while `true` applies each positive numeric `size` dimension as a fixed border-box
bound and scrolls the existing child subtree inside it. A dimension reset to `"auto"` remains
intrinsic while overflow mode stays enabled, matching resize-handle reset behavior. Every canonical
section carries the boolean, and non-groups keep it `false`. A host calls
`setGroupOverflowMode(host, groupId, enabled)`. Enabling a group whose width or height is `"auto"`
first promotes only those dimensions from the mounted outer group rectangle, so the visible size
does not jump. Numeric bounds survive disabling
and can be re-enabled without a remeasure. The operation validates layout capability, group
identity, lock state, and required live measurement before one document write and one publication.
The persistent child surface keeps nested drop targets and scroll position intact, and takes wheel
ownership only when it actually
overflows. The group header, section/Outline context menus, Inspector, and direct hosts all call
this operation.

`setSectionTagColor(host, sectionId, color)` is the one tag-color mutation used by the Inspector and
direct hosts. It accepts `null` to reset to none and canonicalizes a six-digit RGB hex color before
one document write and one publication. It rejects unavailable layout capability, a locked or
missing section, and malformed color input before writing. `DEFAULT_SECTION_TAG_COLOR_PALETTE`
exports frozen main's Red, Orange, Yellow, Green, Cyan, Blue, Purple, and Slate categories. A
`WorkspaceShell` host may replace the complete Inspector palette with uniquely colored, named
categories, including an empty host-owned set; the package validates and freezes that input, while
reusable palette editing and persistence remain host-owned. A valid document color outside the
current palette stays visible as an explicit Custom choice rather than silently selecting another
category.

Custom interactive renderer content uses only the five exported interaction-boundary constants:
`NO_DRAG_CLASS_NAME` prevents section/item drag activation and `NO_PAN_CLASS_NAME` preserves the
element's pointer interaction. `NO_WHEEL_CLASS_NAME` preserves browser-native wheel behavior such
as scrolling. `MANUAL_WHEEL_CLASS_NAME` is for controls with an `onWheel` handler: the control still
receives the event, while the canvas synchronously prevents Chrome from latching horizontal
Back/Forward navigation. `SETTA_PREVENT_SECTION_ACTIVE_CSS` suppresses the section's transient
pressed outline while its marked interactive descendant is active without changing selection.
Package controls apply these boundaries themselves.

Custom renderers with conditional overflow can use `useIsScrollable()` and apply
`NO_WHEEL_CLASS_NAME` only while its returned `isScrollable` value is true. This preserves native
scrolling without taking wheel gestures away from canvas panning when the content already fits.

An attached host surface that must suspend its own scrolling while the canvas owns a pan-scroll
gesture can use `subscribeWorkspaceCanvasPanScrolling(host, listener)`. The returned function
removes that host-scoped subscription.

## Peer dependencies

React and React DOM are host-provided peers with the documented compatible range `^19.1.0`:
the frozen product reference runs `react 19.1.1`, and the package uses React 19 ref-as-prop
components, so React 18 and below are not supported. All other runtime dependencies are
exact-pinned under the repository dependency policy.

The upstream `@xyflow/react` runtime is a direct private implementation dependency. Workspace owns
its projection and interaction adapters, presentation, and public contract; applications such as
Python Canvas receive no XYFlow types or renderer instance.

The menu primitive is exact-pinned at `@radix-ui/react-dropdown-menu 2.1.15`. Frozen main uses
`2.1.2`, but that release resolves `react-remove-scroll 2.6.0`, whose peer range excludes the
package's React 19 host contract. The retained patch release preserves the same menu primitive while
resolving the React-19-compatible `react-remove-scroll 2.7.2` graph.

## Appearance and semantic color

Call `setWorkspaceColorMode(host, "light" | "dark" | "system")` before the first document load. Light
and dark resolve immediately. System mode reads `(prefers-color-scheme: dark)` and stays subscribed
until an explicit mode replaces it; it requires `window.matchMedia`, so server-rendered hosts choose
an explicit mode and select system after hydration. Invalid modes fail specifically. Appearance
changes rebuild projected style-color backgrounds as well as re-rendering mounted chrome; they do
not report a document change because appearance is view state, not serialized workspace state.

```tsx
setWorkspaceColorMode(host, "system");

function HostChrome() {
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  return (
    <div data-appearance={darkMode ? "dark" : "light"}>{/* host UI */}</div>
  );
}
```

The compiled stylesheet applies dark variants through a package-owned scope on every package root,
including dropdowns, popovers, tooltips, and drag feedback portaled to `document.body`. The package
does not toggle `html.dark` or otherwise style the host page. Hosts read the resolved `darkMode` as
above when their surrounding chrome should follow; `colorMode` retains the requested explicit or
system preference.

`WorkspaceSection.styleColor` is the semantic section accent. `null` or an empty string uses the
normal accepted chrome; otherwise the value must be a six-digit RGB hex color (with an optional
leading `#`) and an unparseable value rejects the load. The frozen reference derivation produces
appearance-aware background, panel, border, outline, primary-text, and muted-text colors. Registered
host content inside that section may consume the corresponding inherited custom properties:

- `--setta-section-style-bg`
- `--setta-section-style-panel-bg`
- `--setta-section-style-border`
- `--setta-section-style-outline`
- `--setta-section-style-text`
- `--setta-section-style-muted-text`

The derived primary text/background pairing is kept at WCAG AA contrast. `tagColor` is a canonical
six-digit RGB hex value or `null` and remains a compact categorical marker only. The Inspector
pairs every swatch with its category name and color value; hosts must likewise not use the color as
the sole way to communicate state or meaning.

## Motion, direction, coarse pointer, and host reflow

Package motion is opt-in. The compiled CSS emits accepted transitions only under
`(prefers-reduced-motion: no-preference)` and neutralizes the retained sortable wrappers under the
reduced preference. Package-owned camera commands resolve requested durations to zero as well.
Motion inside a registered host renderer remains host policy; renderers should apply the same media
preference to their own animation.

Set `dir="rtl"` on the document or on the common host element containing the independently mounted
workspace surfaces. Language-facing chrome uses logical placement, horizontal calendar and item
divider keys follow visual direction, and package dropdown, popover, and tooltip portals retain the
direction of their trigger. Canvas document coordinates, physical resize edges, and the public
`minimapSide: "left" | "right"` option remain physical rather than changing serialized meaning.

Under `(pointer: coarse)`, transparent package-owned hit geometry gives compact actions a 24 px
target floor without enlarging their accepted paint; the isolated rotary gesture reaches 44 px.
Slider and item-column dragging use pointer events and suppress competing touch gestures. Hosts do
not need to add touch padding to package chrome.

`WorkspaceCanvas` fills a host box with `min-width: 0` and `min-height: 0`; its minimap keeps the
accepted 4:3 size until the canvas is too narrow, then clamps inside the pane. The canvas is a
genuine two-dimensional surface and pans internally, but surrounding host chrome must reflow rather
than creating page-level horizontal scrolling. Do not restrict browser zoom in the viewport meta
tag. The playground and packed-consumer fixture demonstrate wrapping chrome at the 200% browser-zoom
content breakpoint and a compact 320 px shell.

## Controlled document and subscriptions

`host.loadDocument(document)` replaces the canonical workspace state with a host-supplied
serializable document (sections, top-level layout, camera, selection, and saved-view state or an
explicit `null`). A load validates the complete document before publication, re-applies its camera
through the private canvas runtime — or re-arms fit-on-init when `viewport` is `null` — and ends
active drag sessions so a host can swap documents without remounting `WorkspaceCanvas`.

`host.subscribe(listener)` reports every later canonical publication, including explicit loads and
package-initiated selection, move, resize, rename, flag, color, delete, measurement, and viewport
commits. Each publication supplies one complete serializable document. `host.getSnapshot()` reads
the current snapshot on demand. Notifications are immediate; transport debouncing is host policy.
Subscribers must not mutate the workspace synchronously—schedule reactions, including an
authoritative reload, after the callback returns. Snapshots share validated store values and must be
treated as immutable.

`commitWorkspaceDocument(host, document)` is the narrower complete-document boundary for a host
that already coordinates a live application projection. It validates and atomically publishes one
complete document without the camera and drag lifecycle resets of an external load. Ordinary
document replacement uses `host.loadDocument`.

Registered renderers commit host-owned payloads through `setSectionData(host, sectionId, data)` and
custom item renderers through `setItemData(host, sectionId, itemId, data)`. Both replace one opaque
payload, preserve package-owned structure, and issue one canonical document publication. A typed
item rejects `setItemData`; its label, scalar value, complete control presentation, and typed
configuration use `setItemLabel(host, ...)`, `setItemValue(host, ...)`,
`setItemPresentation(host, ...)`, and `setItemControlConfiguration(host, ...)` respectively.
Optional help uses `setItemHelpText(host, ...)`; passing `null` removes the field. Each accepted
call publishes once.

Sections with a `WorkspaceSectionItemTree` also carry the package-owned item-column layout. An
omitted `itemColumnWidth` derives the live half-width split; dragging any row's shared center
divider persists the authored width on the tree, and double-clicking resets it. The split is shared
across the section, stays proportional while its container resizes, accounts for canvas zoom and
the deepest nested item, preserves at least 100 px for the value column, and reports drag/reset
commits through the same host subscription boundary. Consumers do not set the private
`--param-column-width` CSS variable. The first visible divider in a mounted list joins the keyboard
order: Left/Right Arrow adjusts by 10 px (Shift adjusts by 1 px), while activating the button resets
the default split. Left/Right describe visual movement and therefore mirror under RTL. The remaining
identical row targets stay pointer-accessible without adding one tab stop per row.

## Section copy, paste, and duplicate

Section clipboard support is opt-in per host. Register one complete local or delegated authority
after section kinds and before users invoke clipboard commands. Workspace supplies **Copy** and
**Duplicate** on section, Outline, and command-palette surfaces, plus **Paste** on pane and palette
surfaces. The defaults are `Mod+C` and `Mod+V`; Duplicate has no default chord. Native inputs and
CodeMirror keep their own clipboard behavior, and Copy also yields while browser text is selected.

Use a local authority when `WorkspaceDocument` is the canonical data store and its opaque section
and item values are JSON-compatible:

```ts
registerWorkspaceClipboardAuthority(host, {
  id: "notes-workspace",
  kind: "local",
});
```

Workspace then normalizes selected roots, captures complete descendant subtrees, allocates all new
section and item ids, preserves package-owned presentation and relative root layout, validates one
complete candidate, and publishes it once. Optional `cloneSectionData` and `cloneItemData`
callbacks can rewrite host-owned references using detached read-only old-to-new id maps. A local
paste or duplicate selects the new roots and creates one structural-history transaction when local
history is enabled.

Use a delegated authority when another model or backend owns canonical identity and persistence:

```ts
registerWorkspaceClipboardAuthority(host, {
  id: "host-project",
  kind: "delegated",
  payloadVersion: 1,
  canCopySelection: ({ rootIds }) => rootIds.every(canCopyProjectSection),
  prepareCopy: ({ rootIds }) => projectApi.copySections(rootIds),
  paste: async ({ fragment, payload, placement, rootIds }) => {
    const accepted = await projectApi.pasteSections(payload);
    const projectedRootIds = projectAcceptedSnapshot(accepted, {
      fragment,
      placement,
      sourceRootIds: rootIds,
    });
    return { rootIds: projectedRootIds };
  },
});
```

Workspace owns clipboard framing, structural validation, command state, placement proposals, and
focus. The delegate owns domain eligibility, its versioned JSON payload, canonical id allocation,
reference rewriting, persistence, revisions, and the accepted application projection. Return from
`paste` only after that projection has published through `commitWorkspaceDocument`; Workspace never
publishes an optimistic clone for a delegated authority. `canCopySelection` is optional and
synchronous; use it to disable Copy and Duplicate for domain sections that cannot be exported.

The text envelope is strict, authority-specific, and limited to 1 MB, 1,000 sections, and 10,000
local item records. Unknown formats, authority or payload-version mismatches, malformed forests,
unknown section kinds, and non-JSON payloads fail without changing the document. Duplicate prepares
and pastes through the registered authority without reading or replacing the system clipboard.
The headless `copyWorkspaceSelection`, `pasteWorkspaceClipboard`,
`duplicateWorkspaceSelection`, and `getWorkspaceClipboardAvailability` operations expose typed
results for custom application chrome.

## Structural history

Structural history is host-scoped and disabled by default. Standalone consumers can opt into the
bounded in-memory authority when they create the host:

```ts
const host = createWorkspaceHost({
  history: { kind: "local", limit: 100 },
});

const unsubscribeHistory = subscribeWorkspaceHistory(host, (state) => {
  renderHistoryControls({
    redoDisabledReason: state.redoDisabledReason,
    undoDisabledReason: state.undoDisabledReason,
  });
});

undoWorkspace(host);
redoWorkspace(host);
```

The limit defaults to 100 and must be a positive finite integer. `undoWorkspace` and
`redoWorkspace` return `true` only when navigation was applied or dispatched. The built-in command
palette exposes **Undo** and **Redo**, with default `Mod+Z` and `Mod+Shift+Z` bindings. Unavailable
history declines without consuming the browser chord, and editable targets retain native or
CodeMirror history.

The local authority records completed section create, delete, group, ungroup, move, resize, layout,
name, minimize, accent, and tag-color operations. It also records item insertion, deletion,
reorder/reparent, and column width. One completed resize gesture is one entry. Current
`canEditStructure` and `canEditLayout` capabilities gate the operation being replayed.

Viewport, selection-only, saved-view management and activation, opaque section and item data, typed
item presentation and values, automatic geometry normalization, and built-in editor changes do not
create entries. Replay keeps the live viewport, saved views, and later unrecorded data, item
presentation, and derived geometry while restoring the recorded selection.
`host.loadDocument(...)` and `commitWorkspaceDocument(...)` clear local history because both
establish a new external document authority.

Applications with a backend or product-wide history can delegate authority instead:

```ts
const authority: WorkspaceHistoryAuthority = {
  getState: () => productHistory.getState(),
  subscribe: (listener) => productHistory.subscribe(listener),
  record: (transaction) => productHistory.recordWorkspace(transaction),
  synchronize: (event) => productHistory.synchronizeWorkspace(event),
  undo: () => productHistory.undo(),
  redo: () => productHistory.redo(),
  dispose: () => productHistory.dispose(),
};

const host = createWorkspaceHost({
  history: { kind: "delegated", authority },
});
```

`record(transaction)` receives the exact package mutation kind, its required capability names, and
detached deeply frozen before/after documents. `synchronize(event)` receives a frozen document with
source `"load"` or `"projection"`. The authority owns persistence, revisions, conflicts,
coalescing, state, and the eventual accepted document. Workspace forwards delegated navigation and
does not replay the document itself. An unavailable delegated state may include
`undoDisabledReason` and `redoDisabledReason`; Workspace supplies a generic reason when either is
omitted.

## Typed built-in items

`WorkspaceItem.presentation` is the package-owned serializable row schema. It contains an editable
`label`, optional string `helpText`, and a discriminated `control`: `group`, `text`, `code`,
`textarea`, `switch`, `dropdown`, `color`, `slider`, `rotary`, `password`, `date`, `time`, or
`dropzone`. Every non-group control carries a controlled string `value` and its exact validated
configuration. Code/text configuration records the accepted autocomplete policy (`"off"`);
numeric bounds, date/time modes, choices, colors, attachment metadata, and dropzone limits reject
malformed values at load and mutation boundaries. A structural root has neither presentation nor
opaque data. A row cannot carry both a typed presentation and opaque `data`.

The Inspector commits help text on blur or Cmd/Ctrl+Enter; Escape discards its current draft. A
nonblank value stages the whole parameter row for Setta's held-Q quick-info surface. The surface
follows the pointer, escapes nested section and bounded-group overflow, clamps and wraps at compact
widths, and disappears on Q release. Item-select keyboard focus stages the same content, and an
in-row screen-reader description keeps it available without opening the visual surface.

Changing UI type directly uses `setItemPresentation(host, ...)` with the complete next control
(kind, value, and configuration); callers outside the integrated Inspector still supply that
complete value. The
Inspector applies its explicit valid default for the chosen ordinary type, preserving the previous
value only where that type accepts it, and then exposes the full type-specific configuration for
editing. Configuration-only edits carry their current kind to `setItemControlConfiguration`, so a
stale Inspector write fails instead of applying options to the wrong control.

Browser and host actions are intentionally not serializable. `registerItemHandlers(host, [...])`
replaces the explicit handler set keyed by section and stable item id; register it before mounting
those rows. Replacing handlers does not mutate or publish the document. A built-in dropzone requires
accepted and rejected-result handlers and may register server-picker and attachment-removal
callbacks. A password may register a saved-value reveal action; its pending flag stays in the
serializable configuration. Scalar controls and labels need no handler registration. Custom items
remain valid through `data` plus `WorkspaceItemList.renderItem`, and missing custom renderers fail
specifically.

An item-tree section's parameter filter follows the item-area toolbar mode its kind declares at
registration: both toolbar-rendering modes present the same compact package-owned filter, while
`hidden` presents none and leaves that list in its ordinary unfiltered context. The built-in
`workspace.focus-item-filter` operation, bound to `Mod + K` by default, focuses the sole active
section's rendered filter; with any other number of active sections, or where the declared item
area renders no filter, it declines and leaves the chord to the browser. That filter's accessible
name stays **Filter parameters**, and while its section is the sole active one its empty input
advertises whichever chord the registry currently resolves for that operation — so rebinding or
unbinding it through `registerWorkspaceKeyBindings(host, bindings)` changes the advertisement as
well as the dispatch, and an unbound operation leaves the ordinary **Filter** text. Where the filter
renders, its query is local view state and never mutates or notifies the canonical document. Fuzzy
matching uses built-in `presentation.label` values and preserves document order while revealing a
matching item's ancestor path. Custom opaque items participate only when their owning section kind
registers `getItemSearchableText({ section, item })`; both snapshots are deeply frozen, and the
callback must return one string. The narrow section snapshot contains its id, kind, name, and
opaque data; the item snapshot is complete. An active filter disables item drag-and-drop and
structural keyboard moves, retains canonical selection with an explicit hidden-selection notice,
preserves the list's scroll position and surviving editor instances, and provides clear actions in
both the search control and empty result.

`WorkspaceItemList.itemDiagnostics` accepts one complete section-scoped registry of error, warning,
and information messages. The package validates the entire replacement before rendering it,
chooses the highest-severity row treatment, reserves space for a compact non-color status icon, and
exposes every severity and message through the same held-Q quick-info surface and an in-row
screen-reader description. Releasing Q removes the visual surface without changing selection or
editor focus. A persistent polite live region announces additions, message or severity updates,
and clearing without moving focus.
An unknown id fails on first registration. If a canonical deletion removes a diagnosed item before
the host's asynchronous state catches up, that previously valid entry stays dormant only while the
host continues supplying it; clearing the entry also clears that temporary compatibility record.

Diagnostics are host view input only. They do not enter `WorkspaceDocument`, receive automatic
reload persistence, publish a canonical document, define validation rules, or start asynchronous
work. A host replaces the React prop when its own validation state changes and owns any persistence:

```tsx
const itemDiagnostics = {
  "retry-count": [
    { severity: "error", message: "Choose a retry count from 0 through 5." },
    { severity: "info", message: "Changes apply to the next request." },
  ],
} satisfies WorkspaceItemDiagnosticRegistry;

<WorkspaceItemList
  sectionId="request-options"
  listKey="main"
  topLevelItemIds={topLevelItemIds}
  itemDiagnostics={itemDiagnostics}
/>;
```

## Section kind registration

`registerSectionKinds(host, kinds)` replaces the registered application kind set; hosts register
every kind once, before loading or rendering documents that use them. A
`SectionKindDefinition` maps a kind to its content renderer (the section body inside the
package-owned shell, chrome, and header), an optional header icon component (kinds without one
render the reference's gg-menu fallback glyph), an optional default size, and optional size
constraints. The default is applied when a loaded section omits `size` (kinds without one load at
the reference's auto/auto default; emitted documents always carry resolved sizes). Groups are the
one package-owned kind and cannot be registered.

`setWorkspaceSectionSize(host, sectionId, nextSize)` is the direct host resize funnel and applies
the registered constraints before one publication. Sections may carry application-owned opaque
serializable `data` (JSON values): the package round-trips it through the document and hands it to
the kind's renderer without reading it. A kind may also register `renderInspector(context)` for
host-owned configuration. The context is a deeply frozen snapshot that discriminates a selected
section from a selected custom item plus its owning section; it exposes no package store, live
canonical object, or private selector.

An ordinary kind may register `getSectionSearchableText(section)` to contribute explicit safe text
to global Find. Its detached, deeply frozen snapshot contains only `id`, `kind`, `name`, and opaque
`data`; the callback returns one string and cannot mutate the document. Meta-control kinds cannot
register this callback. Section name and kind remain searchable without it.

`WorkspaceSectionHeaderAction` is the package-owned primitive for a host action contributed through
`renderHeaderControls(section)`. It supplies the same compact touch target, focus ring, tooltip,
disabled treatment, and default or section-themed light/dark styling as the built-in header
controls. The host supplies the accessible label, icon, busy state, and effect; Workspace does not
interpret the action.

An ordinary kind whose sections carry an `itemTree` must declare its item-area presentation:

```ts
itemArea: {
  renderLeadingContent?: (section) => ReactNode,
  toolbar: "authoring-and-filter" | "filter-only" | "hidden",
}
```

The package renders one coherent item area in this exact order: `renderLeadingContent(section)`
when present, the toolbar selected by the declared mode, then `renderContent(section)`. One
package-owned item-filter provider wraps all three regions. A kind that declares
`renderLeadingContent` composes its toolbar under that slot, so the toolbar takes the reference's
compact block spacing and the two surfaces meet; a kind that declares none keeps the ordinary
toolbar's own step, because its toolbar opens the item area directly under the section header. That
spacing follows the composition the kind declares, not the toolbar mode it selects and not anything
the slot renders. `authoring-and-filter` keeps the full
Args toolbar; `filter-only` renders the same Args/filter surface without the Add, Remove, and
Delete actions; `hidden` renders no toolbar while the item list keeps its ordinary unfiltered
context, so the parameter filter described above is present in exactly the two rendering modes. A
rendered toolbar carries `data-workspace-item-toolbar` with its declared mode: that attribute is
the one documented hook for observing the selected mode, and no other toolbar structure is public.
The mode is never inferred from a missing item factory, a locked section, an item count, or
application data — a section that carries items whose kind declares no item area fails at load and
at render, and a meta-control kind cannot declare one. The leading slot is content-agnostic: the
package places it and never interprets what it renders.

A `TextValueEditor` states which of its two placements it means: `item-row` for a parameter control,
or `section-field` for the compact field a section renders in that leading slot. The package owns
the section field's whole surface — the reference's rounded box, its 12px monospace type, its focus
border, and the layout gutter for one optional caller-owned end adornment, whose content and ARIA
stay with the caller. Both editor layers share that one box and type owner, so activating the field
changes only its border colour. The field owns no block margin, so it begins at the section
header's own boundary and the item toolbar begins at the field's, exactly as the reference
composes them; a host that wants space around it gives that space to its own content. The rendered
field carries `data-workspace-section-field`: that attribute is the one documented hook for
observing or capturing the surface, and no field class,
inner structure, or CodeMirror internal is public.

Both placements share the reference's editing keys. A supplied `completionProvider` offers its
options in a popup the canvas parents beside its scene rather than inside the section that would
clip it, so a popup taller than a compact field is fully visible and still pans and zooms with the
scene. The canvas renders that parent per host: a consumer never passes, names, or opts into one,
and no CodeMirror element, extension, or tooltip option crosses the package root. The popup takes
Tab to accept one option and the first Escape to close itself. An
unmodified Enter belongs to a declared `onCommit`, popup or no popup, so a single-line field
commits the draft it is showing rather than needing a second press; a control that declares no
`onCommit` leaves that Enter to the popup. The Escape that reaches the editor reports to the
optional `onEscape` before the package returns focus to the owning section: a caller holding an
uncommitted draft restores its own canonical value there, because the package never guesses one.

An ordinary kind whose sections carry an `itemTree` may also register `createItem(context)`. The host
returns one complete serializable item with a stable ID, empty `children`, and its domain defaults;
`context.section` is a detached, deeply frozen snapshot. `insertWorkspaceItem`,
`deleteWorkspaceItems`, `deleteLastWorkspaceItem`, and `deleteSelectedWorkspaceItems` are the
canonical public operations used by the package toolbar, item menu, Inspector, and direct host
actions. The package appends insertions at the item root, validates the complete next tree, updates
selection and focus, and reports exactly one document publication. The operations reject
unavailable structure capability, locked sections, and active item drags before invoking a factory
or writing.
A kind without a factory remains readable and deletable: the `authoring-and-filter` toolbar disables
its Add parameter control, while `filter-only` and `hidden` render no toolbar Add control at all.
The declared mode selects that toolbar and nothing else. It never changes structure capability, the
registered factory, or these canonical operations, which the item menu, Inspector, and direct host
actions keep calling under their own rules in every mode.

That ordinary kind may also register `getItemSearchableText(context)` for custom opaque items.
Built-in items always use their package-owned label. The section-local parameter filter invokes the
callback for custom rows only while its query is nonblank; global Find invokes it while the Find
surface is open to build that host's current index. It receives the same kind of detached, deeply
frozen public section and item snapshots as the other host contribution seams. The imperative item
operations all take the host first, for example `insertWorkspaceItem(host, sectionId)` and
`deleteWorkspaceItems(host, sectionId, itemIds)`.

A kind whose `data` has a real shape may register `assertValidData(section)`. The package runs it
once per section of that kind at load, before the document is published, so a malformed document
fails at the boundary instead of on first paint. An ordinary kind may also register
`renderHeaderControls(section)`, placed in the header's trailing control group ahead of lock,
minimize, and delete. A meta-control kind renders no section header and cannot register one.

A kind whose `presentation.type` is `"meta-control"` projects its opaque data to a package
`MetaControlKind` and supplies the host callback for the outboard edit affordance. The package then
owns the transparent headerless shell, drag/resize chrome, control minimums, and omitted-size
default; such a kind cannot register a competing `defaultSize`. `MetaControl` exports controlled
definitions for Button, Text, TextArea, Date, Time, Slider, Rotary, Switch, Color, Dropdown,
Password, and Dropzone. Values, actions, configuration, attachment metadata, and persistence cross
explicit host callbacks. The ordinary inner default is 200 x 44 (202 x 46 including the shell
border); TextArea defaults to 200 x 98, Dropzone to 240 x 120, and Dropdown, Password, and Slider
keep frozen main's auto-only height policy. Unknown projected or rendered control kinds fail
specifically instead of displaying a fallback.

Ordinary renderers return their content only. The package wraps that result in the correct
header-below body slot; consumers must not add `section-full-no-title` or any other package grid
class. For example:

```tsx
registerSectionKinds(host, {
  note: {
    renderContent: (section) => <Note data={section.data} />,
    getSectionSearchableText: (section) => readNoteSearchText(section.data),
    icon: NoteIcon,
    defaultSize: { width: 240, height: 140 },
    contentClassName: "note-content",
  },
  parameters: {
    renderContent: (section) => <ParameterRows section={section} />,
    itemArea: { toolbar: "authoring-and-filter" },
    getItemSearchableText: ({ item }) => readCustomSearchText(item.data),
    createItem: ({ section }) => ({
      id: `${section.id}-${crypto.randomUUID()}`,
      children: [],
      presentation: {
        label: "parameter",
        labelEditable: true,
        control: {
          kind: "code",
          value: "",
          configuration: {
            autocomplete: "off",
            disabled: false,
            language: "python",
            placeholder: null,
            singleLine: false,
            wrapLines: true,
          },
        },
      },
    }),
  },
});
```

Set `labelEditable` to `false` for a positional or otherwise fixed parameter name. The package
then renders a static label, omits the rename editor from keyboard navigation, and rejects label
mutations while leaving the value control editable.

## Built-in content sections

Two content sections ship with the package. They are opt-in: `createWorkspaceTextSection()` and
`createWorkspaceCodeSection()` each return an ordinary `SectionKindDefinition`, registered under
the package-reserved kind IDs `WORKSPACE_TEXT_SECTION_KIND` and `WORKSPACE_CODE_SECTION_KIND` in
the same `registerSectionKinds` call a host makes for its own kinds. Nothing registers itself, and
a host may register either, both, or neither. Leaving one out is a supported composition: the rest
of the workspace is unaffected, and a document naming the unregistered kind fails through the
package's existing unknown-kind contract rather than rendering a placeholder.

Their `data` is package-owned rather than opaque. `createWorkspaceTextSectionData` and
`createWorkspaceCodeSectionData` build a complete serializable value from partial creation
defaults, `getWorkspaceTextSectionData(host, ...)`/`getWorkspaceCodeSectionData(host, ...)` read one
back as a validated type, and `setWorkspaceTextSectionData(host, ...)`/
`setWorkspaceCodeSectionData(host, ...)` write one through the same controlled document path and
single publication as every other canonical operation. Both contracts are parsed at load and
rejected there when malformed or outside what the registration allows.

The Text section carries `text`, `format` (`plaintext` or `markdown`), `displayMode` (`edit` or
`render`), `fontSizePx`, and `readOnly`. Its edit mode is the package's CodeMirror editor; its
rendered mode is GitHub-flavored Markdown with tables, task lists, inline code, fenced code with
language-aware highlighting and a copy button, and KaTeX math, with raw HTML never parsed, or a
whitespace-preserving block for plain text. The Code Editor section carries `code`, `language`,
`wrapLines`, `lineNumbers`, `indentWidth`, and a required `mode` over the package's language set:
Python, Bash, JavaScript, TypeScript, JSON, YAML, TOML, Markdown, and plain text. `mode` is one of
`editable`, `read-only`, or `generated-document`. A `read-only` section keeps the text selectable,
copyable, and scrollable, and stops being an editing surface rather than leaving a caret in one
that refuses every keystroke: the wrapper stays the section's focus target, says it is read-only in
its accessible name, and Enter no longer reaches into an editor. A `generated-document` section
also carries `generatedRegion`, one `{ from, to }` range of UTF-16 CodeMirror offsets into its own
`code`; the package never infers it from the text, and a missing, empty, reversed, fractional, or
out-of-document range — like a region declared on an ordinary mode, or a generated document that
declares none — is rejected at the same data boundary. Only the lines that range covers are
painted as machine-written output, with the reference's blue region, its leading rail, and its
compact uppercase generated/read-only badge centred on the block's upper boundary. Declare the
range the way the reference's own protected range runs — from the end of the text before it to the
start of the text after it — because those two boundary lines carry a lip of the block rather than
a full band. Text outside the range keeps the ordinary editor's paint, and so does a section taller
than its document.

The text outside that range is authored: a generated document is an ordinary editing surface, and
the range is what it refuses. A user transaction is accepted only when every one of its changes
lies wholly before or wholly after the range, so typing, paste, cut, deletion, replacement, undo,
and redo across it are refused whole rather than partly applied, and the block says so with a
`not-allowed` cursor while staying selectable and copyable. An accepted edit maps the range through
its own changes — text inserted at either boundary belongs to the outer text — and the section is
told the next `code` and the mapped `generatedRegion` together, so its data never describes a
region that has moved out from under it. Cursor motion steps over the block, and a pointer press
inside it leaves the caret at the nearer end, because there is nowhere inside it for the next
character to go. Locking a section makes an `editable` section read-only and a generated document
non-editable throughout, keeping the block's paint; it never turns an ordinary section into a
generated document. Both sections share that editor, so a read-only or locked Text section is
non-editable the same way. The rendered surface carries
`data-workspace-section-editor` with the presentation it resolved to, and each line of a generated
block carries `data-workspace-generated-line` with its position in that block (`start`, `middle`,
`end`, or `only` when the region begins and ends on one line): those two attributes are the
documented hooks for observing or capturing it, and no editor class, inner structure, or CodeMirror
internal is public.

Registration options are how a host customizes them:

```tsx
registerSectionKinds(host, {
  ...hostKinds,
  [WORKSPACE_TEXT_SECTION_KIND]: createWorkspaceTextSection({
    icon: NotesIcon,
    defaultSize: { width: 420, height: 200 },
    formats: ["markdown"],
    displayModes: ["render"],
    renderInspector: (context) => <TextSectionSettings context={context} />,
  }),
  [WORKSPACE_CODE_SECTION_KIND]: createWorkspaceCodeSection({
    languages: ["python", "json"],
    onSubmit: (sectionId, data) => applyCode(sectionId, data.code),
    renderHeaderControls: (section) => <ApplyCodeControl section={section} />,
    renderInspector: (context) => <CodeSectionSettings context={context} />,
  }),
});
```

`icon` replaces the header glyph the section otherwise paints from its own format or language, and
`defaultSize` applies when a loaded section omits its size. `formats`, `displayModes`, and
`languages` narrow what the registration accepts: a document, or a later typed write, naming a
choice outside the list fails explicitly. A single-mode `displayModes` list forces that mode and
leaves the header's edit/render control out; `showDisplayModeControl: false` leaves the control out
while both modes stay authorable, for a host that drives the mode from its own UI. Labels and the
creation surface stay host-owned: sections carry the `name` the host gives them, and whether either
built-in appears in a creation menu is decided by the host's own
`registerWorkspaceCreationCommands(host, commands)` catalog, which builds the section with these
creation defaults.

An optional Code registration `onSubmit(sectionId, data)` receives the exact current controlled
data when an editable, unlocked editor handles Ctrl-Enter or Command-Enter. The editor publishes
any pending text through its ordinary document mutation before calling the host. The chord is
consumed ahead of completion handling; plain Enter, composition, read-only mode, and a locked
section do not submit. The callback is only an effect seam: persistence, validation, loading state,
diagnostics, and retry policy remain application responsibilities. `renderHeaderControls` can pair
that shortcut with a visible action without coupling either behavior to the built-in editor.

Their presentation ships in the one compiled stylesheet. The rendered Markdown surface compiles
from the Tailwind typography plugin under the package-owned `setta-prose` class name, and KaTeX's
own presentation rules are folded into the same sheet, scoped to the workspace surface and carrying
their faces inline. Consumers import no dependency CSS, resolve no dependency fonts, and add no
bundler configuration for either section.

## Build and consumption

Consumers install the compiled package: the `exports` map serves ESM with a source map
(`dist/index.js`), TypeScript declarations (`dist/types/`), and the compiled scoped stylesheet
(`@setta/workspace/styles.css`). `pnpm --filter @setta/workspace build` produces `dist/` —
`vite build` bundles the runtime with every dependency external, `tsc -p tsconfig.build.json`
emits declarations, the Tailwind CLI compiles the stylesheet from package source alone,
`scripts/compile-katex-styles.mjs` folds KaTeX's presentation rules into that stylesheet scoped
and with its faces inlined, and `scripts/check-package-boundary.mjs --built` verifies the artifact
imports and stylesheet scoping. The quality gate typechecks the playground against the built
declarations, so build before running it on a fresh tree.

The compiled stylesheet is the package's only stylesheet: the built entry imports no dependency
CSS, so a consumer never resolves one, never resolves a dependency font, and a host that registers
neither built-in content section still receives a coherent bundle.

The stylesheet ships without global Tailwind Preflight: every rule is class-scoped, and the
Preflight subset the package's own elements rely on is scoped under the `setta-workspace`
marker class (`src/styles/scopedBase.css`), which the package applies to every root it
renders — the canvas, the toolbar and tooltip surfaces, and the drag overlays portaled to
`document.body`. Hosts need no Tailwind setup; the optional `@setta/workspace/tailwind-preset`
export exists for hosts that want the setta palette in their own chrome, as the playground
does. Host page context (fonts, background) stays host-owned, as in the reference application.

The manifest is deliberately exports-only: it has no duplicate top-level `main`, `module`,
`types`, `typings`, or `typesVersions` path. TypeScript consumers use a package-exports-aware
resolution mode (`"bundler"`, `"node16"`, or `"nodenext"`). CommonJS and legacy
`moduleResolution: "node"` consumption are outside this ESM package contract.

The package remains private and unpublished. Publication metadata and a final package-name decision
are intentionally absent.
