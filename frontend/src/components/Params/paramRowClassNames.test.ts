import { describe, expect, it } from "vitest";
import {
  getNestedChildRowClassName,
  getNonNestedParamRowClassName,
  NESTED_CHILD_ROW_CLASS_NAME,
} from "./paramRowClassNames";

describe("param row class names", () => {
  it("returns the nested-child decorator classes only for nested child rows", () => {
    expect(getNestedChildRowClassName(true)).toBe(NESTED_CHILD_ROW_CLASS_NAME);
    expect(getNestedChildRowClassName(false)).toBe("");
  });

  it("builds the shared non-nested row shell for steady-state rows", () => {
    const className = getNonNestedParamRowClassName({
      isNestedChildInTree: true,
      justifyBetween: true,
      gapY: true,
      extraClassName: "group/arg-group bg-blue-500/20",
    });

    expect(className).toContain("section-key-value");
    expect(className).toContain("section-param-row");
    expect(className).toContain("relative");
    expect(className).toContain("min-w-0");
    expect(className).not.toContain("grid");
    expect(className).toContain("ml-[0.72rem]");
    expect(className).not.toContain("before:pointer-events-none");
    expect(className).not.toContain("before:w-[0.4rem]");
    expect(className).toContain("group/arg-group");
    expect(className).toContain("justify-between");
    expect(className).toContain("gap-y-1");
    expect(className).toContain(NESTED_CHILD_ROW_CLASS_NAME);
  });

  it("builds the shared non-nested row shell for placeholder rows", () => {
    const className = getNonNestedParamRowClassName({
      isNestedChildInTree: false,
      justifyBetween: true,
      extraClassName: "bg-blue-500/40 dark:bg-blue-600/40",
    });

    expect(className).toContain("section-key-value");
    expect(className).toContain("section-param-row");
    expect(className).toContain("relative");
    expect(className).toContain("min-w-0");
    expect(className).not.toContain("grid");
    expect(className).toContain("ml-[0.72rem]");
    expect(className).toContain("justify-between");
    expect(className).not.toContain("gap-y-1");
    expect(className).toContain("bg-blue-500/40");
  });
});
