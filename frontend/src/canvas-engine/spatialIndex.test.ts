import { describe, expect, it } from "vitest";
import { CanvasEngineSpatialIndex } from "./spatialIndex";

describe("CanvasEngineSpatialIndex", () => {
  it("returns only intersecting ids for a query rectangle", () => {
    const index = new CanvasEngineSpatialIndex({ cellSize: 256 });
    index.upsert("a", { x: 0, y: 0, width: 120, height: 120 });
    index.upsert("b", { x: 300, y: 0, width: 120, height: 120 });
    index.upsert("c", { x: 0, y: 400, width: 120, height: 120 });

    const firstQuery = index.queryRect({
      x: -20,
      y: -20,
      width: 220,
      height: 220,
    });
    expect(firstQuery.sort()).toEqual(["a"]);

    const secondQuery = index.queryRect({
      x: 240,
      y: -20,
      width: 240,
      height: 220,
    });
    expect(secondQuery.sort()).toEqual(["b"]);
  });

  it("updates cell occupancy when a record moves", () => {
    const index = new CanvasEngineSpatialIndex({ cellSize: 128 });
    index.upsert("section-1", { x: 20, y: 20, width: 64, height: 64 });
    expect(
      index.queryRect({ x: 0, y: 0, width: 128, height: 128 }).sort(),
    ).toEqual(["section-1"]);

    index.upsert("section-1", { x: 400, y: 400, width: 64, height: 64 });
    expect(index.queryRect({ x: 0, y: 0, width: 128, height: 128 })).toEqual(
      [],
    );
    expect(
      index.queryRect({ x: 350, y: 350, width: 200, height: 200 }).sort(),
    ).toEqual(["section-1"]);
  });

  it("removes records cleanly", () => {
    const index = new CanvasEngineSpatialIndex({ cellSize: 128 });
    index.upsert("section-1", { x: 0, y: 0, width: 100, height: 100 });
    index.upsert("section-2", { x: 0, y: 0, width: 100, height: 100 });

    index.remove("section-1");
    expect(
      index.queryRect({ x: -5, y: -5, width: 150, height: 150 }).sort(),
    ).toEqual(["section-2"]);

    index.remove("section-2");
    expect(index.queryRect({ x: -5, y: -5, width: 150, height: 150 })).toEqual(
      [],
    );
  });
});
