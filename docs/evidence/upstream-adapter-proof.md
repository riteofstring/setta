# Upstream Adapter Proof

## Decision

Phase 0 retains the plan's initial representation: each spatial root section is one XYFlow node,
while ordered descendants render as recursive package-owned DOM inside that root. Every visible
frame registers in one package-owned workbench-coordinate geometry index. No challenger
representation demonstrated a material advantage that justified making ordered descendants
independently positioned nodes or maintaining shadow geometry.

The proof is testing-only and is reachable in the backend-free playground at `?adapter-proof`.
Runtime package contracts remain package-owned.

## Exact upstream selection

Registry metadata was checked on 2026-08-07.

| Direct package      | Exact version | Published  | License | Selected responsibility                                                                                                                                        |
| ------------------- | ------------: | ---------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@xyflow/react`     |     `12.11.2` | 2026-07-06 | MIT     | Root projection, viewport transforms, root movement, public viewport helpers, controls, background, and viewport portal                                        |
| `@dnd-kit/react`    |       `0.5.0` | 2026-06-11 | MIT     | Provider lifecycle, pointer, touch, and keyboard sensors, draggable/droppable registration, measurement, collision target, accessibility feedback, and overlay |
| `@dnd-kit/geometry` |       `0.5.0` | 2026-06-11 | MIT     | Public rectangle geometry used to replace the active collision shape with package-owned single- or multi-selection bounds                                      |

All three direct releases exceed the repository's strict seven-day release-age floor. React and React DOM are
exact peer dependencies. No current upstream provider implementation source was copied. The package imports
XYFlow's published base stylesheet and retains its visible attribution.

## Adapter boundaries

The XYFlow proof uses only documented public exports: `ReactFlow`, `Background`, `Controls`,
`Panel`, `ViewportPortal`, `applyNodeChanges`, `useReactFlow`, and `useViewport`. It does not use
`useStoreApi`, undocumented store fields, or non-public source paths. XYFlow node and change types
remain inside internal implementation files.

The dnd-kit proof uses the public `DragDropProvider`, `DragOverlay`, `PointerSensor`,
`KeyboardSensor`, `useDraggable`, and `useDroppable` exports plus the public geometry package's
`Rectangle`. The adapter maps lifecycle events into package-owned event and completion contracts.
No dnd-kit type appears in those contracts or in the generated testing declarations.

The adapter captures input kind, activation point, movement transform, collision shape, and active
move mode once per gesture. A package selection block replaces the upstream single-item collision
rectangle without taking over provider measurement or sensor activation. Keyboard arrows that the
upstream scroller consumes are intentionally ignored; accepted keyboard moves use the sensor's
configured workspace step. Touch retains upstream's default 250-millisecond long-press activation
and five-pixel pre-activation tolerance rather than installing a package-specific sensor fork.

The proof deliberately does not use `useSortable`. In `@dnd-kit/react@0.5.0`, that hook installs
upstream optimistic sorting behavior; the public React hook does not expose a selective switch that
preserves the rest of the sortable plugin while disabling that projection. The package therefore
keeps canonical and DOM order unchanged during the gesture, owns its preview semantics, and
applies one reorder only after accepted completion. This preserves the characterized constrained
scroll and preview/commit boundary while still delegating provider, sensor, measurement, target,
feedback, and overlay infrastructure upstream.

## Representation and ownership outcomes

| Concern                    | Owner in the proof       | Evidence                                                                                                                                                                                        |
| -------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root spatial movement      | XYFlow                   | Root drag uses the public node lifecycle and emits one package command at completion.                                                                                                           |
| Nested structural movement | dnd-kit + package kernel | Native handles isolate XYFlow activators; dnd-kit owns pointer/touch/keyboard lifecycle while package planning owns sort/free destination, selection-block preview, and one-command completion. |
| Package selection          | Package                  | XYFlow element selection and selection elevation are disabled; a `ViewportPortal` overlay consumes the package geometry index and does not become a second movement surface.                    |
| Active ancestor lift       | Package CSS              | A root is raised only while it contains the active dnd-kit handle; cancellation and completion restore its base layer.                                                                          |
| Viewport movement          | XYFlow                   | Nested scroll regions exclude wheel and pan ownership and browser evidence verifies their scroll does not change the viewport transform.                                                        |
| Canonical state            | Package                  | XYFlow changes update an adapter-local transient projection; dnd-kit previews update diagnostic state only.                                                                                     |

The proof's diagnostic state is a narrow external store. Drag lifecycle feedback does not update the
workbench component's canonical node or section state on every event.

## Geometry and transient projection

`WorkspaceGeometryIndex` owns incremental registration, replacement-safe cleanup, parent
membership, deterministic deepest-hit ordering, combined bounds, and client/workbench conversion.
The playground registers both root nodes and every recursive descendant. Selection overlay,
selection focus, and recursive resize remeasurement consume those registrations rather than
creating a parallel package measurement map. dnd-kit continues to own its substrate-level
draggable and droppable measurement.

One adapter-local measurement registry owns the DOM registrations. A single viewport observer
updates its transform, and root movement, nested scrolling, element resizing, and window resizing
request a coalesced animation-frame measurement pass. Measured section components no longer
subscribe individually to XYFlow viewport state. Equal frames are not republished, so viewport
movement does not rerender either recursive root while live root movement still advances the shared
geometry index and keeps descendant overlays aligned.

The same index now implements positive-area partial/full marquee queries, ancestor-normalized
selection roots, readiness-aware bounds, and combined selection overlays. Shift-drag marquee
selection begins only from noninteractive content, so Shift-click remains the additive native-button
selection path; its keyboard-reachable fixture alternative consumes the same selection model.
The initial fit waits until all eight representative root and descendant frames are registered, and
combined deep-selection overlays remain screen-aligned at 0.5x, 1x, and 2x zoom.

The drag proof now uses the index for the selected block's collision shape, target planning, source
and destination placeholders, and blank-canvas coordinates. Client collision rectangles are
projections of indexed workbench frames, not a second recursive DOM query. Gesture activation
synchronously flushes the one measurement registry before capturing those projections; live move
events do not remeasure the complete DOM. It proves immutable sort and free-move plans for one item
and canonical sibling blocks across nested insertion and canvas boundaries; the earlier generic
move-planning fixtures remain authoritative for cross-root nested transitions. The mode captured at
activation remains authoritative if the toolbar mode changes mid-gesture. Invalid or outside
targets clear retained collision state, and completion emits a command only when final geometry
resolves to the preview key that was displayed. That same key is committed once at 0.5x, 1x, and 2x
zoom.

`TransientRootProjection` accepts package-owned root changes and internally maps them to XYFlow's
public `applyNodeChanges` helper. Repeated position, dimension, selection, and viewport updates do
not mutate the caller's document input. Accepted move and resize completion invokes a host-supplied
command callback once; the Phase 0 test host records that callback as exactly one history entry.
Cancellation and no-op completion invoke it zero times. Viewport completion remains a separate
non-undoable command and does not enter that history boundary.

`resolveGeometryDropTarget` converts a client point once, returns the workbench drop position, and
selects the deepest eligible indexed frame. Unit vectors cover nested roots, children, and
grandchildren at 0.5x, 1x, and 2x. A future nested minimap summary must consume `snapshot()` or
other index queries rather than introduce parallel DOM measurement; the initial root minimap itself
remains Phase 1/3 product work.

## Declaration-only XYFlow patch

Strict TypeScript 6.0.3 checking with `exactOptionalPropertyTypes: true` and
`skipLibCheck: false` exposed that `@xyflow/system@0.0.79`'s `NodeBase` declarations use optional
properties without explicit `| undefined`, while `@xyflow/react` assigns values that can be
undefined. The checked-in patch changes only the ESM and UMD `nodes.d.ts` outputs. Runtime
JavaScript, behavior, and public Setta contracts are unchanged.

The patch is exact-version keyed and has owned, expiring metadata in
`supply-chain-exceptions.json`. Its upstream contribution path is the `NodeBase` source declaration
that generates both published files. Remove the patch when an exact-pinned system release passes
the same strict package typecheck; the policy records 2026-11-07 as the expiry.

## Executable evidence

| Evidence                                                               | Covered outcome                                                                                                                                                                                 |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/workspace/tests/geometry-index.test.ts`                      | All-depth registration, replacement and cleanup, marquee semantics, selection-root normalization, readiness bounds, hit ordering, scrolling, and nested external-drop coordinates at 0.5x/1x/2x |
| `packages/workspace/tests/adapter-proof-drag-planning.test.ts`         | Sort/free selection-block planning, nested destinations, invalid-target rejection, zoom-normalized canvas placement, and preview keys                                                           |
| `packages/workspace/tests/transient-root-projection.test.ts`           | High-frequency move and resize coalescing, immutable input, selection projection, viewport completion, cancellation restoration, and specific invalid-state failures                            |
| `tests/e2e/adapter-proof.spec.ts` geometry workflows                   | Measurement-gated initial fit, all-depth partial/full marquee, normalized multi-selection overlay at 0.5x/1x/2x, resize remeasurement, focus, and scroll isolation                              |
| `tests/e2e/adapter-proof.spec.ts` ownership workflows                  | Pointer handoff, transient root lift, sort/free selection blocks, placeholders, canvas drops, runtime mode retention, accepted/canceled keyboard, trusted touch, and one-command completion     |
| `tests/e2e/adapter-proof.spec.ts` accessibility workflow               | Axe scan, reduced-motion rendering, 1280-pixel screenshot baseline, and 320-CSS-pixel reflow without horizontal overflow                                                                        |
| `corepack pnpm perf:geometry` and `perf/`                              | Repeatable non-gating baseline for 2,000 registrations, 500 marquee queries, 500 combined bounds, and 1,000 incremental updates                                                                 |
| `perf/phase-0-browser-render-baseline.md` and focused browser workflow | Ninety-six-step structural and root movement plus a 96-event viewport burst, with unchanged recursive-root render counts during transient work and bounded commit/geometry publications         |

