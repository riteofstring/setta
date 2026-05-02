import cc from "classcat";
import { SectionContainer } from "components/Section/Container/SectionContainer";
import { useDndMode, useDndState } from "forks/dnd-kit/dndState";
import {
  setSelectionDragHandle,
  setSelectionDragPrimaryId,
} from "forks/dnd-kit/selectionDragHandle";
import type { NodeDragItem } from "gpuFlow/flowTypes";
import { GpuFlow } from "gpuFlow/GpuFlow";
import type { GpuNodeLayout } from "gpuFlow/GpuNodeLayer";
import type { GpuGridInput } from "gpuFlow/gpuPipelines";
import type { GpuEdgeInteractionEvent } from "gpuFlow/interactions/edges";
import {
  clearNodesSelectionBounds,
  shiftNodesSelectionBounds,
  updateActiveNodesSelectionBounds,
} from "gpuFlow/selectionBounds";
import {
  cancelViewportTransition,
  screenToFlowPosition,
} from "gpuFlow/viewportActions";
import { useGpuFlowViewportStore } from "gpuFlow/viewportHooks";
import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import _ from "lodash";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import { setActiveSectionIds } from "state/actions/activeSections";
import {
  openPaneContextMenu,
  openSelectionContextMenu,
} from "state/actions/contextMenus";
import {
  isValidDataEdgeConnection,
  reconnectEdgeFromConnection,
} from "state/actions/edges";
import {
  getNodeUpdateInformation,
  getNodes,
  raiseTempZIndex,
  updateNodeDimensions,
  updateNodePositions,
} from "state/actions/nodeInternals";
import { addTemporaryNotification } from "state/actions/notifications";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { openFileAsSectionForDrop } from "state/actions/sections/createSections";
import { setZIndices } from "state/actions/sections/sectionPositions";
import {
  getActiveSectionUIIds,
  useActiveSectionUI,
} from "state/activeSectionUI";
import {
  useAIFollow,
  useLocalStorage,
  useMisc,
  useNodeInternals,
  useProjectState,
  useSettings,
} from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  CODEMIRROR_TOOLTIP_PARENT_ID,
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_POPOVER_PORTAL_PARENT_ID,
} from "utils/constants";
import { getFileBrowserDragPayload } from "utils/fileBrowserDragPayload";
import { useTabScope } from "utils/focusManager";
import { NotificationTypeEnum } from "utils/generatedTypes";
import { importNativeFileToWorkspace } from "utils/nativeFileImport";
import { AgenticScopeHighlightsUpdater } from "./AgenticScopeHighlightsUpdater";
import {
  selectProjectGpuEdge,
  useProjectGpuEdgeScene,
} from "./gpuProjectEdgeScene";
import {
  isProjectGpuEdgeInteractionDisabled,
  isProjectGpuNodeDragDisabled,
  isProjectPaneBackgroundTarget,
  isProjectGpuSelectionBoxDragDisabled,
  isProjectGpuSelectionDisabled,
  isProjectGpuViewportGestureDisabled,
  shouldShiftProjectGpuSelectionBoundsForNodeMove,
  type ProjectGpuDndMode,
} from "./gpuProjectInteractionGuards";
import {
  buildProjectSelectionKeyboardNudgePlan,
  snapProjectNodePosition,
} from "./gpuProjectSelectionMovement";

type ProjectSurfaceDimensions = {
  readonly height: number;
  readonly width: number;
};

type ProjectSelectionDragState = {
  readonly pointerId: number;
  readonly selectedNodeIds: readonly string[];
  items: NodeDragItem[];
  lastFlowPoint: { x: number; y: number };
};

type ProjectGpuNodeDragItem = {
  readonly distance: { readonly x: number; readonly y: number };
  readonly height: number | null;
  readonly nodeId: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly width: number | null;
};

type ProjectGpuNodeDragChange = {
  readonly delta: { readonly x: number; readonly y: number };
  readonly items: readonly ProjectGpuNodeDragItem[];
};

type ProjectGpuSelectionChange = {
  readonly active: boolean;
  readonly phase: "start" | "change" | "end" | "cancel";
  readonly selectedNodeIds: readonly string[];
};

type ProjectGpuSurfaceSettings = ReturnType<
  typeof useProjectGpuSurfaceSettings
>;

type ProjectFlowInteractionKeys = {
  readonly panActivationKeyPressed: boolean;
  readonly selectionKeyPressed: boolean;
  readonly zoomActivationKeyPressed: boolean;
};

