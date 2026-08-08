export const SOURCE_SNAPSHOT = "043d3b2e9c69caf99d1246f1408b3ad7194b7864";

export const INTERACTION_FIXTURE_EVIDENCE = {
  collision: {
    behavior:
      "sortable priority, signed trigger distance, previous-target preference, retained rectangles, midpoint buffers, child promotion, and stale-target clearing",
    sources: [
      "frontend/src/forks/dnd-kit/adapter/collision.ts",
      "frontend/src/forks/dnd-kit/adapter/collisionCompare.ts",
      "frontend/src/forks/dnd-kit/useDropType.ts",
    ],
    symbols: ["createCollisionTracker", "resolveOverCollision", "onDragOver"],
    destination: "packages/workspace/src/internal/collision-characterization.ts",
  },
  geometry: {
    behavior:
      "zoom-normalized drag translation, screen/workspace conversion, and combined drag bounds",
    sources: [
      "frontend/src/forks/dnd-kit/adapter/zoom.ts",
      "frontend/src/forks/dnd-kit/dragRectBounds.ts",
      "frontend/src/forks/dnd-kit/DragOperationShapeSync.tsx",
    ],
    symbols: ["applyZoomToTransform", "resolveRectBoundsById", "resolveSelectionBoundingRect"],
    destination: "packages/workspace/src/internal/interaction-geometry.ts",
  },
  movement: {
    behavior:
      "normalized sibling-block order, sort/free plans, cross-depth moves, no-op detection, cycle prevention, cancellation, and host rejection",
    sources: [
      "frontend/src/forks/dnd-kit/useMoveSectionPlans.ts",
      "frontend/src/forks/dnd-kit/useMoveSection.ts",
      "frontend/src/state/actions/sections/sectionSelection.ts",
    ],
    symbols: ["planSortingMove", "planFreeMove", "getRootSelectedSectionIds"],
    destination: "packages/workspace/src/internal/section-move-planning.ts",
  },
  ownership: {
    behavior:
      "one movement owner across viewport, root layout, section structure, and item-tree activation",
    sources: [
      "frontend/src/forks/dnd-kit/useDropType.ts",
      "frontend/src/forks/dnd-kit/selectionDragHandle.ts",
      "frontend/src/forks/xyflow/core/container/ZoomPane.tsx",
    ],
    symbols: ["onDragStart", "setSelectionDragHandle", "getViewportInteractionActiveValue"],
    destination: "packages/workspace/src/internal/interaction-owner.ts",
  },
  preview: {
    behavior:
      "orientation-aware midpoint insertion with transform-only, layout-stable sibling previews",
    sources: [
      "frontend/src/forks/dnd-kit/adapter/sorting.ts",
      "frontend/src/forks/dnd-kit/sortingOverState.ts",
    ],
    symbols: [
      "verticalListSortingStrategy",
      "horizontalListSortingStrategy",
      "getSortingOverState",
    ],
    destination: "packages/workspace/src/internal/sorting-preview.ts",
  },
} as const;

