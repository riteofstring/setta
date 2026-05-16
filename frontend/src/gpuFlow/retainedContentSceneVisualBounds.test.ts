import { describe, expect, it } from "vitest";

import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import { row } from "./retainedContentScene.helpers.test";

describe("retained content scene row visual bounds", () => {
  it("uses explicit row visual bounds for row background and hit targets", () => {
    const scene = createGpuRetainedRowContentScene({
      controlWidth: 80,
      id: "surface-a",
      ownerSectionId: "section-a",
      rowHeight: 24,
      rowVisualBounds: { width: 260, x: 10 },
      rows: [row("param-a", { controlKind: "text-like" })],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 24, width: 220, x: 4, y: 6 },
    });

    expect(scene.rows[0]).toMatchObject({
      projectedRect: { height: 24, width: 220, x: 4, y: 6 },
      visualProjectedRect: { height: 24, width: 260, x: 14, y: 6 },
    });
    expect(scene.drawCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "row-background",
          rect: { height: 24, width: 260, x: 14, y: 6 },
          rowId: "param-a",
        }),
        expect.objectContaining({
          kind: "row-label",
          rect: expect.objectContaining({ width: 132, x: 4 }),
          rowId: "param-a",
        }),
      ]),
    );
    expect(scene.hitRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "row:param-a",
          rect: { height: 24, width: 260, x: 14, y: 6 },
        }),
        expect.objectContaining({
          id: "label:param-a",
          rect: expect.objectContaining({ width: 132, x: 4 }),
        }),
      ]),
    );
  });
});
