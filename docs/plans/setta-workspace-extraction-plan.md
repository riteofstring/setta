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
  `aria-describedby`, and announce error-message changes through a persistent polite status beside
  the editor while the portaled bubble remains the visual description. The shared theme loader
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
- Item-controls coherence audit repository work complete (2026-08-12): the audit expanded from
  `0e26229d716ce93eba2680f6fc570a6a00106bea..c0c154637f24f7fbbda621fac0d7535a484877fe`
  through the approved amendment, frozen evidence, and all four implementation batches. One static
  pass over changed and removed behavior found and fixed three coupled boundary/accessibility
  defects: the dropdown list and color-popover roots now carry the package scope marker when
  portaled to `document.body`; the scoped Preflight subset now resets the dropdown's intrinsic
  `dl`/`dd` margins, with a built-stylesheet marker preventing regression in unrelated consumers;
  and each exported value control now requires a host-supplied accessible label and applies it to
  every idle/live, native, trigger, toggle, and menu surface. Disabled text dummies expose their
  state, dropdown toggles are explicit non-submitting buttons, and name errors update inside the
  already-mounted polite status described above. The loop's new dirty-resume path and both
  incomplete-result retries now retain the full governing implementation prompt instead of
  replacing its plan, scope, verification, and sentinel rules with a finish-only sentence. All
  affected package/playground call sites, exports, declarations, portal roots, and behavioral tests
  were reviewed together; no Setta application import or backend concept entered the package.
  Focused verification passed (five control files: 40 tests; playground renderer: 9 tests; loop
  shell syntax). The one stable-tree deterministic phase sweep passed: package production build
  plus built-boundary check; playground production build; package suite (65 files, 482 tests);
  playground suite (2 files, 11 tests); and the all-files static gate (380 files). The phase's one
  packed unrelated-consumer gate then installed and built the tarball from public exports only.
  The already-green supply-chain gate recorded by the final dependency-bearing batch was not
  duplicated because this audit changed no manifest or lockfile. Repository-actionable work for
  the item-controls milestone is complete. Its supervised matched dark/light live comparison and
  explicit developer acceptance remain incomplete as the required developer gate — not a release
  gate — and no package-output baseline has been recorded.
- Consolidated controls gate authorized (2026-08-12): the developer approved implementation of
  every remaining frozen-main parameter UI type and the canvas-level meta controls, and explicitly
  asked not to stop for visual/interaction acceptance until both additions are complete. The
  initial item-controls result therefore remains unaccepted, but its gate is postponed into the
  single consolidated exit gate below; this is gate deferral, not agent approval or a waiver. The
  next repository-actionable work is the remaining-controls milestone, followed by meta controls.
- Remaining-controls and meta-controls frozen-reference evidence complete (2026-08-12): a
  supervised Chrome session created a disposable project in frozen main, captured the seven
  remaining row controls and all twelve main meta-control presets in dark/light appearance,
  exercised slider, rotary, date, time, password, and multiline-text interactions, captured the
  calendar preset and computed meta-control geometry, then indexed the result under
  `docs/evidence/remaining-controls-and-meta/`. The disposable project was removed after capture;
  no source in `../setta-main` was edited. Implementation may proceed in narrow audited batches.
- Remaining-controls slider and rotary batch complete (2026-08-12): the package now exports
  `SliderValueControl` and `RotaryValueControl` through the existing controlled-string and
  host-configuration seams. The slider ports the ordinary-row Radix track/range/thumb plus its
  responsive numeric field, finite temporary parsing, clamping, keyboard stepping, separate live
  change/end-of-gesture commit callbacks, Escape focus restoration, and host/item-select
  disabledness. The rotary ports the -135°..135° layered knob, step-aware display and rounding,
  pointer capture, wheel and Arrow/Home/End adjustments, Escape focus restoration, disabled
  treatment, package no-drag/no-pan boundaries, and wheel ownership scoped to the enabled knob.
  Both controls require a host-supplied accessible label and fail specifically on non-finite or
  unordered bounds and on a non-positive or out-of-range step instead of inventing replacement
  configuration. The playground
  demonstrates the frozen 0..100/1 slider and 0..1/0.1 rotary through opaque item data and commits
  their string updates through `setItemData`. Dependency deviation forced by the existing strict
  peer policy: frozen main pins `@radix-ui/react-slider 1.1.0`, whose React peers stop at 18, so the
  package uses `1.2.0`, the earliest stable release admitting React 19. Focused package controls
  (25 tests), the directly affected playground renderer (11 tests), package production build and
  built-boundary check, changed-file static gate, and dependency supply-chain gate pass. Remaining
  row-control batches: password plus multiline text; date plus time; dropzone. Meta controls follow
  after the complete row set as authorized.
- Remaining-controls password and multiline-text batch complete (2026-08-12): the package now
  exports `PasswordValueControl`, preserving the frozen ordinary-row native password input,
  in-field show/hide icon and label swap, exact monospace/color/divider treatment, controlled
  string updates, Escape focus restoration, host/item-select disabledness, and package no-drag/
  no-pan boundaries. Placeholder text remains a direct host input. Hosts with separately persisted
  secrets may supply one explicit saved-value action carrying its reveal callback and controlled
  pending state; the package never infers a saved secret, owns no credential state, and performs no
  persistence. The frozen toggle's `tabIndex={-1}` was deliberately omitted as a non-visual
  accessibility deviation so its native button stays keyboard reachable; every input/action has an
  accessible name and decorative icons are hidden from assistive technology. Frozen main dispatches
  `TextAreaParam` through the same `TextParamConfigured`/`TextInputCodeMirror` path as text and code,
  so multiline text reuses `TextValueEditor` explicitly configured for wrapped, non-single-line
  input rather than adding a second editor; its existing row grid supplies the reference 20 px
  empty-row minimum and content grows by line. The playground demonstrates both controls from opaque
  item data through `setItemData`. No dependencies changed. Focused package password/text tests (14),
  the directly affected playground renderer suite (13), package production build and built-boundary
  check, and changed-file static gate pass. Remaining row-control batches: date plus time; dropzone.
  Meta controls follow after the complete row set as authorized.
- Remaining-controls date and time batch complete (2026-08-12): the package now exports
  `DateValueControl` and `TimeValueControl` over the controlled-string seam, with package-owned
  configuration types and specific runtime validation. Date ports the reference's configured
  text input (ISO, US, EU, and long display formats), datetime-local include-time path, and live
  42-cell calendar with single/multiple selection, Sunday/Monday week starts, month navigation,
  optional time editing, deterministic JSON-array serialization, and the frozen summary text.
  Time ports the native input and formatted-display modes, 12/24-hour formatting, transparent
  display, the bounded 0.5–3 scale, and monospace/system/clock presentation. Invalid enum values
  and out-of-range display scales fail specifically instead of selecting heuristic defaults. Both
  controls preserve the ordinary-row typography, divider/focus paint, host/item-select
  disabledness, Escape focus restoration, and package no-drag/no-pan boundaries; the later
  direction-dependent pan correction removed their stray no-wheel boundary.
  Non-visual accessibility additions give every native input, calendar surface, month action, and
  date cell an accessible name; selected/today/disabled calendar state is programmatic, and the
  month title announces navigation without changing the captured pixels. The playground supplies
  the captured date/time values and every option through opaque item data, committing updates via
  `setItemData`. Ported utility/calendar characterization plus component interaction coverage totals
  22 focused package tests; the directly affected playground renderer suite (15), package
  production build and built-boundary check, and explicit changed-file static gate pass. No
  dependencies changed, so the supply-chain gate was not duplicated. Remaining row-control batch:
  dropzone. Meta controls follow after the complete row set as authorized.
- Remaining-controls dropzone batch complete (2026-08-12): the package now exports
  `DropzoneValueControl` with the frozen drop target, drag-depth treatment, compact local/server
  actions, controlled attachment list, pending/error presentation, and byte labels. Local picker
  and file-drop results preserve raw browser `File` identities without reading their payloads;
  dropped text, ordered file/text policy rejections, optional server-picker requests, and removal
  requests cross explicit callbacks. The host owns attachment identities and metadata as well as
  every upload, persistence, deletion, and server-file decision. Runtime validation rejects
  invalid MIME-prefix, byte/count, attachment-metadata, and duplicate-identity configuration
  specifically; the frozen size, slot, MIME, and stateless-total filtering order remains covered.
  The server action exists only when its callback is supplied. Host/item-select/pending/capacity
  disabledness blocks native, button, and drag paths, while Escape restores section focus from the
  native actions. Non-visual accessibility additions name the drop and picker surfaces, expose
  busy/error/list semantics, keep live regions mounted, hide the decorative upload icon, and
  enlarge compact action hit geometry without changing its paint. The playground demonstrates the
  captured row from opaque item data and deliberately performs the host side of result-to-metadata
  conversion, simulated server selection, rejection messaging, and removal. No dependencies
  changed. The focused package policy/component suite (15), directly affected playground renderer
  suite (16), package production build and built-boundary check, explicit changed-file static gate,
  and packed unrelated-consumer proof pass. Repository-actionable work for the remaining-controls
  milestone is complete; meta controls are next under the existing consolidated authorization.
  The matched dark/light comparison and explicit developer acceptance remain open at the
  consolidated controls-and-meta exit gate, and no package-output baseline has been recorded.
- Remaining-controls coherence audit complete (2026-08-12): the audit expanded the requested
  `3f0cb5db87672f294bd6b4858af5e2daa1657738..af42822726486a95f0b7a822e1714c1967d97923`
  range through the authorization/evidence commit and reviewed the completed slider, rotary,
  password, multiline text, date/time, calendar, and dropzone work as one change against frozen
  `main`. The package, playground, public boundary, tests, and recorded reference evidence agree
  with the authorized backend-free ownership cuts and frozen behavior. The audit found and fixed
  one package-wide disabledness defect: the password reveal action now disables for host and item
  selection disabled states, with interaction coverage. On the stable implementation, the package
  production build and built-boundary check, complete package suite (74 files, 551 tests),
  playground production build, complete playground suite (2 files, 18 tests), full static gate
  (409 project files), and packed unrelated-consumer proof pass. The supply-chain gate already
  passed after this milestone's only dependency change and was not duplicated after later
  dependency-free work. This intermediate milestone has no standalone developer gate; meta
  controls remain next, and the consolidated controls-and-meta comparison, acceptance, and first
  package-output baselines remain open exactly where scheduled.
