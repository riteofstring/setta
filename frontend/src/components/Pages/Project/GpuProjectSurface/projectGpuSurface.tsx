import { SectionContainer } from "components/Section/Container/SectionContainer";

import { GpuFlow } from "gpuFlow/GpuFlow";

import type { GpuNodeLayout } from "gpuFlow/htmlSurfaces/frame";

import type { GpuEdgeInteractionEvent } from "gpuFlow/interactions/edges";
import type { GpuRetainedContentKeyboardNavigationEvent } from "gpuFlow/interactions/retainedContentKeyboard";
import type { GpuSelectionDragControllerOptions } from "gpuFlow/interactions/selectionDrag";
import type { GpuFlowScene, GpuSectionSceneNode } from "gpuFlow/scene";

import { GPU_FLOW_CLASS_NAMES } from "gpuFlow/gpuFlowDomClasses";

import type { GpuFlowLayoutStoreApi } from "gpuFlow/layoutStore";

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

import { closeAllContextMenus } from "state/actions/contextMenus";
import {
  isValidDataEdgeConnection,
  reconnectEdgeFromConnection,
} from "state/actions/edges";
import { selectOnlyParam } from "state/actions/params/moveParams";

import {
  getActiveSectionUIIds,
  useActiveSectionUI,
} from "state/activeSectionUI";

import {
  useAIFollow,
  useLocalStorage,
  useMisc,
  useProjectState,
  useSettings,
} from "state/definitions";

import { useShareCapabilities } from "state/hooks/share";

import { useTabScope } from "utils/focusManager";

import { AgenticScopeHighlightsUpdater } from "../AgenticScopeHighlightsUpdater";

import {
  selectProjectGpuEdge,
  useProjectGpuEdgeScene,
} from "../gpuProjectEdgeScene";

import { getProjectGpuGridInput } from "../gpuProjectGridInput";

import { PROJECT_GPU_NODE_UPLOAD_BUDGET } from "./gpuProjectUploadBudget";
import { shouldClearProjectGpuActiveParamDomIslandOnPointerDown } from "./projectGpuActiveParamDomIslandDeactivation";
import { PROJECT_GPU_FLOW_FRAME_PERFORMANCE_REPORTER } from "./projectGpuFramePerformance";
import { getProjectGpuAutoPanInsetsPx } from "./projectGpuHandleAdapter";
import {
  useProjectGpuLayoutAdapter,
  type ProjectGpuActiveParamDomIsland,
  type ProjectGpuLayoutAdapter,
  type ProjectGpuRetainedParamTarget,
} from "./projectGpuLayoutAdapter";
import { getProjectGpuRetainedParamNavigationTarget } from "./projectGpuParamContentAdapter";
import type {
  ProjectGpuRetainedParamDragPreview,
  ProjectGpuRetainedParamDragSession,
} from "./projectGpuParamDragAdapter";
import { getProjectGpuPortalDescriptors } from "./projectGpuPortalAdapter";
import {
  getProjectRetainedContentConnectionOptions,
  getProjectRetainedContentInteractionOptions,
  getProjectScenePortConnectionOptions,
  renderProjectGpuDomIsland,
} from "./projectGpuRetainedParamInteractionAdapter";
import { useProjectNodeIntrinsicSizeObserver } from "./projectNodeIntrinsicSize";
import { useProjectNodeResizeOptions } from "./projectNodeResize";

import {
  isProjectGpuEdgeInteractionDisabled,
  isProjectGpuNodeDragDisabled,
  isProjectPaneBackgroundTarget,
} from "../gpuProjectInteractionGuards";

import {
  handleProjectPaneClick,
  handleProjectPaneContextMenu,
  handleProjectPaneDragOver,
  handleProjectPaneDrop,
} from "../gpuProjectPaneEvents";

import {
  canDragProjectNode,
  getVisibleProjectSurfaceWidth,
  handleProjectNodeDrag,
  handleProjectNodeDragCancel,
  handleProjectNodeDragFrame,
  handleProjectNodeDragStart,
  handleProjectNodeDragStop,
  handleProjectSelectionChange,
  handleProjectSelectionContextMenu,
  handleProjectSelectionDragCancel,
  handleProjectSelectionDragStart,
  handleProjectSelectionDragStop,
  handleProjectSelectionKeyboardNudge,
  resolveProjectWireColor,
} from "./projectGpuSelectionAdapter";

type ProjectSurfaceDimensions = {
  readonly height: number;
  readonly width: number;
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
  readonly nodeId?: string | undefined;
};

