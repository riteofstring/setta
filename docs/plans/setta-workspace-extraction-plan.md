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
  light/dark canvas and zoom-aware grid and portals drop feedback outside the target's stacking
  context. Its first layer order put the feedback above the preview; the Phase 2 gate later refined
  that order in `2f824f031` while keeping the portal. Its
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
- Packed unrelated consumer and donor consideration (items 6–7, 2026-08-11): the package
  manifest gained a `files` allowlist so `pnpm pack` emits only the compiled surface (dist, the
  tailwind preset, the two fork LICENSE files), and `pnpm run consumer:check`
  (`scripts/verify-packed-consumer.mjs`) proves consumption: it asserts the checked-in
  unrelated fixture (`fixtures/packed-consumer` — react, react-dom, and the tarball only; its
  own plain-CSS host chrome, section kind, renderer, header icon, default size, opaque data,
  and change-callback registration; no Tailwind, no workspace link) imports nothing but the
  public entry points, packs the package, asserts the tarball's compiled-only contents,
  installs the fixture against the tarball in a temporary directory under the root's strict
  pnpm supply-chain settings, and runs its `tsc` + `vite build` with built-output assertions
  (scoped stylesheet marker, packed runtime). First run passed; `--keep` retains the installed
  consumer for the developer's exit-gate preview. The fixture manifest joined the dependency
  policy (fixtures scanned; explicit `file:` artifact specifiers admitted per the written
  policy) and the fixture joined the static gate's file selection. Donor consideration is
  recorded in `docs/evidence/phase2/packed-consumer.md`: the experimental branch's
  unrelated-consumer check was the one donor closing a proven standalone gap — its mechanism
  was reimplemented (fixture + placeholder + temporary strict install), its experimental-API
  content, Playwright drive, and exact tarball manifest were not adopted; the other named
  donor candidates close no gap in this phase and stay unadopted. The evidence also records a
  content-placement observation (`section-full-no-title` as de-facto API) for the Phase 5
  ratification.
- Temporary Setta integration worktree (item 5 and the evidence half of item 8, 2026-08-11):
  `../setta-workspace-integration` created detached at the recorded reference commit
  `043d3b2e9` (never touching `../setta-main`, re-verified clean before and after), the packed
  tarball installed into its `frontend/` as a `file:` dependency under the reference's own
  install posture, and the minimal adapter added: a second Vite entry that registers the
  playground's leaf kind, loads the accepted slice document, and composes canvas/toolbar/
  tooltip from the packed public exports and compiled stylesheet only. Verified by the
  adapter typecheck under the reference's TypeScript, the reference's own production build
  compiling the full application and the proof entry in one graph with packed-runtime and
  scoped-stylesheet output assertions, and a headless render proof at the Phase 1 viewport
  (all slice sections and the toolbar render; idle leaf outer box exactly the accepted
  202 x 124; dark and light screenshots; no page errors). The render proof caught a real
  compiled-artifact regression invisible to every build-level check: the section grid
  placement classes (the host content seam, `.section-full-no-title` and siblings) were
  declared in `@layer utilities`, so the compiled stylesheet tree-shook them against package
  source and every packed consumer rendered section bodies overlapping the title cell. The
  placement vocabulary moved out of the Tailwind layer into plain CSS (the reference ships
  all of it at runtime), a `check-package-boundary --built` marker freezes it, and
  `consumer:check` reran green on the fixed artifact. Evidence, adapter patch, screenshots,
  and the recorded `exports`-only/`moduleResolution: "node"` typing observation for Phase 5
  are in `docs/evidence/phase2/setta-integration.md`. The worktree is retained, dirty by
  design (uncommitted proof adapter), for the developer's exit-gate inspection; its removal
  command is recorded in the evidence and runs after the developer confirms the gate.
- Phase 2 exit-gate correction (2026-08-11): the developer compared an invalid-drop gesture in the
  packed Setta preview with main and rejected the portal's initial above-preview layer as visually
  dominant. Commit `2f824f031` centralizes the DnD hierarchy at target 500, feedback 750, preview 1000. The body portal still escapes the target stacking context, while the preview remains the
  top surface as in main. The focused layer regression, all 278 package tests, typecheck, package
  build/boundary check, static quality gate, unrelated packed-consumer build, reference production
  build, and headless render proof pass on the refreshed tarball (`3f85fa0128d9bd75910fcb29ed4d01a66bb3046b68b39927d0a6fc021a1a65b9`).
- Phase 2 exit gate complete (2026-08-11): the developer manually rechecked the corrected invalid
  drop, explicitly approved the complete packed-package result, and authorized continuation. The
  temporary integration worktree was removed with the recorded item 8 command; `../setta-main`
  remains clean at `043d3b2e9`. Phase 3 may proceed.
- Remaining Phase 2 work: none.

Phase 3 progress (2026-08-11):

- Recursive structure batch (arbitrary-depth nesting, vertical and horizontal ordered children,
  orientation switching at depth): the machinery extracted in Phase 1 already composes
  recursively — group chrome renders nested children through the live dnd projection, the
  orientation funnel and header control are per-group, the document layer freezes three-level
  parent-chain resolution, and the cross-depth planners/marquee fallbacks were audited — so this
  batch makes depth demonstrable and frozen instead of re-extracting it. New depth-composition
  tests mount the representative three-group structure from the Phase 0 captures (root group →
  nested group → horizontal group with three leaves) and freeze the recursive chrome (three
  group frames, leaves at the innermost level, vertical middle flow, horizontal inner flow, the
  per-direction orientation labels) and the nested orientation toggle (the flow flips in place
  and the change callback reports exactly one canonical commit carrying the flipped group). The
  playground document expanded from the Phase 1 slice to that scene beside the accepted root
  leaf states (`sliceDocument` renamed `playgroundDocument`), so sorting within the horizontal
  parent, cross-depth free movement, empty-container hints, and the recursive chrome are all
  reachable for the developer's side-by-side checkpoints. Phase 3's "nested freeform children"
  item is recorded against the approved Phase 0 evidence: main has no freeform positioning
  inside groups — the freeform surface is the top-level workspace layout (captures 11 and 18),
  which the package already owns — so no group-level freeform mode exists to extract.
