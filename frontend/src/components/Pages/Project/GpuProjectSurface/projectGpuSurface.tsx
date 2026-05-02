import { SectionContainer } from "components/Section/Container/SectionContainer";

import { useDndMode, useDndState } from "forks/dnd-kit/dndState";

import type { NodeDragItem } from "gpuFlow/flowTypes";

import { GpuFlow } from "gpuFlow/GpuFlow";

import type { GpuNodeLayout } from "gpuFlow/htmlSurfaces/frame";

import type { GpuEdgeInteractionEvent } from "gpuFlow/interactions/edges";

import { GPU_FLOW_CLASS_NAMES } from "gpuFlow/gpuFlowDomClasses";

import { cancelViewportTransition } from "gpuFlow/viewportActions";

import { useGpuFlowViewportStore } from "gpuFlow/viewportHooks";

import { gpuFlowViewportStore } from "gpuFlow/viewportStore";

import _ from "lodash";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

import {
  isValidDataEdgeConnection,
  reconnectEdgeFromConnection,
} from "state/actions/edges";

import {
  getNodeUpdateInformation,
  updateNodeDimensions,
} from "state/actions/nodeInternals";

import { getActiveSectionUIIds } from "state/activeSectionUI";

import {
  useAIFollow,
  useLocalStorage,
  useNodeInternals,
  useSettings,
} from "state/definitions";

import { useShareCapabilities } from "state/hooks/share";

import {
  CODEMIRROR_TOOLTIP_PARENT_ID,
  SETTA_POPOVER_PORTAL_PARENT_ID,
} from "utils/constants";

import { useTabScope } from "utils/focusManager";

import { AgenticScopeHighlightsUpdater } from "../AgenticScopeHighlightsUpdater";

import {
  selectProjectGpuEdge,
  useProjectGpuEdgeScene,
} from "../gpuProjectEdgeScene";

import { getProjectGpuGridInput } from "../gpuProjectGridInput";

import {
  isProjectGpuEdgeInteractionDisabled,
  isProjectGpuNodeDragDisabled,
  isProjectGpuSelectionDisabled,
  isProjectGpuViewportGestureDisabled,
  isProjectPaneBackgroundTarget,
  type ProjectGpuDndMode,
} from "../gpuProjectInteractionGuards";

import {
  handleProjectPaneClick,
  handleProjectPaneContextMenu,
  handleProjectPaneDragOver,
  handleProjectPaneDrop,
} from "../gpuProjectPaneEvents";

import {
  GpuProjectNodesSelectionOverlay,
  canDragProjectNode,
  getVisibleProjectSurfaceWidth,
  handleProjectNodeDrag,
  handleProjectNodeDragCancel,
  handleProjectNodeDragStart,
  handleProjectNodeDragStop,
  handleProjectSelectionChange,
  resolveProjectWireColor,
} from "./nodeSelectionOverlay";

export type ProjectSurfaceDimensions = {
  readonly height: number;
  readonly width: number;
};

export type ProjectSelectionDragState = {
  readonly pointerId: number;
  readonly selectedNodeIds: readonly string[];
  items: NodeDragItem[];
  lastFlowPoint: { x: number; y: number };
  lastScreenPoint: { x: number; y: number };
};

export type ProjectGpuNodeDragItem = {
  readonly distance: { readonly x: number; readonly y: number };
  readonly height: number | null;
  readonly nodeId: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly width: number | null;
};

export type ProjectGpuNodeDragChange = {
  readonly delta: { readonly x: number; readonly y: number };
  readonly items: readonly ProjectGpuNodeDragItem[];
};

export type ProjectGpuSelectionChange = {
  readonly active: boolean;
  readonly phase: "start" | "change" | "end" | "cancel";
  readonly selectedNodeIds: readonly string[];
};

export type ProjectGpuSurfaceSettings = ReturnType<
  typeof useProjectGpuSurfaceSettings
>;

export type ProjectFlowInteractionKeys = {
  readonly panActivationKeyPressed: boolean;
  readonly selectionKeyPressed: boolean;
  readonly zoomActivationKeyPressed: boolean;
};

export const PROJECT_SURFACE_STYLE: CSSProperties = {
  height: "100%",
  overflow: "hidden",
  overflowAnchor: "none",
  position: "relative",
  userSelect: "none",
  width: "100%",
};

export const PROJECT_GPU_NODE_UPLOAD_BUDGET = {
  maxDurationMs: 4,
  maxUploads: 2,
} as const;

export const SELECTION_ARROW_KEY_DIFFS: Record<
  string,
  { x: number; y: number }
> = {
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
      className={`${GPU_FLOW_CLASS_NAMES.root} setta-light dark:setta-dark`}
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
        readyToRender={readyToRender}
        settings={settings}
      />
      <GpuProjectNodesSelectionOverlay snapToGrid={snapToGrid} />
    </div>
  );
}

