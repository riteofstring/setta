import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const modulePath = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));

describe("GPU Flow visible frame texture eviction boundary", () => {
  it("defers texture eviction until commit-tokened node-layer publication", () => {
    const flowFrameSource = readFileSync(modulePath("./flowFrame.tsx"), "utf8");
    const projectionFrameSource = readFileSync(
      modulePath("./flowProjectionFrame.tsx"),
      "utf8",
    );
    const lifecycleSource = readFileSync(
      modulePath("./flowFrameLifecycle.ts"),
      "utf8",
    );
    const renderWorkSource = readFileSync(
      modulePath("../htmlSurfaces/frameRenderWork.ts"),
      "utf8",
    );
    const submitterStart = lifecycleSource.indexOf(
      "function submitGpuFlowHtmlSurfaceTextureEvictionFrame",
    );
    const submitterSource = lifecycleSource.slice(submitterStart);

    expect(flowFrameSource).toContain('canvasSubmissionMode: "deferred"');
    expect(projectionFrameSource).toContain('canvasSubmissionMode: "deferred"');
    expect(renderWorkSource).toContain("textureEvictionSubmissionMode");
    expect(renderWorkSource).toContain("prepareDeferredTextureEvictionResult");
    expect(renderWorkSource).toContain("createDeferredTextureEvictionSubmission");
    expect(submitterStart).toBeGreaterThanOrEqual(0);
    expect(submitterSource).toContain(
      "assertGpuFlowCommitPublicationTokenBrand",
    );
    expect(submitterSource).toContain("textureEvictionSubmission.submit()");
  });
});
