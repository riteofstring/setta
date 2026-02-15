import { DateCalendarWeekStartEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  buildCalendarMonthGrid,
  parseIsoDate,
  resolveCalendarAnchorDate,
  shiftCalendarMonth,
} from "./calendarGrid";

describe("calendarGrid utils", () => {
  it("parses strict ISO dates", () => {
    expect(parseIsoDate("2026-03-14")).toEqual({
      year: 2026,
      monthIndex: 2,
      day: 14,
    });
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("03/14/2026")).toBeNull();
  });

  it("resolves calendar anchors from selected date or today", () => {
    expect(resolveCalendarAnchorDate("2027-11-09")).toEqual({
      year: 2027,
      monthIndex: 10,
    });
    expect(
      resolveCalendarAnchorDate("", new Date("2026-05-18T12:00:00Z")),
    ).toEqual({
      year: 2026,
      monthIndex: 4,
    });
  });

  it("builds 6-week grids with week-start offsets", () => {
    const sundayGrid = buildCalendarMonthGrid({
      year: 2026,
      monthIndex: 2,
      weekStartsOn: DateCalendarWeekStartEnum.sunday,
    });
    expect(sundayGrid).toHaveLength(42);
    expect(sundayGrid[0]?.isoDate).toBe("2026-03-01");

    const mondayGrid = buildCalendarMonthGrid({
      year: 2026,
      monthIndex: 2,
      weekStartsOn: DateCalendarWeekStartEnum.monday,
    });
    expect(mondayGrid).toHaveLength(42);
    expect(mondayGrid[0]?.isoDate).toBe("2026-02-23");
  });

  it("shifts months across year boundaries", () => {
    expect(shiftCalendarMonth({ year: 2026, monthIndex: 11 }, 1)).toEqual({
      year: 2027,
      monthIndex: 0,
    });
    expect(shiftCalendarMonth({ year: 2026, monthIndex: 0 }, -1)).toEqual({
      year: 2025,
      monthIndex: 11,
    });
  });
});