- Meta-controls representative surface batch complete (2026-08-12): registered kinds can now opt
  into a package-owned `meta-control` presentation that projects opaque section data to a strict
  package control kind and supplies the host-owned edit callback. The restored frozen-main surface
  is transparent and headerless, suppresses ordinary style-color paint, carries the outboard
  adjustments affordance and top drag pill, uses the enlarged bottom/right/corner resize hit strips
  with hover/active paint, and enforces projected package default/minimum geometry. Button and Text
  compose one controlled `MetaControl` dispatcher without forking the existing two-layer text
  editor: Button preserves the captured full-area action classes with explicit label, disabled,
  pending, and `onAction` inputs; Text preserves the captured full-area CodeMirror wrapper and
  optional uppercase title. Unknown kinds fail specifically. The new `setSectionData` funnel
  replaces one host-owned opaque section payload and notifies once. The unrelated playground
  registers the presentation and demonstrates captured `Trigger` and empty Text nodes at 200 x 44
  inner / 202 x 46 outer geometry, with action, edit-request, and text-value commits remaining
  host-owned. Focused package verification passed (76 batch tests, followed by a green 35-test
  directly affected rerun after the complexity-only editor extraction); the directly affected
  playground item renderer (16 tests) and meta host regression (4 tests), final package production
  build and built-boundary check, and complete changed-file static gate pass. No dependency changed,
  so the supply-chain gate was not duplicated. The next repository-actionable batch is the complete
  remaining meta-control dispatch and playground fixture, followed by the scheduled interaction,
  resize/min-size, appearance, and packed-export audit. The consolidated matched live comparison,
  explicit developer acceptance, and first package-output baselines remain open at their existing
  gate; this repository test result is not visual approval.
- Meta-controls complete dispatch batch complete (2026-08-12): `MetaControl` now exports strict
  controlled definitions for frozen main's complete twelve-kind dispatch — Button, Text,
  TextArea, Date, Time, Slider, Rotary, Switch, Color, Dropdown, Password, and Dropzone — while
  hosts continue to own values, configuration, actions, attachment metadata, and persistence.
  Shared package behavior remains single-sourced: TextArea configures the existing two-layer text
  editor; Slider, Dropdown, Password, Date, and Time add only their frozen full-area presentations;
  and Rotary, Switch, Color, and Dropzone compose the already-extracted controls. The projected
  sizing policy now covers the captured 200 x 44 default, 200 x 98 TextArea, and 240 x 120 Dropzone
  inner geometry, plus frozen main's auto-only height for Dropdown, Password, and Slider; those
  controls expose only horizontal resizing. The unrelated playground supplies a four-column by
  three-row fixture for every kind entirely through opaque section data and explicit callbacks,
  including calendar/date options, switch/value commits, Button actions, and backend-free
  Dropzone server-selection metadata. Package and playground source typechecks, the focused
  package set (102 tests, followed by green focused dispatcher and sizing-policy reruns), the
  focused playground host workflow (5 tests), both production builds, the package built-boundary
  check, changed-file static gate, and packed unrelated-consumer proof pass. No dependency changed,
  so the supply-chain gate was not duplicated. The next repository-actionable batch is the
  scheduled meta-controls coherence audit across interaction ownership, resize/minimum behavior,
  appearance, and public packed exports. The consolidated matched live comparison, explicit
  developer acceptance, and first package-output baselines remain open at their existing gate;
  this repository verification is not visual approval.
- Meta-controls coherence audit repository work complete (2026-08-12): the audit reviewed
  `af42822726486a95f0b7a822e1714c1967d97923..e7edc4f9c97b8ba1f43ea58980b3530ef06011fb`
  as one change against frozen main and confirmed the shared controls preserve control-specific
  pointer/keyboard/wheel/file boundaries, section-owned remaining drag surface, projected minimum
  and auto-only resize policies, Escape focus restoration, and the captured light/dark class
  treatment. It found and fixed one dispatcher-default defect: an omitted direct-on-canvas Time
  mode now resolves to frozen main's formatted display while the ordinary row control retains its
  editable-input default. The unrelated packed consumer now imports and renders the public
  `MetaControl` surface through a registered meta presentation, its controlled definition type,
  and its exported size constant, so the tarball proof exercises the new public boundary rather
  than merely installing it. The focused dispatcher (8) and date/time (10) suites, complete package
  suite (77 files, 577 tests), complete playground suite (3 files, 23 tests), package production
  build and built-boundary check, playground production build, full static gate, and packed
  unrelated-consumer proof pass. No dependency changed, so the already-green supply-chain gate was
  not duplicated. Repository-actionable work for the meta-controls milestone is complete. The
  consolidated matched dark/light live comparison, explicit developer acceptance, and first
  package-output baselines remain open at the existing controls-and-meta exit gate; no later phase
  is actionable before that gate.
- Meta-controls final phase audit repository work complete (2026-08-12): the loop audit treated
  `3fcfc5c01b60a5af8410e4fbddac582d96e8b441..6242f05086dadbebe4f05f035bf7625822404514`
  as one coherent change; `d6b56b7ce6bdd044876ceb597f221ef2550dfbd4` is the first meta-controls
  implementation commit, so the requested range already reaches the phase boundary. The frozen
  reference remained clean at `043d3b2e9c69caf99d1246f1408b3ad7194b7864`. One static pass over
  every affected behavior found and fixed four coupled boundary/accessibility defects. The
  `canEditLayout` capability now blocks the shared top-level node drag, selection-box drag and
  Arrow-key movement, and ordinary/meta resize handles rather than hiding only the meta drag pill;
  disabled drag surfaces return their non-interactive area to canvas pan. Auto-height-only Slider,
  Dropdown, and Password meta sections now normalize to `auto` even when locked or read-only, as
  frozen main does, instead of retaining an unsupported numeric height. The outboard meta edit
  glyph keeps its exact 14 x 14 paint while its reserved 40 x 48 hit area is live, reveals itself
  for keyboard focus instead of creating an invisible tab stop, and derives a nonblank accessible
  name. A malformed missing `MetaControl` definition now reaches the same specific unknown-kind
  failure as every other invalid opaque adapter result. Focused verification and the complete
  package suite pass (79 files, 581 tests), followed by the final directly affected container suite
  (20 tests); the package production build and built-boundary check, playground production build
  and complete suite (3 files, 23 tests), full static gate (422 project files), and packed unrelated-
  consumer proof also pass. No dependency changed, so the already-green supply-chain gate was not
  duplicated. Repository-actionable work for the meta-controls phase remains complete. The
  existing frozen-reference captures are still preimplementation evidence, not package approval:
  the consolidated matched dark/light live comparison, explicit developer acceptance, and first
  package-output baselines remain incomplete at the required developer gate, and Phase 5 is not
  actionable.
- Consolidated controls gate correction — implicit CodeMirror completion (2026-08-12): the
  developer's manual inspection exposed a Python completion menu below the editable item name,
  clipped by the item panel. This was not supported completion behavior awaiting a portal fix:
  `@uiw/react-codemirror` silently enables its bundled autocomplete extension unless
  `basicSetup.autocompletion` is false, while frozen main explicitly passes `autocomplete={false}`
  for renamable parameter names and the approved item-controls amendment excludes completion
  sources and tooltip plumbing. The package now centralizes its basic editor setup with
  autocompletion explicitly disabled and uses it for item names, row values, multiline text, and
  meta text controls; the language prop remains syntax/parser selection only. A focused regression
  freezes the explicit opt-out. The three directly affected editor suites (20 tests), complete
  package suite (80 files, 585 tests), production build and built-boundary check, changed-file
  static gate, packed unrelated-consumer proof, and live Chrome checks for the name and Python value
  paths pass; typing no longer opens a completion menu and Escape still restores section focus.
  No dependency changed, so the supply-chain gate was not duplicated. The consolidated developer
  acceptance and first package-output baselines remain open; Phase 5 is still not actionable.
- Consolidated controls gate correction — native date/time affordance contrast (2026-08-12): the
  developer's dark-mode inspection exposed Chromium's nearly black native time-picker indicator
  over the dark item surface. Frozen-main source comparison confirmed that the localized native
  time field plus trailing configured-format value is deliberate parity, and that the formatted
  date input without time deliberately uses `type="text"`; neither layout was redesigned. The
  package now scopes `color-scheme: dark` to native time and datetime-local inputs, including the
  calendar's optional time field, so the browser paints its own picker affordances for the active
  dark appearance while formatted text inputs remain untouched. A focused regression covers all
  native date/time paths. The focused date/time suite (10 tests), complete package suite (80 files,
  585 tests), package production build and built-boundary check, changed-file static gate,
  playground production build, and packed unrelated-consumer proof pass. No dependency changed,
  so the supply-chain gate was not duplicated. The consolidated developer acceptance and first
  package-output baselines remain open; Phase 5 is still not actionable.
- Consolidated controls gate correction — password alignment and responsive slider value
  (2026-08-12): the developer's live inspection exposed the ordinary password visibility glyph
  near the center of the value column and asked to see the ordinary slider's numeric value. The
  password input wrapper now grows across its value cell, returning the trailing glyph to frozen
  main's edge geometry. Frozen-main source confirmed that the slider value is not a separate
  option: its field is always rendered and becomes visible when the named slider container reaches
  132 px. The extraction had copied those class tokens without the frozen Tailwind container-query
  plugin, so the package now exact-pins the same build-only plugin, compiles the named threshold,
  and makes the threshold display beat a consumer's later generic `.hidden` utility. The built
  boundary check locks the emitted container contract. The existing direct-on-canvas Date fixture
  already provides the requested live inline calendar without replacing the ordinary formatted
  date input. The focused password/slider suites (13 tests), complete package suite (80 files, 585
  tests), complete playground suite (3 files, 23 tests), package production build and built-boundary
  check, playground production build, full changed-file static gate, packed unrelated-consumer
  proof, and dependency/supply-chain gate pass. The consolidated developer acceptance and first
  package-output baselines remain open; Phase 5 is still not actionable.
