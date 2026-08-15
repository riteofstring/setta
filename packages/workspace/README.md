# @setta/workspace

The Setta workspace UI, extracted as a standalone TypeScript/React package. Phase 5 ratified the
package surface exported from `src/index.ts`; package-relative modules are implementation details.
`@setta/workspace` remains the confirmed working name for this local, unpublished extraction. It is
not a final publication-name decision.

The runtime owns one workspace document and its interaction state. A host registers section kinds,
loads the controlled serializable document, configures the package-owned appearance controller,
capability store, and interaction store, and mounts the integrated shell or an intentionally
standalone canvas.
Package changes may still change this unpublished API directly; no compatibility aliases or
transition paths are provided.

## Public composition surface

- `WorkspaceShell` is the package-owned integrated surface. It composes the canvas, controls,
  tooltip, logical leading/trailing rails, controlled panes, the built-in leading Outline, and the
  built-in trailing Inspector. Hosts register additional typed tabs with icons and content rendered
  from public props only. Its optional `sectionTagColorPalette` is the complete host-supplied set of
  named Inspector categories; omitting it uses the captured package defaults.
- `createWorkspaceShellViewState` creates the initial serializable pane state. Hosts own that value
  and apply the shell's single `onViewStateChange` callback directly or persist it separately from
  `WorkspaceDocument`. The same value owns Outline disclosure and roving-focus state; canonical
  section selection remains in the workspace document.
- `WorkspaceCanvas`, `WorkspaceControls`, and `WorkspaceTooltip` remain public for a host that
  intentionally does not want the integrated shell. The canvas fills its host element; a
  standalone host owns the other surfaces' placement.
- `registerSectionKinds` is the section extension point. Each kind supplies opaque-content
  rendering, an optional icon, an optional default size, and an optional typed Inspector
  contribution for custom section or item content. Ordinary content is automatically placed in the
  package-owned body slot; `contentClassName` adds host padding or layout to that wrapper without
  exposing the section grid vocabulary.
- `WorkspaceItemList` and `ItemDndContext` render item trees. Items with a typed `presentation`
  use the package's editable label and built-in control directly; a list needs `renderItem` only
  for custom opaque items. Its optional `itemDiagnostics` registry supplies ephemeral host
  validation keyed by stable item id. `WorkspaceItemLabel` remains the grid-safe label helper for
  that custom renderer extension.

Host application navigation and modal state stay outside the shell. Registered pane content may
use its own application state, but receives no package store, XYFlow panel, dnd-kit store, Tailwind
utility, or package-private DOM selector as an extension API.

## Controlled workspace shell

The built-in `Outline` is always the first leading tab and the built-in `Inspector` is always the
first trailing tab; `WORKSPACE_OUTLINE_TAB_ID` and `WORKSPACE_INSPECTOR_TAB_ID` are their reserved
ids. A host supplies zero or more additional tabs on either side with unique stable ids, non-empty
labels, decorative icon components, and render functions. The selected tab, visibility, current
width, remembered non-full width, Outline disclosure, and Outline keyboard focus are controlled
serializable view state, deliberately separate from the canonical workspace document.

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
      leadingTabs={leadingTabs}
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
`leadingPaneCameraMode="preserve-screen-position"` to counter-pan when the leading pane changes
width; the default `"shift-with-pane"` leaves the canvas camera unchanged as its actual center box
moves.

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
one typed item
exposes its editable label, ordinary UI type, and only that type's valid configuration. Its
canonical live value control remains in the section on the canvas rather than being duplicated in
the Inspector. Compact configuration rows commit each valid field or list action immediately;
invalid numeric/text drafts remain local until corrected or canceled with Escape. Dropdown and
color choices use dedicated item editors rather than JSON, and date/time options appear only when
their selected mode uses them. Multiple sections expose only compatible batch lock/unlock, group,
ungroup, and delete actions, including an explicit mixed lock state. Every mutation uses the
existing document funnels and change callback. Custom
section or item data is never decoded: the owning section kind receives a read-only
`WorkspaceInspectorContributionContext`, or the pane shows an explicit unsupported state. The
Inspector owns inline validation, Escape restoration for its configuration fields, and a persistent
polite mutation/selection status.

## Context-menu extensions

The canvas mounts package-owned pane, section, selection, item, and Outline menus. Register the
complete host-owned command and action sets before mounting the canvas. Each registration call
replaces its prior set, matching the package's other registries.

