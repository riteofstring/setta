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
} from "./dateTimeUtils.js";

describe("dateTimeUtils", () => {
  it("normalizes 12-hour time input to 24-hour storage format", () => {
    expect(normalizeTimeTo24Hour("1:05 PM")).toBe("13:05");
    expect(normalizeTimeTo24Hour("12:15 AM")).toBe("00:15");
  });

  it("formats stored time using the selected display format", () => {
    expect(formatTimeForDisplay("13:05", "twelve_hour")).toBe("1:05 PM");
    expect(formatTimeForDisplay("13:05", "twenty_four_hour")).toBe("13:05");
  });

  it("normalizes configured date strings to ISO", () => {
    expect(normalizeDateToIso("12/31/2026", "us")).toBe("2026-12-31");
    expect(normalizeDateToIso("31/12/2026", "eu")).toBe("2026-12-31");
  });

  it("formats ISO dates for every configured display format", () => {
    expect(formatDateForDisplay("2026-12-31", "iso")).toBe("2026-12-31");
    expect(formatDateForDisplay("2026-12-31", "us")).toBe("12/31/2026");
    expect(formatDateForDisplay("2026-12-31", "eu")).toBe("31/12/2026");
    expect(formatDateForDisplay("2026-12-31", "long")).toBe(
      "December 31, 2026",
    );
  });

  it("normalizes datetime-local values and preserves date and time parts", () => {
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
        dateDisplayFormat: "us",
        timeDisplayFormat: "twelve_hour",
      }),
    ).toBe("12/31/2026 9:15 PM");
  });

  it("formats local today from local date parts", () => {
    expect(getLocalTodayIsoDate(new Date(2026, 1, 17, 23, 30, 0))).toBe(
      "2026-02-17",
    );
  });

  it("keeps long dates stable in positive-offset timezones", () => {
    const previousTz = process.env.TZ;
    process.env.TZ = "Pacific/Kiritimati";
    try {
      expect(normalizeDateToIso("January 1, 2026", "long")).toBe("2026-01-01");
    } finally {
      if (previousTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = previousTz;
      }
    }
  });
});
