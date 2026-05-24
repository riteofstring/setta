import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const VISIBLE_PROJECTION_PUBLICATION_MODULE_PATH = fileURLToPath(
  new URL("./visibleFramePresenter.ts", import.meta.url),
);

describe("GPU Flow visible projection state publication authority", () => {
  it("requires outcome-specific tokens at the visible projection mutator boundary", () => {
    const source = readFileSync(
      VISIBLE_PROJECTION_PUBLICATION_MODULE_PATH,
      "utf8",
    );

    expect(source).toContain(
      "readonly commitPublicationToken: GpuFlowCommitPublicationToken;",
    );
    expect(source).toContain("readonly token: GpuFlowHoldPreviousToken;");
    expect(source).not.toContain("GpuFlowCommitPublicationToken | null");
    expect(source).not.toContain("GpuFlowHoldPreviousToken | null");
  });

  it("guards committed visible projection publication refs and keeps held frames read-only", () => {
    const source = readFileSync(
      VISIBLE_PROJECTION_PUBLICATION_MODULE_PATH,
      "utf8",
    );
    const committedPublisherStart = source.indexOf(
      "function publishCommittedVisibleProjectionState",
    );
    const heldPublisherStart = source.indexOf(
      "function assertGpuFlowHeldPreviousVisibleProjectionState",
    );
    const committedPublisherEnd = source.indexOf(
      "function presentGpuFlowVisibleFramePublicationFrame",
    );
    const heldPublisherSource = source.slice(
      heldPublisherStart,
      committedPublisherStart,
    );
    const committedPublisherSource = source.slice(
      committedPublisherStart,
      committedPublisherEnd,
    );

    expect(committedPublisherStart).toBeGreaterThanOrEqual(0);
    expect(heldPublisherStart).toBeGreaterThanOrEqual(0);
    expect(committedPublisherEnd).toBeGreaterThan(committedPublisherStart);
    expect(committedPublisherSource).toContain(
      "assertGpuFlowCommitPublicationToken",
    );
    expect(committedPublisherSource).toContain(
      "visibleProjectionStateRef.current = visibleProjectionState",
    );
    expect(committedPublisherSource).toContain(
      "visibleProjectionPublicationStateRef.current = visibleProjectionState",
    );
    expect(heldPublisherSource).toContain(
      "assertGpuFlowHoldPreviousTokenForProjectionSample",
    );
    expect(heldPublisherSource).not.toContain(
      "visibleProjectionPublicationStateRef.current = visibleProjectionState",
    );
  });
});
