import {
  createCanvasEngineRenderer,
  type CanvasEngineRenderer,
} from "canvas-engine/renderer";
import {
  CanvasEngineSceneAdapter,
  type CanvasEngineScenePatchSummary,
} from "canvas-engine/sceneAdapter";
import type {
  CanvasEngineBackendSelection,
  CanvasEngineCamera,
  CanvasEngineConnectionPreview,
  CanvasEngineHoveredEdge,
  CanvasEngineRect,
  CanvasEngineViewport,
} from "canvas-engine/types";
import { SectionContainer } from "components/Section/Container/SectionContainer";
import { SIZE_MODE } from "components/Utils/Resizable/utils";
import { useReactFlow } from "forks/xyflow/core/store";
import type { Connection } from "forks/xyflow/core/types";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import {
  AGENTIC_EDGE_HANDLE_IDS,
  createAgenticEdgeFromConnection,
  isValidAgenticEdgeConnection,
  toggleAgenticEdgeSelection,
} from "state/actions/agenticEdges";
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
  useEdgeHandleRegistry,
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
  type SectionSize,
  type SectionSizingPolicy,
} from "utils/generatedTypes";

type PointerSession =
  | {
      pointerId: number;
      kind: "pane";
      lastClientX: number;
      lastClientY: number;
      moved: boolean;
    }
  | {
      pointerId: number;
      kind: "section";
      sectionId: string;
      anchorWorldX: number;
      anchorWorldY: number;
      draggedSections: Array<{
        sectionId: string;
        sectionStartX: number;
        sectionStartY: number;
      }>;
      selectionAppliedOnPointerDown: boolean;
      moved: boolean;
    }
  | {
      pointerId: number;
      kind: "resize";
      sectionId: string;
      direction: ResizeHandleDirection;
      anchorWorldX: number;
      anchorWorldY: number;
      sectionStartX: number;
      sectionStartY: number;
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
    }
  | {
      pointerId: number;
      kind: "edge";
    }
  | {
      pointerId: number;
      kind: "selection-rect";
      startWorldX: number;
      startWorldY: number;
      startCanvasX: number;
      startCanvasY: number;
      moved: boolean;
      selectedIds: string[];
    }
  | {
      pointerId: number;
      kind: "agentic-connect";
      sourceSectionId: string;
      sourceHandleWorldX: number;
      sourceHandleWorldY: number;
    }
  | {
      pointerId: number;
      kind: "data-connect";
      sourceSectionId: string;
      sourcePortId: string;
      sourceHandleWorldX: number;
      sourceHandleWorldY: number;
    }
  | {
      pointerId: number;
      kind: "data-reconnect";
      edgeId: string;
      endpointType: "source" | "target";
      fixedHandleWorldX: number;
      fixedHandleWorldY: number;
    };

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

type CanvasEngineSelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const RESIZE_HANDLE_HIT_RADIUS_PX = 10;
const EDGE_HIT_TOLERANCE_PX = 8;
const AGENTIC_HANDLE_HIT_TOLERANCE_WORLD = 12;
const DATA_HANDLE_HIT_TOLERANCE_WORLD = 10;
const DATA_EDGE_ENDPOINT_HIT_RADIUS_PX = 12;
const SELECTION_RECT_FILL_COLOR = "rgba(0, 89, 220, 0.08)";
const SELECTION_RECT_BORDER_COLOR = "rgba(0, 89, 220, 0.8)";
const DOM_ISLAND_VIEWPORT_PADDING_PX = 240;
const DOM_ISLAND_MIN_ZOOM = 0.35;

const INITIAL_BACKEND_SELECTION: CanvasEngineBackendSelection = {
  preferredBackend: "webgpu",
  activeBackend: "webgl2",
  webgpuAvailable: false,
  webgl2Available: false,
  fallbackReason: "Canvas engine initializing.",
};

const DEFAULT_CAMERA: CanvasEngineCamera = {
  x: 0,
  y: 0,
  zoom: 1,
};

const DEFAULT_VIEWPORT: CanvasEngineViewport = {
  width: 1,
  height: 1,
  dpr: 1,
};