Repository Playwright provides the focused browser and screenshot evidence. Interactive CDP status
is tracked separately in the plan's external release gate.

## Verification recorded on 2026-08-08

- `corepack pnpm quality` passed boundaries, dependency policy, formatting, lint, strict types,
  dead-code analysis, 58 unit tests, automation tests, builds, tarball allowlisting, and API-report
  generation.
- The focused Chromium adapter proof passed all three geometry, ownership, and
  accessibility/visual scenarios against the checked-in baseline.
- `corepack pnpm consumer:check` built an unrelated temporary consumer from the packed artifact.
- `corepack pnpm supply-chain:check` passed the frozen install, strict loaded-lockfile policy,
  high/critical vulnerability audit, license allowlist, and dependency-inventory generation with no
  known vulnerabilities.

The shared-geometry consumer batch additionally passed its focused geometry-index unit target,
exact-toolchain package typecheck, all four Chromium adapter scenarios, Axe scan, reduced-motion
screenshot comparison, and 320-CSS-pixel reflow assertion. `corepack pnpm perf:geometry` recorded
the first focused baseline without adding a timing threshold.

The selection-block interaction batch passed 66 repository unit tests and all eight Chromium
adapter scenarios. Those scenarios include pointer completion at 0.5x/1x/2x, mode retention,
source/destination placeholder parity, trusted accepted keyboard movement, trusted long-press touch,
automated Axe scanning, reduced-motion rendering, 320-CSS-pixel reflow, and the reviewed screenshot
baseline. Deterministic quality also passed strict types, lint, dead-code, complexity, file-length,
build, explicit tarball allowlisting, and API-report generation. The updated frozen lockfile passed
the registry-backed supply-chain audit with no known vulnerabilities, and the packed artifact built
successfully in the unrelated consumer fixture.

