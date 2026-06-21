import { describe, expect, test, vi } from "vitest";

import { createWorkflowGraphCameraSync } from "./pixi-renderer-camera-sync";

describe("workflow graph camera sync", () => {
  test("defers label sync during moving camera frames on small graphs", () => {
    const animationCoordinator = { syncActiveSet: vi.fn() };
    const labels = labelManagerStub({ nodeCount: 3 });
    const labelLayer = { visible: true };
    const syncFilterAreas = vi.fn();
    const cameraSync = createWorkflowGraphCameraSync({
      animationCoordinator,
      debugMetrics: debugMetricsStub(),
      handlers: { onCameraStateChange: vi.fn() },
      inputResponsiveness: { recordSettleRestore: vi.fn() },
      labelLayer,
      labels,
      syncFilterAreas,
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
    expect(animationCoordinator.syncActiveSet).not.toHaveBeenCalled();
    expect(syncFilterAreas).not.toHaveBeenCalled();
    expect(cameraSync.debugSnapshot()).toMatchObject({
      cameraMovingLabelHiddenFrameCount: 1,
      cameraMovingLabelSyncedFrameCount: 0,
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

  test("restores label, filter, and animation fidelity once camera movement settles", () => {
    const labels = labelManagerStub({ nodeCount: 3 });
    const labelLayer = { visible: true };
    const animationCoordinator = { syncActiveSet: vi.fn() };
    const syncFilterAreas = vi.fn();
    const onCameraStateChange = vi.fn();
    const cameraSync = createWorkflowGraphCameraSync({
      animationCoordinator,
      debugMetrics: debugMetricsStub(),
      handlers: { onCameraStateChange },
      inputResponsiveness: { recordSettleRestore: vi.fn() },
      labelLayer,
      labels,
      syncFilterAreas,
      viewport: viewportStub(),
    });

    cameraSync.recordCameraState(
      { x: 0, y: 0, zoom: 1.2 },
      { interactionKind: "wheel-zoom", moving: true, now: 0 },
    );
    cameraSync.scheduleCameraDependentSync();
    cameraSync.runCameraDependentSyncFrame(1);
    cameraSync.runCameraDependentSyncFrame(49);

    expect(labelLayer.visible).toBe(true);
    expect(labels.syncVisibleLabels).toHaveBeenCalledTimes(1);
    expect(animationCoordinator.syncActiveSet).toHaveBeenLastCalledWith({
      cameraMotion: "settled",
    });
    expect(syncFilterAreas).toHaveBeenLastCalledWith({ force: true });
    expect(cameraSync.debugSnapshot()).toMatchObject({
      cameraMoving: false,
      cameraSettleRestoreFrameCount: 1,
      pendingSettledFidelityIncludesZoom: false,
    });
    expect(onCameraStateChange).toHaveBeenNthCalledWith(
      1,
      { x: 0, y: 0, zoom: 1.2 },
      { cameraMotion: "moving", interactionKind: "wheel-zoom" },
    );
    expect(onCameraStateChange).toHaveBeenLastCalledWith(
      { x: 0, y: 0, zoom: 1.2 },
      { cameraMotion: "settled", interactionKind: "wheel-zoom" },
    );
  });

  test("does not restore settled fidelity until an active pointer camera pan ends", () => {
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

    cameraSync.beginCameraInteraction({ interactionKind: "pointer-pan", now: 0 });
    cameraSync.recordCameraState(
      { x: 20, y: 0, zoom: 1 },
      { interactionKind: "pointer-pan", moving: true, now: 10 },
    );
    cameraSync.scheduleCameraDependentSync();
    cameraSync.runCameraDependentSyncFrame(11);
    cameraSync.runCameraDependentSyncFrame(200);

    expect(labels.syncVisibleLabels).not.toHaveBeenCalled();
    expect(cameraSync.debugSnapshot()).toMatchObject({
      activeCameraInteractionCount: 1,
      cameraSettleRestoreFrameCount: 0,
    });

    cameraSync.endCameraInteraction({ interactionKind: "pointer-pan", now: 210 });
    cameraSync.runCameraDependentSyncFrame(275);

    expect(labels.syncVisibleLabels).toHaveBeenCalledTimes(1);
    expect(cameraSync.debugSnapshot()).toMatchObject({
      activeCameraInteractionCount: 0,
      cameraSettleRestoreFrameCount: 1,
    });
  });

  // Phase 0 camera fast-path contract (evidence reset).
  //
  // The two tests above document the current behavior: the renderer hides node
  // labels (`labelLayer.visible = false`) while the camera is moving. Per the
  // Non-Negotiable UX Contract, node labels must NOT disappear because the
  // camera is moving. This guard encodes that contract directly.
  //
  // It is marked `.fails` so it is recorded as an expected-red test now: the
  // body currently throws (labels are hidden), which `test.fails` reports as a
  // known, expected failure. The moment Phase 1 keeps labels visible during
  // motion, this body will stop throwing and `test.fails` will turn RED,
  // forcing it to be promoted to a normal `test(...)` and the label-hiding
  // tests above to be removed.
  test.fails(
    "camera fast-path contract: node labels stay visible while the camera is moving (Phase 1)",
    () => {
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
    },
  );
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