- Consolidated controls gate correction — full-width password interaction (2026-08-12): follow-up
  inspection showed that expanding the ordinary password wrapper correctly anchored the visibility
  glyph but left the native input at its browser-intrinsic width. The input now explicitly fills
  that wrapper while retaining its trailing padding for the overlay button, so the visible value
  column and the editable pointer/focus area agree. A focused regression locks the width contract;
  the focused password suite (6 tests), complete package suite (80 files, 585 tests), complete
  playground suite (3 files, 23 tests), package production build and built-boundary check,
  playground production build, full changed-file static gate, packed unrelated-consumer proof, and
  live Chrome geometry check pass. No dependency changed, so the supply-chain gate was not
  duplicated. The consolidated developer acceptance and first package-output baselines remain
  open; Phase 5 is still not actionable.
- Consolidated controls gate correction — stable slider value width (2026-08-12): developer live
  inspection exposed the frozen ordinary slider field's fixed 32 px box clipping the configured
  value `100` to two visible digits. With its preserved 8 px inline padding and borders, that box
  left only about 14 px for text. The explicitly requested correction replaces the fixed width with
  a character budget derived once from `min`, `max`, and `step`, including sign and decimal
  precision, and uses tabular digits. Width therefore remains constant as the live value changes,
  while configured endpoints fit without drag-time layout jitter. A regression covers integer and
  signed-decimal configurations and freezes width across `9` to `100`. The focused slider suite
  (8 tests), complete package suite (80 files, 586 tests), complete playground suite (3 files, 23
  tests), package production build and built-boundary check, playground production build, full
  changed-file static gate, packed unrelated-consumer proof, and live Chrome style inspection pass.
  No dependency changed, so the supply-chain gate was not duplicated. The consolidated developer
  acceptance and first package-output baselines remain open; Phase 5 is still not actionable.
- Consolidated controls gate correction — meta configure affordance and editable Time fixture
  (2026-08-12): developer inspection rejected the shared outboard configure glyph as too small on
  every meta control. The frozen 14 x 14 button with 4 px padding left only about 6 x 6 px of icon
  paint even though the extraction already reserved a 40 x 48 interaction target. All twelve meta
  controls now share a compact 24 x 24 visible button and explicit 16 x 16 icon while retaining the
  same large hit geometry, hover/focus reveal, accessible name, drag exclusion, and host-owned
  `onEdit` callback. The playground callback continues to demonstrate host ownership by recording
  the edit request in opaque section data rather than inventing package configuration persistence.
  The review fixture's Time control now opts into the supported native input mode so its value is
  directly editable; formatted display mode and its meta default remain covered by package tests.
  The focused container (20 tests) and playground meta-control (5 tests) suites, complete package
  suite (80 files, 586 tests), complete playground suite (3 files, 23 tests), package production
  build and built-boundary check, playground production build, full changed-file static gate,
  packed unrelated-consumer proof, and live Chrome inspection across all twelve triggers pass. No
  dependency changed, so the supply-chain gate was not duplicated. The consolidated developer
  acceptance and first package-output baselines remain open; Phase 5 is still not actionable.
- Temporary pan diagnostic trace removed (2026-08-12): developer live inspection reported a
  direction-dependent pan failure that could not initially be reduced to a deterministic sequence.
  A temporary package sink and playground capture recorded raw wheel input, target ownership,
  interaction state, and viewport transforms long enough to isolate the cause below. After the
  focused correction passed the developer's live retest, the developer requested removal. The
  public diagnostic exports, canvas instrumentation and raw listeners, playground console/buffer
  capture, and diagnostic-only tests are removed; no issue-specific pan logging remains. The
  behavioral regression for the accepted fix remains.
- Consolidated controls gate correction — direction-dependent Time-area panning (2026-08-12): the
  developer reproduction produced a decisive trace rather than a stale-state failure. Twenty-nine
  consecutive horizontal wheel events over the direct-on-canvas Time input were rejected by its
  extracted `nowheel` class while the viewport transform remained fixed; the same deltas applied
  as soon as the pointer reached its edge. Once a pan burst started there, the existing continuation
  rule allowed later events even over `nowheel`, creating the observed directional asymmetry.
  Frozen main's date/time inputs own pointer editing but do not claim wheel input, so the package
  removes only their stray wheel boundary while retaining `nodrag` and `nopan`; genuinely scrollable
  areas and wheel-driven controls keep `nowheel`. A canvas regression locks starting horizontal pan
  over an interactive `nopan` target while proving an explicit `nowheel` target still blocks a new
  burst, and date/time regressions lock the corrected class contract. The focused suites (22 tests),
  complete package suite (80 files, 587 tests), complete playground suite (3 files, 23 tests),
  package and playground production builds, changed-file static gate, packed unrelated-consumer
  proof, and live Chrome trace over the Time input pass. The developer's live retest confirmed that
  the direction no longer becomes trapped. This accepts the focused pan correction only; the
  consolidated controls and meta-controls acceptance remains open, and Phase 5 is still not
  actionable.
- Consolidated controls and meta-controls exit gate accepted (2026-08-12): after completing the
  ordinary parameter-control and direct-on-canvas meta-control review, including the focused
  corrections recorded above, the developer explicitly accepted the combined visual and
  interaction result. This satisfies the developer-only exit gate. Record the first accepted
  package-output baselines before beginning Phase 5 repository work.
- Consolidated controls and meta-controls accepted-output baseline recorded (2026-08-12): the
  already-approved package output is locked under `docs/evidence/controls-and-meta/` with dark/light
  full-playground captures, the two ordinary-control scroll positions that expose the complete row
  control set, focused dark/light crops of all twelve canvas controls at workspace zoom 1, and the
  corrected meta configure/drag hover chrome. Machine-readable geometry, appearance facts, capture
  context, dimensions, and SHA-256 hashes accompany the images. The post-acceptance browser surface
  emitted CSS-pixel-sized JPEGs at DPR 1; the bundle records that separate raster context explicitly
  and does not replace the completed supervised DPR 2 parity comparison. The frozen reference stayed
  clean and untouched at `043d3b2e9`. This completes the prerequisite baseline, so Phase 5
  repository work may begin.
- Phase 5 package-owned item-column resizing batch complete (2026-08-12): the application-side
  `--param-column-width` deferral is removed. `WorkspaceSectionItemTree.itemColumnWidth` is the
  optional canonical authored width (finite at load, round-tripped in the controlled document),
  and drag/reset/keyboard commits publish it once through the normal document-change callback.
  `WorkspaceItemList` now owns frozen main's complete split algorithm: half-width default minus the
  18 px center offset, a 72 px base key-side margin plus 12 px per nested level, the deepest
  canonical item as the depth input, a 100 px minimum value side, canvas-zoom-correct pointer
  deltas, percentage-preserving live container resize, and double-click reset. Every real row
  exposes the reference's compact center paint and 16 px pointer target; `canEditLayout` removes the
  interaction. A non-visual accessibility addition makes the first visible divider in each mounted
  list a named native button with a focus-visible outline, 10 px Arrow-key adjustment (1 px with
  Shift), and activation-to-reset, while identical row targets stay out of the repeated tab order
  and keyboard activation cannot toggle item selection. The playground's host-owned ResizeObserver
  split hook was deleted; its renderer now relies only on the package surface. Focused package
  verification passes (three files, 40 tests), as does the directly affected playground renderer
  suite (16 tests), package production build/built-boundary check, and changed-file static gate. A
  narrow live playground check at the accepted geometry measured the unchanged 552 x 352 panel,
  550 px list area, 526 x 20 row, 257 px default split, 16 x 18 pointer target, and one tab stop
  across 25 row handles; a 40 px drag produced a 297 px shared split without moving the section or
  camera, double-click restored 257 px, and keyboard Right Arrow/Enter produced 267 px/restored
  257 px with focus retained. No browser warnings or errors appeared. No dependency changed, so the
  supply-chain gate was not duplicated. The remaining Phase 5 API ratification, extension points,
  hardening audits, performance work, final matched developer comparison, and phase gates remain
  open; no visual baseline was refreshed by this implementation batch.
- Phase 5 public API and composition-extension ratification complete (2026-08-12): the root runtime
  and declaration entry is now the deliberate package surface rather than a provisional Phase 1
  export list. An exact runtime-export regression prevents broad barrel leakage; the two private
  `SETTA_PREVENT_SECTION_*` selector constants left the public entry while the three approved
  semantic interaction-boundary constants remain. The Phase 2 content-placement observation is
  resolved at the package boundary: ordinary registered renderers are wrapped in the package-owned
  section body slot and may add host presentation through `contentClassName`, so neither the
  playground nor the packed consumer names `section-full-no-title`; direct-on-canvas controls keep
  their separately owned full-area placement and reject a competing host slot. The new
  `WorkspaceItemLabel` similarly owns leaf-key versus direct group-label placement, removing the
  last package-grid class from the playground's registered item renderer without changing its
  accepted DOM or geometry. The package README ratifies the real-example extension model: section
  renderers and icons register per kind, `WorkspaceControls` composes in a host toolbar pane,
  `WorkspaceCanvas` fills the host canvas pane, and host/package overlays compose as siblings or
  portals; no XYFlow panel, dnd store, Tailwind utility, or private selector became API. The working
  local name remains `@setta/workspace` for this plan only; final publication naming remains an
  explicit developer decision. The Phase 2 legacy-resolution observation is closed by retaining
  one standard ESM exports map: no duplicate `main`/`module`/`types`/`typings`/`typesVersions`
  metadata or CommonJS path, enforced by the package-boundary gate and documented with the required
  TypeScript resolution modes. Focused package verification passes (four files, 31 tests), as does
  the directly affected playground renderer suite (16 tests), package and playground production
  builds, built-artifact boundary check, exact packed unrelated-consumer install/typecheck/build,
  and changed-file static gate. A narrow live playground check at 1492 x 696 confirms the accepted
  composition is unchanged: 552 x 352 item outer, 550 x 350 surface, 550 x 320 package body slot,
  550/544 px list outer/client widths, 526 x 20 rows, the leaf's `px-1` body slot, and the group
  label as a direct row child, with no browser warning or error. The frozen reference remains clean
  at `043d3b2e9`; no dependency changed, so the supply-chain gate was not duplicated. The remaining
  Phase 5 repository work is the appearance/input/accessibility hardening audit, large-document
  performance measurement, and the final broad and developer-acceptance gates; no visual baseline
  was refreshed by this API batch.