- Minimap batch (the responsive minimap and the toolbar minimap group whose toggles it makes
  reachable, 2026-08-11): the fork minimap moved into `packages/workspace/src/minimap/` —
  `MiniMap` (pane-rect mask, d3-zoom panning, `getXYWidthHeight` viewbox math, the imperative
  selected-class sync with its MutationObserver re-application, custom-node and nodes-prop
  `MinimapSvg` contract), `MiniMapNodes`/`MiniMapNodesReactive` (renderable filtering, the
  render-affecting input equality, fit-gated visibility via `computeReadyToBeVisible`), and
  `MiniMapNode`, with the fork's `Panel` (`canvas/Panel.tsx`) and the reference wrapper as the
  package `ResponsiveMiniMap`. `WorkspaceCanvas` gained the reference UiPage's relative wrapper
  and mounts the minimap beside the scroll shim gated on the new `showMinimap` preference;
  `showMinimap`/`minimapSide` joined the interaction options at the reference defaults
  (true/left) with the reference's `toggleMiniMap`/`toggleMiniMapSide` actions, and the toolbar
  gained the minimap group (`IoMapOutline` toggle, side flip with the `TbLayoutSidebar*Collapse`
  icon pair) — as in the reference, no divider renders between the viewport and minimap groups.
  `setCenter` returned to `viewportHelpers` for minimap click-to-center, and `getPaneRect`/
  `getBoundsOfRects` joined the canvas utils. Reactive minimap visuals resolve through the
  package document (styleColor → `deriveSectionStyleTheme` background, kind) instead of the
  reference's variant indirection; the section-style _preview_ colors left with the app's
  style-color editing feature. Seam adaptations shared with fit-view/auto-pan: the pane rect,
  the click coordinate, and `setCenter` lost their Overview/UI-editor rail offsets, and the
  wrapper's rail-driven translateX placement was cut (`minimapSide` still flips the bottom
  corners). Cut as unreachable in the reference app: the wheel-zoom surface
  (`zoomable`/`inversePan`/`zoomStep`), `onNodeClick`, the legacy xyflow "input"/"output"/
  "default" node-color branches, and the top/center panel placements. Panel/minimap CSS ships
  as the effective post-override values (the app's `#94a3b8b6` / dark `hsla(220,27%,6%,.72)`
  `!important` overrides of the fork's white background). Lint-forced deviation: the memoized
  minimap components inline named implementations instead of the reference's
  underscore-prefixed functions. Reference minimap suites ported (viewbox math, selection
  sync, node rendering/equality/reactive recolor — the dark-mode recolor case freezes the
  appearance dependency the reference exercises through its localStorage store); new focused
  tests freeze the wrapper placement/mask chrome, the canvas mount gating, the toolbar group,
  and the `setCenter` seam. No dependency changes.
- Phase 3 exit gate complete (2026-08-11): the developer inspected the representative recursive
  workspace in the backend-free playground in light and dark mode, explicitly approved Phase 3,
  and authorized continuation. The recursive structure, orientation switching, cross-depth
  movement/sorting, and minimap controls remain independent of main runtime state; `../setta-main`
  remains clean at `043d3b2e9`. Phase 4 may proceed.
- Remaining Phase 3 work: none.

Phase 4 progress (2026-08-11):

- Item dnd fork substrate (2026-08-11): the four adapter branches deliberately cut at the Phase 1
  dnd batch with "left with the Phase 4 parameter/item surface" markers returned with this owning
  batch, together with the two fork stores they depend on. The package term for the reference's
  params is "items", and list keys are host-defined strings where the reference hard-codes its
  pinned/unpinned param areas; the dnd-id wire constants (`::settaParamList::`, `::TempParamDND`)
  stay verbatim so the id encoding matches the reference exactly. New stores, ported from the
  reference in the package store style (plain setState, identical observable state):
  `itemDndState` (active-drag bookkeeping — active/section/list/root ids, dragging ids, parent
  map, visible children, active rect, placeholder metrics, pending reset — plus the list-key
  scoped dnd-id scheme with temp-placeholder suffixing) and `itemDndChildren` (the live
  parent→children projection an item drag mutates: temp placeholder replacement anchored at the
  first dragged item with stale-temp cleanup, live re-parenting, list-key mapped parentByChild
  output). Adapter restorations: the collision tracker regained the reference's two modes —
  item-mode trackers ignore temp item placeholders instead of dragged sections, keep row
  collisions alive through the vertical-overlap × active-width intersection fallback, use the
  30 px move-to-parent trigger threshold (zoom-scaled like the section 20/100 px thresholds),
  and never resolve a horizontal container — composed with the package's developer-approved
  per-target hysteresis and pointer-reference corrections, which item mode inherits;
  `dragEventMapping` promotes item-drag collisions through the item children projection keyed by
  list-scoped dnd ids; `useSortable` forces "none" feedback for item-type drags; and
  `DragOperationShapeSync` syncs item-drag shapes from the item active rect (item drags never
  adopt the section multi-selection rect). The section dnd context now names its tracker mode
  explicitly. Reference characterization tests ported: the fork store suites (id scheme,
  children/temp-placeholder state), the param-mode collision fallback case, the list-key
  promotion case, and the integration mapping case; the shape-sync suite freezes the
  item-drag suppression. The item sensors, the nested item drag context, the monitor/overlay
  lifecycle, the canonical item model with its move funnels, and the registered item surface
  follow with their owning Phase 4 batches.
- Canonical item model and move/selection logic (2026-08-11): sections may now carry the
  canonical item surface — `WorkspaceItem` (id, ordered children, opaque data on the same
  JSON-value contract as section data) inside a per-section `WorkspaceSectionItemTree` (one
  root item whose children are the top-level rows, plus `selectedItemIds`; the reference
  persists `selectedParams` on the section impl, so selection is canonical document state).
  The root is a real move target (the reference normalizes section-level drops onto it) but
  never a row; the reference's leaf→`NestedParam` promotion is structural because every item
  carries `children`, and the leaf-versus-group _type_ distinction stays application-side
  behind the opaque data — the tree-view flat rows drop the reference's `isParent` flag.
  Load validation fails loudly on malformed trees (missing root, key/id mismatch, unknown or
  doubly-claimed children, a claimed root, items unreachable from the root — which also rules
  out cycles — and selection naming unknown, root, or duplicate ids); the item types ride the
  provisional index. `itemTree.ts` ports the `paramTree.ts` helpers (parent map, visible tree
  view with whole-subtree pruning, root-selected reduction, shared parent,
  descendant-of-selection, visible→full insertion-index resolution) with visibility as a
  caller-supplied set — the filtered-list seam the registered list views feed in the row
  batch. `moveItems.ts` is the reference's `applyParamMove`/`moveParamsWithBackend` minus the
  optimistic-op plumbing and backend route (the document-change callback notifies the host
  once per applied move); the pinned/unpinned shown-order cache sync left with the app (the
  package derives list membership from canonical children live); aborted moves (detached
  first item, out-of-range index, empty ids) leave the tree untouched and silent, and the
  funnel throws on own-subtree moves where the reference leans on monitor plus backend
  validation. Selection primitives (`toggleItemSelected`/`unselectAllItems`/`selectOnlyItem`)
  commit canonically and then drive the same active-section decision as the reference; the
  policy gains the item-toggle interactions and the section-click item-mode branches (reasons
  renamed to item terms), the controller reads the new `isSelectingItems` mode store (the
  reference's `useMisc.isSelectingParams`; the keyboard batch owns its hold-key activation)
  and the document's item selection for section-click contexts, and the reference's
  policy-dead `hasSelectedParams` intent field is dropped. Complexity-lint-forced deviation:
  the item tree load validation splits into three assert helpers. Tests: new item tree, move
  funnel, and selection suites; the reference's four param policy cases ported in item terms;
  load round-trip/validation cases; and a controller case freezing the item-mode
  section-click path against the document's selection.
- Item dnd provider/monitor/overlay and the registered row surface (2026-08-11): the item half
  of the fork sensors returned (item-type-only activation with the reference's 5 px distance
  constraint, gated by item-select mode and the edit-structure capability), and the package
  owns the reference's per-section nested drag provider (`ItemDndContext`: item-mode collision
  tracker whose updates are filtered to the active list, with shape sync, monitor, and overlay
  mounted while item dnd is enabled or a drag is still resolving), the monitor drag lifecycle
  (start snapshots the canonical tree, collapses the selection to draggable roots — the
  multi-parent toast stays application-side, the drag-only-the-active-item fallback is
  unchanged — and replaces the dragged items with the temp placeholder; rAF-coalesced over
  resolution through the ported collision compare, past-halfway/trigger-distance conditions,
  and the placeholder move plans; end maps the temp position through the visible-insertion
  resolution into one canonical `moveItems` commit with the reference's no-op/descendant/
  detached aborts; the deferred reset completes when the operation returns to idle, and
  releasing item-select mid-drag cancels the live operation), and the blue drag overlay
  portaled to document.body with the scope marker at the measured multi-item placeholder size.
  The row surface is the registered seam: `WorkspaceItemList` mounts one list per item area
  (host-named list key, host list membership, the visible-set filtered-list seam, a
  `filterActive` flag disabling dnd exactly as the reference's param filter, the row renderer,
  and the group predicate — leaf-versus-group stays behind the opaque item data with a
  structural default), and mounting registers the live list view: drag start resolves the
  drag's list key first, then the section's other lists in mount order, generalizing the
  reference's fixed pinned-then-unpinned fallback. The list context carries the renderer
  through the package-owned row recursion; the sortable list composes temp-aware flattened
  dnd ids with the vertical strategy and mounts only while enabled, as the reference. `ItemRow`
  ports the reference's leaf/nested-root/parent layouts on the `--param-column-width` grids
  (the wire-verbatim variable; the column-resize feature that writes it stays application-side),
  the nested-children rail, the temp placeholder row at the zoom-normalized placeholder size,
  the selection/hover treatments in both plain and section-style-theme variants, drag opacity
  and z-raise, and the reference's selection clicks (canonical commit driving the batch-2
  active-section policy); rows carry `data-item-row` in item terms. The playground registers an
  item-panel section kind rendering the surface from opaque label/value/group item data, and a
  host header button drives item-select mode (the reference holds the mode through its app
  shortcut engine; the package hold-key activation is the keyboard batch). A11y-forced,
  visually identical deviations, documented in code: rows render as `div role="button"` with a
  keyboard selection toggle where the reference strips the sortable role from its articles.
  Tests: the reference monitor-utils suite ported in item terms plus the shared list-key
  collision filter; registry resolution order; a drag-lifecycle freeze (start snapshot and
  selection collapse, mode/view/filter guards, past-halfway reorder and trigger-distance
  re-parent placeholder moves, cross-list collision rejection, canonical commit with one host
  notification, positional no-op, deferred cancel/reset); and a mounted-list suite (reference
  layouts and rail, visible-set pruning, view registration lifecycle, mode-gated click
  selection with the selected treatment, live temp-projection rendering during a drag).