```tsx
registerWorkspaceCreationCommands([
  {
    id: "host-note",
    label: "Note",
    group: "Host",
    createSection: ({ workspacePosition }) => ({
      id: crypto.randomUUID(),
      kind: "note",
      name: "Note",
      data: { text: `Created at ${workspacePosition.x}, ${workspacePosition.y}` },
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

registerWorkspaceMenuActions([
  {
    id: "host-section-details",
    scope: "section",
    label: "Show host details",
    onSelect: ({ section, selectedSections }) =>
      showHostDetails(
        section.id,
        selectedSections.map(({ id }) => id),
      ),
  },
]);
```

Creation factories receive the invocation point already converted into workspace coordinates. The
package validates the returned top-level section, resolves its registered default size, inserts and
selects it through one atomic document commit, and reports one document change. Additional actions
may target `pane`, `section`, `item`, or `outline`; callbacks receive a deeply frozen public snapshot
and no package store or private selector. A section-scoped action also makes ordinary section
header icons into menu buttons; kinds without package or host header actions keep their decorative
icon. Group header menus begin with the package-owned checked overflow mode and ungroup actions,
followed by section-scoped host actions. The package retains native context menus for inputs,
editors, links, buttons, and explicit no-drag surfaces. Other menu owners support pointer, Context
Menu key, and Shift+F10 invocation with viewport-edge placement, Escape dismissal, and focus
restoration. Header menu buttons additionally support Arrow Down/Up to open at the first or last
enabled item.

Group header, section context-menu, Outline, Inspector, Shift+Cmd/Ctrl+G, and direct host
invocations all call the public `ungroupSections(groupIds)` operation. It rejects an unavailable
structure capability and any missing, locked, non-group, mixed, or inconsistent request before
changing the document. Nested children replace their group at the same parent position. Top-level
children retain the group origin and receive fresh frontmost stacking positions in child order.
Surviving selection is preserved, focus moves predictably from a removed group, and the host
receives exactly one document-change notification.

`WorkspaceSection.overflowMode` is the explicit reload-stable group layout mode: `false` keeps the
group intrinsic, while `true` applies each positive numeric `size` dimension as a fixed border-box
bound and scrolls the existing child subtree inside it. A dimension reset to `"auto"` remains
intrinsic while overflow mode stays enabled, matching resize-handle reset behavior. Every canonical
section carries the boolean, and non-groups keep it `false`. A host calls
`setGroupOverflowMode(groupId, enabled)`;
enabling a group whose width or height is `"auto"` first promotes only those dimensions from the
mounted outer group rectangle, so the visible size does not jump. Numeric bounds survive disabling
and can be re-enabled without a remeasure. The operation validates layout capability, group
identity, lock state, and required live
measurement before one document write and one notification. The persistent child surface keeps
nested drop targets and scroll position intact, and takes wheel ownership only when it actually
overflows. The group header, section/Outline context menus, Inspector, and direct hosts all call
this operation.

`setSectionTagColor(sectionId, color)` is the one tag-color mutation used by the Inspector and
direct hosts. It accepts `null` to reset to none and canonicalizes a six-digit RGB hex color before
one document write and one notification. It rejects unavailable layout capability, a locked or
missing section, and malformed color input before writing. `DEFAULT_SECTION_TAG_COLOR_PALETTE`
exports frozen main's Red, Orange, Yellow, Green, Cyan, Blue, Purple, and Slate categories. A
`WorkspaceShell` host may replace the complete Inspector palette with uniquely colored, named
categories, including an empty host-owned set; the package validates and freezes that input, while
reusable palette editing and persistence remain host-owned. A valid document color outside the
current palette stays visible as an explicit Custom choice rather than silently selecting another
category.

Custom interactive renderer content uses only the four exported interaction-boundary constants:
`NO_DRAG_CLASS_NAME` prevents section/item drag activation and `NO_PAN_CLASS_NAME` preserves the
element's pointer interaction. `NO_WHEEL_CLASS_NAME` preserves browser-native wheel behavior such
as scrolling. `MANUAL_WHEEL_CLASS_NAME` is for controls with an `onWheel` handler: the control still
receives the event, while the canvas synchronously prevents Chrome from latching horizontal
Back/Forward navigation. Package controls apply these boundaries themselves.

## Peer dependencies

React and React DOM are host-provided peers with the documented compatible range `^19.1.0`:
the frozen product reference runs `react 19.1.1`, and the package uses React 19 ref-as-prop
components, so React 18 and below are not supported. All other runtime dependencies are
exact-pinned under the repository dependency policy.

The menu primitive is exact-pinned at `@radix-ui/react-dropdown-menu 2.1.15`. Frozen main uses
`2.1.2`, but that release resolves `react-remove-scroll 2.6.0`, whose peer range excludes the
package's React 19 host contract. The retained patch release preserves the same menu primitive while
resolving the React-19-compatible `react-remove-scroll 2.7.2` graph.