- Phase 5 scoped-appearance and semantic-color hardening batch complete (2026-08-12): the public
  `setWorkspaceColorMode` controller now resolves explicit light/dark modes and a live
  `(prefers-color-scheme: dark)` system preference, rejects unsupported system/unknown inputs
  specifically, and reprojects style-colored node backgrounds whenever the resolved appearance
  changes without publishing a document mutation. The compiled stylesheet no longer reads
  `html.dark`: every canvas, toolbar, tooltip, popover, dropdown, error bubble, drag preview, and
  drop-feedback root carries a package-owned resolved-dark scope, including portals under
  `document.body`; the built-artifact boundary now locks the scoped dark selector and rejects every
  host-wide `html` selector. The playground and packed unrelated consumer use the controller and
  mirror resolved appearance only into their own host chrome. The package README documents the
  server/system contract, host-chrome composition, six inherited semantic section-color variables,
  and the rule that `tagColor` is never a sole state cue. Document load now rejects an unparseable
  style color even on a nested section, and an exhaustive four-bit RGB-cube test verifies the
  derived primary text/background pairing remains at WCAG AA contrast in both appearances.
  Focused verification passes across 14 files and 92 tests (appearance/media events, scope,
  projection/load, color derivation, affected portals/surfaces, minimap/background, and the exact
  public API), as do package and playground production builds, the strengthened built-artifact
  boundary, the exact packed unrelated-consumer install/typecheck/build, formatting, and the
  changed-file static gate. A live playground check at 1512 x 805 measured the accepted 552 x 352
  item panel unchanged; all five mounted package roots and body-portaled lists followed dark and
  light mode, canvas/minimap/style-color computed colors matched the reference derivation, and the
  browser emitted no warning or error. The frozen reference remains clean at `043d3b2e9`; no
  dependency changed, so the supply-chain gate was not duplicated. The remaining hardening work is
  keyboard/screen-reader/focus restoration, reduced motion, RTL, coarse pointer, 200% zoom, and
  narrow reflow, followed by performance measurement and the final gates. No accepted baseline was
  refreshed by this non-geometric batch.
- Phase 5 keyboard, screen-reader, and focus-restoration hardening batch complete (2026-08-12):
  every control with the package's section-restoring Escape contract now consumes the key before
  the canvas shortcut and restores its owning section, including both CodeMirror layers, native and configured color controls,
  password actions, numeric controls, and direct-on-canvas actions. The configured color listbox
  and 42-cell calendar use one roving tab stop with standard arrow/Home/End navigation; the calendar
  additionally supports Page Up/Down month and year movement across its ARIA grid. Editable section
  titles activate with Enter or Space, expose a labeled input, and restore the title trigger after
  keyboard commit or cancel. Focus after destructive actions is deterministic: section deletion
  chooses next sibling, previous sibling, parent, or canvas pane in that order, while attachment
  deletion chooses the next or previous attachment action and finally the local-file action. Item
  row groups enter the tab order with a named canonical selection state only during explicit
  item-select mode; idle disabled CodeMirror layers leave the tab order. Section/group selection
  state, color tags,
  toolbar zoom status, decorative icons, formatted time output, search landmarks, and canvas/minimap
  names now expose their semantics without changing accepted geometry. The minimap supports arrow
  panning and keyboard activation, and the multi-section selection surface retains a visible focus
  indicator and identifies its selected sections. Package verification is green across 87 files
  and 634 tests after the sole color-popover close-timing failure was repaired and rerun in
  isolation; the two directly affected playground renderer files pass 21 tests, and the package
  production build/built-boundary check and changed-file static gate pass. The frozen reference
  remains clean at `043d3b2e9`; no dependency changed, so the supply-chain gate was not duplicated.
  Remaining Phase 5 hardening is reduced motion, RTL, coarse pointer, 200% zoom, and narrow reflow,
  followed by performance measurement and the final matched developer comparison and gates. No
  accepted visual baseline was refreshed by this non-geometric batch.
- Phase 5 adaptive-hardening implementation batch complete (2026-08-12): package CSS motion now
  opts in only under `prefers-reduced-motion: no-preference`, retained sortable inline transitions
  collapse under the reduced preference, and package-owned d3 fit/reset/center commands apply
  immediately without leaving a transition timer. Language-facing chrome uses logical placement;
  horizontal calendar and shared item-divider keys follow visual direction; and dropdown, color,
  tooltip, error, and drop-feedback surfaces preserve a locally scoped RTL direction across their
  portals. Canvas coordinates, resize edges, and the public physical minimap side keep their
  serialized meaning. The item divider now uses pointer events for touch dragging at canvas zoom.
  Coarse-pointer CSS separates accepted compact paint from transparent 24 px hit geometry, gives
  the isolated rotary gesture 44 px, expands the existing resize strips without overlap, and keeps
  package control groups separated. The minimap retains its accepted 200 x 150 maximum while
  clamping to a narrow pane. Both standalone hosts leave browser zoom unrestricted, wrap their own
  chrome at the 200% content breakpoint, and keep a min-size-zero canvas inside a compact 320 px
  shell without page-level horizontal scrolling. The README documents motion ownership, RTL's
  physical-versus-logical boundary, coarse-pointer behavior, and host reflow obligations; the
  built-artifact boundary locks the new media queries and minimap clamp. Focused package coverage
  passes across 21 files and 170 tests, with the final three directly touched files rerun green for
  39 tests after static-gate refinements; the three affected playground files pass 21 tests.
  Package and playground production builds, the strengthened built boundary, changed-file static
  quality gate, and exact packed unrelated-consumer install/typecheck/build pass. The frozen
  reference remains clean at `043d3b2e9`; no dependency changed, so the supply-chain gate was not
  duplicated. This completes the repository implementation for the remaining adaptive hardening;
  large-document performance measurement and the final broad gates remain. The required matched
  live RTL/coarse/200%/320 comparison, explicit developer acceptance, and any accepted baseline
  refresh remain at the final developer gate and are not claimed by these automated checks.
- Phase 5 large-document performance batch complete (2026-08-12): the playground has a
  query-only production profile surface with 256 fixed-size top-level leaves across a 4,295 x
  2,642 workspace-unit plane, using the real registered renderer, canvas, controls, minimap,
  tooltip, compiled package, and host chrome. The zero-new-dependency runner builds both
  workspaces, serves production output, launches an isolated headless Chrome profile, and drives
  three fresh render passes plus three 96-move empty-pane pans and section drags through CDP. It
  records frame gaps, handler spans, target mutations, long tasks, page-scroll drift, CDP work,
  browser issues, exact fixture/mount/visibility counts, and source/artifact hashes; fixture drift,
  missing sustained work, page scrolling, or browser warnings/errors fail specifically. The
  useful probe mechanism was reimplemented from the experimental donor against this package's DOM;
  none of its workspace engine, culling architecture, visual fixture, Playwright stack, or
  thresholds was adopted. Frozen main mounts every node id, so the reference-parity baseline
  correctly measured all 256 nodes mounted (20 visible, 236 mounted offscreen) and did not invent a
  culling subsystem. The inherited hotspot was instead specific: every drag frame deep-cloned the
  complete node-internals map. Node publication now shallow-copies the map and replaces only moved,
  remeasured, or actually re-layered records while retaining the reference's position object,
  values, full-map publication, canonical commit, DOM, and geometry. Against a disposable
  same-commit baseline worktree, median drag scripting fell from 138.9 to 103.5 ms (25.5%) and task
  time from 328.1 to 285.6 ms (13.0%); render medians stayed 216.6/216.9 ms, pan scripting stayed
  235.9/234.9 ms, and both versions sustained drag at 9.4 ms or better with no gesture long task.
  The raw three-pass traces and method are under `docs/evidence/phase5/performance/`. Focused node
  publication and fixture suites pass (5 and 2 tests), both profile runs rebuilt the package and
  playground production artifacts with the built boundary green, and the changed-file static gate
  passes. The frozen reference remains clean at `043d3b2e9`; no dependency changed, so the
  supply-chain gate was not duplicated. This completes Phase 5 repository implementation; the
  final coherence audit, required matched developer comparison and explicit acceptance, any
  accepted baseline refresh, and the scheduled post-acceptance broad gates remain. No automated
  performance result claims visual approval.
- Phase 5 coherence-audit repository work complete (2026-08-12): the audit expanded the requested
  `05eb8033b..1ee86e4d0` minimum range only to the four earlier Phase 5 implementation commits,
  reviewing `b3f9e1ff5..1ee86e4d0` as one six-batch change against the accepted `c66a7632b`
  controls baseline and frozen main. It corrected seven directly affected contracts: appearance
  reprojection now changes only style-color backgrounds while preserving live drag geometry and
  temporary layering; reduced-motion viewport commands bypass d3 transitions, including the
  no-duration center path; an adjacent-month calendar selection moves the visible month and roving
  focus together; item-column release flushes the last pointer sample before its single canonical
  commit while cancellation restores the authored split without publishing; public kind
  registration rejects malformed renderers, presentation discriminants, and
  meta callbacks specifically; section, pane, multi-selection, and item surfaces expose grouped
  semantics without turning containers of real controls into ARIA buttons; and configured-color
  Escape focus restoration no longer races Radix's deferred close-autofocus callback. The package
  filters dnd-kit's conflicting accessibility plugin at its provider boundary because that plugin
  imperatively rewrote every full-surface activator as a pressed/grabbed button; package-owned
  selection names, keyboard operations, and focus behavior remain explicit and covered. The
  package-wide suite passed all 91 files and 660 tests after the primary corrections; the final
  pointer-cancel correction's expanded item-list suite passes 18 tests. The production package
  build, source/compiled boundary, and changed-file quality gate pass after all source changes. The
  performance target-input SHA-256 is
  still `b02c59e91cbdb86b906eec500b93e6144efb4123b7e7bb4a1041242e87b3c981`, exactly matching the
  optimized evidence, so no irrelevant reprofile was run. No dependency or packaging contract
  changed, and the plan schedules the broad phase matrix, packed consumer, supply-chain, and live
  browser gates only after the developer gate, so they were not duplicated here. The frozen
  reference remains clean at `043d3b2e9`. The required matched Phase 5 comparison, explicit
  developer acceptance, accepted baseline refresh, and post-acceptance gates remain incomplete;
  this audit makes no visual-approval claim and does not start the next phase.
