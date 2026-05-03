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

  it("retains concrete slider control descriptors for canvas handlers", () => {
    const scene = createGpuRetainedRowContentScene({
      id: "surface-a",
      ownerSectionId: "section-a",
      rowHeight: 24,
      rows: [
        row("slider-param", {
          control: {
            defaultDisplayValue: "0",
            displayValue: "6",
            kind: "slider",
            rendererFamily: "slider",
            commitPolicy: "preview-commit",
            max: 10,
            min: 0,
            step: 2,
            value: 6,
          },
          controlKind: "slider",
        }),
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 24, width: 220, x: 0, y: 0 },
    });

    expect(scene.rows[0]?.control).toEqual({
      defaultDisplayValue: "0",
      displayValue: "6",
      kind: "slider",
      rendererFamily: "slider",
      commitPolicy: "preview-commit",
      max: 10,
      min: 0,
      step: 2,
      value: 6,
    });
    expect(scene.drawCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          control: expect.objectContaining({
            kind: "slider",
            commitPolicy: "preview-commit",
            value: 6,
          }),
          controlKind: "slider",
          kind: "row-control",
          rowId: "slider-param",
        }),
      ]),
    );
  });

  it("emits retained configured color picker descriptors and popup option hits", () => {
    const scene = createGpuRetainedRowContentScene({
      activePopup: { kind: "color-picker", ownerRowId: "color-param" },
      id: "surface-a",
      ownerSectionId: "section-a",
      rowHeight: 24,
      rows: [
        row("color-param", {
          control: {
            choices: [
              { color: "#ef4444", description: "Red" },
              { color: "#22c55e", description: "Green" },
            ],
            defaultDisplayValue: "#ef4444",
            displayValue: "#22c55e",
            kind: "color-picker",
            rendererFamily: "color-picker",
            commitPolicy: "immediate",
            selectedIndex: 1,
          },
          controlKind: "color-picker",
        }),
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 96, width: 220, x: 0, y: 0 },
    });

    expect(scene.rows[0]?.control).toEqual({
      choices: [
        { color: "#ef4444", description: "Red" },
        { color: "#22c55e", description: "Green" },
      ],
      defaultDisplayValue: "#ef4444",
      displayValue: "#22c55e",
      kind: "color-picker",
      rendererFamily: "color-picker",
      commitPolicy: "immediate",
      selectedIndex: 1,
    });
    expect(scene.drawCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          control: expect.objectContaining({
            choices: expect.arrayContaining([
              { color: "#22c55e", description: "Green" },
            ]),
            kind: "color-picker",
            commitPolicy: "immediate",
          }),
          controlKind: "color-picker",
          kind: "row-control",
          rowId: "color-param",
        }),
        expect.objectContaining({
          kind: "control-popup-background",
          rowId: "color-param",
        }),
        expect.objectContaining({
          kind: "control-popup-option",
          option: { color: "#22c55e", description: "Green" },
          optionIndex: 1,
          rowId: "color-param",
          selected: true,
        }),
      ]),
    );
    expect(scene.hitRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "popup-option:color-param:1",
          kind: "popup-option",
          optionIndex: 1,
          optionValue: "#22c55e",
          ownerRowId: "color-param",
        }),
      ]),
    );
  });

  it("emits retained dropdown descriptors and popup option hits", () => {
    const scene = createGpuRetainedRowContentScene({
      activePopup: { kind: "dropdown", ownerRowId: "dropdown-param" },
      id: "surface-a",
      ownerSectionId: "section-a",
      rowHeight: 24,
      rows: [
        row("dropdown-param", {
          control: {
            choices: [
              { label: "Small", value: "small" },
              { label: "Large", value: "large" },
            ],
            defaultDisplayValue: "small",
            displayValue: "large",
            kind: "dropdown",
            rendererFamily: "dropdown",
            commitPolicy: "immediate",
            selectedIndex: 1,
          },
          controlKind: "dropdown",
        }),
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 96, width: 220, x: 0, y: 0 },
    });

    expect(scene.rows[0]?.control).toEqual({
      choices: [
        { label: "Small", value: "small" },
        { label: "Large", value: "large" },
      ],
      defaultDisplayValue: "small",
      displayValue: "large",
      kind: "dropdown",
      rendererFamily: "dropdown",
      commitPolicy: "immediate",
      selectedIndex: 1,
    });
    expect(scene.drawCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          control: expect.objectContaining({
            choices: expect.arrayContaining([
              { label: "Large", value: "large" },
            ]),
            kind: "dropdown",
            commitPolicy: "immediate",
          }),
          controlKind: "dropdown",
          kind: "row-control",
          rowId: "dropdown-param",
        }),
        expect.objectContaining({
          kind: "control-popup-option",
          option: { label: "Large", value: "large" },
          optionIndex: 1,
          rowId: "dropdown-param",
          selected: true,
        }),
      ]),
    );
    expect(scene.hitRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "popup-option:dropdown-param:1",
          kind: "popup-option",
          optionIndex: 1,
          optionValue: "large",
          ownerRowId: "dropdown-param",
        }),
      ]),
    );
  });

  it("retains concrete password descriptors for closed canvas fields", () => {
    const scene = createGpuRetainedRowContentScene({
      id: "surface-a",
      ownerSectionId: "section-a",
      rowHeight: 24,
      rows: [
        row("password-param", {
          control: {
            defaultDisplayValue: "",
            displayValue: "",
            hasSecret: true,
            kind: "password",
            placeholder: "Saved",
            rendererFamily: "password",
            revealAvailable: true,
            commitPolicy: "native-island",
          },
          controlKind: "password",
        }),
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 24, width: 220, x: 0, y: 0 },
    });

    expect(scene.rows[0]?.control).toEqual({
      defaultDisplayValue: "",
      displayValue: "",
      hasSecret: true,
      kind: "password",
      placeholder: "Saved",
      rendererFamily: "password",
      revealAvailable: true,
      commitPolicy: "native-island",
    });
    expect(scene.drawCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          control: expect.objectContaining({
            hasSecret: true,
            kind: "password",
            placeholder: "Saved",
            revealAvailable: true,
          }),
          controlKind: "password",
          kind: "row-control",
          rowId: "password-param",
        }),
      ]),
    );
  });

  it("retains concrete dropzone descriptors for closed canvas displays", () => {
    const scene = createGpuRetainedRowContentScene({
      id: "surface-a",
      ownerSectionId: "section-a",
      rowHeight: 24,
      rows: [
        row("dropzone-param", {
          control: {
            attachments: [
              {
                id: "artifact-a",
                kind: "file",
                name: "input.csv",
                sizeLabel: "2 KB",
              },
            ],
            canAttachMore: false,
            defaultDisplayValue: "",
            displayValue: '{"attachments":[]}',
            kind: "dropzone",
            label: "1 attachment",
            maxAttachments: 1,
            mode: "STATEFUL",
            placeholder: "Drop a file here",
            remainingSlots: 0,
            rendererFamily: "dropzone",
            commitPolicy: "native-island",
          },
          controlKind: "dropzone",
        }),
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 24, width: 220, x: 0, y: 0 },
    });

    expect(scene.rows[0]?.control).toEqual({
      attachments: [
        {
          id: "artifact-a",
          kind: "file",
          name: "input.csv",
          sizeLabel: "2 KB",
        },
      ],
      canAttachMore: false,
      defaultDisplayValue: "",
      displayValue: '{"attachments":[]}',
      kind: "dropzone",
      label: "1 attachment",
      maxAttachments: 1,
      mode: "STATEFUL",
      placeholder: "Drop a file here",
      remainingSlots: 0,
      rendererFamily: "dropzone",
      commitPolicy: "native-island",
    });
    expect(scene.drawCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          control: expect.objectContaining({
            attachments: expect.arrayContaining([
              {
                id: "artifact-a",
                kind: "file",
                name: "input.csv",
                sizeLabel: "2 KB",
              },
            ]),
            kind: "dropzone",
            commitPolicy: "native-island",
          }),
          controlKind: "dropzone",
          kind: "row-control",
          rowId: "dropzone-param",
        }),
      ]),
    );
    expect(scene.hitRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attachmentId: "artifact-a",
          attachmentIndex: 0,
          id: "control-subpart:dropzone-param:dropzone-attachment-delete:artifact-a",
          kind: "control-subpart",
          ownerRowId: "dropzone-param",
          subpartKind: "dropzone-attachment-delete",
        }),
      ]),
    );
  });

  it("retains concrete date/time descriptors for closed canvas displays", () => {
    const scene = createGpuRetainedRowContentScene({
      id: "surface-a",
      ownerSectionId: "section-a",
      rowHeight: 24,
      rows: [
        row("date-param", {
          control: {
            calendar: null,
            defaultDisplayValue: "",
            displayValue: "May 4, 2026",
            kind: "date-time",
            label: "Calendar",
            mode: "date-calendar",
            rendererFamily: "date-time",
            summaryText: "May 4, 2026",
            commitPolicy: "immediate",
          },
          controlKind: "date-time",
        }),
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 24, width: 220, x: 0, y: 0 },
    });

    expect(scene.rows[0]?.control).toEqual({
      calendar: null,
      defaultDisplayValue: "",
      displayValue: "May 4, 2026",
      kind: "date-time",
      label: "Calendar",
      mode: "date-calendar",
      rendererFamily: "date-time",
      summaryText: "May 4, 2026",
      commitPolicy: "immediate",
    });
    expect(scene.drawCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          control: expect.objectContaining({
            kind: "date-time",
            mode: "date-calendar",
            summaryText: "May 4, 2026",
          }),
          controlKind: "date-time",
          kind: "row-control",
          rowId: "date-param",
        }),
      ]),
    );
  });

  it("emits retained date calendar popup commands and cell hits", () => {
    const scene = createGpuRetainedRowContentScene({
      activePopup: { kind: "date-calendar", ownerRowId: "date-param" },
      id: "surface-a",
      ownerSectionId: "section-a",
      rowHeight: 24,
      rows: [
        row("date-param", {
          control: {
            calendar: {
              cells: calendarCells("2026-05-04"),
              includeTime: false,
              monthTitle: "May 2026",
              selectedDates: ["2026-05-04"],
              selectedTimeValue: "00:00",
              selectionMode: "single",
              summaryText: "2026-05-04",
              weekdayLabels: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
            },
            defaultDisplayValue: "",
            displayValue: "2026-05-04",
            kind: "date-time",
            label: "Calendar",
            mode: "date-calendar",
            rendererFamily: "date-time",
            summaryText: "2026-05-04",
            commitPolicy: "immediate",
          },
          controlKind: "date-time",
        }),
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 260, width: 260, x: 0, y: 0 },
    });

    expect(scene.drawCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "control-popup-date-calendar-header",
          monthTitle: "May 2026",
          rowId: "date-param",
        }),
        expect.objectContaining({
          kind: "control-popup-date-calendar-weekday",
          rowId: "date-param",
          text: "Sun",
        }),
        expect.objectContaining({
          cell: expect.objectContaining({
            isoDate: "2026-05-04",
            selected: true,
          }),
          kind: "control-popup-date-calendar-cell",
          rowId: "date-param",
        }),
        expect.objectContaining({
          kind: "control-popup-date-calendar-summary",
          rowId: "date-param",
          text: "2026-05-04",
        }),
      ]),
    );
    expect(scene.hitRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cellIsoDate: "2026-05-04",
          id: "popup-date-cell:date-param:2026-05-04",
          kind: "popup-date-cell",
          ownerRowId: "date-param",
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

function calendarCells(selectedIsoDate: string) {
  return Array.from({ length: 42 }, (_, index) => {
    const day = index + 1;
    const isoDate = `2026-05-${String(day).padStart(2, "0")}`;
    return {
      dayOfMonth: day,
      inCurrentMonth: true,
      isoDate,
      selected: isoDate === selectedIsoDate,
      today: false,
    };
  });
}
