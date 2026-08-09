# Phase 6 Generic Edge and Port Evidence

## Result and scope

The ninth repository-actionable Phase 6 batch is implemented. `@setta/workspace` now accepts an
optional, strict, versioned collection of generic section ports and labeled directed or undirected
edges. The batch does not add graph execution, edge editing, selection, history, a pane registry,
or a field to `WorkspaceDocument`. Pane registration beyond toolbar and overlay slots is the next
independently repository-actionable Phase 6 item.

## Public and ownership boundary

| Boundary          | Implemented contract                                                                                                                                                                                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core collection   | `WorkspaceConnections` contains one versioned ordered port list and edge list. Port IDs are scoped to a section; edge IDs are collection-unique. Physical side, normalized offset, required labels, exact endpoints, and directed state have package-owned types with no upstream contracts.                                                        |
| Strict validation | Parse, serialize, and validate helpers reject malformed JSON, unsupported versions, sparse arrays, accessors, extra or missing fields, blank or padded IDs and labels, invalid sides or offsets, duplicate ports or edges, unknown sections or ports, and identical source/target endpoints. Parsed collections and nested endpoints are immutable. |
| React projection  | The optional `connections` prop validates against the current document and projects every measured root or recursive descendant through the existing all-depth geometry index. Routes, arrowheads, labels, and port marks stay aligned through pan, zoom, nested scroll, resize, and reflow without exposing XYFlow edge or node types.             |
| Host authority    | The host owns collection persistence, authorization, accepted updates, connection editing, IDs, and domain meaning. It reconciles relationships with accepted document changes. Connections create no document command, structural history entry, gesture owner, or execution contract.                                                             |
| Playground        | `/?canvas-shell&connections` loads an isolated recursive all-depth fixture. Existing canvas-shell and recursive workflows remain unchanged, so the optional demonstration does not rewrite prior visual or interaction assumptions.                                                                                                                 |
| Packed consumer   | The unrelated fixture round-trips a port collection through declared core exports, passes it through the declared React prop, and verifies the measured port at runtime from the locally packed tarball.                                                                                                                                            |

## Interaction, accessibility, color, and visual evidence

Visible connections are deliberately non-interactive. The SVG, route labels, arrowheads, and port
marks are hidden from assistive technology and accept no pointer input, so the batch introduces no
pointer-only action or keyboard stop. A pre-rendered group named from the workspace lists every
port and every complete labeled source-to-target edge with directed state. Hosts that add editing
must supply their own native controls, focus, keyboard completion, and announcements.

The semantic `connection` theme token has independently tuned, sRGB-gamut-safe light and dark
OKLCH defaults. Connection strokes use a canvas-colored underlay, arrowheads and ports reuse the one
relationship token, and port outlines remain distinct from section surfaces. Stroke widths and
port sizes remain stable across canvas zoom. Labels sit beside the source departure instead of on
section headers and progressively hide below the canvas breakpoint where fixed chrome would occlude
them; routes, ports, and accessible descriptions remain present.

The two original-resolution Chromium baselines were inspected directly. The light recursive view
shows distinct curved routes, source-adjacent labels, ports aligned to nested frames, a directed
arrow, and no label/header collision. The dark 320-CSS-pixel view keeps routes and ports legible
while progressively omitting labels beneath the floating toolbar.

The plan's recorded in-app-browser release gate remains unavailable and explicitly says not to
retry it during routine implementation. No GUI, extension, background service, credential, or
remote access was sought.

CDP visual check: not run (the recorded in-app browser surface remains unavailable; the focused
original-resolution Playwright Chromium connection baselines were inspected).

## Verification boundary

- Focused framework-neutral and static React coverage passes 27 tests for versioned immutable
  round trips, strict malformed data and accessor rejection, document-relative references,
  side/offset projection, stable route geometry, screen-reader descriptions, default theme gamut,
  and light/dark component contrast.
- The final exact Chromium selector passes two workflows. They cover root-to-deep and sibling-depth
  relationships, nested scroll remeasurement, endpoint alignment, fixed port size across zoom,
  directed/undirected rendering, responsive label disclosure, Axe, reduced motion, 200% page
  scale, dark appearance, 320-CSS-pixel reflow, and both reviewed visual baselines.
- Exact Node 24.18.1, repository-local Corepack 0.35.0, and pnpm 11.19.0 changed-file quality passes
  for 25 project files with repository/import boundaries across 317 files, all four manifests,
  dependency policy, formatting, lint and complexity, file lengths, strict types, dead-code
  analysis, 456 unit tests across 43 files, six boundary tests, plan-loop automation,
  package/playground builds, exact tarball contents, and the declaration report.
- The unrelated tarball-installed consumer passes frozen lockfile policy, strict TypeScript,
  production build, and headless runtime verification through declared core and React exports.
- No manifest, lockfile, dependency, lifecycle allowlist, trust policy, or exception changed, so the
  current network-backed Phase 5 supply-chain gate is not duplicated. Deterministic dependency
  policy remains covered by changed-file quality and the packed consumer check.
