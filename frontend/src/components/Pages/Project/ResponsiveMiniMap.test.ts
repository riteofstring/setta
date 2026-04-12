import { describe, expect, it } from "vitest";
import { getResponsiveMiniMapPlacement } from "./ResponsiveMiniMap";

describe("getResponsiveMiniMapPlacement", () => {
  it("offsets the minimap from the overview pane when docked on the left", () => {
    expect(
      getResponsiveMiniMapPlacement({
        minimapSide: "left",
        overviewWidth: 320,
        uiEditorWidth: 280,
      }),
    ).toEqual({
      position: "bottom-left",
      transform: "translateX(320px)",
    });
  });

  it("offsets the minimap from the ui editor when docked on the right", () => {
    expect(
      getResponsiveMiniMapPlacement({
        minimapSide: "right",
        overviewWidth: 320,
        uiEditorWidth: 280,
      }),
    ).toEqual({
      position: "bottom-right",
      transform: "translateX(-280px)",
    });
  });
});
