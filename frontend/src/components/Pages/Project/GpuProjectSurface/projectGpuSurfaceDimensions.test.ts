/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { getProjectSurfaceClientDimensions } from "./projectGpuSurfaceDimensions";

describe("project GPU surface dimensions", () => {
  it("derives initial viewport dimensions from client dimensions without screen rects", () => {
    const surface = document.createElement("div");
    Object.defineProperties(surface, {
      clientHeight: { configurable: true, value: 480 },
      clientWidth: { configurable: true, value: 640 },
    });
    surface.getBoundingClientRect = () => {
      throw new Error("project surface dimensions must not read screen rects");
    };

    expect(getProjectSurfaceClientDimensions(surface)).toEqual({
      height: 480,
      width: 640,
    });
  });
});