const PROJECT_SURFACE_STYLE: CSSProperties = {
  height: "100%",
  overflow: "hidden",
  overflowAnchor: "none",
  position: "relative",
  userSelect: "none",
  width: "100%",
};

const PROJECT_GPU_NODE_UPLOAD_BUDGET = {
  maxDurationMs: 4,
  maxUploads: 2,
} as const;

const SELECTION_ARROW_KEY_DIFFS: Record<string, { x: number; y: number }> = {
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
};

export function GpuProjectSurface() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const nodeElementChange = useProjectNodeResizeObserver();
  const dimensions = useProjectSurfaceDimensions(rootRef);
  const nodeLayouts = useProjectGpuNodeLayouts();
  const settings = useProjectGpuSurfaceSettings();
  const showAgenticEdges = useLocalStorage((state) => state.showAgenticEdges);
  const showDataEdges = useLocalStorage((state) => state.showArgEdges);
  const darkMode = useLocalStorage((state) => state.darkMode);
  const snapToGrid = useLocalStorage((state) => state.snapToGrid);
  const isConnecting = useGpuFlowViewportStore(
    (state) => state.connectionStartHandle !== null,
  );
  const readyToBeVisible = useGpuFlowViewportStore(
    (state) => !state.fitViewOnInit || state.fitViewOnInitDone,
  );
  const edgeScene = useProjectGpuEdgeScene({
    showAgenticEdges,
    showDataEdges,
  });
  const { canEditStructure } = useShareCapabilities();
  const isFollowTransitioning = useAIFollow(
    (state) => state.isFollowTransitioning,
  );
  const flowInteractionKeys = useGpuFlowViewportStore(
    (state) => ({
      panActivationKeyPressed: state.panActivationKeyPressed,
      selectionKeyPressed: state.selectionKeyPressed,
      zoomActivationKeyPressed: state.zoomActivationKeyPressed,
    }),
    _.isEqual,
  );
  const readyToRender = dimensions.height > 0 && dimensions.width > 0;

  useProjectViewportSettingsSync(settings);
  useTabScope({
    behavior: "canvas",
    order: 20,
    rootRef: rootRef as RefObject<HTMLElement>,
    scopeId: "canvas",
  });

  return (
    <div
      className="react-flow setta-light dark:setta-dark"
      {...getProjectSurfaceDataAttributes({
        isConnecting,
        showAgenticEdges,
        showDataEdges,
      })}
      data-tab-scope="canvas"
      onClick={handleProjectPaneClick}
      onContextMenu={handleProjectPaneContextMenu(settings.panOnDrag)}
      onDragOver={handleProjectPaneDragOver}
      onDrop={handleProjectPaneDrop}
      ref={rootRef}
      style={
        {
          ...PROJECT_SURFACE_STYLE,
          "--setta-wire-color": resolveProjectWireColor({
            darkMode,
            settings,
          }),
        } as CSSProperties
      }
    >
      <AgenticScopeHighlightsUpdater />
      <ProjectGpuFlowLayer
        canEditStructure={canEditStructure}
        darkMode={darkMode}
        edgeScene={edgeScene}
        flowInteractionKeys={flowInteractionKeys}
        isFollowTransitioning={isFollowTransitioning}
        nodeElementChange={nodeElementChange}
        nodeLayouts={nodeLayouts}
        readyToBeVisible={readyToBeVisible}
        readyToRender={readyToRender}
        settings={settings}
      />
      <GpuProjectNodesSelectionOverlay snapToGrid={snapToGrid} />
    </div>
  );
}

