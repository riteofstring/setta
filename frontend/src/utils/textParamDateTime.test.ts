import { describe, expect, it } from "vitest";
import {
  DateDisplayFormatEnum,
  TimeDisplayFormatEnum,
} from "utils/generatedTypes";
import {
  formatDateForDisplay,
  formatTimeForDisplay,
  normalizeDateToIso,
  normalizeTimeTo24Hour,
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
});
