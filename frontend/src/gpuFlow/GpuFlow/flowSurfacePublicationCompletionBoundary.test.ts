import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SURFACE_FRAME_PUBLICATION_MODULE_PATH = fileURLToPath(
  new URL("./flowSurfaceFramePublication.ts", import.meta.url),
);
const SURFACE_PUBLICATION_COMPLETION_MODULE_PATH = fileURLToPath(
  new URL("./flowSurfacePublicationCompletion.ts", import.meta.url),
);

describe("GPU Flow surface publication executor boundary", () => {
  it("keeps low-level completion private to the publication executor", () => {
    const surfaceFrameSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const completionSource = readFileSync(
      SURFACE_PUBLICATION_COMPLETION_MODULE_PATH,
      "utf8",
    );

    expect(surfaceFrameSource).toContain(
      "createGpuFlowSurfacePublicationPublisher",
    );
    expect(surfaceFrameSource).not.toContain(
      "completeGpuFlowSurfacePublicationFrame",
    );
    expect(completionSource).toContain(
      "export function createGpuFlowSurfacePublicationPublisher",
    );
    expect(completionSource).toContain(
      "function completeGpuFlowSurfacePublicationFrame",
    );
    expect(completionSource).not.toContain(
      "export function completeGpuFlowSurfacePublicationFrame",
    );
  });
});
