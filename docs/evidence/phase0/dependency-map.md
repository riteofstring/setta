# Phase 0 — dependency and state map of the workspace slice

Reference: `../setta-main` verified clean on `main` at `043d3b2e9c69caf99d1246f1408b3ad7194b7864`
(2026-08-10). All paths below are relative to `../setta-main/frontend/src` unless prefixed.
This document covers Phase 0 items 1 and 3–5: the import/dependency cone of the leaf, group,
toolbar, minimap, drag, and resize surfaces; the classification of application-owned state reads;
and the exact styling, font, icon, and fork inventory used by the slice. It is read-only analysis;
no donor was adopted and no package code was written from it.

## 1. Anchor cones

### 1.1 Section container (`components/Section/Container/`)

Clean subgraph (no app-only reach, portable as-is):

- `sectionChrome.ts` — pure class-name factory for the section shell and surface. Selection is
  outline-only (`outline-0/2/4`, never border), the visible frame is painted on an absolutely
  positioned `::before` overlay, so neither selection nor border presence shifts layout. Its one
  import (`getOutlineColor` from `Container/utils.tsx:33`) is a pure function.
- `ContainerSwitch.tsx`, `TopLevelContainer.tsx`, `DndSlot.tsx` — store-free or dnd-fork-only.
- Leaves: `utils/sectionStyleColors.ts` (`deriveSectionStyleTheme`, the whole section-style theme
  system) has zero imports; `forks/xyflow/core/contexts/NodeIdContext.tsx` imports only `react`;
  `forks/dnd-kit/dropTypes.ts` imports only the `ObjectValues` type helper from
  `utils/generatedTypes` — a type-only edge into the generated hub that the type seam must
  re-author.

Core components and their reads:

- `ContainerCore.tsx` — merges three ref systems onto one element (positional ref via
  `useSectionRefAndInit`, dnd droppable, dnd draggable) and spreads the drag listeners onto the
  whole surface. Group chrome paints selection with an absolutely positioned sibling layer
  (`ContainerCore.tsx:122,182-190`) — the group-level no-layout-shift mechanism.
- `SectionContainerCore.tsx` — the chrome/selection brain: one `useProjectState` snapshot
  (type, locked, minimized, metaControlStyle, styleColor) plus selection, dark mode, section-style
  preview, and `useReactFlow.viewportInteractionActive` (adds `willChange: transform` hoisting only
  during pan/zoom, `:162-176`). Section-style themes are injected as CSS custom properties
  (`--setta-section-style-*`, `:142-160`) so `sectionChrome.ts` stays store-free. Renders
  `data-section-id/-type/-active` and the active z-index swap `z-[150]`/`z-10`.
- `SectionContainer.tsx` — visibility/view-mode gating and the joined code+terminal branch
  (app-only). Duplicates group outline chrome inline at `:271-287` instead of calling
  `sectionChrome.ts`.
- `SectionContainerCoreResizabe.tsx` — **the heaviest app-only bridge**: 20 section content
  renderers imported from 18 `../Layouts/*` modules, chat windowing (`UnifiedChatSurface`, `state/actions/projectChatWindowing`,
  2,339 lines), section-window placeholders, meta-control menus, and `CustomResizable`. This file is
  where the package renderer seam must land.
- `ContainerWrappers.tsx`, `SortableSectionContainer.tsx`, `ManyNestedSections.tsx` — dnd wiring
  (droppable highlight, sortable transform with zoom compensation, nested child lists with
  temp-section preview via `useDndChildren`).

Hub modules (count = direct importers among the 11 container anchors):

| Hub                                      | Anchors | Why it is heavy                                                                                                            |
| ---------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `components/Section/Container/utils.tsx` | 6       | mixes 2 pure fns (`getBgColor`, `getOutlineColor`) with AI-follow highlighting and `useMisc` click handling                |
| `state/actions/sectionInfos.ts`          | 6       | 2,389-line hub importing `openapi/http`, plugin SDK, chat windowing, terminals; anchors need only ~10 small pure selectors |
| `state/definitions.ts`                   | 6       | 42-store monolith; transitively pulls `plugins/appSubsystem` via `state/utils`                                             |
| `utils/generatedTypes.ts`                | 5       | 5,333 generated lines re-exporting `openapi/non_http/generated/types.gen`; `SectionTypeEnum` alone drags it in             |
| `forks/dnd-kit/dndState.ts`              | 3       | drag session store; imports `state/actions/sectionInfos` for one reset hook                                                |
| `utils/constants.ts`                     | 2+      | supplies `NO_WHEEL_CLASS_NAME`, `NO_PAN_CLASS_NAME`, `SETTA_PREVENT_SECTION_*` interaction-boundary class names            |