The final owner/DnD audit expanded the deterministic owner table to every pointer, touch, and
keyboard surface cell and found no residual Phase 0 behavior gap. Its performance pass replaced
per-frame recursive viewport subscriptions with one adapter-local measurement registry. The
focused Chromium baseline passed 96-step structural movement, 96-step live XYFlow root movement,
and 96 trusted viewport events while keeping both recursive-root render counters unchanged during
transient work. The same batch passed changed-file boundary and dependency policy, formatting,
lint, strict types, dead-code analysis, 81 unit tests, automation tests, package and playground
builds, tarball allowlisting, and public-API report generation. Three directly affected Chromium
geometry, accessibility, reflow, and screenshot selectors also passed. No manifest or lockfile
changed, so the already-green registry-backed supply-chain gate was not duplicated.

The Phase 0 completion batch passed the exact-toolchain changed-file quality gate with 87 unit
tests, strict types, lint, dead-code analysis, complexity/file-length limits, automation tests,
package and playground builds, tarball allowlisting, and API-report generation. Its focused unit
set passed 25 geometry, drag-planning, transient-projection, and non-DnD evidence tests. Focused
Chromium selectors passed index-based canvas-drop preview/commit parity at 0.5x/1x/2x, pointer
completion and cancellation with focus restoration, accepted keyboard sorting, trusted long-press
touch sorting, and the 200% page-scale primary workflow. No manifest or lockfile changed, so the
already-green registry-backed supply-chain and unrelated-consumer gates were not duplicated.

## Phase 0 completion boundary

The [non-DnD inventory](non-dnd-behavior-characterization.md),
[browser matrix](browser-characterization-matrix.md), and
[gate audit](phase-0-gate-audit.md) complete the remaining repository-actionable Phase 0 evidence.
Product implementation of those characterized contracts begins in the later phases identified by
the plan.
