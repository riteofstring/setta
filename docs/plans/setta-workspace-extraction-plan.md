# Setta Workspace Extraction Plan

## Status

**In implementation.** On 2026-08-10 the developer added the plan-implementation loop runner
(`scripts/automation/codex-loop/run-plan-implementation-loop.sh`, commit `179364666`) and launched
it against this plan, authorizing implementation to proceed under this plan's gates. The loop
performs repository-actionable work only; Phase 0 evidence capture and every developer-approval
exit gate remain supervised developer work that no agent or test suite can waive.

Preflight progress (2026-08-10):

- Item 1: `../setta-main` verified clean on `main` at `043d3b2e9`. The supervised Phase 0 capture
  subsequently launched that exact checkout successfully against disposable runtime/project data;
  the frozen worktree remained clean.
- Items 2–3: complete — branch pruned to a package-focused skeleton in a mechanical cleanup
  commit; confirmed no Setta runtime, backend, domain, or generated-client source remains tracked.
  The worktree-scoped Chrome DevTools MCP helpers (`scripts/chrome-devtools-mcp.sh`,
  `scripts/cdp-port.sh`) and the loop runner were retained as minimal tooling surface.
- Item 4: complete — `AGENTS.md` and `README.md` replaced with package-focused guidance.
- Item 5: complete — obsolete plan documents deleted (`modular-workbench-oss-plan.md`; the
  greenfield `standalone-section-workbench-oss-plan.md` was deleted earlier). This is the single
  active extraction plan.
- Items 6–8 (quality and supply-chain tooling contract): complete on 2026-08-10. The tooling was
  inventoried and the package-relevant contract implemented in `scripts/*.mjs` with plain Node/pnpm
  (no Go or Python runtime): `pnpm run quality` with changed/staged/all/
  explicit-file modes runs the static gate (formatting, ESLint with source/test complexity plus
  production `max-depth`/`max-params`, typecheck dispatch, dependency/boundary policy, Knip,
  file-length ceilings ratified from frozen-reference evidence). The networked
  `pnpm run supply-chain:check` gate covers frozen install, an isolated lockfile-sync check,
  an independent transitive release-age audit, `pnpm audit` at moderate, the SPDX license
  allowlist, and the dependency inventory. The seven-day release-age policy lives in
  `supply-chain-policy.json` and
  is mechanically checked against `pnpm-workspace.yaml`; `supply-chain-exceptions.json` starts
  empty and every exception path demands owned, expiring metadata. Item 8's blocking
  demonstrations (install-time and audited release age, lockfile drift, disallowed builds,
  unowned/expired exceptions, vulnerabilities, licenses) ran against a clean frozen install and
  are recorded in `docs/quality-and-supply-chain-tooling.md`. The preflight is complete; Phase 0
  evidence capture remains supervised developer work.

Phase 0 progress (2026-08-10):

- Item 1: complete — `../setta-main` re-verified clean on `main` at `043d3b2e9`; the "able to run"
  check passed during the supervised item 2 capture.
- Item 2: complete — the frozen reference ran successfully and the required light/dark screenshots,
  interaction traces, no-drag checks, computed geometry/styles, narrow viewport, browser 200% page
  scale, and XYFlow 200% zoom evidence are indexed in
  `docs/evidence/phase0/reference/README.md`.
- Items 3–5: complete — the import/dependency cone of the leaf, group, toolbar, minimap, drag, and
  resize surfaces, the classification of every application-owned state read, and the exact
  Tailwind/font/icon/style/fork inventory are recorded in `docs/evidence/phase0/dependency-map.md`.
- Item 6: complete — experimental-branch donors compared against their main owners without
  adoption in `docs/evidence/phase0/donor-comparison.md`.
- Item 7: complete — the smallest package seam and every temporary main-only dependency are
  proposed in `docs/evidence/phase0/extraction-seam-proposal.md`.
- Item 8 and the Phase 0 exit gate are complete — on 2026-08-10 the developer explicitly approved
  the captured reference set and exact Phase 1 slice together with the seam proposal. Phase 1 may
  proceed, without widening the approved slice.

Phase 1 progress (2026-08-10):

- Foundation batch complete: `packages/workspace` (`@setta/workspace`, provisional source exports)
  and `apps/playground` (backend-free Vite host, port 5174 for side-by-side against main's 5173)
  exist as pnpm workspaces wired into the quality, Knip, dependency-policy, and typecheck gates.
- Chrome core extracted from the frozen reference: `sectionStyleColors.ts` verbatim;
  `sectionStyleVars` trimmed to the six core section-style variables (the arg/agentic handle
  variables left with the excluded edge features); `sectionColors`/`sectionChrome` trimmed to the
  slice-reachable states (meta-control, attached-terminal, full-bleed, agentic-scope, AI-highlight,
  and app-type branches cut at extraction per the seam proposal). Characterization tests freeze the
  exact emitted class strings and hex derivations produced by executing the reference algorithm.
  The section grid system and `transition-radius` moved into the package stylesheet, and the setta
  palette into a package-owned Tailwind preset; the playground renders the five reachable chrome
  states in light/dark and compiles the package source provisionally (Phase 2 ships the compiled
  scoped stylesheet).
- Tooling pins diverge from the reference only where the repository's supply-chain controls block
  the reference's versions (controls kept, versions moved): `vite 6.4.3` (≤6.4.2 has
  GHSA-fx2h-pf6j-xcff), `postcss 8.5.25` (8.4.31 has two high sourceMappingURL advisories),
  `vitest 4.1.10` (2.1.9 depends on vite ^5, a blocked trust downgrade), no `@vitejs/plugin-react`
  (its `@babel/core` → `semver@6.3.1` edge is a blocked trust downgrade; Vite's esbuild JSX
  transform serves the playground without fast refresh), and no `autoprefixer` (its `caniuse-lite`
  transitive is CC-BY-4.0, outside the license allowlist; prefixing is a Phase 2 compiled-stylesheet
  decision). Runtime pins (`react 19.1.1`, `tailwindcss 3.4.1`) match the reference.
- Document/selection state extracted (2026-08-10): the package owns the structural document store
  (resolved sections, top-level layout with the reference's purge-at-write semantics — see the
  Phase 1 audit entry, viewport, parent map), the
  node-internals projection (measured-size-wins, style-color node backgrounds via the package
  appearance store), the active-sections store, the slice-reachable selection policy
  (section-click single/multi, pane-click, selection-rect), z-index raise/normalize, and the
  atomic-publication discipline (`runWithAtomicallyPublishedWorkspaceStores`), all frozen by
  characterization tests ported from or written against the reference algorithms. Backend-sync
  bookkeeping, param interactions, view modes, and variant indirection stayed application-side per
  the seam proposal; the selection controller (`applyActiveSectionChange`) lands with the canvas
  batch that owns the multi-selection key state. The playground now loads a workspace document and
  drives selection/z-order through the package stores instead of hardcoded chrome previews.
  Runtime pins from the reference: `zustand 5.0.8`, `use-sync-external-store 1.6.0`,
  `lodash 4.18.1` (supply-chain gate rerun clean on the dependency change).