function ProjectGpuFlowLayer({
  canEditStructure,
  darkMode,
  edgeScene,
  flowInteractionKeys,
  isFollowTransitioning,
  nodeElementChange,
  nodeLayouts,
  readyToBeVisible,
  readyToRender,
  settings,
}: {
  readonly canEditStructure: boolean;
  readonly darkMode: boolean;
  readonly edgeScene: ReturnType<typeof useProjectGpuEdgeScene>;
  readonly flowInteractionKeys: ProjectFlowInteractionKeys;
  readonly isFollowTransitioning: boolean;
  readonly nodeElementChange: (
    nodeId: string,
    element: HTMLElement | null,
  ) => void;
  readonly nodeLayouts: readonly GpuNodeLayout[];
  readonly readyToBeVisible: boolean;
  readonly readyToRender: boolean;
  readonly settings: ProjectGpuSurfaceSettings;
}) {
  const selectEdge = useProjectGpuEdgeSelection(canEditStructure);
  const dndMode = useDndMode();
  useProjectGpuDndViewportTransitionCancel(dndMode);
  if (!readyToRender) {
    return null;
  }
  return (
    <GpuFlow
      className="setta-gpu-flow react-flow__pane"
      edgeInteraction={getProjectEdgeInteractionOptions({
        isFollowTransitioning,
        selectEdge,
      })}
      edgePalette={getProjectGpuEdgePaletteInput({ darkMode, settings })}
      edgeReconnect={getProjectEdgeReconnectOptions({
        isFollowTransitioning,
      })}
      edgeScene={edgeScene}
      grid={getProjectGpuGridInput({ darkMode, settings })}
      nodeDrag={getProjectNodeDragOptions({
        flowInteractionKeys,
        isFollowTransitioning,
        settings,
      })}
      nodeVisibility={readyToBeVisible ? "visible" : "hidden"}
      nodes={nodeLayouts}
      onNodeElementChange={nodeElementChange}
      onResize={handleProjectFlowResize}
      panZoom={getProjectPanZoomOptions({
        dndMode,
        flowInteractionKeys,
        isFollowTransitioning,
        settings,
      })}
      renderNode={renderProjectGpuNode}
      selection={{
        isBackgroundTarget: (target) => isProjectPaneBackgroundTarget(target),
        isSelecting: () =>
          gpuFlowViewportStore.getState().selectionKeyPressed &&
          !isProjectGpuSelectionDisabled({ dndMode }),
        mode: settings.selectionMode,
        onSelectionChange: handleProjectSelectionChange,
      }}
      uploadBudget={PROJECT_GPU_NODE_UPLOAD_BUDGET}
    >
      <div
        className="setta-codemirror-tooltips"
        id={CODEMIRROR_TOOLTIP_PARENT_ID}
      />
      <div
        className="setta-popover-portals"
        id={SETTA_POPOVER_PORTAL_PARENT_ID}
      />
    </GpuFlow>
  );
}

function useProjectGpuDndViewportTransitionCancel(dndMode: ProjectGpuDndMode) {
  useEffect(() => {
    if (dndMode.isMovingFree || dndMode.isSorting) {
      cancelViewportTransition();
    }
  }, [dndMode.isMovingFree, dndMode.isSorting]);
}

function useProjectGpuEdgeSelection(canEditStructure: boolean) {
  return useCallback(
    (event: Pick<GpuEdgeInteractionEvent, "edgeId" | "family">) => {
      selectProjectGpuEdge({
        canEditStructure,
        event,
        multiSelect: gpuFlowViewportStore.getState().multiSelectionActive,
      });
    },
    [canEditStructure],
  );
}

function getProjectEdgeInteractionOptions({
  isFollowTransitioning,
  selectEdge,
}: {
  readonly isFollowTransitioning: boolean;
  readonly selectEdge: (
    event: Pick<GpuEdgeInteractionEvent, "edgeId" | "family">,
  ) => void;
}) {
  return {
    disabled: () => {
      const dndState = useDndState.getState();
      const viewportState = gpuFlowViewportStore.getState();
      return isProjectGpuEdgeInteractionDisabled({
        connectionActive: viewportState.connectionStartHandle !== null,
        dndMode: {
          isMovingFree: dndState.isMovingFree,
          isSorting: dndState.isSorting,
        },
        isDndActive: dndState.activeId !== null,
        isFollowTransitioning,
        userSelectionActive: viewportState.userSelectionActive,
        viewportInteractionActive: viewportState.viewportInteractionActive,
      });
    },
    onEdgeClick: selectEdge,
    onEdgeContextMenu: selectEdge,
  };
}

function getProjectEdgeReconnectOptions({
  isFollowTransitioning,
}: {
  readonly isFollowTransitioning: boolean;
}) {
  return {
    disabled: () => {
      const dndState = useDndState.getState();
      const viewportState = gpuFlowViewportStore.getState();
      return isProjectGpuEdgeInteractionDisabled({
        connectionActive: viewportState.connectionStartHandle !== null,
        dndMode: {
          isMovingFree: dndState.isMovingFree,
          isSorting: dndState.isSorting,
        },
        isDndActive: dndState.activeId !== null,
        isFollowTransitioning,
        userSelectionActive: viewportState.userSelectionActive,
        viewportInteractionActive: viewportState.viewportInteractionActive,
      });
    },
    isValidConnection: isValidDataEdgeConnection,
    onReconnect: reconnectEdgeFromConnection,
  };
}

