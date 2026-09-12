# Phase 0 — smallest package seam proposal

Phase 0 item 7. Proposed from the dependency evidence in `dependency-map.md`; ratification is the
developer's Phase 0 exit-gate decision together with the completed executable reference set in
`reference/README.md`. Nothing here widens the Phase 1 slice defined by the plan.

**Decision:** approved by the developer on 2026-08-10 together with the executable reference set
and the exact Phase 1 slice. Later phases and deferred capabilities remain unapproved.

## 1. What the evidence says the slice actually needs

The Phase 1 slice (one root leaf, one root group with a nested leaf, exact chrome, selection
without layout shift, full-surface drag with exclusions, reference resize, minimal toolbar) has a
cone that is already almost separable:

- The chrome core is pure or near-pure: `sectionChrome.ts`, `deriveSectionStyleTheme`
  (`utils/sectionStyleColors.ts`, zero imports), `getOutlineColor`/`getBgColor` (extractable from
  `Container/utils.tsx`), `ContainerSwitch`, `TopLevelContainer`, `DndSlot`, `NodeIdContext`,
  `dropTypes`.
- The interaction engines (`forks/xyflow/`, `forks/dnd-kit/`) never import `openapi/*`; their app
  coupling is confined to `state/*` reads, `utils/generatedTypes` types, `utils/constants` class
  names, and two hard edges: `wrapNode.tsx` → `SectionContainer` and `Pane.tsx` → file-drop/context
  menus.
- Every gesture already commits through exactly one funnel: `moveSectionsWithBackend` (move),
  `persistSectionSizeChange` (resize), `setActiveSectionIds` (selection),
  `debounced_route_set_top_level_section_layout` (layout), debounced `setViewport` (viewport), and
  per-flag impl writes (minimize/lock/orientation/title). These funnels are the natural
  document-change callback sites.

## 2. Proposed seams (package boundary)

1. **Document seam.** A package-owned structural store replaces the structural subset of
   `useProjectState` + `useNodeInternals` + `useActiveSectionUI`: per-section
   `{id, kind, title, size (number|"auto"), isMinimized, positionAndSizeLocked, orientation,
styleColor, tagColor, children, parentId}`, top-level layout `{x, y, w, h, zIndex}`, viewport,
   and selection. Main's variant indirection (`getCurrEffectiveSectionImpl`) is **not** part of the
   boundary: the slice always consumes the resolved effective impl, so the package stores resolved
   sections and the application keeps variants on its side of the seam. The atomic-publication
   discipline (`runWithAtomicallyPublishedProjectStores`) must be preserved package-internally so
   document, derived geometry, and selection never publish mid-gesture.
2. **Change-callback seam.** The six commit funnels become document-change events on one controller
   callback; optimistic-op plumbing (`dispatchOptimisticProjectStateUpdate`, `usePendingOperations`,
   `frontendOpId`) and all `openapi/http` routes stay application-side. Canonical state changes
   once per gesture, exactly as main behaves today.
3. **Renderer seam.** `SectionContainerCoreResizabe.tsx` is the cut point: its 22 `Layouts/*`
   renderers, chat windowing, and section-window surfaces are replaced by application-registered
   section renderers (kind → renderer/icon/default size). `wrapNode`'s hardcoded `SectionContainer`
   stays package-internal (the package owns its node wrapper; hosts register content, not nodes).
4. **Capability seam.** `useShareCapabilities` collapses to package capabilities (Phase 1 needs
   `canEditLayout`/`canEditStructure` gating on drag, resize, lock, delete, title editing).
5. **Interaction-boundary seam.** The `NO_DRAG`/`NO_PAN`/`NO_WHEEL`/`SETTA_PREVENT_SECTION_*`
   class-name contract from `utils/constants.ts` becomes the package's single documented
   interaction boundary; hosts never see XYFlow or dnd-kit classes.
6. **Type seam.** The generated types the slice touches (`SectionTypeEnum`, `SectionSize`,
   `TopLevelSectionLayout`, `Position`, `Viewport`) are re-authored as package types; section kinds
   become application-registered strings instead of a closed generated enum.
