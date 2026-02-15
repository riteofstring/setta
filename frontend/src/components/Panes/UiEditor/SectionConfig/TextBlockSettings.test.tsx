import { describe, expect, it } from "vitest";
import { clampTextBlockMasterFontSize } from "utils/textBlockTypography";

describe("clampTextBlockMasterFontSize", () => {
  it("clamps values into the supported font-size range", () => {
    expect(clampTextBlockMasterFontSize(2)).toBe(8);
    expect(clampTextBlockMasterFontSize(19)).toBe(19);
    expect(clampTextBlockMasterFontSize(99)).toBe(48);
  });

  it("falls back to default font size when input is not finite", () => {
    expect(clampTextBlockMasterFontSize(Number.NaN)).toBe(14);
    expect(clampTextBlockMasterFontSize(Number.POSITIVE_INFINITY)).toBe(14);
  });
});
