# Setta-Styled Workspace UI Plan

## Decision

Status: **in progress** (Phase 0 complete 2026-08-10, pending audit; Phase 1 partially landed
2026-08-10). Phase 0 artifacts: the before-screenshot evidence set and public-API-only
visual-matrix route
([docs/evidence/setta-ui-before-screenshots.md](../evidence/setta-ui-before-screenshots.md)), the
repeatable development/production interaction profiler (`corepack pnpm perf:interaction`) with
baseline traces reproducing the structural-drag activation stall
([perf/interaction-profile.md](../../perf/interaction-profile.md)), the visual reference matrix
([docs/evidence/setta-ui-visual-reference-matrix.md](../evidence/setta-ui-visual-reference-matrix.md)),
and the ratified semantic tokens and state matrix
([docs/evidence/setta-ui-design-contract.md](../evidence/setta-ui-design-contract.md)).

Phase 1 progress: profiling attributed the activation stall to a whole-tree React sync render
broadcast inside the pointer-down dispatch plus synchronous feedback mounting, an unconditional
geometry re-measure, and interleaved forced layouts. The gesture-scoped activation state now lives
in a two-phase external store with per-frame/per-handle primitive subscriptions, presentation
broadcasts and start feedback defer to the next canvas frame with order-preserving flushes, and
sensors gate activation imperatively. The profiler fixture now fails closed unless every declared
cell publishes its expected interaction owner, drives all pointer moves, restores the canonical
document, and avoids page-scroll contamination. Its corrected reference run still shows
49.6–66.6 ms development structural activation gaps and 49.9–58.4 ms nested-freeform gaps;
production is substantially better but does not make the development miss ignorable. Cause,
before/after numbers, and the remaining owners are recorded in
[perf/phase-1-structural-drag-activation.md](../../perf/phase-1-structural-drag-activation.md)
(`phase-1-fixture-activation` is the corrected label in the interaction profile report). Child
drop-region geometry is now published by the incremental geometry service instead of being read
from the DOM during activation. A measured follow-up that deferred host selection, memoized the
recursive tree, cached validation, delayed overlay content, and frame-flushed owner/feedback
renders cut handler spans but still left repeatable 32.9–42.7 ms development gaps and reproduced a
stuck `root-layout` owner after pointer-up in a normal playground workflow; all runtime changes
from that bundle were discarded. Do not retry that selection-timing/frame-flush/overlay bundle,
and do not replace dnd-kit's AutoScroller, Cursor, or PreventSelection lifecycle plugins: neither
experiment cleared the exit gate, and both introduced unacceptable semantic risk. Finishing Phase
1 requires a different owner-preserving change that clears the corrected profile without changing
callback timing or gesture lifecycle.

The selection distribution store landed next (2026-08-10): CPU attribution proved the dominant
in-dispatch owner was the pointer-down selection commit rerendering the whole workbench from root
React state (34.1 ms versus 11.0 ms pre-selected in development). Selection decisions stay in the
workspace root, but distribution now flows through `WorkspaceSelectionStore` with per-section
subscriptions; commits still publish synchronously in the dispatch, and node-level
selected/draggable state reapplies through one identity-preserving node update (upstream reads
`node.selected` for block drags — do not remove it again). Development structural spans fell to
22–33.6 ms with no ≥50 ms long tasks anywhere; production is clean except one cold structural
0.5× cell (33.3 ms).

The ownership-broadcast store distribution landed next (2026-08-10): the interaction owner hook
now holds no React state, so a gesture start commits no adapter render at all. The extracted
`WorkspaceCanvasFlow` is the only broadcast subscriber that rerenders (pan/zoom gesture props);
the gesture-scoped canvas data attributes update imperatively from the store; the structural live
region and selection overlay subscribe individually; viewport handlers read the published
activation snapshot at event time; and `nodesDraggable` is static because every node's explicit
boolean `draggable` made the per-gesture flips inert while fanning a prop change into every
upstream NodeWrapper. Production now clears its side of the Phase 1 exit gate: zero >32 ms
activation gaps and no long tasks in all 27 cells. Phase 1 remains open on development only —
one ~33 ms gap (a single skipped frame) persists in 10 of 27 cells because the pointer-down
dispatch itself still spans 24–33.5 ms there, owned by dnd-kit's start flush (scroller
`elementFromPoint`, Feedback measurement, overlay flush) plus session build. The next
owner-preserving change must shrink or split that in-dispatch span without replacing dnd-kit's
lifecycle plugins or changing gating semantics; the broadcast side is done. Evidence:
[perf/phase-1-structural-drag-activation.md](../../perf/phase-1-structural-drag-activation.md)
(`phase-1-ownership-store`, 13:45 runs).

