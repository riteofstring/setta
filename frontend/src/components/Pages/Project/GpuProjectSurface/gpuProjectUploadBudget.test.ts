import { DEFAULT_HTML_SURFACE_TEXTURE_UPLOAD_BUDGET_BYTES } from "gpuFlow/htmlSurfaces/textureTiles";
import { describe, expect, it } from "vitest";
import { PROJECT_GPU_NODE_UPLOAD_BUDGET } from "./gpuProjectUploadBudget";

describe("project GPU upload budget", () => {
  it("caps per-frame HTML surface uploads by one default full tile", () => {
    expect(PROJECT_GPU_NODE_UPLOAD_BUDGET).toEqual({
      maxBytes: DEFAULT_HTML_SURFACE_TEXTURE_UPLOAD_BUDGET_BYTES,
      maxDurationMs: 4,
      maxUploads: 2,
    });
  });
});