- Item keyboard surface and drag-ownership gating (2026-08-11): the canvas key activations own
  the reference's remaining param keyboard surface in item terms. The dnd-mode tracker became
  the hold-chord tracker and gained the reference's `paramSelect` chord (Mod + Shift, exact:
  activation only on a non-repeat keydown with no non-modifier key held; released by any
  non-matching event, window blur, the macOS Meta-keyup sweep, and the aborted-Cmd-Tab
  mouse-move recovery the package already applied to sorting), driving `isSelectingItems` — the
  monitor's mid-drag cancel on mode release now has its keyboard trigger. The section-drag
  versus item-drag ownership gating is chord exclusivity through the one tracker: Shift joining
  Alt releases a held section move/sort mode on the same keydown without entering item select
  (Alt excludes the item chord), and while the item chord is held the exact-chord Shift/Mod
  activation states (marquee, multi-select, zoom-key) clear and stay suppressed, as the
  reference engine releases those shortcuts; the Space pan arming gained the reference's
  no-modifier requirement the chord made observable. Command chords match through the tracker's
  pressed-key equality (the reference engine's `isShortcutPressed`): Alt+ArrowUp/Down offset
  moves (repeat allowed; the browser default is consumed on every chord match while the action
  declines inside editable targets, the reference's `runParamShortcut` split), Tab/Shift+Tab
  indent/unindent over the shipped defaults (interception only while the active section has
  selected items, `[data-tab-native]` opt-out; the fallback tab navigation is the app focus
  manager and stays application-side), and the Escape handler (item unselection consumes the
  keypress before an in-section active-selection clear with the reference's blur and
  fallback-focus steps; the pane keeps its approved canvas-batch Escape path; frozen-tooltip
  removal stays application-side). `selectedItemMoves.ts` ports the keyboard actions: offset
  moves keep the reference's visible-group resolution (groups processed bottom-up when moving
  down, indices resolved against the evolving sibling simulation, hidden siblings undisturbed
  through the visible-insertion mapping); indent and unindent port the reference backend's
  semantics (`param_moves.go`) — contiguous runs over the full child order collapse under the
  nearest preceding unselected sibling, per-parent runs promote to just after their parent, and
  the leaf→NestedParam promotion plus empty-parent type restore are structural no-ops behind
  the opaque item data. Each action lands as one canonical commit and one host notification
  (`commitSectionItemTree`; the reference dispatches one optimistic update per action); aborted
  and no-op actions leave the tree untouched and silent while consuming their shortcut exactly
  as the reference returns; gating mirrors drag start (`canEditStructure`, the registered list
  views' union visibility and filter-active answer — no mounted views disables keyboard moves —
  root-selected reduction, shared parent for offset/indent, active section first then document
  order), and the filter/hidden/multi-parent toasts stay application-side. Tests: the reference
  `moveParams.test.ts` offset cases and the backend `param_moves_test.go` orderings ported in
  item terms plus the seam gating; key-activation cases freeze the chord lifecycle (activation,
  exact-release set, repeat and held-key exclusion, blur and mouse-move recovery, dnd-mode
  release, marquee suppression), the command dispatch (repeat, editable decline,
  `[data-tab-native]`, active-section gate), and the Escape ordering. Playground copy documents
  the chord and keyboard moves; its mode button stays as the pointer-driven host alternative.
- Phase 4 coherence audit (2026-08-11): a five-reviewer audit of the four batches against the
  reference confirmed the ported algorithms, state shapes, wire constants, and test fidelity and
  surfaced fixes, applied with this entry. Keyboard: the canvas activation-key states (marquee,
  multi-select+zoom, pan) moved into the hold-chord tracker with the reference engine's
  exact-chord semantics — exact modifier state plus pressed-set equality, release on any
  non-matching event, the engine's shift-only/mod-only/no-modifier input-field ignore, no arming
  from auto-repeats — so Alt excludes the marquee, Alt joining Mod releases multi-select/zoom,
  and the aborted-Cmd-Tab mouse-move sweep now releases every Mod-parsed mode as the reference's
  `specialModTabCase` does; the always-prune of stale held keys was removed (the reference prunes
  only on the first keydown after a key'd Mod shortcut ran and the package owns no key'd Mod
  chords — the macOS Meta-keyup clear remains the swallow recovery), so a held key excludes
  chords until its keyup, and the mac chord paths and Escape blur/fallback-focus steps gained
  test coverage. Drag start: the filter abort now precedes the selection collapse, so an
  aborted-for-filter start is side-effect-free as in the reference. Rows: the section-style-theme
  row treatments now gate on the section chrome's derived-theme check instead of styleColor
  presence, and the reference's nested-root layout case is ported. Registry: duplicate list keys
  fail loudly, re-renders update a live registration in place so mount order never reshuffles the
  resolution fallback, and host item ids and list keys carrying the reserved dnd wire tokens are
  rejected loudly at load and registration instead of silently mis-decoding. Load: a document
  load now resets the item drag-session stores and releases item-select mode alongside the held
  section dnd modes, the detached-first-item silent abort is frozen by a test, and a group
  section rejects an item tree (the reference cannot represent params on a Group, whose
  section-click policy never treats it as item-carrying).
- Phase 4 developer gate rejected (2026-08-11): live inspection of the unrelated item-panel
  example exposed a real nested-grid parity failure. The package row port uses the reference's
  `section-args-nested` and `section-args-nested-key-value` placement vocabulary, but the compiled
  package stylesheet omitted the corresponding named grid-area rules from the frozen reference.
  The browser therefore creates implicit columns: the selected `options` group's `momentum` and
  `decay` children render beside the group label instead of beneath it. At the rejected viewport,
  the group occupied 272 x 36 authored px while each child collapsed into the 124 px right-side
  implicit column; this does not reproduce the main Dict surface. The owning correction must keep
  the geometry package-owned, restore the smallest complete reference grid contract (including
  the list-area shell if the live comparison proves it necessary), and must not paper over the
  defect with playground-only offsets or item-specific markup. Add a rendered geometry regression
  that fails when nested children share the parent-label row or collapse into an implicit side
  column, then repeat the live main-Dict versus unrelated-item comparison before requesting
  approval again.
- Nested grid parity correction (2026-08-11): the rejected defect had two coupled halves in the
  compiled stylesheet, both restored at the reference's own cascade positions. The reference
  authors `.section-args-nested` / `.section-args-nested-key-value` un-layered AFTER
  `@tailwind utilities` (root index.css), so the named grids outrank the `grid-cols-subgrid`
  utility riding the ported row strings; the package build input now appends them in that exact
  position. The reference's layered vocabulary also lets Tailwind expand the group row's
  `[&>p]:section-key-value` label placement; the package vocabulary is deliberately un-layered,
  so that rule is authored directly as its compiled output. The list-area shell became
  package-owned: `WorkspaceItemList` renders `GetUnpinnedParams`' outer clip column and named
  nested-grid scroll shell with the ported `useIsScrollable` wheel gate (`nowheel` while
  scrollable; the persisted min-height measurement stays application-side), and the playground
  host wrapper dropped its own scroll/gap/px substitutes for it. One documented markup
  deviation: the shell omits the reference string's computed-dead `grid-cols-subgrid` so a host
  stylesheet loaded after the package sheet can never flip the winner across the package
  boundary. Regression locks: a rendered-geometry suite compiles the shipped stylesheet from
  its real build input and config (imports inlined as the CLI does) and resolves every nested
  placement against the named lines the effective grid defines — verified to fail against the
  pre-fix stylesheet with the rejected implicit-side-column collapse — and the built-stylesheet
  gate now requires the three nested rules as markers. Tooling for the suite: test files may
  import `node:` builtins (boundary check and tooling doc updated), `postcss` and `@types/node`
  joined the package dev dependencies, the dev tsconfig takes `types: ["node"]`, and the build
  tsconfig pins `types` back to empty so production source stays browser-pure. Focused item
  suites, the package build with boundary markers, the full 431-test package run, the changed
  static gate, and the supply-chain gate are green.
- Phase 4 renewed developer gate rejected for presentation parity (2026-08-11): the developer's
  manual check confirmed that parameter manipulation works well and that the nested placement is
  much better, but rejected the unrelated item panel's remaining visual treatment. The package
  correctly leaves opaque item contents to the registered host renderer; the playground currently
  demonstrates that seam with regular sans-serif labels and values, muted colors, no value-track
  divider, the wire fallback `--param-column-width: 200px`, and a 280 x 240 fixture. The frozen
  `/settings` Dict reference instead demonstrates 552 x 352 authored section geometry, 526 x 20
  rows, 12/16 px semibold sans-serif labels, 12/16 px medium monospace values, a subtle value-column
  underline, and a default label/value split derived from half the available list width. Those
  differences—not the now-correct nested tree geometry—make the playground example appear loose and
  visually unfinished.
- Presentation parity correction required (2026-08-11): keep `WorkspaceItemList`'s package-owned
  selection, nesting, row geometry, and dnd behavior intact unless a renewed live measurement proves
  a package defect. At the host-renderer seam, make the unrelated playground demonstrate the smallest
  complete, domain-neutral equivalent of the reference's label and value roles: reference label
  weight/color/padding, monospace medium/tabular value typography, the subtle value-column divider,
  and the reference default half-width column split supplied through the existing
  `--param-column-width` host variable. Use the recorded 552 x 352 `/settings` Dict geometry and
  enough opaque fixture rows to make repeated row rhythm inspectable while retaining the nested
  group; fixture density must not substitute for the style corrections. Do not import Setta
  parameter types, controls, stores, persistence, column-resize behavior, the ARGS toolbar, or filter
  behavior, and do not turn application presentation into package policy or a new public API. Add a
  focused playground-renderer regression for the host-owned presentation contract, run the focused
  checks and static gate, then compare frozen main and playground live in dark and light appearance
  at the same 1492 x 696 viewport, DPR, canvas zoom, authored section size, and representative
  leaf/group/nested-child states. Record computed row, label, value, divider, and column metrics;
  refresh or add visual evidence only after developer acceptance.
- Presentation parity correction implemented (2026-08-11), entirely at the host-renderer seam —
  no package source changed. The playground row renderer now demonstrates the reference roles
  with the reference's own class strings: labels (leaf and group) carry `ParamTextLabel`'s
  12/16 px semibold sans-serif treatment in setta-800/200 with the 0.125 rem vertical padding;
  values are 12/16 px medium monospace with tabular figures in setta-800/300, bottom-aligned
  like the reference's idle value text; an empty self-end span draws the reference's subtle
  value-column divider (`border-setta-200/50`, dark `border-setta-600/30`); group labels stay
  direct `<p>` children so the package's compiled `[&>p]:section-key-value` rule places them.
  The host now supplies the reference default column split through the existing
  `--param-column-width` variable: a ResizeObserver-backed hook on the list-area wrapper sets
  half its clientWidth minus the reference's 18 px center offset (`useParamColumnWidth`'s
  `getDefaultColumnWidth` minus `CENTER_OFFSET`), re-derived on resize; the column-resize drag
  that persists an authored width stays application-side. The fixture adopts the recorded
  552 x 352 `/settings` Dict geometry (authored layout and registered default size) and grows
  to eleven top-level rows plus the retained `options` group so the repeated 20 px row rhythm
  is inspectable; density did not substitute for the style corrections. Regression lock: the
  playground gained a minimal vitest setup mirroring the package's (vitest 4.1.10 + jsdom
  28.1.0 dev-only, per-file jsdom pragma, ResizeObserver stub, test entries registered with
  Knip; the vite dev/build path stays zero-config) and a focused host-presentation suite that
  freezes the label/value/divider class contracts as literal expectations, the direct-child
  group-label placement, the 550 → 257 px half-width derivation at the recorded geometry, and
  the fixture geometry/density. Playground suite 4/4 green, changed-file static gate green,
  supply-chain gate rerun clean on the dev-dependency change, playground production build
  compiles every new utility.
