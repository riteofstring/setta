import { describe, expect, it } from "vitest";
import {
  DateDisplayFormatEnum,
  TimeDisplayFormatEnum,
} from "utils/generatedTypes";
import { buildTextBlockTypographyScale } from "./textBlockTypography";
import {
  formatDateForDisplay,
  formatTimeForDisplay,
  normalizeDateToIso,
  normalizeTimeTo24Hour,
} from "./textParamDateTime";

describe("sectionTypesDataAuthoring performance", () => {
  it("handles high-volume date/time normalization and formatting within budget", () => {
    const iterations = 40_000;
    const start = performance.now();
    let checksum = 0;

    for (let i = 0; i < iterations; i += 1) {
      const timeRaw = `${(i % 12) + 1}:${(i % 60).toString().padStart(2, "0")} PM`;
      const normalizedTime = normalizeTimeTo24Hour(timeRaw);
      const formattedTime = formatTimeForDisplay(
        normalizedTime,
        TimeDisplayFormatEnum.twelve_hour,
      );

      const month = ((i % 12) + 1).toString().padStart(2, "0");
      const day = ((i % 28) + 1).toString().padStart(2, "0");
      const dateRaw = `${month}/${day}/2026`;
      const normalizedDate = normalizeDateToIso(
        dateRaw,
        DateDisplayFormatEnum.us,
      );
      const formattedDate = formatDateForDisplay(
        normalizedDate,
        DateDisplayFormatEnum.eu,
      );

      checksum += normalizedTime.length + formattedTime.length;
      checksum += normalizedDate.length + formattedDate.length;
    }

    const durationMs = performance.now() - start;
    expect(checksum).toBeGreaterThan(0);
    expect(durationMs).toBeLessThan(1400);
  });

  it("builds typography scales for large render batches efficiently", () => {
    const iterations = 200_000;
    const start = performance.now();
    let checksum = 0;

    for (let i = 0; i < iterations; i += 1) {
      const scale = buildTextBlockTypographyScale((i % 41) + 8);
      checksum += scale.bodyPx + scale.h1Px + scale.codePx;
    }

    const durationMs = performance.now() - start;
    expect(checksum).toBeGreaterThan(0);
    expect(durationMs).toBeLessThan(700);
  });
});
