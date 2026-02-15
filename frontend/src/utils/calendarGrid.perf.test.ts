import { CalendarWeekStartEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildCalendarMonthGrid, shiftCalendarMonth } from "./calendarGrid";

describe("calendar grid performance", () => {
  it("builds month grids repeatedly within budget", () => {
    const iterations = 24_000;
    let anchor = { year: 2026, monthIndex: 0 };
    let checksum = 0;
    const start = performance.now();

    for (let i = 0; i < iterations; i += 1) {
      const weekStart =
        i % 2 === 0
          ? CalendarWeekStartEnum.sunday
          : CalendarWeekStartEnum.monday;
      const grid = buildCalendarMonthGrid({
        year: anchor.year,
        monthIndex: anchor.monthIndex,
        weekStartsOn: weekStart,
      });
      checksum += grid[0]?.dayOfMonth ?? 0;
      checksum += grid[grid.length - 1]?.dayOfMonth ?? 0;
      anchor = shiftCalendarMonth(anchor, 1);
    }

    const elapsedMs = performance.now() - start;
    expect(checksum).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(1200);
  });
});