- Phase 4 correction audit (2026-08-11): a static audit of the two post-rejection corrections
  against the frozen reference confirmed both faithful, with no code changes required. Nested
  grid: the restored `.section-args-nested` / `.section-args-nested-key-value` rules are
  verbatim copies of the reference root `index.css` at its un-layered post-utilities cascade
  position, the authored `[&>p]:section-key-value > p` rule matches the reference's compiled
  variant output, `ItemListShell` reproduces `GetUnpinnedParams`' exact outer clip column and
  inner scroll-shell class strings with only the two documented deviations (the computed-dead
  `grid-cols-subgrid`, the application-side persisted min-height), `useIsScrollable` is the
  reference hook minus its application-side `onMeasure`, and the boundary-check relaxation
  admits `node:` builtins in test files only while the build tsconfig pins production types
  back to browser-pure. Presentation: the playground label string is `ParamTextLabel`'s
  verbatim class treatment minus its application-side click-to-focus affordances, the value
  and divider strings carry the reference's idle-value classes plus the directive's recorded
  medium/tabular metrics, dropping the reference divider's `grid-row-start-1` is a no-op
  because both vocabularies pin `.section-value` to `grid-row: 1 / 2` (and `border-box` is
  defined nowhere in the reference, so omitting it changes nothing), and the half-width
  derivation matches `getDefaultColumnWidth` minus the 18 px `CENTER_OFFSET` with the
  clamping left to the application-side resize feature it belongs to. Phase-gate verification
  completed: the full-scope static gate (`quality:all`, 326 files) and the packed
  unrelated-consumer proof are green post-correction; the recorded playground suite, package
  suite, changed-scope gate, and supply-chain runs already postdate the last relevant code
  change and were not duplicated.
