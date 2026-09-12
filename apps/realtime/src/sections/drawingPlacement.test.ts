import { Ellipse, Line, Point, Polyline, Rect } from "fabric";
import { describe, expect, it } from "vitest";

import {
  createDrawingShapePlacement,
  updateDrawingShapePlacement,
} from "./drawingPlacement";

const DRAW_DIRECTIONS = [
  {
    end: new Point(180, 210),
    name: "down and right",
    start: new Point(80, 90),
  },
  {
    end: new Point(80, 210),
    name: "down and left",
    start: new Point(180, 90),
  },
  {
    end: new Point(180, 90),
    name: "up and right",
    start: new Point(80, 210),
  },
  {
    end: new Point(80, 90),
    name: "up and left",
    start: new Point(180, 210),
  },
] as const;

function expectPoint(actual: Point, expected: Point): void {
  expect(actual.x).toBeCloseTo(expected.x, 8);
  expect(actual.y).toBeCloseTo(expected.y, 8);
}

function shapeCorners(object: Rect | Ellipse): [Point, Point] {
  return [
    new Point(object.left, object.top),
    new Point(object.left + object.width, object.top + object.height),
  ];
}

function lineEndpoints(object: Line): [Point, Point] {
  const points = object.calcLinePoints();
  const transform = object.calcTransformMatrix();
  return [
    new Point(points.x1, points.y1).transform(transform),
    new Point(points.x2, points.y2).transform(transform),
  ];
}

function arrowEndpoint(object: Polyline, index: number): Point {
  const point = object.points[index]!;
  return new Point(
    point.x - object.pathOffset.x,
    point.y - object.pathOffset.y,
  ).transform(object.calcTransformMatrix());
}

describe("drawing shape placement", () => {
  for (const { end, name, start } of DRAW_DIRECTIONS) {
    it(`uses the drag endpoints as rectangle corners when dragging ${name}`, () => {
      const placement = createDrawingShapePlacement("rectangle", start);
      updateDrawingShapePlacement(placement, end);
      expect(placement.object).toBeInstanceOf(Rect);
      const rectangle = placement.object as Rect;
      const [minimum, maximum] = shapeCorners(rectangle);
      expectPoint(
        minimum,
        new Point(Math.min(start.x, end.x), Math.min(start.y, end.y)),
      );
      expectPoint(
        maximum,
        new Point(Math.max(start.x, end.x), Math.max(start.y, end.y)),
      );
    });

    it(`uses the drag endpoints as ellipse corners when dragging ${name}`, () => {
      const placement = createDrawingShapePlacement("ellipse", start);
      updateDrawingShapePlacement(placement, end);
      expect(placement.object).toBeInstanceOf(Ellipse);
      const ellipse = placement.object as Ellipse;
      const [minimum, maximum] = shapeCorners(ellipse);
      expectPoint(
        minimum,
        new Point(Math.min(start.x, end.x), Math.min(start.y, end.y)),
      );
      expectPoint(
        maximum,
        new Point(Math.max(start.x, end.x), Math.max(start.y, end.y)),
      );
    });

    it(`keeps line and arrow endpoints fixed when dragging ${name}`, () => {
      const linePlacement = createDrawingShapePlacement("line", start);
      updateDrawingShapePlacement(linePlacement, end);
      expect(linePlacement.object).toBeInstanceOf(Line);
      const [lineStart, lineEnd] = lineEndpoints(linePlacement.object as Line);
      expectPoint(lineStart, start);
      expectPoint(lineEnd, end);

      const arrowPlacement = createDrawingShapePlacement("arrow", start);
      updateDrawingShapePlacement(arrowPlacement, end);
      expect(arrowPlacement.object).toBeInstanceOf(Polyline);
      const arrow = arrowPlacement.object as Polyline;
      expectPoint(arrowEndpoint(arrow, 0), start);
      expectPoint(arrowEndpoint(arrow, 1), end);
    });
  }
});
