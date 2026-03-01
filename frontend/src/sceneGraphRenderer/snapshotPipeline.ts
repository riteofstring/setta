import type { Node } from "forks/xyflow/core/types";
import {
  buildSceneGraphRenderSnapshot,
  buildSceneGraphRenderSnapshotDiff,
  type SceneGraphSnapshotBuildInput,
} from "./snapshot";
import type {
  SceneGraphRenderSnapshot,
  SceneGraphRenderSnapshotDiff,
} from "./types";

type SceneGraphSerializedNode = {
  id: string;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  zIndex: number;
  tempZIndex: number;
};

type SceneGraphSerializedEdge = {
  id: string;
  sourceSectionId: string;
  targetSectionId: string;
  sourcePortId: string;
  targetPortId: string;
  sourceVariantId: string;
  targetVariantId: string;
  hidden: boolean;
  zIndex: number;
  selected: boolean;
};

export type SceneGraphSerializedSnapshotBuildInput = {
  nodes: SceneGraphSerializedNode[];
  edges: SceneGraphSerializedEdge[];
  sectionVariantMap: Record<string, string>;
  edgeHandlePositions: Record<string, { x: number; y: number }>;
  activeSectionIds: string[];
  hoveredSectionId: string | null;
  hoveredEdgeId: string | null;
};

export type SceneGraphSnapshotWorkerRequest = {
  type: "build_snapshot";
  requestId: number;
  previousSnapshot: SceneGraphRenderSnapshot;
  input: SceneGraphSerializedSnapshotBuildInput;
};

export type SceneGraphSnapshotWorkerResponse =
  | {
      type: "build_snapshot_result";
      requestId: number;
      snapshot: SceneGraphRenderSnapshot;
      diff: SceneGraphRenderSnapshotDiff;
      buildMs: number;
      diffMs: number;
      totalMs: number;
    }
  | {
      type: "build_snapshot_error";
      requestId: number;
      error: string;
    };

type SceneGraphSnapshotTaskComputationResult = {
  snapshot: SceneGraphRenderSnapshot;
  diff: SceneGraphRenderSnapshotDiff;
  buildMs: number;
  diffMs: number;
  totalMs: number;
};

type SceneGraphSnapshotPipelineModeSetting = "auto" | "worker" | "main-thread";
export type SceneGraphSnapshotPipelineResolvedMode = "worker" | "main-thread";

type SceneGraphSnapshotPipelinePendingRequest = {
  resolve: (result: SceneGraphSnapshotPipelineBuildResult) => void;
  reject: (error: Error) => void;
};

export type SceneGraphSnapshotPipelineBuildResult = {
  snapshot: SceneGraphRenderSnapshot;
  diff: SceneGraphRenderSnapshotDiff;
  metrics: {
    mode: SceneGraphSnapshotPipelineResolvedMode;
    buildMs: number;
    diffMs: number;
    totalMs: number;
    pendingRequestCount: number;
  };
};

export type SceneGraphSnapshotPipelineBuildRequest = {
  previousSnapshot: SceneGraphRenderSnapshot;
  input: SceneGraphSnapshotBuildInput;
};

type SceneGraphSnapshotPipelineOptions = {
  mode?: SceneGraphSnapshotPipelineModeSetting;
  workerFactory?: () => Worker;
};

const DEFAULT_PIPELINE_MODE_SETTING: SceneGraphSnapshotPipelineModeSetting =
  "auto";

export class SceneGraphSnapshotPipeline {
  private readonly mode: SceneGraphSnapshotPipelineResolvedMode;
  private worker: Worker | null = null;
  private disposed = false;
  private requestIdCounter = 0;
  private readonly pendingRequests = new Map<
    number,
    SceneGraphSnapshotPipelinePendingRequest
  >();