- Supervised live comparison rejected the fixture-size interpretation (2026-08-11): at the live
  dark comparison, main's `552 x 352` recorded Dict measurement is the complete outer section,
  while the playground's document dimensions describe the inner section surface to which the
  package shell adds a 1 px border on every side. Supplying `552 x 352` therefore produced a
  `554 x 354` outer item panel instead of `552 x 352`. The two-pixel width excess propagated into
  a 552 px list-area width and a 258 px label column, while live main measured a 552 px outer
  section, 550 px list-area width, 526 x 20 rows, and a 257 px label column. The renderer's
  typography and divider already match main's measured 12/16 px semibold sans-serif labels,
  12/16 px monospace values, and 1 px rgba(65,80,108,.3) dark divider; do not reopen those source
  roles or the item interaction geometry. Correct the playground's inner fixture and registered
  default to `550 x 350`, update the focused regression so it asserts the actual outer `552 x 352`
  result and 550 → 257 px derivation rather than equating inner and outer dimensions, run the
  narrow checks, and repeat the live comparison before requesting approval.
- Fixture-size correction (2026-08-11): the playground now authors the item panel's inner
  surface — the document layout and the registered default both moved from `552 x 352` to
  `550 x 350`, so the shell's 1 px per-side border renders live main's complete `552 x 352`
  outer Dict measurement and the list area meets main's measured 550 px width and 257 px
  default label column. The focused regression asserts the corrected relationship instead of
  equating inner and outer dimensions: the fixture-geometry case pins the `550 x 350` document
  layout and derives the recorded `552 x 352` outer result across the shell border, and the
  column-split case keeps the 550 → 257 px derivation, now aligned with the authored inner
  width. No package source changed. Playground suite 4/4 green; changed-file static gate green
  (no dependency or packaging changes, so the supply-chain and consumer gates were not rerun).
- Fixture-size correction audit (2026-08-12): a static audit confirmed the correction correct,
  complete, and faithful to the reference's box model. In the package, document sizes land on
  the resizable inner surface while the shell class (`w-min border`) wraps it on a separate
  element, so authored dimensions describe the inner surface and the outer measurement adds
  1 px per side; the frozen reference composes its shell and its resizable surface identically,
  so main's stored dimensions carry the same inner meaning and the package model matches main.
  The Phase 0 `settings-style-metrics.json` records `guiSectionAuthoredCssPx` from a DOM
  inspection at workspace scale, never from the document store — its "authored" label was a
  provenance misnomer for the outer measurement, which the supervised live comparison exposed;
  the frozen capture stays as recorded and this entry carries the corrected interpretation. No
  authored `552 x 352` size remains anywhere in code (surviving mentions correctly name the
  outer measurement), and the regression pins the inner `550 x 350` layout, derives the outer
  `552 x 352` across the shell border, and keeps the 550 → 257 px column derivation. No code
  changes were required. The phase-gate deterministic matrix was rerun green after the
  correction: full-scope static gate (`quality:all`, 326 files), package suite (431), playground
  suite (4/4), and the package build with the source and built-artifact boundary checks. The
  packed-consumer and supply-chain gates were not duplicated: their recorded green runs postdate
  the last packaging and dependency change, and this correction touched neither.
- Supervised live comparison rejected one remaining host-context omission (2026-08-11): the
  corrected playground panel now measures exactly 552 x 352 outer, with 550 px list-area width,
  257 px label column, and 20 px rows, but its scrollable list still measured 550 px client width
  and 532 px rows. Live main's same 550 px scroll shell measured 544 px client width and 526 px
  rows because the frozen application's host stylesheet gives every descendant a 0.375 rem (6 px)
  WebKit scrollbar with a translucent `#94a3b83a` thumb; the playground only mirrors main's body
  font and background and therefore leaves Chromium's overlay scrollbar behavior in effect. Both
  lists were verified scrollable (`328 > 320` in the playground, `780 > 290` in main), so this is
  a missing reference host presentation rule, not item geometry or fixture density. Add the
  frozen host's relevant Firefox and WebKit scrollbar treatment to the playground host stylesheet,
  without shipping it as package policy or changing `WorkspaceItemList`. Add the narrowest
  regression that proves the playground carries the exact host scrollbar contract, run the focused
  checks, and repeat the live dark/light comparison. Acceptance requires the scroll shell to remain
  550 px outer while reserving 6 px for the scrollbar, yielding main's 544 px client width and
  526 x 20 row geometry alongside the already-matching label/value/divider metrics.
- Host-scrollbar correction (2026-08-11): the playground host stylesheet now carries the frozen
  host's scrollbar treatment — the reference `index.css` Firefox and WebKit `@supports` blocks
  at 043d3b2e9, copied verbatim including the Firefox-only body overflow line: thin translucent
  `#94a3b83a` scrollbars on body and every descendant for Firefox, and the 0.375 rem WebKit
  scrollbar with transparent descendant tracks and the translucent rounded thumb, which opts
  Chromium out of overlay scrollbars so the package's 550 px scroll shell reserves the 6 px
  gutter and renders main's 544 px client width and 526 x 20 rows. The treatment ships as host
  presentation context only: no package source or stylesheet changed (the package carries no
  scrollbar rules), and `WorkspaceItemList` is untouched. The new host-scrollbar regression
  freezes both blocks as literal expectations against the authored stylesheet source, read
  through `node:fs` because vitest replaces `.css` imports (even `?raw`) with empty modules.
  Playground suite green (6, including the two new contract cases); changed-file static gate
  green (no dependency or packaging changes, so the supply-chain and consumer gates were not
  rerun).
- Host-scrollbar correction audit (2026-08-11): a static audit confirmed the correction faithful,
  complete, and correctly scoped, with no code changes required. The playground's two `@supports`
  blocks are byte-identical to the reference host stylesheet — `frontend/index.css` at 043d3b2e9,
  the file the reference `index.html` links as `/index.css` — verified by extracting the blocks
  from both sources and diffing. The host-context scoping holds on both sides: the reference's
  only other scrollbar rules (the `.top-bottom-fade` hide and the CodeMirror path-input scoping
  in `frontend/src/index.css`, plus the xterm viewport block) are class-scoped and never reach
  the item scroller — consistent with live main's measured 544 px client width — while in this
  repository the copied host blocks are the sole scrollbar rules anywhere, so the package ships
  no scrollbar policy and `WorkspaceItemList`'s `overflow-y-scroll` shell is what reserves the
  6 px gutter under the restored classic scrollbars. The regression test's frozen literals match
  the authored blocks, the `node:fs` read is admitted by the recorded test-only boundary
  relaxation, and the new test file is already covered by the playground's vitest include and
  Knip entry patterns. The phase-gate deterministic matrix was rerun green after the correction:
  full-scope static gate (`quality:all`, 327 files), package suite (431), playground suite (6),
  and the package build with the source and built-artifact boundary checks. The supply-chain and
  packed-consumer gates were not duplicated: the correction carries no dependency or packaging
  change, and their recorded green runs postdate the last relevant change.