function renderProjectGpuNode(node: GpuNodeLayout) {
  return <SectionContainer sectionId={node.nodeId} isTopLevel={true} />;
}

function getProjectGpuGridInput({
  darkMode,
  settings,
}: {
  readonly darkMode: boolean;
  readonly settings: ProjectGpuSurfaceSettings;
}): GpuGridInput | undefined {
  if (!settings.showGridLines) {
    return undefined;
  }
  return {
    color: darkMode ? settings.gridColorDarkMode : settings.gridColor,
    patternSize: settings.gridPatternSize,
    snapGrid: settings.snapGrid,
    variant: settings.gridPattern,
  };
}

function getProjectGpuEdgePaletteInput({
  darkMode,
  settings,
}: {
  readonly darkMode: boolean;
  readonly settings: ProjectGpuSurfaceSettings;
}) {
  return {
    color: resolveProjectWireColor({ darkMode, settings }),
  };
}

function handleProjectFlowResize(
  _: unknown,
  size: { readonly cssHeight: number; readonly cssWidth: number },
) {
  gpuFlowViewportStore.getState().setViewportSize({
    height: size.cssHeight,
    width: getVisibleProjectSurfaceWidth(size.cssWidth),
  });
}

function getProjectSurfaceDataAttributes({
  isConnecting,
  showAgenticEdges,
  showDataEdges,
}: {
  readonly isConnecting: boolean;
  readonly showAgenticEdges: boolean;
  readonly showDataEdges: boolean;
}) {
  return {
    "data-connecting": booleanDataAttribute(isConnecting),
    "data-show-agentic-edges": booleanDataAttribute(showAgenticEdges),
    "data-show-arg-edges": booleanDataAttribute(showDataEdges),
  };
}

function getProjectNodeDragOptions({
  flowInteractionKeys,
  isFollowTransitioning,
  settings,
}: {
  readonly flowInteractionKeys: ProjectFlowInteractionKeys;
  readonly isFollowTransitioning: boolean;
  readonly settings: ProjectGpuSurfaceSettings;
}) {
  return {
    autoPanOnNodeDrag: true,
    canDragNode: canDragProjectNode,
    disabled: () => {
      const dndState = useDndState.getState();
      return isProjectGpuNodeDragDisabled({
        dndMode: {
          isMovingFree: dndState.isMovingFree,
          isSorting: dndState.isSorting,
        },
        isFollowTransitioning,
        panActivationKeyPressed: flowInteractionKeys.panActivationKeyPressed,
      });
    },
    getSelectedNodeIds: getActiveSectionUIIds,
    nodeDragThresholdPx: 1,
    onNodeDrag: handleProjectNodeDrag,
    onNodeDragCancel: handleProjectNodeDragCancel,
    onNodeDragStart: handleProjectNodeDragStart,
    onNodeDragStop: handleProjectNodeDragStop,
    snapGrid: settings.snapGrid,
    snapToGrid: () => useLocalStorage.getState().snapToGrid,
  };
}

function getProjectPanZoomOptions({
  dndMode,
  flowInteractionKeys,
  isFollowTransitioning,
  settings,
}: {
  readonly dndMode: ProjectGpuDndMode;
  readonly flowInteractionKeys: ProjectFlowInteractionKeys;
  readonly isFollowTransitioning: boolean;
  readonly settings: ProjectGpuSurfaceSettings;
}) {
  const interactionEnabled = !isProjectGpuViewportGestureDisabled({
    dndMode,
    isFollowTransitioning,
  });
  return {
    panActivationKeyPressed:
      interactionEnabled && flowInteractionKeys.panActivationKeyPressed,
    panOnDrag:
      interactionEnabled &&
      !flowInteractionKeys.selectionKeyPressed &&
      settings.panOnDrag,
    panOnScroll: interactionEnabled && settings.panOnScroll,
    panOnScrollMode: settings.panOnScrollMode,
    panOnScrollSpeed: settings.panOnScrollSpeed,
    zoomActivationKeyPressed:
      interactionEnabled && flowInteractionKeys.zoomActivationKeyPressed,
    zoomOnDoubleClick: interactionEnabled && settings.zoomOnDoubleClick,
    zoomOnPinch: interactionEnabled && settings.zoomOnPinch,
    zoomOnScroll: interactionEnabled && settings.zoomOnScroll,
  };
}

