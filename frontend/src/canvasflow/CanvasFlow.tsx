import UserSelection from "forks/xyflow/core/components/UserSelection";
import { useReactFlow } from "forks/xyflow/core/store";
import { fitView } from "forks/xyflow/core/store/utils";
import _ from "lodash";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { recomputeEdgeHandlePositions } from "state/actions/edgeHandles";
import {
  getNodeUpdateInformation,
  updateNodeDimensions,
} from "state/actions/nodeInternals";
import { useActiveSectionUI } from "state/activeSectionUI";
import {
  getAllowedChatIdsForProject,
  getSectionIdsForProject,
} from "state/aiFollowUtils";
import {
  useAIFollow,
  useEdgeHandleRegistry,
  useLocalStorage,
  useMisc,
  useNodeInternals,
  useProjectState,
  useSettings,
} from "state/definitions";
import { useUpdateAgenticScopeHighlights } from "state/hooks/agenticScopeHighlights";
import {
  CANVAS_FLOW_VIEWPORT_CHANGE_EVENT,
  CODEMIRROR_TOOLTIP_PARENT_ID,
  SETTA_POPOVER_PORTAL_PARENT_ID,
} from "utils/constants";
import { useTabScope } from "utils/focusManager";
import { PanOnScrollModeEnum, SectionTypeEnum } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import "./CanvasFlow.css";
import { CanvasFlowCanvas } from "./CanvasFlowCanvas";
import { useCanvasFlowInteractions } from "./CanvasFlowInteractions";
import {
  CanvasFlowNodesSelectionDragHandleWrapper,
  CanvasFlowNodesSelectionWrapper,
} from "./CanvasFlowSelection";
import {
  buildAgenticEdges,
  buildAgenticMissingEdges,
  buildDataEdges,
  buildStateMachineEdges,
} from "./canvasFlowEdges";
import { paintCanvasFlow } from "./canvasFlowPaint";
import {
  assertHtmlInCanvasSupport,
  requestCanvasFlowPaint,
} from "./canvasFlowSupport";
import type {
  CanvasFlowConnectionState,
  CanvasFlowDrawableEdge,
  CanvasFlowHandlePosition,
  CanvasFlowNode,
  CanvasFlowNodeElementMap,
  CanvasFlowRenderingContext,
  CanvasFlowSize,
  CanvasFlowViewport,
} from "./canvasFlowTypes";
import { transformToCanvasFlowViewport } from "./canvasFlowViewport";

const EMPTY_SIZE: CanvasFlowSize = {
  cssWidth: 0,
  cssHeight: 0,
  pixelWidth: 0,
  pixelHeight: 0,
  pixelRatio: 1,
};
const EMPTY_CONNECTION_STATE: CanvasFlowConnectionState = {
  connectionStartHandle: null,
  connectionPosition: { x: 0, y: 0 },
  connectionStatus: null,
};

const wrapperStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
  position: "relative",
  userSelect: "none",
  overflowAnchor: "none",
};