Make the Setta visual language the opinionated default for `@setta/workspace`, redesign the
backend-free playground around the canvas, and remove the measurable structural-drag startup hitch.
The result should feel like a focused Setta product immediately after `pnpm dev`, while remaining a
reusable, host-rendered UI library.

This is a separate follow-up to the completed
[Standalone Section Workbench Plan](./standalone-section-workbench-oss-plan.md). That plan remains
the source of truth for package behavior and scope. This plan changes presentation, demo
composition, and interaction performance; it does not add a backend, domain-specific Setta
features, publishing, repository hosting, migration work, or legacy support.

Use these product decisions:

- Setta styling is the package default, not an optional showcase skin.
- Do not preserve the current neutral styling as a second built-in theme or compatibility path.
- Light, dark, and system appearances remain supported. Consumers can rebrand the semantic colors,
  register their own section renderers and icons, choose section chrome variants, and extend the
  toolbar, panes, and overlays without replacing the interaction system.
- Keep the current `WorkspaceDocument` shape. Visual redesign does not justify a schema change.
- Use the old Setta frontend on `main` as visual and interaction evidence only. Do not import its
  component tree, Tailwind setup, app state, backend contracts, or forked UI infrastructure.
- Treat perceived jank as an engineering defect to measure. Do not assume visual polish will hide it
  and do not weaken hysteresis, cross-depth movement, accessibility, or coordinate correctness to
  make a benchmark pass.
- Hide XYFlow's visible “React Flow” canvas badge in every package-owned surface while retaining all
  required third-party license notices, dependency licenses, inventories, and audits.

## Intended outcome

On first launch, a developer should see a fitted, populated, canvas-first Setta workspace—not a
marketing header, settings form, JSON editor, empty grid, or upstream-library badge. The first
screen should demonstrate:

- Quiet Setta canvas and grid styling in light or dark appearance.
- Compact, polished sections with clear type icons, titles, tags, selection, lock, minimize, and
  resize states.
- A visually distinct nested group containing vertical, horizontal, and freeform descendants.
- Smooth top-level, structural section, and sortable-item dragging.
- A restrained Setta-style viewport toolbar and minimap.
- Host-rendered note, status, and field-list content that looks intentional at its initial size.
- Discoverable creation, grouping, movement mode, theme, and reset controls without placing
  debugging machinery above the canvas.

The package should still be independently usable through its documented React API. Setta styling
is a strong default, not a dependency on the Setta application.

## Investigation summary

### Product hierarchy and first-run experience

| Severity | Location                                                                                                    | Before                                                                                                                             | After                                                                                                                                                                      | Why                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| HIGH     | `apps/playground/src/DefaultPlaygroundPage.tsx:362` and `apps/playground/src/styles.css:50`                 | A large “Blank-slate workspace” hero, settings, and data controls appear before the canvas.                                        | Make the canvas the primary viewport, with one compact Setta top bar and secondary controls in an accessible drawer or popover.                                            | The current first screen reads as a test harness and pushes the product below the fold.                  |
| HIGH     | `apps/playground/src/DefaultPlaygroundPage.tsx:413` and `apps/playground/src/DefaultPlaygroundPage.tsx:462` | A new browser starts empty; the representative document is hidden behind “Show workspace data,” “Reset example,” and confirmation. | Start a new playground storage namespace with a representative example and a fitted viewport; retain a forward-looking empty state only after the user deletes everything. | The default path hides every feature the playground is supposed to sell.                                 |
| MEDIUM   | `apps/playground/src/DefaultPlaygroundPage.tsx:410`                                                         | JSON import/export and persistence proof share top-level visual priority with the product.                                         | Move developer data tools into a clearly labeled secondary “Data and diagnostics” panel.                                                                                   | The fixture must retain integration proof without presenting debug controls as the main product.         |
| MEDIUM   | `packages/workspace/src/styles.css:3`                                                                       | The package imposes `block-size: clamp(24rem, 70vh, 44rem)`.                                                                       | Make the workbench fill a host-sized container and give the playground an explicit viewport-filling layout.                                                                | A reusable canvas should not cap itself at 44 rem or depend on the browser viewport instead of its host. |