function booleanDataAttribute(value: boolean): "true" | "false" {
  return value ? "true" : "false";
}

function useProjectGpuNodeLayouts(): readonly GpuNodeLayout[] {
  return useNodeInternals(
    (state) =>
      Array.from(state.x.values()).map((node) => ({
        height: node.height,
        nodeId: node.id,
        tempZIndex: node.tempZIndex,
        width: node.width,
        x: node.position.x,
        y: node.position.y,
        zIndex: node.zIndex,
      })),
    _.isEqual,
  );
}

function useProjectGpuSurfaceSettings() {
  return useSettings(
    (state) => ({
      defaultZoomLevel: state.gui.defaultZoomLevel,
      gridColor: state.gui.gridColor,
      gridColorDarkMode: state.gui.gridColorDarkMode,
      gridPattern: state.gui.gridPattern,
      gridPatternSize: state.gui.gridPatternSize,
      maxZoom: state.gui.maxZoom,
      minZoom: state.gui.minZoom,
      panOnDrag: state.gui.panOnDrag,
      panOnScroll: state.gui.panOnScroll,
      panOnScrollMode: state.gui.panOnScrollMode,
      panOnScrollSpeed: state.gui.panOnScrollSpeed,
      selectionMode: state.gui.selectionMode,
      showGridLines: !!state.gui.showGridLines,
      snapGrid: state.gui.snapGrid,
      wireColor: (state.gui as unknown as { wireColor?: string }).wireColor,
      wireColorDarkMode: (
        state.gui as unknown as { wireColorDarkMode?: string }
      ).wireColorDarkMode,
      zoomOnDoubleClick: state.gui.zoomOnDoubleClick,
      zoomOnPinch: state.gui.zoomOnPinch,
      zoomOnScroll: state.gui.zoomOnScroll,
    }),
    _.isEqual,
  );
}

function useProjectViewportSettingsSync(
  settings: ReturnType<typeof useProjectGpuSurfaceSettings>,
) {
  useEffect(() => {
    gpuFlowViewportStore.getState().setZoomBounds({
      defaultZoom: settings.defaultZoomLevel,
      maxZoom: settings.maxZoom,
      minZoom: settings.minZoom,
    });
  }, [settings.defaultZoomLevel, settings.maxZoom, settings.minZoom]);
}

function useProjectSurfaceDimensions(
  ref: RefObject<HTMLDivElement | null>,
): ProjectSurfaceDimensions {
  const [dimensions, setDimensions] = useState<ProjectSurfaceDimensions>({
    height: 0,
    width: 0,
  });

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const nextDimensions = {
        height: entry.contentRect.height,
        width: entry.contentRect.width,
      };
      setDimensions(nextDimensions);
      gpuFlowViewportStore.getState().setViewportSize({
        height: nextDimensions.height,
        width: getVisibleProjectSurfaceWidth(nextDimensions.width),
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return dimensions;
}

function useProjectNodeResizeObserver() {
  const observerRef = useRef<ResizeObserver | null>(null);
  const elementByNodeId = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    observerRef.current = new ResizeObserver((entries) => {
      const updates = getNodeUpdateInformation(entries, true);
      updateNodeDimensions(updates);
    });
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      elementByNodeId.current.clear();
    };
  }, []);

  return useCallback((nodeId: string, element: HTMLElement | null) => {
    const previousElement = elementByNodeId.current.get(nodeId);
    const observer = observerRef.current;
    if (previousElement && previousElement !== element) {
      observer?.unobserve(previousElement);
      elementByNodeId.current.delete(nodeId);
    }
    if (!element) {
      return;
    }
    elementByNodeId.current.set(nodeId, element);
    observer?.observe(element);
  }, []);
}