7. **Preferences/appearance seam.** `useLocalStorage.darkMode/snapToGrid/showMinimap/minimapSide`
   and the `useSettings.gui` pan/zoom/grid options become package props/controller options; dark
   mode remains class-based (`html.dark`) with the JS-computed section-style variables preserved.
8. **Tooltip.** `FloatingBox` is trimmed to a package-owned tooltip singleton (mouse-following box
   over the fork's `mouseLocation`), dropping convert-to-section and its `createSections` import.

## 3. Explicitly outside the slice (not extracted, not stubbed)

Agentic/chat/state-machine edge handles and renderers, `useEdgeHandleRegistry`, AI-follow and
agentic scope highlights, AI gradient borders, terminals and attached-terminal chrome variants,
section windows / chat windowing, plugins and the app-subsystem SDK, LSP diagnostics, run/entry
code and Python codegen gating, social icons, view modes, file-drop-to-create-section, context
menus beyond the slice's needs, and server-authoritative undo. Per the no-compat rule these are
removed at the cut, not kept as dead branches; the E2E-visible consequences (e.g. no edge toggles
in the toolbar) are part of what the developer approves at the Phase 1 gate. The toolbar's slice
form is the viewport group (zoom in/out, fit, snap grid, reset zoom) plus minimap toggles; the
edge-toggle and plugin-placement groups leave with their features.

## 4. Temporary main-only dependencies (Phase 1 provisional slice)

Allowed while the provisional slice lives under `packages/workspace` before Phase 2 hardening;
each must be gone (replaced by the seams above) by the Phase 2 exit gate:

| Temporary dependency                                                                                                                                                           | Replaced by seam            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| ~10 pure selectors from `state/actions/sectionInfos.ts` (`getCurrEffectiveSectionImpl` family, tree walks)                                                                     | 1 (resolved document)       |
| Structural fields of `state/definitions.ts` stores (`useProjectState`, `useNodeInternals`, `useActiveSectionUI`, `useSectionRefs`, `useResizeEvent`, `useMisc` gesture fields) | 1                           |
| `utils/generatedTypes` (`SectionTypeEnum`, `SectionSize`, `TopLevelSectionLayout`, `Position`, `Viewport`)                                                                     | 6                           |
| `utils/constants` interaction class names                                                                                                                                      | 5                           |
| `useShareCapabilities` reads                                                                                                                                                   | 4                           |
| `useLocalStorage`/`useSettings` appearance and gesture options                                                                                                                 | 7                           |
| `FloatingBox` tooltip store                                                                                                                                                    | 8                           |
| `state/utils` store-reset registry used by the dnd stores                                                                                                                      | 1 (package store lifecycle) |
| Commit calls into `moveSectionsWithBackend` / `setSectionSizes` / `setActiveSectionIds` / layout+viewport routes                                                               | 2                           |

Dependencies that must never cross into the package even temporarily: `openapi/*`, the plugin
SDK/runtime, chat/AI/agentic stores, terminals, section windows, LSP, and codegen helpers — the
slice components are trimmed of those imports at extraction time, consistent with the plan's
forbidden-import exit criteria.

## 5. Dependencies the package keeps (exact-pinned, from main)

`react 19.1.1` + `react-dom 19.1.1` (peers with documented ranges), `zustand 5.0.8`,
`immer 10.1.1`, `lodash 4.18.1`, `@dnd-kit/{abstract,dom,geometry,helpers,react,state} 0.2.1`,
`d3-drag 3.0.0`, `d3-selection 3.0.0`, `d3-zoom 3.0.0`, `d3-interpolate 3.0.1`, `classcat 5.0.3`,
`re-resizable 6.9.0`, `react-icons 5.3.0`, `tailwindcss 3.4.1` (+ typography/container-queries
plugins, build-time only). The vendored xyflow fork and the dnd-kit adapter move into the package
with their MIT license files. css.gg glyphs used by the slice ship inside the compiled scoped
stylesheet; fonts need no shipping (the reference renders on the system font stack).
