import {
  buildTextBlockTypographyScale,
  clampTextBlockMasterFontSize,
} from "@setta/app-subsystem-frontend-sdk";
import { describe, expect, it } from "vitest";

describe("textBlockTypography", () => {
  it("clamps master font size into supported range", () => {
    expect(clampTextBlockMasterFontSize(2)).toBe(8);
    expect(clampTextBlockMasterFontSize(99)).toBe(48);
  });

  it("preserves hierarchy ratios from a single master size", () => {
    const scale = buildTextBlockTypographyScale(14);
    expect(scale.bodyPx).toBe(14);
    expect(scale.h1Px).toBeGreaterThan(scale.h2Px);
    expect(scale.h2Px).toBeGreaterThan(scale.h3Px);
    expect(scale.h3Px).toBeGreaterThan(scale.bodyPx);
    expect(scale.bodyPx).toBeGreaterThan(scale.codePx);
  });
});