function GpuProjectNodesSelectionOverlay({
  snapToGrid,
}: {
  readonly snapToGrid: boolean;
}) {
  const bounds = useGpuFlowViewportStore(
    (state) => state.nodesSelectionBounds,
    _.isEqual,
  );
  const transformString = useGpuFlowViewportStore(
    (state) =>
      `translate(${state.transform[0]}px,${state.transform[1]}px) scale(${state.transform[2]})`,
  );
  const { isMovingFree, isSorting } = useDndMode();
  const activeIds = useActiveSectionUI((state) => state.activeIds, _.isEqual);
  const primarySelectionId =
    activeIds.length > 0 ? activeIds[activeIds.length - 1] ?? null : null;
  const hasSelectionBounds = bounds !== null;
  const rectRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<ProjectSelectionDragState | null>(null);

  useEffect(() => {
    setSelectionDragPrimaryId(primarySelectionId);
  }, [primarySelectionId]);

  useEffect(() => {
    return () => {
      setSelectionDragPrimaryId(null);
      setSelectionDragHandle(null);
    };
  }, []);

  useEffect(() => {
    if (!isMovingFree) {
      setSelectionDragHandle(null);
      return;
    }
    setSelectionDragHandle(rectRef.current);
    return () => {
      setSelectionDragHandle(null);
    };
  }, [isMovingFree, bounds]);

  useEffect(() => {
    if (hasSelectionBounds && primarySelectionId) {
      rectRef.current?.focus({ preventScroll: true });
    }
  }, [hasSelectionBounds, primarySelectionId]);

  if (!bounds || !primarySelectionId) {
    return null;
  }

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const activeSectionIds = getActiveSectionUIIds();
    const selectedNodeIds = getNodes()
      .filter((node) => activeSectionIds.includes(node.id))
      .map((node) => node.id);
    openSelectionContextMenu(event, selectedNodeIds);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const diff = SELECTION_ARROW_KEY_DIFFS[event.key];
    if (!diff) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    updateSelectedNodePositionsFromKeyboard({
      isShiftPressed: event.shiftKey,
      x: diff.x,
      y: diff.y,
    });
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      event.button !== 0 ||
      isProjectGpuSelectionBoxDragDisabled({
        dndMode: { isMovingFree, isSorting },
      }) ||
      eventTargetsNoDragElement(event.nativeEvent)
    ) {
      return;
    }
    const selectedNodeIds = getActiveSectionUIIds();
    if (selectedNodeIds.length === 0) {
      return;
    }
    const selectedNodes = getNodes().filter(
      (node) =>
        selectedNodeIds.includes(node.id) && canDragProjectNode(node.id),
    );
    if (selectedNodes.length === 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    rectRef.current?.focus({ preventScroll: true });
    raiseTempZIndex(selectedNodes);
    useMisc.setState({ mouseDownDraggingSection: true });
    gpuFlowViewportStore
      .getState()
      .setViewportInteractionFlags({ nodeDragging: true });
    dragStateRef.current = {
      items: selectedNodes.map((node) => ({
        distance: { x: 0, y: 0 },
        height: node.height,
        id: node.id,
        position: { ...node.position },
        width: node.width,
      })),
      lastFlowPoint: screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }),
      pointerId: event.pointerId,
      selectedNodeIds: selectedNodes.map((node) => node.id),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleSelectionDragPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nextFlowPoint = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    const delta = {
      x: nextFlowPoint.x - dragState.lastFlowPoint.x,
      y: nextFlowPoint.y - dragState.lastFlowPoint.y,
    };
    if (delta.x === 0 && delta.y === 0) {
      return;
    }
    dragState.lastFlowPoint = nextFlowPoint;
    dragState.items = dragState.items.map((item) => ({
      ...item,
      position: {
        x: item.position.x + delta.x,
        y: item.position.y + delta.y,
      },
    }));
    updateNodePositions(dragState.items);
    updateProjectSelectionBoundsAfterMovedNodes({
      delta,
      movedNodeIds: dragState.items.map((item) => item.id),
    });
  };

  const handleSelectionDragPointerUp = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (snapToGrid) {
      const snapGrid = useSettings.getState().gui.snapGrid;
      dragState.items = dragState.items.map((item) => ({
        ...item,
        position: snapProjectNodePosition(item.position, snapGrid),
      }));
      updateNodePositions(dragState.items);
    }
    finishProjectSelectionDrag(dragStateRef);
  };

  const handleSelectionDragPointerCancel = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
    finishProjectSelectionDrag(dragStateRef);
  };

  return (
    <div
      className={cc([
        "react-flow__nodesselection",
        "react-flow__container",
        NO_PAN_CLASS_NAME,
      ])}
      style={{ transform: transformString }}
    >
      <div
        className="react-flow__nodesselection-rect"
        data-id={primarySelectionId}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handleSelectionDragPointerMove}
        onPointerUp={handleSelectionDragPointerUp}
        onPointerCancel={handleSelectionDragPointerCancel}
        ref={rectRef}
        style={{
          height: bounds.height,
          left: bounds.x,
          pointerEvents: isSorting ? "none" : undefined,
          top: bounds.y,
          width: bounds.width,
        }}
        tabIndex={-1}
      />
    </div>
  );
}

