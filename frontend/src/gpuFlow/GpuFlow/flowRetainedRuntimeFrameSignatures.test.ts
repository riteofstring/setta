import { describe, expect, it } from "vitest";

import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import { createGpuFlowRetainedRuntimeFrameSourceRenderSignature } from "./flowRetainedRuntimeFrameSignatures";

describe("GPU Flow retained runtime frame signatures", () => {
  it("does not treat retained scroll projection as source render work", () => {
    const base = createGpuFlowRetainedRuntimeFrameSourceRenderSignature(
      retainedFrame({ sectionScrollRevision: 1 }),
    );

    expect(
      createGpuFlowRetainedRuntimeFrameSourceRenderSignature(
        retainedFrame({ sectionScrollRevision: 2 }),
      ),
    ).toBe(base);
    expect(
      createGpuFlowRetainedRuntimeFrameSourceRenderSignature(
        retainedFrame({
          sectionScrollRevision: 2,
          sourceKey: "settings-control:updated",
        }),
      ),
    ).not.toBe(base);
  });
});

function retainedFrame({
  sectionScrollRevision,
  sourceKey = "settings-control",
}: {
  readonly sectionScrollRevision: number;
  readonly sourceKey?: string | undefined;
}): GpuRetainedRuntimeFrame {
  return {
    descriptors: {
      domControlSources: [
        {
          active: false,
          activation: undefined,
          clipChainRevision: "clip-1",
          geometryRevision: "geometry-1",
          layerSlot: "dom-control-plane",
          lifecycleState: "passive-projected",
          sectionScrollRevision,
          sourceId: "settings-control",
          sourceKey,
          valueStyleRevision: "value-style-1",
          viewportSampleRevision: "viewport-sample-1",
        },
      ],
    },
  } as unknown as GpuRetainedRuntimeFrame;
}