### Visual language

| Severity | Location                                                                             | Before                                                                                                                                   | After                                                                                                                                                              | Why                                                                                                               |
| -------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| HIGH     | `packages/workspace/src/styles.css:718` and `packages/workspace/src/styles.css:919`  | Heavy root shadows, a 52 px two-line header, permanently visible metadata, and many boxed 40 px controls create generic dashboard cards. | Use compact Setta card chrome: quiet surfaces, a single-line header, type icon, strong title, small tag/state cues, a blue active outline, and contextual actions. | The package frame currently dominates host content and does not resemble Setta.                                   |
| MEDIUM   | `packages/workspace/src/styles.css:759` and `packages/workspace/src/styles.css:1898` | Nested sections look like smaller copies of root cards, with repeated shadows and separators at every depth.                             | Give containers a soft Setta group surface and padding while descendants use quieter borders and reduced elevation.                                                | Repeated card elevation makes deep structure noisy and visually flattens containment.                             |
| MEDIUM   | `packages/workspace/src/styles.css:2511`                                             | The toolbar is a large floating capsule with widely separated, individually boxed controls.                                              | Use Setta's narrow grouped control rail, consistent 16–18 px stroke icons, restrained active blue, and compact dividers while retaining accessible hit areas.      | The current toolbar feels unrelated to the old Setta canvas and consumes too much attention.                      |
| MEDIUM   | `packages/workspace/src/internal/workspace-preferences.ts:28`                        | Eleven color roles must also derive header, border, group, and control surfaces.                                                         | Add stable semantic roles for section header, section border, group surface, and control surface, with separately tuned light and dark Setta defaults.             | Rebranding should not require consumers to depend on private selectors or accidental `color-mix()` relationships. |

### Interaction performance

| Severity | Location                                                                                                                   | Before                                                                                                                                                                                    | After                                                                                                                                                                      | Why                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| HIGH     | `packages/workspace/src/internal/workspace-section-dnd.tsx` and `packages/workspace/src/internal/upstream-dnd-adapter.tsx` | Existing reports guard rerenders and geometry publication but not pointer-to-paint latency. A local nested structural-drag probe showed one 41.7–50.1 ms frame gap in each of three runs. | Profile and remove the startup hitch, then retain both frame-pacing evidence and structural architecture gates for root, structural, item, resize, pan, and zoom gestures. | A test suite can prove one canonical commit and zero unrelated React renders while the interaction still visibly stalls. |
| MEDIUM   | `packages/workspace/src/styles.css:2680` and floating-surface styles                                                       | Shadows, blur, state selectors, and mounted overlays have not been correlated with drag paint cost.                                                                                       | Use traces to remove or suspend only the expensive cosmetic work during active gestures; keep property-specific motion and reduced-motion behavior.                        | Performance work should address measured style, layout, paint, or script cost rather than deleting polish blindly.       |

### Visible attribution and legal compliance

| Severity | Location                                                                                                                                                                          | Before                                                                                                    | After                                                                                                                                                       | Why                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| LOW      | `packages/workspace/src/internal/workspace-canvas-adapter.tsx:627`, `packages/workspace/src/internal/upstream-adapter-proof.tsx:863`, and `packages/workspace/src/styles.css:609` | Package-owned canvases deliberately show and style the “React Flow” badge.                                | Set `hideAttribution: true` on every package/proof ReactFlow instance, remove dead badge CSS, and test that `.react-flow__attribution` is absent.           | The upstream badge looks like an unfinished implementation detail in a Setta-branded library. |
| HIGH     | `packages/workspace/docs/verification-and-support.md:125`                                                                                                                         | The documentation can be read as if a visible canvas badge and legal attribution are the same obligation. | State explicitly that the UI badge is hidden while `THIRD_PARTY_NOTICES.md`, dependency license material, license audits, and inventories remain unchanged. | Visual branding must not weaken third-party compliance.                                       |

## Directional browser evidence

A short local probe was run against the current Vite development playground using the repository's
Node 24.18.1 and Playwright Chromium at 1440 × 1000. It is directional evidence, not a portable
performance budget:

| Gesture                        | Workload                                        | Observed frame pacing                                                        |
| ------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| XYFlow top-level spatial drag  | 96 moves approximately 8 ms apart               | Maximum gap about 9.4 ms; no gap over 20 ms.                                 |
| dnd-kit nested structural drag | The same 96-move cadence, three fresh page runs | Maximum gaps 41.7 ms, 50.1 ms, and 50.0 ms; each run had one gap over 32 ms. |

One instrumented run placed the structural gap across pointer-down: the mark before pointer-down was
540.0 ms and the mark after it returned was 589.6 ms. The continuous movement that followed was
otherwise close to the display cadence. This narrows the first audit to drag activation, initial
session/overlay setup, geometry reads, React work, and style/layout/paint invalidation. Production
and development builds must both be profiled before choosing the fix; development overhead is a
variable to measure, not an excuse to dismiss the interaction.

The existing `perf/phase-0-browser-render-baseline.md` and
`perf/phase-5-milestone-performance.md` remain valuable. They prove bounded geometry, planner work,
identity retention, and canonical commit behavior. They do not supersede a frame-pacing trace.

## Setta visual reference

The useful reference is the old frontend at the recorded `main` commit, especially:

- `main:frontend/src/components/Section/Container/sectionChrome.ts`: white or near-black section
  surfaces, blue active outlines, restrained borders, and different locked/unlocked corner
  treatments.
- `main:frontend/src/components/Section/Container/ContainerCore.tsx`: translucent slate group
  surfaces, large rounded group containers, an inline header, and a clear empty-drop affordance.
- `main:frontend/src/components/Section/Header/SectionHeader.tsx`: compact type-aware header,
  inline title, small tag indicator, and context-sensitive controls.
- `main:frontend/src/components/Section/Header/HeaderIcon.tsx`: section-kind icons and restrained
  muted-to-blue hover behavior.
- `main:frontend/src/forks/xyflow/controls/Controls.tsx`: narrow vertically grouped viewport
  controls with subtle dividers and active blue states.
- `main:frontend/src/components/Pages/Project/ResponsiveMiniMap.tsx`: compact translucent minimap
  treatment.
- `main:frontend/tailwind.config.js`: Setta's slate-blue tonal family.

Preserve the identity, not every old detail. In particular, do not carry over 11 px titles, tiny
hit targets, hover-only access to actions, global `.dark`, Tailwind utility coupling, or backend/app
state. The new implementation should retain at least 40 × 40 px desktop interaction areas and 44 ×
44 px coarse-pointer areas, visible `:focus-visible`, non-color state cues, 200% zoom/reflow, and the
current keyboard and screen-reader contracts.

## Package visual system

### Appearance and theme ownership

Keep the package CSS self-contained under `.setta-workspace` and keep
`appearanceOptions.appearance` as `light`, `dark`, or `system`. Replace the current generic defaults
with independently tuned Setta light and dark palettes expressed in gamut-safe OKLCH.

Expand `WorkspaceThemeTokens` with these color roles:

- `sectionHeaderBackground`
- `sectionBorder`
- `groupBackground`
- `controlBackground`

Retain the existing canvas, grid, section, text, muted text, toolbar, minimap, selection, focus,
invalid, and connection roles. Export and document the corresponding scoped custom properties.
Derive local hover and subtle elevation colors only from semantically compatible roles.

Do not add a generic design-system engine, a neutral preset, or public selectors for every internal
element. In this pass:

- Setta owns typography scale, spacing, radii, shadow recipes, and motion defaults.
- The package inherits the host font family and does not download or bundle a brand font.
- Consumers customize semantic colors, section accents/tags, per-section chrome, registered icons,
  host content, toolbar controls, panes, and overlays through supported APIs.
- If a later consumer needs global density or arbitrary geometry tokens, design that contract from
  a concrete use case rather than exposing every CSS constant now.

Changing these greenfield theme types is allowed. Update declarations, API reports, docs, fixtures,
and consumer checks directly; do not add old-token aliases or a transition layer.

### Canvas and grid

- Make the root workbench fill the dimensions supplied by its host. Keep a documented minimum-size
  recommendation, but remove the viewport-based height cap from package CSS.
- Use a quiet cool-slate canvas with a lower-contrast dot grid by default. The grid should provide
  spatial orientation without becoming the dominant texture.
- Retain configurable dot, line, and cross patterns, visibility, color, spacing, and independent
  snapping.
