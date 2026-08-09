# Workspace-shell dependency and ownership map

Reference: `../setta-main` at `043d3b2e9c69caf99d1246f1408b3ad7194b7864`, verified clean on
2026-08-12. Paths in the frozen-source sections are relative to `../setta-main/frontend/src`.

This document classifies the complete state-read surface of the workspace-shell source cone before
porting. Deep application panes and inspectors are inventoried at their boundary and excluded; they
are not silently treated as package dependencies. The package paths name the already-accepted seams
that future implementation would compose after the evidence blocker is resolved.

## 1. Frozen source cone

| Surface                   | Primary owners                                                                                                                                                                                                     | Portable behavior                                                                                                                                                  | Application boundary or cut                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Composition               | `components/Pages/MainContainerCore.tsx`, `components/Pages/Project/UiPage.tsx`, `components/Utils/GridWrapper.tsx`                                                                                                | Overview and UI Editor flank one center canvas; menus and minimap mount with the canvas                                                                            | App preview, chat dock, Git overlay, view modes, plugins, loading, routing, AI-follow, and backend bootstrap stay out                                                                                        |
| Pane geometry             | `components/Utils/PaneContainer.tsx`, `components/Panes/paneLayout.ts`, `components/Panes/paneFns.tsx`                                                                                                             | 40 px closed rails; side-specific transform; seam border; resize, full-width/restore, paired-pane negotiation, viewport normalization                              | Home-page panes are a second product surface; global localStorage persistence and `window.innerWidth` are replaced by controlled shell state and actual shell bounds                                         |
| Left rail/pane            | `components/Panes/Overview/Overview.tsx`                                                                                                                                                                           | 40 px rail, 32 px painted tabs, compact icons, selected blue paint, pane title/content shell, toolbar placement                                                    | Project AI, files, Git, notifications, plugins, settings navigation, deployment availability, and bottom view-mode strip stay application-side; Outline is the sole package default tab                      |
| Outline presentation seed | `components/Panes/Overview/ProjectOverview/ProjectOverview.tsx`, `ProjectOverview/SectionListItems.tsx`, `state/actions/sections/sectionPositions.ts`                                                              | Recursive document-order flattening, 0.75 rem depth indentation, compact row typography, tag-color dot, pointer/Space focus command                                | Project name, filter/tag filter, view modes, variants, AI activity, backend loading, and generated section types stay out. Main has no collapsible/selected accessible tree to port                          |
| Right rail/pane           | `components/Panes/UiEditor/UiEditor.tsx`, `state/hooks/uiTypes.ts`                                                                                                                                                 | Right rail/pane paint, empty placeholder, section-type tab selection, content title shell                                                                          | Workflow edges, variants, Markdown, Quick Info, generated section-type tab matrices, external docs link, and app focus manager stay out; package exposes one Inspector default tab plus typed host tabs      |
| Section inspector seed    | `components/Panes/UiEditor/SectionConfig/SectionConfig.tsx`, `SectionStyleColorSettings.tsx`, `SectionTagColorSettings.tsx`                                                                                        | Accordion/pane presentation and existing section accent/tag controls                                                                                               | Type-specific application panels, variants, deployment state, API writes, settings persistence, and temporary preview stores stay out; package reads/writes canonical section fields through its own funnels |
| Item inspector seed       | `components/Panes/UiEditor/UIConfig/UIConfig.tsx`, `UIConfigDropdownAndFields.tsx`, `UITypeCombobox.tsx`, `components/Params/ParamUIs/ParamUI.tsx`                                                                 | Compact item label/type/config presentation and the already-extracted control set                                                                                  | Generated `CodeObjType`, presets, variants, backend type changes, parameter stores, and config transports are replaced by the package's planned typed item schema. Main does not inspect one selected item   |
| Menu core                 | `components/Utils/ContextMenus/ContextMenuCore.tsx`, `PaneContextMenu.tsx`, `SelectionContextMenu.tsx`, `paneContextMenuKeyboard.ts`                                                                               | Non-modal compact menu, viewport-edge flip, outside dismissal, searchable grouped creation list, post-open keyboard filtering/navigation, structural action labels | Type-error menu, generated creation inventory, OpenAPI calls, view-mode visibility action, project id, and navbar geometry stay out                                                                          |
| Menu triggers             | `forks/xyflow/core/container/Pane.tsx`, `forks/xyflow/core/components/NodesSelection.tsx`, `state/actions/contextMenus.ts`, `forks/xyflow/core/container/ZoomPane.tsx`                                             | Background and selection `contextmenu` ownership, screen coordinates, close on viewport gesture                                                                    | File/native drop creation and notification paths stay out. The planned Menu-key/Shift+F10 path and focus restoration are new package behavior                                                                |
| Shell/canvas geometry     | `forks/xyflow/core/container/ReactFlow.tsx`, `core/utils/graph.ts`, `core/utils/index.ts`, `core/hooks/useViewportHelper.ts`, `forks/xyflow/minimap/MiniMap.tsx`, `components/Pages/Project/ResponsiveMiniMap.tsx` | Visible-center measurement affects fit, focus, minimap, creation placement, and edge auto-pan                                                                      | Frozen main reads app pane widths globally. The package shell must derive geometry from its actual center rect and must not expose or reintroduce the app localStorage fields                                |

