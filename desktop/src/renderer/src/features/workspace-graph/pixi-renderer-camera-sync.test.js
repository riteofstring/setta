import { describe, expect, test, vi } from "vitest";

import { createWorkflowGraphCameraSync } from "./pixi-renderer-camera-sync";

describe("workflow graph camera sync", () => {
  test("syncs visible labels during moving camera frames on small graphs", () => {
    const labels = labelManagerStub({ nodeCount: 3 });
    const labelLayer = { visible: true };
    const cameraSync = createWorkflowGraphCameraSync({
      animationCoordinator: { syncActiveSet: vi.fn() },
      debugMetrics: debugMetricsStub(),
      handlers: { onCameraStateChange: vi.fn() },
      inputResponsiveness: { recordSettleRestore: vi.fn() },
      labelLayer,
      labels,
      syncFilterAreas: vi.fn(),
      viewport: viewportStub(),
    });

    cameraSync.recordCameraState(
      { x: 10, y: 0, zoom: 1 },
      { interactionKind: "wheel-pan", moving: true },
    );
    cameraSync.scheduleCameraDependentSync();
    cameraSync.runCameraDependentSyncFrame(10);

    expect(labelLayer.visible).toBe(true);
    expect(labels.syncVisibleLabels).toHaveBeenCalledTimes(1);
    expect(cameraSync.debugSnapshot()).toMatchObject({
      cameraMovingLabelHiddenFrameCount: 0,
      cameraMovingLabelSyncedFrameCount: 1,
    });
  });

  test("hides labels during moving camera frames above the small-graph sync limit", () => {
    const labels = labelManagerStub({ nodeCount: 500 });
    const labelLayer = { visible: true };
    const cameraSync = createWorkflowGraphCameraSync({
      animationCoordinator: { syncActiveSet: vi.fn() },
      debugMetrics: debugMetricsStub(),
      handlers: { onCameraStateChange: vi.fn() },
      inputResponsiveness: { recordSettleRestore: vi.fn() },
      labelLayer,
      labels,
      syncFilterAreas: vi.fn(),
      viewport: viewportStub(),
    });

    cameraSync.recordCameraState(
      { x: 10, y: 0, zoom: 1 },
      { interactionKind: "wheel-pan", moving: true },
    );
    cameraSync.scheduleCameraDependentSync();
    cameraSync.runCameraDependentSyncFrame(10);

    expect(labelLayer.visible).toBe(false);
    expect(labels.syncVisibleLabels).not.toHaveBeenCalled();
    expect(cameraSync.debugSnapshot()).toMatchObject({
      cameraMovingLabelHiddenFrameCount: 1,
      cameraMovingLabelSyncedFrameCount: 0,
    });
  });
});

function debugMetricsStub() {
  return {
    measure: (_bucket, callback) => callback(),
  };
}

function labelManagerStub({ nodeCount }) {
  return {
    syncVisibleLabels: vi.fn(),
    visibleLabelSyncNodeCount: () => nodeCount,
  };
}

function viewportStub() {
  return {
    corner: { x: 0, y: 0 },
    scaled: 1,
  };
}