- Keep selection, invalid movement, connections, grid, and focus as distinct semantic colors.
- Use one subtle inset boundary only when it clarifies embedding. The full-screen playground should
  not look like a rounded card floating inside another webpage.

### Section frame

Redesign `WorkspaceSectionFrame` around a compact Setta header and a quieter content surface:

- Use one primary header row. Render the registered type icon, title, optional tag dot, compact
  lock/minimize/detached cues, and contextual actions.
- Remove the always-visible second line containing the section kind. Keep kind information in the
  accessible article name, creation UI, icon tooltip, outline navigator, and any expanded details
  surface.
- Keep the title visually around 13 px with strong weight and restrained tracking. Host body text
  should remain at a comfortable readable size.
- Keep one explicit, keyboard-operable movement handle. It may share the leading visual cluster,
  but it must retain its accessible name, drag semantics, focus behavior, and touch target.
- Put secondary presentation/layout actions in one Setta-style overflow/popover instead of showing
  a row of equally weighted boxed controls. Show frequently needed state actions when the frame is
  selected or focus is within it; never make actions hover-only.
- Use a 2 px blue selected outline and a stronger but non-layout-shifting moving/resizing treatment.
  Focus, selection, and invalid movement remain distinguishable.
- Use light elevation for top-level sections. Avoid stacking a full shadow at every nested depth.
- Show resize handles only for the selected/focused resizable section. Make their visible grip
  subtle while preserving their full hit area.
- Render minimized sections as a compact header-only surface. Preserve state text for assistive
  technology without permanently displaying pill labels in every header.
- Treat tags as small categorical dots; treat accent color as a restrained local surface/header
  tint. Neither replaces selection, focus, lock, or error cues.

Apply the same language deliberately to `default`, `compact`, `transparent`, and `none` chrome.
Headerless modes still need an accessible title, movement surface, selection affordance, and action
disclosure.

### Containers and arbitrary nesting

- Make containers visibly different from leaf sections with a soft translucent group surface,
  broad radius, and contained padding, echoing old Setta groups.
- Do not progressively add heavier shadows, darker tint, or smaller typography at every depth.
  Arbitrary nesting must remain legible rather than forming a visual tunnel.
- Keep vertical, horizontal, and freeform child positioning obvious through layout and drop
  previews, not permanent explanatory labels.
- Replace the current large dashed empty container with a quiet “Drop sections here” affordance
  that strengthens only while a compatible drag is active.
- Ensure horizontal groups, scroll containers, and compact sections do not overflow action chrome.
  Use container queries and logical properties rather than viewport assumptions.

### Toolbar, menus, panes, and minimap

- Restyle the ready-made toolbar as a narrow Setta rail with small visual icons inside 40 px hit
  areas, subtle group dividers, and a clear blue active state.
- Keep tooltips secondary to proper button names. Tooltips work on hover and keyboard focus and do
  not contain essential instructions unavailable elsewhere.
- Give creation, selection actions, section actions, saved views, and positioning dialogs one
  shared floating-surface recipe: quiet surface, modest radius, restrained shadow, and clear focus.
- Restyle side panes and the outline navigator as part of the workspace surface, not unrelated
  white cards.
- Use a compact Setta minimap with a subtle mask and border. Preserve pannability, clickable nodes,
  side placement, and contrast in both appearances.
- Keep host toolbar controls visually integrated while preserving their host-provided labels and
  behavior.

### Motion and interaction feedback

- Animate only opacity, color, and transform where motion materially explains state. Keep ordinary
  transitions around 120 ms and interruptible.
- Disable nonessential motion under `prefers-reduced-motion`.
- Do not animate section position through CSS while pointer movement or dnd-kit projection already
  owns the transform.
- Use a compact section-shaped drag overlay and precise insertion/freeform placeholders rather than
  a large generic label card.
- Keep hysteresis and previous-target retention visible as stability: indicators should not flicker
  between a parent and child near ambiguous boundaries.
- If profiling identifies blur or shadow paint cost, suspend that cosmetic effect under a scoped
  active-interaction attribute and restore it at completion. Do not apply broad permanent
  `will-change`, forced compositing, or filter removal without before/after evidence.

## Structural-drag performance work

### Establish a repeatable interaction profile

Add one repository-owned browser profiling command and an append-only report. Exercise development
and production builds with representative host content at 0.5×, 1×, and 2× workspace zoom:

