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
exact peer dependencies. No upstream implementation source was copied. The package imports
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

The same index now implements positive-area partial/full marquee queries, ancestor-normalized
selection roots, readiness-aware bounds, and combined selection overlays. Shift-drag marquee
selection and its keyboard-reachable fixture alternative consume those APIs at every visible depth.
The initial fit waits until all eight representative root and descendant frames are registered, and
combined deep-selection overlays remain screen-aligned at 0.5x, 1x, and 2x zoom.

The drag proof now uses the index for the selected block's collision shape, parent hit testing,
source and destination placeholders, and blank-canvas coordinates. It proves immutable sort and
free-move plans for one item and canonical sibling blocks across nested insertion and canvas
boundaries; the earlier generic move-planning fixtures remain authoritative for cross-root nested
transitions. The mode captured at activation remains authoritative if the toolbar mode changes
mid-gesture, and the same preview key is committed once at 0.5x, 1x, and 2x zoom.

`TransientRootProjection` accepts package-owned root changes and internally maps them to XYFlow's
public `applyNodeChanges` helper. Repeated position, dimension, selection, and viewport updates do
not mutate the caller's document input. Completion emits at most one package-owned move, resize, or
viewport command; cancellation restores the baseline and emits none.

The geometry index remains the implemented boundary for later collision, external-drop, and
nested-minimap consumers. Marquee selection and initial fit are now proven consumers; the remaining
consumers are not claimed complete by this proof.

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

| Evidence                                                       | Covered outcome                                                                                                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/workspace/tests/geometry-index.test.ts`              | All-depth registration, replacement and cleanup, marquee semantics, selection-root normalization, readiness bounds, hit ordering, scaled round trips, and scrolling                         |
| `packages/workspace/tests/adapter-proof-drag-planning.test.ts` | Sort/free selection-block planning, nested destinations, invalid-target rejection, zoom-normalized canvas placement, and preview keys                                                       |
| `packages/workspace/tests/transient-root-projection.test.ts`   | High-frequency move and resize coalescing, immutable input, selection projection, viewport completion, cancellation restoration, and specific invalid-state failures                        |
| `tests/e2e/adapter-proof.spec.ts` geometry workflows           | Measurement-gated initial fit, all-depth partial/full marquee, normalized multi-selection overlay at 0.5x/1x/2x, resize remeasurement, focus, and scroll isolation                          |
| `tests/e2e/adapter-proof.spec.ts` ownership workflows          | Pointer handoff, transient root lift, sort/free selection blocks, placeholders, canvas drops, runtime mode retention, accepted/canceled keyboard, trusted touch, and one-command completion |
| `tests/e2e/adapter-proof.spec.ts` accessibility workflow       | Axe scan, reduced-motion rendering, 1280-pixel screenshot baseline, and 320-CSS-pixel reflow without horizontal overflow                                                                    |
| `corepack pnpm perf:geometry` and `perf/`                      | Repeatable non-gating baseline for 2,000 registrations, 500 marquee queries, 500 combined bounds, and 1,000 incremental updates                                                             |

The in-app CDP browser surface was unavailable during this batch, so repository Playwright
provided the focused browser and screenshot evidence. Interactive CDP visual inspection remains an
explicit Phase 0 audit gate.

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

## Still open in Phase 0

This proof does not complete the full phase. Representative browser render-count baselines and any
residual owner/DnD cells identified by the final matrix audit remain open. The broader non-DnD
behavior inventory, browser characterization matrix, interactive CDP review, and final phase gate
audit also remain repository-actionable.
