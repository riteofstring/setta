import { describe, expect, it } from "vitest";

import {
  createGpuRetainedRowContentScene,
  resolveGpuRetainedContentVisibleRowRange,
  type GpuRetainedContentRowInput,
} from "./retainedContentScene";

describe("retained content scene", () => {
  it("virtualizes retained rows from scroll offset and viewport height", () => {
    const rows = Array.from({ length: 1_000 }, (_, index) =>
      row(`param-${index}`),
    );

    const scene = createGpuRetainedRowContentScene({
      id: "surface-a",
      ownerSectionId: "section-a",
      overscanRows: 1,
      rowHeight: 20,
      rows,
      scrollOffset: { x: 0, y: 400 },
      viewportRect: { height: 60, width: 240, x: 0, y: 0 },
    });

    expect(scene.contentRect).toEqual({
      height: 20_000,
      width: 240,
      x: 0,
      y: 0,
    });
    expect(scene.visibleRange).toEqual({
      endIndex: 24,
      rowCount: 1_000,
      startIndex: 19,
    });
    expect(scene.rows.map((visibleRow) => visibleRow.id)).toEqual([
      "param-19",
      "param-20",
      "param-21",
      "param-22",
      "param-23",
    ]);
    expect(scene.rowOrder.slice(18, 25)).toEqual([
      "param-18",
      "param-19",
      "param-20",
      "param-21",
      "param-22",
      "param-23",
      "param-24",
    ]);
    expect(scene.rows[0]?.projectedRect).toEqual({
      height: 20,
      width: 240,
      x: 0,
      y: -20,
    });
    expect(scene.rows[4]?.projectedRect).toEqual({
      height: 20,
      width: 240,
      x: 0,
      y: 60,
    });
  });

  it("emits row draw commands, hit records, and local port anchors from one layout", () => {
    const scene = createGpuRetainedRowContentScene({
      controlWidth: 80,
      id: "surface-a",
      indentWidth: 10,
      ownerSectionId: "section-a",
      portHitSize: 10,
      rowHeight: 24,
      rows: [
        row("parent", { controlKind: "nested", depth: 0 }),
        row("child", {
          controlKind: "text-like",
          depth: 1,
          ports: [{ id: "child-input", kind: "input", side: "left" }],
          state: { selected: true },
        }),
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 48, width: 220, x: 4, y: 6 },
    });

    expect(scene.drawCommands).toEqual([
      expect.objectContaining({ kind: "row-background", rowId: "parent" }),
      expect.objectContaining({
        kind: "row-label",
        rect: { height: 24, width: 132, x: 4, y: 6 },
        rowId: "parent",
        text: "parent",
      }),
      expect.objectContaining({
        controlKind: "nested",
        kind: "row-control",
        rect: { height: 24, width: 80, x: 144, y: 6 },
        rowId: "parent",
      }),
      expect.objectContaining({
        kind: "row-background",
        rowId: "child",
        state: expect.objectContaining({ selected: true }),
      }),
      expect.objectContaining({
        depth: 1,
        kind: "nest-guide",
        rowId: "child",
      }),
      expect.objectContaining({
        kind: "row-label",
        rect: { height: 24, width: 122, x: 14, y: 30 },
        rowId: "child",
        text: "child",
      }),
      expect.objectContaining({
        controlKind: "text-like",
        kind: "row-control",
        rowId: "child",
      }),
    ]);
    expect(scene.hitRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "row:child",
          kind: "row",
          rect: { height: 24, width: 220, x: 4, y: 30 },
        }),
        expect.objectContaining({
          id: "label:child",
          kind: "label",
          rect: { height: 24, width: 122, x: 14, y: 30 },
        }),
        expect.objectContaining({
          id: "control:child",
          kind: "control",
          rect: { height: 24, width: 80, x: 144, y: 30 },
        }),
        expect.objectContaining({
          id: "port:child-input",
          kind: "port",
          rect: { height: 10, width: 10, x: -1, y: 37 },
        }),
      ]),
    );
    expect(scene.portAnchors).toEqual([
      {
        hitRect: { height: 10, width: 10, x: -1, y: 37 },
        id: "child-input",
        kind: "input",
        localPosition: { x: 4, y: 42 },
        ownerRowId: "child",
        side: "left",
      },
    ]);
  });

  it("emits retained drag state, drop markers, and preview commands", () => {
    const scene = createGpuRetainedRowContentScene({
      dragPreview: {
        draggingRowIds: ["param-a", "param-b"],
        dropMarker: { edge: "before", rowId: "param-c" },
        pointerLocal: { x: 40, y: 54 },
      },
      id: "surface-a",
      ownerSectionId: "section-a",
      rowHeight: 24,
      rows: [row("param-a"), row("param-b"), row("param-c")],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 72, width: 220, x: 0, y: 0 },
    });

    expect(
      scene.rows.map((visibleRow) => ({
        dragging: visibleRow.state.dragging,
        id: visibleRow.id,
      })),
    ).toEqual([
      { dragging: true, id: "param-a" },
      { dragging: true, id: "param-b" },
      { dragging: false, id: "param-c" },
    ]);
    expect(scene.drawCommands).toEqual(
      expect.arrayContaining([
        {
          edge: "before",
          kind: "row-drop-marker",
          rect: { height: 2, width: 212, x: 4, y: 47 },
          rowId: "param-c",
        },
        {
          kind: "row-drag-preview",
          rect: { height: 24, width: 204, x: 8, y: 42 },
          rowCount: 2,
          rowId: "param-a",
          text: "param-a",
        },
      ]),
    );
  });

  it("retains concrete switch control descriptors for canvas handlers", () => {
    const scene = createGpuRetainedRowContentScene({
      id: "surface-a",
      ownerSectionId: "section-a",
      rowHeight: 24,
      rows: [
        row("switch-param", {
          control: {
            checked: true,
            defaultDisplayValue: "false",
            displayValue: "true",
            kind: "switch",
            rendererFamily: "switch",
            commitPolicy: "immediate",
          },
          controlKind: "switch",
        }),
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 24, width: 220, x: 0, y: 0 },
    });

    expect(scene.rows[0]?.control).toEqual({
      checked: true,
      defaultDisplayValue: "false",
      displayValue: "true",
      kind: "switch",
      rendererFamily: "switch",
      commitPolicy: "immediate",
    });
    expect(scene.drawCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          control: expect.objectContaining({
            checked: true,
            kind: "switch",
            commitPolicy: "immediate",
          }),
          controlKind: "switch",
          kind: "row-control",
          rowId: "switch-param",
        }),
      ]),
    );
  });

  it("emits inset drop markers for retained inside-row drops", () => {
    const scene = createGpuRetainedRowContentScene({
      dragPreview: {
        draggingRowIds: ["param-a"],
        dropMarker: { edge: "inside", rowId: "parent" },
        pointerLocal: { x: 40, y: 16 },
      },
      id: "surface-a",
      indentWidth: 12,
      ownerSectionId: "section-a",
      rowHeight: 24,
      rows: [
        row("parent", { controlKind: "nested", depth: 0 }),
        row("param-a", { depth: 1 }),
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 48, width: 220, x: 0, y: 0 },
    });

    expect(scene.drawCommands).toEqual(
      expect.arrayContaining([
        {
          edge: "inside",
          kind: "row-drop-marker",
          rect: { height: 3, width: 200, x: 16, y: 17 },
          rowId: "parent",
        },
      ]),
    );
  });

  it("fails loudly for invalid retained row metrics", () => {
    expect(() =>
      resolveGpuRetainedContentVisibleRowRange({
        overscanRows: 0,
        rowCount: 10,
        rowHeight: 0,
        scrollOffsetY: 0,
        viewportHeight: 100,
      }),
    ).toThrow("retained row height must be a finite positive number.");
  });
});

function row(
  id: string,
  overrides: Partial<GpuRetainedContentRowInput> = {},
): GpuRetainedContentRowInput {
  return {
    controlKind: "text-like",
    depth: 0,
    id,
    label: id,
    ...overrides,
  };
}