export type ProjectGpuSelectionChange = {
  readonly active: boolean;
  readonly phase: "start" | "change" | "end" | "cancel";
  readonly selectedNodeIds: readonly string[];
};

type ProjectGpuSurfaceSettings = ReturnType<
  typeof useProjectGpuSurfaceSettings
>;

export type ProjectFlowInteractionKeys = {
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

export function GpuProjectSurface() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dimensions = useProjectSurfaceDimensions(rootRef);
  const [activeParamDomIsland, setActiveParamDomIsland] =
    useState<ProjectGpuActiveParamDomIsland | null>(null);
  const [hoveredParamTarget, setHoveredParamTarget] =
    useState<ProjectGpuRetainedParamTarget | null>(null);
  const [retainedParamDragPreview, setRetainedParamDragPreview] =
    useState<ProjectGpuRetainedParamDragPreview | null>(null);
  const layoutAdapter = useProjectGpuLayoutAdapter({
    activeParamDomIsland,
    hoveredParamTarget,
    retainedParamDragPreview,
  });
  const settings = useProjectGpuSurfaceSettings();
  const showAgenticEdges = useLocalStorage((state) => state.showAgenticEdges);
  const showDataEdges = useLocalStorage((state) => state.showArgEdges);
  const darkMode = useLocalStorage((state) => state.darkMode);
  const isConnecting = useGpuFlowViewportStore(
    (state) => state.connectionStartHandle !== null,
  );
  const edgeScene = useProjectGpuEdgeScene({
    layoutNodes: layoutAdapter.nodeLayouts,
    scene: layoutAdapter.scene,
    showAgenticEdges,
    showDataEdges,
  });
  const { canEditLayout, canEditStructure } = useShareCapabilities();
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
      onPointerDownCapture={(event) => {
        if (
          activeParamDomIsland &&
          shouldClearProjectGpuActiveParamDomIslandOnPointerDown(event.target)
        ) {
          setActiveParamDomIsland(null);
        }
      }}
      onClick={(event) => {
        if (isProjectPaneBackgroundTarget(event.target)) {
          setActiveParamDomIsland(null);
        }
        handleProjectPaneClick(event);
      }}
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
        canEditLayout={canEditLayout}
        layoutAdapter={layoutAdapter}
        onActiveParamDomIslandChange={setActiveParamDomIsland}
        onHoveredParamTargetChange={setHoveredParamTarget}
        onRetainedParamDragPreviewChange={setRetainedParamDragPreview}
        readyToRender={readyToRender}
        settings={settings}
      />
    </div>
  );
}

