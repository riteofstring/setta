import { describe, expect, it } from "vitest";

import { createGpuFlowLayoutStore } from "gpuFlow/layoutStore";
import { createGpuFlowViewportStore } from "gpuFlow/viewportStore";
import { fitGpuControlsViewFromLayoutStore } from "./ProjectGpuControls";

describe("ProjectGpuControls fit view", () => {
  it("fits the viewport from layout-store bounds", () => {
    const viewportStore = createGpuFlowViewportStore({
      height: 600,
      transform: [0, 0, 1],
      width: 800,
    });
    const layoutStore = createGpuFlowLayoutStore({
      nodes: [
        {
          height: 100,
          nodeId: "section-a",
          width: 200,
          x: 100,
          y: 50,
        },
      ],
    });

    expect(
      fitGpuControlsViewFromLayoutStore({
        duration: 0,
        layoutStore,
        overviewWidth: 0,
        viewportStore,
      }),
    ).toBe(true);
    expect(viewportStore.getState().transform).not.toEqual([0, 0, 1]);
  });

  it("does not fit when the layout store has no measured bounds", () => {
    const viewportStore = createGpuFlowViewportStore({
      height: 600,
      transform: [0, 0, 1],
      width: 800,
    });
    const layoutStore = createGpuFlowLayoutStore();

    expect(
      fitGpuControlsViewFromLayoutStore({
        duration: 0,
        layoutStore,
        overviewWidth: 0,
        viewportStore,
      }),
    ).toBe(false);
    expect(viewportStore.getState().transform).toEqual([0, 0, 1]);
  });
});
