import { describe, expect, it } from "vitest";

import type {
  RetainedContentTexturePageMaintenanceResult,
  RetainedContentTexturePageManager,
  RetainedContentTexturePagePreparedFrame,
} from "../retainedContentTexturePageManager";
import {
  resolveGpuFlowRetainedPageMaintenanceAfterPublish,
  resolveGpuFlowRetainedPageMaintenanceBeforePublish,
} from "./flowRetainedPageMaintenance";

describe("GPU flow retained page maintenance", () => {
  it("repairs visible true holes before the retained display transaction", () => {
    const frames = [
      retainedPreparedFrame({ trueHoleRectCount: 1 }),
      retainedPreparedFrame({ trueHoleRectCount: 1 }),
      retainedPreparedFrame({ trueHoleRectCount: 0 }),
    ];
    const protectedKeysByCall: string[][] = [];
    let callCount = 0;
    const manager = retainedPageManager({
      runPostSubmitMaintenance: ({
        preparedFrame,
        publishedProtectedPageKeys,
      }) => {
        protectedKeysByCall.push([...(publishedProtectedPageKeys ?? [])]);
        callCount += 1;
        return retainedMaintenanceResult({
          preparedFrame,
          repairedPreparedFrame: frames[callCount] ?? preparedFrame,
        });
      },
    });

    const maintenance = resolveGpuFlowRetainedPageMaintenanceBeforePublish({
      darkMode: false,
      deferResolutionUpdates: true,
      preparedFrame: frames[0],
      previousProtectedPageKeys: ["previous-page"],
      retainedContentPageManager: manager,
    });

    expect(callCount).toBe(2);
    expect(protectedKeysByCall).toEqual([["previous-page"], ["previous-page"]]);
    expect(maintenance?.result.repairedPreparedFrame.trueHoleRectCount).toBe(0);
  });

  it("repairs covered replacement debt before the retained display transaction", () => {
    const frame = retainedPreparedFrame({
      refinementPageCount: 1,
      replacementDescriptorCount: 1,
      trueHoleRectCount: 0,
    });
    const repairedFrame = retainedPreparedFrame({ trueHoleRectCount: 0 });
    let callCount = 0;
    const manager = retainedPageManager({
      runPostSubmitMaintenance: ({ preparedFrame }) => {
        callCount += 1;
        return retainedMaintenanceResult({
          preparedFrame,
          repairedPreparedFrame: repairedFrame,
        });
      },
    });

    const maintenance = resolveGpuFlowRetainedPageMaintenanceBeforePublish({
      darkMode: false,
      deferResolutionUpdates: true,
      preparedFrame: frame,
      previousProtectedPageKeys: [],
      retainedContentPageManager: manager,
    });

    expect(callCount).toBe(1);
    expect(maintenance?.result.repairedPreparedFrame).toBe(repairedFrame);
  });

  it("honors the configured pre-publish repair pass limit", () => {
    const frames = [
      retainedPreparedFrame({ trueHoleRectCount: 1 }),
      retainedPreparedFrame({ trueHoleRectCount: 1 }),
      retainedPreparedFrame({ trueHoleRectCount: 0 }),
    ];
    let callCount = 0;
    const manager = retainedPageManager({
      runPostSubmitMaintenance: ({ preparedFrame }) => {
        callCount += 1;
        return retainedMaintenanceResult({
          preparedFrame,
          repairedPreparedFrame: frames[callCount] ?? preparedFrame,
        });
      },
    });

    const maintenance = resolveGpuFlowRetainedPageMaintenanceBeforePublish({
      darkMode: false,
      deferResolutionUpdates: true,
      maxPasses: 1,
      preparedFrame: frames[0],
      previousProtectedPageKeys: [],
      retainedContentPageManager: manager,
    });

    expect(callCount).toBe(1);
    expect(maintenance?.result.repairedPreparedFrame.trueHoleRectCount).toBe(1);
  });

  it("stops pre-publish repair when maintenance cannot advance", () => {
    const frame = retainedPreparedFrame({ trueHoleRectCount: 1 });
    let callCount = 0;
    const manager = retainedPageManager({
      runPostSubmitMaintenance: ({ preparedFrame }) => {
        callCount += 1;
        return retainedMaintenanceResult({
          executedItemCount: 0,
          preparedFrame,
          repairedPreparedFrame: preparedFrame,
          uploadCount: 0,
        });
      },
    });

    const maintenance = resolveGpuFlowRetainedPageMaintenanceBeforePublish({
      darkMode: false,
      deferResolutionUpdates: true,
      preparedFrame: frame,
      previousProtectedPageKeys: [],
      retainedContentPageManager: manager,
    });

    expect(callCount).toBe(1);
    expect(maintenance?.result.repairedPreparedFrame.trueHoleRectCount).toBe(1);
  });

  it("can force post-submit maintenance deferral for held previous coverage", () => {
    const frame = retainedPreparedFrame({ trueHoleRectCount: 1 });
    let deferredCallCount = 0;
    let repairCallCount = 0;
    const manager = {
      deferPostSubmitMaintenance: ({
        preparedFrame,
      }: {
        readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
      }) => {
        deferredCallCount += 1;
        return retainedMaintenanceResult({
          preparedFrame,
          repairedPreparedFrame: preparedFrame,
        });
      },
      runPostSubmitMaintenance: ({
        preparedFrame,
      }: Parameters<
        RetainedContentTexturePageManager["runPostSubmitMaintenance"]
      >[0]) => {
        repairCallCount += 1;
        return retainedMaintenanceResult({
          preparedFrame,
          repairedPreparedFrame: retainedPreparedFrame({
            trueHoleRectCount: 0,
          }),
        });
      },
    } as RetainedContentTexturePageManager;

    const maintenance = resolveGpuFlowRetainedPageMaintenanceAfterPublish({
      darkMode: false,
      deferResolutionUpdates: true,
      existingMaintenance: null,
      forceDeferPostSubmitMaintenance: true,
      preparedFrame: frame,
      publishedProtectedPageKeys: [],
      retainedContentPageManager: manager,
    });

    expect(deferredCallCount).toBe(1);
    expect(repairCallCount).toBe(0);
    expect(maintenance.deferred).toBe(true);
    expect(maintenance.result.repairedPreparedFrame).toBe(frame);
  });
});