function ProjectGpuFlowLayer({
  canEditStructure,
  canEditLayout,
  darkMode,
  edgeScene,
  flowInteractionKeys,
  isFollowTransitioning,
  layoutAdapter,
  onActiveParamDomIslandChange,
  onHoveredParamTargetChange,
  onRetainedParamDragPreviewChange,
  readyToRender,
  settings,
}: {
  readonly canEditStructure: boolean;
  readonly canEditLayout: boolean;
  readonly darkMode: boolean;
  readonly edgeScene: ReturnType<typeof useProjectGpuEdgeScene>;
  readonly flowInteractionKeys: ProjectFlowInteractionKeys;
  readonly isFollowTransitioning: boolean;
  readonly layoutAdapter: ProjectGpuLayoutAdapter;
  readonly onActiveParamDomIslandChange: (
    island: ProjectGpuActiveParamDomIsland | null,
  ) => void;
  readonly onHoveredParamTargetChange: (
    target: ProjectGpuRetainedParamTarget | null,
  ) => void;
  readonly onRetainedParamDragPreviewChange: (
    preview: ProjectGpuRetainedParamDragPreview | null,
  ) => void;
  readonly readyToRender: boolean;
  readonly settings: ProjectGpuSurfaceSettings;
}) {
  const { layoutStore, nodeLayouts } = layoutAdapter;
  const retainedParamDragSessionRef =
    useRef<ProjectGpuRetainedParamDragSession | null>(null);
  const sceneSectionById = useMemo(
    () => getProjectSceneSectionById(layoutAdapter.scene),
    [layoutAdapter.scene],
  );
  const selectEdge = useProjectGpuEdgeSelection(canEditStructure);
  const activeNodeIds = useActiveSectionUI(
    (state) => state.activeIds,
    _.isEqual,
  );
  const primarySelectionId =
    activeNodeIds.length > 0
      ? activeNodeIds[activeNodeIds.length - 1] ?? null
      : null;
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
        layoutStore,
        scene: layoutAdapter.scene,
        settings,
      }),
    [
      flowInteractionKeys,
      isFollowTransitioning,
      layoutAdapter.scene,
      layoutStore,
      settings,
    ],
  );
  const nodeResizeOptions = useProjectNodeResizeOptions({
    canEditLayout,
    flowInteractionKeys,
    isFollowTransitioning,
    layoutStore,
    scene: layoutAdapter.scene,
  });
  const portals = getProjectGpuPortalDescriptors();
  const handleNodeElementChange = useProjectNodeIntrinsicSizeObserver(
    layoutStore,
    nodeLayouts,
  );
  const panZoomOptions = useMemo(
    () =>
      getProjectPanZoomOptions({
        flowInteractionKeys,
        settings,
      }),
    [flowInteractionKeys, settings],
  );
  const selectionOptions = useMemo(
    () => ({
      isBackgroundTarget: (target: EventTarget) =>
        isProjectPaneBackgroundTarget(target),
      isSelecting: () => gpuFlowViewportStore.getState().selectionKeyPressed,
      mode: settings.selectionMode,
      onSelectionChange: handleProjectSelectionChange,
    }),
    [settings.selectionMode],
  );
  const selectionDragOptions = useMemo(
    () =>
      getProjectSelectionDragOptions({
        activeNodeIds,
        primarySelectionId,
        settings,
      }),
    [activeNodeIds, primarySelectionId, settings],
  );
  const sceneScrollOptions = useMemo(
    () =>
      getProjectSceneScrollOptions({
        flowInteractionKeys,
        layoutAdapter,
        primarySelectionId,
      }),
    [flowInteractionKeys, layoutAdapter, primarySelectionId],
  );
  const retainedContentScrollOptions = useMemo(
    () =>
      getProjectRetainedContentScrollOptions({
        flowInteractionKeys,
        layoutAdapter,
      }),
    [flowInteractionKeys, layoutAdapter],
  );
  const retainedContentInteractionOptions = useMemo(
    () =>
      getProjectRetainedContentInteractionOptions({
        canEditStructure,
        onActiveParamDomIslandChange,
        onHoveredParamTargetChange,
        onRetainedParamDragPreviewChange,
        retainedContentScroll: {
          getScene: () => layoutAdapter.scene,
          getScrollOffsets: () => layoutAdapter.contentScrollOffsets,
          onScrollOffsetsChange: layoutAdapter.setContentScrollOffsets,
        },
        retainedParamDragSessionRef,
        zoomActivationKeyPressed: flowInteractionKeys.zoomActivationKeyPressed,
      }),
    [
      canEditStructure,
      flowInteractionKeys,
      onActiveParamDomIslandChange,
      onHoveredParamTargetChange,
      onRetainedParamDragPreviewChange,
      layoutAdapter,
      retainedParamDragSessionRef,
    ],
  );
  const retainedContentConnectionOptions = useMemo(
    () =>
      getProjectRetainedContentConnectionOptions({
        canEditStructure,
        zoomActivationKeyPressed: flowInteractionKeys.zoomActivationKeyPressed,
      }),
    [canEditStructure, flowInteractionKeys.zoomActivationKeyPressed],
  );
  const scenePortConnectionOptions = useMemo(
    () =>
      getProjectScenePortConnectionOptions({
        canEditStructure,
        zoomActivationKeyPressed: flowInteractionKeys.zoomActivationKeyPressed,
      }),
    [canEditStructure, flowInteractionKeys.zoomActivationKeyPressed],
  );
  const retainedContentKeyboardOptions = useMemo(
    () =>
      getProjectRetainedContentKeyboardOptions({
        activeNodeIds,
        canEditStructure,
        flowInteractionKeys,
        layoutAdapter,
      }),
    [activeNodeIds, canEditStructure, flowInteractionKeys, layoutAdapter],
  );
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
      framePerformanceReporter={PROJECT_GPU_FLOW_FRAME_PERFORMANCE_REPORTER}
      grid={gridInput}
      layoutStore={layoutStore}
      nodeDrag={nodeDragOptions}
      nodeResize={nodeResizeOptions}
      onNodeElementChange={handleNodeElementChange}
      onResize={handleProjectFlowResize}
      panZoom={panZoomOptions}
      portals={portals}
      renderNode={(node) => renderProjectGpuNode(node, sceneSectionById)}
      renderDomIsland={renderProjectGpuDomIsland}
      retainedContentConnection={retainedContentConnectionOptions}
      retainedContentInteraction={retainedContentInteractionOptions}
      retainedContentKeyboard={retainedContentKeyboardOptions}
      retainedContentScroll={retainedContentScrollOptions}
      scene={layoutAdapter.scene}
      scenePortConnection={scenePortConnectionOptions}
      sceneScroll={sceneScrollOptions}
      selection={selectionOptions}
      selectionDrag={selectionDragOptions}
      uploadBudget={PROJECT_GPU_NODE_UPLOAD_BUDGET}
    />
  );
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
      const viewportState = gpuFlowViewportStore.getState();
      return isProjectGpuEdgeInteractionDisabled({
        connectionActive: viewportState.connectionStartHandle !== null,
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
      const viewportState = gpuFlowViewportStore.getState();
      return isProjectGpuEdgeInteractionDisabled({
        connectionActive: viewportState.connectionStartHandle !== null,
        isFollowTransitioning,
        userSelectionActive: viewportState.userSelectionActive,
        viewportInteractionActive: viewportState.viewportInteractionActive,
      });
    },
    autoPanInsetsPx: getProjectGpuAutoPanInsetsPx,
    isValidConnection: isValidDataEdgeConnection,
    onReconnect: reconnectEdgeFromConnection,
  };
}