  constructor(options: SceneGraphSnapshotPipelineOptions = {}) {
    const modeSetting = options.mode ?? DEFAULT_PIPELINE_MODE_SETTING;
    const workerSupported =
      options.workerFactory !== undefined ||
      isSceneGraphSnapshotWorkerSupported();
    const shouldUseWorker = modeSetting !== "main-thread" && workerSupported;
    if (modeSetting === "worker" && !workerSupported) {
      throw new Error("Scene graph snapshot worker is unavailable.");
    }
    if (shouldUseWorker) {
      this.mode = "worker";
      this.worker = options.workerFactory
        ? options.workerFactory()
        : createDefaultSceneGraphSnapshotWorker();
      this.worker.addEventListener("message", this.handleWorkerMessage);
      this.worker.addEventListener("error", this.handleWorkerError);
      return;
    }

    this.mode = "main-thread";
  }

  build(
    request: SceneGraphSnapshotPipelineBuildRequest,
  ): Promise<SceneGraphSnapshotPipelineBuildResult> {
    if (this.disposed) {
      return Promise.reject(
        new Error("Scene graph snapshot pipeline has already been disposed."),
      );
    }
    if (!this.worker) {
      const result = runSceneGraphSnapshotBuildTask({
        requestId: 0,
        previousSnapshot: request.previousSnapshot,
        input: serializeSceneGraphSnapshotBuildInput(request.input),
      });
      return Promise.resolve({
        snapshot: result.snapshot,
        diff: result.diff,
        metrics: {
          mode: "main-thread",
          buildMs: result.buildMs,
          diffMs: result.diffMs,
          totalMs: result.totalMs,
          pendingRequestCount: 0,
        },
      });
    }

    this.requestIdCounter += 1;
    const requestId = this.requestIdCounter;
    const workerRequest: SceneGraphSnapshotWorkerRequest = {
      type: "build_snapshot",
      requestId,
      previousSnapshot: request.previousSnapshot,
      input: serializeSceneGraphSnapshotBuildInput(request.input),
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
      try {
        this.worker?.postMessage(workerRequest);
      } catch (error) {
        this.pendingRequests.delete(requestId);
        reject(errorToError(error));
      }
    });
  }

  getMode(): SceneGraphSnapshotPipelineResolvedMode {
    return this.mode;
  }

  getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    if (this.worker) {
      this.worker.removeEventListener("message", this.handleWorkerMessage);
      this.worker.removeEventListener("error", this.handleWorkerError);
      this.worker.terminate();
      this.worker = null;
    }

    for (const { reject } of this.pendingRequests.values()) {
      reject(new Error("Scene graph snapshot pipeline has been disposed."));
    }
    this.pendingRequests.clear();
  }

  private readonly handleWorkerMessage = (
    event: MessageEvent<SceneGraphSnapshotWorkerResponse>,
  ) => {
    if (this.disposed) {
      return;
    }

    const message = event.data;
    const pendingRequest = this.pendingRequests.get(message.requestId);
    if (!pendingRequest) {
      return;
    }
    this.pendingRequests.delete(message.requestId);

    if (message.type === "build_snapshot_error") {
      pendingRequest.reject(new Error(message.error));
      return;
    }

    pendingRequest.resolve({
      snapshot: message.snapshot,
      diff: message.diff,
      metrics: {
        mode: "worker",
        buildMs: message.buildMs,
        diffMs: message.diffMs,
        totalMs: message.totalMs,
        pendingRequestCount: this.pendingRequests.size,
      },
    });
  };

  private readonly handleWorkerError = (event: Event) => {
    const errorMessage =
      event instanceof ErrorEvent && typeof event.message === "string"
        ? event.message
        : "Unknown scene graph snapshot worker error.";
    const workerError = new Error(errorMessage);

    for (const { reject } of this.pendingRequests.values()) {
      reject(workerError);
    }
    this.pendingRequests.clear();
  };
}