- Canvas/viewport slice extracted (2026-08-11): the xyflow fork's canvas core moved into
  `packages/workspace/src/canvas/` with its MIT license file — viewport store (d3-zoom transform,
  pan/zoom flags, marquee/selection-box state, fit-view-on-init), ZoomPane (wheel/pinch/pan
  filters, interaction-burst tracking, NO_WHEEL/NO_PAN boundaries), Pane (click-to-deselect,
  shift-drag marquee via the extracted selection controller), NodeRenderer/NodeWrapper (top-level
  nodes with ResizeObserver measurement and full-surface d3-drag with NO_DRAG exclusions,
  multi-node drag, temp z-raise, auto-pan at canvas edges, snap-to-grid on drop),
  NodesSelection (multi-select box with drag and arrow-key movement), the 5,000 px scroll shim,
  and the structural canvas CSS written as the effective post-override values. The package now
  owns the seam-5 interaction-boundary constants, the activation-key state (Shift marquee,
  Mod multi-select/zoom, Space pan — the reference's shipped shortcut defaults), the seam-7
  interaction options store (reference defaults incl. snap-to-grid 15px), `getOnSectionClick`
  (drag-suppressed activation via the package gesture store), and the document/canvas viewport
  seam: a null document viewport arms fit-on-init (nodes hidden until fitted), transform changes
  mirror into the canonical document viewport, and drag ends commit node layout into the document
  (the reference's layout-funnel semantics minus the app's debounced backend send, which is the
  Phase 2 change-callback). Deliberate cuts at extraction, returning with their owning batches:
  dnd-kit gating of the zoom filter and the selection drag handle (dnd batch), nested-section DOM
  fallbacks in marquee hit-testing/bounds and the `ignoreGrid` thread (section-refs come with the
  container batch), zoom/fit helpers (toolbar batch), context menus, file drop, AI-follow, and
  edge renderers (out of slice). Deviations from the reference DOM, for the repo's a11y gate:
  the pane and multi-select rect carry role/tabIndex/aria labels, and the pane keeps an Escape
  deselect handler (the reference's app-level Escape shortcut). Reference characterization tests
  ported for the zoom filter/pan-on-scroll/interaction-burst lifecycle and initial-fit (jsdom
  component mounts), fit-view, marquee hit-testing, and drag grouping; new focused tests freeze
  the controller, key activations, and viewport seam. Playground renders the document on the real
  canvas via the provisional render-prop content seam. Seam adaptation: fit-view centering and
  edge auto-pan measure the package canvas wrapper alone; the reference offsets both by its
  Overview/UI-editor rail widths, which are app chrome outside the package seam. New exact pins from the reference:
  `classcat 5.0.3`, `d3-drag 3.0.0`, `d3-interpolate 3.0.1`, `d3-selection 3.0.0`,
  `d3-transition 3.0.1`, `d3-zoom 3.0.0` (+ per-module `@types/d3-*`, `react-dom 19.1.1`,
  `jsdom 28.1.0` dev-only). The supply-chain gate reran clean after adding OSI-approved `MIT-0`
  to the license allowlist for jsdom's dev-only cssstyle transitives (documented in
  `docs/quality-and-supply-chain-tooling.md`).
- Section container, header, and resize extracted (2026-08-11, `a99e5ac8f`): the node wrapper
  renders the package-owned `SectionContainer` instead of handing the whole node to the host —
  leaf shell (selection-outline overlay, compositor hoist during viewport interaction), group
  chrome (sibling outline layer, recursive nested children, orientation flow, empty-group drop
  hint), and the header with the double-click-editable title and the
  menu/lock/minimize/delete/change-orientation controls (css.gg glyphs at the slice-reachable
  subset); the host content seam moved inside the shell. Resize returned with its owning batch:
  `CustomResizable` on `re-resizable` (bottom/right/corner handles with reference hit geometry,
  auto-size promotion, double-click reset, min/max clamping, resize events),
  `ResizableWithScale`, and the sizing policy; the section-ref registry supplies the
  DOM-measurement fallback promised by the canvas batch for marquee hit-testing and selection
  bounds. The document layer gained the per-flag mutation funnels (rename, lock, minimize,
  orientation, delete — canonical writes; the Phase 2 change-callback seam owns host
  notification), the capability seam (`canEditLayout`/`canEditStructure`, default fully
  editable), and `GROUP_SECTION_KIND`; the playground slice added a root group with a nested
  leaf. Lint-forced, visually identical deviations: the leaf shell and editable title render as
  `div role="button"` (the a11y gate forbids interactive roles on section/p), keyboard activation
  lands on the shell/group root, and effect deps are exact. New exact reference pin:
  `react-icons 5.3.0`. Deviation forced by the supply-chain controls (controls kept, version
  moved): the reference pins `re-resizable 6.9.0`, whose react/react-dom peer ranges
  (`^16.13.1 || ^17.0.0`) fail the repository's strict peer resolution against React 19, so the
  pin moved to `6.10.3`, whose peers admit React 19. Supply-chain gate rerun clean.
- Toolbar zoom/fit surface and tooltip singleton extracted (2026-08-11): the viewport toolbar at
  the seam proposal's slice form — the viewport group alone (zoom in/out, fit, snap grid, reset
  zoom) with the reference chrome, order, icons, and active/disabled states; the edge-toggle and
  plugin-placement groups left with their features, and the minimap group arrives with the
  minimap batch that makes its toggles reachable (with one group, the reference's dividers never
  render). The reference's asymmetric control geometry is preserved: only reset-zoom carries
  `react-flow__controls-button` (26×26 content-box against the other controls' 23×23, per the
  Phase 0 computed metrics), and that stylesheet's `:disabled` rules were not carried because the
  only control with the class never disables. The zoom commands moved from the reference's
  `useViewportHelper` (50 ms-throttled scaleBy 1.2, reset to `defaultZoomLevel` over 100 ms;
  `setViewport`/`setCenter` stayed with minimap and AI-follow), and `onFitViewHandler` extracted
  verbatim including its post-transition `fitViewOnInit` arming hack and document-sync interplay;
  `transitionDuration` (50 ms) joined the interaction options. The seam-8 tooltip singleton is
  the reference `FloatingBox` trimmed to its mouse-following form: enabled while the bare tooltip
  key is held (shipped default "Q", ignored in editable targets, owned by the package key
  activations), it shows the hovered control's content string at the reference's initial 256 px
  width; frozen mode, the copy button, multi-page content, the shortcut-hint footer, and the
  resizable width left with the app shortcut engine and convert-to-section features that drive
  them, and the engine's command shortcuts (fit "F", zoom "="/"-", zoom-to-mouse "Z") remain
  application-side. The header's lock/minimize/delete buttons attach the tooltip handlers beside
  their native titles, both as the reference. The playground hosts the toolbar in a left rail
  (the reference composes it at the Overview rail bottom, outside the canvas) and mounts the
  tooltip singleton. No dependency changes.
