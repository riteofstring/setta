# Workspace xyflow 12 parity cutover plan

Status: active

Baseline branch: `workspace-floating-window-spaces`

Baseline commit: `65f8cafa94c2c4768622ae570f6051332158ddc8`

Implementation branch: `workspace-use-xyflow-12`

## Outcome

Replace the vendored xyflow-derived canvas engine in `@setta/workspace` with the exact stable
`@xyflow/react@12.11.5` package. Preserve every supported public, visual, interaction,
accessibility, persistence, and downstream behavior in Workspace, Playground, and Python Canvas.
After parity is accepted, delete the temporary plan and all obsolete fork implementation, update
the current design and integration documentation, and leave one clean committed implementation.

The migration changes the private rendering engine only. It does not introduce generic edges or
ports, change the `WorkspaceDocument` schema, redesign any canvas surface, or expose xyflow as a
public dependency.

## Non-negotiable presentation contract

The accepted presentation is the rendering at the baseline commit. Upstream default presentation
is never the target. Workspace retains its current pane, background and grid, minimap, controls,
selection rectangles, section wrappers, section bodies, managed windows, portals, menus, focus
rings, and stylesheet.

No upstream default Background, Controls, MiniMap, node body, edge body, attribution, color theme,
or product styling may replace a Workspace-owned surface. The package may supply private geometry,
pan and zoom, node measurement, selection, and drag mechanics behind Workspace adapters. Existing
Workspace CSS remains the visual authority.

The baseline and candidate must use the same Chrome binary, operating-system font stack, viewport,
device scale, theme, fixture data, and settled animation state. Golden screenshots are immutable
inputs. Candidate capture commands cannot update or overwrite them.

## Authority boundary

- `WorkspaceDocument` remains the only canonical serializable authority for sections, top-level
  geometry, viewport, selection, and saved views.
- Python Canvas continues to project one complete backend snapshot through
  `commitWorkspaceDocument`; xyflow never becomes an application data store.
- The xyflow node, measurement, selection, and viewport stores are private render projections.
  Their granular events enter one Workspace adapter and are translated into the existing atomic
  document and history boundaries.
- Workspace retains host-scoped runtime ownership. Multiple mounted hosts cannot share xyflow
  stores, DOM roots, drag state, minimaps, viewport state, or portals.
- Existing package exports, document validation, section-kind contracts, command catalogs, and
  host callbacks remain unchanged.

## Visual parity system

### Golden capture

Before changing product source or dependency resolution, capture baseline screenshots and geometry
receipts from the baseline commit into `docs/evidence/xyflow-12-cutover/baseline/`. Store the exact
capture manifest beside the images, including commit, Chrome version, viewport, device scale,
theme, scenario id, fixture id, interaction used to reach the state, and stabilization rule.

Add a deterministic browser harness that can capture the same manifest against a candidate into a
caller-selected temporary directory. Add a separate comparison command that reads immutable
baseline artifacts, validates dimensions and scenario coverage, and writes diff images and a
machine-readable receipt without modifying the baselines.

Geometry comparisons fail for unexplained differences greater than 0.25 CSS pixels. Pixel
comparisons use exact dimensions and a narrow antialias tolerance. Every changed region must be
reviewed against the baseline image. A numeric threshold cannot accept a coherent redesign,
missing content, altered color, moved control, changed clipping boundary, or different z-order.

### Coverage catalog

The harness owns an explicit scenario catalog. Each registered package-owned section kind and each
Python Canvas section kind must be covered by at least one stable visual state. A coverage assertion
fails when a kind, control family, canvas layer, or managed-window state is added without a parity
scenario.

The catalog covers each distinct appearance at least once and crosses the catalog with light and
dark themes, desktop and narrow viewports, and representative zoom levels without relying on one
unbounded Cartesian product.

Canvas and shell states:

- idle pane at initial fit, explicit 100 percent zoom, zoomed out, zoomed in, and panned positions
- grid/background at each supported presentation setting
- left pane, right pane, both panes, closed panes, resized panes, saved-view tabs, and compact shell
- empty canvas, one section, mixed sections, nested groups, overlapping roots, and a large fixture
- canvas hover, keyboard focus, pointer pan, wheel pan, wheel zoom, pinch-style zoom, and fit view
- marquee selection in progress, completed multi-selection bounds, keyboard-selected section, and
  selection cleared
- minimap idle, focused, clicked, dragged, viewport mask at multiple zooms, hidden-node projection,
  compact placement, light theme, and dark theme
- toolbar idle, hover tooltip, keyboard focus, pressed/toggled states, enabled and disabled actions
- pane and section context menus, creation menu, command palette, Find, popovers, dropdowns,
  completion tooltip, and their clipping and z-order boundaries

Section shell states:

- every package-owned section kind in idle, hover, focused, active, selected, and multi-selected
  presentation where the state is supported
