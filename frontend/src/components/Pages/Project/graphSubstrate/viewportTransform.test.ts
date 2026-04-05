import { describe, expect, it } from "vitest";
import {
  centerViewportOnWorldPoint,
  fitViewportToWorldRect,
  screenDeltaToWorldDelta,
  screenPointToWorldPoint,
  translateViewport,
  worldDeltaToScreenDelta,
  worldPointToScreenPoint,
  zoomViewportAroundScreenPoint,
} from "./viewportTransform";

describe("viewportTransform", () => {
  it("round-trips world and screen points through the same viewport", () => {
    const viewport = { x: 120, y: -80, zoom: 2.5 };
    const worldPoint = { x: 48, y: 96 };

    const screenPoint = worldPointToScreenPoint(worldPoint, viewport);
    const roundTrip = screenPointToWorldPoint(screenPoint, viewport);

    expect(screenPoint).toEqual({ x: 240, y: 160 });
    expect(roundTrip).toEqual(worldPoint);
  });

  it("converts deltas without applying viewport translation", () => {
    const viewport = { x: 999, y: -999, zoom: 4 };
    const worldDelta = { x: 3, y: -2 };
    const screenDelta = worldDeltaToScreenDelta(worldDelta, viewport);

    expect(screenDelta).toEqual({ x: 12, y: -8 });
    expect(screenDeltaToWorldDelta(screenDelta, viewport)).toEqual(worldDelta);
  });

  it("recenters the viewport so a world point lands on the target screen point", () => {
    const viewport = { x: 0, y: 0, zoom: 1 };
    const nextViewport = centerViewportOnWorldPoint(viewport, {
      worldPoint: { x: 50, y: 20 },
      screenPoint: { x: 400, y: 300 },
      zoom: 2,
    });

    expect(nextViewport).toEqual({ x: 300, y: 260, zoom: 2 });
    expect(worldPointToScreenPoint({ x: 50, y: 20 }, nextViewport)).toEqual({
      x: 400,
      y: 300,
    });
  });

  it("keeps the anchor fixed when zooming around a screen point", () => {
    const viewport = { x: 100, y: 40, zoom: 2 };
    const anchorScreenPoint = { x: 320, y: 180 };
    const anchorWorldPoint = screenPointToWorldPoint(
      anchorScreenPoint,
      viewport,
    );

    const nextViewport = zoomViewportAroundScreenPoint(
      viewport,
      anchorScreenPoint,
      3,
    );

    expect(nextViewport).toEqual({ x: -10, y: -30, zoom: 3 });
    expect(worldPointToScreenPoint(anchorWorldPoint, nextViewport)).toEqual(
      anchorScreenPoint,
    );
  });

  it("translates the viewport in screen space without changing zoom", () => {
    const viewport = { x: 10, y: 20, zoom: 1.5 };

    expect(translateViewport(viewport, { x: -5, y: 15 })).toEqual({
      x: 5,
      y: 35,
      zoom: 1.5,
    });
  });

  it("fits bounds into the viewport center by default", () => {
    const viewport = fitViewportToWorldRect(
      { x: 10, y: 20, width: 200, height: 100 },
      { width: 1000, height: 600 },
      { minZoom: 0.1, maxZoom: 3, padding: 0.25 },
    );

    expect(viewport).toEqual({ x: 170, y: 90, zoom: 3 });
    expect(worldPointToScreenPoint({ x: 110, y: 70 }, viewport)).toEqual({
      x: 500,
      y: 300,
    });
    expect(screenPointToWorldPoint({ x: 500, y: 300 }, viewport)).toEqual({
      x: 110,
      y: 70,
    });
  });

  it("preserves the current zoom when fit math is capped at the current zoom", () => {
    const viewport = fitViewportToWorldRect(
      { x: 20, y: 40, width: 300, height: 200 },
      { width: 1000, height: 800 },
      {
        minZoom: 0.2,
        maxZoom: 2,
        padding: 0.1,
        currentZoom: 2,
        keepCurrentZoomIfPossible: true,
      },
    );

    expect(viewport).toEqual({ x: 160, y: 120, zoom: 2 });
  });

  it("supports fitting bounds to an offset visible center", () => {
    const viewport = fitViewportToWorldRect(
      { x: 0, y: 0, width: 200, height: 100 },
      { width: 1000, height: 600 },
      {
        minZoom: 0.1,
        maxZoom: 10,
        padding: 0,
        centerScreenPoint: { x: 620, y: 260 },
      },
    );

    expect(viewport).toEqual({ x: 120, y: 10, zoom: 5 });
  });
});
