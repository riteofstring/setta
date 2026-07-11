import { describe, expect, test } from "vitest";

import { sameCaptureContext } from "./use-speech-capture";

describe("Easy Button speech capture scope", () => {
  test("accepts completion only in the runtime and workspace where capture began", () => {
    const captureContext = {
      runtimeId: "runtime_capture",
      workspaceId: "workspace_capture",
    };

    expect(sameCaptureContext(captureContext, captureContext)).toBe(true);
    expect(
      sameCaptureContext(captureContext, {
        runtimeId: "runtime_other",
        workspaceId: "workspace_capture",
      }),
    ).toBe(false);
    expect(
      sameCaptureContext(captureContext, {
        runtimeId: "runtime_capture",
        workspaceId: "workspace_other",
      }),
    ).toBe(false);
    expect(sameCaptureContext(captureContext, null)).toBe(false);
  });
});