- Supervised live dark/light comparison rejected the value-font interpretation (2026-08-11): after
  the scrollbar correction, package and main match exactly on the 552 x 352 outer panel, 550/544 px
  scroll-shell outer/client widths, 526 x 20 rows, 257 px label column, label typography/color, and
  1 px divider color in both appearances. The playground value role still uses the earlier
  directive's combobox-derived `font-medium tabular-nums text-setta-800 dark:text-setta-300`
  treatment. The actual live main text-value path being compared — the Dict's idle CodeMirror value
  — measures regular 400-weight monospace with normal numerals, `rgb(36,41,46)` in light and
  `rgb(201,209,217)` in dark; the playground instead measured weight 500 with `rgb(26,33,45)` light
  and `rgb(150,164,192)` dark. Running main outranks the supplementary combobox metric. Correct only
  the host renderer's value-role classes to reproduce those live text-value metrics, update the
  focused presentation regression, and do not reopen the now-matching label, divider, scrollbar,
  geometry, or interaction contracts. Run the narrow checks and repeat the live dark/light
  comparison before requesting approval.
- Value-font correction (2026-08-11): the host renderer's value role now reproduces the live
  idle Dict text-value metrics. The combobox-derived medium/tabular treatment in
  setta-800/300 was dropped for the reference value path's actual presentation: no weight or
  numeral utility (the reference `ParamUI` idle dummy-code class
  carries none, so the default regular 400 weight and normal numerals apply through the same
  mechanism as main), and the reference CodeMirror GitHub theme foregrounds as literal
  utilities `text-[#24292e] dark:text-[#c9d1d9]` — `defaultSettingsGithubLight`/`Dark`
  `foreground` verified in the frozen reference's installed `@uiw/codemirror-theme-github`,
  exactly the measured `rgb(36,41,46)` / `rgb(201,209,217)`; theme colors, not setta palette
  slots. Only the host value-role class string changed: the 12/16 px monospace metrics,
  bottom alignment, and padding are retained, and the now-matching label, divider, scrollbar,
  geometry, and interaction contracts are untouched (no package source changed). The focused
  presentation regression freezes the corrected literal. Playground suite green (6); the
  playground production build compiles both new color utilities with the dark rule correctly
  class-scoped; changed-file static gate green (no dependency or packaging changes, so the
  supply-chain and consumer gates were not rerun).
- Value-font correction audit (2026-08-11): a static audit confirmed the correction faithful,
  complete, and correctly scoped, with no code changes required. The reference's idle
  text-value path was verified end-to-end: `ParamUI`'s idle dummy-code class string carries no
  weight, numeral, or text-color utility, and its presentation classes are exactly the
  playground literal's retained parts —
  `section-value self-end break-words font-mono text-xs py-[.125rem]`; its color arrives
  through `useCodeMirrorStyle`, which builds the idle themes
  with `githubLightInit`/`githubDarkInit` over `commonSettings` — overriding only backgrounds
  and the gutter border, never `foreground` — so the theme defaults apply, and
  `defaultSettingsGithubLight`/`Dark` `foreground` in the frozen reference's installed
  `@uiw/codemirror-theme-github` are exactly `#24292e`/`#c9d1d9`, the measured
  `rgb(36,41,46)`/`rgb(201,209,217)`. The correction's scope holds: only the host value-role
  literal changed, the frozen test literal matches the renderer byte-for-byte, the label and
  divider literals are untouched, no package source changed, the new color utilities appear
  nowhere else, the surviving medium/tabular mentions are plan history, and the playground's
  own chrome `setta-300` uses are unrelated to the value role. The dark rule is class-scoped
  end-to-end: the package preset sets `darkMode: "class"`, the playground boots with
  `<html class="dark">`, and the production stylesheet compiles `.text-\[\#24292e\]` to
  `rgb(36 41 46)` and `.dark .dark\:text-\[\#c9d1d9\]` to `rgb(201 209 217)`. No Phase 4
  visual baseline exists to go stale (baselines follow developer acceptance). The phase-gate
  deterministic matrix was rerun green after the correction: full-scope static gate
  (`quality:all`, 327 files), package suite (431), playground suite (6), and the package build
  with the source and built-artifact boundary checks. The supply-chain and packed-consumer
  gates were not duplicated: the correction carries no dependency or packaging change, and
  their recorded green runs postdate the last relevant change.
- Phase 4 exit gate complete (2026-08-11): the supervised live comparison was repeated in dark
  and light appearance with main and playground in the same Chrome viewport and DPR. The reusable
  item surface matched main on the 552 x 352 outer panel, 550/544 px scroll-shell outer/client
  widths, 526 x 20 rows, 257 px label column, 12/16 px semibold sans-serif label role, 12/16 px
  regular monospace value role with the exact light/dark foregrounds, and the 1 px divider colors;
  the application-owned ARGS toolbar and value controls remain deliberately outside the unrelated
  renderer. The developer had already confirmed that item manipulation worked well and, after
  inspecting this final polished result, explicitly approved Phase 4. The backend-free example
  continues to supply only opaque item data and imports no Setta parameter types or state.
- Phase 4 accepted-output baseline recorded (2026-08-11): the approved dark/light output is locked
  under `docs/evidence/phase4/` — full-viewport and original-pixel item-panel captures of the
  playground production dist in headless Chrome at the exit gate's 1492 x 696 viewport and DPR 2,
  from the boot state with the camera at the document viewport, plus computed metrics matching the
  accepted values exactly in both appearances (552 x 352 outer panel, 550/544 px scroll-shell
  outer/client widths over a genuinely scrollable list, 526 x 20 rows, 257 px label column,
  12/16 px semibold sans-serif labels, 12/16 px regular monospace values with the
  rgb(36,41,46)/rgb(201,209,217) foregrounds, 1 px divider colors, and nested children on their
  own indented rows). The main-side comparison values are the supervised exit-gate measurements;
  the frozen reference was not relaunched for this post-acceptance recording. Remaining Phase 4
  work: none. Do not infer a deferred capability choice from the Phase 4 approval: the
  developer-choice rule below still applies.
- Post-Phase 4 capability chosen (2026-08-11): the developer chose built-in, opinionated parameter
  editing controls as the next narrow extraction milestone, consistent with the library's
  batteries-included direction. Phase 4 extracted item structure and interaction only; its
  playground renderer remains display-only. Before implementation, amend this plan with a bounded,
  backend-free milestone derived from the frozen main parameter UI — including the exact initial
  control slice, controlled value/name update seams, visual and interaction evidence, exclusions,
  and an exit gate — and return to the developer for explicit approval of that amendment.
- Item-controls amendment approved (2026-08-11): after the independent plan audit confirmed the
  amendment against frozen main and the existing package seams, the developer explicitly approved
  the exact initial control slice and authorized implementation to proceed.
- Item-controls milestone amendment drafted (2026-08-11): the required amendment is the
  "Item-controls milestone — built-in parameter editing controls" section below, derived from the
  frozen reference's `ParamUI` dispatch, control implementations, and the recorded `/settings`
  metrics. It fixes the initial slice to the four controls the frozen `/settings` evidence
  demonstrates (two-layer CodeMirror text value editor, Radix switch, downshift dropdown, native
  color picker), keeps values crossing the seam as strings with host-owned persistence/validation,
  adds a controlled name-edit seam at the reference kwarg-name presentation, attaches controls
  through the existing registered row renderer without reopening the opaque item-data contract,
  requires supervised control-state evidence before implementation, and names the exact reference
  dependency pins. At drafting time implementation had not begun and the milestone awaited the
  developer approval recorded immediately above.
