import { describe, expect, it } from "vitest";

import type { GpuFlowCommittedSurfaceFrame } from "./committedSurfaceFrame";
import { createGpuFlowCommittedSurfaceRuntime } from "./committedSurfaceRuntime";
import type { GpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";

describe("GPU Flow committed surface runtime", () => {
  it("notifies committed-frame subscribers for render-signature deduped frames", () => {
    const startupFrame = committedFrame({ displayFrameId: 1 });
    const runtime = createGpuFlowCommittedSurfaceRuntime(startupFrame);
    let committedFrameUpdates = 0;
    let semanticUpdates = 0;
    runtime.subscribeCommittedContentFrame(() => {
      committedFrameUpdates += 1;
    });
    runtime.subscribeReactSemanticSnapshot(() => {
      semanticUpdates += 1;
    });

    const transformOnlyFrame = committedFrame({ displayFrameId: 2 });
    expect(runtime.publishCommittedContentFrame(transformOnlyFrame)).toBe(
      false,
    );

    expect(runtime.getCommittedContentFrame()).toBe(transformOnlyFrame);
    expect(runtime.getReactSemanticSnapshot().frame).toBe(startupFrame);
    expect(committedFrameUpdates).toBe(1);
    expect(semanticUpdates).toBe(0);
  });

  it("keeps startup committed-frame subscribers current when semantic identity is unchanged", () => {
    const startupFrame = committedFrame({ displayFrameId: 1 });
    const runtime = createGpuFlowCommittedSurfaceRuntime(startupFrame);
    let committedFrameUpdates = 0;
    let semanticUpdates = 0;
    runtime.subscribeCommittedContentFrame(() => {
      committedFrameUpdates += 1;
    });
    runtime.subscribeReactSemanticSnapshot(() => {
      semanticUpdates += 1;
    });

    const nextStartupFrame = committedFrame({ displayFrameId: 2 });
    runtime.setStartupFrame(nextStartupFrame);

    expect(runtime.getCommittedContentFrame()).toBe(nextStartupFrame);
    expect(runtime.getReactSemanticSnapshot().frame).toBe(startupFrame);
    expect(committedFrameUpdates).toBe(1);
    expect(semanticUpdates).toBe(0);
  });
});

function committedFrame({
  displayFrameId,
}: {
  readonly displayFrameId: number;
}): GpuFlowCommittedSurfaceFrame {
  return {
    actorGenerations: [],
    displayFrameId,
    retainedRuntimeFrame: {
      descriptors: {
        domControlSources: [],
        htmlSurfaceNativeVisuals: [],
        nativeDomIslands: [],
      },
      frameId: displayFrameId,
      input: {
        sceneRevision: 1,
        scrollRevision: 0,
        viewport: [0, 0, 1],
      },
    } as unknown as GpuRetainedRuntimeFrame,
    sceneRevision: 1,
  } as GpuFlowCommittedSurfaceFrame;
}