### 1.2 Section header (`components/Section/Header/`)

- `SectionHeader.tsx` (1,056 lines) renders predicate-gated groups in fixed order: diagnostics
  (Code/LSP only), type controls (Incrementer for series elements, Run/entry-code for runnable,
  attached-terminal for code, display-mode for TextBlock), chat follow (Chat only), then container
  controls (`LockPositionButton` + `DeleteOrHideButton`, `MinimizeButton` when not root). Controls
  are **not** hover-gated; the one hover-reveal is the TextBlock meta-control `MenuButton`
  (`opacity-0 … group-hover/card-section:opacity-100`, `MenuButton.tsx:91-93`). Hover groups
  `group/card-section` and `group/group-section` are declared in `sectionChrome.ts:38` and
  `ContainerCore.tsx:177`.
- `HeaderIcon.tsx` maps section kinds to icons through a static `SectionTypeEnum`-keyed record
  (`:181-236`) with `gg-menu` fallback; list elements render `[idx]` text instead. Closest-to-portable
  header file; app-only edges are the social/code-language/terminal/chat rows.
- Every mutating header button follows one pattern: optimistic store write via
  `dispatchOptimisticProjectStateUpdate` → `setCurrEffectiveSectionImplValue` plus one
  `openapi/http` route (`toggleMinimized`, `togglePositionLocks`, `toggleGroupOrientation`,
  `deleteSections`/`toggleSectionVisibility`, `setSectionName`). Capability gate is
  `useShareCapabilities()` (`canEditLayout` / `canEditStructure`).
- `ChangeOrientationButton` is rendered from group chrome (`ContainerCore.tsx:241`), not from
  `SectionHeader`.
- Tooltips are a singleton zustand store: `getFloatingBoxHandlers(...)` from
  `components/Utils/FloatingBox.tsx`, rendered once in `MainContainerCore.tsx`. `FloatingBox`
  itself imports `re-resizable`, `forks/xyflow/core/utils/mouseLocation`, and
  `state/actions/sections/createSections` (convert-tooltip-to-section — app feature).
- `@setta/app-subsystem-frontend-sdk` is **not an npm package**; it is a tsconfig/vite alias to
  `frontend/plugin-sdk/app-subsystem/src` (transport layer `callOpenAPI` et al.).

### 1.3 Resize (`components/Utils/Resizable/`)

- Rendering: `re-resizable 6.9.0` via `ResizableWithScale.tsx`, which feeds
  `useReactFlow.getState().transform[2]` as `scale` at resize start. Only `bottom`, `right`,
  `bottomRight` are enabled (`CustomResizable.tsx:749-773`); disabled entirely when pointer events
  are suppressed or the section is locked.
- Hit vs visible geometry: handle classes (`section-resize-handle-*`) have **no CSS rules anywhere**
  — they are DOM markers for `closest()` hit-testing. Hit boxes are 10px edges / 20×20 corner
  (re-resizable defaults with `-8px` offsets), 16px/24×24 for attached-terminal children, 16px for
  meta-control with a ~3px visible bar drawn by an `after:` pseudo-element revealed on hover
  (`hover:after:bg-blue-500/80`).
- Commit funnel: one function, `persistSectionSizeChange` (`CustomResizable.tsx:547-571`) =
  `dispatchOptimisticProjectStateUpdate(setSelfParentSiblingChildrenWidths)` + `setSectionSizes`
  route. Called from auto→px promotion at resize start, resize stop, and an auto-clamp effect. A
  separate non-persisting path handles `auto_only` sizing. Resize lifecycle ticks go to
  `useResizeEvent` (`"start" | "end"` per section).
- Width propagation: `setSelfParentSiblingChildrenWidths` (`state/actions/sections/sectionSizes.ts:16`)
  walks up to the nearest horizontal group ancestor and down through descendants.

### 1.4 Viewport toolbar (`forks/xyflow/controls/`)

- Composed in the Overview left rail (`components/Panes/Overview/Overview.tsx:526`) as
  `<Controls />` with **zero props**, pushed to the rail bottom with `mt-auto`; it is not inside the
  canvas.