- Phase 5 wheel-ownership correction implementation complete (2026-08-12): the remaining control
  surface carried two `nowheel` scopes broader than the behavior they protected. Dropzone has no
  wheel interaction, so its root and drop target now leave wheel panning to the canvas while
  retaining their no-drag/no-pan ownership. Rotary keeps `nowheel` only on its enabled 40 px knob,
  where wheel input adjusts the value; its wrapper, value-side whitespace, and disabled knob now
  return wheel input to the canvas. This matches frozen main's inert surrounding surfaces while
  retaining the package's explicit wheel owner where React's delegated passive wheel listener
  cannot itself protect the canvas gesture. The canvas regression additionally proves that a
  blocked `nowheel` event does not arm a false pan burst that contaminates the next pane wheel
  gesture, and control regressions freeze both scopes. The three directly affected files pass 34
  focused tests, and the changed-file static gate passes. No dependency or packaging contract
  changed, so the supply-chain and packed-consumer gates were not duplicated. The required matched
  Phase 5 comparison, developer acceptance, accepted baseline refresh, and post-acceptance gates
  remain incomplete; this correction makes no visual-approval claim.
- Phase 5 wheel-ownership correction audit repository work complete (2026-08-12): the audit kept
  the requested `ad6173062f8dbdcf1c6f8ffd21ce2dc635f179da..fe78a17b9afe1dba9f9b4e44f695796c799aa3f7`
  range narrow because its base already records the complete Phase 5 coherence audit. Frozen-main
  source confirms that Dropzone owns no wheel gesture and that Rotary owns wheel input only on its
  knob; one bounded marker pass confirms that the package now retains `nowheel` only on actual
  scroll or rotary-wheel owners in the affected control/item surfaces. No runtime defect was
  found. The audit corrected one verification-only gap: the canvas regression previously checked
  only transforms, which could not prove its claim that a blocked `nowheel` event left no false pan
  burst armed. It now directly freezes interaction-active state and default-prevention ownership
  across pan start, timeout, blocked control wheel, and the next pane wheel. The complete package
  suite passes (91 files, 661 tests), as does the final explicit-file static gate. No dependency or
  packaging contract changed, so supply-chain and packed-consumer gates were not duplicated; the
  plan schedules their final phase runs after developer acceptance. The required matched Phase 5
  comparison, explicit developer acceptance, accepted baseline refresh, and post-acceptance gates
  remain incomplete, so this audit does not start another phase.
- Phase 5 persistent browser-history gesture correction accepted (2026-08-12): the developer's
  live retest exposed a browser-level failure that the preceding synthetic audit did not model.
  A structured trusted-event trace proved that the first wheel event over Rotary was cancelable
  but left uncanceled; Chrome then made the rest of that trackpad gesture non-cancelable. On the
  next horizontal gesture over the empty pane, the package wheel handler ran, canceled the event,
  and moved the canvas from x=-870 to x=-869, yet Chrome still issued `beforeunload` 119 ms later
  and navigated Back because the earlier control gesture had armed browser history navigation.
  The interaction seam now distinguishes browser-native wheel owners (`NO_WHEEL_CLASS_NAME`) from
  manually handled controls (`MANUAL_WHEEL_CLASS_NAME`). The non-passive canvas listener
  synchronously prevents the browser default for the latter without stopping propagation, so
  Rotary's React handler still changes its value while Chrome cannot latch Back/Forward; manual
  ownership wins even when a canvas pan burst was already active. Focused regressions freeze the
  filter, native-versus-manual default-prevention contract, continuation behavior, and enabled/
  disabled rotary markers. The developer repeated the failing rotary-then-pane sequence live and
  accepted the correction. All temporary structured logging and navigation persistence were then
  removed. The complete package suite passes (91 files, 662 tests), the playground suite passes
  (5 files, 28 tests), the production package build and source/compiled boundary pass, and the
  exact packed unrelated-consumer install/typecheck/build passes. No dependency changed, so the
  supply-chain gate was not duplicated. The broader Phase 5 developer comparison and final
  post-acceptance gates remain at their existing gate.
- Phase 5 developer gate complete and next milestone authorized (2026-08-12): the developer
  explicitly approved Phase 5 after the matched live package/reference presentation and the
  accepted rotary-history correction. This authorizes the Phase 5 package-output baseline refresh
  and the scheduled broad quality, supply-chain, packed-consumer, and browser gates. In the same
  supervised discussion, the developer identified context menus and left/right side panes as
  missing batteries-included library features, selected a built-in outline for the left pane, and
  approved a selection-aware right inspector that owns item names, values, UI types, and
  type-specific configuration through an opinionated package schema. The authorized amendment is
  specified after Phase 5. Phase 5's post-acceptance evidence and broad gates complete before that
  milestone begins; the extraction plan is no longer complete at the end of Phase 5.
- Phase 5 accepted-output baseline and post-acceptance gates complete (2026-08-12): the approved
  package output is locked under `docs/evidence/phase5/` with fresh production desktop dark/light,
  compact 320 px dark/light, and effective 200%-scale CSS-viewport captures, machine-readable
  geometry, appearance, artifact and screenshot hashes, plus trusted keyboard and wheel traces.
  The production browser gate found no page overflow, dialog, URL drift, or console warning/error;
  it rechecked title Escape focus restoration, item-column keyboard resize/reset, minimap keyboard
  navigation, Rotary value ownership, and the corrected following-pane horizontal wheel path. The
  fresh package build/built boundary, playground build, complete package suite (91 files, 662
  tests), complete playground suite (5 files, 28 tests), all-files static quality gate, supply-chain
  gate (601 locked versions), and exact packed unrelated-consumer proof pass. The Phase 5
  performance profile was not duplicated because its target-input hash still matches the optimized
  evidence. This closes Phase 5 repository work and makes the workspace-shell evidence and
  ownership preflight the next repository-actionable milestone, after the required phase audit.
- Phase 5 post-acceptance phase audit complete (2026-08-12): Agent 2 reviewed the accepted-output
  commit and its Phase 5 implementation history as one coherent change, found no remaining defect,
  left the clean worktree unchanged, and returned `PLAN_PHASE_AUDIT_COMPLETE`. The workspace-shell
  evidence and ownership preflight is now the earliest repository-actionable work; do not request
  another Phase 5 audit.
- Workspace-shell ownership preflight complete; evidence-contract blocker recorded (2026-08-12):
  the complete shell/pane, Overview, UI Editor, context-menu, and canvas-geometry source cone and
  every state read are classified in `docs/evidence/workspace-shell/reference/ownership-map.md`.
  Frozen-source inspection plus the accepted Phase 0 captures establish that several states the
  amendment requires before implementation do not exist at `043d3b2e9`: Overview is an
  always-expanded flat indented list with no selected-row state, disclosure, ARIA tree, roving
  focus, or arrow navigation; UI Editor has no one-selected-item branch and reduces multi-section
  selection to its generic no-sole-section placeholder; and workspace menus have no Menu-key or
  Shift+F10 invocation. `docs/evidence/workspace-shell/reference/README.md` separates the missing
  but producible supervised captures from these source-proven gaps. Because running main is product
  authority and the full reference evidence is a pre-implementation gate, no workspace-shell
  implementation batch may begin until the developer explicitly amends the evidence/behavior
  authority or re-baselines the reference. No package source, fixture, dependency, or baseline
  changed in this preflight.
- Workspace-shell authority gap resolved (2026-08-12): the developer's explicit authorization of
  this amendment already authorizes the Outline's disclosure/selection/tree-keyboard behavior, the
  selection-aware item and multi-section Inspector branches, and keyboard context-menu invocation
  as new, opinionated package behavior. Frozen main remains authoritative for the surrounding pane,
  menu, Overview, and UI Editor paint and for every behavior it actually implements; it is not an
  executable reference for states proven absent at `043d3b2e9`. For those states, this milestone's
  typed behavior and accessibility contracts are the implementation target, and the combined final
  developer gate remains the only visual/interaction approval. The source-proven absence is
  evidence, not a blocker, and no reference re-baseline is required. Remaining producible main
  captures may be gathered by the supervised implementation loop before their corresponding
  user-visible batch; they do not prevent the typed-item-schema batch from starting.
- Workspace-shell typed-item batch complete (2026-08-12): ordinary package rows now use one exact,
  serializable discriminated presentation for explicit groups and the full accepted text, code,
  textarea, switch, dropdown, color, slider, rotary, password, date, time, and dropzone set. Load
  and mutation boundaries validate discriminants, exact type-specific configuration, structural
  root ownership, and typed-versus-opaque exclusivity. Package rows render their editable label and
  built-in control without a host decoder, while custom opaque rows retain the explicit renderer
  extension. Label, value, complete presentation, and kind-tagged configuration edits each publish
  once; non-serializable dropzone and saved-password actions use the explicit stable-item handler
  registry. The playground and packed unrelated consumer were directly migrated with no alias,
  dual decoder, migration, or fallback. Focused package schema/data/registry/list/public-API tests
  pass (31 tests), as does the focused playground control workflow (16 tests), package and
  playground production builds, the source/compiled package boundary, and the exact packed
  unrelated-consumer install/typecheck/build. No dependency changed, so the supply-chain gate is
  not duplicated. This completes implementation batch 1; the producible shell/pane reference
  captures precede batch 2, and the milestone's combined developer visual/interaction gate remains
  later.