function retainedPageManager({
  runPostSubmitMaintenance,
}: {
  readonly runPostSubmitMaintenance: RetainedContentTexturePageManager["runPostSubmitMaintenance"];
}): RetainedContentTexturePageManager {
  return {
    runPostSubmitMaintenance,
  } as RetainedContentTexturePageManager;
}

function retainedPreparedFrame({
  refinementPageCount = 0,
  replacementDescriptorCount = 0,
  trueHoleRectCount,
}: {
  readonly refinementPageCount?: number | undefined;
  readonly replacementDescriptorCount?: number | undefined;
  readonly trueHoleRectCount: number;
}): RetainedContentTexturePagePreparedFrame {
  return {
    refinementPageCount,
    replacementDescriptors: Array.from(
      { length: replacementDescriptorCount },
      () => ({}),
    ) as RetainedContentTexturePagePreparedFrame["replacementDescriptors"],
    trueHoleRectCount,
  } as RetainedContentTexturePagePreparedFrame;
}

function retainedMaintenanceResult({
  executedItemCount = 1,
  preparedFrame,
  repairedPreparedFrame,
  uploadCount = 1,
}: {
  readonly executedItemCount?: number | undefined;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly repairedPreparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly uploadCount?: number | undefined;
}): RetainedContentTexturePageMaintenanceResult {
  return {
    executedItemCount,
    repairedPreparedFrame,
    trueHoleRectCount: preparedFrame.trueHoleRectCount,
    uploadCount,
  } as RetainedContentTexturePageMaintenanceResult;
}