function CanvasFlow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const nodeElementsRef = useRef<CanvasFlowNodeElementMap>(new Map());
  const ctxRef = useRef<CanvasFlowRenderingContext | null>(null);
  const previousInteractiveNodeIdsRef = useRef(new Set<string>());
  const sizeRef = useRef<CanvasFlowSize>(EMPTY_SIZE);
  const nodesRef = useRef<CanvasFlowNode[]>([]);
  const edgesRef = useRef<CanvasFlowDrawableEdge[]>([]);
  const edgePositionsRef = useRef<Record<string, CanvasFlowHandlePosition>>({});
  const connectionStateRef = useRef<CanvasFlowConnectionState>(
    EMPTY_CONNECTION_STATE,
  );
  const [resizeObserver, setResizeObserver] = useState<ResizeObserver | null>(
    null,
  );
  const [canvasCssSize, setCanvasCssSize] = useState({ width: 0, height: 0 });
  const transform = useReactFlow((state) => state.transform, shallow);
  const viewportRef = useRef<CanvasFlowViewport>(
    transformToCanvasFlowViewport(transform),
  );

  const {
    darkMode,
    overviewWidth,
    showAgenticEdges,
    showArgEdges,
    snapToGrid,
    uiEditorWidth,
  } = useLocalStorage(
    (state) => ({
      darkMode: state.darkMode,
      overviewWidth: state.overviewTrueWidth,
      showAgenticEdges: state.showAgenticEdges,
      showArgEdges: state.showArgEdges,
      snapToGrid: state.snapToGrid,
      uiEditorWidth: state.uiEditorTrueWidth,
    }),
    shallow,
  );
  const {
    maxZoom,
    minZoom,
    panOnDrag,
    panOnScroll,
    panOnScrollMode,
    panOnScrollSpeed,
    showGridLines,
    snapGrid,
    wireColor,
    zoomOnPinch,
    zoomOnScroll,
  } = useCanvasFlowSettings(darkMode);
  const zoomActivationKeyPressed = useReactFlow(
    (state) => state.zoomActivationKeyPressed,
  );
  const isConnecting = useReactFlow(
    (state) => state.connectionStartHandle !== null,
  );

  const schedulePaint = useMemo(
    () => () => requestCanvasFlowPaint(canvasRef.current),
    [],
  );

  const nodes = useNodeInternals(
    (state) => Array.from(state.x.values()),
    shallow,
  );
  const nodeMap = useNodeInternals((state) => state.x);
  const edgePositions = useEdgeHandleRegistry((state) => state.positions);
  const projectEdgeState = useCanvasFlowProjectEdgeState();
  const agenticEdgeState = useCanvasFlowAgenticEdgeState(projectEdgeState);
  const edges = useMemo(
    () => [
      ...buildDataEdges({
        edges: projectEdgeState.edges,
        positions: edgePositions,
        sectionVariantMap: projectEdgeState.sectionVariantMap,
        showArgEdges,
      }),
      ...buildAgenticEdges({
        agenticEdges: projectEdgeState.agenticEdges,
        fallbackSectionSizes: projectEdgeState.fallbackSectionSizes,
        missingEdges: agenticEdgeState.missingEdges,
        nodes: nodeMap,
        runningChatSectionIds: agenticEdgeState.runningChatSectionIds,
        showAgenticEdges,
        toolArgSectionIds: agenticEdgeState.toolArgSectionIds,
        toolResultSectionIds: agenticEdgeState.toolResultSectionIds,
      }),
      ...buildStateMachineEdges({
        edges: projectEdgeState.stateMachineEdges,
        nodes: nodeMap,
        topLevelSections: projectEdgeState.topLevelSections,
      }),
    ],
    [
      agenticEdgeState.missingEdges,
      agenticEdgeState.runningChatSectionIds,
      agenticEdgeState.toolArgSectionIds,
      agenticEdgeState.toolResultSectionIds,
      edgePositions,
      nodeMap,
      projectEdgeState,
      showAgenticEdges,
      showArgEdges,
    ],
  );

  nodesRef.current = nodes;
  edgesRef.current = edges;
  edgePositionsRef.current = edgePositions;

  useCanvasFlowAgenticScopeHighlights(projectEdgeState);

  useTabScope({
    scopeId: "canvas",
    order: 20,
    rootRef: rootRef as RefObject<HTMLElement>,
    behavior: "canvas",
  });

  useEffect(() => {
    viewportRef.current = transformToCanvasFlowViewport(transform);
    window.dispatchEvent(new Event(CANVAS_FLOW_VIEWPORT_CHANGE_EVENT));
    schedulePaint();
  }, [schedulePaint, transform]);

  useEffect(() => {
    connectionStateRef.current = selectCanvasFlowConnectionState(
      useReactFlow.getState(),
    );
    return useReactFlow.subscribe(
      selectCanvasFlowConnectionState,
      (connectionState) => {
        connectionStateRef.current = connectionState;
        schedulePaint();
      },
      { equalityFn: shallow },
    );
  }, [schedulePaint]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    useReactFlow.setState({
      domNode: root,
    });
    return () => {
      useReactFlow.setState({
        domNode: null,
        paneDragging: false,
        viewportInteractionActive: false,
      });
      useMisc.setState({ isPanScrolling: false });
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = assertHtmlInCanvasSupport(canvas);
    ctxRef.current = ctx;
    const paint = () => {
      paintCanvasFlow({
        canvas,
        connectionState: connectionStateRef.current,
        ctx,
        darkMode,
        edges: edgesRef.current,
        edgeHandlePositions: edgePositionsRef.current,
        gridSize: snapToGrid ? snapGrid[0] : 20,
        nodeElements: nodeElementsRef.current,
        nodes: nodesRef.current,
        previousInteractiveNodeIds: previousInteractiveNodeIdsRef.current,
        showGridLines,
        size: sizeRef.current,
        viewport: viewportRef.current,
        wireColor,
      });
    };
    canvas.addEventListener("paint", paint as EventListener);
    schedulePaint();
    return () => {
      canvas.removeEventListener("paint", paint as EventListener);
      ctxRef.current = null;
    };
  }, [darkMode, schedulePaint, showGridLines, snapGrid, snapToGrid, wireColor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      const nextSize = getCanvasFlowSize(entry);
      if (
        canvas.width !== nextSize.pixelWidth ||
        canvas.height !== nextSize.pixelHeight
      ) {
        canvas.width = nextSize.pixelWidth;
        canvas.height = nextSize.pixelHeight;
      }
      sizeRef.current = nextSize;
      setCanvasCssSize({
        width: nextSize.cssWidth,
        height: nextSize.cssHeight,
      });
      useReactFlow.setState({
        width: Math.max(nextSize.cssWidth - overviewWidth - uiEditorWidth, 0),
        height: nextSize.cssHeight,
      });
      schedulePaint();
    });
    observer.observe(canvas, { box: "device-pixel-content-box" });
    return () => {
      observer.disconnect();
    };
  }, [overviewWidth, schedulePaint, uiEditorWidth]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      setResizeObserver(null);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const updates = getNodeUpdateInformation(entries, true);
      updateNodeDimensions(updates);
      schedulePaint();
    });
    setResizeObserver(observer);
    return () => {
      observer.disconnect();
    };
  }, [schedulePaint]);

  useEffect(() => {
    recomputeEdgeHandlePositions();
    schedulePaint();
  }, [
    canvasCssSize.height,
    canvasCssSize.width,
    edges,
    projectEdgeState.topLevelSections,
    schedulePaint,
  ]);

  useEffect(() => {
    const miscState = useMisc.getState();
    if (
      miscState.numInitializedCodeAreas !== miscState.numDisplayedCodeAreas ||
      !useReactFlow.getState().fitViewOnInit
    ) {
      return;
    }
    fitView({ initial: true });
  }, [nodes]);

  const interactionHandlers = useCanvasFlowInteractions({
    canvasRef,
    edgesRef,
    maxZoom,
    minZoom,
    panOnDrag,
    panOnScroll,
    panOnScrollMode,
    panOnScrollSpeed,
    schedulePaint,
    viewportRef,
    zoomActivationKeyPressed,
    zoomOnPinch,
    zoomOnScroll,
  });

  return (
    <div
      className="react-flow canvas-flow setta-light dark:setta-dark"
      data-connecting={isConnecting ? "true" : "false"}
      data-show-agentic-edges={showAgenticEdges ? "true" : "false"}
      data-show-arg-edges={showArgEdges ? "true" : "false"}
      data-tab-scope="canvas"
      ref={rootRef}
      style={
        {
          ...wrapperStyle,
          "--setta-wire-color": wireColor,
        } as CSSProperties
      }
    >
      <CanvasFlowCanvas
        {...interactionHandlers}
        canvasRef={canvasRef}
        nodeElementsRef={nodeElementsRef}
        resizeObserver={resizeObserver}
        schedulePaint={schedulePaint}
        viewportRef={viewportRef}
      />
      <CanvasFlowNodesSelectionDragHandleWrapper />
      <CanvasFlowNodesSelectionWrapper
        canvasRef={canvasRef}
        schedulePaint={schedulePaint}
        viewportRef={viewportRef}
      />
      <UserSelection />
      <div
        className="setta-codemirror-tooltips"
        id={CODEMIRROR_TOOLTIP_PARENT_ID}
      />
      <div
        className="setta-popover-portals"
        id={SETTA_POPOVER_PORTAL_PARENT_ID}
      />
    </div>
  );
}

