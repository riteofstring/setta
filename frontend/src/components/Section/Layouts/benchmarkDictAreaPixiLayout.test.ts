import { describe, expect, it } from "vitest";
import { buildBenchmarkDictAreaPixiLayout } from "./benchmarkDictAreaPixiLayout";
import type { BenchmarkDictAreaScenePacket } from "./dictAreaScenePackets";

const SCENE_PACKET: BenchmarkDictAreaScenePacket = {
  edgeSummary: {
    inputPortCount: 3,
    outputPortCount: 2,
  },
  paramAreas: [
    {
      grow: false,
      id: "pinned",
      rowCount: 2,
      rows: [
        {
          depth: 0,
          id: "group-row",
          kind: "group",
          label: "Pinned Group",
        },
        {
          depth: 1,
          id: "value-row",
          kind: "value",
          label: "Pinned Value",
        },
      ],
      title: "Pinned Params",
    },
    {
      grow: true,
      id: "unpinned",
      rowCount: 1,
      rows: [
        {
          depth: 2,
          id: "deep-value-row",
          kind: "value",
          label: "Deep Value",
        },
      ],
      title: "Params",
    },
  ],
};

describe("buildBenchmarkDictAreaPixiLayout", () => {
  it("stacks the benchmark shell, edge summary, and param areas in a stable order", () => {
    const layout = buildBenchmarkDictAreaPixiLayout({
      scenePacket: SCENE_PACKET,
      width: 480,
    });

    // The Pixi scene must keep the benchmark shell blocks in the same top-down
    // order as the old DOM shell so the stage remains visually comparable.
    expect(layout.toolbar.y).toBe(0);
    expect(layout.edgeSummary.y).toBe(44);
    expect(layout.paramAreas.map((paramArea) => paramArea.id)).toEqual([
      "pinned",
      "unpinned",
    ]);
    expect(layout.paramAreas[0]?.y).toBe(88);
    expect(layout.paramAreas[1]?.y).toBe(180);
    expect(layout.totalRowCount).toBe(3);
    expect(layout.canvasHeight).toBe(242);
  });

  it("derives deterministic row offsets, indentation, and group tagging from the scene packet", () => {
    const layout = buildBenchmarkDictAreaPixiLayout({
      scenePacket: SCENE_PACKET,
      width: 480,
    });
    const pinnedRows = layout.paramAreas[0]?.rows ?? [];

    // The layout helper is the testable source of truth for where Pixi will
    // paint each row once the DOM row list is replaced by the scene canvas.
    expect(pinnedRows.map((row) => row.id)).toEqual(["group-row", "value-row"]);
    expect(pinnedRows[0]).toMatchObject({
      groupTag: "Group",
      labelX: 28,
      x: 12,
      y: 124,
    });
    expect(pinnedRows[1]).toMatchObject({
      groupTag: null,
      labelX: 40,
      x: 24,
      y: 146,
    });
    expect(layout.paramAreas[1]?.rows[0]).toMatchObject({
      labelX: 52,
      x: 36,
      y: 216,
    });
  });
});
