import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useEdgeHandleRegistry,
  useNodeInternals,
  useProjectState,
} from "state/definitions";
import { createRendererBackend } from "./backendFactory";
import {
  createEmptySceneGraphRenderSnapshot,
  type SceneGraphSnapshotBuildInput,
} from "./snapshot";
import { SceneGraphSnapshotPipeline } from "./snapshotPipeline";
import type {
  SceneGraphRenderSnapshot,
  SceneGraphResourceCacheStats,
} from "./types";
import type { SceneGraphRendererRuntimeState } from "./useSceneGraphRendererRuntime";

type SceneGraphRendererLayerProps = {
  runtime: SceneGraphRendererRuntimeState;
  wrapperDimensions: { width: number; height: number };
  wireColor: string;
  darkMode: boolean;
};

type SceneGraphHoverState = {
  sectionId: string | null;
  edgeId: string | null;
};

type SceneGraphPipelineInstrumentation = {
  mode: "worker" | "main-thread";
  snapshotBuildMs: number;
  snapshotDiffMs: number;
  snapshotTotalMs: number;
  updateResourcesMs: number;
  pendingRequestCount: number;
  staleResponseCount: number;
  resourceCacheStats: SceneGraphResourceCacheStats;
};

const EMPTY_HOVER_STATE: SceneGraphHoverState = {
  sectionId: null,
  edgeId: null,
};

const EMPTY_RESOURCE_CACHE_STATS: SceneGraphResourceCacheStats = {
  sectionCacheSize: 0,
  edgeCacheSize: 0,
  sectionCacheCapacity: 0,
  edgeCacheCapacity: 0,
  sectionEvictions: 0,
  edgeEvictions: 0,
  totalEvictions: 0,
  pressure: 0,
};