function selectCanvasFlowConnectionState(
  state: ReturnType<typeof useReactFlow.getState>,
): CanvasFlowConnectionState {
  return {
    connectionStartHandle: state.connectionStartHandle,
    connectionPosition: state.connectionPosition,
    connectionStatus: state.connectionStatus,
  };
}

function useCanvasFlowSettings(darkMode: boolean) {
  return useSettings((state) => {
    const gui = state.gui as typeof state.gui & {
      wireColor?: string;
      wireColorDarkMode?: string;
    };
    return {
      maxZoom: gui.maxZoom,
      minZoom: gui.minZoom,
      panOnDrag: gui.panOnDrag,
      panOnScroll: gui.panOnScroll,
      panOnScrollMode: gui.panOnScrollMode ?? PanOnScrollModeEnum.free,
      panOnScrollSpeed: gui.panOnScrollSpeed,
      showGridLines: Boolean(gui.showGridLines),
      snapGrid: gui.snapGrid,
      wireColor: darkMode
        ? gui.wireColorDarkMode ?? "#bac2d3"
        : gui.wireColor ?? "#41506c",
      zoomOnPinch: gui.zoomOnPinch,
      zoomOnScroll: gui.zoomOnScroll,
    };
  }, _.isEqual);
}

function useCanvasFlowProjectEdgeState() {
  return useProjectState((state) => {
    const topLevelSections = state.projectConfig.topLevelSections;
    return {
      agenticEdges: state.projectConfig.agenticEdges ?? [],
      edges: state.projectConfig.edges ?? [],
      fallbackSectionSizes: Object.fromEntries(
        Object.entries(topLevelSections).map(([sectionId, layout]) => [
          sectionId,
          { w: layout.w, h: layout.h },
        ]),
      ),
      projectConfigId: state.projectConfig.id,
      sectionImpls: state.sectionImpls,
      sectionVariantMap: state.projectConfig.sectionVariantMap,
      sectionVariants: state.sectionVariants,
      stateMachineEdges: state.projectConfig.stateMachineEdges ?? [],
      topLevelSections,
    };
  }, _.isEqual);
}

