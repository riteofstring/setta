import { describe, expect, it } from "vitest";

import type {
  RetainedContentTexturePageMaintenanceResult,
  RetainedContentTexturePageManager,
  RetainedContentTexturePagePreparedFrame,
} from "../retainedContentTexturePageManager";
import { resolveGpuFlowRetainedPageMaintenanceBeforePublish } from "./flowRetainedPageMaintenance";

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
  trueHoleRectCount,
}: {
  readonly trueHoleRectCount: number;
}): RetainedContentTexturePagePreparedFrame {
  return {
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