- Order top→bottom: edge toggles (agentic `TbSparkles`, arg `TbCircleDot`, chat-shared "W"/"A" text
  glyph) + divider; plugin controls (project placement); viewport group (zoom in `FaPlus`, zoom out
  `FaMinus`, fit `TbArrowAutofitWidth`, snap grid `TbGridDots`, reset zoom `TbZoomReset`); plugin
  controls (viewport, utility placements); minimap group (toggle `IoMapOutline`, side
  `TbLayoutSidebar{Left,Right}Collapse`).
- Buttons are 16×16 content-box + 5px padding, svg ≤12px (`controls/style.css`); chrome is Tailwind
  (`w-8 flex-col gap-1 rounded-md border`), the stylesheet's own background/border rules are
  commented out.
- State: zoom limits from `useSettings.gui.minZoom/maxZoom` vs `useReactFlow.transform[2]`; all
  toggles are `useLocalStorage` fields flipped by pure `state/actions/localStorage` setters.
  App-only imports: plugin runtime (extension point), `state/actions/chatSharedEdges` (label
  helper), the SDK placement enum, and `FloatingBox` tooltips.

### 1.5 Minimap (`components/Pages/Project/ResponsiveMiniMap.tsx` + `forks/xyflow/minimap/`)

- `ResponsiveMiniMap.tsx`'s only app import is `useLocalStorage` from `state/definitions`
  (minimap side plus pane widths, both preference reads): it wraps the forked `MiniMap` with node
  color/stroke functions, `nodeBorderRadius={5}`, mask stroke, pannable, click-to-`setCenter`, and a
  CSS-transform placement driven by `useLocalStorage.minimapSide` plus pane widths.
- The fork minimap (652 lines) is d3-zoom pannable with a viewport mask, syncs selection from
  `useActiveSectionUI`, and colors nodes from `deriveSectionStyleTheme` + effective impls.
  Background override lives in `Project/react-flow-css.css` (`#94a3b8b6`, dark
  `hsla(220,27%,6%,.72)`, `!important`).

### 1.6 Canvas composition (`components/Pages/Project/UiPage.tsx` → `forks/xyflow/`)

- `<ReactFlow />` is instantiated with **zero props** (`UiPage.tsx:21`); every setting flows through
  stores. Pan/zoom flags come from `useSettings.gui.*` (`FlowRenderer.tsx:32-50`), each gated by
  AI-follow transition state; selection rectangle state lives in `useReactFlow`.
- There is **no `nodeTypes` registry**: `wrapNode.tsx:72` unconditionally renders
  `<SectionContainer sectionId={id} isTopLevel />`. This is the single choke point that drags the
  entire application surface (terminals, chat, plugins, section windows) into the canvas cone, and
  it creates the fork→app→fork cycle (`wrapNode` → `SectionContainer` → `SortableSectionContainer`
  → `forks/dnd-kit`).
- Nodes: `useNodeInternals` holds `Map<sectionId, Node{position,width,height,zIndex,tempZIndex}>` —
  a derived projection of `projectConfig.topLevelSections` built by
  `createNodesMapFromProjectConfigChildren` (`state/actions/sectionInfos.ts:1507`); measured DOM
  size wins over stored layout size (`:1499-1500`). Only top-level sections are nodes; nested
  sections are DOM children. A shared `ResizeObserver` in `NodeRenderer.tsx` feeds
  `updateNodeDimensions`, which debounces layout back to the backend.
- `UiPage` additionally mounts `SectionDndContext`, three context menus, key listeners, and the
  minimap. `Pane.tsx` owns click-to-deselect, rubber-band selection, context menu, and
  file-drop-to-create-section (app-only).

## 2. Application-owned state reads, classified

Store inventory note: there is no `useSectionInfos`/`useActiveSection` store; the workspace store is
`useProjectState` (`state/definitions.ts:160`), selection is `useActiveSectionUI` (`:260`), derived
canvas geometry is `useNodeInternals` (`:349`), and the viewport store is `useReactFlow`
(`forks/xyflow/core/store/index.ts:9`). The three project stores publish atomically via
`runWithAtomicallyPublishedProjectStores` (`state/definitions.ts:352-435`).

