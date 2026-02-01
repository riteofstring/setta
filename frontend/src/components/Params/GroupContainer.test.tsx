import { describe, expect, it } from "vitest";
import { SectionTypeEnum } from "utils/generatedTypes";
import { getPinnedParamsBgClassName } from "./GroupContainer";

describe("getPinnedParamsBgClassName", () => {
  it("uses a setta light tint with the dark blue shade", () => {
    const result = getPinnedParamsBgClassName(
      SectionTypeEnum.Dict,
    );
    expect(result).toBe("bg-setta-100/50 dark:bg-blue-950/30");
  });

  it("uses a solid light tint for global variables and keeps the dark blue shade", () => {
    const result = getPinnedParamsBgClassName(
      SectionTypeEnum.GlobalVariables,
    );
    expect(result).toBe("bg-setta-50 dark:bg-blue-950/30");
  });

  it("uses the standard light tint for other sections", () => {
    const result = getPinnedParamsBgClassName(
      SectionTypeEnum.Dict,
    );
    expect(result).toBe("bg-setta-100/50 dark:bg-blue-950/30");
  });

  it("uses a pure white background for callable sections", () => {
    const result = getPinnedParamsBgClassName(
      SectionTypeEnum.Callable,
    );
    expect(result).toBe("bg-white dark:bg-blue-950/30");
  });
});