export function ProjectGpuFlowLayer({
  canEditStructure,
  darkMode,
  edgeScene,
  flowInteractionKeys,
  isFollowTransitioning,
  nodeElementChange,
  nodeLayouts,
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
  readonly readyToRender: boolean;
  readonly settings: ProjectGpuSurfaceSettings;
}) {
  const selectEdge = useProjectGpuEdgeSelection(canEditStructure);
  const dndMode = useDndMode();
  const edgeInteractionOptions = useMemo(
    () =>
      getProjectEdgeInteractionOptions({
        isFollowTransitioning,
        selectEdge,
      }),
    [isFollowTransitioning, selectEdge],
  );
  const edgePaletteInput = useMemo(
    () => getProjectGpuEdgePaletteInput({ darkMode, settings }),
    [darkMode, settings],
  );
  const edgeReconnectOptions = useMemo(
    () =>
      getProjectEdgeReconnectOptions({
        isFollowTransitioning,
      }),
    [isFollowTransitioning],
  );
  const gridInput = useMemo(
    () => getProjectGpuGridInput({ darkMode, settings }),
    [darkMode, settings],
  );
  const nodeDragOptions = useMemo(
    () =>
      getProjectNodeDragOptions({
        flowInteractionKeys,
        isFollowTransitioning,
        settings,
      }),
    [flowInteractionKeys, isFollowTransitioning, settings],
  );
  const panZoomOptions = useMemo(
    () =>
      getProjectPanZoomOptions({
        dndMode,
        flowInteractionKeys,
        settings,
      }),
    [dndMode, flowInteractionKeys, settings],
  );
  const selectionOptions = useMemo(
    () => ({
      isBackgroundTarget: (target: EventTarget) =>
        isProjectPaneBackgroundTarget(target),
      isSelecting: () =>
        gpuFlowViewportStore.getState().selectionKeyPressed &&
        !isProjectGpuSelectionDisabled({ dndMode }),
      mode: settings.selectionMode,
      onSelectionChange: handleProjectSelectionChange,
    }),
    [dndMode, settings.selectionMode],
  );
  useProjectGpuDndViewportTransitionCancel(dndMode);
  if (!readyToRender) {
    return null;
  }
  return (
    <GpuFlow
      className={`setta-gpu-flow ${GPU_FLOW_CLASS_NAMES.pane}`}
      edgeInteraction={edgeInteractionOptions}
      edgePalette={edgePaletteInput}
      edgeReconnect={edgeReconnectOptions}
      edgeScene={edgeScene}
      grid={gridInput}
      nodeDrag={nodeDragOptions}
      nodes={nodeLayouts}
      onNodeElementChange={nodeElementChange}
      onResize={handleProjectFlowResize}
      panZoom={panZoomOptions}
      renderNode={renderProjectGpuNode}
      selection={selectionOptions}
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

export function useProjectGpuDndViewportTransitionCancel(
  dndMode: ProjectGpuDndMode,
) {
  useEffect(() => {
    if (dndMode.isMovingFree || dndMode.isSorting) {
      cancelViewportTransition();
    }
  }, [dndMode.isMovingFree, dndMode.isSorting]);
}

export function useProjectGpuEdgeSelection(canEditStructure: boolean) {
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

export function getProjectEdgeInteractionOptions({
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

export function getProjectEdgeReconnectOptions({
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

export function renderProjectGpuNode(node: GpuNodeLayout) {
  return <SectionContainer sectionId={node.nodeId} isTopLevel={true} />;
}

export function getProjectGpuEdgePaletteInput({
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

export function handleProjectFlowResize(
  _: unknown,
  size: { readonly cssHeight: number; readonly cssWidth: number },
) {
  gpuFlowViewportStore.getState().setViewportSize({
    height: size.cssHeight,
    width: getVisibleProjectSurfaceWidth(size.cssWidth),
  });
}

export function getProjectSurfaceDataAttributes({
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

export function getProjectNodeDragOptions({
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

export function getProjectPanZoomOptions({
  dndMode,
  flowInteractionKeys,
  settings,
}: {
  readonly dndMode: ProjectGpuDndMode;
  readonly flowInteractionKeys: ProjectFlowInteractionKeys;
  readonly settings: ProjectGpuSurfaceSettings;
}) {
  const interactionEnabled = !isProjectGpuViewportGestureDisabled({
    dndMode,
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

export function booleanDataAttribute(value: boolean): "true" | "false" {
  return value ? "true" : "false";
}

export function useProjectGpuNodeLayouts(): readonly GpuNodeLayout[] {
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

export function useProjectGpuSurfaceSettings() {
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

export function useProjectViewportSettingsSync(
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

export function useProjectSurfaceDimensions(
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

export function useProjectNodeResizeObserver() {
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