### Exact reference constants and chrome

- `INITIAL_OVERVIEW_WIDTH = 335`, `INITIAL_UI_EDITOR_WIDTH = 500`,
  `CLOSED_PANE_WIDTH = 40`; the initial state is left open/right closed.
- Overview minimum width is 250 px; UI Editor minimum width is 425 px. A pane's maximum is
  `viewportWidth - 40`, never less than 40 px.
- A visible left pane reserves `pl-9`; a visible right pane reserves `pr-7`. The closed transform
  is the signed `width - 40` delta. The seam border is removed within 2 px of full width.
- The pane is an `aside` on app z-layer 30 with a one-sided resize handle, `shadow-md`, hidden
  overflow, and a transform transition. The reference full-width button paints 24 x 24 px with a
  13 px icon at the pane's upper inside corner.
- Both icon rails are fixed at 40 px on app z-layer 32. Rail tabs paint at 32 x 32 px with compact
  icons and a 2 px focus ring.
- Reference menu content is non-modal, at most 40% of viewport height, width
  `clamp(5rem, 20vw, 10rem)` with an 8 rem minimum, and flips above/left when its measured box would
  cross the viewport. Its 36 px top clamp is navbar-specific and is not a package constant.

## 2. State reads and their package ownership

Every store or derived-state read in the mapped source cone is classified below. “Exclude” means
the import must not cross into `packages/workspace`; it does not mean that the package should add a
fallback for it.

### Shell, rails, and pane layout

