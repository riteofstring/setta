import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SURFACE_FRAME_PUBLICATION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameSurfaceFrame.ts", import.meta.url),
);
const VISIBLE_FRAME_PRESENTER_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePresenter.ts", import.meta.url),
);

describe("GPU Flow visible frame presenter boundary", () => {
  it("keeps low-level presentation completion private to the presenter", () => {
    const surfaceFrameSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const completionSource = readFileSync(
      VISIBLE_FRAME_PRESENTER_MODULE_PATH,
      "utf8",
    );

    expect(surfaceFrameSource).toContain("createGpuFlowVisibleFramePresenter");
    expect(surfaceFrameSource).not.toContain(
      "presentGpuFlowVisibleFramePublicationFrame",
    );
    expect(completionSource).toContain(
      "export function createGpuFlowVisibleFramePresenter",
    );
    expect(completionSource).toContain(
      "function presentGpuFlowVisibleFramePublicationFrame",
    );
    expect(completionSource).not.toContain(
      "export function presentGpuFlowVisibleFramePublicationFrame",
    );
  });
});