const EMPTY_PIPELINE_INSTRUMENTATION: SceneGraphPipelineInstrumentation = {
  mode: "main-thread",
  snapshotBuildMs: 0,
  snapshotDiffMs: 0,
  snapshotTotalMs: 0,
  updateResourcesMs: 0,
  pendingRequestCount: 0,
  staleResponseCount: 0,
  resourceCacheStats: EMPTY_RESOURCE_CACHE_STATS,
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
  const hoverStateRef = useRef<SceneGraphHoverState>(EMPTY_HOVER_STATE);
  const snapshotPipelineRef = useRef<SceneGraphSnapshotPipeline | null>(null);
  const latestBuildRequestIdRef = useRef(0);
  const staleBuildResponseCountRef = useRef(0);
  const [hoverState, setHoverState] =
    useState<SceneGraphHoverState>(EMPTY_HOVER_STATE);
  const [snapshot, setSnapshot] = useState<SceneGraphRenderSnapshot>(() =>
    createEmptySceneGraphRenderSnapshot(),
  );
  const [pipelineInstrumentation, setPipelineInstrumentation] =
    useState<SceneGraphPipelineInstrumentation>(EMPTY_PIPELINE_INSTRUMENTATION);
  const nodesById = useNodeInternals((state) => state.x);
  const edgeHandlePositions = useEdgeHandleRegistry((state) => state.positions);
  const { edges, sectionVariantMap, activeIds } = useProjectState(
    (state) => ({
      edges: state.projectConfig.edges,
      sectionVariantMap: state.projectConfig.sectionVariantMap,
      activeIds: state.projectConfig.activeIds,
    }),
    _.isEqual,
  );
  const transform = useReactFlow((state) => state.transform);

  const snapshotBuildInput = useMemo<SceneGraphSnapshotBuildInput>(() => {
    return {
      nodesById,
      edges,
      sectionVariantMap,
      edgeHandlePositions,
      activeSectionIds: activeIds,
      hoveredSectionId: hoverState.sectionId,
      hoveredEdgeId: hoverState.edgeId,
    };
  }, [
    activeIds,
    edgeHandlePositions,
    edges,
    hoverState.edgeId,
    hoverState.sectionId,
    nodesById,
    sectionVariantMap,
  ]);

  useEffect(() => {
    const pipeline = new SceneGraphSnapshotPipeline();
    snapshotPipelineRef.current = pipeline;
    setPipelineInstrumentation((current) => {
      return {
        ...current,
        mode: pipeline.getMode(),
      };
    });
    return () => {
      pipeline.dispose();
      snapshotPipelineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const reactFlowRoot = canvas.closest(".react-flow");
    if (!(reactFlowRoot instanceof HTMLElement)) {
      return;
    }

    const updateHoverState = (nextState: SceneGraphHoverState) => {
      const currentState = hoverStateRef.current;
      if (
        currentState.sectionId === nextState.sectionId &&
        currentState.edgeId === nextState.edgeId
      ) {
        return;
      }
      hoverStateRef.current = nextState;
      setHoverState(nextState);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        updateHoverState(EMPTY_HOVER_STATE);
        return;
      }
      updateHoverState({
        sectionId: readHoveredSectionId(target),
        edgeId: readHoveredEdgeId(target),
      });
    };

    const clearHoverState = () => {
      updateHoverState(EMPTY_HOVER_STATE);
    };

    reactFlowRoot.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    reactFlowRoot.addEventListener("pointerleave", clearHoverState, {
      passive: true,
    });

    return () => {
      reactFlowRoot.removeEventListener("pointermove", handlePointerMove);
      reactFlowRoot.removeEventListener("pointerleave", clearHoverState);
      hoverStateRef.current = EMPTY_HOVER_STATE;
    };
  }, []);

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
    latestBuildRequestIdRef.current = 0;
    staleBuildResponseCountRef.current = 0;
    setSnapshot(createEmptySceneGraphRenderSnapshot());
    setPipelineInstrumentation((current) => {
      return {
        ...EMPTY_PIPELINE_INSTRUMENTATION,
        mode: current.mode,
      };
    });

    return () => {
      backend.dispose();
      backendRef.current = null;
      previousSnapshotRef.current = createEmptySceneGraphRenderSnapshot();
    };
  }, [runtime.capabilities, runtime.selection.resolvedBackend]);

  useEffect(() => {
    const backend = backendRef.current;
    const snapshotPipeline = snapshotPipelineRef.current;
    if (!backend || !snapshotPipeline) {
      return;
    }

    latestBuildRequestIdRef.current += 1;
    const requestId = latestBuildRequestIdRef.current;
    const previousSnapshot = previousSnapshotRef.current;
    let cancelled = false;

    const buildSnapshot = async () => {
      const buildResult = await snapshotPipeline.build({
        previousSnapshot,
        input: snapshotBuildInput,
      });
      if (cancelled) {
        return;
      }

      if (requestId !== latestBuildRequestIdRef.current) {
        staleBuildResponseCountRef.current += 1;
        setPipelineInstrumentation((current) => {
          return {
            ...current,
            pendingRequestCount: snapshotPipeline.getPendingRequestCount(),
            staleResponseCount: staleBuildResponseCountRef.current,
          };
        });
        return;
      }

      const updateResourcesStart = getNowMs();
      backend.updateResources(buildResult.diff);
      const updateResourcesMs = toMs(getNowMs() - updateResourcesStart);
      const resourceCacheStats = backend.getResourceCacheStats();

      previousSnapshotRef.current = buildResult.snapshot;
      setSnapshot(buildResult.snapshot);
      setPipelineInstrumentation({
        mode: buildResult.metrics.mode,
        snapshotBuildMs: buildResult.metrics.buildMs,
        snapshotDiffMs: buildResult.metrics.diffMs,
        snapshotTotalMs: buildResult.metrics.totalMs,
        updateResourcesMs,
        pendingRequestCount: snapshotPipeline.getPendingRequestCount(),
        staleResponseCount: staleBuildResponseCountRef.current,
        resourceCacheStats,
      });
    };

    void buildSnapshot().catch(() => {
      // A backend swap/dispose can race in-flight worker responses; stale requests are ignored.
    });

    return () => {
      cancelled = true;
    };
  }, [runtime.selection.resolvedBackend, snapshotBuildInput]);

  useEffect(() => {
    const backend = backendRef.current;
    if (!backend) {
      return;
    }

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
  const activeSectionCount = useMemo(() => {
    return snapshot.sections.reduce((count, section) => {
      return section.isActive ? count + 1 : count;
    }, 0);
  }, [snapshot.sections]);
  const selectedEdgeCount = useMemo(() => {
    return snapshot.edges.reduce((count, edge) => {
      return edge.isSelected ? count + 1 : count;
    }, 0);
  }, [snapshot.edges]);
  const hoveredSectionId =
    snapshot.sections.find((section) => section.isHovered)?.id ?? "";
  const hoveredEdgeId = snapshot.edges.find((edge) => edge.isHovered)?.id ?? "";

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
      data-scene-graph-layer-active-sections={String(activeSectionCount)}
      data-scene-graph-layer-selected-edges={String(selectedEdgeCount)}
      data-scene-graph-layer-hovered-section={hoveredSectionId}
      data-scene-graph-layer-hovered-edge={hoveredEdgeId}
      data-scene-graph-layer-camera-x={String(transform[0])}
      data-scene-graph-layer-camera-y={String(transform[1])}
      data-scene-graph-layer-camera-zoom={String(transform[2])}
      data-scene-graph-layer-snapshot-pipeline-mode={
        pipelineInstrumentation.mode
      }
      data-scene-graph-layer-snapshot-build-ms={String(
        pipelineInstrumentation.snapshotBuildMs,
      )}
      data-scene-graph-layer-snapshot-diff-ms={String(
        pipelineInstrumentation.snapshotDiffMs,
      )}
      data-scene-graph-layer-snapshot-total-ms={String(
        pipelineInstrumentation.snapshotTotalMs,
      )}
      data-scene-graph-layer-update-resources-ms={String(
        pipelineInstrumentation.updateResourcesMs,
      )}
      data-scene-graph-layer-pending-build-requests={String(
        pipelineInstrumentation.pendingRequestCount,
      )}
      data-scene-graph-layer-stale-build-responses={String(
        pipelineInstrumentation.staleResponseCount,
      )}
      data-scene-graph-layer-section-cache-size={String(
        pipelineInstrumentation.resourceCacheStats.sectionCacheSize,
      )}
      data-scene-graph-layer-section-cache-capacity={String(
        pipelineInstrumentation.resourceCacheStats.sectionCacheCapacity,
      )}
      data-scene-graph-layer-edge-cache-size={String(
        pipelineInstrumentation.resourceCacheStats.edgeCacheSize,
      )}
      data-scene-graph-layer-edge-cache-capacity={String(
        pipelineInstrumentation.resourceCacheStats.edgeCacheCapacity,
      )}
      data-scene-graph-layer-section-cache-evictions={String(
        pipelineInstrumentation.resourceCacheStats.sectionEvictions,
      )}
      data-scene-graph-layer-edge-cache-evictions={String(
        pipelineInstrumentation.resourceCacheStats.edgeEvictions,
      )}
      data-scene-graph-layer-total-cache-evictions={String(
        pipelineInstrumentation.resourceCacheStats.totalEvictions,
      )}
      data-scene-graph-layer-buffer-pressure={String(
        pipelineInstrumentation.resourceCacheStats.pressure,
      )}
    />
  );
}

function readHoveredSectionId(target: Element): string | null {
  const nodeElement = target.closest(".react-flow__node");
  if (!(nodeElement instanceof HTMLElement)) {
    return null;
  }
  const sectionId = nodeElement.getAttribute("data-id");
  return sectionId && sectionId.length > 0 ? sectionId : null;
}

function readHoveredEdgeId(target: Element): string | null {
  const edgeElement = target.closest(".react-flow__edge");
  if (!(edgeElement instanceof SVGGElement)) {
    return null;
  }
  const edgePath = edgeElement.querySelector(".react-flow__edge-path");
  if (!(edgePath instanceof SVGPathElement)) {
    return null;
  }
  return edgePath.id && edgePath.id.length > 0 ? edgePath.id : null;
}

function getNowMs(): number {
  if (typeof performance === "undefined") {
    return Date.now();
  }
  return performance.now();
}

function toMs(value: number): number {
  return Number(value.toFixed(3));
}
