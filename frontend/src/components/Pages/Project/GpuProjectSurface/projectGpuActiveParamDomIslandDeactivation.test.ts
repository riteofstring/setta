/* @vitest-environment jsdom */

import { SETTA_POPOVER_PORTAL_PARENT_ID } from "utils/constants";
import { describe, expect, it } from "vitest";

import { shouldClearProjectGpuActiveParamDomIslandOnPointerDown } from "./projectGpuActiveParamDomIslandDeactivation";
import { PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID } from "./projectGpuPortalAdapter";

describe("project GPU active param DOM island deactivation", () => {
  it("keeps active retained param DOM island pointer targets active", () => {
    const island = document.createElement("div");
    island.dataset.gpuFlowDomIsland = "true";
    const input = document.createElement("input");
    island.append(input);

    expect(shouldClearProjectGpuActiveParamDomIslandOnPointerDown(input)).toBe(
      false,
    );
  });

  it("keeps project-owned retained viewport portal pointer targets active", () => {
    const popoverRoot = document.createElement("div");
    popoverRoot.id = SETTA_POPOVER_PORTAL_PARENT_ID;
    const popoverOption = document.createElement("button");
    popoverRoot.append(popoverOption);

    const tooltipRoot = document.createElement("div");
    tooltipRoot.id = PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID;
    const tooltipItem = document.createElement("button");
    tooltipRoot.append(tooltipItem);

    expect(
      shouldClearProjectGpuActiveParamDomIslandOnPointerDown(popoverOption),
    ).toBe(false);
    expect(
      shouldClearProjectGpuActiveParamDomIslandOnPointerDown(tooltipItem),
    ).toBe(false);
  });

  it("clears active retained param DOM islands for canvas-owned targets", () => {
    const canvasOwnedTarget = document.createElement("canvas");

    expect(
      shouldClearProjectGpuActiveParamDomIslandOnPointerDown(canvasOwnedTarget),
    ).toBe(true);
  });
});
