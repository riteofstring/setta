import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const modulePath = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));
const VISIBLE_FRAME_DIAGNOSTICS_MODULE_PATH = modulePath(
  "./visibleFrameDiagnostics.ts",
);
const BROWSER_VISUAL_PREPARATION_MODULE_PATH = modulePath(
  "./visibleFrameBrowserVisualPreparation.ts",
);
const BROWSER_VISUAL_RESOURCE_WORK_MODULE_PATH = modulePath(
  "./visibleFrameBrowserVisualResourceWork.ts",
);

describe("GPU Flow visible frame diagnostics boundaries", () => {
  it("keeps browser visual resource preparation state out of diagnostics", () => {
    const diagnosticsSource = readFileSync(
      VISIBLE_FRAME_DIAGNOSTICS_MODULE_PATH,
      "utf8",
    );
    const preparationSource = readFileSync(
      BROWSER_VISUAL_PREPARATION_MODULE_PATH,
      "utf8",
    );
    const resourceWorkSource = readFileSync(
      BROWSER_VISUAL_RESOURCE_WORK_MODULE_PATH,
      "utf8",
    );

    expect(diagnosticsSource).not.toContain(
      "recordGpuFlowBrowserVisualResourceWork",
    );
    expect(diagnosticsSource).not.toContain(
      "__SETTA_GPU_FLOW_BROWSER_VISUAL_RESOURCE_WORK__",
    );
    expect(diagnosticsSource).not.toContain(
      "browserVisualResourceWorkByCanvas",
    );
    expect(diagnosticsSource).not.toContain(
      'surface.requestFrame("texture-upload")',
    );
    expect(diagnosticsSource).not.toContain("setTimeout(");
    expect(preparationSource).toContain(
      "recordGpuFlowBrowserVisualResourceWorkRequested",
    );
    expect(preparationSource).toContain(
      'surface.requestFrame("texture-upload")',
    );
    expect(resourceWorkSource).toContain(
      "__SETTA_GPU_FLOW_BROWSER_VISUAL_RESOURCE_WORK__",
    );
  });
});