export function serializeSceneGraphSnapshotBuildInput(
  input: SceneGraphSnapshotBuildInput,
): SceneGraphSerializedSnapshotBuildInput {
  const nodes = Array.from(input.nodesById.values())
    .map((node) => {
      return {
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width: node.width,
        height: node.height,
        zIndex: node.zIndex,
        tempZIndex: node.tempZIndex,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const edges = input.edges
    .map((edge) => {
      return {
        id: edge.id,
        sourceSectionId: edge.sourceSectionId,
        targetSectionId: edge.targetSectionId,
        sourcePortId: edge.sourcePortId,
        targetPortId: edge.targetPortId,
        sourceVariantId: edge.sourceVariantId,
        targetVariantId: edge.targetVariantId,
        hidden: edge.hidden === true,
        zIndex: edge.zIndex ?? 0,
        selected: edge.selected === true,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    nodes,
    edges,
    sectionVariantMap: { ...input.sectionVariantMap },
    edgeHandlePositions: cloneEdgeHandlePositions(input.edgeHandlePositions),
    activeSectionIds: [...input.activeSectionIds].sort((a, b) =>
      a.localeCompare(b),
    ),
    hoveredSectionId: input.hoveredSectionId,
    hoveredEdgeId: input.hoveredEdgeId,
  };
}

export function runSceneGraphSnapshotBuildTask(
  request: SceneGraphSnapshotWorkerRequest,
  clockNow: () => number = getNowMs,
): SceneGraphSnapshotTaskComputationResult {
  const buildStart = clockNow();
  const hydratedInput = deserializeSceneGraphSnapshotBuildInput(request.input);
  const snapshot = buildSceneGraphRenderSnapshot(hydratedInput);
  const afterBuild = clockNow();
  const diff = buildSceneGraphRenderSnapshotDiff(
    request.previousSnapshot,
    snapshot,
  );
  const afterDiff = clockNow();

  return {
    snapshot,
    diff,
    buildMs: toMs(afterBuild - buildStart),
    diffMs: toMs(afterDiff - afterBuild),
    totalMs: toMs(afterDiff - buildStart),
  };
}

function isSceneGraphSnapshotWorkerSupported(): boolean {
  return typeof Worker !== "undefined";
}

function createDefaultSceneGraphSnapshotWorker(): Worker {
  return new Worker(new URL("./snapshotWorker.ts", import.meta.url), {
    type: "module",
  });
}

function deserializeSceneGraphSnapshotBuildInput(
  input: SceneGraphSerializedSnapshotBuildInput,
): SceneGraphSnapshotBuildInput {
  const nodesById = new Map<string, Node>();
  for (const serializedNode of input.nodes) {
    nodesById.set(serializedNode.id, {
      id: serializedNode.id,
      position: {
        x: serializedNode.x,
        y: serializedNode.y,
      },
      width: serializedNode.width,
      height: serializedNode.height,
      zIndex: serializedNode.zIndex,
      tempZIndex: serializedNode.tempZIndex,
    });
  }

  return {
    nodesById,
    edges: input.edges.map((edge) => {
      return {
        id: edge.id,
        sourceSectionId: edge.sourceSectionId,
        targetSectionId: edge.targetSectionId,
        sourcePortId: edge.sourcePortId,
        targetPortId: edge.targetPortId,
        sourceVariantId: edge.sourceVariantId,
        targetVariantId: edge.targetVariantId,
        hidden: edge.hidden,
        zIndex: edge.zIndex,
        selected: edge.selected,
      };
    }),
    sectionVariantMap: { ...input.sectionVariantMap },
    edgeHandlePositions: cloneEdgeHandlePositions(input.edgeHandlePositions),
    activeSectionIds: [...input.activeSectionIds],
    hoveredSectionId: input.hoveredSectionId,
    hoveredEdgeId: input.hoveredEdgeId,
  };
}

function cloneEdgeHandlePositions(
  edgeHandlePositions: Record<string, { x: number; y: number }>,
) {
  const output: Record<string, { x: number; y: number }> = {};
  for (const [key, position] of Object.entries(edgeHandlePositions)) {
    output[key] = {
      x: position.x,
      y: position.y,
    };
  }
  return output;
}

function toMs(value: number): number {
  return Number(value.toFixed(3));
}

function getNowMs(): number {
  if (typeof performance === "undefined") {
    return Date.now();
  }
  return performance.now();
}

function errorToError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}
