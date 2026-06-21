import { describe, expect, test, vi } from "vitest";

import { createWorkflowGraphCameraSync } from "./pixi-renderer-camera-sync";

describe("workflow graph camera sync", () => {
  // Camera fast-path contract (Phase 1): pan/zoom is a transform-only path. While
  // the camera is moving, retained labels and base edges stay visible and ride
  // the camera as a bounded transform-tier reposition. The expensive visibility /
  // declutter / animation / filter work is deferred to settle.
  test("keeps labels and base edges visible and repositions labels during camera motion", () => {
    const { animationCoordinator, cameraSync, edgeLayer, labelLayer, labels, syncFilterAreas } =
      createCameraSyncHarness({ labels: labelManagerStub({ visibleLabelCount: 3 }) });

    cameraSync.recordCameraState(
      { x: 10, y: 0, zoom: 1 },
      { interactionKind: "wheel-pan", moving: true },
    );
    cameraSync.scheduleCameraDependentSync();
    cameraSync.runCameraDependentSyncFrame(10);

    expect(labelLayer.visible).toBe(true);
    expect(edgeLayer.visible).toBe(true);
    expect(labels.syncVisibleLabelTransforms).toHaveBeenCalledTimes(1);
    // No settle-time work runs on a moving frame.
    expect(labels.syncVisibleLabels).not.toHaveBeenCalled();
    expect(animationCoordinator.syncActiveSet).not.toHaveBeenCalled();
    expect(syncFilterAreas).not.toHaveBeenCalled();
    expect(cameraSync.debugSnapshot()).toMatchObject({
      cameraFastPathViolationCount: 0,
      cameraMovingLabelHiddenFrameCount: 0,
      cameraMovingLabelSyncedFrameCount: 0,
      cameraMovingLabelTransformCount: 3,
      cameraMovingLabelTransformFrameCount: 1,
      cameraMovingSyncFrameCount: 1,
    });
  });

  test("records a per-frame camera work audit for moving frames", () => {
    const { cameraSync } = createCameraSyncHarness({
      labels: labelManagerStub({ visibleLabelCount: 2 }),
    });

    cameraSync.recordCameraState(
      { x: 0, y: 0, zoom: 1.4 },
      { interactionKind: "wheel-zoom", moving: true },
    );
    cameraSync.scheduleCameraDependentSync();
    cameraSync.runCameraDependentSyncFrame(5);

    const { cameraWorkAuditSamples } = cameraSync.debugSnapshot();
    expect(cameraWorkAuditSamples).toEqual([
      {
        cameraMotion: "moving",
        edgesHidden: false,
        labelsHidden: false,
        labelTransformCount: 2,
        sceneRebuilt: false,
        zoomChanged: true,
      },
    ]);
  });

  test("fast-path invariant restores and records labels/base edges hidden during motion", () => {
    const { cameraSync, edgeLayer, labelLayer } = createCameraSyncHarness();
    // Simulate a regression that hides labels and base edges while the camera moves.
    labelLayer.visible = false;
    edgeLayer.visible = false;

    cameraSync.recordCameraState(
      { x: 12, y: 0, zoom: 1 },
      { interactionKind: "pointer-pan", moving: true },
    );
    cameraSync.scheduleCameraDependentSync();
    cameraSync.runCameraDependentSyncFrame(10);

    expect(labelLayer.visible).toBe(true);
    expect(edgeLayer.visible).toBe(true);
    const snapshot = cameraSync.debugSnapshot();
    expect(snapshot.cameraFastPathViolationCount).toBe(2);
    expect(snapshot.cameraFastPathViolations).toEqual(
      expect.arrayContaining([
        "labels-hidden-during-camera-motion",
        "base-edges-hidden-during-camera-motion",
      ]),
    );
  });

  test("fast-path invariant flags a graph-content rebuild during camera motion", () => {
    const syncVisibleScene = vi.fn(() => true);
    const { cameraSync } = createCameraSyncHarness({ syncVisibleScene });

    cameraSync.recordCameraState(
      { x: 8, y: 0, zoom: 1 },
      { interactionKind: "wheel-pan", moving: true },
    );
    cameraSync.scheduleCameraDependentSync();
    cameraSync.runCameraDependentSyncFrame(10);

    const snapshot = cameraSync.debugSnapshot();
    expect(snapshot.cameraFastPathViolationCount).toBe(1);
    expect(snapshot.cameraFastPathViolations).toContain("scene-rebuilt-during-camera-motion");
  });

  test("restores label, filter, and animation fidelity once camera movement settles", () => {
    const {
      animationCoordinator,
      cameraSync,
      labelLayer,
      labels,
      onCameraStateChange,
      syncFilterAreas,
    } = createCameraSyncHarness();

    cameraSync.recordCameraState(
      { x: 0, y: 0, zoom: 1.2 },
      { interactionKind: "wheel-zoom", moving: true, now: 0 },
    );
    cameraSync.scheduleCameraDependentSync();
    cameraSync.runCameraDependentSyncFrame(1);
    cameraSync.runCameraDependentSyncFrame(49);

    expect(labelLayer.visible).toBe(true);
    // The moving frame transformed labels; the settle frame performed the full sync.
    expect(labels.syncVisibleLabelTransforms).toHaveBeenCalledTimes(1);
    expect(labels.syncVisibleLabels).toHaveBeenCalledTimes(1);
    expect(animationCoordinator.syncActiveSet).toHaveBeenLastCalledWith({
      cameraMotion: "settled",
    });
    expect(syncFilterAreas).toHaveBeenLastCalledWith({ force: true });
    expect(cameraSync.debugSnapshot()).toMatchObject({
      cameraFastPathViolationCount: 0,
      cameraMoving: false,
      cameraMovingLabelHiddenFrameCount: 0,
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
    const { cameraSync, labels } = createCameraSyncHarness();

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
});

function createCameraSyncHarness(overrides = {}) {
  const animationCoordinator = overrides.animationCoordinator ?? { syncActiveSet: vi.fn() };
  const labels = overrides.labels ?? labelManagerStub();
  const labelLayer = overrides.labelLayer ?? { visible: true };
  const edgeLayer = overrides.edgeLayer ?? { visible: true };
  const syncFilterAreas = overrides.syncFilterAreas ?? vi.fn();
  const onCameraStateChange = overrides.onCameraStateChange ?? vi.fn();
  const cameraSync = createWorkflowGraphCameraSync({
    animationCoordinator,
    debugMetrics: debugMetricsStub(),
    edgeLayer,
    handlers: { onCameraStateChange },
    inputResponsiveness: { recordSettleRestore: vi.fn() },
    labelLayer,
    labels,
    syncFilterAreas,
    syncVisibleScene: overrides.syncVisibleScene,
    viewport: viewportStub(),
  });
  return {
    animationCoordinator,
    cameraSync,
    edgeLayer,
    labelLayer,
    labels,
    onCameraStateChange,
    syncFilterAreas,
  };
}

function debugMetricsStub() {
  return {
    measure: (_bucket, callback) => callback(),
  };
}

function labelManagerStub({ visibleLabelCount = 3 } = {}) {
  return {
    syncVisibleLabels: vi.fn(),
    syncVisibleLabelTransforms: vi.fn(() => visibleLabelCount),
  };
}

function viewportStub() {
  return {
    corner: { x: 0, y: 0 },
    scaled: 1,
  };
}
