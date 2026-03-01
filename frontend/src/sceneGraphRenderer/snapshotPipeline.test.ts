import type { Node } from "forks/xyflow/core/types";
import { describe, expect, it } from "vitest";
import { createEmptySceneGraphRenderSnapshot } from "./snapshot";
import {
  SceneGraphSnapshotPipeline,
  runSceneGraphSnapshotBuildTask,
  serializeSceneGraphSnapshotBuildInput,
  type SceneGraphSnapshotPipelineBuildRequest,
  type SceneGraphSnapshotWorkerRequest,
  type SceneGraphSnapshotWorkerResponse,
} from "./snapshotPipeline";

function createNode(
  overrides: Partial<Node> & Pick<Node, "id" | "position">,
): Node {
  const hasWidth = Object.prototype.hasOwnProperty.call(overrides, "width");
  const hasHeight = Object.prototype.hasOwnProperty.call(overrides, "height");
  return {
    id: overrides.id,
    position: overrides.position,
    width: hasWidth ? overrides.width : 100,
    height: hasHeight ? overrides.height : 80,
    zIndex: overrides.zIndex ?? 0,
    tempZIndex: overrides.tempZIndex ?? overrides.zIndex ?? 0,
    type: overrides.type,
    style: overrides.style,
  };
}

function createBuildRequest(): SceneGraphSnapshotPipelineBuildRequest {
  return {
    previousSnapshot: createEmptySceneGraphRenderSnapshot(),
    input: {
      nodesById: new Map([
        [
          "section-b",
          createNode({
            id: "section-b",
            position: { x: 220, y: 120 },
            width: 180,
            height: 120,
            zIndex: 2,
            tempZIndex: 2,
          }),
        ],
        [
          "section-a",
          createNode({
            id: "section-a",
            position: { x: 20, y: 40 },
            width: 140,
            height: 90,
            zIndex: 1,
            tempZIndex: 1,
          }),
        ],
      ]),
      edges: [
        {
          id: "edge-a",
          sourceSectionId: "section-a",
          targetSectionId: "section-b",
          sourcePortId: "out",
          targetPortId: "in",
          sourceVariantId: "va",
          targetVariantId: "vb",
          hidden: false,
          zIndex: 1,
          selected: true,
        },
      ],
      sectionVariantMap: {
        "section-a": "va",
        "section-b": "vb",
      },
      edgeHandlePositions: {
        "section-a:out:source": { x: 140, y: 80 },
        "section-b:in:target": { x: 220, y: 160 },
      },
      activeSectionIds: ["section-b", "section-a"],
      hoveredSectionId: "section-b",
      hoveredEdgeId: "edge-a",
    },
  };
}

describe("runSceneGraphSnapshotBuildTask", () => {
  it("builds snapshot+diff deterministically from serialized source-of-truth input", () => {
    // Ensures worker and fallback paths compute identical snapshot/diff output.
    const request = createBuildRequest();
    let nowTick = 0;
    const result = runSceneGraphSnapshotBuildTask(
      {
        type: "build_snapshot",
        requestId: 1,
        previousSnapshot: request.previousSnapshot,
        input: serializeSceneGraphSnapshotBuildInput(request.input),
      },
      () => {
        nowTick += 1;
        return nowTick * 1.5;
      },
    );

    expect(result.snapshot.sections).toEqual([
      {
        id: "section-a",
        x: 20,
        y: 40,
        width: 140,
        height: 90,
        zIndex: 1,
        isActive: true,
        isHovered: false,
      },
      {
        id: "section-b",
        x: 220,
        y: 120,
        width: 180,
        height: 120,
        zIndex: 2,
        isActive: true,
        isHovered: true,
      },
    ]);
    expect(result.snapshot.edges).toEqual([
      {
        id: "edge-a",
        sourceX: 140,
        sourceY: 80,
        targetX: 220,
        targetY: 160,
        zIndex: 1,
        isSelected: true,
        isHovered: true,
      },
    ]);
    expect(result.diff.addedSectionIds).toEqual(["section-a", "section-b"]);
    expect(result.diff.addedEdgeIds).toEqual(["edge-a"]);
    expect(result.buildMs).toBe(1.5);
    expect(result.diffMs).toBe(1.5);
    expect(result.totalMs).toBe(3);
  });
});

describe("SceneGraphSnapshotPipeline", () => {
  it("uses deterministic main-thread fallback mode", async () => {
    // The fallback path must remain robust when Worker is unavailable.
    const pipeline = new SceneGraphSnapshotPipeline({ mode: "main-thread" });
    const result = await pipeline.build(createBuildRequest());

    expect(result.metrics.mode).toBe("main-thread");
    expect(result.metrics.pendingRequestCount).toBe(0);
    expect(result.snapshot.sections.length).toBe(2);
    expect(result.diff.addedSectionIds).toEqual(["section-a", "section-b"]);

    pipeline.dispose();
  });

  it("routes snapshot/diff work through a worker when available", async () => {
    // Verifies worker pipeline messaging resolves with deterministic output.
    const worker = new MockSnapshotWorker();
    const pipeline = new SceneGraphSnapshotPipeline({
      mode: "worker",
      workerFactory: () => worker.asWorker(),
    });
    const result = await pipeline.build(createBuildRequest());

    expect(result.metrics.mode).toBe("worker");
    expect(result.metrics.pendingRequestCount).toBe(0);
    expect(result.snapshot.sections.length).toBe(2);
    expect(result.diff.addedSectionIds).toEqual(["section-a", "section-b"]);

    pipeline.dispose();
    expect(worker.terminated).toBe(true);
  });
});

class MockSnapshotWorker {
  private messageListener: ((event: MessageEvent<unknown>) => void) | null =
    null;
  private errorListener: ((event: Event) => void) | null = null;
  terminated = false;

  asWorker(): Worker {
    return this as unknown as Worker;
  }

  postMessage(message: SceneGraphSnapshotWorkerRequest) {
    if (message.type !== "build_snapshot") {
      return;
    }
    const result = runSceneGraphSnapshotBuildTask(message, () => 0);
    const response: SceneGraphSnapshotWorkerResponse = {
      type: "build_snapshot_result",
      requestId: message.requestId,
      snapshot: result.snapshot,
      diff: result.diff,
      buildMs: result.buildMs,
      diffMs: result.diffMs,
      totalMs: result.totalMs,
    };
    this.messageListener?.({
      data: response,
    } as MessageEvent<SceneGraphSnapshotWorkerResponse>);
  }

  terminate() {
    this.terminated = true;
  }

  addEventListener(
    type: "message" | "error",
    listener: (event: MessageEvent<unknown> | Event) => void,
  ) {
    if (type === "message") {
      this.messageListener = listener as (event: MessageEvent<unknown>) => void;
      return;
    }
    this.errorListener = listener as (event: Event) => void;
  }

  removeEventListener(
    type: "message" | "error",
    listener: (event: MessageEvent<unknown> | Event) => void,
  ) {
    if (type === "message" && this.messageListener === listener) {
      this.messageListener = null;
      return;
    }
    if (type === "error" && this.errorListener === listener) {
      this.errorListener = null;
    }
  }
}
