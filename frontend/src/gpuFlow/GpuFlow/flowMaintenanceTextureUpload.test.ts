/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";

import type { UploadDirtyHtmlSurfaceTexturesResult } from "../htmlSurfaces/textureUploadDiagnostics";
import {
  requestGpuFlowDirtySurfaceTextureUploadFollowUp,
  shouldUploadGpuFlowMaintenanceDirtySurfaceTexturesEarly,
  uploadGpuFlowMaintenanceDirtySurfaceTextures,
} from "./flowMaintenanceTextureUpload";

describe("GPU flow maintenance texture upload", () => {
  it("uploads queued dirty textures with maintenance deferral flags", () => {
    const uploadDirtySurfaceTextures = vi.fn(() =>
      textureUploadResult({ budgetExhausted: false }),
    );
    const requestFrame = vi.fn();
    const now = () => 100;

    const result = uploadGpuFlowMaintenanceDirtySurfaceTextures({
      deferResolutionUpdates: true,
      frame: 12,
      surfaceRef: { current: { requestFrame } },
      textureManager: { uploadDirtySurfaceTextures },
      uploadBudget: { maxUploads: 2, now },
    });

    expect(result.budgetExhausted).toBe(false);
    expect(uploadDirtySurfaceTextures).toHaveBeenCalledWith({
      deferPassiveUploads: true,
      deferResolutionOnly: true,
      frame: 12,
      maxUploads: 2,
      now,
    });
    expect(requestFrame).not.toHaveBeenCalled();
  });

  it("does not add active-motion deferral flags outside resolution deferral", () => {
    const uploadDirtySurfaceTextures = vi.fn(() =>
      textureUploadResult({ budgetExhausted: false }),
    );

    uploadGpuFlowMaintenanceDirtySurfaceTextures({
      deferResolutionUpdates: false,
      frame: 7,
      surfaceRef: { current: null },
      textureManager: { uploadDirtySurfaceTextures },
      uploadBudget: { maxBytes: 1024 },
    });

    expect(uploadDirtySurfaceTextures).toHaveBeenCalledWith({
      frame: 7,
      maxBytes: 1024,
    });
  });

  it("requests content and texture upload frames when budget remains", () => {
    const uploadDirtySurfaceTextures = vi.fn(() =>
      textureUploadResult({ budgetExhausted: true }),
    );
    const requestFrame = vi.fn();

    uploadGpuFlowMaintenanceDirtySurfaceTextures({
      deferResolutionUpdates: false,
      frame: 3,
      surfaceRef: { current: { requestFrame } },
      textureManager: { uploadDirtySurfaceTextures },
      uploadBudget: undefined,
    });

    expect(requestFrame).toHaveBeenCalledWith("manual");
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");
  });

  it("requests content and texture upload frames when paint is unavailable", () => {
    const uploadDirtySurfaceTextures = vi.fn(() =>
      textureUploadResult({
        budgetExhausted: false,
        paintUnavailableSurfaceCount: 1,
      }),
    );
    const requestFrame = vi.fn();

    uploadGpuFlowMaintenanceDirtySurfaceTextures({
      deferResolutionUpdates: false,
      frame: 4,
      surfaceRef: { current: { requestFrame } },
      textureManager: { uploadDirtySurfaceTextures },
      uploadBudget: undefined,
    });

    expect(requestFrame).toHaveBeenCalledWith("manual");
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");
  });

  it("requests content repair after maintenance upload clears queued resources", () => {
    const uploadDirtySurfaceTextures = vi.fn(() =>
      textureUploadResult({ budgetExhausted: false, uploadedCount: 1 }),
    );
    const requestFrame = vi.fn();

    uploadGpuFlowMaintenanceDirtySurfaceTextures({
      deferResolutionUpdates: false,
      frame: 5,
      surfaceRef: { current: { requestFrame } },
      textureManager: { uploadDirtySurfaceTextures },
      uploadBudget: undefined,
    });

    expect(requestFrame).toHaveBeenCalledWith("manual");
    expect(requestFrame).not.toHaveBeenCalledWith("texture-upload");
  });

  it("retries deferred uploads only when deferred retry is requested", () => {
    const requestFrame = vi.fn();

    requestGpuFlowDirtySurfaceTextureUploadFollowUp({
      retryDeferredUploads: false,
      surfaceRef: { current: { requestFrame } },
      uploadResult: textureUploadResult({
        budgetExhausted: false,
        deferredSurfaceIds: ["snapshot-a"],
      }),
    });
    expect(requestFrame).not.toHaveBeenCalled();

    requestGpuFlowDirtySurfaceTextureUploadFollowUp({
      retryDeferredUploads: true,
      surfaceRef: { current: { requestFrame } },
      uploadResult: textureUploadResult({
        budgetExhausted: false,
        deferredSurfaceIds: ["snapshot-a"],
      }),
    });
    expect(requestFrame).toHaveBeenCalledWith("manual");
    expect(requestFrame).toHaveBeenCalledWith("texture-upload");
  });

  it("drains early for budget-promoted content frames with texture upload work", () => {
    expect(
      shouldUploadGpuFlowMaintenanceDirtySurfaceTexturesEarly({
        frameReasons: ["manual", "texture-upload"],
        publicationLane: "content",
      }),
    ).toBe(true);
    expect(
      shouldUploadGpuFlowMaintenanceDirtySurfaceTexturesEarly({
        frameReasons: ["manual"],
        publicationLane: "content",
      }),
    ).toBe(false);
    expect(
      shouldUploadGpuFlowMaintenanceDirtySurfaceTexturesEarly({
        frameReasons: [],
        publicationLane: "maintenance",
      }),
    ).toBe(true);
  });
});

function textureUploadResult({
  budgetExhausted,
  deferredSurfaceIds = [],
  paintUnavailableSurfaceCount = 0,
  uploadedCount = 0,
}: {
  readonly budgetExhausted: boolean;
  readonly deferredSurfaceIds?: readonly string[] | undefined;
  readonly paintUnavailableSurfaceCount?: number | undefined;
  readonly uploadedCount?: number | undefined;
}): UploadDirtyHtmlSurfaceTexturesResult {
  return {
    budgetExhausted,
    deferredSurfaceIds,
    diagnostics: [],
    remainingDirtySurfaceIds: budgetExhausted ? ["pending-surface"] : [],
    skippedSurfaceIds: [],
    skippedUploadBytes: 0,
    uploaded: Array.from({ length: uploadedCount }, (_, index) => ({
      surfaceId: `uploaded-${index}`,
    })) as UploadDirtyHtmlSurfaceTexturesResult["uploaded"],
    uploadedBytes: 0,
    workSummary: {
      deferredSurfaceCount: deferredSurfaceIds.length,
      initialDirtySurfaceCount: budgetExhausted ? 1 : 0,
      initialDirtyWorkCounts: emptyDirtyWorkCounts(),
      noUploadReason: budgetExhausted
        ? "budget-exhausted"
        : "no-dirty-surfaces",
      paintUnavailableSurfaceCount,
      remainingDirtySurfaceCount: budgetExhausted ? 1 : 0,
      remainingDirtyWorkCounts: emptyDirtyWorkCounts(),
      skippedSurfaceCount: 0,
      uploadableRemainingDirtySurfaceCount: budgetExhausted ? 1 : 0,
      uploadableRemainingDirtyWorkCounts: emptyDirtyWorkCounts(),
      uploadedSurfaceCount: 0,
    },
  };
}

function emptyDirtyWorkCounts() {
  return {
    animation: 0,
    content: 0,
    geometry: 0,
    hover: 0,
    resolution: 0,
    "source-window": 0,
  };
}
