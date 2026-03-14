import {
  getNextDomIslandRetentionDelayMs,
  resolveDomIslandMountPolicy,
} from "canvas-engine/domIslandMountPolicy";
import {
  createCanvasEngineRenderer,
  type CanvasEngineBackendSelection,
  type CanvasEngineRenderer,
} from "canvas-engine/renderer";
import {
  CanvasEngineSceneAdapter,
  type CanvasEngineProjectSceneInput,
  type CanvasEngineSceneSnapshotResult,
} from "canvas-engine/sceneAdapter";
import type { CanvasEngineCamera, CanvasEngineRect } from "canvas-engine/types";
import { SectionContainer } from "components/Section/Container/SectionContainer";
import { SIZE_MODE } from "components/Utils/Resizable/utils";
import { useReactFlow } from "forks/xyflow/core/store";
import { getWheelDelta } from "forks/xyflow/core/utils";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import { getCurrEffectiveSectionImplIfPresent } from "state/actions/sectionInfos";
import {
  setSelfParentSiblingChildrenWidths,
  type ResizeHandleDirection,
} from "state/actions/sections/sectionSizes";
import {
  useActiveSectionUI,
  useProjectState,
  useSettings,
} from "state/definitions";
import {
  getMaxSectionHeight,
  getMaxSectionWidth,
  getMinSectionHeight,
  getMinSectionWidth,
} from "state/hooks/sectionSizes";
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
  type SectionSize,
  type SectionSizingPolicy,
  type SectionType,
} from "utils/generatedTypes";
import { isMacOs } from "utils/utils";

type PanePointerSession = {
  pointerId: number;
  kind: "pane";
  lastClientX: number;
  lastClientY: number;
  moved: boolean;
};

type SectionPointerSession = {
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

type PointerSession =
  | PanePointerSession
  | SectionPointerSession
  | ResizePointerSession;

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

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const DOM_ISLAND_VIEWPORT_PADDING_PX = 240;
const DOM_ISLAND_MIN_ZOOM = 0.35;
const DOM_ISLAND_RETENTION_MS = 280;
const DOM_ISLAND_MAX_RETAINED_SECTIONS = 96;
const RESIZE_HANDLE_HIT_RADIUS_PX = 10;
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
  const reactFlowTransform = useReactFlow((state) => state.transform);

  const sceneAdapterRef = useRef<CanvasEngineSceneAdapter | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<CanvasEngineRenderer | null>(null);
  const pointerSessionRef = useRef<PointerSession | null>(null);
  const hasHydratedReactFlowTransformRef = useRef(false);
  const pendingReactFlowViewportRef = useRef<ReactFlowViewportTransform | null>(
    null,
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
  const [domIslandRetentionRevision, setDomIslandRetentionRevision] =
    useState(0);

  const snapshotResult = useMemo(() => {
    const sceneInput = {
      topLevelSections,
      activeSectionIds,
      edges: dataEdges,
      agenticEdges,
      edgeHandlePositions: {},
      sectionEdgePortsBySectionId: {},
    };
    sceneAdapter.applyProjectState(sceneInput);
    return sceneAdapter.createSnapshot(camera, viewport);
  }, [
    activeSectionIds,
    agenticEdges,
    camera,
    dataEdges,
    sceneAdapter,
    topLevelSections,
    viewport,
  ]);

  const domIslandViewportSectionIds = useMemo(() => {
    if (camera.zoom < DOM_ISLAND_MIN_ZOOM) {
      return [];
    }
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
    return sortSectionIdsByZIndexThenId(sectionIdsInMountWindow, sceneAdapter);
  }, [
    camera,
    domIslandRetentionRevision,
    sceneAdapter,
    topLevelSections,
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
    sceneAdapter,
    topLevelSections,
  ]);

  const domIslandLayerTransform = useMemo(() => {
    const transform = getReactFlowViewportFromCamera(camera);
    return {
      transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
      transformOrigin: "top left",
    };
  }, [camera]);

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
    renderer.render(snapshotResult.snapshot, viewport);
  }, [rendererRevision, snapshotResult, viewport]);

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
      const pinchZoom = event.ctrlKey && isMacOs();
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

    hostElement.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      hostElement.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      if (isCanvasGestureBlockedByTarget(event.target)) {
        return;
      }
      const worldPoint = resolveWorldPointFromPointerEvent(event, camera);
      if (!worldPoint) {
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
      sceneAdapter,
      sectionSizingPolicy,
      topLevelSections,
    ],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pointerSession = pointerSessionRef.current;
      if (!pointerSession || pointerSession.pointerId !== event.pointerId) {
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
    [camera],
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
      } else if (!pointerSession.moved) {
        applyActiveSectionChange({ interaction: "pane-click" });
      }
      pointerSessionRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [projectConfigId],
  );

  return (
    <div
      ref={hostRef}
      className="relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-slate-950"
      style={{ touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={releasePointerCapture}
      onPointerCancel={releasePointerCapture}
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
      data-canvas-engine-data-edge-count={snapshotResult.totalDataEdgeCount}
      data-canvas-engine-agentic-edge-count={
        snapshotResult.totalAgenticEdgeCount
      }
      data-canvas-engine-camera-x={camera.x.toFixed(2)}
      data-canvas-engine-camera-y={camera.y.toFixed(2)}
      data-canvas-engine-camera-zoom={camera.zoom.toFixed(3)}
      data-canvas-engine-active-section-count={activeSectionIds.length}
      data-canvas-engine-active-section-ids={activeSectionIds.join(",")}
      data-canvas-engine-dom-island-mounted-count={domIslandSectionIds.length}
      data-canvas-engine-dom-island-retained-count={
        domIslandMountState.retainedSectionCount
      }
      data-canvas-engine-dom-island-retention-ms={DOM_ISLAND_RETENTION_MS}
      data-canvas-engine-dom-island-retention-cap={
        DOM_ISLAND_MAX_RETAINED_SECTIONS
      }
    >
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
      <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-slate-900/80 px-3 py-2 text-xs text-slate-100">
        Canvas engine {backendSelection.activeBackend}
      </div>
    </div>
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
      <SectionContainer sectionId={rect.id} isTopLevel={true} />
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