| Store / field group                                                                                                                                                                                                                                                                                          | Classification                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| `useProjectState.projectConfig.topLevelSections{x,y,w,h,zIndex}`, `.viewport`, `.activeIds`, `parentSectionMap`, impl `.size/.isMinimized/.positionAndSizeLocked/.isHorizontalOrientation/.children/.parentId/.styleColor/.tagColor/.type`                                                                   | structural workspace state             |
| `useProjectState.sections` (names), `codeObjs*`, `shownParamIds`, `artifactGroups`, `pluginData`, `edges/agenticEdges/stateMachineEdges`, `codegenTargets`                                                                                                                                                   | section content state (app domain)     |
| `useProjectState.sectionVariants` + `sectionVariantMap` + `previewSectionVariantMap` (every structural read resolves through `getCurrEffectiveSectionImpl`)                                                                                                                                                  | hybrid: variant indirection over both  |
| `useProjectState.sectionCapabilities`, `runCapabilities`; `useShareCapabilities` → `{canEditLayout, canEditStructure, canEditParams, canEditVariants, canRun}`                                                                                                                                               | capability                             |
| `useProjectState.projectConfig.id/.name`; `usePendingOperations`; `useActiveSectionUI` backend-sync bookkeeping                                                                                                                                                                                              | persistence                            |
| `useLspDiagnostics`, `useTypeErrors`, `useNameValidationErrors`, `useServerMode`, `useProjectLoading`                                                                                                                                                                                                        | backend data                           |
| `useAIStore`, `useAIFollow`, `useAgenticScopeHighlights`, `useToolArgumentPreview`, chat windowing, git, plugin panes, most of `useLocalStorage`                                                                                                                                                             | unrelated app chrome                   |
| `useNodeInternals` (all), `useActiveSectionUI.activeIds`, `useReactFlow` transform/selection/pan flags, `useDndState`, `useDndChildren`, `useResizeEvent`, `useSectionRefs`, `useMisc` gesture fields (`mouseDownDraggingSection`, `isPanScrolling`, `lastPaneClickLocation`, `requestUpdateNodeDimensions`) | structural workspace state (transient) |
| `useLocalStorage.darkMode/snapToGrid/showMinimap/minimapSide` (+ pane widths for minimap offset); `useSettings.gui` pan/zoom/grid/selection options                                                                                                                                                          | structural workspace preferences       |

Mutation funnels the slice calls (all variant-aware writes go through
`setCurrEffectiveSectionImplValue`, `state/actions/sectionInfos.ts:831`):

- move/reparent/reorder: `moveSectionsWithBackend` (`state/actions/sections/moveSections.ts:28`) —
  the single dnd commit; z-order via `setZIndices`; layout persisted by
  `debounced_route_set_top_level_section_layout` (500 ms).
- resize: `setSelfParentSiblingChildrenWidths` + `setSectionSizes` route (one funnel, §1.3).
- minimize/lock/orientation/title: optimistic impl write + one route each (§1.2).
- selection: `applyActiveSectionChange` → pure `resolveActiveSectionChange` policy →
  `setActiveSectionIds` (debounced `setActiveIds` route) + `setZIndices`.
- viewport: `useReactFlow.subscribe` → debounced (1,000 ms) `setViewport` route.
- undo/redo: **server-authoritative** (`state/actions/undo.ts` calls `undo`/`redo` routes and
  replaces state via `processProjectStateUpdateFromBackend`). There is no client-side history stack;
  the slice only emits mutations.

Generated types the structural state depends on (`utils/generatedTypes.ts` →
`openapi/non_http/generated/types.gen.ts`): `SingleConfig`, `ProjectConfig`,
`TopLevelSectionLayout`, `BaseSectionImpl` (+22-variant union), `Core`, `Variant`, `SectionSize`
(`number | "auto"`), `SectionCapabilities`, `Position`, `Viewport`, `ViewMode`, `SectionTypeEnum`.
The xyflow fork's `Node` type is frontend-only but imports generated `Position`.

## 3. Styling, fonts, icons, forks

### 3.1 Tailwind

- `tailwindcss 3.4.1` exact-pinned; `postcss 8.4.31`, `autoprefixer 10.4.12`,
  `prettier-plugin-tailwindcss 0.5.11`; PostCSS runs `tailwindcss/nesting` (fork CSS uses native
  `&` nesting). Plugins: `@tailwindcss/typography 0.5.9`, `@tailwindcss/container-queries 0.1.1`.
- `darkMode: "class"` on `<html>`, bootstrapped by an inline script in `index.html` reading
  `localStorage["setta_data"].state.darkMode`, maintained by `GlobalWrapper.tsx:111-113`.