- Item-controls frozen-reference evidence complete (2026-08-11): after amendment approval, a
  supervised Chrome session captured the four controls and editable name seam from frozen main in
  dark and light appearance before package implementation. Idle, hover, focused/live, open,
  filtered, selected, toggled, duplicate-name error, and interaction-boundary states; computed
  metrics; and short interaction traces are indexed under `docs/evidence/item-controls/`. The
  earlier `/settings` metrics remain authoritative for idle authored geometry. Frozen-source
  inspection records the disabled branch exactly: it is interaction-first with no blanket opacity
  delta, so the idle pixels are also the disabled visual reference. The temporary reference
  project was removed after capture. The implementation batches may now begin; the later package
  live-comparison and explicit developer-acceptance gate remain open.
- Item-controls text value editor batch complete (2026-08-12): the first implementation batch
  landed the package `TextValueEditor` — the reference's two-layer `TextInputCodeMirror` at the
  `ParamUI` text presentation: the Lezer-highlighted idle dummy (with placeholder form), the
  mouse-down-capture/tab-focus swap to the live CodeMirror editor over the GitHub idle themes and
  common settings, the accepted override class strings, single-line versus wrapped modes,
  Escape-returns-to-section, per-document-change reporting through the controlled string seam,
  the value-column divider's `peer-focus-within` focus treatment, the host-declared language from
  the reference's parser set, and interaction-first disabling from the host flag plus item-select
  mode. Supporting seams: the reference's `input-focus` active-section intent became
  package-owned (policy + controller + characterization), and the `setItemData` funnel gives
  hosts canonical opaque-data persistence behind control change callbacks. The playground's text
  rows replaced their display-only value role with the control (python, the reference settings
  surface's language default); its presentation regression now freezes the control-mounted
  rendering. Dependency pins follow the reference except two supply-chain-forced moves:
  `@codemirror/state 6.7.1` and `@codemirror/view 6.43.8` (the transitive `^6` ranges resolve
  there, the reference's 6.4.1/6.29.1 pins would split CodeMirror into two runtime instances,
  and the dependency policy rejects overrides); the supply-chain gate reran green. Test-runner
  note: the exports-map-less `@uiw` packages are aliased to their ESM entries in both vitest
  configs so tests keep the browser build's single-instance module graph. Remaining batches:
  switch and color picker; dropdown; name editor; then the live comparison and the explicit
  developer-acceptance exit gate.
- Item-controls switch and color picker batch complete (2026-08-12): the second implementation
  batch landed the package `SwitchValueControl` — the reference `SwitchInput` at the `ParamUI`
  switch presentation (the recorded 10 px Radix track/thumb in 3.2 px padding at full radius,
  `blue-500`/dark `blue-700` checked paint, 16 px checked thumb translation, Escape
  stop-propagation returning focus to the section) with the reference's checked parse across the
  string seam and the stringified boolean commit — and the package `ColorValueControl` — the
  reference `ColorPickerInput` at the `ParamUI` color presentation: with host choices, the
  recorded swatch/auto-contrast-label/chevron trigger over a portaled 16 px-swatch listbox
  through a package `ControlPopover` (the reference `StandardPopover` trimmed to the control
  usage, with its canvas-transform reposition subscription always on); without choices, the
  recorded native color input behind the eyedropper glyph. Both controls disable from the host
  flag plus item-select mode; the shared Escape-to-section helper moved to
  `controls/sectionFocus.ts`. Documented deviations: the color wrapper carries the package
  no-drag boundary (the reference's params color path lacks `nodrag`, but this amendment
  requires that editing never starts a section drag and the package drag filter exempts only
  that class); the native input binds only React's value-tracked `onChange` (the reference's
  paired `onInput`/`onChange` double-report each gesture into its idempotent app seam, while
  the package seam specifies one report per edit) and keys its id per item (the reference's
  static `id="colorPicker"` duplicates across rows); three inert trigger tokens are trimmed
  (`colorpicker` — only reference draw-area/meta-control surfaces target it — plus `min-w-0s`
  and `@[90px]:inline-block`, which emit no CSS on this path in either build). The playground's
  item panel gained switch, configured-color, and native-color rows driven by its opaque
  `control`/`choices` data through the `setItemData` funnel, and its presentation regression
  freezes them. Dependency pins: `@radix-ui/react-popover 1.1.15` exactly as the reference;
  `@radix-ui/react-switch` moved 1.0.1 → 1.1.0 (strict-peer-forced: 1.0.1's React peer stops at
  ^18, 1.1.0 is the earliest version admitting React 19; same forced-move rule as re-resizable
  in Phase 1). The supply-chain gate reran green on the dependency change; package (464) and
  playground (9) suites plus the changed-file static gate pass. Remaining batches: dropdown;
  name editor; then the live comparison and the explicit developer-acceptance exit gate.
- Item-controls dropdown batch complete (2026-08-12): the third implementation batch landed the
  package `DropdownValueControl` — the reference `IdNameCombobox` at the `ParamUI` dropdown
  presentation, trimmed to host-supplied options: the recorded small pill input (rounded-full
  12 px mono, "Search" placeholder, chevron toggle) inside the reference's no-drag `<search>`
  shell, over the reference's body-portaled list (positioned once per open, `nowheel nodrag`,
  the recorded group headers). Flat host choices take the reference's single "Choices" group;
  explicit host groups render one header each. The ported combobox state algorithm keeps the
  frozen behavior: match-sorter filtering while typing, reopening restores the full list,
  Escape/blur reset the draft to the committed selection, Enter with no highlight commits the
  first filtered match, and the reference's external-value honesty reset fires when the value
  matches no option. Seam projection: the empty string maps to no selection inward and the
  reference's null commits map back to the empty string. Escape follows the reference combobox
  contract — the input blurs and the keypress keeps bubbling to the canvas Escape shortcut
  (unlike the switch/color stop-propagation contract); the pane variant, theme-override props,
  and the reference's choice-configuration editor stay behind. Two structural notes: the
  `IdNameCombobox` layer must stay a component below the seam mapping because downshift resyncs
  its controlled selection by identity (a flattened component rebuilds the choice groups every
  dispatch and loops forever), and the reference's deep-compare layout effect runs through a
  render-updated ref behind an inline closure because this package lints
  `react-hooks/exhaustive-deps` at error (React invokes the latest effect closure either way;
  behavior identical). Dependency pins: `downshift 8.2.3` and `match-sorter 8.1.0` exactly as
  the reference; the supply-chain gate reran green. The playground's item panel gained the
  captured empty `choice` row over Alpha/Beta/Gamma, and its presentation regression freezes
  the pill and a commit through the `setItemData` funnel. Package (475) and playground (10)
  suites plus the changed-file static gate pass. Remaining batches: name editor; then the live
  comparison and the explicit developer-acceptance exit gate.
