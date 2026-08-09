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

## Consumption during extraction

Phase 1 consumers (the playground) compile the package source directly through the `exports`
map; Phase 2 ships compiled ESM, declarations, and the compiled scoped stylesheet. The
package is local and unpublished for the duration of the extraction plan.
