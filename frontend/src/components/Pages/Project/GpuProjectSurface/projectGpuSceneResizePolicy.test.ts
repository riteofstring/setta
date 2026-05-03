import { describe, expect, it } from "vitest";

import { getProjectSectionSceneResizeDirections } from "./projectGpuSceneResizePolicy";

describe("project GPU scene resize policy", () => {
  it("maps enabled resize axes to scene resize handle directions", () => {
    expect(
      getProjectSectionSceneResizeDirections({
        bottom: true,
        bottomLeft: true,
        bottomRight: true,
        left: true,
        right: true,
        top: true,
        topLeft: true,
        topRight: true,
      }),
    ).toEqual(["right", "bottom", "bottomRight"]);
  });
});
