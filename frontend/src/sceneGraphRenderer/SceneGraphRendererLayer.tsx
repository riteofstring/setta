import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import { useEffect, useMemo, useRef } from "react";
import {
  useEdgeHandleRegistry,
  useNodeInternals,
  useProjectState,
} from "state/definitions";
import { createRendererBackend } from "./backendFactory";
import {
  buildSceneGraphRenderSnapshot,
  buildSceneGraphRenderSnapshotDiff,
  createEmptySceneGraphRenderSnapshot,
} from "./snapshot";
import type { SceneGraphRendererRuntimeState } from "./useSceneGraphRendererRuntime";

type SceneGraphRendererLayerProps = {
  runtime: SceneGraphRendererRuntimeState;
  wrapperDimensions: { width: number; height: number };
  wireColor: string;
  darkMode: boolean;
};

export function SceneGraphRendererLayer({
  runtime,
  wrapperDimensions,
  wireColor,
  darkMode,
}: SceneGraphRendererLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const backendRef = useRef<ReturnType<typeof createRendererBackend> | null>(
    null,
  );
  const previousSnapshotRef = useRef(createEmptySceneGraphRenderSnapshot());
  const frameNumberRef = useRef(0);
  const nodesById = useNodeInternals((state) => state.x);
  const edgeHandlePositions = useEdgeHandleRegistry((state) => state.positions);
  const { edges, sectionVariantMap } = useProjectState(
    (state) => ({
      edges: state.projectConfig.edges,
      sectionVariantMap: state.projectConfig.sectionVariantMap,
    }),
    _.isEqual,
  );
  const transform = useReactFlow((state) => state.transform);

  const snapshot = useMemo(() => {
    return buildSceneGraphRenderSnapshot({
      nodesById,
      edges,
      sectionVariantMap,
      edgeHandlePositions,
    });
  }, [edgeHandlePositions, edges, nodesById, sectionVariantMap]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const backend = createRendererBackend(runtime.selection.resolvedBackend);
    backend.init(canvas, runtime.capabilities);
    backendRef.current = backend;
    previousSnapshotRef.current = createEmptySceneGraphRenderSnapshot();
    frameNumberRef.current = 0;

    return () => {
      backend.dispose();
      backendRef.current = null;
      previousSnapshotRef.current = createEmptySceneGraphRenderSnapshot();
    };
  }, [runtime.capabilities, runtime.selection.resolvedBackend]);

  useEffect(() => {
    const backend = backendRef.current;
    if (!backend) {
      return;
    }

    const previousSnapshot = previousSnapshotRef.current;
    const diff = buildSceneGraphRenderSnapshotDiff(previousSnapshot, snapshot);
    backend.updateResources(diff);

    frameNumberRef.current += 1;
    backend.render(
      snapshot,
      {
        x: transform[0],
        y: transform[1],
        zoom: transform[2],
        viewportWidth: wrapperDimensions.width,
        viewportHeight: wrapperDimensions.height,
        devicePixelRatio:
          typeof window === "undefined"
            ? 1
            : Math.max(1, window.devicePixelRatio || 1),
      },
      {
        frameNumber: frameNumberRef.current,
        timestampMs: typeof performance === "undefined" ? 0 : performance.now(),
        wireColor,
        sectionStrokeColor: darkMode
          ? "rgba(186, 194, 211, 0.75)"
          : "rgba(65, 80, 108, 0.72)",
        sectionFillColor: darkMode
          ? "rgba(17, 24, 39, 0.2)"
          : "rgba(203, 213, 225, 0.2)",
        debugOverlay: runtime.flags.debugOverlay,
      },
    );
    previousSnapshotRef.current = snapshot;
  }, [
    darkMode,
    runtime.flags.debugOverlay,
    snapshot,
    transform,
    wireColor,
    wrapperDimensions.height,
    wrapperDimensions.width,
  ]);

  const showCanvas =
    runtime.flags.enabled && runtime.selection.resolvedBackend !== "dom";

  return (
    <canvas
      ref={canvasRef}
      className="setta-scene-graph-renderer-layer"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 3,
        display: showCanvas ? "block" : "none",
      }}
      data-scene-graph-layer-visible={showCanvas ? "1" : "0"}
      data-scene-graph-layer-backend={runtime.selection.resolvedBackend}
      data-scene-graph-layer-sections={String(snapshot.sections.length)}
      data-scene-graph-layer-edges={String(snapshot.edges.length)}
    />
  );
}