- dnd-kit fork drag slice extracted (2026-08-11): the fork's adapter (the re-created v6-shaped
  API over upstream `@dnd-kit` — provider with the AutoScroller filtered out, the 600-line
  re-implemented `SortableContext`, transform-based `useSortable`, re-vendored sorting
  strategies, and the custom collision layer with its hysteresis: ±10 px past-halfway buffer and
  first-encounter geometry snapshot per collision target, ×1.1 previous-winner boost, zoom-scaled 20/100 px
  move-to-parent triggers) and the section-drag modules (drag-session and dnd-children stores,
  sensors, live re-parenting with temp-placeholder insertion, pure move planners, drop-time
  sorting fallback, deferred deactivation, shape sync, temp placeholder and free-move overlay)
  moved into `packages/workspace/src/dnd/` with the fork's MIT license file. The package key
  activations gained the held dnd modes at the shipped defaults (Alt = free move, Mod+Alt =
  sorting) with the reference engine's hold semantics: keydown is the only activator, releasing
  a key queues the deferred deactivation, and releasing Mod while holding Alt does not re-enter
  free move. The deliberate canvas-batch cuts returned with this owning batch: the zoom pane
  suspends panning while a dnd mode is held, and the multi-select box hands its surface to the
  free-move drag handle (`selectionDragHandle` + the invisible hitbox layer). The container
  side wires the reference structure: `TopLevelContainer` (droppable + draggable),
  `SortableSectionContainer`/`DNDSortable`/`ManyNestedSections` rendering nested children from
  the live dnd-children projection, `DndSlot` invalid-drop chrome plus droppable highlight and
  drag-opacity treatments, and `ContainerCore` merging the three ref systems and spreading the
  mode-gated drag listeners over the whole section surface. The commit funnel is the package
  `moveSections` (the reference's `moveSectionsWithBackend` canonical result; the backend send
  is the Phase 2 change-callback), which mirrors node z-raises into the layout before the
  atomic rebuild. Drop validity collapsed to the package rules — groups nest, never into the
  dragged selection; the reference's code/terminal-attachment, frozen-variant, singleton, and
  top-level-only rules left with their app features, as did the multi-parent-selection toast
  (the drag-only-the-active-section fallback is unchanged) and the DEV-only collision-stats
  instrumentation. The document → dnd-children sync is owned by the mounted dnd context
  (the package store lifecycle) instead of the reference's app-level store subscription.
  Deviation forced by the supply-chain controls (controls kept, versions moved): the reference
  pins `@dnd-kit/* 0.2.1`, but the packages' internal caret ranges resolve to the current
  0.2.x patch and the repository forbids version overrides, so the direct pins moved to
  `0.2.4` to keep the proven single-instance signal runtime; `forwardRef` wrappers became
  React 19 ref props. Reference characterization suites ported (collision tracker and
  compare, drag-event mapping, rect/sorting/zoom math, sortable presentation model, dnd
  state/children stores, sorting-over fallback, drop-type rules, move planners, shape sync,
  collision integration); new focused tests freeze the move funnel and the held modes, and the
  section-container suite now mounts the real dnd context. Supply-chain gate rerun clean on
  the dependency change.
- Phase 1 coherence audit (2026-08-11): the six batches were audited as one change against the
  frozen reference. Restored cross-batch promises that had only half-landed: marquee hit-testing
  now falls back to registered section DOM refs and sweeps document sections without
  node-internals entries (the canvas batch's promise, previously delivered only for selection
  bounds — reference fallback tests ported), and the pointer-events suppression hook gained its
  dnd half (sorting/free-move now disable section content, title, and resize surfaces as in the
  reference). Restored reference behaviors: drag end always densely normalizes z-indices before
  the layout commit; the layout write purges entries for parented or unknown sections and writes
  node measurements verbatim (the earlier "layout-memory" description was wrong — the reference
  purges at every layout write); dnd hold modes never activate from auto-repeat keydowns, prune
  stale held keys (macOS Meta-swallowed keyups), and release sorting on the first mouse move
  without the mod key (aborted Mod+Tab); the tooltip releases on any other keydown while held and
  never re-enables from an auto-repeat; section titles attach the tooltip handlers in both
  presentations (truncated-name tooltip); the orientation funnel refuses non-groups.
  Boundary/tooling: `PanOnScrollMode`/`SelectionMode` ride the package index, Knip's
  characterization-test entry role is now explicit (production entries come from the package
  `exports` map, which Knip reads; Knip polices at file granularity, so test-only exports stay
  visible to it only as entries), and the package README documents the React `^19.1.0` peer
  range the manifests already carried. All restored behaviors are frozen by new or ported tests.
- Known Phase 1 seam limits (documented, deliberate): `loadWorkspaceDocument` was a
  load-before-canvas-mount seam — re-loading while the canvas was mounted neither re-applied the
  loaded camera nor reset dnd bookkeeping (for example the disable registry); the first Phase 2
  batch lifted this limit (see the Phase 2 progress entry). Still true: the tooltip and toolbar
  Q-key handling mounts with the canvas key activations, so the separately-exported surfaces
  assume a mounted `WorkspaceCanvas`.
- Supervised live side-by-side pass (2026-08-11): frozen main and the playground ran concurrently
  in Chrome at the same 1492 x 696 CSS-pixel viewport and DPR 2. The first pass rejected three
  visible playground discrepancies and closed them before presentation: host body/header overlap
  (`c63e6f890`), arbitrary fixture dimensions instead of the reference's 202 x 124 outer leaf
  geometry (`1b4c516df`), and a Tailwind cascade that reduced reset zoom from main's 26 x 26 to
  24 x 24 (`ae1e8c3b6`). The recaptured dark/light, selected, moved, resized, minimized, and fit
  states plus exact computed comparisons are in
  `docs/evidence/phase1/side-by-side/README.md`. The developer rejected the first gate presentation
  for a missing reference canvas surface/grid, invalid-drop feedback hidden below the opaque drag
  preview, and unstable cross-parent placeholder placement. Commit `66d225825` restores the exact
  light/dark canvas and zoom-aware grid and portals drop feedback one layer above the preview. Its
  initial leading-edge correction fixed cross-parent entry but made the reverse threshold depend on
  the dragged section's height; the developer's follow-up reproduction exposed that bias. Commit
  `6a295560f` uses pointer position against the frozen target midpoint with the existing 10-pixel
  dead band for cross-parent insertion while retaining direction-aware edges within one parent. A
  temporary supervised trace of the next reproduction then showed that placeholder insertion moved
  the nested target 132 pixels and alternating group/child winners caused the tracker's single
  hysteresis rectangle to adopt the displaced geometry. Commit `2cbb1d9dc` stores the initial
  rectangle and past-halfway state per collision target, with a regression that recreates the
  alternation and geometry shift. Temporary tracing was removed before commit. The developer
  manually rechecked this corrected path and described it as “Much better”; Chrome automation still
  cannot synthesize the sustained Alt gesture itself. The feedback-layer and cross-parent
  collision-reference changes are explicit developer-directed corrections that supersede literal
  preservation of the frozen behavior.
  The supplementary `/settings` parameter-style source suggested by the developer is captured in
  the Phase 0 reference bundle without widening the Phase 1 slice. On 2026-08-11, after manually
  rechecking the corrected cross-parent interaction, the developer explicitly accepted the complete
  Phase 1 live side-by-side result. The Phase 1 exit gate is complete and Phase 2 may proceed.
