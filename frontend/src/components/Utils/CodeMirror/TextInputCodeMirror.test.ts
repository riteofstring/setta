import { describe, expect, it } from "vitest";
import { CODEMIRROR_TOOLTIP_PARENT_ID } from "utils/constants";
import { resolveTooltipParentDivId } from "./TextInputCodeMirror";

describe("resolveTooltipParentDivId", () => {
  it("returns null when tooltipParentDivId is undefined", () => {
    expect(resolveTooltipParentDivId(undefined)).toBeNull();
  });

  it("returns null when tooltipParentDivId is null", () => {
    expect(resolveTooltipParentDivId(null)).toBeNull();
  });

  it("returns the provided tooltip parent id", () => {
    expect(
      resolveTooltipParentDivId(CODEMIRROR_TOOLTIP_PARENT_ID),
    ).toBe(CODEMIRROR_TOOLTIP_PARENT_ID);
  });
});
