import { describe, expect, test, vi } from "vitest";

import { createWorkflowGraphAnimationCoordinator } from "./pixi-renderer-animation-coordinator";

describe("workflow graph animation coordinator", () => {
  test("does not query visibility while camera is moving", () => {
    const edgeFlowGraphics = graphicsStub();
    const animationState = animationStateStub();
    const nodesInPaddedViewport = vi.fn(() => [workflowNode("node_a")]);
    const coordinator = createWorkflowGraphAnimationCoordinator({
      animatedGlow: graphicsStub(),
      animationState,
      cellAnimation: { sync: vi.fn() },
      debugMetrics: debugMetricsStub(),
      edgeFlowGraphics,
      edges: [],
      getNode: () => null,
      spatialQueries: { nodesInPaddedViewport },
      staticGlow: graphicsStub(),
    });

    coordinator.syncActiveSet({ cameraMotion: "moving" });

    expect(nodesInPaddedViewport).not.toHaveBeenCalled();
    expect(animationState.recompute).not.toHaveBeenCalled();
    expect(edgeFlowGraphics.clear).toHaveBeenCalledTimes(1);
    expect(coordinator.debugSnapshot()).toMatchObject({
      animationActiveSetDeferredCount: 1,
    });
  });

  test("redraws static glow only when graph content is dirty or visible membership changes", () => {
    const node = workflowNode("node_a");
    const queryResults = [[node], [], [node], [], []];
    const debugMetrics = debugMetricsStub();
    const coordinator = createWorkflowGraphAnimationCoordinator({
      animatedGlow: graphicsStub(),
      animationState: animationStateStub(),
      cellAnimation: { sync: vi.fn() },
      debugMetrics,
      edgeFlowGraphics: graphicsStub(),
      edges: [],
      getNode: (nodeId) => {
        if (nodeId !== node.id) {
          throw new Error(`unknown test node: ${nodeId}`);
        }
        return node;
      },
      spatialQueries: {
        nodesInPaddedViewport: () => queryResults.shift() ?? [],
      },
      staticGlow: graphicsStub(),
    });

    coordinator.syncActiveSet({ cameraMotion: "settled" });
    coordinator.syncActiveSet({ cameraMotion: "settled" });
    coordinator.syncActiveSet({ cameraMotion: "settled" });

    expect(debugMetrics.bucketCount("static-glow-redraw")).toBe(2);
    expect(coordinator.debugSnapshot()).toMatchObject({
      lastStaticGlowVisibleNodeCount: 0,
      staticGlowDirty: false,
      staticGlowVisibilityChangeCount: 2,
    });
  });
});

function workflowNode(id) {
  return {
    color: 0x38bdf8,
    height: 80,
    id,
    layer: "workflow",
    status: "not_started",
    width: 120,
    x: 10,
    y: 20,
  };
}

function animationStateStub() {
  return {
    activeSemanticNodeIds: () => new Set(),
    cellNodes: () => [],
    edgeFlows: () => [],
    glowNodes: () => [],
    recompute: vi.fn(),
  };
}

function debugMetricsStub() {
  const bucketCounts = new Map();
  return {
    bucketCount: (bucket) => bucketCounts.get(bucket) ?? 0,
    measure: (bucket, callback) => {
      bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
      return callback();
    },
  };
}

function graphicsStub() {
  const target = {
    circle: vi.fn(() => target),
    clear: vi.fn(() => target),
    fill: vi.fn(() => target),
    roundRect: vi.fn(() => target),
    stroke: vi.fn(() => target),
  };
  return target;
}