- Item-controls name editor batch complete (2026-08-12): the fourth and final source batch landed
  the package `ItemNameEditor` — the reference `ParamNameInput` at its kwarg-name presentation:
  the green-theme highlighted idle layer and single-line live CodeMirror swap, key-column and
  child-spanning placements, mouse-down-capture/input-focus activation, no-pan/no-drag boundaries,
  Escape focus restoration, item-select/host disabledness, blue focused underline, and the
  section-local zoom-normalized error bubble at the captured 10 px typography and exact light/dark
  treatment. Proposed names cross the controlled `name`/`onNameChange` seam unchanged; an optional
  host error message drives the red editor/underline/bubble state, while normalization, uniqueness,
  display-name meaning, and persistence stay host-owned. Non-visual accessibility additions give
  both editor layers an accessible name and disabled/error state, connect the error through
  `aria-describedby`, and announce the portaled bubble as a polite status. The shared theme loader
  regained the frozen reference's green "boring" themes without changing the accepted GitHub value
  themes. The playground gained the captured `rename_me` row; its renderer derives duplicate-name
  validation from opaque sibling labels, blocks the duplicate proposal with the captured message,
  commits accepted labels through `setItemData`, and restores the committed proposal on blur. No
  typed name model or validation policy entered the package document. The name path reaches the
  frozen source's direct `@uiw/codemirror-themes 4.23.0` pin, which was not needed by the earlier
  GitHub-theme-only text batch; the supply-chain gate reran green. The final focused package name
  suite (7), focused playground renderer suite (9), package build/built-boundary check, and
  changed-file static gate pass. Remaining repository-actionable implementation for this milestone:
  none. The supervised dark/light live comparison and explicit developer-acceptance exit gate remain
  open; no package-output baseline has been recorded.

- Extraction branch: `workspace-extraction`
- Extraction base: `main` at `043d3b2e9`
- Frozen reference worktree: `../setta-main` on `main` at `043d3b2e9`
- Extraction worktree: this folder on `workspace-extraction`
- Temporary integration worktree: removed after the approved Phase 2 gate; reproducible from
  `docs/evidence/phase2/setta-integration/adapter.patch`
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

- built-in, opinionated parameter editing controls (chosen 2026-08-11; specified as the
  item-controls milestone below; amendment approved 2026-08-11);

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

### Item-controls milestone — built-in parameter editing controls

This section is the plan amendment required by the 2026-08-11 capability choice. The developer
explicitly approved this amendment on 2026-08-11, so implementation may proceed. The milestone is
bounded and backend-free, derived from the frozen reference's parameter UI at `043d3b2e9`: `ParamUI`'s control
dispatch (`frontend/src/components/Params/ParamUIs/`), the live `/settings` capture (Phase 0
screenshot 29 and `computed/settings-style-metrics.json`), and the accepted Phase 4 item surface.
Main remains the product authority; the package terms stay "item"/"list", never "param".

#### Initial control slice (exact)

Four controls — the set the frozen `/settings` evidence demonstrates, each at the reference
presentation:

1. **Text value editor** — the reference's two-layer text input (`TextInputCodeMirror`): the idle
   Lezer-highlighted dummy presentation already accepted in Phase 4 (including its placeholder
   form), swapping on the reference's mouse-down-capture/focus activation to the live CodeMirror
   editor (`@uiw/react-codemirror` with the GitHub light/dark idle themes over the reference's
   common settings, and the accepted active-line/padding override class strings), single-line
   versus wrapped modes, Escape-returns-to-section and change-commit semantics, the value-column
   divider's focus treatment (`peer-focus-within` blue border), and syntax highlight for a
   host-declared language drawn from the reference's language-parser set.
2. **Boolean switch** — the reference `SwitchInput` on `@radix-ui/react-switch` at the recorded
   geometry and colors (10 px track and thumb, 3.2 px padding, full radius, `blue-500`/dark
   `blue-700` checked), with the reference's string parsing at the seam
   (`value === true || value === "true"`).
3. **Dropdown** — the reference combobox (`IdNameCombobox` on `downshift`) trimmed to
   host-supplied options: the recorded pill input presentation (rounded-full 12 px mono, chevron
   affordances), the portaled list with search filtering, and grouped headers where the host
   supplies groups.
4. **Color picker** — the reference `ColorPickerInput` presentation: the recorded 16 px rounded
   swatch row and its popover editing surface built on the native color input.

Controls disable from a host-supplied disabled flag and, package-wide, while item-select mode is
active (the reference disables inputs while param-select is held); the reference's share,
deployment, and frozen-state composition stays host-owned behind that flag.

#### Controlled value and name update seams

- Every control is a controlled component. Values cross the seam as strings — the invariant of the
  reference's `ParamValueChange` seam, where even the switch's boolean commit is stringified — and
  each user edit reports once through a change callback at the reference's cadence (per document
  change or gesture). Persistence, debouncing (the reference's debounced entered-value transport),
  realtime emission, validation, and default-value semantics stay host-owned.
- **Name seam**: an editable item-label control at the reference's kwarg-name presentation (the
  single-line name editor at label typography) reporting proposed names through a controlled
  name-change callback. Trim/normalization, uniqueness validation, and display-name semantics stay
  host-owned; the host may flag an invalid state, rendered at the reference's error treatment as
  captured in this milestone's evidence.
- The controls attach through the existing registered row renderer: the host composes them inside
  its renderer from its opaque item data. This milestone adds no typed value model to the
  workspace document and does not reopen the opaque item-data contract; promoting value kinds into
  the document is a separate future amendment.
- Controls carry the package's existing no-drag/no-pan/no-wheel interaction boundaries so editing
  never starts a section or item drag; the Phase 4 item selection and dnd contracts are unchanged.

#### Evidence before implementation

A supervised capture session records, from the frozen reference in dark and light appearance: each
slice control in idle, hover, focused-editing, open, and disabled states on the `/settings` surface
(or an equivalent supervised fixture where `/settings` lacks a state — kwarg name editing and an
invalid name in particular); the idle→live text-editor swap; computed geometry, typography,
colors, borders, and radii per state; and short interaction traces for text editing, switch
toggle, dropdown open/search/select, color pick, and name edit. Evidence lands under
`docs/evidence/item-controls/` with provenance (commit, viewport, DPR). The existing
`settings-style-metrics.json` stays authoritative for the recorded idle metrics. Implementation of
a control may not precede its captured evidence.

#### Exclusions

- LSP completion, diagnostics, folder-path completions, the waiting-for-result spinner, and
  autocomplete tooltip plumbing (backend editor services);
- realtime literal emission and every backend transport, optimistic-operation, or persistence path;
- slider, rotary, button, password, dropzone, and date/time controls — they remain deferred
  capability candidates, each requiring its own evidence and amendment;
- the parameter config-editing surfaces (min/max/step/options editing) — control configuration is
  host-supplied through props;
- the ARGS toolbar, column-resize persistence, search-result outlines, backend error-message
  plumbing, Setta API presets, and the share/deployment capability engine.

#### Dependencies

Adopt the exact reference pins where the supply-chain controls admit them (controls kept, versions
moved only when forced, as in prior phases): `@radix-ui/react-switch 1.0.1`,
`@radix-ui/react-popover 1.1.15`, `downshift 8.2.3`, `@uiw/react-codemirror 4.21.21`,
`@uiw/codemirror-theme-github 4.21.21`, and only the `@codemirror/*` and `@lezer/*` modules the
trimmed editor path actually imports. The supply-chain gate reruns on every dependency change.

#### Implementation order and exit gate

Evidence capture first; then narrow batches (text value editor; switch and color picker; dropdown;
name editor), each with focused tests, ported characterization where the reference has algorithmic
behavior, and the changed-file static gate; the live comparison last.

**Exit gate:** the unrelated playground example replaces its display-only value role with the
built-in controls, driven only by its opaque item data through the new seams; frozen main and the
playground compare live in dark and light appearance at matched viewport, DPR, and zoom against
the `/settings` surface; the package imports no Setta parameter types, stores, or generated
backend clients; the developer explicitly accepts the visual and interaction result. Visual
baselines refresh only after acceptance. No agent or test suite can waive this gate.

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
