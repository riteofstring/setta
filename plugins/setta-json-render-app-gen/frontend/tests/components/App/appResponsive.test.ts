import { describe, expect, it } from "vitest";

import { resolveResponsiveValue } from "../../../src/components/App/appResponsive";

describe("resolveResponsiveValue", () => {
  it("returns scalar values unchanged", () => {
    expect(resolveResponsiveValue(12, "md")).toBe(12);
    expect(resolveResponsiveValue("1rem", "md")).toBe("1rem");
  });

  it("resolves a breakpoint map with fallback", () => {
    const value = { base: 8, lg: 20 };
    expect(resolveResponsiveValue(value, "2xl")).toBe(20);
    expect(resolveResponsiveValue(value, "xl")).toBe(20);
    expect(resolveResponsiveValue(value, "md")).toBe(8);
  });

  it("ignores non-breakpoint records", () => {
    expect(resolveResponsiveValue({ foo: 1 }, "md")).toEqual({ foo: 1 });
  });
});