- Theme extensions: the 18-shade `setta` palette (HSL hue ≈219–222: 50, 100, 150, 200, 300, 400,
  500, 600, 700, 750, 800, 850, 860, 875, 900, 925, 950, 975) plus `setta.light`/`setta.dark`;
  `fontFamily.heading` (Work Sans); keyframes/animations (`dash`, `slideDown`, `slideUp`,
  `fadeIn`). **No** spacing/shadow/radius/fontSize extensions — the slice uses stock Tailwind
  scales (`rounded-md/lg/xl/full`, `shadow-sm/xl`).
- Slice usage: 751 `setta-*` occurrences in `components/Section/` (top: `text-setta-500/400/700`,
  `border-setta-700`, `bg-setta-900/800/100`); container queries (5 uses) and `prose*` (TextBlock)
  in Section only; `font-heading` and the custom animations are unused in the slice.

### 3.2 Fonts

@fontsource packages are pinned and imported (`App.tsx:1-9`: inter, work-sans, source-code-pro,
cormorant-garamond), but **no loaded family is bound to a used utility**: body renders the system
stack (`index.css:235`), `#root` uses stock `font-sans`, code uses stock `font-mono` (22 uses in
the slice), `font-heading` is unused repo-wide. Visual parity therefore depends on the system
font stack, not on shipping fonts.

### 3.3 Icons

- `react-icons 5.3.0` is the only icon package (subpaths bi, bs, fa, fa6, fi, go, hi, io5, md, pi,
  ri, rx, si, tb across the slice; toolbar uses fa6/io5/tb; minimap and resize use none).
- css.gg set: root `icons.css` (1,296 lines) defines 42 `.gg-*` classes drawn with pseudo-elements,
  scaled by `main { --ggs: 0.5 }`. Slice uses ~21 of them (`gg-close`, `gg-chevron-down`,
  `gg-link`, `gg-math-minus/plus`, `gg-lock`, `gg-lock-unlock`, `gg-maximize`, `gg-menu`,
  `gg-trash`, …). Header buttons Minimize/Lock use css.gg, not react-icons.
- Custom SVGs via `vite-plugin-svgr 4.3.0` (`s-logo-only-og.svg?react`) — app branding only.

### 3.4 CSS files affecting the slice (load order)

1. root `index.css` — the only `@tailwind` entry; `:root`/`html.dark` variables (`--app-shell-bg`,
   `--setta-callable-ready-*`, `--setta-titlebar-height`); global resets
   (`button, fieldset, input { all: unset }`, `html/body overflow hidden`); scrollbar theming; the
   section grid system (`.section-grid-cols/-rows/-areas` with named lines/areas plus ~27
   `@layer utilities` grid-area helpers like `.section-title`, `.section-key-value`);
   `.transition-radius` (170 ms); AI gradient-border shells; `::selection`.
2. `src/index.css` — chat animations, CodeMirror lint tooltip system, an overriding
   `.top-bottom-fade`.
3. `Section/Container/dndline.css` — ~95% commented out; ships only `@keyframes dash/gradient`,
   while the `dndline` class is still applied by `sectionChrome.ts:37`.
4. `forks/xyflow/core/styles/init.css` — vendored structural React Flow CSS (z-index stack, pane/
   viewport/node/edge classes) plus Setta's agentic/state-machine edge layers.
5. `forks/xyflow/core/styles/style.css` — theming layer: `--setta-wire-color` edges, 6×6 handles
   with `html.dark` overrides, data-attribute gating, and the whole `--agentic-handle-*` metric/
   accent system with `.agentic-handle-scope--themed` reading `--setta-section-style-*`.
6. `forks/xyflow/controls/style.css`, `forks/xyflow/minimap/style.css` — minimal (button box; white
   minimap bg).
7. `Project/react-flow-css.css` — loads after the fork CSS and wins: z-index resets, minimap colors
   (`!important`), portal anchors (`.setta-codemirror-tooltips` z-300, `.setta-popover-portals`
   z-320).
8. Root `icons.css` (css.gg).

JS-set CSS variables consumed by the slice: `--setta-section-style-{bg,panel-bg,border,outline,
text,muted-text,arg-handle,arg-handle-hover,arg-handle-active,agentic-handle}` (set in
`SectionContainerCore.tsx:149-158` from `deriveSectionStyleTheme(styleColor, darkMode)` — light/dark
resolved in JS, not CSS); `--setta-wire-color` (set on the `.react-flow` root); TextBlock size vars.
No styled-components/emotion/CSS-modules anywhere; class composition is Tailwind strings plus
`classcat 5.0.3` in the minimap fork.