1. Top-level XYFlow spatial movement.
2. Nested ordered sorting.
3. Cross-depth free move, including an empty destination and ambiguous parent/child targets.
4. Same-parent nested freeform movement.
5. Single- and multi-item dragging.
6. Root and nested resize.
7. Canvas pan, wheel zoom, and minimap navigation.

Capture:

- Pointer-down to drag-start and pointer-down to first visual update.
- Animation-frame gaps during activation, sustained movement, target changes, and commit.
- Long tasks, React commits/render counts, style recalculation, layout, paint, and compositing.
- Geometry-index reads/publications, collision candidate count, overlay mount work, and canonical
  document changes.
- Behavior with warm and cold interaction paths and at a declared CPU throttle.

Keep one stable fixture and runner configuration in the report. Do not create a cross-machine hard
millisecond CI threshold from a single laptop. On the declared reference run, the immediate target
is to eliminate the repeatable startup gap above 32 ms, avoid long tasks at or above 50 ms during an
active gesture, and keep sustained movement close to display cadence. CI should additionally guard
portable invariants: no full-tree geometry scan, no unrelated section rerender, bounded geometry
publication, and one canonical commit.

### Audit and fix the activation path

Profile before changing code, then investigate these bounded hypotheses:

- dnd-kit sensor activation and initial source/droppable measurement.
- `resolveCollisionRect`, `createWorkspaceSectionMoveSession`, selection-root normalization, and
  geometry snapshot construction.
- Synchronous `getBoundingClientRect`, `elementFromPoint`, or animation inspection that duplicates
  the package geometry index.
- Initial drag overlay mount/measurement and feedback-store publication.
- Context/state changes that rerender every recursive frame at drag start.
- Style/layout invalidation from active attributes, focus changes, shadows, blur, or nested
  selectors.
- Development-only React work versus production behavior.

Prefer these ownership-preserving fixes:

- Build the session from the existing incremental geometry index and stable selection snapshot.
- Prepare cheap immutable identifiers on pointer-down; defer nonessential feedback and overlay work
  until the first animation frame when doing so does not change input semantics.
- Keep continuous previews imperative and transform-only, as the current projection owner intends.
- Keep dnd-kit as sensor/lifecycle infrastructure and the package as movement planner; do not fork it
  or leak its store into public API.
- Narrow React subscriptions and memoize recursive frame chrome where traces prove a start-state
  broadcast is expensive.
- Avoid mounting a visually heavy clone of the complete section body as the drag overlay.
- Preserve exact pointer, touch, keyboard, cancellation, auto-scroll, zoom, selection, and
  hysteresis outcomes in existing tests.

Document the actual cause and before/after evidence. Do not merge a speculative bundle of
micro-optimizations whose individual effect is unknown.

## Playground redesign

### Canvas-first shell

Replace the default page composition with:

- A compact top bar containing “Setta Workspace,” a small “Playground” label, movement mode, theme,
  help, and settings/data actions.
- A workspace area that fills the remaining viewport.
- The built-in viewport toolbar and minimap inside the canvas.
- One polite status region that does not reserve a large empty row.
- Responsive settings/data panels that overlay or dock without permanently shrinking the canvas.

Keep the test/proof routes available by query string, but do not let their debugging layout dictate
the default page. Avoid adding Storybook or another UI runtime solely for this redesign; add a
package-owned visual-matrix playground route using the existing Vite/Playwright harness.

### Representative first document

Use a new playground-only storage key with no migration. When that key is absent, load a compact
example document and fit it once. Do not overwrite later user edits or re-fit every refresh.

The example should include:

- A concise note section.
- A small status/counter section.
- A “Customer onboarding” group containing a vertical pair and one nested horizontal group.
- A moderately sized field-list section demonstrating item selection and nested drag-and-drop
  without occupying most of the canvas.
- One freeform child container or an immediately discoverable control that demonstrates switching
  positioning modes.
- Deliberate accents and tags that demonstrate presentation without turning the canvas into a color
  palette.

Author sensible initial fixed/content dimensions and positions, then verify the exact first viewport
at 1440 × 900, 1024 × 768, and a narrow reflow. The default document should be usable immediately,
not merely technically present offscreen.

### Progressive disclosure and copy

- Put JSON import/export, persistence diagnostics, fixture switches, and destructive reset in “Data
  and diagnostics.”
- Keep appearance and grid controls in “Workspace settings” or the existing toolbar where
  appropriate.