- unlocked, position-and-size locked, minimized, restored, automatic size, authored size, resizing,
  dragging, drag preview, valid drop, invalid drop, and post-drop states
- root leaf, root group, horizontal group, vertical group, three-level nesting, free-position child,
  hidden saved-view section in edit mode, and visible descendant with restored ancestor path
- header controls, names, tags, style colors, badges, diagnostic/error presentation, empty body,
  scrolled body, clipped body, and focus rings
- Text and Code sections idle, editing, selection, completion, protected range, scrolled editor,
  light theme, and dark theme
- every built-in item/control family, including text, code, textarea, number, slider, checkbox,
  switch, dropdown, searchable dropdown, color, date, time, file/dropzone, status, validation,
  item selection, item drag, column resize, and nested item layout

Managed-window states:

- floating window idle, focused, unfocused, overlapping canvas content, moved, and resized
- docked window at every supported dock placement and dock-size boundary
- minimized window, recovery control, restored window, and window-space activation
- section rendered in a window, section handed between canvas and window, and canonical section
  presentation retained across the handoff
- terminal or other native-scroll content receiving wheel input without moving the canvas
- canvas wheel input delivered through an eligible managed-window overlay
- popovers, menus, tooltips, CodeMirror completion, and focus restoration across window layers

Python Canvas states:

- callable section idle, selected, focused, editing, zoomed, and diagnostics
- Generated Python idle, focused, protected-range presentation, and scrolled editor
- Parameter Dictionary and List of Objects roots, nested items, item selection, and drag states
- pending creation placeholder, accepted canonical replacement, and projection refresh without
  geometry or saved-view drift
- terminal window hidden, floating, docked, minimized, restored, running, and scrolled
- narrow viewport, light theme, dark theme, saved views, shell panes, and representative mixed
  project composition

### Interaction parity

Screenshots are paired with observable interaction assertions. The parity suite verifies pointer,
wheel, touch-compatible, and keyboard behavior for pan, zoom, fit, selection, node movement,
multi-node movement, snap, resize, lock, minimize, group and ungroup, nested drag, item drag,
context menus, focus restoration, window movement and docking, editor input, terminal scroll, and
saved-view activation.

The suite records canonical documents and public callbacks before and after each interaction.
Candidate output must match baseline output for document content, transaction count, transaction
kind, selected ids, viewport, active section, focus target, and application projection behavior.

## Performance parity

Record a baseline and candidate with the existing production performance profile and deterministic
256-section route. Add Python Canvas profiles with representative 100, 500, and 1,000 node
projections and representative connection density once generic edges are separately introduced;
this cutover records the current edge-free Python Canvas behavior.

Compare initial render, sustained pan, wheel zoom, marquee selection, multi-node drag, minimap pan,
and section resize. Candidate p95 input latency, frame time, long tasks, browser errors, host-page
scroll, and heap growth may not regress beyond ordinary same-machine run variance. Any visible
gesture regression blocks the cutover even when an aggregate average passes.

The migration is not allowed to hide, unmount, flatten, or replace rich sections to improve a
number. `onlyRenderVisibleElements` remains disabled unless separate evidence proves editor,
terminal, focus, measurement, and saved-view parity.

## Implementation sequence

### Phase 0: baseline and plan

1. Commit this plan before product changes.
2. Start the current Playground and Python Canvas targets from the baseline product source.
3. Add the deterministic parity harness without changing product rendering.
4. Capture the complete golden manifest, screenshots, geometry, interactions, and performance.
5. Review every baseline image and commit the harness and accepted baseline evidence.

### Phase 1: dependency and adapter boundary

1. Add exact `@xyflow/react@12.11.5` as a private Workspace runtime dependency.
2. Generate the candidate lockfile without lifecycle scripts.
3. Run `code-polishy dependency-review --base workspace-floating-window-spaces` before installing.
4. Keep dependency CSS out of the runtime entry and built stylesheet boundary.
5. Introduce one private host-scoped adapter that maps the canonical document projection to
   controlled xyflow nodes and maps xyflow events back to existing Workspace operations.
6. Prove two simultaneous Workspace hosts remain isolated.
7. Commit the dependency and inactive adapter as one coherent milestone.

### Phase 2: viewport and pane cutover

1. Mount xyflow behind the existing `WorkspaceCanvas` surface with no new product presentation.
2. Preserve the current viewport tuple, limits, initial fit, saved-view synchronization, insets,
   shell sizing, pointer location, screen/flow conversions, and viewport helper behavior.
3. Preserve native vertical scrolling, manual wheel regions, managed-window wheel bridging,
   nested scrollers, terminal scroll, pan-on-scroll modes, pinch recognition, and the scroll shim's
   observable behavior.
