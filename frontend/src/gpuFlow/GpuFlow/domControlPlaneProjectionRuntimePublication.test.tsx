/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import { createGpuFlowViewportStore } from "../viewportStore";
import { createGpuFlowBrowserVisualActorRuntime } from "./browserVisualActorRuntime";
import {
  createMockViewportRuntime,
  domControl,
  retainedDisplayFrame,
  retainedRuntimeFrame,
} from "./domControlPlaneProjectionRuntimeTestUtils";

describe("GPU flow DOM control projection runtime publication", () => {
  it("marks runtime-projected outside-viewport controls as coverage-required", () => {
    const browserVisualRuntime = createGpuFlowBrowserVisualActorRuntime();
    const controls = Array.from({ length: 80 }, (_, index) =>
      domControl({
        index,
        projectionVisibility: "outside-viewport",
        value: `value-${index}`,
        visualPolicy: "outside-viewport",
      }),
    );
    const control = controls[0];
    if (!control) {
      throw new Error("Expected a projected DOM-control fixture.");
    }
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 60,
      transform: [0, 0, 1],
      width: 400,
    });
    browserVisualRuntime.setDomControlProjectionEnvironment({
      getRetainedScrollOffset: undefined,
      viewportRuntime,
      viewportStore,
    });

    const candidate = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 1,
        retainedRuntimeFrame: retainedRuntimeFrame(controls),
      }),
    });

    expect(
      candidate.readiness.domControlReadinessByActorId.get(control.sourceId),
    ).toEqual(
      expect.objectContaining({
        coverageState: "blocked-awaiting-live-host",
        projectionCoverageRequired: true,
      }),
    );
  });

  it("prepares browser visual projection from the publication sample viewport", () => {
    const browserVisualRuntime = createGpuFlowBrowserVisualActorRuntime();
    const controls = Array.from({ length: 80 }, (_, index) =>
      domControl({ index, value: `value-${index}` }),
    );
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 60,
      transform: [0, 0, 1],
      width: 400,
    });
    browserVisualRuntime.setDomControlProjectionEnvironment({
      getRetainedScrollOffset: undefined,
      viewportRuntime,
      viewportStore,
    });

    const candidate = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: 1,
        retainedRuntimeFrame: retainedRuntimeFrame(controls),
      }),
      viewport: { x: 0, y: -560, zoom: 1 },
    });

    const assignmentByControlId = new Map(
      candidate.snapshot.domControls.assignments.map((assignment) => [
        assignment.control.sourceId,
        assignment,
      ]),
    );
    expect(assignmentByControlId.get("source-20")).toEqual(
      expect.objectContaining({
        coverageState: "live",
        reason: "visible-live",
      }),
    );
  });
});