function useCanvasFlowAgenticEdgeState({
  agenticEdges,
  projectConfigId,
  sectionImpls,
  sectionVariantMap,
  sectionVariants,
  topLevelSections,
}: ReturnType<typeof useCanvasFlowProjectEdgeState>) {
  const {
    mode,
    scopeViolationEdgesByProjectConfigId,
    selectedChatIdsByProjectConfigId,
    selectedSectionIdsByProjectConfigId,
    toolArgumentsIdsByProjectConfigId,
    toolResultIdsByProjectConfigId,
  } = useAIFollow(
    (state) => ({
      mode: state.mode,
      scopeViolationEdgesByProjectConfigId:
        state.scopeViolationEdgesByProjectConfigId,
      selectedChatIdsByProjectConfigId: state.selectedChatIdsByProjectConfigId,
      selectedSectionIdsByProjectConfigId:
        state.selectedSectionIdsByProjectConfigId,
      toolArgumentsIdsByProjectConfigId:
        state.toolArgumentsIdsByProjectConfigId,
      toolResultIdsByProjectConfigId: state.toolResultIdsByProjectConfigId,
    }),
    shallow,
  );
  const topLevelSectionIds = useMemo(
    () => Object.keys(topLevelSections),
    [topLevelSections],
  );
  const runningChatSectionIds = useMemo(() => {
    const running = new Set<string>();
    for (const sectionId of topLevelSectionIds) {
      const variantId = sectionVariantMap[sectionId];
      if (!variantId) {
        continue;
      }
      const variant = sectionVariants[variantId];
      if (!variant) {
        continue;
      }
      const impl = sectionImpls[variant.impl];
      if (
        impl?.type === SectionTypeEnum.Chat &&
        "waitingForResponse" in impl &&
        impl.waitingForResponse
      ) {
        running.add(sectionId);
      }
    }
    return running;
  }, [sectionImpls, sectionVariantMap, sectionVariants, topLevelSectionIds]);
  const allowedChatIds = useMemo(
    () =>
      getAllowedChatIdsForProject(
        mode,
        selectedChatIdsByProjectConfigId,
        selectedSectionIdsByProjectConfigId,
        projectConfigId,
        sectionVariantMap,
        sectionVariants,
        sectionImpls,
      ),
    [
      mode,
      projectConfigId,
      sectionImpls,
      sectionVariantMap,
      sectionVariants,
      selectedChatIdsByProjectConfigId,
      selectedSectionIdsByProjectConfigId,
    ],
  );
  const toolArgSectionIds = useMemo(
    () =>
      new Set(
        getSectionIdsForProject(
          toolArgumentsIdsByProjectConfigId,
          projectConfigId,
          allowedChatIds,
        ),
      ),
    [allowedChatIds, projectConfigId, toolArgumentsIdsByProjectConfigId],
  );
  const toolResultSectionIds = useMemo(
    () =>
      new Set(
        getSectionIdsForProject(
          toolResultIdsByProjectConfigId,
          projectConfigId,
          allowedChatIds,
        ),
      ),
    [allowedChatIds, projectConfigId, toolResultIdsByProjectConfigId],
  );
  const missingEdges = useMemo(
    () =>
      buildAgenticMissingEdges({
        agenticEdges,
        projectConfigId,
        scopeViolationEdgesByProjectConfigId,
      }),
    [agenticEdges, projectConfigId, scopeViolationEdgesByProjectConfigId],
  );
  return {
    missingEdges,
    runningChatSectionIds,
    toolArgSectionIds,
    toolResultSectionIds,
  };
}