### 3.5 Fork inventory and upstream packages

- **xyflow fork = full vendored replacement.** `@xyflow/react` is not a dependency (absent from
  `package.json` and lockfile). 55 modules under `forks/xyflow/` (MIT license retained, "webkid
  GmbH / Modifications by Kevin Musgrave & Jeff Musgrave"). It depends directly on `d3-drag 3.0.0`,
  `d3-selection 3.0.0`, `d3-zoom 3.0.0`, `d3-interpolate 3.0.1`, `classcat 5.0.3`. What was forked
  and why: (1) the store is viewport-only — nodes live in app `useNodeInternals`, edges in
  `useProjectState`, `Node` has no `data` field; (2) `wrapNode` hard-wires `SectionContainer`
  instead of `nodeTypes`; (3) handles register into Setta's `useEdgeHandleRegistry` with handle-
  family connection rules, enabling three extra edge renderers (data/arg, agentic, state-machine);
  (4) selection box doubles as a dnd-kit drag activator and `ZoomPane` suspends panning during
  dnd-kit drags (the two forks exist to coexist); (5) chrome (controls/background/minimap) is
  rewritten against Setta stores, and `ZoomPane` (1,181 lines) adds AI-follow viewport animation,
  pan-on-scroll modes, and a 5,000 px scroll shim.
- **dnd-kit fork = adapter over upstream.** Upstream `@dnd-kit/{abstract,dom,geometry,helpers,
react,state} 0.2.1` (the experimental v0.2 line; `@dnd-kit/core` absent). The 17-module
  `adapter/` re-creates the v6-shaped API (`useSortable`, `SortableContext` re-implemented at 600
  lines, sorting strategies re-vendored, `AutoScroller` filtered out) and owns fully custom
  collision detection (`adapter/collision.ts`, 786 lines). Eleven top-level Setta modules implement
  section drag: state (`dndState`, `dndChildren`, `sortingOverState`), sensors (`useDNDSensors` —
  no distance constraint for sections; activation is mode-gated by held shortcuts), live
  re-parenting (`useDropType.ts`, 1,222 lines), planners (`useMoveSectionPlans` — pure), commit
  (`useMoveSection` → `moveSectionsWithBackend`), multi-select shape override
  (`DragOperationShapeSync`), deferred deactivation.
- Hysteresis lives in the collision layer: ±10 px past-midpoint buffer keyed on the previous
  collision (`adapter/collision.ts:688-703`), ×1.1 intersection boost for the previous winner
  (`:501-513`), zoom-scaled move-to-parent trigger distances 30/20/100 px (`:515-544`), plus the
  drop-time fallback snapshot in `sortingOverState`.
- Param-DnD modules (`paramDndState`, `paramDndChildren`, `ParamDndContext`, the param half of
  `useDNDSensors`) are Phase 4 territory but are referenced from shared adapter code
  (`collision.ts`, `dragEventMapping.ts`, `DragOperationShapeSync.tsx`), so they enter the module
  graph even though no param drag is reachable in the section slice.
- Reverse coupling: no fork production file imports `openapi/*` (only `Pane.test.tsx` does, to
  mock it); the only network write is indirect
  (`useMoveSection` → `moveSectionsWithBackend`). The fork→app imports concentrate on
  `state/definitions`, `state/actions/sectionInfos`, `state/actions/nodeInternals`,
  `state/actions/sections/*`, `state/activeSectionUI`, `utils/generatedTypes`, `utils/constants`,
  `state/utils` (store reset registry) — these, plus `wrapNode`'s `SectionContainer` import and
  `Pane`'s file-drop/context-menu imports, are the seams to cut.
- Shared runtime pins the forks rely on: `react 19.1.1`, `react-dom 19.1.1`, `zustand 5.0.8`
  (`traditional` + `subscribeWithSelector` + `immer`), `immer 10.1.1`, `lodash 4.18.1`,
  `re-resizable 6.9.0`, `react-icons 5.3.0`, `classcat 5.0.3`.

## 4. Open Phase 0 item

- Item 2 is complete: the supervised executable reference, visual/interaction captures, computed
  geometry/styles, and gesture-ownership observations are indexed in `reference/README.md`.
- Item 8 remains open: present that reference set together with `extraction-seam-proposal.md` and
  obtain the developer's explicit approval or rejection of the exact Phase 1 slice. The automation
  loop cannot waive or infer this gate.
