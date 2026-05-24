import { describe, expect, it } from "vitest";

import {
  getGpuRetainedContentDateCalendarKeyboardCommand,
  resolveGpuRetainedContentDateCalendarKeyboard,
} from "./retainedContentDateCalendarKeyboard";
import { createGpuRetainedRowContentScene } from "./retainedContentScene";
import type { GpuContentSurface, GpuFlowScene } from "./scene";

describe("retained content date calendar keyboard", () => {
  it("moves the highlighted date from retained calendar metadata", () => {
    const result = resolveGpuRetainedContentDateCalendarKeyboard({
      command: requireDateCalendarCommand("ArrowRight"),
      scene: retainedContentScene(),
      target: {
        kind: "date-calendar",
        ownerRowId: "date-param",
        surfaceId: "surface-a",
      },
    });

    expect(result).toEqual({
      action: "highlight",
      handled: true,
      target: {
        highlightedDateIso: "2026-05-05",
        kind: "date-calendar",
        ownerRowId: "date-param",
        surfaceId: "surface-a",
        visibleMonth: { monthIndex: 4, year: 2026 },
      },
    });
  });

  it("keeps month keyboard navigation in retained popup state", () => {
    const result = resolveGpuRetainedContentDateCalendarKeyboard({
      command: requireDateCalendarCommand("PageDown"),
      scene: retainedContentScene({
        monthIndex: 0,
        selectedDateIso: "2026-01-31",
        year: 2026,
      }),
      target: {
        highlightedDateIso: "2026-01-31",
        kind: "date-calendar",
        ownerRowId: "date-param",
        surfaceId: "surface-a",
      },
    });

    expect(result).toEqual({
      action: "highlight",
      handled: true,
      target: {
        highlightedDateIso: "2026-02-28",
        kind: "date-calendar",
        ownerRowId: "date-param",
        surfaceId: "surface-a",
        visibleMonth: { monthIndex: 1, year: 2026 },
      },
    });
  });

  it("commits the highlighted date", () => {
    const result = resolveGpuRetainedContentDateCalendarKeyboard({
      command: requireDateCalendarCommand("Enter"),
      scene: retainedContentScene(),
      target: {
        highlightedDateIso: "2026-05-06",
        kind: "date-calendar",
        ownerRowId: "date-param",
        surfaceId: "surface-a",
      },
    });

    expect(result).toEqual({
      action: "commit",
      dateIso: "2026-05-06",
      handled: true,
      target: {
        highlightedDateIso: "2026-05-06",
        kind: "date-calendar",
        ownerRowId: "date-param",
        surfaceId: "surface-a",
        visibleMonth: { monthIndex: 4, year: 2026 },
      },
    });
  });
});

function requireDateCalendarCommand(key: string) {
  const command = getGpuRetainedContentDateCalendarKeyboardCommand({ key });
  if (!command) {
    throw new Error(`Expected retained date calendar command for ${key}.`);
  }
  return command;
}

function retainedContentScene({
  monthIndex = 4,
  selectedDateIso = "2026-05-04",
  year = 2026,
}: {
  readonly monthIndex?: number | undefined;
  readonly selectedDateIso?: string | undefined;
  readonly year?: number | undefined;
} = {}): GpuFlowScene {
  return {
    contentSurfaces: [
      retainedSurface({
        monthIndex,
        selectedDateIso,
        year,
      }),
    ],
    domIslands: [],
    edges: [],
    revision: 1,
    sections: [],
  };
}

function retainedSurface({
  monthIndex,
  selectedDateIso,
  year,
}: {
  readonly monthIndex: number;
  readonly selectedDateIso: string;
  readonly year: number;
}): GpuContentSurface {
  const rect = { height: 240, width: 260, x: 0, y: 0 };
  return {
    clipRect: rect,
    id: "surface-a",
    ownerSectionId: "section-a",
    rect,
    renderer: {
      kind: "canvas-content",
      surfaceId: "surface-a",
    },
    retainedScene: createGpuRetainedRowContentScene({
      id: "surface-a",
      ownerSectionId: "section-a",
      rowHeight: 28,
      rows: [
        {
          control: {
            calendar: {
              cells: calendarCells({
                monthIndex,
                selectedDateIso,
                year,
              }),
              includeTime: false,
              month: { monthIndex, year },
              monthTitle: "Test Month",
              selectedDates: [selectedDateIso],
              selectedTimeValue: "00:00",
              selectionMode: "multiple",
              summaryText: "1 selected",
              weekdayLabels: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
            },
            defaultDisplayValue: "",
            displayValue: selectedDateIso,
            kind: "date-time",
            label: "Calendar",
            mode: "date-calendar",
            rendererFamily: "date-time",
            summaryText: "1 selected",
            commitPolicy: "immediate",
          },
          controlKind: "date-time",
          depth: 0,
          id: "date-param",
          label: "Date",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: rect.height, width: rect.width, x: 0, y: 0 },
    }),
    zIndex: 1,
  };
}

function calendarCells({
  monthIndex,
  selectedDateIso,
  year,
}: {
  readonly monthIndex: number;
  readonly selectedDateIso: string;
  readonly year: number;
}) {
  const start = new Date(Date.UTC(year, monthIndex, 1));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const isoDate = date.toISOString().slice(0, 10);
    return {
      dayOfMonth: date.getUTCDate(),
      inCurrentMonth: date.getUTCMonth() === monthIndex,
      isoDate,
      selected: isoDate === selectedDateIso,
      today: false,
    };
  });
}