## Appearance and semantic color

Call `setWorkspaceColorMode("light" | "dark" | "system")` before the first document load. Light
and dark resolve immediately. System mode reads `(prefers-color-scheme: dark)` and stays subscribed
until an explicit mode replaces it; it requires `window.matchMedia`, so server-rendered hosts choose
an explicit mode and select system after hydration. Invalid modes fail specifically. Appearance
changes rebuild projected style-color backgrounds as well as re-rendering mounted chrome; they do
not report a document change because appearance is view state, not serialized workspace state.

```tsx
setWorkspaceColorMode("system");

function HostChrome() {
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  return <div data-appearance={darkMode ? "dark" : "light"}>{/* host UI */}</div>;
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
reduced preference. Package-owned d3 camera commands resolve requested durations to zero as well.
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

## Controlled document and change callback

`loadWorkspaceDocument(document)` replaces the canonical workspace state with a host-supplied
serializable document (sections, top-level layout, camera, selection). A load on a mounted
canvas re-applies the loaded camera through d3-zoom — or re-arms fit-on-init when the loaded
`viewport` is `null` — and force-ends any drag session, so a host can swap documents without
remounting `WorkspaceCanvas`.

`setWorkspaceDocumentChangeCallback(callback)` registers the host notification for
package-initiated canonical commits: selection, move, resize, rename, the header flag toggles,
color-tag edits, delete, drag-end layout writes, measurement writes, and viewport mirrors. Each commit invokes
the callback once with the full serializable document (`getWorkspaceDocument()` returns the
same snapshot on demand). Notification cadence matches the reference's canonical writes — the
reference debounces only its network transport, so viewport pans and measurement passes notify
per commit and any debouncing is host policy. Loads never notify: the callback reports the
package's changes, not echoes of the host's own writes. The callback must not mutate the
workspace synchronously; apply host reactions (including rejecting a change by re-loading the
authoritative document) asynchronously. Snapshots share store state — treat them as immutable.

Registered renderers commit host-owned payloads through `setSectionData(sectionId, data)` and
custom item renderers through `setItemData(sectionId, itemId, data)`. Both replace one opaque
payload, preserve package-owned structure, and issue one canonical document notification. A typed
item rejects `setItemData`; its label, scalar value, complete control presentation, and typed
configuration use `setItemLabel`, `setItemValue`, `setItemPresentation`, and
`setItemControlConfiguration` respectively. Optional help uses `setItemHelpText`; passing `null`
removes the field. Each accepted call publishes once.

Sections with a `WorkspaceSectionItemTree` also carry the package-owned item-column layout. An
omitted `itemColumnWidth` derives the live half-width split; dragging any row's shared center
divider persists the authored width on the tree, and double-clicking resets it. The split is shared
across the section, stays proportional while its container resizes, accounts for canvas zoom and
the deepest nested item, preserves at least 100 px for the value column, and reports drag/reset
commits through the same document-change callback. Consumers do not set the private
`--param-column-width` CSS variable. The first visible divider in a mounted list joins the keyboard
order: Left/Right Arrow adjusts by 10 px (Shift adjusts by 1 px), while activating the button resets
the default split. Left/Right describe visual movement and therefore mirror under RTL. The remaining
identical row targets stay pointer-accessible without adding one tab stop per row.

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
nonblank value adds a compact native button to the parameter row. Its Radix portal escapes nested
section and bounded-group overflow, clamps and wraps at compact widths, preserves an active editor
when opened by pointer, and exposes the same content through the button's accessible description.

Changing UI type directly uses `setItemPresentation` with the complete next control (kind, value,
and configuration); callers outside the integrated Inspector still supply that complete value. The
Inspector applies its explicit valid default for the chosen ordinary type, preserving the previous
value only where that type accepts it, and then exposes the full type-specific configuration for
editing. Configuration-only edits carry their current kind to `setItemControlConfiguration`, so a
stale Inspector write fails instead of applying options to the wrong control.

Browser and host actions are intentionally not serializable. `registerItemHandlers([...])` replaces
the explicit handler set keyed by section and stable item id; register it before mounting those
rows. Replacing handlers does not mutate or notify the document. A built-in dropzone requires
accepted and rejected-result handlers and may register server-picker and attachment-removal
callbacks. A password may register a saved-value reveal action; its pending flag stays in the
serializable configuration. Scalar controls and labels need no handler registration. Custom items
remain valid through `data` plus `WorkspaceItemList.renderItem`, and missing custom renderers fail
specifically.

Every item-tree section receives a compact package-owned parameter filter. Its query is local view
state and never mutates or notifies the canonical document. Fuzzy matching uses built-in
`presentation.label` values and preserves document order while revealing a matching item's ancestor
path. Custom opaque items participate only when their owning section kind registers
`getItemSearchableText({ section, item })`; both snapshots are deeply frozen, and the callback must
return one string. The narrow section snapshot contains its id, kind, name, and opaque data; the
item snapshot is complete. An active filter disables item drag-and-drop and structural keyboard moves,
retains canonical selection with an explicit hidden-selection notice, preserves the list's scroll
position and surviving editor instances, and provides clear actions in both the search control and
empty result.

`WorkspaceItemList.itemDiagnostics` accepts one complete section-scoped registry of error, warning,
and information messages. The package validates the entire replacement before rendering it,
chooses the highest-severity row treatment, reserves space for a compact non-color status icon, and
exposes every severity and message through an accessible description and portaled disclosure.
Pointer disclosure preserves the active editor; keyboard focus stays on the native trigger; if a
focused trigger is cleared asynchronously, focus moves to its stable row. A persistent polite live
region announces additions, message or severity updates, and clearing without moving focus.
An unknown id fails on first registration. If a canonical deletion removes a diagnosed item before
the host's asynchronous state catches up, that previously valid entry stays dormant only while the
host continues supplying it; clearing the entry also clears that temporary compatibility record.

Diagnostics are host view input only. They do not enter `WorkspaceDocument`, receive automatic
reload persistence, invoke the document-change callback, define validation rules, or start
asynchronous work. A host replaces the React prop when its own validation state changes and owns
any persistence:

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

`registerSectionKinds(kinds)` replaces the registered application kind set; hosts register
every kind once, before loading or rendering documents that use them. A
`SectionKindDefinition` maps a kind to its content renderer (the section body inside the
package-owned shell, chrome, and header), an optional header icon component (kinds without
one render the reference's gg-menu fallback glyph), and an optional default size, applied
when a loaded section omits `size` (kinds without one load at the reference's auto/auto
default; emitted documents always carry resolved sizes). Groups are the one package-owned
kind and cannot be registered. Sections may carry application-owned opaque serializable
`data` (JSON values): the package round-trips it through the document and hands it to the
kind's renderer without reading it. A kind may also register `renderInspector(context)` for
host-owned configuration. The context is a deeply frozen snapshot that discriminates a selected
section from a selected custom item plus its owning section; it exposes no package store, live
canonical object, or private selector.

An ordinary kind whose sections carry an `itemTree` may register `createItem(context)`. The host
returns one complete serializable item with a stable ID, empty `children`, and its domain defaults;
`context.section` is a detached, deeply frozen snapshot. `insertWorkspaceItem`,
`deleteWorkspaceItems`, `deleteLastWorkspaceItem`, and `deleteSelectedWorkspaceItems` are the
canonical public operations used by the package toolbar, item menu, Inspector, and direct host
actions. The package appends insertions at the item root, validates the complete next tree, updates
selection and focus, and reports exactly one document change. A kind without a factory remains
readable and deletable, while its Add parameter controls are disabled.

That ordinary kind may also register `getItemSearchableText(context)` for custom opaque items.
Built-in items always use their package-owned label, so the callback is invoked only for custom
rows while a nonblank filter is active. It receives the same kind of detached, deeply frozen public
section and item snapshots as the other host contribution seams.

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
registerSectionKinds({
  note: {
    renderContent: (section) => <Note data={section.data} />,
    icon: NoteIcon,
    defaultSize: { width: 240, height: 140 },
    contentClassName: "note-content",
  },
  parameters: {
    renderContent: (section) => <ParameterRows section={section} />,
    getItemSearchableText: ({ item }) => readCustomSearchText(item.data),
    createItem: ({ section }) => ({
      id: `${section.id}-${crypto.randomUUID()}`,
      children: [],
      presentation: {
        label: "parameter",
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

## Consumption during extraction

Consumers install the compiled package: the `exports` map serves ESM with a source map
(`dist/index.js`), TypeScript declarations (`dist/types/`), and the compiled scoped stylesheet
(`@setta/workspace/styles.css`). `pnpm --filter @setta/workspace build` produces `dist/` —
`vite build` bundles the runtime with every dependency external, `tsc -p tsconfig.build.json`
emits declarations, the Tailwind CLI compiles the stylesheet from package source alone, and
`scripts/check-package-boundary.mjs --built` verifies the artifact imports and stylesheet
scoping. The quality gate typechecks the playground against the built declarations, so build
before running it on a fresh tree.

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

The package is local and unpublished for the duration of the extraction plan.
