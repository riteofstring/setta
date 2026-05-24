import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const VISIBLE_PROJECTION_PUBLICATION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePresentation.ts", import.meta.url),
);

describe("GPU Flow visible projection state presentation authority", () => {
  it("requires outcome-specific tokens at the visible projection mutator boundary", () => {
    const source = readFileSync(
      VISIBLE_PROJECTION_PUBLICATION_MODULE_PATH,
      "utf8",
    );

    expect(source).toContain(
      "readonly presentationToken: GpuFlowVisibleFramePresentationToken;",
    );
    expect(source).toContain("readonly token: GpuFlowHoldPreviousToken;");
    expect(source).not.toContain("GpuFlowVisibleFramePresentationToken | null");
    expect(source).not.toContain("GpuFlowHoldPreviousToken | null");
  });

  it("guards presented visible projection publication refs and keeps held frames read-only", () => {
    const source = readFileSync(
      VISIBLE_PROJECTION_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const presentedPublisherStart = source.indexOf(
      "function publishPresentedVisibleProjectionState",
    );
    const heldPublisherStart = source.indexOf(
      "function assertGpuFlowHeldPreviousVisibleProjectionState",
    );
    const presentedPublisherEnd = source.indexOf(
      "function presentGpuFlowVisibleFramePresentationFrame",
    );
    const heldPublisherSource = source.slice(
      heldPublisherStart,
      presentedPublisherStart,
    );
    const presentedPublisherSource = source.slice(
      presentedPublisherStart,
      presentedPublisherEnd,
    );

    expect(presentedPublisherStart).toBeGreaterThanOrEqual(0);
    expect(heldPublisherStart).toBeGreaterThanOrEqual(0);
    expect(presentedPublisherEnd).toBeGreaterThan(presentedPublisherStart);
    expect(presentedPublisherSource).toContain(
      "assertGpuFlowVisibleFramePresentationToken",
    );
    expect(presentedPublisherSource).toContain(
      "visibleProjectionStateRef.current = visibleProjectionState",
    );
    expect(presentedPublisherSource).toContain(
      "visibleProjectionPresentationStateRef.current = visibleProjectionState",
    );
    expect(heldPublisherSource).toContain(
      "assertGpuFlowHoldPreviousTokenForProjectionSample",
    );
    expect(heldPublisherSource).not.toContain(
      "visibleProjectionPresentationStateRef.current = visibleProjectionState",
    );
  });
});