- Remaining Phase 1 work: none.

Phase 2 progress (2026-08-11):

- Controlled document and change callback (the callback half of Phase 2 item 2): the package now
  owns `setWorkspaceDocumentChangeCallback`/`getWorkspaceDocument`, and every canonical commit
  funnel notifies the host once with the full serializable `WorkspaceDocument` (moved to
  `document/types.ts`) — the per-flag mutations (rename, lock, minimize, orientation; the
  non-group orientation refusal does not notify), delete, the dnd move commit, the resize
  funnel, drag-end and measurement layout writes, selection commits (the reference persists
  selection through `route_set_active_ids`), and the viewport mirror. Notification cadence
  matches the reference's canonical writes: the reference debounces only its network transport
  (500 ms layout / 1000 ms viewport), so debouncing is host policy and per-frame viewport
  mirrors notify per commit. Loads never notify (the callback reports package-initiated changes,
  not echoes of the host's own writes), and a callback that mutates the workspace synchronously
  fails loudly as a feedback loop.
- Mounted re-load semantics (lifting the documented Phase 1 load-before-mount seam limit):
  `loadWorkspaceDocument` is now the composition point between the document layer and the
  canvas/dnd runtimes. On a mounted canvas a re-load applies the loaded camera through d3-zoom —
  constrained exactly as mount-time initialization, keeping the element's internal zoom state
  consistent where the reference writes transform state directly and otherwise relies on keyed
  remounts — or, without a saved camera, arms fit-on-init before the publication (so the sync
  mirror fired by the flag flip lands in the outgoing document) and attempts completion from
  surviving measurements after it. Every load force-ends the drag session and prunes the dnd
  disable registry to the loaded document's sections. `ZoomPane` clears its d3 handles on
  unmount so the mounted-canvas detection stays honest, and `getInitialCanvasViewport`'s
  saved-camera branch now normalizes stale armed fit flags (mirroring the reference's
  `applyViewportFromProjectState` saved branch) — a deliberate correction: an unmounted-while-
  armed fit can no longer complete over a saved camera on remount; the two frozen ZoomPane fit
  tests were updated to the now-reachable state shapes. New focused suites freeze the callback
  contract, the re-load camera/dnd behavior, and the unmount cleanup; the playground registers
  the callback (render-isolated change readout) and drives an in-place document reload.
- Registration surface (the registry half of Phase 2 item 2, completing the boundary's
  kind/icon/default-size/renderer and opaque-data items): the package owns
  `registerSectionKinds`/`SectionKindDefinition` — application section kinds map to a content
  renderer, an optional header icon, and an optional default size, replacing the reference's
  per-type area switch (`SectionContainerCoreResizabe`), header icon record (`HeaderIcon`),
  and generated per-type size constructors (`createSectionSize` call sites). The provisional
  `renderSectionContent` canvas prop and its context were removed at the cut; section bodies
  resolve through the registry, headers render a registered icon with the reference's
  simple-icon treatment (themed / default-blue) or the reference's gg-menu fallback, and
  groups stay the one package-owned kind (registering `group` fails loudly). Loading
  validates every non-group kind against the registry and resolves an omitted section size
  from the kind's registered default, then the reference's auto/auto `createSectionSize()`
  default — `WorkspaceSectionInput`/`WorkspaceDocumentInput` are the load shapes; emitted
  documents always carry resolved sizes, so package output loads back unchanged. Sections
  gained application-owned opaque serializable `data` (JSON-value typed) that the package
  round-trips and hands to the renderer untouched. Registry, load-boundary, and icon suites
  freeze the contract; the playground registers its leaf kind before the initial load
  (no icon — the accepted gg-menu fallback), renders bodies from `data`, and takes the
  accepted 200 x 122 leaf geometry from the registered default size, keeping the approved
  slice visuals unchanged.
- Compiled package build, scoped stylesheet, and forbidden-import verification (items 1, 3, and
  4, 2026-08-11): the package `exports` map now serves compiled output — `vite build` in library
  mode bundles the runtime to `dist/index.js` (standard ESM with a source map; every bare
  specifier external, so the artifact imports only declared runtime dependencies and peers),
  `tsc -p tsconfig.build.json` emits the declaration tree, and the Tailwind CLI compiles the
  package-owned stylesheet to `dist/styles.css` from package source alone (`tailwindcss 3.4.1`
  added as a package devDependency — the version already pinned by the playground; supply-chain
  gate rerun clean). The compiled sheet ships no global Preflight and no host-wide selectors:
  `optimizeUniversalDefaults` keeps the Tailwind variable defaults on the utility classes
  instead of a `*` rule, and the Preflight subset the package's own elements rely on
  (box-sizing/border resets, heading/paragraph margins, media display, form-control font
  inheritance, button appearance and cursor) is scoped at Preflight's zero cascade specificity
  under the new `setta-workspace` marker class, which every package-rendered root now carries —
  the canvas, toolbar, tooltip, and both drag overlays portaled to `document.body`. The
  playground consumes only the compiled artifact: its Tailwind content no longer scans package
  source, its own preflight remains host chrome (mirroring the reference application shell), and
  the Phase 1 cascade fix for the reset-zoom control survives by its existing doubled-class
  specificity, which the build now asserts. The forbidden-import verification is mechanical:
  `scripts/check-package-boundary.mjs` joined the static quality gate (every package source
  import must be package-relative or a declared dependency, test files may also use dev
  dependencies, and the package tsconfigs must not alias resolution), and its `--built` mode
  runs at the end of every package build (bundled artifact imports only declared runtime
  dependencies/peers; stylesheet contains no host-wide selectors and retains the scoped base
  and reset-zoom markers). Because the playground typechecks against the built declarations,
  the quality gate now demands `packages/workspace/dist` with an explicit failure message
  instead of building implicitly; the build command is `pnpm --filter @setta/workspace build`
  (root `pnpm run build`). Knip derives the production entry from the vite library config, and
  the redundant explicit entry was removed after Knip flagged it.
- Remaining Phase 2 work: the temporary Setta integration worktree and the packed unrelated
  consumer (items 5–6), donor consideration (item 7), and integration evidence (item 8).

- Extraction branch: `workspace-extraction`
- Extraction base: `main` at `043d3b2e9`
- Frozen reference worktree: `../setta-main` on `main` at `043d3b2e9`
- Extraction worktree: this folder on `workspace-extraction`
- Temporary integration worktree: `../setta-workspace-integration`, created only when Phase 2 needs
  to prove that Setta can consume the packed package
- Experimental donor branch: `workspace-blank-slate`
- Working package name: `@setta/workspace` (local and unpublished during extraction)
- Publishing, repository creation, final public naming, licensing, and release automation remain
  undecided.

This plan replaces the deleted greenfield-rewrite plan for the workspace UI. Git retains that
document's history, but its implementation phases are obsolete and its design or interaction
decisions must not be imported silently.

## User outcome

Recover reusable value from the frontend work already present in Setta `main` by extracting an
opinionated, standalone TypeScript/React workspace package that:

- looks and behaves like the Setta workspace by default;
- preserves the interaction quality of the running Setta application rather than approximating it
  from prose;
- can be installed by an unrelated React application and populated with application-owned section
  renderers and data;
- can later support more specific Setta-derived libraries without owning their Python, code
  generation, MCP, agent, backend, or persistence behavior; and
- remains useful without publishing it during this implementation effort.

The immediate objective is not maximum genericity or feature count. It is to prove that Setta's
existing workspace product can be separated from the application without losing the qualities that
make it valuable.

## Non-negotiable decisions

1. **Main is the product authority.** The running application, captured interaction states, and
   computed styles outrank descriptions in a plan or an agent's interpretation of “Setta-like.”
2. **Extract before refactoring.** Preserve a working vertical slice first. Remove coupling through
   explicit seams only after visual and behavioral parity is demonstrated.
3. **Parity before genericity.** Do not redesign controls, rename concepts, modernize spacing, or
   substitute a generic design system during extraction.
4. **Dependencies are allowed.** Keep exact-pinned dependencies that improve the probability of
   preserving behavior. Dependency reduction is not an extraction milestone.
5. **Tailwind is allowed internally.** Start from the same pinned Tailwind version, relevant theme,
   fonts, and utility recipes as `main`. The eventual package ships compiled scoped CSS; consumers
   do not need Tailwind or Setta's Tailwind configuration.
6. **Keep proven fork behavior initially.** Do not replace Setta's XYFlow or dnd-kit adaptations with
   upstream packages during the parity slice. Upstream substitution is a later, separately measured
   decision.
7. **No backward compatibility.** Do not add migrations, aliases, dual paths, compatibility shims,
   transitional styles, or legacy APIs.
8. **No agent may approve visual quality.** Automated agents and screenshot tests can identify
   regressions, but only the developer can accept a visual parity milestone.
9. **No autonomous loop before the parity gate.** Phase 0 and Phase 1 are supervised, bounded work.
   Any later automation must stop at every developer-approval gate.
10. **Do not merge the experimental branch wholesale.** It is a donor of individually proven
    algorithms, tests, and tooling—not a second source of product truth.
11. **Keep the reference isolated.** Do not edit, pull, switch, install the extracted package into,
    or commit from `../setta-main` during a parity milestone. A changed reference requires an
    explicit re-baseline.

## Product thesis

The initial OSS-worthy product remains a standalone spatial section workspace. Its distinctive
value is not a generic infinite canvas, which XYFlow already supplies. Its value is the combination
already demonstrated by Setta:

- polished section and group chrome;
- arbitrary recursive nesting;
- ordered and freeform layouts;
- stable cross-depth drag-and-drop with hysteresis;
- section-content and parameter/item interaction boundaries;
- compact viewport controls and minimap;
- selection, movement, resizing, locking, minimizing, and stacking behavior that feels coherent;
  and
- a renderer boundary that allows unrelated applications to supply their own section content.

The first package should be opinionated. Generalize only when a concrete standalone consumer needs a
variation. Do not begin by building a universal canvas framework, design-system engine, backend
protocol, or family of micro-packages.

## Why the previous approach failed

The previous branch rebuilt a new workspace engine and UI from plans instead of extracting the
working product. It also allowed several process failures that this plan explicitly prevents:

- “Like Setta” became “Setta-inspired,” permitting visible and behavioral divergence.
- An explicit movement button replaced main's broad section drag surface.
- Tailwind and existing application dependencies were treated as liabilities before extraction.
- Performance and hardening work preceded developer approval of the visible product.
- Large visual batches refreshed screenshots without first establishing that the screenshots were
  desirable.
- Accessibility hit-area requirements were painted as large visible controls instead of separating
  invisible hit geometry from compact visible affordances.
- Automated phase audits verified deterministic output, not product quality.

Passing tests cannot close a visual phase under this plan.

## Extraction strategy

Use separate sibling worktrees so the product authority, extraction code, and later integration
proof cannot contaminate one another:

| Worktree                         | Role                                           | Mutation policy                                                               |
| -------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `../setta-main`                  | Executable and source reference at `043d3b2e9` | Run and inspect only; no source, dependency, branch, or commit changes        |
| This folder                      | Package-focused `workspace-extraction` branch  | Clean aggressively, extract code, and build the package and playground        |
| `../setta-workspace-integration` | Temporary Setta host created in Phase 2        | Make only the adapter changes needed to install and verify the packed package |

The reference source remains directly inspectable and copyable from `../setta-main`; it does not need
to remain duplicated in the extraction worktree. If the integration proof needs changes to the Setta
application, create the temporary integration worktree from the recorded reference commit. Never use
the frozen reference worktree for integration edits.

The intended target structure is:

```text
.
├── packages/
│   └── workspace/       # @setta/workspace TypeScript source and package-local tests
├── apps/
│   └── playground/      # backend-free consumer using only package exports
├── docs/
│   ├── plans/           # this plan
│   └── evidence/        # accepted reference and parity evidence
└── scripts/             # package-focused quality, security, and development tooling
```

The cleanup preflight may adjust these exact directories if a different package-workspace layout is
materially safer. Any change must retain four independently checkable boundaries:

1. the frozen Setta reference runs independently from `../setta-main`;
2. the package builds without application aliases, generated backend clients, or Setta runtime
   state; and
3. the example can install and run using only public package exports and ordinary third-party
   dependencies; and
4. the temporary integration worktree can install the packed artifact without modifying the frozen
   reference.

### TypeScript package contract

- Author the package in TypeScript and TSX under the working name `@setta/workspace`.
- Build standard ESM JavaScript, TypeScript declaration files, source maps, and one package-owned,
  compiled, scoped stylesheet. Consumers do not compile the package's TypeScript or Tailwind source.
- Expose the supported runtime, type, and stylesheet entry points through the package `exports` map.
- Treat React and React DOM as host-provided peer dependencies; keep other runtime dependencies
  explicit and exact-pinned under the repository dependency policy.
- Prove normal consumption by adding a locally packed `@setta/workspace` artifact to an unrelated
  React application's `package.json`, then importing only public exports and the compiled CSS.
- Keep the package local and unpublished during this plan. The working name can change before any
  later publication decision without carrying a compatibility alias.

### Source anchors in main

Begin the extraction map from the proven surfaces, including:

- `../setta-main/frontend/src/components/Section/Container/sectionChrome.ts`
- `../setta-main/frontend/src/components/Section/Container/ContainerCore.tsx`
- `../setta-main/frontend/src/components/Section/Container/SectionContainerCore.tsx`
- `../setta-main/frontend/src/components/Section/Header/SectionHeader.tsx`
- `../setta-main/frontend/src/components/Section/Header/HeaderIcon.tsx`
- `../setta-main/frontend/src/components/Utils/Resizable/CustomResizable.tsx`
- `../setta-main/frontend/src/forks/xyflow/controls/Controls.tsx`
- `../setta-main/frontend/src/components/Pages/Project/ResponsiveMiniMap.tsx`
- `../setta-main/frontend/src/forks/xyflow/`
- `../setta-main/frontend/src/forks/dnd-kit/`
- the Tailwind theme, font dependencies, and relevant global/component styles used by those
  surfaces.

These are investigation anchors, not a command to copy entire directories. Record the dependency
cone and extract the smallest coherent path that produces the accepted behavior.

### Donor policy

#### Experimental branch

Candidate donors from `workspace-blank-slate` include the standalone build/security tooling,
serializable document experiments, geometry index, culling, collision/hysteresis planners, history,
selection algorithms, and unrelated-consumer checks.

A donor is accepted only when all of the following are true:

- the main behavior it replaces has been characterized first;
- focused parity tests demonstrate the same observable result;
- it reduces application coupling rather than introducing a parallel architecture;
- it does not bring the experimental React chrome, CSS, toolbar, resize presentation, playground,
  or handle-only pointer interaction with it; and
- the adoption is a small, reviewable commit with an explicit reason.

Do not merge, rebase, or cherry-pick the experimental branch as a batch.

### Quality and dependency tooling contract

The preflight implements a deliberate hybrid of the two donors:

#### Fast quality checks

- Provide one root quality command whose default scope is tracked changes plus untracked files and
  which also supports staged, all-files, and explicit-file modes.
- Keep the normal changed-file gate static and deterministic: formatting, linting, TypeScript
  checking, dependency/boundary policy, dead-code analysis, complexity, and file length. Tests,
  builds, packing, browser checks, and networked security audits remain separate commands invoked by
  the relevant phase gate.
- Use the experimental branch's Prettier, type-aware TypeScript ESLint, React Hooks, and JSX
  accessibility baseline. Add separate source/test cyclomatic-complexity thresholds
  and production `max-depth` and `max-params` checks.
- Configure Knip for the actual pnpm workspaces and explicit package, playground, test, and tooling
  entry points. Do not silence findings with broad ignores or treat a report as an automatic deletion
  order.
- Enforce separately documented source and test file-length ceilings. Ratify them during preflight;
  choose values from the package's measured source and test sizes.
- Provide all-files complexity and file-length reports for hotspot discovery without weakening the
  blocking thresholds.

#### Supply-chain and vulnerability checks

- Keep a single checked-in seven-day release-age policy and mechanically verify that pnpm's
  install-time configuration matches it.
- Retain the experimental branch's strict pnpm controls: exact direct pins, strict peer resolution,
  strict release age, failure on missing publication time, no trust downgrade, no blind lockfile
  trust, blocked exotic transitive sources, and an initially empty dependency-build allowlist.
- Add an independent audit of every registry package/version in the transitive lockfile
  against registry publication timestamps. Run it on dependency changes and phase gates rather than
  on every source-only commit.
- Verify lockfile/manifest synchronization in an isolated temporary directory with lifecycle scripts
  disabled, without rewriting the working tree.
- Require exact versions in dependencies, development dependencies, and optional dependencies.
  Permit only explicit workspace/local artifact specifiers and documented compatible ranges in
  `peerDependencies`.
- Run `pnpm audit` at `moderate` severity, retain the experimental branch's SPDX license allowlist and
  dependency inventory, and fail closed on audit or metadata errors.
- Start with no vulnerability, release-age, patched-dependency, trust-policy, or build-script
  exceptions. Any later exception must identify the exact package/version or vulnerability, include
  rationale, owner, expiry, and removal condition, and receive developer approval. Raw pnpm/npm
  ignore configuration without matching checked-in metadata is forbidden.

## Reference and acceptance contract

### Required executable reference set

Before package implementation, run `main` and capture the following at original resolution in both
light and dark appearance where applicable:

- the full workspace at a representative desktop viewport;
- one root leaf section, idle and selected;
- one root group with vertical children;
- a horizontal nested group;
- a freeform nested group;
- at least three levels of nesting;
- locked, minimized, resizing, moving, and invalid-drop states;
- the viewport toolbar, its groups, hover/focus/pressed states, and tooltips;
- the minimap and its viewport mask;
- sorting within a parent;
- free movement across parents and depths;
- dragging from section header, body whitespace, and other non-interactive section surfaces;
- pointer attempts beginning from an editor, input, button, resize affordance, and other no-drag
  content;
- nested parameter/item dragging; and
- relevant narrow and 200% zoom states.

For each critical component, record relevant computed geometry and styles rather than relying only on
screenshots: bounding boxes, padding, gaps, font properties, colors, borders, outlines, radii,
shadows, icon sizes, and z-index relationships.

Record short interaction captures for drag activation, sustained movement, drop feedback, selection,
and resize. A static screenshot cannot specify interaction feel.

### Parity rules

- A section starts pointer movement from any non-interactive part of its surface, not only a small
  movement button.
- Interactive descendants opt out through one explicit package-owned interaction boundary; hosts do
  not need to understand XYFlow or dnd-kit classes.
- Selection does not change section or descendant geometry.
- Selecting a group does not reveal controls in every descendant.
- Visible section controls remain as compact as main. Large pointer/touch hit areas must not become
  large painted controls.
- Resize affordances retain usable hit geometry while their visible grips match main's restrained
  edge/corner treatment.
- Section and group borders, outlines, radii, padding, typography, icons, colors, and shadows match
  the reference before token abstraction.
- Toolbar dimensions, order, grouping, icons, spacing, active states, and surface treatment match the
  reference.
- Nested sections preserve main's containment legibility without accumulating arbitrary visual
  depth effects.
- Pointer activation, hysteresis, projection, stacking, and cancellation are compared behaviorally,
  not inferred from unit tests.

The developer reviews the side-by-side evidence. “Close enough,” “more modern,” or “technically more
accessible” does not satisfy the gate without explicit developer acceptance.

## Minimal package boundary

The parity slice should expose the smallest API needed by the backend-free example. Exact names are
ratified only after Phase 1, but the boundary must cover:

- a controlled serializable workspace document;
- a document-change callback or controller transaction boundary;
- registration of application-owned section kinds, icons, default sizes, and renderers;
- application-owned opaque serializable section data;
- edit/read-only capabilities;
- appearance selection;
- package-owned interaction boundaries for controls, editable content, wheel, pan, and external
  drops; and
- an imperative viewport controller only for concrete operations such as fit, focus, and reveal.

Do not expose Setta application stores, generated API types, backend concepts, XYFlow internals,
dnd-kit stores, Tailwind classes, or private selectors.

Avoid designing a comprehensive operation protocol, transport model, plugin system, or theme engine
until the parity slice identifies a real requirement. The public API can change directly during this
greenfield extraction.

## Styling and Tailwind policy

- Reuse main's exact pinned Tailwind version and relevant theme values first.
- Reuse the same font packages needed for visual parity.
- Author package components with Tailwind where that makes extraction more direct.
- Compile a package-owned stylesheet and scope its rules to the package surface.
- Do not ship global Tailwind Preflight or host-wide resets.
- Do not require consumers to install Tailwind, scan package source, or extend a Tailwind config.
- Preserve semantic CSS variables only where they correspond to proven customization needs.
- Do not translate known main colors into approximate replacements during extraction.
- Do not expose utility class names as public customization API.

## Interaction ownership policy

Preserve main's working event boundaries before simplifying them:

- XYFlow owns canvas pan, zoom, spatial projection, and any root movement it currently owns.
- Setta's dnd-kit integration owns the sorting/free-move interactions it currently owns.
- One gesture has one movement owner.
- The section surface is the normal pointer drag activator; interactive descendants and explicit
  controls are excluded.
- Keyboard movement remains available without forcing pointer users onto a visible movement button.
- Canonical document state changes once when a gesture commits, not on every pointer frame.
- Hysteresis, previous-target retention, nested scroll/zoom coordinates, cancellation, and
  auto-scroll are extracted as observable behavior.

Do not switch to upstream interaction primitives during extraction merely because their API is
cleaner. Characterize, substitute, and compare them later as a separate decision.

## Repository hygiene and tooling preflight

Complete this preflight before Phase 0 evidence gathering and before package implementation:

1. Verify that `../setta-main` is clean, on `main` at `043d3b2e9`, and able to run. Record its commit
   in every reference evidence bundle and do not update it during a parity milestone.
2. Prune this extraction branch to a package-focused skeleton before implementation. Remove the Go
   and Python backends, plugins, generated clients, existing Setta application, unrelated tests,
   unrelated documentation and assets, and legacy application scripts/configuration. Preserve only
   repository governance needed for the new branch, this plan, and the minimal package/tooling
   surface. Git history and `../setta-main` preserve the deleted material.
3. Make the pruning a mechanical cleanup commit with no package implementation. Confirm afterward
   that no Setta runtime, backend, domain, or generated-client source remains in the extraction
   worktree.
4. Replace branch-local repository instructions with package-focused guidance covering the frozen
   reference, TypeScript ownership, visual parity gates, dependency policy, and the prohibition on
   backward-compatibility code.
5. Delete obsolete plan documents and generated, temporary, or abandoned extraction artifacts. Git
   history is sufficient archival storage. Confirm that this plan is the single active extraction
   plan and that the worktree is clean before Phase 0 begins.
6. Inventory the existing `main` checks and proven standalone tooling in
   `workspace-blank-slate`. Implement the package-relevant quality and dependency
   tooling contract without importing application code, generated evidence,
   existing exceptions, or unrelated configuration.
7. Establish every command, mode, policy file, and enforced threshold in that tooling contract before
   Phase 1 code lands. Run the fast changed-file gate for each reviewable source batch and the broader
   checks only at their specified dependency-change or phase gates.
8. Demonstrate the supply-chain gate against a clean frozen install and confirm that release-age,
   lockfile-drift, disallowed-build, vulnerability, license, and unowned-exception failures are
   blocking. Do not weaken a control merely to make the initial dependency graph pass.

## Implementation phases

### Phase 0 — executable reference and dependency map

This phase is read-only except for evidence, tests that characterize existing behavior, and this
plan's approved amendments.

1. Confirm that the frozen reference worktree is clean and still at the recorded commit.
2. Run `../setta-main` and capture the required main visual and interaction reference set.
3. Map, from `../setta-main`, the import/dependency cone of the smallest leaf, group, toolbar,
   minimap, drag, and resize surfaces.
4. Identify application-owned state reads and classify each as structural workspace state, section
   content state, capability, persistence, backend data, or unrelated app chrome.
5. Identify the exact Tailwind theme, fonts, icon packages, styles, XYFlow fork modules, and dnd-kit
   fork modules used by the slice.
6. Compare relevant experimental-branch donors against the main owners without adopting them.
7. Propose the smallest package seam and list every temporary main-only dependency.
8. Present the reference set and extraction seam to the developer.

**Exit gate:** the developer approves the captured reference and the exact Phase 1 slice. No agent or
test suite can waive this gate.

### Phase 1 — exact parity slice

Build one deliberately small vertical slice:

- one root leaf section;
- one root group with a nested leaf;
- exact main section/group/header chrome;
- exact selected and idle presentation with no layout shift;
- full-surface pointer dragging with interactive exclusions;
- the reference resize treatment;
- the reference toolbar surface with the minimum controls needed to exercise zoom and fit; and
- a minimal backend-free route in `apps/playground` for the slice.

Run `../setta-main` and the extraction playground concurrently on distinct ports for side-by-side
comparison throughout the phase. The provisional slice may live under `packages/workspace`, but do
not ratify a broad public API before parity. Do not add arbitrary-depth support, parameter DnD,
clipboard, detachment, saved views, generic panes, or a large public API merely because they are
future requirements.

Run focused correctness and performance checks, but do not optimize imperceptible measurements or
build broad matrices before visual approval.

**Exit gate:** the developer accepts the side-by-side visual and interaction result. If rejected,
stop. Do not continue into standalone boundary hardening or additional features.

### Phase 2 — standalone package boundary

1. Harden the provisional slice as the installable `@setta/workspace` TypeScript package and keep
   the backend-free example dependent only on its public exports.
2. Replace main application state reads with the minimal controlled document, registry, capability,
   and callback boundary proven by Phase 1.
3. Remove application aliases, OpenAPI/generated backend types, project stores, and backend runtime
   dependencies from the package dependency graph.
4. Compile and consume the package-owned Tailwind CSS without requiring consumer Tailwind setup.
5. Create `../setta-workspace-integration` from the recorded reference commit, install the locally
   packed artifact there, and add only the temporary Setta adapter needed to prove consumption. Do
   not modify `../setta-main`.
6. Build a packed unrelated consumer using only public exports.
7. Consider experimental-branch donors individually where they close a proven standalone gap.
8. Preserve the integration evidence, then remove the temporary integration worktree when it is no
   longer needed; its adapter is proof code, not package compatibility code.

**Exit gate:** the temporary Setta integration and the backend-free example both render the accepted
slice from the packed package; `../setta-main` remains clean and unchanged; the package and packed
consumer contain no forbidden main imports; the developer confirms parity is unchanged.

### Phase 3 — recursive section workspace

Expand only from accepted reference behaviors:

- arbitrary-depth nested sections;
- vertical and horizontal ordered children;
- nested freeform children;
- switching child positioning and orientation;
- sorting and cross-depth free movement;
- stable hysteresis and invalid-target feedback;
- empty-container drop affordances;
- section selection, multi-selection, marquee selection, and stacking;
- lock, minimize, resize, snap-to-grid, and content sizing; and
- toolbar and minimap behavior needed to navigate those states.

Each interaction lands as a narrow vertical batch with a main recording, package recording, focused
tests, and a developer-visible checkpoint. Do not implement the complete list as one batch.

**Exit gate:** the developer accepts the representative recursive workspace in light and dark mode,
and the backend-free example demonstrates the same interaction behavior without main runtime state.

### Phase 4 — nested parameter/item drag-and-drop

Extract Setta's reusable parameter/item interaction as a package-owned registered surface:

- single and multi-item selection;
- single and multi-item dragging;
- same-list and cross-list sorting;
- nested lists/groups where demonstrated by main;
- filtered-list behavior;
- zoom and scroll coordinate correctness;
- keyboard movement and cancellation; and
- stable section-drag versus item-drag ownership.

Keep item data application-owned and opaque. The package owns generic selection, ordering, geometry,
and interaction behavior, not Python parameters or Setta domain semantics.

**Exit gate:** an unrelated example supplies its own item data and reproduces the accepted main
interaction without importing Setta parameter types or state.

### Deferred capability inventory

The earlier plans named useful capabilities that may still belong in the library, but they are not
allowed to enlarge the parity slice or recursive/item extraction phases. After Phase 4, the
developer chooses which capability becomes the next narrow extraction milestone and approves a plan
amendment before implementation. Candidates include:

- inline title renaming, accent/tag editing, and alternate compact/transparent/headerless chrome;
- grow-with-content versus fixed container sizing, content-fit sizing, and overflow behavior;
- searchable pointer-context creation, smart placement, and empty-workspace creation;
- external/file drop callbacks with screen and workspace coordinates;
- copy/paste, group/ungroup, and batch lock/delete/move actions;
- workspace edit/read-only or freeze-all behavior;
- configurable pan/zoom gestures and stacking policy;
- host toolbar extensions, panes, outline navigation, next/previous navigation, focus/fit helpers,
  and saved viewport presets;
- detaching a section into a separate floating window; and
- additional connection, minimap, and presentation behavior demonstrated by main.

This list preserves product options without pretending that every earlier idea has already earned a
place in the first standalone package.

### Phase 5 — extension surface and hardening

Only after the visible product is accepted:

- ratify the public API and confirm or change the working package name;
- add documented section, icon, toolbar, pane, and overlay extension points required by real examples;
- verify light/dark/system appearance and documented semantic customization;
- verify keyboard, screen reader, focus restoration, reduced motion, RTL, coarse pointer, 200% zoom,
  and narrow reflow without visibly inflating the accepted UI;
- baseline and remeasure large-document rendering, culling, drag activation, and sustained movement;
- run package build, type, formatting, lint, dead-code, complexity, file-length, supply-chain,
  vulnerability, license, packed-consumer, and browser gates; and
- record final evidence only after developer visual approval.

This phase does not publish the package.

## Verification order

For every visual or interaction batch:

1. Reproduce the main reference state from the pinned `../setta-main` worktree.
2. Implement the smallest package change.
3. Run focused static/unit checks.
4. Compare main and package live through Chrome DevTools at the same viewport, appearance, zoom, and
   state.
5. Present side-by-side screenshots or recordings to the developer.
6. After developer acceptance, add or refresh the corresponding visual baseline.
7. Run the broader phase gate once on the stable tree.
8. Commit a reviewable batch.

Visual baselines are regression locks for accepted output. They are never evidence that previously
unreviewed output is attractive or correct.

## Stop conditions and escalation

Stop and return to the developer instead of expanding scope when:

- the Phase 1 slice does not convincingly match main;
- parity requires changing a user-visible main behavior rather than extracting it;
- an application/backend dependency cannot be represented by a narrow explicit host seam;
- a proposed donor changes observable behavior;
- a dependency or fork substitution changes drag, resize, zoom, or nesting feel;
- a visual milestone has not received developer approval;
- an implementation batch becomes too large to compare meaningfully; or
- a test passes while the live side-by-side comparison is visibly wrong.

Do not respond to a failed visual gate by adding more features, more snapshots, more abstractions, or
more performance instrumentation.

## Explicit non-goals

This plan does not include:

- publishing to npm or GitHub;
- selecting a public license or final public repository structure;
- preserving the experimental branch's APIs or theme;
- migrating existing experimental documents;
- cleaning or modularizing code inside the frozen `../setta-main` reference worktree;
- replacing Tailwind;
- replacing Setta's XYFlow/dnd-kit adaptations during extraction;
- Python code generation, execution, MCP, agents, files, authentication, collaboration, or backend
  persistence;
- a neutral visual preset;
- a universal node editor or diagramming framework;
- a theme marketplace or token for every visual constant;
- multiple public micro-packages; or
- backward compatibility of any kind.

## Open decisions deferred until evidence exists

- Whether `@setta/workspace` remains the final public name if publication is later approved.
- Whether the public object term is “section” or “node.”
- Which main fork modules remain package-owned after parity.
- Whether the final source stays in this repository or moves later.
- Which additional features follow parameter/item DnD.
- Publication, licensing, versioning, and release automation.

## Definition of success

This extraction succeeds when:

- `../setta-main` remains clean and pinned to the recorded reference commit throughout accepted
  parity milestones;
- the developer accepts the package workspace as visually and behaviorally faithful to main;
- sections drag from their normal non-interactive surface rather than requiring one small pointer
  handle;
- selection, resize affordances, nested groups, toolbar, minimap, typography, icons, and appearance
  preserve the accepted Setta product language;
- an unrelated React example installs the local package, imports its compiled CSS, registers custom
  section and item renderers, and uses the workspace without a Setta backend;
- a temporary Setta integration worktree installs the same packed artifact without modifying the
  frozen reference worktree;
- recursive ordered/freeform section movement and nested item movement retain main's stable behavior;
- the package contains no Setta application state, generated backend client, or domain-model imports;
- retained dependencies and forked behavior are explicit and justified by observable value;
- normal static quality checks require only the pinned Node/pnpm toolchain and support changed,
  staged, all-files, and explicit-file scopes;
- quality, accessibility, performance, supply-chain, vulnerability, license, pack, and consumer
  checks pass without overriding the accepted UI; and
- no publishing decision has been made implicitly by implementation.