- Label movement mode plainly as “Move sections: Sort” and “Move sections: Free move.”
- Add a small optional “Try these interactions” panel with three direct actions: move a section,
  nest it, and reorder fields. Do not put a tutorial banner over the canvas.
- If the user empties the workspace, show a concise orientation and one “Add section” action.
- Keep reset confirmation, but label the consequence “Reset example” rather than “OK” or “Yes.”
- Use sentence case and one consistent term—section—throughout the playground.

## Visible React Flow attribution

Implement this as a branding change with explicit compliance checks:

1. Set `proOptions={{ hideAttribution: true }}` for the production adapter and all internal proof
   ReactFlow instances.
2. Remove `.react-flow__attribution` styling that becomes unreachable.
3. Add an E2E assertion that the default playground and proof route contain no
   `.react-flow__attribution` element.
4. Keep `packages/workspace/THIRD_PARTY_NOTICES.md` in the packed artifact.
5. Keep the dependency license inventory, allowlist, runtime package license material, and
   supply-chain audit unchanged.
6. Update the verification guide to distinguish visible product branding from third-party legal
   notices.

This plan does not decide whether or how the package is published.

## Implementation phases

### Phase 0 — evidence and design contract

- Record before screenshots for the default playground, populated example, section-state matrix,
  light/dark, nested layouts, toolbar, minimap, menus, and 320 px/200% reflow.
- Add the repeatable development/production interaction profiler and record baseline traces.
- Write a compact visual reference matrix from the main-branch Setta files listed above: preserve,
  modernize, or discard each cue.
- Ratify the semantic token additions and state matrix for default, hover, focus, selected, moving,
  resizing, locked, minimized, detached, invalid, read-only, and culled frames.
- Create the public-API-only visual-matrix route.

Exit when the current failure is reproducible, the target state is specific enough to review, and
no implementation depends on copying old application code.

### Phase 1 — remove the structural-drag hitch

- Profile the dnd-kit activation path, initial session, geometry reads, overlay, feedback store,
  React commits, and paint.
- Fix the measured owner while preserving all structural movement semantics.
- Re-run root, sort, free-move, nested freeform, item, resize, pan, zoom, pointer, touch, and keyboard
  workflows.
- Record the cause and before/after profile in `perf/`.

Exit when the declared reference profile no longer shows the repeatable startup gap above 32 ms,
there is no interaction long task at or above 50 ms, and the existing structural gates remain green.

### Phase 2 — Setta package chrome

- Replace default light/dark colors and add the four semantic theme roles.
- Make the workbench host-sized.
- Redesign section, group, header, action, resize, empty-drop, drag-overlay, selection, and invalid
  states.
- Restyle toolbar, menus/dialogs, panes, outline, minimap, saved views, and detachment surfaces.
- Apply every chrome variant and accent/tag combination to the same system.
- Hide the React Flow badge and update compliance documentation.
- Update the theme guide, API report, consumer fixture, screenshots, and tests.

Exit when the visual matrix passes in light/dark, no public consumer needs private selectors, and
the Phase 1 performance profile has not regressed.

### Phase 3 — convincing playground

- Replace the marketing/test-harness layout with the canvas-first shell.
- Add the representative first document and one-time initial fit.
- Move settings, data, JSON, persistence, and diagnostics into progressive disclosure.
- Tune sample renderer sizes and content so sections demonstrate rather than obstruct interaction.
- Add concise help, a useful empty state, and responsive layouts.

Exit when a fresh browser immediately displays a populated, fitted workspace and the main features
can be discovered without opening JSON data or a proof route.

### Phase 4 — full-state hardening

- Re-run every existing package workflow and refresh only intentional visual baselines.
- Verify keyboard completion, focus restoration, accessible names/roles/states, announcements,
  contrast, hit areas, 200% zoom, 320 px reflow, RTL, coarse pointer, and reduced motion.
- Profile large documents and all-depth culling with the final CSS, including selected and active
  pinning.
- Verify detached-window theme propagation and the no-attribution assertion.
- Run package build, local pack, unrelated consumer, API report, quality, supply-chain, license, and
  vulnerability gates.
- Record final screenshots, traces, and findings.

Exit only when polish, smoothness, accessibility, package isolation, and all existing behavior are
verified together.

## Verification matrix

### Visual

Review at minimum:

- Fresh first launch, populated document, and deliberate empty document.
- Light, dark, and system appearance.
- Root leaf, root group, nested leaf, deep nested group, vertical, horizontal, and freeform layout.
- Default, compact, transparent, and headerless chrome.
- Idle, hover, focus-visible, selected, multi-selected, moving, resizing, locked, minimized,
  detached, read-only, rejected, and invalid-drop states.
- Accent and tag colors with non-color state cues.
- Toolbar groups, host control, context creation, selection actions, section actions, saved views,
  panes, outline, minimap on both sides, and detached window.
- 1440 × 900, 1024 × 768, 320 CSS px, 200% page zoom, RTL, coarse pointer, and reduced motion.

### Interaction and performance

- Root drag, sorting, cross-depth free move, nested freeform movement, item drag, resize, pan, zoom,
  marquee, and minimap navigation have before/after traces.
- No pointer path writes canonical document state per frame.
- One accepted gesture creates one canonical change and history entry.
- No unrelated recursive frame rerenders during sustained transient work.
- Geometry/collision work remains bounded by registered visible candidates and the incremental index.
- The visual redesign does not add repeatable drag frame gaps, layout shifts, scroll jumps, focus
  loss, or target flicker.

### Accessibility and writing

- Every pointer flow has its documented keyboard path.
- Controls use native elements, visible focus, descriptive names, and state attributes.
- Selected-state actions remain reachable without hover.
- Desktop hit areas are at least 40 × 40 px; coarse-pointer hit areas are at least 44 × 44 px.
- Text and component boundaries meet reviewed contrast thresholds in both appearances.
- Dynamic outcomes are announced without narrating every pointer move.
- Motion respects `prefers-reduced-motion`.
- Copy uses sentence case, verb-first actions, actionable errors, and an empty state that points
  forward.

## Definition of done

This plan is complete when:

- `@setta/workspace` renders Setta-styled light/dark chrome by default with no host theme setup
  beyond importing its CSS.
- A consumer can override documented semantic colors and use the existing renderer, icon, chrome,
  toolbar, pane, and overlay extension points without importing package internals.
- The default playground opens to a polished, populated, fitted, canvas-first experience.
- Section and group chrome remains clear through arbitrary nesting without excessive elevation or
  cumulative visual noise.
- The toolbar, minimap, menus, panes, drag overlays, placeholders, resize handles, and detached
  windows share one coherent Setta language.
- The repeatable nested structural-drag startup gap is removed on the declared reference profile,
  sustained gestures remain smooth, and existing correctness/performance invariants remain green.
- The visible “React Flow” badge appears nowhere in package-owned UI, while third-party legal
  notices and audits remain intact.
- All existing workbench capabilities pass without a legacy theme, compatibility shim, migration,
  dual path, or imported old-app architecture.
- Full quality, browser, accessibility, local pack/consumer, supply-chain, license, and vulnerability
  checks pass.

## Explicit non-goals

This plan does not include:

- Preserving the current neutral theme.
- Copying the old Setta component tree, app state, Tailwind configuration, XYFlow fork, or backend
  integrations.
- A generic theme marketplace, arbitrary CSS-in-JS theme object, or public token for every spacing
  and radius.
- Domain-specific Python, MCP, agent, data, file, code-generation, execution, or plugin behavior.
- A backend, persistence service, authentication, collaboration, or sharing.
- Publishing to npm, creating a public GitHub repository, release automation, or a public license
  decision.
- Backward compatibility, legacy aliases, migrations, transitional CSS, or old/new theme flags.
- Removing or narrowing third-party license obligations.

## Immediate first slice

The first implementation slice should stop after it proves the direction:

1. Add the visual-matrix route and record the current package and first-launch screenshots.
2. Add the repeatable interaction profiler and record development and production root-versus-
   structural drag activation traces.
3. Remove the visible React Flow badge while preserving and testing legal notices.
4. Add the four semantic color roles and Setta light/dark defaults.
5. Restyle one root leaf, one root group, one nested leaf, the toolbar, and the minimap through public
   package surfaces.
6. Fix the measured structural-drag activation owner and re-run the same traces.
7. Put the representative example directly into a viewport-filling playground shell.
8. Review this vertical slice visually and through keyboard, accessibility, 200% zoom, narrow,
   reduced-motion, package-boundary, and packed-consumer checks before styling every secondary
   surface.