function finishProjectSelectionDrag(
  dragStateRef: RefObject<ProjectSelectionDragState | null>,
) {
  const dragState = dragStateRef.current;
  dragStateRef.current = null;
  useMisc.setState({ mouseDownDraggingSection: false });
  gpuFlowViewportStore
    .getState()
    .setViewportInteractionFlags({ nodeDragging: false });
  if (!dragState) {
    return;
  }
  setZIndices([...dragState.selectedNodeIds], true);
  updateActiveNodesSelectionBounds();
}

function handleProjectNodeDragStart(change: ProjectGpuNodeDragChange) {
  const nodesById = useNodeInternals.getState().x;
  const nodes = change.items
    .map((item) => nodesById.get(item.nodeId))
    .filter((node) => node !== undefined);
  raiseTempZIndex(nodes);
  useMisc.setState({ mouseDownDraggingSection: true });
}

function handleProjectNodeDrag(change: ProjectGpuNodeDragChange) {
  updateNodePositions(toNodeDragItems(change.items));
  updateProjectSelectionBoundsAfterMovedNodes({
    delta: change.delta,
    movedNodeIds: change.items.map((item) => item.nodeId),
  });
}

function handleProjectNodeDragStop(change: ProjectGpuNodeDragChange) {
  updateNodePositions(toNodeDragItems(change.items));
  useMisc.setState({ mouseDownDraggingSection: false });
  setZIndices(
    change.items.map((item) => item.nodeId),
    true,
  );
  if (gpuFlowViewportStore.getState().nodesSelectionBounds) {
    updateActiveNodesSelectionBounds();
  }
}

function handleProjectNodeDragCancel(change: ProjectGpuNodeDragChange) {
  useMisc.setState({ mouseDownDraggingSection: false });
  setZIndices(
    change.items.map((item) => item.nodeId),
    true,
  );
  if (gpuFlowViewportStore.getState().nodesSelectionBounds) {
    updateActiveNodesSelectionBounds();
  }
}

function handleProjectSelectionChange(change: ProjectGpuSelectionChange) {
  if (change.phase === "start") {
    applyActiveSectionChange(
      { interaction: "selection-rect", selectedIds: [] },
      { syncMode: "ui-only" },
    );
    return;
  }
  if (change.phase === "change") {
    applyActiveSectionChange(
      {
        interaction: "selection-rect",
        selectedIds: [...change.selectedNodeIds],
      },
      { syncMode: "ui-only" },
    );
    return;
  }
  if (change.phase === "end") {
    if (change.selectedNodeIds.length > 0) {
      updateActiveNodesSelectionBounds();
    }
    if (change.active) {
      setActiveSectionIds(getActiveSectionUIIds(), {
        forceDurableSync: true,
      });
    }
  }
}

function handleProjectPaneClick(event: ReactMouseEvent<HTMLDivElement>) {
  if (!isProjectPaneBackgroundTarget(event.target)) {
    return;
  }
  if (useMisc.getState().mouseDownDrawArea) {
    useMisc.setState({ mouseDownDrawArea: false });
    return;
  }
  if (gpuFlowViewportStore.getState().userSelectionActive) {
    return;
  }
  applyActiveSectionChange({ interaction: "pane-click" });
  useMisc.setState({
    lastPaneClickLocation: screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    }),
  });
  clearNodesSelectionBounds();
}

function handleProjectPaneContextMenu(panOnDrag: boolean | readonly number[]) {
  return (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isProjectPaneBackgroundTarget(event.target)) {
      return;
    }
    if (Array.isArray(panOnDrag) && panOnDrag.includes(2)) {
      event.preventDefault();
      return;
    }
    openPaneContextMenu(event);
  };
}

function handleProjectPaneDragOver(event: ReactDragEvent<HTMLDivElement>) {
  if (!isProjectPaneBackgroundTarget(event.target)) {
    return;
  }
  const payload = getFileBrowserDragPayload(event.dataTransfer);
  const hasNativeFiles = event.dataTransfer.files.length > 0;
  if ((!payload || payload.type !== "file") && !hasNativeFiles) {
    return;
  }
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
}

