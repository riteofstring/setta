# @setta/workspace

The Setta workspace UI, extracted as a standalone TypeScript/React package. Phase 5 ratified the
package surface exported from `src/index.ts`; package-relative modules are implementation details.
`@setta/workspace` remains the confirmed working name for this local, unpublished extraction. It is
not a final publication-name decision.

The runtime owns one workspace document and its interaction state. A host registers section kinds,
loads the controlled serializable document, configures the package-owned appearance controller,
capability store, and interaction store, and mounts the independently composable canvas surfaces.
Package changes may still change this unpublished API directly; no compatibility aliases or
transition paths are provided.

## Public composition surface

- `WorkspaceCanvas` renders the spatial document, package section chrome, drag/drop contexts,
  background, and configured minimap. It fills the host element that contains it.
- `WorkspaceControls` is the accepted compact viewport/minimap toolbar. The host chooses its pane
  and placement; the playground and packed consumer mount it in their own left rail.
- `WorkspaceTooltip` is the package overlay for the held-Q control tooltips and is mounted once as a
  sibling of the host workspace shell.
- `registerSectionKinds` is the section extension point. Each kind supplies opaque-content
  rendering, an optional icon, and an optional default size. Ordinary content is automatically
  placed in the package-owned body slot; `contentClassName` adds host padding or layout to that
  wrapper without exposing the section grid vocabulary.
- `WorkspaceItemList` and `ItemDndContext` are the registered item-tree extension point.
  `WorkspaceItemLabel` places host-styled leaf and group labels without exposing item-grid classes;
  the built-in value/name controls own their corresponding placements and interactions.

Host panes remain ordinary siblings around the canvas, and host overlays remain ordinary siblings
or portals owned by the host. This keeps application navigation, configuration panels, and modal
state out of the workspace document while allowing them to use the document callback and exported
controller stores. XYFlow panels, dnd-kit stores, Tailwind utility names, and package-private DOM
selectors are not extension APIs.

Custom interactive renderer content uses only the three exported interaction-boundary constants:
`NO_DRAG_CLASS_NAME` prevents section/item drag activation, `NO_PAN_CLASS_NAME` preserves the
element's pointer interaction, and `NO_WHEEL_CLASS_NAME` preserves its wheel behavior. Package
controls apply these boundaries themselves.

## Peer dependencies

React and React DOM are host-provided peers with the documented compatible range `^19.1.0`:
the frozen product reference runs `react 19.1.1`, and the package uses React 19 ref-as-prop
components, so React 18 and below are not supported. All other runtime dependencies are
exact-pinned under the repository dependency policy.

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

The derived primary text/background pairing is kept at WCAG AA contrast. `tagColor` is a compact
categorical marker only; hosts must not use it as the sole way to communicate state or meaning.

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
delete, drag-end layout writes, measurement writes, and viewport mirrors. Each commit invokes
the callback once with the full serializable document (`getWorkspaceDocument()` returns the
same snapshot on demand). Notification cadence matches the reference's canonical writes — the
reference debounces only its network transport, so viewport pans and measurement passes notify
per commit and any debouncing is host policy. Loads never notify: the callback reports the
package's changes, not echoes of the host's own writes. The callback must not mutate the
workspace synchronously; apply host reactions (including rejecting a change by re-loading the
authoritative document) asynchronously. Snapshots share store state — treat them as immutable.

Registered renderers commit validated host-owned payloads through `setSectionData(sectionId,
data)` and item controls through `setItemData(sectionId, itemId, data)`. Both replace one opaque
payload, preserve package-owned structure, and issue one canonical document notification; neither
merges or interprets application data.

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
kind's renderer without reading it.

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
