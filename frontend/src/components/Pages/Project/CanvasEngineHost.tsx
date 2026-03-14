import {
  createCanvasEngineRenderer,
  type CanvasEngineBackendSelection,
  type CanvasEngineRenderer,
} from "canvas-engine/renderer";
import type { CanvasEngineCamera } from "canvas-engine/types";
import { useReactFlow } from "forks/xyflow/core/store";
import {
  CanvasEngineSceneAdapter,
  type CanvasEngineProjectSceneInput,
  type CanvasEngineSceneSnapshotResult,
} from "canvas-engine/sceneAdapter";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useProjectState } from "state/definitions";

type PanePointerSession = {
  pointerId: number;
  lastClientX: number;
  lastClientY: number;
};

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

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
  const activeSectionIds = useProjectState(
    (state) => state.projectConfig.activeIds,
  );
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

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      pointerSessionRef.current = {
        pointerId: event.pointerId,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
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
      pointerSessionRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
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
    >
      <canvas ref={canvasRef} className="h-full w-full" />
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