4. Keep current background, grid, portal roots, shell classes, and focus ownership.
5. Run focused viewport tests and the pane/minimap visual subset, fix drift, and commit.

### Phase 3: sections, selection, and drag cutover

1. Render the existing `SectionContainer` unchanged as the custom xyflow node body.
2. Preserve exact node coordinates, dimensions, z-index, visibility, pointer policy, and classes
   needed by the accepted stylesheet and focus system.
3. Preserve ResizeObserver publication, automatic-size promotion, locks, minimization, saved-view
   visibility, and initial visibility gating.
4. Translate xyflow node selection into the existing active/selection controller without adding a
   second selection authority.
5. Preserve marquee modes, selection bounds, keyboard movement, multi-node movement, snap,
   auto-pan, drag z-raise, one final canonical commit, and one history transaction.
6. Preserve dnd-kit coexistence for nested sections and items; xyflow cannot pan or drag while the
   structural drag authority owns the gesture.
7. Run section, selection, drag, history, shell, and Python Canvas projection suites plus their
   visual subsets, fix drift, and commit.

### Phase 4: minimap, controls, windows, and portals

1. Retain Workspace's current minimap rendering and interaction surface, adapting only its private
   geometry and viewport source.
2. Retain Workspace controls, toolbar contributions, tooltips, keyboard focus, and disabled states.
3. Preserve floating, docked, minimized, restored, and window-space presentation and wheel/focus
   routing.
4. Preserve CodeMirror tooltip roots, Radix portals, context menus, command palette, Find, and
   downstream terminal layers.
5. Run the complete managed-window, portal, minimap, controls, section-kind, and Python Canvas
   visual catalog, fix every unexplained diff, and commit.

### Phase 5: remove the fork

1. Move remaining callers to the adapter's typed public internals.
2. Delete obsolete canvas store, d3 pan/zoom, node renderer, selection renderer, minimap internals,
   copied xyflow license, dead CSS selectors, tests that characterize deleted private code, and
   direct dependencies no longer used.
3. Retain Workspace behavior tests at public or adapter boundaries and add regression coverage for
   every fixed parity issue.
4. Search source, built artifacts, lockfile, docs, and package exports for stale fork ownership,
   obsolete `ReactFlowState` names, copied implementation, and dead dependency references.
5. Build the package, rerun complete parity and performance gates, and commit the deletion.

### Phase 6: documentation and final candidate

1. Update `docs/design/workspace.md` with the private controlled-renderer boundary and retained
   Workspace presentation ownership.
2. Update `docs/design/development-tooling.md` with the visual parity capture and comparison
   commands.
3. Update `packages/workspace/README.md` only if integration or attribution obligations affect
   consumers; xyflow remains absent from the public API.
4. Update Python Canvas documentation only for verification ownership; its canonical projection and
   public behavior remain unchanged.
5. Record accepted parity and performance receipts under `docs/evidence/xyflow-12-cutover/`.
6. Delete this temporary plan and any superseded fork evidence, scripts, fixtures, or exceptions
   that no longer describe the implementation.
7. Run formatting, builds, exact affected tests, `code-polishy test --changed`, the packed consumer,
   performance profile, live Playground inspection, live Python Canvas inspection, and
   `code-polishy merge-gate --base workspace-floating-window-spaces`.
8. Review emitted geometry, every parity diff image, and final screenshots directly.
9. Commit the final current documentation and cleanup with a clean worktree. Do not push.

## Commit boundaries

Commit after each coherent phase. Every commit must build on one authoritative implementation and
must exclude unrelated work. Expected checkpoints are plan, baseline harness/evidence, dependency
and inactive adapter, viewport cutover, section/selection/drag cutover, minimap/window/portal
cutover, obsolete-code deletion, and final documentation/plan removal.

## Delegation

Use GPT-5.6 Terra agents at maximum reasoning for bounded implementation and review slices. The
primary agent owns architecture decisions, skill and design instructions, shared-file integration,
dependency review, commits, visual acceptance, final cleanup, and goal completion.

Agents may independently inventory upstream-to-current behavior, build the visual scenario
catalog, implement isolated adapter slices, or audit candidate parity. They must not commit, change
branches, update shared dependency files concurrently, or treat internal xyflow state as canonical.

## Completion gate

The work is complete only when:

- Workspace and Python Canvas expose the same supported behavior and accepted presentation as the
  baseline commit.
- Every scenario in the visual catalog has an accepted candidate image and geometry receipt.
- No unexplained pixel, geometry, focus, interaction, canonical-document, callback, or performance
  drift remains.
- The exact upstream dependency is supply-chain approved and remains private.
- The vendored fork and every obsolete dependency, test, CSS rule, document, and exception are
  removed.
- Current design and tooling documentation describe the final implementation.
- This plan is deleted, all required verification passes, the branch is clean and committed, and
  no remote operation has occurred.
