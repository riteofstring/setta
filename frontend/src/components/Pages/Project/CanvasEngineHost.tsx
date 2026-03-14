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
import { useEffect, useMemo, useRef, useState } from "react";
import { useProjectState } from "state/definitions";

const DEFAULT_CAMERA = {
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
  if (!sceneAdapterRef.current) {
    sceneAdapterRef.current = new CanvasEngineSceneAdapter();
  }
  const sceneAdapter = sceneAdapterRef.current;
  const [backendSelection, setBackendSelection] =
    useState<CanvasEngineBackendSelection>(INITIAL_BACKEND_SELECTION);
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
    return sceneAdapter.createSnapshot(DEFAULT_CAMERA, viewport);
  }, [
    activeSectionIds,
    agenticEdges,
    dataEdges,
    sceneAdapter,
    topLevelSections,
    viewport,
  ]);

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
    const renderer = rendererRef.current;
    if (!renderer) {
      return;
    }
    renderer.render(snapshotResult.snapshot, viewport);
  }, [rendererRevision, snapshotResult, viewport]);

  return (
    <div
      ref={hostRef}
      className="relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-slate-950"
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
      data-canvas-engine-active-section-count={activeSectionIds.length}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-slate-900/80 px-3 py-2 text-xs text-slate-100">
        Canvas engine {backendSelection.activeBackend}
      </div>
    </div>
  );
}