- Workspace-shell pane batch complete (2026-08-12): the frozen pane/rail reference bundle now
  indexes 18 dark/light desktop and narrow captures plus machine-readable geometry, paint,
  transition, overflow, resize-target, focus, paired-pane, full-width/restore, and viewport-
  normalization facts. The public controlled `WorkspaceShell` composes the actual canvas center,
  accepted controls and tooltip, logical leading/trailing landmarks, 40 px rails, and the two
  reference-painted pane surfaces. Its serializable view state owns selected tab, visibility,
  current width, and remembered non-full width independently of `WorkspaceDocument`; the ported
  pure layout functions preserve the reference clamps, opposite-pane negotiation, full-width
  memory, and container-resize behavior without reading `window` or application stores. Typed host
  tabs receive public render props only. Roving vertical tablists, Arrow/Home/End operation,
  focus-on-open/return-on-close, keyboard and pointer separators, RTL geometry, reduced-motion-
  bounded transforms, and the explicit leading-pane camera option complete the authorized
  accessibility/adaptivity additions. The playground and packed unrelated consumer now use only
  public exports to demonstrate host tabs and controlled shell state; the performance-profile route
  deliberately retains standalone `WorkspaceCanvas` composition. Focused shell/layout/style/public-
  API coverage passes (22 tests), as do the focused host adaptivity/scrollbar workflow (6 tests),
  changed-file quality, package and playground production builds, the built package boundary, and
  the exact packed unrelated-consumer install/typecheck/build. Live Chrome checks in both
  appearances at 1492 x 696, 800 x 772, and compact 320 x 800 exercised paired panes, the exact
  335-to-401 px pointer resize, roving focus, keyboard resize, close restoration, full-width
  normalization, and opposite-pane closure with no page-level horizontal overflow. No dependency
  changed, so the supply-chain gate is not duplicated. This completes implementation batch 2; the
  producible Overview capture precedes batch 3, and the combined milestone developer gate remains
  later.
- Workspace-shell Outline batch complete (2026-08-12): the frozen-reference preflight now indexes
  the already-accepted nested dark/light Overview captures and adds fresh computed row geometry,
  typography, appearance, focus, and source-boundary facts plus real pointer/Space activation
  traces from the clean pinned application. `WorkspaceShell` prepends the package-owned Outline to
  host leading-tab extensions, while controlled serializable shell state owns collapsed group ids
  and the single roving focus id independently of `WorkspaceDocument`. The projection follows
  top-level and recursive child arrays in canonical document order and renders registered kind
  icons, tag/style cues, locked/minimized cues, selected rows, and the ARIA tree/treeitem/group
  pattern without interactive descendants inside a treeitem. Pointer and Enter/Space activation
  combine the existing section-selection policy, including explicit Cmd/Ctrl multi-selection,
  with the new public selection-preserving `focusWorkspaceSection` command for fitting the mounted
  section.
  Arrow Up/Down, Home/End, Left/Right disclosure and parent/child movement, cyclic name typeahead,
  one tab stop, visible focus, forced-colors paint, reduced-motion-bounded disclosure, logical RTL
  indentation, and deterministic rename/delete/collapse focus restoration complete the authorized
  accessibility behavior. The playground and packed unrelated consumer now open the built-in
  Outline by default while retaining host tab extensions. Focused model/component/shell/selection/
  viewport/style/public-API coverage passes (57 tests); a stale compiled-grid fixture found by the
  authorized package run was corrected to stop placing opaque row data on the typed schema's
  structural root, and its four focused tests pass. Changed-file quality, package and playground
  production builds, the source/compiled boundary, and the exact packed unrelated-consumer
  install/typecheck/build pass. Live Chrome checks in dark/light at 1492 x 696 and light at a 320 x
  800 host exercised pointer selection and camera fitting, collapse/expand, child navigation,
  typeahead, Space activation, one-tab-stop retention, deep-label truncation, and zero page-level
  horizontal overflow with no console warnings or errors. No dependency changed, so the
  supply-chain gate is not duplicated. This completes implementation batch 3; the producible UI
  Editor reference capture precedes batch 4, and no package-output baseline or developer visual
  approval is claimed before the combined milestone gate.
- Workspace-shell Inspector capture endpoint correction (2026-08-12): a loop iteration incorrectly
  treated unrelated ports `3000` and `5173` as the frozen Setta service and stopped after those URLs
  failed. The already-running pinned reference remains healthy at `http://127.0.0.1:3063/` (including
  `/settings`) with its backend on `8063`; both processes and the clean `043d3b2e9` worktree were
  verified by the supervising agent. This was not a developer gate. Inspector reference capture and
  batch 4 remain repository-actionable, and future capture iterations must use the recorded service
  endpoints rather than infer ports from unrelated processes.
- Workspace-shell Inspector batch complete (2026-08-12): the frozen `/settings` UI Editor evidence
  now indexes six original-pixel dark/light desktop captures for no selection, the stable `backend`
  Section tab, and its Params configuration presentation, together with screenshot hashes, exact
  pane/empty-state/label/control metrics, real-pointer state traces, and the executable-reference
  versus authorized-selection boundary. The frozen `gui` configuration's existing
  `ColorPickerInput.tsx` undefined-choices failure is recorded once; the stable section supplies the
  required evidence without treating that product defect as package behavior or a waived gate.
  `WorkspaceShell` now prepends the package-owned Inspector to trailing host tabs and defaults its
  serializable trailing tab id accordingly. Its canonical selection model renders the captured
  empty state; one-section identity, name, accent, lock/minimize, authored/resolved size, and group
  orientation fields; one typed item's editable label/value, ordinary UI type, and exact
  type-specific configuration; explicit multiple-item guidance; host contributions for read-only
  custom section/item contexts; and capability-gated mixed/multi-section lock, group, and delete.
  Inline validation, field Escape restoration, last-meaningful focus, and one persistent polite
  selection/mutation status stay inside the pane. New canonical funnels normalize/reproject style
  accents atomically and batch lock, subtree delete, and same-parent grouping through one host
  notification; grouping preserves sibling order and atomically publishes document, nodes, and
  selection. The integrated Inspector's reused controls opt out of canvas-row suppression locally,
  so item-selection mode remains active and multi-selection reachable while Inspector label/value
  editing stays enabled. The playground and packed unrelated consumer demonstrate the built-in tab
  and typed host contributions through public exports only. Focused package Inspector/mutation/
  registry/shell/control/RTL-style coverage passes (85 tests, plus 10 direct item-select control
  regressions), as does focused playground coverage (20 tests), changed-file quality, package and
  playground production builds, the source/compiled boundary, and the exact packed unrelated-
  consumer install/typecheck/build. Live Chrome checks in dark/light at 1492 x 696 exercised
  section accent/lock and locked-size behavior, typed-item UI-type and decimal-configuration edits
  while item-select mode remained active, and mixed multi-section state; the light 320 x 696 host
  retained the full Inspector workflow at exactly 320 px document width with no page overflow. No
  dependency changed, so the supply-chain gate is not duplicated. This completes implementation
  batch 4; context-menu evidence and batch 5 are next, and no package-output baseline or developer
  visual approval is claimed before the combined milestone gate.
- Workspace-shell context-menu batch and milestone repository work complete (2026-08-13): the
  frozen `/settings` menu evidence now indexes ten original-pixel dark/light captures for all four
  viewport-edge placements and the filtered state, with screenshot hashes, exact geometry/type/
  paint metrics, pointer/filter/keyboard/creation traces, and an explicit source characterization
  of the shared selection menu where the deterministic bridge could not produce its prerequisite
  marquee. The canvas mounts one package-owned scoped Radix menu layer for standalone and shell
  composition. Its public replace-all creation/action registries expose typed factories plus pane,
  section, item, and Outline action contexts as deeply frozen snapshots. Pointer and Context Menu/
  Shift+F10 ownership now spans the bare pane, direct sections, the multi-selection rectangle,
  item rows, and Outline rows while inputs, editors, buttons, links, and explicit no-drag surfaces
  retain their native menus. The pane menu ports the searchable grouped filter and post-navigation
  edit rules, converts through the actual canvas rectangle and viewport, and validates/resolves/
  inserts/selects the returned section through one atomic document notification. Section menus
  reuse the existing capability gates and Group/Delete/Lock-or-Unlock mutation funnels, including
  the mixed-lock target; Radix supplies semantic menu navigation while the package owns measured
  edge placement, compact paint inside non-overlapping 24 px item targets, appearance scoping,
  local RTL direction preservation, outside/Escape dismissal, and invocation-owner focus
  restoration. The playground and packed
  unrelated consumer demonstrate backend-free creation and all four host action scopes through
  public exports only. The retained menu primitive is exact-pinned at
  `@radix-ui/react-dropdown-menu 2.1.15`: frozen main's `2.1.2` resolves a
  `react-remove-scroll 2.6.0` peer range that excludes React 19, while this patch resolves the
  compatible `2.7.2` graph. The whole-milestone coherence pass found and updated every affected
  shortcut/public-surface assumption, confirmed the menu layer composes with both shell and
  standalone canvas ownership, and found no duplicate document, selection, capability, pan,
  wheel, or drag state; a validated host document replacement also releases the outgoing immutable
  menu snapshot without restoring focus into replaced content. Focused package coverage passes (16
  files, 122 tests), as do changed-file
  quality, package and playground production builds, the source/compiled boundary, the dependency
  and supply-chain gate (611 locked versions), and the exact packed unrelated-consumer install/
  typecheck/build. Live package checks at 1492 x 696 match the captured 160 px core geometry and
  recorded light/dark palette, exercise filtering, creation, disabled structure actions, every
  host action scope, Escape and outside dismissal, and focus return; the 320 x 696 check resolves a
  128 px menu wholly inside the viewport with exactly 320 px document width and a fresh console
  free of warnings/errors. This completes implementation batch 5 and all repository-actionable
  work before the combined milestone developer gate. No package-output baseline or developer
  visual/interaction approval is claimed; the committed milestone awaits the required Agent 2
  audit before presentation to the developer.