const EMPTY_PATCH_SUMMARY: CanvasEngineScenePatchSummary = {
  hasChanges: false,
  sectionsAdded: 0,
  sectionsUpdated: 0,
  sectionsRemoved: 0,
  dataEdgesAdded: 0,
  dataEdgesUpdated: 0,
  dataEdgesRemoved: 0,
  agenticEdgesAdded: 0,
  agenticEdgesUpdated: 0,
  agenticEdgesRemoved: 0,
};

export function CanvasEngineHost() {
  const topLevelSections = useProjectState(
    (state) => state.projectConfig.topLevelSections,
  );
  const activeSectionIds = useProjectState(
    (state) => state.projectConfig.activeIds,
  );
  const dataEdges = useProjectState((state) => state.projectConfig.edges);
  const agenticEdges = useProjectState(
    (state) => state.projectConfig.agenticEdges,
  );
  const persistedViewport = useProjectState(
    (state) => state.projectConfig.viewport,
  );
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const sectionSizingPolicy = useSettings((state) => state.sectionSizingPolicy);
  const { canEditStructure } = useShareCapabilities();
  const edgeHandlePositions = useEdgeHandleRegistry((state) => state.positions);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<CanvasEngineRenderer | null>(null);
  const pointerSessionRef = useRef<PointerSession | null>(null);
  const sceneAdapterRef = useRef<CanvasEngineSceneAdapter | null>(null);
  if (!sceneAdapterRef.current) {
    sceneAdapterRef.current = new CanvasEngineSceneAdapter();
  }
  const sceneAdapter = sceneAdapterRef.current;

  const [rendererRevision, setRendererRevision] = useState(0);
  const [projectSceneRevision, setProjectSceneRevision] = useState(0);
  const [backendSelection, setBackendSelection] =
    useState<CanvasEngineBackendSelection>(INITIAL_BACKEND_SELECTION);
  const [lastPatchSummary, setLastPatchSummary] =
    useState<CanvasEngineScenePatchSummary>(EMPTY_PATCH_SUMMARY);
  const [camera, setCamera] = useState<CanvasEngineCamera>({
    x: persistedViewport?.x ?? DEFAULT_CAMERA.x,
    y: persistedViewport?.y ?? DEFAULT_CAMERA.y,
    zoom: clamp(
      persistedViewport?.zoom ?? DEFAULT_CAMERA.zoom,
      MIN_ZOOM,
      MAX_ZOOM,
    ),
  });
  const [viewport, setViewport] =
    useState<CanvasEngineViewport>(DEFAULT_VIEWPORT);

  useEffect(() => {
    const reactFlowState = useReactFlow.getState();
    const currentTransform = reactFlowState.transform;
    const fitViewStateMatches =
      !reactFlowState.fitViewOnInit && reactFlowState.fitViewOnInitDone;
    if (
      currentTransform[0] === camera.x &&
      currentTransform[1] === camera.y &&
      currentTransform[2] === camera.zoom &&
      fitViewStateMatches
    ) {
      return;
    }
    useReactFlow.setState({
      transform: [camera.x, camera.y, camera.zoom],
      fitViewOnInit: false,
      fitViewOnInitDone: true,
    });
  }, [camera]);
  const [connectionPreview, setConnectionPreview] =
    useState<CanvasEngineConnectionPreview | null>(null);
  const [hoveredEdge, setHoveredEdge] =
    useState<CanvasEngineHoveredEdge | null>(null);
  const [selectionRect, setSelectionRect] =
    useState<CanvasEngineSelectionRect | null>(null);

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

  useEffect(() => {
    const patchSummary = sceneAdapter.applyProjectState({
      topLevelSections,
      activeSectionIds,
      edges: dataEdges,
      agenticEdges,
      edgeHandlePositions,
    });
    setLastPatchSummary(patchSummary);
    if (patchSummary.hasChanges) {
      setProjectSceneRevision((value) => value + 1);
    }
  }, [
    activeSectionIds,
    agenticEdges,
    dataEdges,
    edgeHandlePositions,
    sceneAdapter,
    topLevelSections,
  ]);

  const snapshotResult = useMemo(
    () => sceneAdapter.createSnapshot(camera, viewport),
    [camera, projectSceneRevision, sceneAdapter, viewport],
  );
  const sceneSnapshot = snapshotResult.snapshot;
  const renderSceneSnapshot = useMemo(
    () => ({
      ...sceneSnapshot,
      connectionPreview,
      hoveredEdge,
    }),
    [connectionPreview, hoveredEdge, sceneSnapshot],
  );
  const domIslandRects = useMemo(() => {
    const rectMap = new Map<string, CanvasEngineRect>();
    if (camera.zoom >= DOM_ISLAND_MIN_ZOOM) {
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
      for (const sectionId of sectionIdsInMountWindow) {
        const rect = sceneAdapter.getRectById(sectionId);
        if (rect) {
          rectMap.set(sectionId, rect);
        }
      }
    }
    for (const sectionId of activeSectionIds) {
      if (rectMap.has(sectionId)) {
        continue;
      }
      const rect = sceneAdapter.getRectById(sectionId);
      if (rect) {
        rectMap.set(sectionId, rect);
      }
    }
    return Array.from(rectMap.values()).sort((left, right) => {
      if (left.zIndex === right.zIndex) {
        return left.id.localeCompare(right.id);
      }
      return left.zIndex - right.zIndex;
    });
  }, [activeSectionIds, camera, projectSceneRevision, sceneAdapter, viewport]);
  const domIslandLayerTransform = useMemo(
    () => ({
      transform: `translate(${-camera.x * camera.zoom}px, ${-camera.y * camera.zoom}px) scale(${camera.zoom})`,
      transformOrigin: "top left",
    }),
    [camera],
  );

  useEffect(() => {
    const hostElement = hostRef.current;
    if (!hostElement) {
      return;
    }

    const updateViewport = () => {
      const nextViewport: CanvasEngineViewport = {
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
    const renderer = rendererRef.current;
    if (!renderer) {
      return;
    }
    renderer.render(renderSceneSnapshot, viewport);
  }, [projectSceneRevision, rendererRevision, renderSceneSnapshot, viewport]);

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
      );
      if (sectionId) {
        const sectionRect = sceneAdapter.getRectById(sectionId);
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
          resizeDirection &&
          resizeCapabilities &&
          isResizeDirectionEnabled(resizeDirection, resizeCapabilities)
        ) {
          const sessionAspectRatio = resolveSessionAspectRatio({
            resizeCapabilities,
            sectionRect,
          });
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
            sectionStartX: sectionRect.x,
            sectionStartY: sectionRect.y,
            sectionStartWidth: sectionRect.width,
            sectionStartHeight: sectionRect.height,
            minWidth: resizeCapabilities.minWidth,
            maxWidth: resizeCapabilities.maxWidth,
            minHeight: resizeCapabilities.minHeight,
            maxHeight: resizeCapabilities.maxHeight,
            widthResizable: resizeCapabilities.widthResizable,
            heightResizable: resizeCapabilities.heightResizable,
            aspectRatio: sessionAspectRatio,
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
        const draggedSections = candidateDraggedSectionIds.flatMap(
          (candidateSectionId) => {
            const sectionLayout = topLevelSections[candidateSectionId];
            if (!sectionLayout) {
              return [];
            }
            return [
              {
                sectionId: candidateSectionId,
                sectionStartX:
                  typeof sectionLayout.x === "number" ? sectionLayout.x : 0,
                sectionStartY:
                  typeof sectionLayout.y === "number" ? sectionLayout.y : 0,
              },
            ];
          },
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
      } else {
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
        const selectionKeyPressed = useReactFlow.getState().selectionKeyPressed;
        if (selectionKeyPressed) {
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
      }
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
        const nextResize = resolveResizeUpdate({
          direction: pointerSession.direction,
          sectionStartWidth: pointerSession.sectionStartWidth,
          sectionStartHeight: pointerSession.sectionStartHeight,
          deltaWorldX: worldPoint.x - pointerSession.anchorWorldX,
          deltaWorldY: worldPoint.y - pointerSession.anchorWorldY,
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
        const hasSizeChangeFromStart =
          nextResize.width !== pointerSession.sectionStartWidth ||
          nextResize.height !== pointerSession.sectionStartHeight;
        if (!hasSizeChangeFromStart && !pointerSession.moved) {
          return;
        }
        pointerSession.moved = pointerSession.moved || hasSizeChangeFromStart;
        pointerSession.lastAppliedSize = nextResize.sizeChange;
        setTopLevelSectionLayoutRect(pointerSession.sectionId, {
          x: pointerSession.sectionStartX,
          y: pointerSession.sectionStartY,
          w: nextResize.width,
          h: nextResize.height,
        });
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
        const selectionMode =
          useSettings.getState().gui?.selectionMode ??
          SelectionModeEnum.partial;
        const selectedIds = sceneAdapter.querySectionIdsInWorldRect(
          selectionRectWorld,
          selectionMode === SelectionModeEnum.partial,
        );
        if (!areStringArraysEqual(pointerSession.selectedIds, selectedIds)) {
          pointerSession.selectedIds = selectedIds;
          applyActiveSectionChange({
            interaction: "selection-rect",
            selectedIds,
          });
        }

        updateSelectionRect(
          resolveSelectionRectBounds(
            pointerSession.startCanvasX,
            pointerSession.startCanvasY,
            canvasPoint.x,
            canvasPoint.y,
          ),
        );
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
          let connection: Connection;
          if (pointerSession.endpointType === "source") {
            connection = {
              source: hitHandle.sectionId,
              sourceHandle: hitHandle.portId,
              target: edge.targetSectionId,
              targetHandle: edge.targetPortId,
            };
          } else {
            connection = {
              source: edge.sourceSectionId,
              sourceHandle: edge.sourcePortId,
              target: hitHandle.sectionId,
              targetHandle: hitHandle.portId,
            };
          }

          if (isValidDataEdgeConnection(connection)) {
            targetValid = true;
            movingHandleX = hitHandle.handleWorldX;
            movingHandleY = hitHandle.handleWorldY;
          }
        }

        const previewStartX =
          pointerSession.endpointType === "source"
            ? movingHandleX
            : pointerSession.fixedHandleWorldX;
        const previewStartY =
          pointerSession.endpointType === "source"
            ? movingHandleY
            : pointerSession.fixedHandleWorldY;
        const previewEndX =
          pointerSession.endpointType === "source"
            ? pointerSession.fixedHandleWorldX
            : movingHandleX;
        const previewEndY =
          pointerSession.endpointType === "source"
            ? pointerSession.fixedHandleWorldY
            : movingHandleY;

        updateConnectionPreview({
          kind: "data-reconnect",
          startX: previewStartX,
          startY: previewStartY,
          endX: previewEndX,
          endY: previewEndY,
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

  const releasePointerCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pointerSession = pointerSessionRef.current;
      if (!pointerSession || pointerSession.pointerId !== event.pointerId) {
        return;
      }
      if (pointerSession.kind === "resize" && pointerSession.moved) {
        const latestLayouts =
          useProjectState.getState().projectConfig.topLevelSections;
        if (pointerSession.lastAppliedSize) {
          const sectionSizes = applySectionSizeInProjectState(
            pointerSession.sectionId,
            pointerSession.lastAppliedSize,
          );
          void route_set_section_sizes({
            projectConfigId,
            sectionSizes,
          });
        }
        void route_set_top_level_section_layout({
          projectConfigId,
          topLevelSections: latestLayouts,
        });
      }
      if (pointerSession.kind === "section") {
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
      }
      if (pointerSession.kind === "agentic-connect") {
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
      }
      if (pointerSession.kind === "data-connect") {
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
      }
      if (pointerSession.kind === "data-reconnect") {
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
      }
      if (pointerSession.kind === "selection-rect" && !pointerSession.moved) {
        applyActiveSectionChange({ interaction: "pane-click" });
      }
      if (pointerSession.kind === "pane" && !pointerSession.moved) {
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

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (isCanvasWheelBlockedByTarget(event.target)) {
      return;
    }
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const zoomFactor = Math.exp(-event.deltaY * 0.0015);

    setCamera((currentCamera) => {
      const nextZoom = clamp(
        currentCamera.zoom * zoomFactor,
        MIN_ZOOM,
        MAX_ZOOM,
      );
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
  }, []);

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 h-full w-full"
      style={{ touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerUp={releasePointerCapture}
      onPointerCancel={releasePointerCapture}
      onWheel={handleWheel}
      data-canvas-engine-host="v1"
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
      data-canvas-engine-last-sections-added={lastPatchSummary.sectionsAdded}
      data-canvas-engine-last-sections-updated={
        lastPatchSummary.sectionsUpdated
      }
      data-canvas-engine-last-sections-removed={
        lastPatchSummary.sectionsRemoved
      }
      data-canvas-engine-camera-x={camera.x.toFixed(2)}
      data-canvas-engine-camera-y={camera.y.toFixed(2)}
      data-canvas-engine-camera-zoom={camera.zoom.toFixed(3)}
      data-canvas-engine-active-section-count={activeSectionIds.length}
      data-canvas-engine-active-section-ids={activeSectionIds.join(",")}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
      {domIslandRects.length > 0 ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
          data-canvas-engine-dom-layer="v1"
        >
          <div
            className="absolute left-0 top-0"
            style={domIslandLayerTransform}
          >
            {domIslandRects.map((rect) => (
              <div
                key={rect.id}
                className={`pointer-events-auto absolute overflow-hidden ${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER}`}
                data-canvas-engine-dom-island={rect.id}
                style={{
                  left: rect.x,
                  top: rect.y,
                  width: rect.width,
                  height: rect.height,
                }}
              >
                <SectionContainer sectionId={rect.id} isTopLevel={true} />
              </div>
            ))}
          </div>
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
        "input",
        "textarea",
        "select",
        "option",
        "[role='menuitem']",
        "[contenteditable='true']",
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

function resolveEdgeHitToleranceWorld(zoom: number): number {
  const clampedZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  return EDGE_HIT_TOLERANCE_PX / clampedZoom;
}

function resolveDataEdgeEndpointHitToleranceWorld(zoom: number): number {
  const clampedZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  return DATA_EDGE_ENDPOINT_HIT_RADIUS_PX / clampedZoom;
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
  nextLayoutPatch: { x?: number; y?: number; w?: number; h?: number };
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

function setTopLevelSectionLayoutRect(
  sectionId: string,
  nextLayoutPatch: { x?: number; y?: number; w?: number; h?: number },
): void {
  setTopLevelSectionLayoutRects([{ sectionId, nextLayoutPatch }]);
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
  if (!impl) {
    return null;
  }
  if (impl.positionAndSizeLocked) {
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
}): {
  minHeight: number;
  minWidth: number;
  sizeModeHeight: string;
  sizeModeWidth: string;
} | null {
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
  sectionType: SectionTypeEnum;
  hideParams: boolean | undefined;
  metaControlResizeMode: {
    sizeModeHeight: string;
    sizeModeWidth: string;
  } | null;
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
  if (sectionType === SectionTypeEnum.Terminal) {
    return { height: SIZE_MODE.manual_only, width: SIZE_MODE.manual_only };
  }
  if (sectionType === SectionTypeEnum.Chart) {
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
  const hitRadius = RESIZE_HANDLE_HIT_RADIUS_PX;

  if (
    Math.abs(pointX - x1) <= hitRadius &&
    Math.abs(pointY - y1) <= hitRadius
  ) {
    return "bottomRight";
  }
  if (
    Math.abs(pointX - x1) <= hitRadius &&
    Math.abs(pointY - midY) <= hitRadius
  ) {
    return "right";
  }
  if (
    Math.abs(pointX - midX) <= hitRadius &&
    Math.abs(pointY - y1) <= hitRadius
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
