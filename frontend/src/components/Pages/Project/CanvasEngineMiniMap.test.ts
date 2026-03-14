import { describe, expect, it } from "vitest";
import {
  getCanvasEngineMiniMapViewportTransformForCenter,
  getCanvasEngineMiniMapWorldPoint,
} from "./CanvasEngineMiniMap";

describe("CanvasEngineMiniMap", () => {
  it("maps client coordinates into minimap world coordinates", () => {
    expect(
      getCanvasEngineMiniMapWorldPoint({
        clientX: 120,
        clientY: 90,
        bounds: {
          left: 20,
          top: 30,
          width: 200,
          height: 150,
        },
        viewBox: {
          x: -100,
          y: -50,
          width: 400,
          height: 300,
        },
      }),
    ).toEqual({
      x: 100,
      y: 70,
    });
  });

  it("derives a viewport transform that centers a world point in the visible pane", () => {
    expect(
      getCanvasEngineMiniMapViewportTransformForCenter({
        worldX: 480,
        worldY: 320,
        zoom: 1.5,
        viewportWidth: 1200,
        viewportHeight: 800,
        overviewWidth: 280,
      }),
    ).toEqual({
      x: 160,
      y: -80,
      zoom: 1.5,
    });
  });
});