- Workspace-shell coherence audit complete; combined developer gate pending (2026-08-13): the
  auditor reviewed `ea1577a06..81435762d` as the coherent authority-resolution-through-context-menu
  milestone, expanding the requested minimum `82e7e47b6..81435762d` range only to the earlier
  commits that implement the same milestone. Five behavior defects were corrected: top-level
  grouping now replaces the first selected sibling instead of appending the group after later
  siblings; pane resize publishes the final pointer-release sample instead of a potentially stale
  rendered preview; ordinary section-menu dismissal preserves valid multi-selection geometry while
  Group/Delete explicitly clear geometry they invalidate; typed Inspector contributions receive
  deeply frozen clones rather than shallow-readonly live canonical objects; and an item with no
  registered item action retains its native menu without leaking the event to the enclosing section
  menu. The reference index now also distinguishes the pane bundle's valid historical port-3000
  provenance from the current fixed-port service. The five directly affected package suites pass
  (60 tests), as does changed-file quality; no dependency changed. The plan-ordered final broad
  package, supply-chain, consumer, and browser gates are intentionally not run before developer
  acceptance. No package-output baseline or developer approval is claimed: matched dark/light,
  desktop, 200%, and 320 px evidence plus the specified interaction exercise must now be presented
  for explicit developer acceptance before those post-acceptance gates may run.

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
- canvas-level meta controls (chosen and authorized 2026-08-12; specified below);
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
- Controls carry the package's existing no-drag/no-pan interaction boundaries so editing never
  starts a section or item drag. Only a surface with actual wheel behavior carries the no-wheel
  boundary; inert control space remains available to canvas wheel panning. The Phase 4 item
  selection and dnd contracts are unchanged.

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
- slider, rotary, password, dropzone, date/time, and multiline-text configurations — deferred from
  this initial slice into the authorized remaining-controls continuation below; Button is absent
  from ordinary parameter rows in frozen main and belongs only to the meta-controls continuation;
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

**Deferred portion of the consolidated exit gate:** the unrelated playground example replaces its
display-only value role with the built-in controls, driven only by its opaque item data through the
new seams. Per the developer's 2026-08-12 authorization, do not request acceptance for this initial
slice by itself. Compare and request explicit developer acceptance only after the remaining-control
types and meta controls below are also implemented. No baseline may ratify this still-unaccepted
output.

### Remaining-controls milestone — complete parameter UI set

This continuation was explicitly authorized on 2026-08-12. It completes the backend-free,
batteries-included control set demonstrated by frozen main without importing its parameter models,
stores, generated clients, artifact types, or persistence. Reuse the controlled string seam and
interaction boundaries of the initial item-controls milestone wherever a scalar value is involved;
configuration enters through explicit package props and remains host-owned.

#### Remaining control slice (exact)

1. **Slider** — the reference `SliderInput`: a Radix slider plus editable numeric field for ordinary
   rows, with finite-number parsing, min/max clamping, step snapping, gesture changes, end-of-gesture
   commit cadence, keyboard operation, disabledness, and Escape focus restoration. Configuration is
   the host-supplied `min`, `max`, and `step`; the package does not extract the config editor.
2. **Rotary** — the reference `RotaryInput`: the -135° through 135° knob, numeric display, clamped
   parsing, step-aware rounding, pointer capture, wheel adjustment, arrow-key adjustment, disabled
   treatment, and Escape focus restoration. Invalid `min`/`max`/`step` combinations fail explicitly
   at the public boundary rather than selecting defaults heuristically.
3. **Password** — the reference password input and show/hide button, including host-supplied
   placeholder/disabledness and the no-drag/no-pan editing boundary. The package owns no secret
   store, reveal API, saved-secret sentinel, or credential persistence; a host that needs a pending
   or saved-secret display provides that controlled state explicitly.
4. **Multiline text / text area** — the existing `TextValueEditor` configured with the reference's
   wrapped multiline behavior and minimum-height presentation. `CodeParam` and `TextParam` continue
   to use the existing language-enabled editor; no second editor implementation is added.
5. **Date** — the reference text/date control in both native-input and calendar modes, including ISO
   and configured display formats, single/multiple selection, Sunday/Monday week starts, optional
   time inclusion, keyboard/focus behavior, and the live calendar grid demonstrated by main.
6. **Time** — the reference time control in input and formatted-display modes, including 12/24-hour
   format, transparent display, bounded scale, monospace/sans display font, and controlled string
   updates.
7. **Dropzone** — the reference presentation and local drag/drop/file-picker interactions with
   explicit host seams for accepted local files, dropped text, server-file picker requests,
   attachment display/removal, pending/error state, MIME/size/count policy, and stateless results.
   The package must not upload, persist, delete, or interpret Setta artifacts. A server picker is
   rendered only when its explicit callback is supplied; attachment identities and byte payloads
   remain host-owned.

`NestedParam` is structural and already owned by Phase 4 rather than a value control. `ButtonParam`
is intentionally absent from ordinary rows because frozen main dispatches it only as a meta
control. The completed switch, color, dropdown, text, code, and name controls are reused, not
reimplemented.

#### Verification and batches

The pre-implementation reference is indexed under
`docs/evidence/remaining-controls-and-meta/`. Land coherent vertical batches in this order unless a
smaller dependency-safe split is required: slider plus rotary; password plus multiline text;
date plus time; dropzone. Each batch ports the reference's algorithmic tests where available, adds
keyboard/pointer/disabled/accessibility coverage, integrates the playground through opaque item
data, runs the changed-file gate, and commits before the next batch. Dependency additions use exact
pins and rerun the supply-chain gate. Do not stop for developer acceptance between batches; agent 2
still performs its normal static/coherence audit.

### Meta-controls milestone — controls directly on the canvas

This milestone was explicitly authorized on 2026-08-12 after the developer identified frozen
main's meta controls as the next milestone. Extract the reusable `MetaControlNode` presentation: a
top-level, draggable/resizable canvas node whose content is one enlarged built-in control rather
than section chrome or an item list.

#### Surface and supported controls

- Reproduce the reference's transparent/headerless outer surface, optional small uppercase title,
  full-available-area control layout, hover edit/menu affordance, selected/drag/resize treatment,
  and control-specific minimum size. Default control content is 202 x 46 CSS px; text area is at
  least 202 x 100 and dropzone at least 242 x 122, subject to the reference container math captured
  in evidence.
- Compose the already extracted controls rather than forking their logic. Supported meta controls
  are Button, Code/Text, TextArea, Date, Time, Slider, Rotary, Switch, Color, Dropdown, Password,
  and Dropzone — exactly frozen main's meta-control dispatch; `NestedParam` is excluded.
- Button is a controlled visual action only: label, disabled/pending state, and `onAction` are host
  inputs. Do not extract HTTP requests, Setta API presets, backend execution, or action persistence.
- Meta-control configuration and value/action persistence remain host-owned. Use explicit renderer
  data or package control props without adding Setta type names to the workspace document. Unknown
  control kinds fail specifically; there is no generic visual fallback.
- Control interaction owns pointer, keyboard, and file gestures inside the content, plus wheel
  gestures on the smallest surface that implements wheel behavior; controls without wheel behavior
  leave wheel input to the canvas. The remaining surface owns section drag. Resizing respects each
  control's minimum and package canvas zoom. The meta node participates in normal selection,
  z-order, lock, document change callbacks, fit view, minimap, and light/dark appearance without
  inventing a second canvas path.

#### Verification and batches

Implement the package-owned meta surface first with representative text/button content and exact
geometry; then wire the complete control dispatch and playground fixture; then audit drag versus
control ownership, resize/min-size behavior, keyboard/focus restoration, dark/light styles, and
packed-consumer exports. Use the frozen source under
`frontend/src/components/Section/Layouts/MetaControl/`, the creation presets in
`state/actions/sections/createSectionsHelper.ts`, and the supervised evidence bundle. No
developer-acceptance stop is required between these batches.

### Consolidated controls and meta-controls exit gate

Only after the initial controls, every remaining control type, and meta controls are implemented and
agent-audited, present one matched live comparison to the developer. The evidence must show ordinary
rows and direct-on-canvas meta controls in dark and light appearance at the same viewport, DPR,
workspace zoom, configuration, and interaction states as frozen main; exercise keyboard, pointer,
editing, resize/drag ownership, calendar/time, and backend-free dropzone/button host seams. The
unrelated playground must import only public package exports and supply opaque host data/callbacks.

The developer must explicitly accept the combined visual and interaction result. Only then record
package-output baselines and allow Phase 5 to begin. The 2026-08-12 deferral authorizes uninterrupted
implementation; it does not authorize an agent or test suite to approve the final result.

### Phase 5 — extension surface and hardening

Only after the visible product is accepted:

- make parameter/item-column resizing package-owned. This 2026-08-12 developer decision
  supersedes the earlier application-side deferral: every `WorkspaceItemList` row exposes the
  frozen reference's shared center divider with its compact visible paint and larger drag target;
  dragging any divider updates the whole section at canvas-correct zoom, clamps the split for the
  deepest nested item and a 100 px minimum value column, and double-click resets it to the default
  half-width split. Persist the authored split as package document state in item terminology and
  publish it through the normal document-change callback; default derivation, live container-resize
  behavior, and drag/reset commits remain backend-free, with no application store or persistence
  adapter required. Port the reference algorithms and focused tests before the final matched live
  comparison;
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

### Workspace-shell milestone — context menus, side panes, outline, and inspector

This plan amendment was explicitly authorized by the developer on 2026-08-12 after Phase 5 visual
acceptance. It is the next narrow extraction milestone, not a reopening of Phase 5. Complete the
accepted Phase 5 baseline refresh and post-acceptance broad gates before implementation. Frozen main
at `043d3b2e9` remains the product authority for pane geometry, pointer context-menu behavior, and
the reusable Overview/UI Editor presentation it actually implements. The developer-authorized
Outline disclosure/selection/tree-keyboard behavior, selection-aware item and multi-section
Inspector branches, and Menu-key/Shift+F10 invocation are deliberately new package behavior because
the frozen reference has no such states. Their authority is this milestone's explicit contracts,
with visual and interaction quality decided only at the combined developer exit gate; agents must
not fabricate matching-main evidence for them or treat their absence in main as a blocker.

