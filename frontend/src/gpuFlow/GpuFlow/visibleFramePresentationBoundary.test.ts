import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SURFACE_FRAME_PUBLICATION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameSurfaceFrame.ts", import.meta.url),
);
const VISIBLE_FRAME_PRESENTATION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePresentation.ts", import.meta.url),
);
const VISIBLE_FRAME_COORDINATOR_MODULE_PATH = fileURLToPath(
  new URL("./visibleFrameCoordinator.ts", import.meta.url),
);

describe("GPU Flow visible frame presentation boundary", () => {
  it("keeps visible mutation under the coordinator, not the surface frame", () => {
    const surfaceFrameSource = readFileSync(
      SURFACE_FRAME_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const coordinatorSource = readFileSync(
      VISIBLE_FRAME_COORDINATOR_MODULE_PATH,
      "utf8",
    );
    const presentationSource = readFileSync(
      VISIBLE_FRAME_PRESENTATION_MODULE_PATH,
      "utf8",
    );

    expect(surfaceFrameSource).not.toContain(
      "presentGpuFlowVisibleFramePublicationFrame",
    );
    expect(surfaceFrameSource).toContain("presentationRuntime");
    expect(coordinatorSource).toContain(
      "presentGpuFlowVisibleFramePublicationFrame",
    );
    expect(presentationSource).toContain(
      "export function presentGpuFlowVisibleFramePublicationFrame",
    );
  });
});
