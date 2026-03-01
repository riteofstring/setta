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
  CanvasEngineViewport,
} from "canvas-engine/types";
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
import { useProjectState } from "state/definitions";
import { route_set_top_level_section_layout } from "utils/generatedEndpoints";

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
      sectionStartX: number;
      sectionStartY: number;
      moved: boolean;
    };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

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
    const patchSummary = sceneAdapter.applyProjectState({
      topLevelSections,
      activeSectionIds,
      edges: dataEdges,
      agenticEdges,
    });
    setLastPatchSummary(patchSummary);
    if (patchSummary.hasChanges) {
      setProjectSceneRevision((value) => value + 1);
    }
  }, [
    activeSectionIds,
    agenticEdges,
    dataEdges,
    sceneAdapter,
    topLevelSections,
  ]);

  const snapshotResult = useMemo(
    () => sceneAdapter.createSnapshot(camera, viewport),
    [camera, projectSceneRevision, sceneAdapter, viewport],
  );
  const sceneSnapshot = snapshotResult.snapshot;

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
    renderer.render(sceneSnapshot, viewport);
  }, [projectSceneRevision, rendererRevision, sceneSnapshot, viewport]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0) {
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
        const sectionLayout = topLevelSections[sectionId];
        const sectionStartX =
          sectionLayout && typeof sectionLayout.x === "number"
            ? sectionLayout.x
            : 0;
        const sectionStartY =
          sectionLayout && typeof sectionLayout.y === "number"
            ? sectionLayout.y
            : 0;
        applyActiveSectionChange({
          interaction: "section-click",
          sectionId,
        });
        pointerSessionRef.current = {
          pointerId: event.pointerId,
          kind: "section",
          sectionId,
          anchorWorldX: worldPoint.x,
          anchorWorldY: worldPoint.y,
          sectionStartX,
          sectionStartY,
          moved: false,
        };
      } else {
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
    [camera, sceneAdapter, topLevelSections],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const pointerSession = pointerSessionRef.current;
      if (!pointerSession || pointerSession.pointerId !== event.pointerId) {
        return;
      }
      if (pointerSession.kind === "section") {
        const worldPoint = resolveWorldPointFromPointerEvent(event, camera);
        if (!worldPoint) {
          return;
        }
        const deltaX = worldPoint.x - pointerSession.anchorWorldX;
        const deltaY = worldPoint.y - pointerSession.anchorWorldY;
        if (deltaX === 0 && deltaY === 0) {
          return;
        }
        pointerSession.moved = true;
        setTopLevelSectionLayoutPosition(pointerSession.sectionId, {
          x: pointerSession.sectionStartX + deltaX,
          y: pointerSession.sectionStartY + deltaY,
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
    [],
  );

  const releasePointerCapture = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const pointerSession = pointerSessionRef.current;
      if (!pointerSession || pointerSession.pointerId !== event.pointerId) {
        return;
      }
      if (pointerSession.kind === "section" && pointerSession.moved) {
        const latestLayouts =
          useProjectState.getState().projectConfig.topLevelSections;
        void route_set_top_level_section_layout({
          projectConfigId,
          topLevelSections: latestLayouts,
        });
      }
      if (pointerSession.kind === "pane" && !pointerSession.moved) {
        applyActiveSectionChange({ interaction: "pane-click" });
      }
      pointerSessionRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [projectConfigId],
  );

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLCanvasElement>) => {
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
    },
    [],
  );

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 h-full w-full"
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
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releasePointerCapture}
        onPointerCancel={releasePointerCapture}
        onWheel={handleWheel}
        style={{ touchAction: "none" }}
      />
    </div>
  );
}

function resolveWorldPointFromPointerEvent(
  event: ReactPointerEvent<HTMLCanvasElement>,
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

function setTopLevelSectionLayoutPosition(
  sectionId: string,
  position: { x: number; y: number },
): void {
  useProjectState.setState((state) => {
    const existingLayout = state.projectConfig.topLevelSections[sectionId];
    if (!existingLayout) {
      return;
    }
    const nextLayout = {
      ...existingLayout,
      x: position.x,
      y: position.y,
    };
    state.projectConfig.topLevelSections[sectionId] = nextLayout;
    const { activeViewModeId, viewModes } = state.projectConfig;
    if (activeViewModeId && viewModes[activeViewModeId]) {
      viewModes[activeViewModeId].topLevelSections[sectionId] = nextLayout;
    }
  });
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
