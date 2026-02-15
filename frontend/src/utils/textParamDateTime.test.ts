import {
  DateDisplayFormatEnum,
  TimeDisplayFormatEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  combineIsoDateAndTimeParts,
  formatDateForDisplay,
  formatDateTimeForDisplay,
  formatTimeForDisplay,
  getLocalTodayIsoDate,
  normalizeDateTimeToLocalIso,
  normalizeDateToIso,
  normalizeTimeTo24Hour,
  splitIsoDateAndTimeParts,
} from "./textParamDateTime";

describe("textParamDateTime", () => {
  it("normalizes 12-hour time input to 24-hour storage format", () => {
    expect(normalizeTimeTo24Hour("1:05 PM")).toBe("13:05");
    expect(normalizeTimeTo24Hour("12:15 AM")).toBe("00:15");
  });

  it("formats stored 24-hour time using selected display format", () => {
    expect(
      formatTimeForDisplay("13:05", TimeDisplayFormatEnum.twelve_hour),
    ).toBe("1:05 PM");
    expect(
      formatTimeForDisplay("13:05", TimeDisplayFormatEnum.twenty_four_hour),
    ).toBe("13:05");
  });

  it("normalizes date strings to ISO based on configured display format", () => {
    expect(normalizeDateToIso("12/31/2026", DateDisplayFormatEnum.us)).toBe(
      "2026-12-31",
    );
    expect(normalizeDateToIso("31/12/2026", DateDisplayFormatEnum.eu)).toBe(
      "2026-12-31",
    );
  });

  it("formats ISO dates for each configured display format", () => {
    expect(formatDateForDisplay("2026-12-31", DateDisplayFormatEnum.iso)).toBe(
      "2026-12-31",
    );
    expect(formatDateForDisplay("2026-12-31", DateDisplayFormatEnum.us)).toBe(
      "12/31/2026",
    );
    expect(formatDateForDisplay("2026-12-31", DateDisplayFormatEnum.eu)).toBe(
      "31/12/2026",
    );
    expect(
      formatDateForDisplay("2026-12-31", DateDisplayFormatEnum.long),
    ).toContain("2026");
  });

  it("normalizes datetime-local values and preserves date/time parts", () => {
    expect(normalizeDateTimeToLocalIso("2026-12-31T09:30")).toBe(
      "2026-12-31T09:30",
    );
    expect(splitIsoDateAndTimeParts("2026-12-31T09:30")).toEqual({
      dateIso: "2026-12-31",
      time24: "09:30",
    });
  });

  it("combines date and time parts and formats datetime display", () => {
    expect(combineIsoDateAndTimeParts("2026-12-31", "9:30 AM")).toBe(
      "2026-12-31T09:30",
    );
    expect(
      formatDateTimeForDisplay({
        raw: "2026-12-31T21:15",
        dateDisplayFormat: DateDisplayFormatEnum.us,
        timeDisplayFormat: TimeDisplayFormatEnum.twelve_hour,
      }),
    ).toBe("12/31/2026 9:15 PM");
  });

  it("formats local today as ISO using local date parts", () => {
    expect(getLocalTodayIsoDate(new Date("2026-02-17T23:30:00-08:00"))).toBe(
      "2026-02-17",
    );
  });
});