function handleProjectPaneDrop(event: ReactDragEvent<HTMLDivElement>) {
  if (!isProjectPaneBackgroundTarget(event.target)) {
    return;
  }
  const position = screenToFlowPosition({
    x: event.clientX,
    y: event.clientY,
  });
  const payload = getFileBrowserDragPayload(event.dataTransfer);
  const openFileForDrop = async (filePath: string, fileName: string) => {
    const result = await openFileAsSectionForDrop({
      fileName,
      filePath,
      focusOnSection: false,
      position,
    });
    if (result.status === "unsupported_binary") {
      addTemporaryNotification(
        "Binary files cannot be auto-opened as sections from drag-and-drop.",
        NotificationTypeEnum.warning,
      );
      return;
    }
    if (result.status === "failed") {
      addTemporaryNotification(
        "Failed to create a section from the dropped file.",
        NotificationTypeEnum.error,
      );
    }
  };
  if (payload && payload.type === "file") {
    event.preventDefault();
    void openFileForDrop(payload.fullPath, payload.name);
    return;
  }
  const nativeFile = event.dataTransfer.files.item(0);
  if (!nativeFile) {
    return;
  }
  event.preventDefault();
  const openNativeFileDrop = async () => {
    const importResult = await importNativeFileToWorkspace(nativeFile);
    if (importResult.status !== "ok") {
      addTemporaryNotification(importResult.error, NotificationTypeEnum.error);
      return;
    }
    await openFileForDrop(importResult.filePath, importResult.fileName);
  };
  void openNativeFileDrop();
}

function updateSelectedNodePositionsFromKeyboard({
  isShiftPressed,
  x,
  y,
}: {
  readonly isShiftPressed: boolean;
  readonly x: number;
  readonly y: number;
}) {
  const nodesSelectionBounds =
    gpuFlowViewportStore.getState().nodesSelectionBounds;
  const { snapGrid } = useSettings.getState().gui;
  const snapToGrid = useLocalStorage.getState().snapToGrid;
  const activeSectionIds = getActiveSectionUIIds();
  const selectedNodes = getNodes().filter(
    (node) => activeSectionIds.includes(node.id) && canDragProjectNode(node.id),
  );
  const nudgePlan = buildProjectSelectionKeyboardNudgePlan({
    direction: { x, y },
    isShiftPressed,
    selectedNodes,
    snapGrid,
    snapToGrid,
  });
  if (!nudgePlan) {
    return;
  }
  updateNodePositions(nudgePlan.items);
  if (nodesSelectionBounds) {
    updateProjectSelectionBoundsAfterMovedNodes({
      delta: nudgePlan.delta,
      forceRefresh: nudgePlan.forceRefreshBounds,
      movedNodeIds: nudgePlan.items.map((item) => item.id),
    });
  }
}

function updateProjectSelectionBoundsAfterMovedNodes({
  delta,
  forceRefresh = false,
  movedNodeIds,
}: {
  readonly delta: { readonly x: number; readonly y: number };
  readonly forceRefresh?: boolean | undefined;
  readonly movedNodeIds: readonly string[];
}) {
  if (!gpuFlowViewportStore.getState().nodesSelectionBounds) {
    return;
  }
  if (
    !forceRefresh &&
    shouldShiftProjectGpuSelectionBoundsForNodeMove({
      activeSelectedNodeIds: getActiveSectionUIIds(),
      movedNodeIds,
    })
  ) {
    shiftNodesSelectionBounds(delta);
    return;
  }
  updateActiveNodesSelectionBounds();
}

function toNodeDragItems(
  items: readonly ProjectGpuNodeDragItem[],
): NodeDragItem[] {
  return items.map((item) => ({
    distance: item.distance,
    height: item.height,
    id: item.nodeId,
    position: item.position,
    width: item.width,
  }));
}

function canDragProjectNode(nodeId: string): boolean {
  return !getCurrEffectiveSectionImpl(useProjectState.getState(), nodeId)
    .positionAndSizeLocked;
}

function eventTargetsNoDragElement(event: Event): boolean {
  const target = event.target;
  return (
    target instanceof Element &&
    target.closest(`.${NO_DRAG_CLASS_NAME}`) !== null
  );
}

function resolveProjectWireColor({
  darkMode,
  settings,
}: {
  readonly darkMode: boolean;
  readonly settings: ReturnType<typeof useProjectGpuSurfaceSettings>;
}): string {
  const light = settings.wireColor ?? "#41506c";
  const dark = settings.wireColorDarkMode ?? "#bac2d3";
  return darkMode ? dark : light;
}

function getVisibleProjectSurfaceWidth(width: number): number {
  const localStorageState = useLocalStorage.getState();
  return (
    width -
      localStorageState.overviewTrueWidth -
      localStorageState.uiEditorTrueWidth || 500
  );
}
