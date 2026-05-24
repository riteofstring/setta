import { describe, expect, it } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import {
  getGpuFlowBrowserStyleBlockedReasonFamily,
  getGpuFlowBrowserStyleVisibleFrameActorFamily,
} from "./visibleFrameActorRegistry";

type CommittedActor = GpuFlowCommittedSurfaceFrame["actorGenerations"][number];

describe("GPU Flow browser-style visible frame actor registry", () => {
  it("classifies text-like controls by their browser-owned presentation", () => {
    expect(
      getGpuFlowBrowserStyleVisibleFrameActorFamily(
        committedActor({
          actorFamily: "text-like-dom-control",
          kind: "dom-control",
          projectionCoverage: "exact-live-dom",
        }),
      ),
    ).toBe("browser-text-control");
    expect(
      getGpuFlowBrowserStyleVisibleFrameActorFamily(
        committedActor({
          actorFamily: "text-like-dom-control",
          kind: "dom-control",
          projectionCoverage: "exact-snapshot",
        }),
      ),
    ).toBe("browser-text-snapshot");
    expect(
      getGpuFlowBrowserStyleVisibleFrameActorFamily(
        committedActor({
          active: true,
          actorFamily: "text-like-dom-control",
          kind: "dom-control",
          projectionCoverage: "exact-live-dom",
        }),
      ),
    ).toBe("active-editor");
  });

  it("classifies structural and retained resource actors with coordinator families", () => {
    expect(
      getGpuFlowBrowserStyleVisibleFrameActorFamily(
        committedActor({
          actorFamily: "section-header",
          kind: "html-texture",
        }),
      ),
    ).toBe("section-header");
    expect(
      getGpuFlowBrowserStyleVisibleFrameActorFamily(
        committedActor({
          actorFamily: "gpu-native-visual",
          kind: "gpu-native-visual",
        }),
      ),
    ).toBe("retained-native-visual");
    expect(
      getGpuFlowBrowserStyleVisibleFrameActorFamily(
        committedActor({
          actorFamily: "retained-page",
          kind: "retained-page",
        }),
      ),
    ).toBe("retained-page");
  });

  it("normalizes blocked proof families to browser-style families", () => {
    expect(
      getGpuFlowBrowserStyleBlockedReasonFamily({
        family: "browser-visual",
        reason: "snapshot-pending",
      }),
    ).toBe("browser-text-snapshot");
    expect(
      getGpuFlowBrowserStyleBlockedReasonFamily({
        family: "text-like-dom-control",
        reason: "live-dom-budget",
      }),
    ).toBe("browser-text-control");
    expect(
      getGpuFlowBrowserStyleBlockedReasonFamily({
        family: "compatible-previous",
        reason: "compatible-previous-budget-exceeded",
      }),
    ).toBe("browser-text-snapshot");
    expect(
      getGpuFlowBrowserStyleBlockedReasonFamily({
        family: "visible-transaction",
        reason: "held-previous-budget-exceeded",
      }),
    ).toBe("retained-page");
  });
});

function committedActor({
  active = false,
  actorFamily,
  kind,
  projectionCoverage,
}: {
  readonly active?: boolean | undefined;
  readonly actorFamily: string;
  readonly kind: string;
  readonly projectionCoverage?:
    | "blocked-awaiting-browser-visual"
    | "compatible-previous"
    | "exact-live-dom"
    | "exact-snapshot"
    | undefined;
}): CommittedActor {
  return {
    active,
    actorFamily,
    browserVisual: null,
    kind,
    textCoverageProof: projectionCoverage ? { projectionCoverage } : null,
  } as unknown as CommittedActor;
}
