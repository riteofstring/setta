/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import { createGpuFlowViewportStore } from "../viewportStore";
import { createGpuFlowBrowserVisualActorRuntime } from "./browserVisualActorRuntime";
import {
  committedSurfaceFrame,
  createMockViewportRuntime,
  domControl,
  publicationToken,
  retainedDisplayFrame,
  retainedRuntimeFrame,
  stageBrowserVisualCandidate,
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

  it("keeps deferred visible snapshot updates pending until a subscriber attaches", async () => {
    const browserVisualRuntime = createGpuFlowBrowserVisualActorRuntime();
    const control = domControl({ index: 0 });
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 60,
      transform: [0, 0, 1],
      width: 400,
    });
    const frame = committedSurfaceFrame({
      displayFrameId: 1,
      retainedRuntimeFrame: retainedRuntimeFrame([control]),
    });
    browserVisualRuntime.setDomControlProjectionEnvironment({
      getRetainedScrollOffset: undefined,
      viewportRuntime,
      viewportStore,
    });
    const candidate = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: frame.displayFrameId,
        retainedRuntimeFrame: frame.retainedRuntimeFrame,
      }),
    });

    browserVisualRuntime.commitPreparedBrowserVisualActors({
      candidate,
      token: publicationToken(frame),
    });
    await nextMicrotask();

    const emittedFrameIds: number[] = [];
    browserVisualRuntime.subscribe(() => {
      emittedFrameIds.push(
        browserVisualRuntime.getSnapshot().frameIds.committedFrameId,
      );
    });

    expect(emittedFrameIds).toEqual([]);
    await nextMicrotask();
    expect(emittedFrameIds).toEqual([1]);
  });

  it("does not render preparation hosts again during visible commit", () => {
    const browserVisualRuntime = createGpuFlowBrowserVisualActorRuntime();
    const control = domControl({ index: 0 });
    const viewportRuntime = createMockViewportRuntime([0, 0, 1]);
    const viewportStore = createGpuFlowViewportStore({
      height: 60,
      transform: [0, 0, 1],
      width: 400,
    });
    const frame = committedSurfaceFrame({
      displayFrameId: 1,
      retainedRuntimeFrame: retainedRuntimeFrame([control]),
    });
    const renderedRuntimeFrameIds: Array<number | string | null> = [];
    browserVisualRuntime.setDomControlPreparationHostRenderer((snapshot) => {
      renderedRuntimeFrameIds.push(snapshot.frameIds.runtimeFrameId);
    });
    browserVisualRuntime.setDomControlProjectionEnvironment({
      getRetainedScrollOffset: undefined,
      viewportRuntime,
      viewportStore,
    });
    const candidate = browserVisualRuntime.prepareCommittedSurfaceFrame({
      retainedDisplayFrame: retainedDisplayFrame({
        id: frame.displayFrameId,
        retainedRuntimeFrame: frame.retainedRuntimeFrame,
      }),
    });

    stageBrowserVisualCandidate({ browserVisualRuntime, candidate });
    expect(renderedRuntimeFrameIds).toHaveLength(2);

    browserVisualRuntime.commitPreparedBrowserVisualActors({
      candidate,
      token: publicationToken(frame),
    });

    expect(renderedRuntimeFrameIds).toHaveLength(2);
  });
});

async function nextMicrotask(): Promise<void> {
  await Promise.resolve();
}
