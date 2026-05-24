import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const VISIBLE_PROJECTION_PRESENTATION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePresentation.ts", import.meta.url),
);

describe("GPU Flow visible projection state presentation authority", () => {
  it("requires outcome-specific tokens at the visible projection mutator boundary", () => {
    const source = readFileSync(
      VISIBLE_PROJECTION_PRESENTATION_MODULE_PATH,
      "utf8",
    );

    expect(source).toContain(
      "readonly presentationToken: GpuFlowVisibleFramePresentationToken;",
    );
    expect(source).toContain("readonly token: GpuFlowHoldPreviousToken;");
    expect(source).not.toContain("GpuFlowVisibleFramePresentationToken | null");
    expect(source).not.toContain("GpuFlowHoldPreviousToken | null");
  });

  it("guards presented visible projection presentation refs and keeps held frames read-only", () => {
    const source = readFileSync(
      VISIBLE_PROJECTION_PRESENTATION_MODULE_PATH,
      "utf8",
    );
    const presentedPresenterStart = source.indexOf(
      "function presentVisibleProjectionState",
    );
    const heldPresenterStart = source.indexOf(
      "function assertGpuFlowHeldPreviousVisibleProjectionState",
    );
    const presentedPresenterEnd = source.indexOf(
      "function presentGpuFlowVisibleFramePresentationFrame",
    );
    const heldPresenterSource = source.slice(
      heldPresenterStart,
      presentedPresenterStart,
    );
    const presentedPresenterSource = source.slice(
      presentedPresenterStart,
      presentedPresenterEnd,
    );

    expect(presentedPresenterStart).toBeGreaterThanOrEqual(0);
    expect(heldPresenterStart).toBeGreaterThanOrEqual(0);
    expect(presentedPresenterEnd).toBeGreaterThan(presentedPresenterStart);
    expect(presentedPresenterSource).toContain(
      "assertGpuFlowVisibleFramePresentationToken",
    );
    expect(presentedPresenterSource).toContain(
      "visibleProjectionStateRef.current = visibleProjectionState",
    );
    expect(presentedPresenterSource).toContain(
      "visibleProjectionPresentationStateRef.current = visibleProjectionState",
    );
    expect(heldPresenterSource).toContain(
      "assertGpuFlowHoldPreviousTokenForProjectionSample",
    );
    expect(heldPresenterSource).not.toContain(
      "visibleProjectionPresentationStateRef.current = visibleProjectionState",
    );
  });
});