export const NON_DND_FIXTURE_EVIDENCE = {
  locking: {
    behavior:
      "capability-gated position-and-size locking with named controls and delta-only batches",
    sources: [
      "frontend/src/components/Section/Header/LockPositionButton.tsx",
      "frontend/src/components/Utils/ContextMenus/SelectionContextMenu.tsx",
    ],
    symbols: ["LockPositionButton", "SelectionContextMenu"],
    destination: "packages/workspace/tests/non-dnd-evidence.test.ts",
  },
  minimizing: {
    behavior: "named minimize/expand controls, unmounted host bodies, and retained canonical size",
    sources: [
      "frontend/src/components/Section/Header/MinimizeButton.tsx",
      "frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx",
      "frontend/src/state/hooks/sectionSizes.ts",
    ],
    symbols: ["MinimizeButton", "SectionContainerCoreResizable", "useSectionMinMaxDims"],
    destination: "packages/workspace/tests/non-dnd-evidence.test.ts",
  },
  sizing: {
    behavior:
      "axis-specific fixed/content sizing, measured promotion, reset, clamping, and zoom stability",
    sources: [
      "frontend/src/components/Utils/Resizable/CustomResizable.tsx",
      "frontend/src/state/actions/sections/sectionSizes.ts",
      "frontend/src/state/hooks/sectionSizes.ts",
    ],
    symbols: ["CustomResizable", "getResizeStartAutoSizeUpdate", "useSectionMinMaxDims"],
    destination: "packages/workspace/tests/non-dnd-evidence.test.ts",
  },
  groupOverflow: {
    behavior: "stable size capture before grow-to-scroll transitions and nested wheel isolation",
    sources: [
      "frontend/src/components/Section/Header/MenuButton/ToggleGroupOverflowMode.tsx",
      "frontend/src/components/Section/Container/ContainerCore.tsx",
    ],
    symbols: ["ToggleGroupOverflowMode", "Container"],
    destination: "packages/workspace/tests/non-dnd-evidence.test.ts",
  },
  snapping: {
    behavior:
      "shared workbench-unit movement, keyboard, and resize snapping including negative coordinates",
    sources: [
      "frontend/src/forks/xyflow/core/hooks/useDrag.ts",
      "frontend/src/forks/xyflow/core/hooks/useUpdateNodePositions.ts",
      "frontend/src/components/Utils/Resizable/CustomResizable.tsx",
    ],
    symbols: ["useDrag", "updatePositions", "CustomResizable"],
    destination: "packages/workspace/tests/non-dnd-evidence.test.ts",
  },
  grid: {
    behavior:
      "zoom-scaled dot, line, and cross patterns with pan-relative phase independent of snapping",
    sources: [
      "frontend/src/forks/xyflow/background/Background.tsx",
      "frontend/src/forks/xyflow/core/container/ReactFlow.tsx",
    ],
    symbols: ["Background", "ReactFlow"],
    destination: "packages/workspace/tests/non-dnd-evidence.test.ts",
  },
  viewportGestures: {
    behavior:
      "configurable pointer, wheel, pinch, and temporary-key gesture ownership with bounded lifecycle",
    sources: [
      "frontend/src/forks/xyflow/core/container/ZoomPane.tsx",
      "frontend/src/forks/xyflow/core/container/ZoomPane.test.ts",
    ],
    symbols: ["getViewportInteractionActiveValue", "resolvePanOnScrollDelta"],
    destination: "packages/workspace/tests/non-dnd-evidence.test.ts",
  },
  scrollIsolation: {
    behavior:
      "scrollable host and group regions consume wheel input without moving the outer viewport",
    sources: [
      "frontend/src/forks/xyflow/core/container/ZoomPane.tsx",
      "frontend/src/components/Section/Container/ContainerCore.tsx",
    ],
    symbols: ["getViewportInteractionActiveValue", "Container"],
    destination: "packages/workspace/tests/non-dnd-evidence.test.ts",
  },
  stacking: {
    behavior:
      "transient ancestor lift, explicit persistent ordering, and stable bounded normalization",
    sources: [
      "frontend/src/state/actions/sections/sectionPositions.ts",
      "frontend/src/state/actions/activeSectionController.ts",
      "frontend/src/forks/xyflow/core/hooks/useDrag.ts",
    ],
    symbols: ["setZIndices", "applyActiveSectionChange", "useDrag"],
    destination: "packages/workspace/tests/non-dnd-evidence.test.ts",
  },
  placement: {
    behavior:
      "explicit-position priority, viewport-visible fallback, current-zoom focus, and deterministic planning",
    sources: [
      "frontend/src/state/actions/sections/createSections.ts",
      "frontend/src/state/actions/sections/createSectionsHelper.ts",
    ],
    symbols: ["createTopLevelSectionWithResult", "createTopLevelSectionFromImplSpecs"],
    destination: "packages/workspace/tests/non-dnd-evidence.test.ts",
  },
  naming: {
    behavior:
      "capability-gated trim, validate, cancel, commit, rejection, rollback, and focus restoration",
    sources: [
      "frontend/src/components/Section/Header/SectionTitle.tsx",
      "frontend/src/components/Utils/Editable.tsx",
      "frontend/src/utils/nameValidation.ts",
    ],
    symbols: ["SectionTitle", "Editable", "validateSectionNameInput"],
    destination: "packages/workspace/tests/non-dnd-evidence.test.ts",
  },
  selection: {
    behavior:
      "single, additive, marquee, pane-clear, normalized-root, and keyboard-reachable selection",
    sources: [
      "frontend/src/state/actions/activeSectionPolicy.ts",
      "frontend/src/state/actions/activeSections.ts",
    ],
    symbols: ["resolveActiveSectionChange", "setActiveSectionIds"],
    destination: "packages/workspace/tests/non-dnd-evidence.test.ts",
  },
  grouping: {
    behavior:
      "shared-parent grouping and ungrouping with deterministic geometry and disabled reasons",
    sources: [
      "frontend/src/components/Utils/ContextMenus/SelectionContextMenu.tsx",
      "frontend/src/components/Section/Header/MenuButton/UngroupButton.tsx",
    ],
    symbols: ["SelectionContextMenu", "UngroupButton"],
    destination: "packages/workspace/tests/non-dnd-evidence.test.ts",
  },
  minimap: {
    behavior:
      "pannable root summary, current-zoom centering, toggle/side controls, and live selection/style updates",
    sources: [
      "frontend/src/components/Pages/Project/ResponsiveMiniMap.tsx",
      "frontend/src/forks/xyflow/minimap/MiniMap.tsx",
    ],
    symbols: ["ResponsiveMiniMap", "syncSelectedMiniMapNodes"],
    destination: "packages/workspace/tests/non-dnd-evidence.test.ts",
  },
  toolbar: {
    behavior:
      "named native controls, state/limit semantics, stable placements, and bounded host registration",
    sources: ["frontend/src/forks/xyflow/controls/Controls.tsx"],
    symbols: ["Controls"],
    destination: "packages/workspace/tests/non-dnd-evidence.test.ts",
  },
  chrome: {
    behavior:
      "semantic default, compact, transparent, and no-chrome variants with non-color state cues",
    sources: [
      "frontend/src/components/Section/Container/sectionChrome.ts",
      "frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx",
    ],
    symbols: ["getSectionContainerShellClassName", "SectionContainerCoreResizable"],
    destination: "packages/workspace/tests/non-dnd-evidence.test.ts",
  },
  accents: {
    behavior:
      "serializable accent/tag preview, one accepted commit, reset, local tokens, and minimap updates",
    sources: ["frontend/src/utils/sectionStyleColors.ts"],
    symbols: ["deriveSectionStyleTheme"],
    destination: "packages/workspace/tests/non-dnd-evidence.test.ts",
  },
  appearance: {
    behavior: "package-scoped light, dark, and system resolution with live media-query updates",
    sources: [
      "frontend/src/components/Pages/GlobalWrapper.tsx",
      "frontend/src/state/actions/localStorage.ts",
    ],
    symbols: ["GlobalWrapper", "useColorModePreference", "setColorModePreference"],
    destination: "packages/workspace/tests/non-dnd-evidence.test.ts",
  },
} as const;

export const NON_DND_BROWSER_EVIDENCE = [
  "frontend/tests/e2e/sections/section-sizing.spec.ts",
  "frontend/tests/e2e/sections/minimized-callable-edge-handles.spec.ts",
  "frontend/tests/e2e/sections/nested-marquee-selection.spec.ts",
  "frontend/tests/e2e/sections/multi-selection-drag.spec.ts",
  "frontend/tests/e2e/sections/minimap-selection-persistence.spec.ts",
  "frontend/tests/e2e/sections/pane-click-deselect-persists.spec.ts",
  "frontend/tests/e2e/editor/viewport-sync.spec.ts",
  "frontend/tests/e2e/params/params-section-scroll.spec.ts",
  "frontend/tests/e2e/editor/section-color-tags.spec.ts",
  "frontend/tests/e2e/editor/section-style-colors.spec.ts",
  "frontend/tests/e2e/settings/titlebar-theme-color.spec.ts",
] as const;

export const FIXTURE_ATTRIBUTION =
  "Behavioral fixtures are independently written. collision-characterization.ts and sorting-preview.ts closely port historical MIT-licensed algorithms; their exact source snapshot and retained notice are recorded in packages/workspace/THIRD_PARTY_NOTICES.md.";
