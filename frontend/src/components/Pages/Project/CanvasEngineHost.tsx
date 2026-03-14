import {
  CanvasEngineSceneAdapter,
  type CanvasEngineProjectSceneInput,
  type CanvasEngineSceneSnapshotResult,
} from "canvas-engine/sceneAdapter";
import { useMemo, useRef } from "react";
import { useProjectState } from "state/definitions";

const DEFAULT_CAMERA = {
  x: 0,
  y: 0,
  zoom: 1,
};

const DEFAULT_VIEWPORT = {
  width: 100000,
  height: 100000,
  dpr: 1,
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
  if (!sceneAdapterRef.current) {
    sceneAdapterRef.current = new CanvasEngineSceneAdapter();
  }
  const sceneAdapter = sceneAdapterRef.current;

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
    return sceneAdapter.createSnapshot(DEFAULT_CAMERA, DEFAULT_VIEWPORT);
  }, [
    activeSectionIds,
    agenticEdges,
    dataEdges,
    sceneAdapter,
    topLevelSections,
  ]);

  return (
    <div
      className="relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-slate-950"
      data-canvas-engine-host="v1"
      data-canvas-engine-rect-count={snapshotResult.totalRectCount}
      data-canvas-engine-visible-rect-count={snapshotResult.visibleRectCount}
      data-canvas-engine-data-edge-count={snapshotResult.totalDataEdgeCount}
      data-canvas-engine-agentic-edge-count={
        snapshotResult.totalAgenticEdgeCount
      }
      data-canvas-engine-active-section-count={activeSectionIds.length}
    >
      <canvas className="h-full w-full" />
      <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-slate-900/80 px-3 py-2 text-xs text-slate-100">
        Canvas engine scaffold
      </div>
    </div>
  );
}
