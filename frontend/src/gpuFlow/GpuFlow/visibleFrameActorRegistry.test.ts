import { describe, expect, it } from "vitest";

import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import {
  getGpuFlowBrowserStyleBlockedReasonFamily,
  getGpuFlowBrowserStyleVisibleFrameActorFamily,
} from "./visibleFrameActorRegistry";

type PreparedActor = GpuFlowPreparedContentFrame["actorGenerations"][number];

describe("GPU Flow browser-style visible frame actor registry", () => {
  it("classifies text-like controls by their browser-owned presentation", () => {
    expect(
      getGpuFlowBrowserStyleVisibleFrameActorFamily(
        preparedActor({
          actorFamily: "text-like-dom-control",
          kind: "dom-control",
          projectionCoverage: "exact-live-dom",
        }),
      ),
    ).toBe("browser-text-control");
    expect(
      getGpuFlowBrowserStyleVisibleFrameActorFamily(
        preparedActor({
          actorFamily: "text-like-dom-control",
          kind: "dom-control",
          projectionCoverage: "exact-snapshot",
        }),
      ),
    ).toBe("browser-text-snapshot");
    expect(
      getGpuFlowBrowserStyleVisibleFrameActorFamily(
        preparedActor({
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
        preparedActor({
          actorFamily: "section-header",
          kind: "html-texture",
        }),
      ),
    ).toBe("section-header");
    expect(
      getGpuFlowBrowserStyleVisibleFrameActorFamily(
        preparedActor({
          actorFamily: "gpu-native-visual",
          kind: "gpu-native-visual",
        }),
      ),
    ).toBe("retained-native-visual");
    expect(
      getGpuFlowBrowserStyleVisibleFrameActorFamily(
        preparedActor({
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

function preparedActor({
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
}): PreparedActor {
  return {
    active,
    actorFamily,
    browserVisual: null,
    kind,
    textCoverageProof: projectionCoverage ? { projectionCoverage } : null,
  } as unknown as PreparedActor;
}
