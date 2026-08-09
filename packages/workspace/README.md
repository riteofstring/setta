# @setta/workspace

The Setta workspace UI, extracted as a standalone TypeScript/React package. The working name,
public API, and every export are provisional until the Phase 1 parity gate and the Phase 2
boundary work in `docs/plans/setta-workspace-extraction-plan.md` ratify them.

## Peer dependencies

React and React DOM are host-provided peers with the documented compatible range `^19.1.0`:
the frozen product reference runs `react 19.1.1`, and the package uses React 19 ref-as-prop
components, so React 18 and below are not supported. All other runtime dependencies are
exact-pinned under the repository dependency policy.

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

The package is local and unpublished for the duration of the extraction plan.
