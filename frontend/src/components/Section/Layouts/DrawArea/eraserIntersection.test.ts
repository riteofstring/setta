import { describe, expect, it } from "vitest";
import { filterEraserPath } from "./eraserIntersection";

const imageBounds = {
  minX: 10,
  maxX: 20,
  minY: 10,
  maxY: 20,
};

describe("filterEraserPath", () => {
  it("keeps the entry point before the first intersecting point", () => {
    expect(
      filterEraserPath(
        [
          [5, 15],
          [12, 15],
          [18, 15],
        ],
        4,
        "butt",
        imageBounds,
      ),
    ).toEqual([
      [5, 15],
      [12, 15],
      [18, 15],
    ]);
  });

  it("keeps one trailing point after the path exits the bounds", () => {
    expect(
      filterEraserPath(
        [
          [12, 15],
          [18, 15],
          [25, 15],
        ],
        4,
        "butt",
        imageBounds,
      ),
    ).toEqual([
      [12, 15],
      [18, 15],
      [25, 15],
    ]);
  });

  it("includes square line-cap overlap even when the point center stays outside", () => {
    expect(
      filterEraserPath(
        [
          [6, 15],
          [8, 15],
        ],
        4,
        "square",
        imageBounds,
      ),
    ).toEqual([
      [6, 15],
      [8, 15],
    ]);
  });
});