function useCanvasFlowAgenticScopeHighlights({
  agenticEdges,
  projectConfigId,
  sectionImpls,
  sectionVariantMap,
  sectionVariants,
  topLevelSections,
}: ReturnType<typeof useCanvasFlowProjectEdgeState>) {
  const activeIds = useActiveSectionUI((state) => state.activeIds, _.isEqual);
  useUpdateAgenticScopeHighlights({
    activeIds,
    agenticEdges,
    projectConfigId,
    sectionImpls,
    sectionVariantMap,
    sectionVariants,
    topLevelSectionIds: Object.keys(topLevelSections),
  });
}

function getCanvasFlowSize(entry: ResizeObserverEntry): CanvasFlowSize {
  const cssWidth = entry.contentRect.width;
  const cssHeight = entry.contentRect.height;
  const devicePixelSize = entry.devicePixelContentBoxSize?.[0];
  const pixelRatio = window.devicePixelRatio || 1;
  const pixelWidth =
    devicePixelSize?.inlineSize ??
    Math.max(1, Math.round(cssWidth * pixelRatio));
  const pixelHeight =
    devicePixelSize?.blockSize ??
    Math.max(1, Math.round(cssHeight * pixelRatio));
  return {
    cssWidth,
    cssHeight,
    pixelWidth,
    pixelHeight,
    pixelRatio: cssWidth > 0 ? pixelWidth / cssWidth : pixelRatio,
  };
}

export default CanvasFlow;
