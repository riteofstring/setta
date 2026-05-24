import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const modulePath = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));

describe("GPU Flow browser visual actor presentation identity boundaries", () => {
  it("keeps retired browser visual hosts attributed to the retiring presentation", () => {
    const identitySource = readFileSync(
      modulePath("./visibleFrameIdentityAttributes.ts"),
      "utf8",
    );
    const browserVisualRuntimeSource = readFileSync(
      modulePath("./browserVisualActorRuntime.ts"),
      "utf8",
    );
    const browserVisualRuntimeHelpersSource = readFileSync(
      modulePath("./browserVisualActorRuntimeHelpers.ts"),
      "utf8",
    );

    expect(identitySource).not.toContain(
      "clearGpuFlowVisibleFrameIdentityAttributes",
    );
    expect(browserVisualRuntimeSource).toContain(
      "setGpuFlowVisibleFrameIdentityAttributes(host.element, token)",
    );
    expect(browserVisualRuntimeHelpersSource).toContain(
      "setGpuFlowVisibleFrameIdentityAttributes(element, token)",
    );
    expect(browserVisualRuntimeSource).not.toContain(
      "clearGpuFlowVisibleFrameIdentityAttributes",
    );
    expect(browserVisualRuntimeHelpersSource).not.toContain(
      "clearGpuFlowVisibleFrameIdentityAttributes",
    );
  });
});
