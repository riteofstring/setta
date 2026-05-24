import { describe, expect, it } from "vitest";

import type { GpuFlowLiveProjectionSample } from "../projectionRuntime";
import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import {
  resolveGpuFlowDomControlLiveHostPreparationStage,
  resolveGpuFlowDomControlSnapshotPreparationStage,
} from "./browserVisualActorRuntimeState";
import { createGpuFlowVisibleFrameBlockedPublicationTokenForTest } from "./visibleFrameTestUtils";

describe("GPU Flow browser visual actor runtime state", () => {
  it("stages budget-selected live controls instead of the first live preparation batch", () => {
    const controls = ["a", "b", "c", "d", "e"].map((sourceId) =>
      domControl({ sourceId }),
    );

    const staged = resolveGpuFlowDomControlLiveHostPreparationStage({
      isDomControlHostReady: () => false,
      preparedDomControls: {
        mountedControls: controls,
      } as unknown as Parameters<
        typeof resolveGpuFlowDomControlLiveHostPreparationStage
      >[0]["preparedDomControls"],
      selectedResourceKeys: ["dom-control:c", "dom-control:e"],
      token: blockedToken(),
    });

    expect(staged.map((control) => control.sourceId)).toEqual(["c", "e"]);
  });

  it("stages blocked token actors alongside budget-selected resources", () => {
    const controls = ["a", "b", "c", "d", "e"].map((sourceId) =>
      domControl({ sourceId }),
    );

    const staged = resolveGpuFlowDomControlLiveHostPreparationStage({
      isDomControlHostReady: () => false,
      preparedDomControls: {
        mountedControls: controls,
      } as unknown as Parameters<
        typeof resolveGpuFlowDomControlLiveHostPreparationStage
      >[0]["preparedDomControls"],
      selectedResourceKeys: ["dom-control:e"],
      token: blockedToken(["c"]),
    });

    expect(staged.map((control) => control.sourceId)).toEqual(["c", "e"]);
  });

  it("stages budget-selected snapshot controls by resolved snapshot resource key", () => {
    const controls = [
      domControl({ sourceId: "a", snapshotSurfaceId: "snapshot:a" }),
      domControl({ sourceId: "b", snapshotSurfaceId: "snapshot:b" }),
    ];

    const staged = resolveGpuFlowDomControlSnapshotPreparationStage({
      domControlSnapshotElementBySurfaceId: new Map(),
      domControlSnapshotTextureManager: null,
      preparedDomControls: {
        snapshotControls: controls,
      } as unknown as Parameters<
        typeof resolveGpuFlowDomControlSnapshotPreparationStage
      >[0]["preparedDomControls"],
      selectedResourceKeys: ["dom-control-snapshot:snapshot:b"],
      token: blockedToken(),
    });

    expect(staged.map((control) => control.sourceId)).toEqual(["b"]);
  });
});

function domControl({
  snapshotSurfaceId,
  sourceId,
}: {
  readonly snapshotSurfaceId?: string | undefined;
  readonly sourceId: string;
}): GpuRetainedDomControlSourceDescriptor {
  return {
    snapshotSurfaceId,
    sourceId,
  } as unknown as GpuRetainedDomControlSourceDescriptor;
}

function blockedToken(actorIds: readonly string[] = []) {
  return createGpuFlowVisibleFrameBlockedPublicationTokenForTest({
    blockedReasons: actorIds.map((actorId) => ({
      actorId,
      family: "browser-text-snapshot",
      reason: "snapshot-pending",
    })),
    frozenFrameId: 1,
    projectionSample: {
      id: 1,
      timestamp: 16,
    } as unknown as GpuFlowLiveProjectionSample,
  });
}
