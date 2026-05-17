import { describe, expect, it } from "vitest";
import { createGpuFlowViewportStore } from "../viewportStore";
import {
  createGpuWheelGestureOwnershipArbiter,
  getGpuWheelGestureOwnershipArbiter,
  isGpuViewportWheelOwner,
} from "./wheelOwnership";

describe("GPU Flow wheel gesture ownership", () => {
  it("latches the first viewport pan owner for the wheel burst", () => {
    let nowMs = 0;
    const arbiter = createGpuWheelGestureOwnershipArbiter({
      burstTimeoutMs: 150,
      now: () => nowMs,
    });

    expect(
      arbiter.resolveOwner({
        candidateOwner: "ownedByViewportPan",
        reason: "first-pan",
      }).owner,
    ).toBe("ownedByViewportPan");

    nowMs = 40;
    expect(
      arbiter.resolveOwner({
        candidateOwner: "ownedByRetainedSectionScroll",
        reason: "target-changed",
      }).owner,
    ).toBe("ownedByViewportPan");
    expect(isGpuViewportWheelOwner(arbiter.getState().owner)).toBe(true);
  });

  it("allows a new owner after the burst timeout", () => {
    let nowMs = 0;
    const arbiter = createGpuWheelGestureOwnershipArbiter({
      burstTimeoutMs: 150,
      now: () => nowMs,
    });

    arbiter.resolveOwner({
      candidateOwner: "ownedByViewportPan",
      reason: "first-pan",
    });
    nowMs = 181;

    expect(
      arbiter.resolveOwner({
        candidateOwner: "ownedByRetainedSectionScroll",
        reason: "next-burst",
      }).owner,
    ).toBe("ownedByRetainedSectionScroll");
  });

  it("releases only the matching owner", () => {
    const arbiter = createGpuWheelGestureOwnershipArbiter();
    arbiter.resolveOwner({
      candidateOwner: "ownedByViewportPan",
      reason: "first-pan",
    });

    expect(
      arbiter.releaseOwner("ownedByViewportZoom", "wrong-timeout").owner,
    ).toBe("ownedByViewportPan");
    expect(
      arbiter.releaseOwner("ownedByViewportPan", "pan-timeout").owner,
    ).toBe("idle");
  });

  it("shares one arbiter across controllers for a viewport store", () => {
    const store = createGpuFlowViewportStore();
    const first = getGpuWheelGestureOwnershipArbiter(store);
    const second = getGpuWheelGestureOwnershipArbiter(store);

    first.resolveOwner({
      candidateOwner: "ownedByRetainedSectionScroll",
      reason: "retained-section-wheel",
    });

    expect(second.getState().owner).toBe("ownedByRetainedSectionScroll");
  });
});