| Reference read                                                                     | Read by                                                     | Classification                                                               | Package boundary                                                                                                                                                  |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useLocalStorage.overviewVis`, `overviewWidth`, `overviewTrueWidth`, `overviewTab` | `Overview`, `paneFns`, `paneLayout`, canvas/minimap helpers | Serializable shell view state; `trueWidth` is derived layout                 | Controlled leading-pane state: selected tab, visibility, width, remembered non-full width; one explicit change callback. Do not persist a duplicate derived width |
| `useLocalStorage.uiEditorVis`, `uiEditorWidth`, `uiEditorTrueWidth`, `uiEditorTab` | `UiEditor`, `paneFns`, `paneLayout`, canvas/minimap helpers | Serializable shell view state plus generated per-section-type tab preference | Controlled trailing-pane state with one selected Inspector/host tab. Generated section-type tab maps do not cross the seam                                        |
| Module-global `lastNonFullPaneWidthByName`                                         | `paneLayout`                                                | Transient remembered view state                                              | The plan explicitly makes remembered non-full width serializable; do not port the module global                                                                   |
| `window.innerWidth`, `useWindowSize()`                                             | `paneLayout`, `PaneContainer`                               | Host/layout environment                                                      | Observe the shell container, not the global window, so embedded and 320 px consumers normalize correctly                                                          |
| `useSettings.gui.leftSidePaneShiftsMap`                                            | `paneFns.onOverviewResizeStop`                              | Application preference                                                       | One explicit shell camera-shift option if retained by accepted evidence; no settings-store read                                                                   |
| `useHasViewModeTabs()`                                                             | `Overview`, `UiEditor`                                      | Unrelated application chrome                                                 | Exclude the bottom view-mode strip and its 36 px rail inset                                                                                                       |
| `useTabScope()` and app focus-manager ordering                                     | `Overview`, `UiEditor`                                      | Application focus infrastructure                                             | Package-owned landmark/tablist focus with public DOM ownership; no focus-manager import                                                                           |
| `usePluginPaneTabs()`, `useAppSubsystemOverviewTab()`                              | `Overview`                                                  | Application/plugin extensions                                                | Typed host-tab registration using renderers and icons only; no plugin runtime or host object                                                                      |
| `useShareSession.isDeploymentMode`, `.sharePolicy.allowLLM`                        | `Overview`                                                  | Share/deployment policy                                                      | Exclude. Host decides which registered tabs exist                                                                                                                 |
| `useBackendLogEvents.unreadHighSeverityCount`                                      | `Overview`                                                  | Backend/app notification state                                               | Exclude. A host tab owns any badge it renders                                                                                                                     |
| `useLocalStorage.darkMode` / `colorMode`                                           | minimap and global app chrome                               | Appearance                                                                   | Already owned by `setWorkspaceColorMode`; every shell/menu portal follows the scoped resolved mode                                                                |
| `useLocalStorage.minimapSide`, `showMinimap`                                       | minimap/canvas                                              | Workspace view preference                                                    | Already owned by `useWorkspaceOptions`; placement becomes relative to the actual center pane                                                                      |

`paneLayout.ts` also contains `homeWorkspacePane*` and `homeSelectedProjectPane*` reads. Those are a
separate Home product and are excluded at the type boundary. Only the leading/trailing workspace
pair and their shared pure negotiation rules are candidates for the shell.

### Outline

| Reference read                                                                                    | Read by                                   | Classification                                        | Package boundary                                                                                                                      |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `useProjectState.sections`, effective section implementation, top-level order, recursive children | `useOverviewListing`                      | Structural workspace state behind variant indirection | Project directly from `WorkspaceDocument.sections`, `topLevelSections`, and `children`; variants do not exist at the package seam     |
| Active view mode, `visibilityBySectionId`, `isEditingViewMode`, `getSectionShouldRender`          | `useOverviewListing`                      | Application view-mode state                           | Exclude. The package document contains the sections it renders; no hidden view-mode branch or fallback                                |
| Section `name`, implementation `tagColor`                                                         | `useOverviewListing`                      | Canonical workspace fields                            | Already package-owned; tag color remains an auxiliary cue, never the sole selection/lock/minimize signal                              |
| Section implementation type                                                                       | indirect through effective implementation | Generated application identity                        | Use registered package kind/icon; do not expose generated types                                                                       |
| `useSettings.gui.sectionTagColorChoices`                                                          | `ProjectOverviewCore`                     | Application appearance settings                       | Filtering is excluded by this milestone. Inspector accent editing uses the package color contract, not app settings                   |
| Component-local text/tag filters                                                                  | `ProjectOverviewCore`                     | Local pane view state                                 | Excluded by the approved Outline scope (“no tags/filtering”)                                                                          |
| `useAIStore.agentRuns`, load completion, project id                                               | `useActiveAgentSectionIds`                | Backend/AI activity                                   | Exclude the badge and load side effect                                                                                                |
| `useReactFlow`, section DOM refs, `useSettings.gui.transitionDuration`                            | `goToSection`                             | Canvas geometry and interaction preference            | Reuse package viewport internals and scoped motion. The package command must explicitly decide activation versus center-only behavior |
| Canonical active section mutation                                                                 | `goToSection`                             | Workspace selection                                   | Reuse `applyActiveSectionChange`; do not write stores from the Outline component                                                      |
| Outline disclosure, roving focus, typeahead                                                       | **No frozen-main read exists**            | Planned shell view state                              | Must be package-owned controlled view state only after the authority gap is resolved                                                  |

### Inspector and typed item presentation

| Reference read                                                                    | Read by                                        | Classification                          | Package boundary                                                                                           |
| --------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `useActiveSectionUI.activeIds` through `useSolelyActiveSectionUIId`               | `UiEditor`                                     | Canonical workspace selection           | Read package selection internally. Zero/one/multiple branches are package Inspector policy                 |
| Selected workflow edges                                                           | `UiEditor`                                     | Application workflow state              | Exclude the entire edge inspector                                                                          |
| Section type and `uiEditorTab` map                                                | `useUIEditorTab`, `paneFns`                    | Generated app type plus view preference | Package Inspector is one default tab; host inspector contributions register by package kind/item extension |
| Section name, style/tag color, lock, minimize, size, group orientation            | section config plus header/resize owners       | Canonical workspace fields              | Reuse package document and specific mutation funnels; do not mutate opaque data heuristically              |
| Parameter ids/names for the side pane                                             | `useParamIdsAndNamesForSidePane` in `UIConfig` | Application parameter model             | Replace with the planned typed built-in item schema; custom items use registered inspector contributions   |
| Current variant/base implementation and non-preset/preset `CodeObjType` inventory | `UIConfig`, `UITypeCombobox`                   | Generated domain/variant state          | Replace with the package's discriminated presentation kinds and accepted type-specific option types        |
| `useShareCapabilities.canEditStructure` and section-setting capability reads      | UI type and section config                     | Capability                              | Reuse `useWorkspaceCapabilities` fields; disable rather than invent alternate mutations                    |
| API/project id, optimistic operations, settings persistence, preview stores       | UI/section config descendants                  | Persistence/backend state               | Exclude all transports and previews; one canonical package mutation notifies once                          |
| Selected item ids                                                                 | **Not read by `UiEditor` or `UIConfig`**       | Missing reference branch                | The planned item Inspector is new behavior and needs explicit authority before implementation              |

The first implementation batch, once unblocked, replaces the playground-only decoder in
`apps/playground/src/sectionKinds.tsx` and its `WorkspaceItem.data.control` fixtures directly. It
must add no alias, legacy data decoder, migration, dual renderer, or fallback. Custom opaque items
remain valid only through the existing registered-renderer extension path.

### Context menus

| Reference read                                                                           | Read by                                   | Classification                           | Package boundary                                                                                                     |
| ---------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `useContextMenus.pane/selection` (`isOpen`, screen `x/y`, selected ids)                  | all workspace menu components/actions     | Ephemeral menu view state                | Package internal, scoped to a shell/canvas instance; never part of `WorkspaceDocument`                               |
| `useCreateSectionsList()`                                                                | pane menu                                 | Generated/application creation inventory | Typed creation-command registry with label, group, optional icon, and host factory                                   |
| `screenToFlowPosition()` and canvas transform/DOM rect                                   | pane menu                                 | Canvas geometry                          | Use the package viewport conversion at invocation time and pass the immutable workspace position to the host factory |
| Current project id, generated implementation specs, `createTopLevelSectionFromImplSpecs` | pane menu                                 | Backend/domain creation                  | Host factory returns the package section input; package performs one validated insertion commit                      |
| Active view mode, per-section visibility, editing/user-view flags                        | selection menu                            | Application view mode                    | Exclude Hide/Show and user-view suppression, as the amendment requires                                               |
| `positionAndSizeLocked` across selected ids                                              | selection menu                            | Canonical workspace state                | Derive mixed/all state from package sections and commit through one batch lock/unlock funnel                         |
| `canEditLayout`, `canEditStructure`                                                      | selection menu                            | Capability                               | Reuse package capabilities for visible disabled semantics                                                            |
| OpenAPI group/delete/lock/visibility routes and optimistic dispatch                      | selection menu                            | Backend persistence                      | Replace Group/Delete/Lock with package canonical batch funnels and one document notification                         |
| ReactFlow `nodesSelectionDims`                                                           | selection menu close                      | Private canvas presentation              | Clear through an internal menu/selection controller; never public API                                                |
| Pointer target, screen coordinates, pan gesture start                                    | pane, selection, zoom owners              | Gesture state                            | Package owns mutually exclusive menu/drag/pan/wheel boundaries and invocation-owner focus                            |
| Menu key / Shift+F10                                                                     | **No frozen-main read or handler exists** | Missing reference interaction            | New package behavior requiring explicit authority; do not claim it was extracted                                     |

The reference `TypeErrorContextMenu` and the Pane file/native-drop branches are application features
and are excluded completely. Additional host menu actions receive immutable public contexts; they
do not receive any store from the table above.

## 3. Shell geometry consumers

The package already adapted fit, center, minimap, and auto-pan to a standalone canvas whose wrapper
was the whole visible pane. The integrated shell must preserve that seam by sizing and measuring the
actual center cell. It must not copy frozen main's global pane-width reads back into canvas modules.

| Frozen consumer                      | Reference use of `overviewTrueWidth` / `uiEditorTrueWidth`   | Integrated package rule                                                                         |
| ------------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `ReactFlow.tsx`                      | Subtracts both widths from reported canvas width             | Center cell's `ResizeObserver` reports the already-reduced width                                |
| `graph.getPaneRect`                  | Offsets top-left by left pane and subtracts both widths      | Use the measured center DOM rect, as current package `getPaneRect` does                         |
| `getViewportForBounds` / `setCenter` | Adds the left width to the viewport center                   | Center within the measured center cell; an accepted camera-shift option is explicit shell input |
| `calcAutoPan`                        | Moves left/right thresholds inward by pane widths            | Pointer coordinates and bounds are center-cell local                                            |
| `ResponsiveMiniMap` / fork minimap   | Translates the panel and mask by persisted pane widths       | Mount/position against the center cell; preserve public physical minimap side semantics         |
| `createSections` placement           | Derives visible bounds and empty-space x from the left width | Creation menu converts the invocation point through center-cell geometry                        |
| Chat dock and Git overlay            | Consume both widths                                          | Excluded app chrome; host extensions compose outside the package shell                          |

## 4. Pure algorithms and characterization anchors

Future implementation should port or re-express only these proven mechanisms after live evidence
and authority are complete:

- `paneLayout.ts`: opening with opposite-pane shrink/close, resize negotiation, full-width toggle,
  remembered restore width, and viewport-change normalization. Port only the workspace pair. The
  reference tests cover opposite shrink, opposite full-width close, full-width restore, resize to
  full, and viewport pinning.
- `PaneContainer.tsx`: side-specific seam/transform calculation and resize/full-width invocation.
  The component tests freeze padding, seam removal, button chrome, hidden offset, and custom
  padding.
- `paneContextMenuKeyboard.ts`: pure filter-cursor editing and the post-navigation reset rule. Its
  tests cover printable/backspace/delete/selection edits and editable-target routing.
- `ProjectOverview.getDepthListingHelper`: recursive document-order projection only. Do not carry
  view modes, AI state, filter/tag UI, or generated implementation resolution with it.
- `goToSection`: section bounds and viewport focus mechanics. Split selection from centering when
  the approved Outline interaction requires a center-only command.
- Existing package controls, section mutations, selection policy, appearance scope, motion scope,
  and viewport helpers remain the implementation owners. Do not fork them inside shell components.

## 5. Direct dependencies at the frozen boundary

Frozen main exact-pins `@radix-ui/react-dropdown-menu 2.1.2`,
`@radix-ui/react-menubar 1.0.0`, `@radix-ui/react-accordion 1.1.0`,
`re-resizable 6.9.0`, `downshift 8.2.3`, `match-sorter 8.1.0`, and
`react-icons 5.3.0` along this cone. The package already owns `re-resizable 6.10.3` (the documented
React 19 peer-range move), `downshift 8.2.3`, `match-sorter 8.1.0`, and `react-icons 5.3.0`.

No dependency has been added by this preflight. A future batch may add only the smallest retained
primitive its source actually imports, with an exact version admitted by the repository's strict
peer and supply-chain policy; the reference version is not permission to bypass those controls.

## 6. Preflight result

The package boundary is technically representable without importing a Setta store, generated type,
backend route, plugin runtime, view mode, or private XYFlow/dnd-kit surface. The mapped ownership
cuts are narrow and align with the amendment.

Implementation is nevertheless blocked before batch 1 because the required executable evidence
includes Outline and Inspector interactions that frozen main does not implement. The source facts,
existing visual corroboration, and required developer resolution are indexed in
[`README.md`](README.md). This is a plan-authority blocker, not a missing credential, service,
browser, or verification result.
