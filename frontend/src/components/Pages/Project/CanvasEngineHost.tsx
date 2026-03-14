import {
  getNextDomIslandRetentionDelayMs,
  resolveDomIslandMountPolicy,
} from "canvas-engine/domIslandMountPolicy";
import {
  areEdgeHandlePositionMapsEqual,
  buildConnectedDataEdgeHandleKeys,
  pickEdgeHandlePositionsBySectionIds,
  pickEdgeHandlePositionsByKeys,
} from "canvas-engine/edgeHandlePositionSelectors";
import { collectCanvasEngineNestedDataHandlePositions } from "canvas-engine/nestedDataHandleBridge";
import {
  areNestedPreviewRectArraysEqual,
  collectCanvasEngineNestedPreviewRects,
} from "canvas-engine/nestedPreviewBridge";
import {
  createCanvasEngineRenderer,
  type CanvasEngineBackendSelection,
  type CanvasEngineRenderer,
} from "canvas-engine/renderer";
import {
  CanvasEngineSceneAdapter,
  type CanvasEngineEdgeHandlePosition,
  type CanvasEngineProjectSceneInput,
  type CanvasEngineSceneSnapshotResult,
} from "canvas-engine/sceneAdapter";
import {
  getCanvasEngineKeyboardMoveDelta,
  getCanvasEngineTopLevelSelectionBounds,
} from "canvas-engine/selectionBounds";
import type {
  CanvasEngineCamera,
  CanvasEngineConnectionPreview,
  CanvasEngineHoveredEdge,
  CanvasEngineNestedPreviewRect,
  CanvasEngineRect,
} from "canvas-engine/types";
import { SectionContainer } from "components/Section/Container/SectionContainer";
import { SIZE_MODE } from "components/Utils/Resizable/utils";
import { useReactFlow } from "forks/xyflow/core/store";
import { fitView } from "forks/xyflow/core/store/utils";
import type { Connection } from "forks/xyflow/core/types";
import { getWheelDelta } from "forks/xyflow/core/utils";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import {
  AGENTIC_EDGE_HANDLE_IDS,
  createAgenticEdgeFromConnection,
  isValidAgenticEdgeConnection,
  toggleAgenticEdgeSelection,
} from "state/actions/agenticEdges";
import {
  openPaneContextMenu,
  openSelectionContextMenu,
} from "state/actions/contextMenus";
import {
  createEdgeFromConnection,
  isValidDataEdgeConnection,
  reconnectEdgeFromConnection,
  toggleEdgeSelection,
} from "state/actions/edges";
import { getCurrEffectiveSectionImplIfPresent } from "state/actions/sectionInfos";
import {
  setSelfParentSiblingChildrenWidths,
  type ResizeHandleDirection,
} from "state/actions/sections/sectionSizes";
import {
  useActiveSectionUI,
  useEdgeHandleRegistry,
  useLocalStorage,
  useProjectState,
  useSettings,
} from "state/definitions";
import {
  getMaxSectionHeight,
  getMaxSectionWidth,
  getMinSectionHeight,
  getMinSectionWidth,
} from "state/hooks/sectionSizes";
import { useShareCapabilities } from "state/hooks/share";
import { getIsTwitterSection } from "state/hooks/social";
import {
  NO_WHEEL_CLASS_NAME,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";
import {
  route_set_section_sizes,
  route_set_top_level_section_layout,
} from "utils/generatedEndpoints";
import {
  SectionTypeEnum,
  SelectionModeEnum,
  isBaseSectionWithParamsImpl,
  type SectionSize,
  type SectionSizingPolicy,
  type SectionType,
} from "utils/generatedTypes";
import { isMacOs } from "utils/utils";
import { shallow } from "zustand/shallow";

type PanePointerSession = {
  pointerId: number;
  kind: "pane";
  lastClientX: number;
  lastClientY: number;
  moved: boolean;
};

type DraggedTopLevelSection = {
  sectionId: string;
  sectionStartX: number;
  sectionStartY: number;
};

type SectionPointerSession = {
  pointerId: number;
  kind: "section";
  sectionId: string;
  anchorWorldX: number;
  anchorWorldY: number;
  draggedSections: DraggedTopLevelSection[];
  selectionAppliedOnPointerDown: boolean;
  moved: boolean;
};

type PreviewSectionPointerSession = {
  pointerId: number;
  kind: "preview-section";
};

type SelectionOverlayPointerSession = {
  pointerId: number;
  kind: "selection-overlay";
  anchorWorldX: number;
  anchorWorldY: number;
  draggedSections: DraggedTopLevelSection[];
  moved: boolean;
};

type ResizePointerSession = {
  pointerId: number;
  kind: "resize";
  sectionId: string;
  direction: ResizeHandleDirection;
  anchorWorldX: number;
  anchorWorldY: number;
  sectionStartWidth: number;
  sectionStartHeight: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  widthResizable: boolean;
  heightResizable: boolean;
  aspectRatio: number | null;
  aspectRatioExtraWidth: number;
  aspectRatioExtraHeight: number;
  moved: boolean;
  lastAppliedSize: Partial<SectionSize> | null;
};

type EdgePointerSession = {
  pointerId: number;
  kind: "edge";
};

type SelectionRectPointerSession = {
  pointerId: number;
  kind: "selection-rect";
  startWorldX: number;
  startWorldY: number;
  startCanvasX: number;
  startCanvasY: number;
  moved: boolean;
  selectedIds: string[];
};

type AgenticConnectPointerSession = {
  pointerId: number;
  kind: "agentic-connect";
  sourceSectionId: string;
  sourceHandleWorldX: number;
  sourceHandleWorldY: number;
};

type DataConnectPointerSession = {
  pointerId: number;
  kind: "data-connect";
  sourceSectionId: string;
  sourcePortId: string;
  sourceHandleWorldX: number;
  sourceHandleWorldY: number;
};

type DataReconnectPointerSession = {
  pointerId: number;
  kind: "data-reconnect";
  edgeId: string;
  endpointType: "source" | "target";
  fixedHandleWorldX: number;
  fixedHandleWorldY: number;
};

type PointerSession =
  | PanePointerSession
  | SectionPointerSession
  | PreviewSectionPointerSession
  | SelectionOverlayPointerSession
  | ResizePointerSession
  | EdgePointerSession
  | SelectionRectPointerSession
  | AgenticConnectPointerSession
  | DataConnectPointerSession
  | DataReconnectPointerSession;

type ResizeCapabilities = {
  widthResizable: boolean;
  heightResizable: boolean;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  aspectRatio: number | null;
  aspectRatioExtraWidth: number;
  aspectRatioExtraHeight: number;
};

type MetaControlResizeMode = {
  minHeight: number;
  minWidth: number;
  sizeModeHeight: string;
  sizeModeWidth: string;
};

type ReactFlowViewportTransform = {
  x: number;
  y: number;
  zoom: number;
};

type DomIslandRenderEntry = {
  rect: CanvasEngineRect;
  retained: boolean;
};

type CanvasEngineSelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const DOM_ISLAND_VIEWPORT_PADDING_PX = 240;
const DOM_ISLAND_RETENTION_MS = 280;
const DOM_ISLAND_MAX_RETAINED_SECTIONS = 96;
const DOM_ISLAND_MIN_SCREEN_WIDTH_PX = 112;
const DOM_ISLAND_MIN_SCREEN_HEIGHT_PX = 63;
const RESIZE_HANDLE_HIT_RADIUS_PX = 10;
const EDGE_HIT_TOLERANCE_PX = 8;
const SECTION_HIT_TOLERANCE_PX = 6;
const AGENTIC_HANDLE_HIT_TOLERANCE_WORLD = 12;
const DATA_HANDLE_HIT_TOLERANCE_WORLD = 10;
const DATA_EDGE_ENDPOINT_HIT_RADIUS_PX = 12;
const SELECTION_RECT_FILL_COLOR = "rgba(0, 89, 220, 0.08)";
const SELECTION_RECT_BORDER_COLOR = "rgba(0, 89, 220, 0.8)";
const VIEWPORT_SYNC_EPSILON = 0.000001;

const DEFAULT_CAMERA: CanvasEngineCamera = {
  x: 0,
  y: 0,
  zoom: 1,
};

const DEFAULT_VIEWPORT = {
  width: 1,
  height: 1,
  dpr: 1,
};

const INITIAL_BACKEND_SELECTION: CanvasEngineBackendSelection = {
  preferredBackend: "webgpu",
  activeBackend: "webgl2",
  webgpuAvailable: false,
  webgl2Available: false,
  fallbackReason: "Canvas engine initializing.",
};

export function createCanvasEngineHostSnapshotResult(
  input: CanvasEngineProjectSceneInput,
): CanvasEngineSceneSnapshotResult {
  const sceneAdapter = new CanvasEngineSceneAdapter();
  sceneAdapter.applyProjectState(input);
  return sceneAdapter.createSnapshot(DEFAULT_CAMERA, DEFAULT_VIEWPORT);
}

export function CanvasEngineHost() {
  const topLevelSections = useProjectState(
    (state) => state.projectConfig.topLevelSections,
  );
  const sectionVariantMap = useProjectState(
    (state) => state.projectConfig.sectionVariantMap,
  );
  const sectionVariants = useProjectState((state) => state.sectionVariants);
  const sectionImpls = useProjectState((state) => state.sectionImpls);
  const persistedViewport = useProjectState(
    (state) => state.projectConfig.viewport,
  );
  const viewportInitialized = useProjectState(
    (state) => state.projectConfig.viewportInitialized,
  );
  const activeSectionIds = useActiveSectionUI((state) => state.activeIds);
  const dataEdges = useProjectState((state) => state.projectConfig.edges);
  const agenticEdges = useProjectState(
    (state) => state.projectConfig.agenticEdges,
  );
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const sectionSizingPolicy = useSettings((state) => state.sectionSizingPolicy);
  const snapGrid = useSettings((state) => state.gui.snapGrid);
  const snapToGrid = useLocalStorage((state) => state.snapToGrid);
  const { canEditStructure } = useShareCapabilities();
  const [nestedPreviewRects, setNestedPreviewRects] = useState<
    CanvasEngineNestedPreviewRect[]
  >([]);
  const [cachedNestedDataHandlePositions, setCachedNestedDataHandlePositions] =
    useState<Record<string, CanvasEngineEdgeHandlePosition>>({});
  const visibleNestedPreviewSectionIds = useMemo(
    () => nestedPreviewRects.map((rect) => rect.id),
    [nestedPreviewRects],
  );
  const connectedDataEdgeHandleKeys = useMemo(
    () => buildConnectedDataEdgeHandleKeys(dataEdges),
    [dataEdges],
  );
  const edgeHandlePositions = useEdgeHandleRegistry(
    useCallback(
      (state) =>
        pickEdgeHandlePositionsByKeys(
          state.positions,
          connectedDataEdgeHandleKeys,
        ),
      [connectedDataEdgeHandleKeys],
    ),
    areEdgeHandlePositionMapsEqual,
  );
  const visibleNestedEdgeHandlePositions = useEdgeHandleRegistry(
    useCallback(
      (state) =>
        pickEdgeHandlePositionsBySectionIds(
          state.positions,
          visibleNestedPreviewSectionIds,
        ),
      [visibleNestedPreviewSectionIds],
    ),
    areEdgeHandlePositionMapsEqual,
  );
  const reactFlowTransform = useReactFlow((state) => state.transform);
  const { fitViewOnInit, fitViewOnInitDone, fitViewOnInitOptions } =
    useReactFlow(
      (state) => ({
        fitViewOnInit: state.fitViewOnInit,
        fitViewOnInitDone: state.fitViewOnInitDone,
        fitViewOnInitOptions: state.fitViewOnInitOptions,
      }),
      shallow,
    );

  const sceneAdapterRef = useRef<CanvasEngineSceneAdapter | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const selectionOverlayRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<CanvasEngineRenderer | null>(null);
  const pointerSessionRef = useRef<PointerSession | null>(null);
  const hasHydratedReactFlowTransformRef = useRef(false);
  const pendingReactFlowViewportRef = useRef<ReactFlowViewportTransform | null>(
    null,
  );
  const nestedPreviewRectsByParentSectionIdRef = useRef(
    new Map<string, CanvasEngineNestedPreviewRect[]>(),
  );
  const domIslandMountedSectionIdsRef = useRef<string[]>([]);
  const domIslandRetentionExpiryByIdRef = useRef<Map<string, number>>(
    new Map(),
  );
  const domIslandRetentionTimerIdRef = useRef<number | null>(null);
  if (!sceneAdapterRef.current) {
    sceneAdapterRef.current = new CanvasEngineSceneAdapter();
  }
  const sceneAdapter = sceneAdapterRef.current;
  const [backendSelection, setBackendSelection] =
    useState<CanvasEngineBackendSelection>(INITIAL_BACKEND_SELECTION);
  const [camera, setCamera] = useState<CanvasEngineCamera>(() =>
    getInitialCamera({
      viewport: persistedViewport,
      viewportInitialized,
    }),
  );
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const [rendererRevision, setRendererRevision] = useState(0);
  const [projectSceneRevision, setProjectSceneRevision] = useState(0);
  const [domIslandRetentionRevision, setDomIslandRetentionRevision] =
    useState(0);
  const [connectionPreview, setConnectionPreview] =
    useState<CanvasEngineConnectionPreview | null>(null);
  const [hoveredEdge, setHoveredEdge] =
    useState<CanvasEngineHoveredEdge | null>(null);
  const [selectionRect, setSelectionRect] =
    useState<CanvasEngineSelectionRect | null>(null);

  const selectedTopLevelSectionIds = useMemo(
    () =>
      activeSectionIds.filter(
        (sectionId) => topLevelSections[sectionId] !== undefined,
      ),
    [activeSectionIds, topLevelSections],
  );
  const selectedTopLevelSelectionBounds = useMemo(
    () =>
      getCanvasEngineTopLevelSelectionBounds({
        activeSectionIds: selectedTopLevelSectionIds,
        topLevelSections,
      }),
    [selectedTopLevelSectionIds, topLevelSections],
  );

  const updateConnectionPreview = useCallback(
    (nextPreview: CanvasEngineConnectionPreview | null) => {
      setConnectionPreview((currentPreview) => {
        if (areConnectionPreviewsEqual(currentPreview, nextPreview)) {
          return currentPreview;
        }
        return nextPreview;
      });
    },
    [],
  );

  const updateHoveredEdge = useCallback(
    (nextHoveredEdge: CanvasEngineHoveredEdge | null) => {
      setHoveredEdge((currentHoveredEdge) => {
        if (areHoveredEdgesEqual(currentHoveredEdge, nextHoveredEdge)) {
          return currentHoveredEdge;
        }
        return nextHoveredEdge;
      });
    },
    [],
  );

  const updateSelectionRect = useCallback(
    (nextSelectionRect: CanvasEngineSelectionRect | null) => {
      setSelectionRect((currentSelectionRect) => {
        if (areSelectionRectsEqual(currentSelectionRect, nextSelectionRect)) {
          return currentSelectionRect;
        }
        return nextSelectionRect;
      });
    },
    [],
  );

  const sectionEdgePortsBySectionId = useMemo(() => {
    const bySectionId: Record<
      string,
      {
        inputPortIds: string[];
        outputPortIds: string[];
      }
    > = {};
    for (const sectionId of Object.keys(sectionVariantMap)) {
      const variantId = sectionVariantMap[sectionId];
      if (!variantId) {
        bySectionId[sectionId] = {
          inputPortIds: [],
          outputPortIds: [],
        };
        continue;
      }
      const variant = sectionVariants[variantId];
      if (!variant) {
        bySectionId[sectionId] = {
          inputPortIds: [],
          outputPortIds: [],
        };
        continue;
      }
      const impl = sectionImpls[variant.impl];
      if (!impl || !isBaseSectionWithParamsImpl(impl)) {
        bySectionId[sectionId] = {
          inputPortIds: [],
          outputPortIds: [],
        };
        continue;
      }
      bySectionId[sectionId] = {
        inputPortIds: impl.edgeInputParams,
        outputPortIds: impl.edgeOutputPorts.map((port) => port.id),
      };
    }
    return bySectionId;
  }, [sectionImpls, sectionVariantMap, sectionVariants]);

  useEffect(() => {
    setCachedNestedDataHandlePositions((currentCachedPositions) => {
      const nextCachedPositions = collectCanvasEngineNestedDataHandlePositions({
        liveEdgeHandlePositions: visibleNestedEdgeHandlePositions,
        knownTopLevelSectionIds: Object.keys(topLevelSections),
        nestedPreviewRects,
        previousCachedPositions: currentCachedPositions,
      });
      if (
        areEdgeHandlePositionMapsEqual(
          currentCachedPositions,
          nextCachedPositions,
        )
      ) {
        return currentCachedPositions;
      }
      return nextCachedPositions;
    });
  }, [nestedPreviewRects, topLevelSections, visibleNestedEdgeHandlePositions]);

  useEffect(() => {
    const currentCachedPositions = useEdgeHandleRegistry.getState()
      .cachedPositions;
    if (
      areEdgeHandlePositionMapsEqual(
        currentCachedPositions,
        cachedNestedDataHandlePositions,
      )
    ) {
      return;
    }
    useEdgeHandleRegistry.setState((state) => {
      state.cachedPositions = cachedNestedDataHandlePositions;
    });
  }, [cachedNestedDataHandlePositions]);

  const mergedDataEdgeHandlePositions = useMemo(
    () => ({
      ...cachedNestedDataHandlePositions,
      ...edgeHandlePositions,
    }),
    [cachedNestedDataHandlePositions, edgeHandlePositions],
  );

  useLayoutEffect(() => {
    const patchSummary = sceneAdapter.applyProjectState({
      topLevelSections,
      activeSectionIds,
      nestedPreviewRects,
      edges: dataEdges,
      agenticEdges,
      edgeHandlePositions: mergedDataEdgeHandlePositions,
      sectionEdgePortsBySectionId,
    });
    if (patchSummary.hasChanges) {
      setProjectSceneRevision((value) => value + 1);
    }
  }, [
    activeSectionIds,
    agenticEdges,
    dataEdges,
    mergedDataEdgeHandlePositions,
    nestedPreviewRects,
    sceneAdapter,
    sectionEdgePortsBySectionId,
    topLevelSections,
  ]);

  const snapshotResult = useMemo(
    () => sceneAdapter.createSnapshot(camera, viewport),
    [camera, projectSceneRevision, sceneAdapter, viewport],
  );
  const renderSceneSnapshot = useMemo(
    () => ({
      ...snapshotResult.snapshot,
      connectionPreview,
      hoveredEdge,
    }),
    [connectionPreview, hoveredEdge, snapshotResult.snapshot],
  );
  const visibleResolvedDataEdgeCount = useMemo(
    () =>
      snapshotResult.snapshot.dataEdges.filter(
        (edge) =>
          edge.sourceX !== null &&
          edge.sourceY !== null &&
          edge.targetX !== null &&
          edge.targetY !== null,
      ).length,
    [snapshotResult.snapshot.dataEdges],
  );

  useEffect(() => {
    const currentSelectionBounds = useReactFlow.getState().nodesSelectionDims;
    if (
      areSelectionBoundsEqual(
        currentSelectionBounds,
        selectedTopLevelSelectionBounds,
      )
    ) {
      return;
    }
    useReactFlow.setState({
      nodesSelectionDims: selectedTopLevelSelectionBounds,
    });
  }, [selectedTopLevelSelectionBounds]);

  useEffect(() => {
    return () => {
      if (useReactFlow.getState().nodesSelectionDims === null) {
        return;
      }
      useReactFlow.setState({
        nodesSelectionDims: null,
      });
    };
  }, []);

  useEffect(() => {
    if (!selectedTopLevelSelectionBounds) {
      return;
    }
    selectionOverlayRef.current?.focus({
      preventScroll: true,
    });
  }, [selectedTopLevelSectionIds, selectedTopLevelSelectionBounds]);

  const domIslandViewportSectionIds = useMemo(() => {
    const worldPadding = DOM_ISLAND_VIEWPORT_PADDING_PX / camera.zoom;
    const viewportRect = {
      x: camera.x - worldPadding,
      y: camera.y - worldPadding,
      width: viewport.width / camera.zoom + worldPadding * 2,
      height: viewport.height / camera.zoom + worldPadding * 2,
    };
    const sectionIdsInMountWindow = sceneAdapter.querySectionIdsInWorldRect(
      viewportRect,
      true,
    );
    const readableSectionIds = sectionIdsInMountWindow.filter((sectionId) => {
      const rect = sceneAdapter.getRectById(sectionId);
      if (!rect) {
        return false;
      }
      return isDomIslandReadableAtCurrentZoom(rect, camera.zoom);
    });
    return sortSectionIdsByZIndexThenId(readableSectionIds, sceneAdapter);
  }, [
    camera,
    domIslandRetentionRevision,
    projectSceneRevision,
    sceneAdapter,
    viewport,
  ]);

  const domIslandMountState = useMemo(() => {
    const mountPolicyResult = resolveDomIslandMountPolicy({
      activeSectionIds,
      viewportSectionIds: domIslandViewportSectionIds,
      previousMountedSectionIds: domIslandMountedSectionIdsRef.current,
      retentionExpiryBySectionId: domIslandRetentionExpiryByIdRef.current,
      nowMs: Date.now(),
      retentionMs: DOM_ISLAND_RETENTION_MS,
      maxRetainedSections: DOM_ISLAND_MAX_RETAINED_SECTIONS,
      hasRectForSection: (sectionId: string) =>
        sceneAdapter.getRectById(sectionId) !== null,
      sortSectionIds: (sectionIds: string[]) =>
        sortSectionIdsByZIndexThenId(sectionIds, sceneAdapter),
    });
    domIslandMountedSectionIdsRef.current = mountPolicyResult.mountedSectionIds;
    return mountPolicyResult;
  }, [
    activeSectionIds,
    domIslandRetentionRevision,
    domIslandViewportSectionIds,
    sceneAdapter,
  ]);

  const domIslandSectionIds = domIslandMountState.mountedSectionIds;
  const domIslandRetainedSectionIdSet =
    domIslandMountState.retainedSectionIdSet;
  const domIslandRenderEntries = useMemo(() => {
    const entries: DomIslandRenderEntry[] = [];
    for (const sectionId of domIslandSectionIds) {
      const rect = sceneAdapter.getRectById(sectionId);
      if (rect) {
        entries.push({
          rect,
          retained: domIslandRetainedSectionIdSet.has(sectionId),
        });
      }
    }
    return entries;
  }, [
    domIslandRetainedSectionIdSet,
    domIslandSectionIds,
    projectSceneRevision,
    sceneAdapter,
  ]);

  const domIslandLayerTransform = useMemo(() => {
    const transform = getReactFlowViewportFromCamera(camera);
    return {
      transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
      transformOrigin: "top left",
    };
  }, [camera]);

  useLayoutEffect(() => {
    const nextNestedPreviewResult = collectCanvasEngineNestedPreviewRects({
      hostElement: hostRef.current,
      camera,
      knownTopLevelSectionIds: snapshotResult.snapshot.rects.map(
        (rect) => rect.id,
      ),
      previousRectsByParentSectionId:
        nestedPreviewRectsByParentSectionIdRef.current,
      activeSectionIds,
    });
    nestedPreviewRectsByParentSectionIdRef.current =
      nextNestedPreviewResult.rectsByParentSectionId;
    setNestedPreviewRects((currentNestedPreviewRects) =>
      areNestedPreviewRectArraysEqual(
        currentNestedPreviewRects,
        nextNestedPreviewResult.nestedPreviewRects,
      )
        ? currentNestedPreviewRects
        : nextNestedPreviewResult.nestedPreviewRects,
    );
  }, [
    activeSectionIds,
    camera,
    domIslandSectionIds,
    snapshotResult.snapshot.rects,
  ]);

  useEffect(() => {
    const currentNestedPreviewRects =
      useReactFlow.getState().canvasEngineNestedPreviewRects;
    if (
      areNestedPreviewRectArraysEqual(
        currentNestedPreviewRects,
        nestedPreviewRects,
      )
    ) {
      return;
    }
    useReactFlow.setState({
      canvasEngineNestedPreviewRects: nestedPreviewRects,
    });
  }, [nestedPreviewRects]);

  useEffect(() => {
    return () => {
      if (useReactFlow.getState().canvasEngineNestedPreviewRects.length === 0) {
        return;
      }
      useReactFlow.setState({
        canvasEngineNestedPreviewRects: [],
      });
    };
  }, []);

  useEffect(() => {
    return () => {
      if (
        Object.keys(useEdgeHandleRegistry.getState().cachedPositions).length ===
        0
      ) {
        return;
      }
      useEdgeHandleRegistry.setState((state) => {
        state.cachedPositions = {};
      });
    };
  }, []);

  useEffect(() => {
    const nextCamera = getInitialCamera({
      viewport: persistedViewport,
      viewportInitialized,
    });
    hasHydratedReactFlowTransformRef.current = false;
    pendingReactFlowViewportRef.current = null;
    setCamera((currentCamera) => {
      if (
        currentCamera.x === nextCamera.x &&
        currentCamera.y === nextCamera.y &&
        currentCamera.zoom === nextCamera.zoom
      ) {
        return currentCamera;
      }
      return nextCamera;
    });
  }, [persistedViewport, viewportInitialized]);

  useEffect(() => {
    const hostElement = hostRef.current;
    if (!hostElement) {
      return;
    }

    useReactFlow.setState({ domNode: hostElement });

    const updateViewport = () => {
      const nextViewport = {
        width: Math.max(1, Math.floor(hostElement.clientWidth)),
        height: Math.max(1, Math.floor(hostElement.clientHeight)),
        dpr:
          typeof window.devicePixelRatio === "number" &&
          window.devicePixelRatio > 0
            ? window.devicePixelRatio
            : 1,
      };
      setViewport((currentViewport) => {
        if (
          currentViewport.width === nextViewport.width &&
          currentViewport.height === nextViewport.height &&
          currentViewport.dpr === nextViewport.dpr
        ) {
          return currentViewport;
        }
        return nextViewport;
      });
    };

    updateViewport();
    const resizeObserver = new ResizeObserver(() => {
      updateViewport();
    });
    resizeObserver.observe(hostElement);
    window.addEventListener("resize", updateViewport);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateViewport);
      if (useReactFlow.getState().domNode === hostElement) {
        useReactFlow.setState({ domNode: null });
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let isActive = true;
    let createdRenderer: CanvasEngineRenderer | null = null;

    const initRenderer = async () => {
      const renderer = await createCanvasEngineRenderer(canvas);
      if (!isActive) {
        renderer.destroy();
        return;
      }
      createdRenderer = renderer;
      rendererRef.current = renderer;
      setBackendSelection(renderer.selection);
      setRendererRevision((value) => value + 1);
    };

    void initRenderer();

    return () => {
      isActive = false;
      if (createdRenderer) {
        createdRenderer.destroy();
      }
      if (rendererRef.current === createdRenderer) {
        rendererRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const reactFlowState = useReactFlow.getState();
    if (
      reactFlowState.width === viewport.width &&
      reactFlowState.height === viewport.height
    ) {
      return;
    }
    useReactFlow.setState({
      width: viewport.width,
      height: viewport.height,
    });
  }, [viewport.height, viewport.width]);

  useEffect(() => {
    if (!fitViewOnInit || fitViewOnInitDone) {
      return;
    }
    const didFit = fitView({
      initial: true,
      ...(fitViewOnInitOptions ?? {}),
    });
    if (!didFit) {
      return;
    }
    useReactFlow.setState({
      fitViewOnInitDone: true,
    });
  }, [
    fitViewOnInit,
    fitViewOnInitDone,
    fitViewOnInitOptions,
    projectSceneRevision,
    viewport.height,
    viewport.width,
  ]);

  useEffect(() => {
    const reactFlowState = useReactFlow.getState();
    const currentTransform = {
      x: reactFlowState.transform[0],
      y: reactFlowState.transform[1],
      zoom: reactFlowState.transform[2],
    };
    const nextTransform = getReactFlowViewportFromCamera(camera);
    const fitViewStateMatches =
      !reactFlowState.fitViewOnInit && reactFlowState.fitViewOnInitDone;
    if (
      areViewportsEqual(currentTransform, nextTransform) &&
      fitViewStateMatches
    ) {
      if (
        pendingReactFlowViewportRef.current &&
        areViewportsEqual(pendingReactFlowViewportRef.current, nextTransform)
      ) {
        pendingReactFlowViewportRef.current = null;
      }
      return;
    }
    pendingReactFlowViewportRef.current = nextTransform;
    useReactFlow.setState({
      transform: [nextTransform.x, nextTransform.y, nextTransform.zoom],
      fitViewOnInit: false,
      fitViewOnInitDone: true,
    });
  }, [camera]);

  useEffect(() => {
    const expectedTransform = getReactFlowViewportFromCamera(camera);
    const currentTransform = {
      x: reactFlowTransform[0],
      y: reactFlowTransform[1],
      zoom: reactFlowTransform[2],
    };
    const pendingTransform = pendingReactFlowViewportRef.current;

    if (pendingTransform) {
      if (areViewportsEqual(currentTransform, pendingTransform)) {
        pendingReactFlowViewportRef.current = null;
      } else {
        return;
      }
    }

    if (!hasHydratedReactFlowTransformRef.current) {
      if (areViewportsEqual(currentTransform, expectedTransform)) {
        hasHydratedReactFlowTransformRef.current = true;
      }
      return;
    }

    const nextCamera = getCameraFromReactFlowViewport(currentTransform);
    setCamera((currentCamera) => {
      if (areCamerasEqual(currentCamera, nextCamera)) {
        return currentCamera;
      }
      return nextCamera;
    });
  }, [camera, reactFlowTransform]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) {
      return;
    }
    renderer.render(renderSceneSnapshot, viewport);
  }, [renderSceneSnapshot, rendererRevision, viewport]);

  useEffect(() => {
    const expiryById = domIslandRetentionExpiryByIdRef.current;
    if (domIslandRetentionTimerIdRef.current !== null) {
      window.clearTimeout(domIslandRetentionTimerIdRef.current);
      domIslandRetentionTimerIdRef.current = null;
    }
    const delayMs = getNextDomIslandRetentionDelayMs(expiryById, Date.now());
    if (delayMs === null) {
      return;
    }
    domIslandRetentionTimerIdRef.current = window.setTimeout(() => {
      domIslandRetentionTimerIdRef.current = null;
      setDomIslandRetentionRevision((value) => value + 1);
    }, delayMs);
  }, [domIslandSectionIds]);

  useEffect(() => {
    return () => {
      if (domIslandRetentionTimerIdRef.current !== null) {
        window.clearTimeout(domIslandRetentionTimerIdRef.current);
        domIslandRetentionTimerIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const hostElement = hostRef.current;
    if (!hostElement) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      const pinchZoom = isCanvasPinchZoomGesture(event);
      if (!pinchZoom && isCanvasWheelBlockedByTarget(event.target)) {
        return;
      }
      event.preventDefault();

      const rect = hostElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const zoomDelta = getCanvasEngineWheelDelta(event);

      setCamera((currentCamera) => {
        const nextZoom = clampZoom(currentCamera.zoom * Math.pow(2, zoomDelta));
        if (nextZoom === currentCamera.zoom) {
          return currentCamera;
        }

        const worldX = currentCamera.x + localX / currentCamera.zoom;
        const worldY = currentCamera.y + localY / currentCamera.zoom;

        return {
          x: worldX - localX / nextZoom,
          y: worldY - localY / nextZoom,
          zoom: nextZoom,
        };
      });
    };

    const preventBrowserGestureZoom = (event: Event) => {
      event.preventDefault();
    };

    hostElement.addEventListener("wheel", handleWheel, { passive: false });
    hostElement.addEventListener("gesturestart", preventBrowserGestureZoom, {
      passive: false,
    });
    hostElement.addEventListener("gesturechange", preventBrowserGestureZoom, {
      passive: false,
    });
    hostElement.addEventListener("gestureend", preventBrowserGestureZoom, {
      passive: false,
    });
    return () => {
      hostElement.removeEventListener("wheel", handleWheel);
      hostElement.removeEventListener(
        "gesturestart",
        preventBrowserGestureZoom,
      );
      hostElement.removeEventListener(
        "gesturechange",
        preventBrowserGestureZoom,
      );
      hostElement.removeEventListener("gestureend", preventBrowserGestureZoom);
    };
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      const pointerMultiSelectionActive = event.metaKey || event.ctrlKey;
      if (
        pointerMultiSelectionActive &&
        !useReactFlow.getState().multiSelectionActive
      ) {
        useReactFlow.setState({
          multiSelectionActive: true,
        });
      }
      if (isCanvasGestureBlockedByTarget(event.target)) {
        return;
      }
      const worldPoint = resolveWorldPointFromPointerEvent(event, camera);
      if (!worldPoint) {
        return;
      }
      updateConnectionPreview(null);
      updateHoveredEdge(null);
      updateSelectionRect(null);
      if (
        resolveCanvasEngineSelectionOverlayTarget(event.target) &&
        selectedTopLevelSectionIds.length > 0
      ) {
        const draggedSections = resolveDraggedTopLevelSections(
          selectedTopLevelSectionIds,
          topLevelSections,
        );
        if (draggedSections.length > 0) {
          selectionOverlayRef.current?.focus({
            preventScroll: true,
          });
          pointerSessionRef.current = {
            pointerId: event.pointerId,
            kind: "selection-overlay",
            anchorWorldX: worldPoint.x,
            anchorWorldY: worldPoint.y,
            draggedSections,
            moved: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
      }
      const agenticHandleHit = sceneAdapter.hitTestAgenticHandleAtWorldPoint(
        worldPoint.x,
        worldPoint.y,
        AGENTIC_HANDLE_HIT_TOLERANCE_WORLD,
      );
      if (
        canEditStructure &&
        agenticHandleHit &&
        agenticHandleHit.handleType === "source"
      ) {
        pointerSessionRef.current = {
          pointerId: event.pointerId,
          kind: "agentic-connect",
          sourceSectionId: agenticHandleHit.sectionId,
          sourceHandleWorldX: agenticHandleHit.handleWorldX,
          sourceHandleWorldY: agenticHandleHit.handleWorldY,
        };
        updateConnectionPreview({
          kind: "agentic-connect",
          startX: agenticHandleHit.handleWorldX,
          startY: agenticHandleHit.handleWorldY,
          endX: worldPoint.x,
          endY: worldPoint.y,
          targetHandleX: null,
          targetHandleY: null,
          targetValid: false,
        });
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      const dataSourceHandleHit = sceneAdapter.hitTestDataHandleAtWorldPoint(
        worldPoint.x,
        worldPoint.y,
        DATA_HANDLE_HIT_TOLERANCE_WORLD,
        { handleType: "source" },
      );
      if (canEditStructure && dataSourceHandleHit) {
        pointerSessionRef.current = {
          pointerId: event.pointerId,
          kind: "data-connect",
          sourceSectionId: dataSourceHandleHit.sectionId,
          sourcePortId: dataSourceHandleHit.portId,
          sourceHandleWorldX: dataSourceHandleHit.handleWorldX,
          sourceHandleWorldY: dataSourceHandleHit.handleWorldY,
        };
        updateConnectionPreview({
          kind: "data-connect",
          startX: dataSourceHandleHit.handleWorldX,
          startY: dataSourceHandleHit.handleWorldY,
          endX: worldPoint.x,
          endY: worldPoint.y,
          targetHandleX: null,
          targetHandleY: null,
          targetValid: false,
        });
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      const dataEdgeEndpointHit =
        sceneAdapter.hitTestDataEdgeEndpointAtWorldPoint(
          worldPoint.x,
          worldPoint.y,
          resolveDataEdgeEndpointHitToleranceWorld(camera.zoom),
        );
      if (canEditStructure && dataEdgeEndpointHit) {
        const edgeAnchors = sceneAdapter.getDataEdgeAnchorsById(
          dataEdgeEndpointHit.edgeId,
        );
        if (!edgeAnchors) {
          return;
        }
        const fixedHandleWorldX =
          dataEdgeEndpointHit.endpointType === "source"
            ? edgeAnchors.endX
            : edgeAnchors.startX;
        const fixedHandleWorldY =
          dataEdgeEndpointHit.endpointType === "source"
            ? edgeAnchors.endY
            : edgeAnchors.startY;
        pointerSessionRef.current = {
          pointerId: event.pointerId,
          kind: "data-reconnect",
          edgeId: dataEdgeEndpointHit.edgeId,
          endpointType: dataEdgeEndpointHit.endpointType,
          fixedHandleWorldX,
          fixedHandleWorldY,
        };
        updateConnectionPreview({
          kind: "data-reconnect",
          startX:
            dataEdgeEndpointHit.endpointType === "source"
              ? worldPoint.x
              : fixedHandleWorldX,
          startY:
            dataEdgeEndpointHit.endpointType === "source"
              ? worldPoint.y
              : fixedHandleWorldY,
          endX:
            dataEdgeEndpointHit.endpointType === "source"
              ? fixedHandleWorldX
              : worldPoint.x,
          endY:
            dataEdgeEndpointHit.endpointType === "source"
              ? fixedHandleWorldY
              : worldPoint.y,
          targetHandleX: null,
          targetHandleY: null,
          targetValid: false,
        });
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      const sectionId = sceneAdapter.hitTestSectionAtWorldPoint(
        worldPoint.x,
        worldPoint.y,
        resolveSectionHitToleranceWorld(camera.zoom),
      );
      if (sectionId) {
        const sectionRect = sceneAdapter.getResolvedSectionRectById(sectionId);
        const isTopLevelSection = Object.hasOwn(topLevelSections, sectionId);
        if (!isTopLevelSection) {
          applyActiveSectionChange({
            interaction: "section-click",
            sectionId,
          });
          pointerSessionRef.current = {
            pointerId: event.pointerId,
            kind: "preview-section",
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
        const resizeCapabilities = resolveResizeCapabilities(
          sectionId,
          sectionSizingPolicy,
        );
        const resizeDirection =
          sectionRect && resizeCapabilities
            ? resolveResizeHandleDirection({
                sectionRect,
                worldPoint,
                camera,
              })
            : null;
        if (
          sectionRect &&
          resizeCapabilities &&
          resizeDirection &&
          isResizeDirectionEnabled(resizeDirection, resizeCapabilities)
        ) {
          applyActiveSectionChange({
            interaction: "section-click",
            sectionId,
          });
          pointerSessionRef.current = {
            pointerId: event.pointerId,
            kind: "resize",
            sectionId,
            direction: resizeDirection,
            anchorWorldX: worldPoint.x,
            anchorWorldY: worldPoint.y,
            sectionStartWidth: sectionRect.width,
            sectionStartHeight: sectionRect.height,
            minWidth: resizeCapabilities.minWidth,
            maxWidth: resizeCapabilities.maxWidth,
            minHeight: resizeCapabilities.minHeight,
            maxHeight: resizeCapabilities.maxHeight,
            widthResizable: resizeCapabilities.widthResizable,
            heightResizable: resizeCapabilities.heightResizable,
            aspectRatio: resolveSessionAspectRatio({
              resizeCapabilities,
              sectionRect,
            }),
            aspectRatioExtraWidth: resizeCapabilities.aspectRatioExtraWidth,
            aspectRatioExtraHeight: resizeCapabilities.aspectRatioExtraHeight,
            moved: false,
            lastAppliedSize: null,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
        const sectionWasActiveAtPointerDown =
          activeSectionIds.includes(sectionId);
        const preserveExistingSelectionForDrag =
          sectionWasActiveAtPointerDown && activeSectionIds.length > 1;
        let selectionAppliedOnPointerDown = false;
        if (!preserveExistingSelectionForDrag) {
          applyActiveSectionChange({
            interaction: "section-click",
            sectionId,
          });
          selectionAppliedOnPointerDown = true;
        }
        const candidateDraggedSectionIds = sectionWasActiveAtPointerDown
          ? activeSectionIds
          : [sectionId];
        const draggedSections = resolveDraggedTopLevelSections(
          candidateDraggedSectionIds,
          topLevelSections,
        );
        if (draggedSections.length === 0) {
          draggedSections.push({
            sectionId,
            sectionStartX: sectionRect?.x ?? 0,
            sectionStartY: sectionRect?.y ?? 0,
          });
        }
        pointerSessionRef.current = {
          pointerId: event.pointerId,
          kind: "section",
          sectionId,
          anchorWorldX: worldPoint.x,
          anchorWorldY: worldPoint.y,
          draggedSections,
          selectionAppliedOnPointerDown,
          moved: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      const edgeHit = sceneAdapter.hitTestEdgeAtWorldPoint(
        worldPoint.x,
        worldPoint.y,
        resolveEdgeHitToleranceWorld(camera.zoom),
      );
      if (edgeHit) {
        const multiSelectionActive =
          useReactFlow.getState().multiSelectionActive;
        if (edgeHit.kind === "data") {
          toggleEdgeSelection(edgeHit.id, multiSelectionActive);
        } else {
          toggleAgenticEdgeSelection(edgeHit.id, multiSelectionActive);
        }
        pointerSessionRef.current = {
          pointerId: event.pointerId,
          kind: "edge",
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      if (useReactFlow.getState().selectionKeyPressed) {
        const canvasPoint = resolveCanvasPointFromPointerEvent(event);
        if (!canvasPoint) {
          return;
        }
        applyActiveSectionChange({
          interaction: "selection-rect",
          selectedIds: [],
        });
        pointerSessionRef.current = {
          pointerId: event.pointerId,
          kind: "selection-rect",
          startWorldX: worldPoint.x,
          startWorldY: worldPoint.y,
          startCanvasX: canvasPoint.x,
          startCanvasY: canvasPoint.y,
          moved: false,
          selectedIds: [],
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      pointerSessionRef.current = {
        pointerId: event.pointerId,
        kind: "pane",
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        moved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [
      activeSectionIds,
      camera,
      canEditStructure,
      sceneAdapter,
      sectionSizingPolicy,
      topLevelSections,
      updateConnectionPreview,
      updateHoveredEdge,
      updateSelectionRect,
    ],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pointerSession = pointerSessionRef.current;
      if (!pointerSession) {
        if (isCanvasGestureBlockedByTarget(event.target)) {
          updateHoveredEdge(null);
          return;
        }
        const worldPoint = resolveWorldPointFromPointerEvent(event, camera);
        if (!worldPoint) {
          updateHoveredEdge(null);
          return;
        }
        const edgeHit = sceneAdapter.hitTestEdgeAtWorldPoint(
          worldPoint.x,
          worldPoint.y,
          resolveEdgeHitToleranceWorld(camera.zoom),
        );
        updateHoveredEdge(edgeHit);
        return;
      }
      if (pointerSession.pointerId !== event.pointerId) {
        return;
      }
      if (pointerSession.kind === "resize") {
        const worldPoint = resolveWorldPointFromPointerEvent(event, camera);
        if (!worldPoint) {
          return;
        }
        const deltaWorldX = worldPoint.x - pointerSession.anchorWorldX;
        const deltaWorldY = worldPoint.y - pointerSession.anchorWorldY;
        const hasResizeChangeFromStart = deltaWorldX !== 0 || deltaWorldY !== 0;
        if (!hasResizeChangeFromStart && !pointerSession.moved) {
          return;
        }
        pointerSession.moved = pointerSession.moved || hasResizeChangeFromStart;
        const nextResize = resolveResizeUpdate({
          direction: pointerSession.direction,
          sectionStartWidth: pointerSession.sectionStartWidth,
          sectionStartHeight: pointerSession.sectionStartHeight,
          deltaWorldX,
          deltaWorldY,
          minWidth: pointerSession.minWidth,
          maxWidth: pointerSession.maxWidth,
          minHeight: pointerSession.minHeight,
          maxHeight: pointerSession.maxHeight,
          widthResizable: pointerSession.widthResizable,
          heightResizable: pointerSession.heightResizable,
          aspectRatio: pointerSession.aspectRatio,
          aspectRatioExtraWidth: pointerSession.aspectRatioExtraWidth,
          aspectRatioExtraHeight: pointerSession.aspectRatioExtraHeight,
        });
        pointerSession.lastAppliedSize = nextResize.sizeChange;
        setTopLevelSectionLayoutRects([
          {
            sectionId: pointerSession.sectionId,
            nextLayoutPatch: {
              w: nextResize.width,
              h: nextResize.height,
            },
          },
        ]);
        return;
      }
      if (pointerSession.kind === "section") {
        const worldPoint = resolveWorldPointFromPointerEvent(event, camera);
        if (!worldPoint) {
          return;
        }
        const deltaX = worldPoint.x - pointerSession.anchorWorldX;
        const deltaY = worldPoint.y - pointerSession.anchorWorldY;
        const hasPositionChangeFromStart = deltaX !== 0 || deltaY !== 0;
        if (!hasPositionChangeFromStart && !pointerSession.moved) {
          return;
        }
        pointerSession.moved =
          pointerSession.moved || hasPositionChangeFromStart;
        setTopLevelSectionLayoutRects(
          pointerSession.draggedSections.map((section) => ({
            sectionId: section.sectionId,
            nextLayoutPatch: {
              x: section.sectionStartX + deltaX,
              y: section.sectionStartY + deltaY,
            },
          })),
        );
        return;
      }
      if (pointerSession.kind === "preview-section") {
        return;
      }
      if (pointerSession.kind === "selection-overlay") {
        const worldPoint = resolveWorldPointFromPointerEvent(event, camera);
        if (!worldPoint) {
          return;
        }
        const deltaX = worldPoint.x - pointerSession.anchorWorldX;
        const deltaY = worldPoint.y - pointerSession.anchorWorldY;
        const hasPositionChangeFromStart = deltaX !== 0 || deltaY !== 0;
        if (!hasPositionChangeFromStart && !pointerSession.moved) {
          return;
        }
        pointerSession.moved =
          pointerSession.moved || hasPositionChangeFromStart;
        setTopLevelSectionLayoutRects(
          pointerSession.draggedSections.map((section) => ({
            sectionId: section.sectionId,
            nextLayoutPatch: {
              x: section.sectionStartX + deltaX,
              y: section.sectionStartY + deltaY,
            },
          })),
        );
        return;
      }
      if (pointerSession.kind === "selection-rect") {
        const worldPoint = resolveWorldPointFromPointerEvent(event, camera);
        const canvasPoint = resolveCanvasPointFromPointerEvent(event);
        if (!worldPoint || !canvasPoint) {
          return;
        }
        pointerSession.moved = true;
        const selectionRectWorld = resolveSelectionRectBounds(
          pointerSession.startWorldX,
          pointerSession.startWorldY,
          worldPoint.x,
          worldPoint.y,
        );
        const selectionRectCanvas = resolveSelectionRectBounds(
          pointerSession.startCanvasX,
          pointerSession.startCanvasY,
          canvasPoint.x,
          canvasPoint.y,
        );
        const selectionMode =
          useSettings.getState().gui?.selectionMode ??
          SelectionModeEnum.partial;
        const selectedIds = mergeSelectedSectionIds(
          sceneAdapter.querySectionIdsInWorldRect(
            selectionRectWorld,
            selectionMode === SelectionModeEnum.partial,
            {
              includeNestedPreviewRects: true,
            },
          ),
          resolveMountedDomSectionIdsInCanvasRect({
            hostElement: hostRef.current,
            selectionRect: selectionRectCanvas,
            selectionMode,
          }),
        );
        if (!areStringArraysEqual(pointerSession.selectedIds, selectedIds)) {
          pointerSession.selectedIds = selectedIds;
          applyActiveSectionChange({
            interaction: "selection-rect",
            selectedIds,
          });
        }
        updateSelectionRect(selectionRectCanvas);
        return;
      }
      if (pointerSession.kind === "agentic-connect") {
        const worldPoint = resolveWorldPointFromPointerEvent(event, camera);
        if (!worldPoint) {
          return;
        }
        const targetHandleHit = sceneAdapter.hitTestAgenticHandleAtWorldPoint(
          worldPoint.x,
          worldPoint.y,
          AGENTIC_HANDLE_HIT_TOLERANCE_WORLD,
        );
        let endX = worldPoint.x;
        let endY = worldPoint.y;
        let targetHandleX: number | null = null;
        let targetHandleY: number | null = null;
        let targetValid = false;
        if (targetHandleHit) {
          targetHandleX = targetHandleHit.handleWorldX;
          targetHandleY = targetHandleHit.handleWorldY;
          const connection = createAgenticConnection({
            sourceSectionId: pointerSession.sourceSectionId,
            targetSectionId: targetHandleHit.sectionId,
            targetHandleType: targetHandleHit.handleType,
          });
          if (isValidAgenticEdgeConnection(connection)) {
            targetValid = true;
            endX = targetHandleHit.handleWorldX;
            endY = targetHandleHit.handleWorldY;
          }
        }
        updateConnectionPreview({
          kind: "agentic-connect",
          startX: pointerSession.sourceHandleWorldX,
          startY: pointerSession.sourceHandleWorldY,
          endX,
          endY,
          targetHandleX,
          targetHandleY,
          targetValid,
        });
        return;
      }
      if (pointerSession.kind === "data-connect") {
        const worldPoint = resolveWorldPointFromPointerEvent(event, camera);
        if (!worldPoint) {
          return;
        }
        const targetHandleHit = sceneAdapter.hitTestDataHandleAtWorldPoint(
          worldPoint.x,
          worldPoint.y,
          DATA_HANDLE_HIT_TOLERANCE_WORLD,
          { handleType: "target" },
        );
        let endX = worldPoint.x;
        let endY = worldPoint.y;
        let targetHandleX: number | null = null;
        let targetHandleY: number | null = null;
        let targetValid = false;
        if (targetHandleHit) {
          targetHandleX = targetHandleHit.handleWorldX;
          targetHandleY = targetHandleHit.handleWorldY;
          const connection: Connection = {
            source: pointerSession.sourceSectionId,
            sourceHandle: pointerSession.sourcePortId,
            target: targetHandleHit.sectionId,
            targetHandle: targetHandleHit.portId,
          };
          if (isValidDataEdgeConnection(connection)) {
            targetValid = true;
            endX = targetHandleHit.handleWorldX;
            endY = targetHandleHit.handleWorldY;
          }
        }
        updateConnectionPreview({
          kind: "data-connect",
          startX: pointerSession.sourceHandleWorldX,
          startY: pointerSession.sourceHandleWorldY,
          endX,
          endY,
          targetHandleX,
          targetHandleY,
          targetValid,
        });
        return;
      }
      if (pointerSession.kind === "data-reconnect") {
        const worldPoint = resolveWorldPointFromPointerEvent(event, camera);
        if (!worldPoint) {
          return;
        }
        const edge = sceneAdapter.getDataEdgeById(pointerSession.edgeId);
        let movingHandleX = worldPoint.x;
        let movingHandleY = worldPoint.y;
        let targetHandleX: number | null = null;
        let targetHandleY: number | null = null;
        let targetValid = false;
        const hitHandle = sceneAdapter.hitTestDataHandleAtWorldPoint(
          worldPoint.x,
          worldPoint.y,
          DATA_HANDLE_HIT_TOLERANCE_WORLD,
          { handleType: pointerSession.endpointType },
        );
        if (edge && hitHandle) {
          targetHandleX = hitHandle.handleWorldX;
          targetHandleY = hitHandle.handleWorldY;
          const connection: Connection =
            pointerSession.endpointType === "source"
              ? {
                  source: hitHandle.sectionId,
                  sourceHandle: hitHandle.portId,
                  target: edge.targetSectionId,
                  targetHandle: edge.targetPortId,
                }
              : {
                  source: edge.sourceSectionId,
                  sourceHandle: edge.sourcePortId,
                  target: hitHandle.sectionId,
                  targetHandle: hitHandle.portId,
                };
          if (isValidDataEdgeConnection(connection)) {
            targetValid = true;
            movingHandleX = hitHandle.handleWorldX;
            movingHandleY = hitHandle.handleWorldY;
          }
        }
        updateConnectionPreview({
          kind: "data-reconnect",
          startX:
            pointerSession.endpointType === "source"
              ? movingHandleX
              : pointerSession.fixedHandleWorldX,
          startY:
            pointerSession.endpointType === "source"
              ? movingHandleY
              : pointerSession.fixedHandleWorldY,
          endX:
            pointerSession.endpointType === "source"
              ? pointerSession.fixedHandleWorldX
              : movingHandleX,
          endY:
            pointerSession.endpointType === "source"
              ? pointerSession.fixedHandleWorldY
              : movingHandleY,
          targetHandleX,
          targetHandleY,
          targetValid,
        });
        return;
      }
      if (pointerSession.kind !== "pane") {
        return;
      }

      const deltaX = event.clientX - pointerSession.lastClientX;
      const deltaY = event.clientY - pointerSession.lastClientY;
      pointerSession.lastClientX = event.clientX;
      pointerSession.lastClientY = event.clientY;

      if (deltaX === 0 && deltaY === 0) {
        return;
      }

      pointerSession.moved = true;
      setCamera((currentCamera) => ({
        x: currentCamera.x - deltaX / currentCamera.zoom,
        y: currentCamera.y - deltaY / currentCamera.zoom,
        zoom: currentCamera.zoom,
      }));
    },
    [
      camera,
      sceneAdapter,
      updateConnectionPreview,
      updateHoveredEdge,
      updateSelectionRect,
    ],
  );

  const handlePointerLeave = useCallback(() => {
    updateHoveredEdge(null);
  }, [updateHoveredEdge]);

  const handleContextMenu = useCallback(
    (event: MouseEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (isCanvasContextMenuBlockedByTarget(event.target)) {
        return;
      }
      const selectedSectionIdSet = new Set(activeSectionIds);
      const target = event.target;
      if (target instanceof Element) {
        const sectionElement = target.closest("section[data-section-id]");
        const sectionId = sectionElement?.getAttribute("data-section-id");
        if (sectionId && selectedSectionIdSet.has(sectionId)) {
          openSelectionContextMenu(event, activeSectionIds);
          return;
        }
        const topLevelDomIsland = target.closest(
          "[data-canvas-engine-dom-island]",
        );
        if (topLevelDomIsland instanceof HTMLElement) {
          const topLevelSectionId =
            topLevelDomIsland.dataset.canvasEngineDomIsland ?? null;
          if (
            topLevelSectionId &&
            selectedSectionIdSet.has(topLevelSectionId)
          ) {
            openSelectionContextMenu(event, activeSectionIds);
          }
          return;
        }
      }
      const worldPoint = resolveWorldPointFromMouseEvent(
        event,
        hostRef.current,
        camera,
      );
      if (worldPoint) {
        const sectionId = sceneAdapter.hitTestSectionAtWorldPoint(
          worldPoint.x,
          worldPoint.y,
          resolveSectionHitToleranceWorld(camera.zoom),
        );
        if (sectionId && selectedSectionIdSet.has(sectionId)) {
          openSelectionContextMenu(event, activeSectionIds);
          return;
        }
      }
      openPaneContextMenu(event);
    },
    [activeSectionIds, camera, sceneAdapter],
  );

  useEffect(() => {
    const hostElement = hostRef.current;
    if (!hostElement) {
      return;
    }

    hostElement.addEventListener("contextmenu", handleContextMenu);
    return () => {
      hostElement.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [handleContextMenu]);

  const handleSelectionOverlayContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (selectedTopLevelSectionIds.length === 0) {
        return;
      }
      openSelectionContextMenu(event, selectedTopLevelSectionIds);
    },
    [selectedTopLevelSectionIds],
  );

  const handleSelectionOverlayKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const delta = getCanvasEngineKeyboardMoveDelta({
        key: event.key,
        isShiftPressed: event.shiftKey,
        snapToGrid,
        snapGrid,
      });
      if (!delta || selectedTopLevelSectionIds.length === 0) {
        return;
      }
      event.preventDefault();
      const currentTopLevelSections =
        useProjectState.getState().projectConfig.topLevelSections;
      const patches = selectedTopLevelSectionIds.flatMap((sectionId) => {
        const layout = currentTopLevelSections[sectionId];
        if (!layout) {
          return [];
        }
        const currentX = typeof layout.x === "number" ? layout.x : 0;
        const currentY = typeof layout.y === "number" ? layout.y : 0;
        return [
          {
            sectionId,
            nextLayoutPatch: {
              x: currentX + delta.x,
              y: currentY + delta.y,
            },
          },
        ];
      });
      if (patches.length === 0) {
        return;
      }
      setTopLevelSectionLayoutRects(patches);
      void route_set_top_level_section_layout({
        projectConfigId,
        topLevelSections:
          useProjectState.getState().projectConfig.topLevelSections,
      });
    },
    [projectConfigId, selectedTopLevelSectionIds, snapGrid, snapToGrid],
  );

  const releasePointerCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pointerSession = pointerSessionRef.current;
      if (!pointerSession || pointerSession.pointerId !== event.pointerId) {
        return;
      }
      if (pointerSession.kind === "resize") {
        if (pointerSession.moved && pointerSession.lastAppliedSize) {
          const latestLayouts =
            useProjectState.getState().projectConfig.topLevelSections;
          const sectionSizes = applySectionSizeInProjectState(
            pointerSession.sectionId,
            pointerSession.lastAppliedSize,
          );
          void route_set_section_sizes({
            projectConfigId,
            sectionSizes,
          });
          void route_set_top_level_section_layout({
            projectConfigId,
            topLevelSections: latestLayouts,
          });
        }
      } else if (pointerSession.kind === "section") {
        if (pointerSession.moved) {
          const latestLayouts =
            useProjectState.getState().projectConfig.topLevelSections;
          void route_set_top_level_section_layout({
            projectConfigId,
            topLevelSections: latestLayouts,
          });
        } else if (!pointerSession.selectionAppliedOnPointerDown) {
          applyActiveSectionChange({
            interaction: "section-click",
            sectionId: pointerSession.sectionId,
          });
        }
      } else if (pointerSession.kind === "preview-section") {
        // Cached nested previews are selection-only until they remount as DOM islands.
      } else if (pointerSession.kind === "selection-overlay") {
        selectionOverlayRef.current?.focus({
          preventScroll: true,
        });
        if (pointerSession.moved) {
          const latestLayouts =
            useProjectState.getState().projectConfig.topLevelSections;
          void route_set_top_level_section_layout({
            projectConfigId,
            topLevelSections: latestLayouts,
          });
        }
      } else if (pointerSession.kind === "agentic-connect") {
        const worldPoint = resolveWorldPointFromPointerEvent(event, camera);
        if (worldPoint) {
          const targetHandleHit = sceneAdapter.hitTestAgenticHandleAtWorldPoint(
            worldPoint.x,
            worldPoint.y,
            AGENTIC_HANDLE_HIT_TOLERANCE_WORLD,
          );
          if (targetHandleHit) {
            const connection = createAgenticConnection({
              sourceSectionId: pointerSession.sourceSectionId,
              targetSectionId: targetHandleHit.sectionId,
              targetHandleType: targetHandleHit.handleType,
            });
            if (isValidAgenticEdgeConnection(connection)) {
              createAgenticEdgeFromConnection(connection);
            }
          }
        }
      } else if (pointerSession.kind === "data-connect") {
        const worldPoint = resolveWorldPointFromPointerEvent(event, camera);
        if (worldPoint) {
          const targetHandleHit = sceneAdapter.hitTestDataHandleAtWorldPoint(
            worldPoint.x,
            worldPoint.y,
            DATA_HANDLE_HIT_TOLERANCE_WORLD,
            { handleType: "target" },
          );
          if (targetHandleHit) {
            const connection: Connection = {
              source: pointerSession.sourceSectionId,
              sourceHandle: pointerSession.sourcePortId,
              target: targetHandleHit.sectionId,
              targetHandle: targetHandleHit.portId,
            };
            if (isValidDataEdgeConnection(connection)) {
              createEdgeFromConnection(connection);
            }
          }
        }
      } else if (pointerSession.kind === "data-reconnect") {
        const worldPoint = resolveWorldPointFromPointerEvent(event, camera);
        if (worldPoint) {
          const edge = sceneAdapter.getDataEdgeById(pointerSession.edgeId);
          if (edge) {
            if (pointerSession.endpointType === "source") {
              const sourceHandleHit =
                sceneAdapter.hitTestDataHandleAtWorldPoint(
                  worldPoint.x,
                  worldPoint.y,
                  DATA_HANDLE_HIT_TOLERANCE_WORLD,
                  { handleType: "source" },
                );
              if (sourceHandleHit) {
                const connection: Connection = {
                  source: sourceHandleHit.sectionId,
                  sourceHandle: sourceHandleHit.portId,
                  target: edge.targetSectionId,
                  targetHandle: edge.targetPortId,
                };
                if (isValidDataEdgeConnection(connection)) {
                  reconnectEdgeFromConnection(edge.id, connection);
                }
              }
            } else {
              const targetHandleHit =
                sceneAdapter.hitTestDataHandleAtWorldPoint(
                  worldPoint.x,
                  worldPoint.y,
                  DATA_HANDLE_HIT_TOLERANCE_WORLD,
                  { handleType: "target" },
                );
              if (targetHandleHit) {
                const connection: Connection = {
                  source: edge.sourceSectionId,
                  sourceHandle: edge.sourcePortId,
                  target: targetHandleHit.sectionId,
                  targetHandle: targetHandleHit.portId,
                };
                if (isValidDataEdgeConnection(connection)) {
                  reconnectEdgeFromConnection(edge.id, connection);
                }
              }
            }
          }
        }
      } else if (
        pointerSession.kind === "selection-rect" &&
        !pointerSession.moved
      ) {
        applyActiveSectionChange({ interaction: "pane-click" });
      } else if (pointerSession.kind === "pane" && !pointerSession.moved) {
        applyActiveSectionChange({ interaction: "pane-click" });
      }
      updateConnectionPreview(null);
      updateHoveredEdge(null);
      updateSelectionRect(null);
      pointerSessionRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [
      camera,
      projectConfigId,
      sceneAdapter,
      updateConnectionPreview,
      updateHoveredEdge,
      updateSelectionRect,
    ],
  );

  return (
    <div
      ref={hostRef}
      className="react-flow__pane relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-slate-950"
      style={{ touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerUp={releasePointerCapture}
      onPointerCancel={releasePointerCapture}
      data-canvas-engine-host="v1"
      data-canvas-engine-pane="v1"
      data-canvas-engine-active-backend={backendSelection.activeBackend}
      data-canvas-engine-preferred-backend={backendSelection.preferredBackend}
      data-canvas-engine-webgpu-available={String(
        backendSelection.webgpuAvailable,
      )}
      data-canvas-engine-webgl2-available={String(
        backendSelection.webgl2Available,
      )}
      data-canvas-engine-fallback-reason={backendSelection.fallbackReason ?? ""}
      data-canvas-engine-rect-count={snapshotResult.totalRectCount}
      data-canvas-engine-visible-rect-count={snapshotResult.visibleRectCount}
      data-canvas-engine-visible-data-edge-count={
        snapshotResult.visibleDataEdgeCount
      }
      data-canvas-engine-visible-resolved-data-edge-count={
        visibleResolvedDataEdgeCount
      }
      data-canvas-engine-data-edge-count={snapshotResult.totalDataEdgeCount}
      data-canvas-engine-visible-agentic-edge-count={
        snapshotResult.visibleAgenticEdgeCount
      }
      data-canvas-engine-agentic-edge-count={
        snapshotResult.totalAgenticEdgeCount
      }
      data-canvas-engine-connection-preview-active={String(
        connectionPreview !== null,
      )}
      data-canvas-engine-connection-preview-kind={connectionPreview?.kind ?? ""}
      data-canvas-engine-connection-preview-valid={String(
        connectionPreview?.targetValid ?? false,
      )}
      data-canvas-engine-connection-preview-has-target-handle={String(
        typeof connectionPreview?.targetHandleX === "number" &&
          typeof connectionPreview?.targetHandleY === "number",
      )}
      data-canvas-engine-connection-preview-target-x={
        typeof connectionPreview?.targetHandleX === "number"
          ? connectionPreview.targetHandleX.toFixed(2)
          : ""
      }
      data-canvas-engine-connection-preview-target-y={
        typeof connectionPreview?.targetHandleY === "number"
          ? connectionPreview.targetHandleY.toFixed(2)
          : ""
      }
      data-canvas-engine-hovered-edge-active={String(hoveredEdge !== null)}
      data-canvas-engine-hovered-edge-kind={hoveredEdge?.kind ?? ""}
      data-canvas-engine-hovered-edge-id={hoveredEdge?.id ?? ""}
      data-canvas-engine-selection-rect-active={String(selectionRect !== null)}
      data-canvas-engine-selection-rect-x={
        selectionRect ? selectionRect.x.toFixed(2) : ""
      }
      data-canvas-engine-selection-rect-y={
        selectionRect ? selectionRect.y.toFixed(2) : ""
      }
      data-canvas-engine-selection-rect-width={
        selectionRect ? selectionRect.width.toFixed(2) : ""
      }
      data-canvas-engine-selection-rect-height={
        selectionRect ? selectionRect.height.toFixed(2) : ""
      }
      data-canvas-engine-camera-x={camera.x.toFixed(2)}
      data-canvas-engine-camera-y={camera.y.toFixed(2)}
      data-canvas-engine-camera-zoom={camera.zoom.toFixed(3)}
      data-canvas-engine-active-section-count={activeSectionIds.length}
      data-canvas-engine-active-section-ids={activeSectionIds.join(",")}
      data-canvas-engine-nested-preview-count={nestedPreviewRects.length}
      data-canvas-engine-cached-nested-data-handle-count={
        Object.keys(cachedNestedDataHandlePositions).length
      }
      data-canvas-engine-dom-island-mounted-count={domIslandSectionIds.length}
      data-canvas-engine-dom-island-retained-count={
        domIslandMountState.retainedSectionCount
      }
      data-canvas-engine-dom-island-retention-ms={DOM_ISLAND_RETENTION_MS}
      data-canvas-engine-dom-island-retention-cap={
        DOM_ISLAND_MAX_RETAINED_SECTIONS
      }
    >
      <div
        aria-hidden="true"
        className="react-flow__viewport absolute left-0 top-0"
        data-canvas-engine-viewport-proxy="v1"
        style={{
          ...domIslandLayerTransform,
          width: 1,
          height: 1,
        }}
      />
      <canvas ref={canvasRef} className="h-full w-full" />
      {domIslandRenderEntries.length > 0 ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
          data-canvas-engine-dom-layer="v1"
        >
          <div
            className="absolute left-0 top-0"
            style={domIslandLayerTransform}
          >
            {domIslandRenderEntries.map((entry) => (
              <CanvasEngineDomIsland
                key={entry.rect.id}
                rect={entry.rect}
                retained={entry.retained}
              />
            ))}
          </div>
        </div>
      ) : null}
      {selectedTopLevelSelectionBounds ? (
        <div
          className="react-flow__container react-flow__nodesselection pointer-events-none absolute inset-0"
          style={domIslandLayerTransform}
          data-canvas-engine-selection-overlay="v1"
        >
          <div
            ref={selectionOverlayRef}
            tabIndex={-1}
            className="react-flow__nodesselection-rect"
            data-canvas-engine-selection-overlay-rect="v1"
            style={{
              left: selectedTopLevelSelectionBounds.x,
              top: selectedTopLevelSelectionBounds.y,
              width: selectedTopLevelSelectionBounds.width,
              height: selectedTopLevelSelectionBounds.height,
              pointerEvents: "all",
            }}
            onContextMenu={handleSelectionOverlayContextMenu}
            onKeyDown={handleSelectionOverlayKeyDown}
          />
        </div>
      ) : null}
      {selectionRect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute box-border border border-dotted"
          style={{
            left: selectionRect.x,
            top: selectionRect.y,
            width: selectionRect.width,
            height: selectionRect.height,
            background: SELECTION_RECT_FILL_COLOR,
            borderColor: SELECTION_RECT_BORDER_COLOR,
          }}
        />
      ) : null}
      <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-slate-900/80 px-3 py-2 text-xs text-slate-100">
        Canvas engine {backendSelection.activeBackend}
      </div>
    </div>
  );
}

function areConnectionPreviewsEqual(
  left: CanvasEngineConnectionPreview | null,
  right: CanvasEngineConnectionPreview | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.kind === right.kind &&
    left.startX === right.startX &&
    left.startY === right.startY &&
    left.endX === right.endX &&
    left.endY === right.endY &&
    left.targetHandleX === right.targetHandleX &&
    left.targetHandleY === right.targetHandleY &&
    left.targetValid === right.targetValid
  );
}

function areHoveredEdgesEqual(
  left: CanvasEngineHoveredEdge | null,
  right: CanvasEngineHoveredEdge | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.kind === right.kind && left.id === right.id;
}

function areSelectionRectsEqual(
  left: CanvasEngineSelectionRect | null,
  right: CanvasEngineSelectionRect | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function areSelectionBoundsEqual(
  left: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null,
  right: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function getInitialCamera({
  viewport,
  viewportInitialized,
}: {
  viewport: ReactFlowViewportTransform | null | undefined;
  viewportInitialized: boolean;
}): CanvasEngineCamera {
  if (!viewportInitialized || !viewport) {
    return DEFAULT_CAMERA;
  }
  return getCameraFromReactFlowViewport(viewport);
}

function getCameraFromReactFlowViewport(
  viewport: ReactFlowViewportTransform,
): CanvasEngineCamera {
  const zoom = clampZoom(viewport.zoom);
  return {
    x: -viewport.x / zoom,
    y: -viewport.y / zoom,
    zoom,
  };
}

function getReactFlowViewportFromCamera(
  camera: CanvasEngineCamera,
): ReactFlowViewportTransform {
  return {
    x: -camera.x * camera.zoom,
    y: -camera.y * camera.zoom,
    zoom: clampZoom(camera.zoom),
  };
}

function areCamerasEqual(
  left: CanvasEngineCamera,
  right: CanvasEngineCamera,
): boolean {
  return (
    Math.abs(left.x - right.x) <= VIEWPORT_SYNC_EPSILON &&
    Math.abs(left.y - right.y) <= VIEWPORT_SYNC_EPSILON &&
    Math.abs(left.zoom - right.zoom) <= VIEWPORT_SYNC_EPSILON
  );
}

function areViewportsEqual(
  left: ReactFlowViewportTransform,
  right: ReactFlowViewportTransform,
): boolean {
  return (
    Math.abs(left.x - right.x) <= VIEWPORT_SYNC_EPSILON &&
    Math.abs(left.y - right.y) <= VIEWPORT_SYNC_EPSILON &&
    Math.abs(left.zoom - right.zoom) <= VIEWPORT_SYNC_EPSILON
  );
}

function isCanvasPinchZoomGesture(event: WheelEvent): boolean {
  return event.ctrlKey;
}

function getCanvasEngineWheelDelta(event: WheelEvent): number {
  const factor = event.ctrlKey && isMacOs() ? 10 : 1;
  return getWheelDelta(event, factor);
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function sortSectionIdsByZIndexThenId(
  sectionIds: string[],
  sceneAdapter: CanvasEngineSceneAdapter,
): string[] {
  return Array.from(new Set(sectionIds)).sort((leftId, rightId) => {
    const leftRect = sceneAdapter.getRectById(leftId);
    const rightRect = sceneAdapter.getRectById(rightId);
    if (!leftRect || !rightRect) {
      return leftId.localeCompare(rightId);
    }
    if (leftRect.zIndex !== rightRect.zIndex) {
      return leftRect.zIndex - rightRect.zIndex;
    }
    return leftId.localeCompare(rightId);
  });
}

function mergeSelectedSectionIds(
  primarySectionIds: string[],
  additionalSectionIds: string[],
): string[] {
  if (additionalSectionIds.length === 0) {
    return primarySectionIds;
  }
  const mergedSectionIds = [...primarySectionIds];
  const seenIds = new Set(primarySectionIds);
  for (const sectionId of additionalSectionIds) {
    if (seenIds.has(sectionId)) {
      continue;
    }
    seenIds.add(sectionId);
    mergedSectionIds.push(sectionId);
  }
  return mergedSectionIds;
}

function resolveMountedDomSectionIdsInCanvasRect({
  hostElement,
  selectionRect,
  selectionMode,
}: {
  hostElement: HTMLDivElement | null;
  selectionRect: CanvasEngineSelectionRect;
  selectionMode: SelectionModeEnum;
}): string[] {
  if (!hostElement) {
    return [];
  }
  const hostBounds = hostElement.getBoundingClientRect();
  const sectionElements = hostElement.querySelectorAll(
    "[data-canvas-engine-dom-island] section[data-section-id]",
  );
  const selectedSectionIds: string[] = [];
  const selectedSectionIdSet = new Set<string>();
  for (const sectionElement of sectionElements) {
    const sectionId = sectionElement.getAttribute("data-section-id");
    if (!sectionId || selectedSectionIdSet.has(sectionId)) {
      continue;
    }
    const sectionBounds = sectionElement.getBoundingClientRect();
    if (sectionBounds.width <= 0 || sectionBounds.height <= 0) {
      continue;
    }
    const sectionRect = {
      x: sectionBounds.left - hostBounds.left,
      y: sectionBounds.top - hostBounds.top,
      width: sectionBounds.width,
      height: sectionBounds.height,
    };
    const matchesSelection =
      selectionMode === SelectionModeEnum.partial
        ? doCanvasRectsOverlap(selectionRect, sectionRect)
        : isCanvasRectFullyContained(selectionRect, sectionRect);
    if (!matchesSelection) {
      continue;
    }
    selectedSectionIdSet.add(sectionId);
    selectedSectionIds.push(sectionId);
  }
  return selectedSectionIds;
}

function doCanvasRectsOverlap(
  left: CanvasEngineSelectionRect,
  right: CanvasEngineSelectionRect,
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function isCanvasRectFullyContained(
  container: CanvasEngineSelectionRect,
  candidate: CanvasEngineSelectionRect,
): boolean {
  return (
    candidate.x >= container.x &&
    candidate.y >= container.y &&
    candidate.x + candidate.width <= container.x + container.width &&
    candidate.y + candidate.height <= container.y + container.height
  );
}

function isCanvasGestureBlockedByTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  if (!target.closest("[data-canvas-engine-dom-island]")) {
    return false;
  }
  return Boolean(
    target.closest(
      [
        "button",
        "input",
        "textarea",
        "select",
        "option",
        "[role='menuitem']",
        "[contenteditable='true']",
        `.${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER}`,
      ].join(","),
    ),
  );
}

function isCanvasContextMenuBlockedByTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(
    target.closest(
      [
        "input",
        "textarea",
        "select",
        "button",
        "a[href]",
        "[contenteditable='true']",
        "[role='menuitem']",
      ].join(","),
    ),
  );
}

function isCanvasWheelBlockedByTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  if (!target.closest("[data-canvas-engine-dom-island]")) {
    return false;
  }
  return Boolean(
    target.closest(
      [
        "input",
        "textarea",
        "select",
        "[contenteditable='true']",
        `.${NO_WHEEL_CLASS_NAME}`,
      ].join(","),
    ),
  );
}

const CanvasEngineDomIsland = memo(function CanvasEngineDomIsland({
  rect,
  retained,
}: DomIslandRenderEntry) {
  const shouldRenderSectionContainer = useProjectState((state) => {
    if (!(rect.id in state.projectConfig.topLevelSections)) {
      return false;
    }
    if (getCurrEffectiveSectionImplIfPresent(state, rect.id) === null) {
      return false;
    }
    const activeViewModeId = state.projectConfig.activeViewModeId;
    if (!activeViewModeId) {
      return false;
    }
    const activeViewMode = state.projectConfig.viewModes[activeViewModeId];
    if (!activeViewMode) {
      return false;
    }
    return activeViewMode.visibilityBySectionId[rect.id] !== undefined;
  });

  return (
    <div
      className={`${retained ? "pointer-events-none" : "pointer-events-auto"} absolute overflow-hidden [&_.section-resize-handle]:pointer-events-none`}
      data-canvas-engine-dom-island={rect.id}
      data-canvas-engine-dom-island-retained={String(retained)}
      style={
        retained
          ? { display: "none" }
          : {
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
            }
      }
    >
      {shouldRenderSectionContainer ? (
        <SectionContainer sectionId={rect.id} isTopLevel={true} />
      ) : null}
    </div>
  );
}, areDomIslandEntriesEqual);

function areDomIslandEntriesEqual(
  left: DomIslandRenderEntry,
  right: DomIslandRenderEntry,
): boolean {
  if (left.retained !== right.retained) {
    return false;
  }
  return areRectsEqual(left.rect, right.rect);
}

function areRectsEqual(
  left: CanvasEngineRect,
  right: CanvasEngineRect,
): boolean {
  return (
    left.id === right.id &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    left.zIndex === right.zIndex &&
    left.isActive === right.isActive
  );
}

function resolveWorldPointFromPointerEvent(
  event: ReactPointerEvent<HTMLElement>,
  camera: CanvasEngineCamera,
): { x: number; y: number } | null {
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  return {
    x: camera.x + localX / camera.zoom,
    y: camera.y + localY / camera.zoom,
  };
}

function resolveWorldPointFromMouseEvent(
  event: MouseEvent,
  hostElement: HTMLElement | null,
  camera: CanvasEngineCamera,
): { x: number; y: number } | null {
  if (!hostElement) {
    return null;
  }
  const rect = hostElement.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  return {
    x: camera.x + localX / camera.zoom,
    y: camera.y + localY / camera.zoom,
  };
}

function resolveCanvasPointFromPointerEvent(
  event: ReactPointerEvent<HTMLElement>,
): { x: number; y: number } | null {
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function resolveSelectionRectBounds(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): CanvasEngineSelectionRect {
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

function isDomIslandReadableAtCurrentZoom(
  rect: CanvasEngineRect,
  zoom: number,
): boolean {
  const screenWidth = rect.width * zoom;
  const screenHeight = rect.height * zoom;
  return (
    screenWidth >= DOM_ISLAND_MIN_SCREEN_WIDTH_PX &&
    screenHeight >= DOM_ISLAND_MIN_SCREEN_HEIGHT_PX
  );
}

function resolveEdgeHitToleranceWorld(zoom: number): number {
  return EDGE_HIT_TOLERANCE_PX / clampZoom(zoom);
}

function resolveSectionHitToleranceWorld(zoom: number): number {
  return SECTION_HIT_TOLERANCE_PX / clampZoom(zoom);
}

function resolveDataEdgeEndpointHitToleranceWorld(zoom: number): number {
  return DATA_EDGE_ENDPOINT_HIT_RADIUS_PX / clampZoom(zoom);
}

function createAgenticConnection({
  sourceSectionId,
  targetSectionId,
  targetHandleType,
}: {
  sourceSectionId: string;
  targetSectionId: string;
  targetHandleType: "source" | "target";
}): Connection {
  return {
    source: sourceSectionId,
    sourceHandle: AGENTIC_EDGE_HANDLE_IDS.source,
    target: targetSectionId,
    targetHandle:
      targetHandleType === "target"
        ? AGENTIC_EDGE_HANDLE_IDS.target
        : AGENTIC_EDGE_HANDLE_IDS.source,
  };
}

type TopLevelSectionLayoutPatch = {
  sectionId: string;
  nextLayoutPatch: {
    x?: number;
    y?: number;
    w?: number | null;
    h?: number | null;
  };
};

function setTopLevelSectionLayoutRects(
  patches: TopLevelSectionLayoutPatch[],
): void {
  if (patches.length === 0) {
    return;
  }
  useProjectState.setState((state) => {
    const { activeViewModeId, viewModes } = state.projectConfig;
    const activeViewTopLevelSections =
      activeViewModeId && viewModes[activeViewModeId]
        ? viewModes[activeViewModeId].topLevelSections
        : null;
    for (const patch of patches) {
      const existingLayout =
        state.projectConfig.topLevelSections[patch.sectionId];
      if (!existingLayout) {
        continue;
      }
      const nextLayout = {
        ...existingLayout,
        ...patch.nextLayoutPatch,
      };
      if (
        existingLayout.x === nextLayout.x &&
        existingLayout.y === nextLayout.y &&
        existingLayout.w === nextLayout.w &&
        existingLayout.h === nextLayout.h
      ) {
        continue;
      }
      state.projectConfig.topLevelSections[patch.sectionId] = nextLayout;
      if (activeViewTopLevelSections) {
        activeViewTopLevelSections[patch.sectionId] = nextLayout;
      }
    }
  });
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function resolveDraggedTopLevelSections(
  sectionIds: string[],
  topLevelSections: CanvasEngineProjectSceneInput["topLevelSections"],
): DraggedTopLevelSection[] {
  return sectionIds.flatMap((sectionId) => {
    const sectionLayout = topLevelSections[sectionId];
    if (!sectionLayout) {
      return [];
    }
    return [
      {
        sectionId,
        sectionStartX:
          typeof sectionLayout.x === "number" ? sectionLayout.x : 0,
        sectionStartY:
          typeof sectionLayout.y === "number" ? sectionLayout.y : 0,
      },
    ];
  });
}

function resolveCanvasEngineSelectionOverlayTarget(
  target: EventTarget | null,
): HTMLElement | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  return target.closest(
    '[data-canvas-engine-selection-overlay-rect="v1"]',
  ) as HTMLElement | null;
}

function applySectionSizeInProjectState(
  sectionId: string,
  sizeChange: Partial<SectionSize>,
): Record<string, SectionSize> {
  let updatedSectionSizes: Record<string, SectionSize> = {};
  useProjectState.setState((state) => {
    updatedSectionSizes = setSelfParentSiblingChildrenWidths(
      sectionId,
      sizeChange,
      state,
    );
  });
  return updatedSectionSizes;
}

function resolveResizeCapabilities(
  sectionId: string,
  sizingPolicy: SectionSizingPolicy | undefined,
): ResizeCapabilities | null {
  if (!sizingPolicy) {
    return null;
  }
  const state = useProjectState.getState();
  if (!(sectionId in state.sections)) {
    return null;
  }
  const impl = getCurrEffectiveSectionImplIfPresent(state, sectionId);
  if (!impl || impl.positionAndSizeLocked) {
    return null;
  }
  const hideSearch =
    "hideSearch" in impl && typeof impl.hideSearch === "boolean"
      ? impl.hideSearch
      : undefined;
  const hideParams =
    "hideParams" in impl && typeof impl.hideParams === "boolean"
      ? impl.hideParams
      : undefined;
  const isMinimized =
    "isMinimized" in impl && typeof impl.isMinimized === "boolean"
      ? impl.isMinimized
      : false;

  let minHeight = getMinSectionHeight({
    sectionType: impl.type,
    hideSearch,
    hideParams,
    isMinimized,
    sizingPolicy,
  });
  const maxHeight = getMaxSectionHeight({
    sectionType: impl.type,
    isMinimized,
    sizingPolicy,
  });
  let minWidth = getMinSectionWidth({
    sectionType: impl.type,
    sizingPolicy,
  });
  const maxWidth = getMaxSectionWidth({
    sectionType: impl.type,
    sizingPolicy,
  });

  const metaControlResizeMode = resolveMetaControlResizeMode({
    state,
    sectionId,
    impl,
    sizingPolicy,
  });
  if (metaControlResizeMode) {
    minHeight = Math.max(minHeight, metaControlResizeMode.minHeight);
    minWidth = Math.max(minWidth, metaControlResizeMode.minWidth);
  }

  const sizeMode = resolveSectionSizeMode({
    sectionId,
    sectionType: impl.type,
    hideParams,
    metaControlResizeMode,
  });
  const widthResizable = sizeMode.width !== SIZE_MODE.auto_only;
  const heightResizable =
    minHeight !== maxHeight && sizeMode.height !== SIZE_MODE.auto_only;

  const aspectRatioExtraHeight =
    "aspectRatioExtraHeight" in impl &&
    typeof impl.aspectRatioExtraHeight === "number"
      ? impl.aspectRatioExtraHeight
      : 0;
  const aspectRatioExtraWidth =
    "aspectRatioExtraWidth" in impl &&
    typeof impl.aspectRatioExtraWidth === "number"
      ? impl.aspectRatioExtraWidth
      : 0;
  const aspectRatioValue =
    "aspectRatio" in impl ? resolveAspectRatioValue(impl.aspectRatio) : null;

  return {
    widthResizable,
    heightResizable,
    minWidth,
    maxWidth,
    minHeight,
    maxHeight,
    aspectRatio: aspectRatioValue,
    aspectRatioExtraWidth,
    aspectRatioExtraHeight,
  };
}

function resolveMetaControlResizeMode({
  state,
  sectionId,
  impl,
  sizingPolicy,
}: {
  state: ReturnType<typeof useProjectState.getState>;
  sectionId: string;
  impl: NonNullable<ReturnType<typeof getCurrEffectiveSectionImplIfPresent>>;
  sizingPolicy: SectionSizingPolicy;
}): MetaControlResizeMode | null {
  if (impl.type !== SectionTypeEnum.MetaControl) {
    return null;
  }
  const controlParamId =
    "metaControlParamId" in impl ? impl.metaControlParamId : null;
  if (!controlParamId) {
    return null;
  }
  const controlVariantId = impl.codeObjVariantMap[controlParamId];
  if (controlVariantId === undefined) {
    return null;
  }
  const controlVariant = state.codeObjVariants[controlVariantId];
  if (!controlVariant) {
    return null;
  }
  const controlImpl = state.codeObjImpls[controlVariant.impl];
  const controlCore = state.codeObjs[controlParamId];
  if (!controlImpl || !controlCore) {
    return null;
  }
  const sharedType =
    "type" in controlCore.sharedModifier &&
    typeof controlCore.sharedModifier.type === "string"
      ? controlCore.sharedModifier.type
      : null;
  const variantType =
    "type" in controlVariant.modifier &&
    typeof controlVariant.modifier.type === "string"
      ? controlVariant.modifier.type
      : null;
  const controlType = variantType ?? sharedType ?? controlImpl.type;
  const entry =
    sizingPolicy.metaControlByType[
      controlType as keyof typeof sizingPolicy.metaControlByType
    ];
  if (!entry) {
    return null;
  }
  return {
    minHeight: entry.minHeight,
    minWidth: entry.minWidth,
    sizeModeHeight: entry.sizeModeHeight,
    sizeModeWidth: entry.sizeModeWidth,
  };
}

function resolveSectionSizeMode({
  sectionId,
  sectionType,
  hideParams,
  metaControlResizeMode,
}: {
  sectionId: string;
  sectionType: SectionType;
  hideParams: boolean | undefined;
  metaControlResizeMode: MetaControlResizeMode | null;
}): { height: string; width: string } {
  if (sectionType === SectionTypeEnum.MetaControl && metaControlResizeMode) {
    return {
      height: metaControlResizeMode.sizeModeHeight,
      width: metaControlResizeMode.sizeModeWidth,
    };
  }
  if (sectionType === SectionTypeEnum.Callable && hideParams) {
    return { height: SIZE_MODE.auto_only, width: SIZE_MODE.any };
  }
  if (
    sectionType === SectionTypeEnum.Terminal ||
    sectionType === SectionTypeEnum.Chart
  ) {
    return { height: SIZE_MODE.manual_only, width: SIZE_MODE.manual_only };
  }
  if (getIsTwitterSection(sectionId, useProjectState.getState())) {
    return { height: SIZE_MODE.auto_only, width: SIZE_MODE.any };
  }
  return { height: SIZE_MODE.any, width: SIZE_MODE.any };
}

function resolveAspectRatioValue(
  value: boolean | number | null | undefined,
): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (value === true) {
    return -1;
  }
  return null;
}

function resolveSessionAspectRatio({
  resizeCapabilities,
  sectionRect,
}: {
  resizeCapabilities: ResizeCapabilities;
  sectionRect: CanvasEngineRect;
}): number | null {
  const rawRatio = resizeCapabilities.aspectRatio;
  if (rawRatio === null) {
    return null;
  }
  if (rawRatio > 0) {
    return rawRatio;
  }
  const contentWidth = Math.max(
    1,
    sectionRect.width - resizeCapabilities.aspectRatioExtraWidth,
  );
  const contentHeight = Math.max(
    1,
    sectionRect.height - resizeCapabilities.aspectRatioExtraHeight,
  );
  return contentWidth / contentHeight;
}

function resolveResizeHandleDirection({
  sectionRect,
  worldPoint,
  camera,
}: {
  sectionRect: CanvasEngineRect;
  worldPoint: { x: number; y: number };
  camera: CanvasEngineCamera;
}): ResizeHandleDirection | null {
  const zoom = clamp(camera.zoom, MIN_ZOOM, MAX_ZOOM);
  const pointX = (worldPoint.x - camera.x) * zoom;
  const pointY = (worldPoint.y - camera.y) * zoom;
  const x0 = (sectionRect.x - camera.x) * zoom;
  const y0 = (sectionRect.y - camera.y) * zoom;
  const x1 = x0 + sectionRect.width * zoom;
  const y1 = y0 + sectionRect.height * zoom;
  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2;

  if (
    Math.abs(pointX - x1) <= RESIZE_HANDLE_HIT_RADIUS_PX &&
    Math.abs(pointY - y1) <= RESIZE_HANDLE_HIT_RADIUS_PX
  ) {
    return "bottomRight";
  }
  if (
    Math.abs(pointX - x1) <= RESIZE_HANDLE_HIT_RADIUS_PX &&
    Math.abs(pointY - midY) <= RESIZE_HANDLE_HIT_RADIUS_PX
  ) {
    return "right";
  }
  if (
    Math.abs(pointX - midX) <= RESIZE_HANDLE_HIT_RADIUS_PX &&
    Math.abs(pointY - y1) <= RESIZE_HANDLE_HIT_RADIUS_PX
  ) {
    return "bottom";
  }
  return null;
}

function isResizeDirectionEnabled(
  direction: ResizeHandleDirection,
  capabilities: ResizeCapabilities,
): boolean {
  if (direction === "right") {
    return capabilities.widthResizable;
  }
  if (direction === "bottom") {
    return capabilities.heightResizable;
  }
  return capabilities.widthResizable && capabilities.heightResizable;
}

function resolveResizeUpdate({
  direction,
  sectionStartWidth,
  sectionStartHeight,
  deltaWorldX,
  deltaWorldY,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
  widthResizable,
  heightResizable,
  aspectRatio,
  aspectRatioExtraWidth,
  aspectRatioExtraHeight,
}: {
  direction: ResizeHandleDirection;
  sectionStartWidth: number;
  sectionStartHeight: number;
  deltaWorldX: number;
  deltaWorldY: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  widthResizable: boolean;
  heightResizable: boolean;
  aspectRatio: number | null;
  aspectRatioExtraWidth: number;
  aspectRatioExtraHeight: number;
}): {
  width: number;
  height: number;
  sizeChange: Partial<SectionSize>;
} {
  let width = sectionStartWidth;
  let height = sectionStartHeight;

  if (direction === "right" && widthResizable) {
    width = clamp(sectionStartWidth + deltaWorldX, minWidth, maxWidth);
  }
  if (direction === "bottom" && heightResizable) {
    height = clamp(sectionStartHeight + deltaWorldY, minHeight, maxHeight);
  }
  if (direction === "bottomRight") {
    if (widthResizable) {
      width = clamp(sectionStartWidth + deltaWorldX, minWidth, maxWidth);
    }
    if (heightResizable) {
      height = clamp(sectionStartHeight + deltaWorldY, minHeight, maxHeight);
    }
  }

  if (aspectRatio) {
    const aspectResize = applyAspectRatioBounds({
      direction,
      width,
      height,
      minWidth,
      maxWidth,
      minHeight,
      maxHeight,
      aspectRatio,
      aspectRatioExtraWidth,
      aspectRatioExtraHeight,
    });
    width = aspectResize.width;
    height = aspectResize.height;
  }

  const sizeChange: Partial<SectionSize> = {};
  if (direction === "right") {
    sizeChange.width = width;
    if (aspectRatio) {
      sizeChange.height = height;
    }
  } else if (direction === "bottom") {
    sizeChange.height = height;
    if (aspectRatio) {
      sizeChange.width = width;
    }
  } else {
    sizeChange.width = width;
    sizeChange.height = height;
  }

  return {
    width,
    height,
    sizeChange,
  };
}

function applyAspectRatioBounds({
  direction,
  width,
  height,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
  aspectRatio,
  aspectRatioExtraWidth,
  aspectRatioExtraHeight,
}: {
  direction: ResizeHandleDirection;
  width: number;
  height: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  aspectRatio: number;
  aspectRatioExtraWidth: number;
  aspectRatioExtraHeight: number;
}): { width: number; height: number } {
  const resolveHeightFromWidth = (nextWidth: number) => {
    const contentWidth = Math.max(1, nextWidth - aspectRatioExtraWidth);
    return contentWidth / aspectRatio + aspectRatioExtraHeight;
  };
  const resolveWidthFromHeight = (nextHeight: number) => {
    const contentHeight = Math.max(1, nextHeight - aspectRatioExtraHeight);
    return contentHeight * aspectRatio + aspectRatioExtraWidth;
  };

  let nextWidth = width;
  let nextHeight = height;

  if (direction === "right") {
    nextHeight = resolveHeightFromWidth(nextWidth);
  } else if (direction === "bottom") {
    nextWidth = resolveWidthFromHeight(nextHeight);
  } else {
    const heightFromWidth = resolveHeightFromWidth(nextWidth);
    const widthFromHeight = resolveWidthFromHeight(nextHeight);
    const widthDrivenScore = Math.abs(heightFromWidth - nextHeight);
    const heightDrivenScore = Math.abs(widthFromHeight - nextWidth);
    if (widthDrivenScore <= heightDrivenScore) {
      nextHeight = heightFromWidth;
    } else {
      nextWidth = widthFromHeight;
    }
  }

  nextWidth = clamp(nextWidth, minWidth, maxWidth);
  nextHeight = clamp(nextHeight, minHeight, maxHeight);

  if (direction === "right" || direction === "bottomRight") {
    nextHeight = clamp(resolveHeightFromWidth(nextWidth), minHeight, maxHeight);
    nextWidth = clamp(resolveWidthFromHeight(nextHeight), minWidth, maxWidth);
  } else {
    nextWidth = clamp(resolveWidthFromHeight(nextHeight), minWidth, maxWidth);
    nextHeight = clamp(resolveHeightFromWidth(nextWidth), minHeight, maxHeight);
  }

  return { width: nextWidth, height: nextHeight };
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}
