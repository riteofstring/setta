import { describe, expect, it } from "vitest";
import { resolveCalendarKeyboardDate, shiftCalendarDateByMonths } from "./calendarKeyboard";

describe("calendar keyboard navigation", () => {
  it.each([
    ["ArrowLeft", false, "2026-02-28"],
    ["ArrowRight", false, "2026-03-02"],
    ["ArrowUp", false, "2026-02-22"],
    ["ArrowDown", false, "2026-03-08"],
    ["PageUp", false, "2026-02-01"],
    ["PageDown", false, "2026-04-01"],
    ["PageUp", true, "2025-03-01"],
    ["PageDown", true, "2027-03-01"],
  ])("maps %s (shift %s) to %s", (key, shiftKey, expected) => {
    expect(
      resolveCalendarKeyboardDate({
        isoDate: "2026-03-01",
        key,
        shiftKey,
        weekStartsOn: "sunday",
        direction: "ltr",
      }),
    ).toBe(expected);
  });

  it("moves Home and End within the configured week", () => {
    expect(
      resolveCalendarKeyboardDate({
        isoDate: "2026-03-04",
        key: "Home",
        shiftKey: false,
        weekStartsOn: "monday",
        direction: "ltr",
      }),
    ).toBe("2026-03-02");
    expect(
      resolveCalendarKeyboardDate({
        isoDate: "2026-03-04",
        key: "End",
        shiftKey: false,
        weekStartsOn: "sunday",
        direction: "ltr",
      }),
    ).toBe("2026-03-07");
  });

  it("maps horizontal arrows to visual movement in rtl grids", () => {
    expect(
      resolveCalendarKeyboardDate({
        isoDate: "2026-03-01",
        key: "ArrowLeft",
        shiftKey: false,
        weekStartsOn: "sunday",
        direction: "rtl",
      }),
    ).toBe("2026-03-02");
    expect(
      resolveCalendarKeyboardDate({
        isoDate: "2026-03-01",
        key: "ArrowRight",
        shiftKey: false,
        weekStartsOn: "sunday",
        direction: "rtl",
      }),
    ).toBe("2026-02-28");
    expect(
      resolveCalendarKeyboardDate({
        isoDate: "2026-03-01",
        key: "ArrowUp",
        shiftKey: false,
        weekStartsOn: "sunday",
        direction: "rtl",
      }),
    ).toBe("2026-02-22");
  });

  it("clamps month and year movement to the destination month's last day", () => {
    expect(shiftCalendarDateByMonths("2024-03-31", -1)).toBe("2024-02-29");
    expect(shiftCalendarDateByMonths("2024-02-29", 12)).toBe("2025-02-28");
  });

  it("ignores unrelated keys and rejects invalid dates specifically", () => {
    expect(
      resolveCalendarKeyboardDate({
        isoDate: "2026-03-01",
        key: "Enter",
        shiftKey: false,
        weekStartsOn: "sunday",
        direction: "ltr",
      }),
    ).toBeNull();
    expect(() => shiftCalendarDateByMonths("2026-02-30", 1)).toThrow(
      "Calendar keyboard navigation received an invalid ISO date: 2026-02-30.",
    );
  });
});