function renderProjectGpuNode(
  node: GpuNodeLayout,
  sceneSectionById: ReadonlyMap<string, GpuSectionSceneNode>,
) {
  const sceneNode = sceneSectionById.get(node.nodeId);
  if (!sceneNode) {
    throw new Error(`Missing GPU project scene section ${node.nodeId}.`);
  }
  return (
    <SectionContainer
      sectionId={node.nodeId}
      isTopLevel={sceneNode.parentSectionId === null}
      renderNestedContent={false}
      sceneSurface
    />
  );
}

function getProjectSceneSectionById(
  scene: GpuFlowScene,
): ReadonlyMap<string, GpuSectionSceneNode> {
  return new Map(scene.sections.map((section) => [section.sectionId, section]));
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
  layoutStore,
  scene,
  settings,
}: {
  readonly flowInteractionKeys: ProjectFlowInteractionKeys;
  readonly isFollowTransitioning: boolean;
  readonly layoutStore: GpuFlowLayoutStoreApi;
  readonly scene: GpuFlowScene;
  readonly settings: ProjectGpuSurfaceSettings;
}) {
  return {
    autoPanOnNodeDrag: true,
    canDragNode: (nodeId) => canDragProjectNode(nodeId, scene),
    disabled: () => {
      return isProjectGpuNodeDragDisabled({
        isFollowTransitioning,
        panActivationKeyPressed: flowInteractionKeys.panActivationKeyPressed,
      });
    },
    getSelectedNodeIds: getActiveSectionUIIds,
    nodeDragThresholdPx: 1,
    onNodeDrag: (change) => handleProjectNodeDrag(layoutStore, change, scene),
    onNodeDragCancel: (change) =>
      handleProjectNodeDragCancel(layoutStore, change, scene),
    onNodeDragFrame: (change) =>
      handleProjectNodeDragFrame(layoutStore, change, scene),
    onNodeDragStart: (change) =>
      handleProjectNodeDragStart(layoutStore, change),
    onNodeDragStop: (change) =>
      handleProjectNodeDragStop(layoutStore, change, scene),
    snapGrid: settings.snapGrid,
    snapToGrid: () => useLocalStorage.getState().snapToGrid,
  };
}

function getProjectSelectionDragOptions({
  activeNodeIds,
  primarySelectionId,
  settings,
}: {
  readonly activeNodeIds: readonly string[];
  readonly primarySelectionId: string | null;
  readonly settings: ProjectGpuSurfaceSettings;
}): Omit<
  GpuSelectionDragControllerOptions,
  "element" | "layoutStore" | "requestFrame" | "store"
> {
  return {
    autoPanOnSelectionDrag: true,
    canDragNode: canDragProjectNode,
    onSelectionContextMenu: handleProjectSelectionContextMenu,
    onSelectionDragCancel: handleProjectSelectionDragCancel,
    onSelectionDragStart: handleProjectSelectionDragStart,
    onSelectionDragStop: handleProjectSelectionDragStop,
    onSelectionKeyboardNudge: handleProjectSelectionKeyboardNudge,
    primaryNodeId: primarySelectionId,
    selectedNodeIds: activeNodeIds,
    snapGrid: settings.snapGrid,
    snapToGrid: () => useLocalStorage.getState().snapToGrid,
  };
}

