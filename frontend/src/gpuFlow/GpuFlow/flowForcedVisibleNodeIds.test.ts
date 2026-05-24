import { describe, expect, it } from "vitest";

import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import { getGpuFlowPreparedContentFrameForceVisibleNodeIds } from "./flowForcedVisibleNodeIds";

describe("GPU Flow retained content forced visible node ids", () => {
  it("forces prepared visible section actor surfaces into the HTML surface pass", () => {
    expect(
      getGpuFlowPreparedContentFrameForceVisibleNodeIds(
        ["base-section"],
        preparedContentFrame(["settings-section__gui", "base-section"]),
      ),
    ).toEqual(["base-section", "settings-section__gui"]);
  });

  it("preserves the existing force-visible collection when no section actors are required", () => {
    const base = new Set(["base-section"]);

    expect(
      getGpuFlowPreparedContentFrameForceVisibleNodeIds(
        base,
        preparedContentFrame([]),
      ),
    ).toBe(base);
  });
});

function preparedContentFrame(
  sectionSurfaceIds: readonly string[],
): GpuFlowPreparedContentFrame {
  return {
    actorGenerations: sectionSurfaceIds.flatMap((ownerSurfaceId) => [
      {
        actorFamily: "section-shell",
        ownerSurfaceId,
        visibleNonempty: true,
      },
      {
        actorFamily: "section-body-clip",
        ownerSurfaceId,
        visibleNonempty: true,
      },
    ]),
  } as unknown as GpuFlowPreparedContentFrame;
}