The milestone makes the standalone package meaningfully batteries included while preserving a
backend-free boundary. It extracts reusable workspace chrome and state only. Main's file browser,
Git surfaces, plugins, chat, notifications, project/backend settings, view modes, variants, workflow
edges, generated code, type-error remediation, and persistence transports remain application-owned
and must not enter the package.

#### Evidence and ownership preflight

Before each corresponding user-visible shell/menu batch, capture and index the following available
matched dark/light reference states. The source/ownership map must precede all implementation, but
the typed-item-schema batch may begin while the remaining producible live captures are gathered:

- the canvas pointer menu opened near every viewport edge, its search/filter and keyboard paths,
  and creation at the pointer's workspace coordinate;
- the section and multi-selection menu in mixed locked/unlocked states, including disabled actions;
- the left and right rails and panes closed, open, resized, full-width, restored, simultaneously
  open, and constrained at the narrow breakpoint;
- the Overview nested-section presentation and pointer/Space activation that main implements, plus
  source evidence that selected rows, disclosure, ARIA tree semantics, and tree keyboard navigation
  are absent; and
- the UI Editor's reusable no-selection, one-section, and parameter-UI configuration presentation,
  plus source evidence that one-selected-item and planned multi-selection branches are absent.

Record computed geometry, type, color, focus, overflow, stacking, and transition facts plus short
interaction traces. Classify every main state read before porting it. Existing frozen-main services
and deterministic browser automation may be used under root supervision; this capture does not
require a separate developer approval. Evidence goes under `docs/evidence/workspace-shell/reference/`;
no package-output baseline precedes the combined developer acceptance.

#### Package-owned shell and panes

Add one package-owned workspace shell that composes the canvas, the accepted controls/tooltip, two
edge icon rails, and optional left/right pane contents without exposing XYFlow panels or private DOM
selectors. The shell owns:

- the frozen pane paint, 40 px closed rails, seam borders, z-order, resize handles, open/close
  transitions, full-width/restore action, and focus-visible treatment;
- semantic leading/trailing `aside` landmarks in DOM reading order, named tablists with roving
  tab stops and Arrow/Home/End operation, and compact reference paint inside non-overlapping
  package-owned hit geometry; opening moves focus to the selected tab or requested pane control,
  while closing returns it to the invoking rail tab;
- controlled serializable view state for each pane's selected tab, visibility, current width, and
  remembered non-full width, with one explicit change callback so a host may persist it; pane state
  is view state and never enters `WorkspaceDocument`;
- the reference width clamps, paired-pane negotiation, opposite-pane close/shrink rules, viewport
  resize normalization, narrow layout, and reduced-motion behavior;
- logical inline placement and rail order under RTL, no page-level horizontal scrolling at 200%
  zoom or a 320 px host, and only transform/opacity transitions under the no-preference motion
  query rather than an unbounded `transition: all`;
- canvas/minimap/fit/auto-pan geometry derived from the actual shell center and visible rails, with
  any reference camera-shift option exposed explicitly rather than reading application settings;
- package-owned default tabs for Outline on the left and Inspector on the right; and
- typed registration of additional host tabs with host-rendered content and icons. Registered host
  tabs use public props only and cannot receive package stores or private class names.

Do not export a generic low-level pane primitive as a substitute for the integrated behavior. The
public surface is the composed shell plus typed tab registration/state. Hosts may still mount
`WorkspaceCanvas` independently when they intentionally do not want the shell.

#### Built-in outline

The left Outline tab is a package-owned projection of the canonical workspace document. It shows
top-level sections and recursive group children in document order, using registered kind icons and
the accepted compact main typography. It owns:

- disclosure state for groups, active/single/multi-selection presentation, locked/minimized state,
  and style/tag color cues that are never the sole state signal;
- pointer selection through the existing selection policy, keyboard tree navigation with one
  roving tab stop, Home/End and Left/Right expand/collapse semantics, typeahead by section name, and
  deterministic focus restoration after rename/delete;
- an activate/focus command that centers the section through public viewport helpers without
  changing canonical selection unexpectedly; and
- shared structural context-menu actions and capability-disabled states.

Outline expansion and keyboard focus are shell view state, not document state. This milestone does
not add outline drag-and-drop, tags/filtering, next/previous saved views, a file tree, or plugin
navigation; those require separate evidence and approval.

The outline uses the ARIA tree/treeitem/group pattern without duplicating interactive descendants
inside a treeitem. Disclosure and selection are announced separately, icons are decorative, and
focus remains visible in light, dark, style-colored, high-zoom, and keyboard-only states.

#### Opinionated item-control schema and built-in rows

Replace the playground-only convention that decodes `WorkspaceItem.data.control` and adjacent
untyped fields. Add a package-owned, serializable discriminated item-presentation schema covering:

- explicit group presentation with an editable label; and
- the complete accepted ordinary control set: text/code, multiline text, switch, dropdown, color,
  slider, rotary, password, date, time, and dropzone, with a controlled string value and the
  validated type-specific options already accepted for those controls.

Custom registered item renderers and opaque `data` remain a deliberate extension point, but a typed
built-in item never requires a host renderer. There is one canonical mutation funnel each for item
label, value, presentation kind, and control configuration; every accepted edit publishes exactly
once through the existing document-change callback. Invalid discriminants or option combinations
fail specifically at load/mutation boundaries. Migrating existing playground and packed-consumer
fixtures is a direct schema replacement: add no alias, dual decoder, migration, or fallback.

Non-serializable behavior stays behind explicit host handler registration keyed by stable item id:
dropzone acceptance/rejection, server-file selection, attachment removal, and saved-password actions.
The schema stores only serializable presentation/value/configuration state. It does not introduce
Python parameter types, validation services, uploads, secrets, backend identifiers, or persistence.

#### Built-in selection inspector

The right Inspector tab changes with canonical selection:

- with no selection, render the reference empty state and preserve the last meaningful tab/focus;
- for one section, edit the package-owned name, style accent, lock/minimize state, resolved size and
  auto-size values, and group orientation; show kind as identity rather than pretending it can be
  changed safely;
- for one selected typed item, edit its label and value, choose among the ordinary UI types, and
  edit only that type's valid configuration (for example slider min/max/step, dropdown choices,
  CodeMirror language/autocomplete policy, date/time mode and format, or color choices);
- for a custom registered kind or item, render a typed host inspector contribution if registered,
  otherwise show the package's explicit unsupported-custom-content state; and
- for multiple selected sections, expose only capability-valid common actions: lock/unlock, delete,
  and group. Mixed values use an explicit mixed state and never a guessed fallback.

The inspector reuses the accepted built-in controls and package item/section mutation funnels. It
must not duplicate control implementations, write opaque host data heuristically, or import main's
SectionConfig/UIConfig stores. Every field has a programmatic label, keyboard operation, Escape
focus restoration, and an error surface that remains inside the pane without clipping a portal;
invalid fields use `aria-invalid`/`aria-describedby`, and a persistent polite status region
announces accepted selection/configuration changes without stealing focus.

#### Context menus

Mount package-owned menus with the shell/canvas rather than requiring each host to reconstruct
pointer ownership. Extract main's reusable menu core and two workspace surfaces:

- the pane menu is a searchable grouped list of registered creation commands, opens from pointer or
  keyboard, converts the invocation point through the package viewport, and passes that workspace
  position to a typed host section factory before one package-owned insertion commit; and
- the section/multi-selection menu supplies Group, Delete, and Lock/Unlock from existing package
  capabilities and mutation funnels. Visibility/view-mode and type-error actions remain excluded.

Hosts may register additional typed menu actions for pane, section, item, and outline scopes. Each
action receives a public immutable context and invokes a host callback; it cannot receive internal
stores or selectors. The package owns viewport-edge placement, portal appearance scoping, outside
dismissal, Escape/focus restoration, arrow/Home/End/typeahead behavior, disabled semantics, and the
Menu-key/Shift+F10 path. Right-clicking interactive controls retains their native/editor behavior;
section drag, item drag, pan, wheel, and menu ownership must remain mutually stable.

Menus use the semantic menu/menuitem pattern (or the equivalent behavior supplied by the retained
Radix primitive), expose visible focus, keep the compact main paint while meeting the package's
non-overlapping pointer-target floor, and restore focus to the pointer/keyboard invocation owner.

#### Implementation batches and verification

Land this milestone as coherent reviewable batches after the reference evidence:

1. typed item schema, built-in row renderer, mutation funnels, and direct fixture migration;
2. shell state/layout algorithms and the two pane/rail surfaces with host-tab registration;
3. built-in Outline projection and navigation;
4. selection Inspector and type-specific configuration editors; and
5. context-menu core, creation/action registries, canvas/outline integration, and a whole-milestone
   coherence audit.

Each batch ports reference algorithms/tests where available, adds focused pointer/keyboard/screen-
reader/RTL/reduced-motion/narrow coverage, runs the changed-file static gate, and commits cleanly.
Dependency changes use exact pins and rerun the supply-chain gate. Do not stop for visual acceptance
between batches; present one combined gate only after the complete milestone and agent audit.

#### Combined exit gate

The unrelated playground and packed consumer must use only public exports to demonstrate the shell,
both built-in tabs, custom pane/inspector/menu extensions, typed item controls, and backend-free
creation handlers. Present matched main/package dark and light evidence at the accepted desktop
viewport plus 200% zoom and a compact 320 px shell. Exercise pointer and keyboard pane
open/close/resize/full-width, outline navigation/selection/focus, inspector edits and UI-type
changes, pane creation, selection actions, drag/pan/wheel ownership, and focus restoration.

The developer must explicitly accept the combined visual and interaction result. Only then record
the package-output baseline, run the final broad package/supply-chain/consumer/browser gates once,
and request the final whole-plan audit. No agent or test suite may waive this gate.

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
- the package-owned shell supplies the accepted left/right pane behavior, a recursive accessible
  outline, and a selection-aware inspector without importing application chrome or backend state;
- canvas and selection context menus provide searchable creation and package structural actions at
  the correct workspace coordinate without breaking drag, pan, wheel, or native editor ownership;
- typed built-in item controls render and configure without a host renderer while custom items and
  inspector/menu/pane tabs remain explicit public extension points;
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