function getProjectSceneScrollOptions({
  flowInteractionKeys,
  layoutAdapter,
  primarySelectionId,
}: {
  readonly flowInteractionKeys: ProjectFlowInteractionKeys;
  readonly layoutAdapter: ProjectGpuLayoutAdapter;
  readonly primarySelectionId: string | null;
}) {
  return {
    disabled: () => flowInteractionKeys.zoomActivationKeyPressed,
    getKeyboardScrollParentSectionId: (scene: GpuFlowScene) =>
      getProjectKeyboardScrollParentSectionId(scene, primarySelectionId),
    getScrollOffsets: () => layoutAdapter.sceneScrollOffsets,
    onScrollOffsetsChange: layoutAdapter.setSceneScrollOffsets,
  };
}

function getProjectRetainedContentScrollOptions({
  flowInteractionKeys,
  layoutAdapter,
}: {
  readonly flowInteractionKeys: ProjectFlowInteractionKeys;
  readonly layoutAdapter: ProjectGpuLayoutAdapter;
}) {
  return {
    disabled: () => flowInteractionKeys.zoomActivationKeyPressed,
    getScrollOffsets: () => layoutAdapter.contentScrollOffsets,
    onScrollOffsetsChange: layoutAdapter.setContentScrollOffsets,
  };
}

function getProjectRetainedContentKeyboardOptions({
  activeNodeIds,
  canEditStructure,
  flowInteractionKeys,
  layoutAdapter,
}: {
  readonly activeNodeIds: readonly string[];
  readonly canEditStructure: boolean;
  readonly flowInteractionKeys: ProjectFlowInteractionKeys;
  readonly layoutAdapter: ProjectGpuLayoutAdapter;
}) {
  return {
    disabled: () =>
      flowInteractionKeys.zoomActivationKeyPressed ||
      !canEditStructure ||
      !useMisc.getState().isSelectingParams,
    getCurrentTarget: (scene: GpuFlowScene) =>
      getProjectGpuRetainedParamNavigationTarget({
        activeSectionIds: activeNodeIds,
        projectState: useProjectState.getState(),
        scene,
      }),
    getScrollOffsets: () => layoutAdapter.contentScrollOffsets,
    onNavigation: (event: GpuRetainedContentKeyboardNavigationEvent) => {
      layoutAdapter.setContentScrollOffsets(event.scrollOffsets);
      selectOnlyParam(event.target.ownerSectionId, event.target.rowId);
    },
  };
}

function getProjectKeyboardScrollParentSectionId(
  scene: GpuFlowScene,
  selectedSectionId: string | null,
): string | null {
  if (!selectedSectionId) {
    return null;
  }
  const sectionById = new Map(
    scene.sections.map((section) => [section.sectionId, section]),
  );
  const selectedSection = sectionById.get(selectedSectionId);
  if (!selectedSection) {
    return null;
  }
  if (selectedSection.childSectionIds.length > 0) {
    return selectedSection.sectionId;
  }
  return selectedSection.parentSectionId;
}

function getProjectPanZoomOptions({
  flowInteractionKeys,
  settings,
}: {
  readonly flowInteractionKeys: ProjectFlowInteractionKeys;
  readonly settings: ProjectGpuSurfaceSettings;
}) {
  return {
    panActivationKeyPressed: flowInteractionKeys.panActivationKeyPressed,
    panOnDrag: !flowInteractionKeys.selectionKeyPressed && settings.panOnDrag,
    panOnScroll: settings.panOnScroll,
    panOnScrollMode: settings.panOnScrollMode,
    panOnScrollSpeed: settings.panOnScrollSpeed,
    onPointerPanStart: closeAllContextMenus,
    zoomActivationKeyPressed: flowInteractionKeys.zoomActivationKeyPressed,
    zoomOnDoubleClick: settings.zoomOnDoubleClick,
    zoomOnPinch: settings.zoomOnPinch,
    zoomOnScroll: settings.zoomOnScroll,
  };
}

function booleanDataAttribute(value: boolean): "true" | "false" {
  return value ? "true" : "false";
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
    const updateDimensions = (
      rect: Pick<DOMRectReadOnly, "height" | "width">,
    ) => {
      const nextDimensions = {
        height: rect.height,
        width: rect.width,
      };
      setDimensions(nextDimensions);
      gpuFlowViewportStore.getState().setViewportSize({
        height: nextDimensions.height,
        width: getVisibleProjectSurfaceWidth(nextDimensions.width),
      });
    };
    updateDimensions(node.getBoundingClientRect());
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      updateDimensions(entry.contentRect);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return dimensions;
}
