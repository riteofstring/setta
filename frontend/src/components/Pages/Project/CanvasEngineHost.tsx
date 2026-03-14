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
import { useReactFlow } from "forks/xyflow/core/store";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import { useActiveSectionUI, useProjectState } from "state/definitions";
import { NO_WHEEL_CLASS_NAME } from "utils/constants";

type PanePointerSession = {
  pointerId: number;
  lastClientX: number;
  lastClientY: number;
  moved: boolean;
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

  const sceneAdapterRef = useRef<CanvasEngineSceneAdapter | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<CanvasEngineRenderer | null>(null);
  const pointerSessionRef = useRef<PanePointerSession | null>(null);
  const skipInitialCameraSyncRef = useRef(true);
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

  const domIslandLayerTransform = useMemo(
    () => ({
      transform: `translate(${-camera.x * camera.zoom}px, ${-camera.y * camera.zoom}px) scale(${camera.zoom})`,
      transformOrigin: "top left",
    }),
    [camera],
  );

  useEffect(() => {
    const nextCamera = getInitialCamera({
      viewport: persistedViewport,
      viewportInitialized,
    });
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
    if (skipInitialCameraSyncRef.current) {
      skipInitialCameraSyncRef.current = false;
      if (!viewportInitialized) {
        return;
      }
    }

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
  }, [camera, viewportInitialized]);

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

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      if (isCanvasGestureBlockedByTarget(event.target)) {
        return;
      }
      pointerSessionRef.current = {
        pointerId: event.pointerId,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        moved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pointerSession = pointerSessionRef.current;
      if (!pointerSession || pointerSession.pointerId !== event.pointerId) {
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
    [],
  );

  const releasePointerCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pointerSession = pointerSessionRef.current;
      if (!pointerSession || pointerSession.pointerId !== event.pointerId) {
        return;
      }
      if (!pointerSession.moved) {
        applyActiveSectionChange({ interaction: "pane-click" });
      }
      pointerSessionRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
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
      const nextZoom = clampZoom(currentCamera.zoom * zoomFactor);
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
      className="relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-slate-950"
      style={{ touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
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
  viewport:
    | {
        x: number;
        y: number;
        zoom: number;
      }
    | null
    | undefined;
  viewportInitialized: boolean;
}): CanvasEngineCamera {
  if (!viewportInitialized || !viewport) {
    return DEFAULT_CAMERA;
  }
  return {
    x: viewport.x,
    y: viewport.y,
    zoom: clampZoom(viewport.zoom),
  };
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
  return (
    target instanceof Element &&
    target.closest("[data-canvas-engine-dom-island]") !== null
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
      className={`${retained ? "pointer-events-none" : "pointer-events-auto"} absolute overflow-hidden`}
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
