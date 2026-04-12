import { describe, expect, it } from "vitest";

import { resolveParamContainerLayout } from "./ParamContainer";

describe("resolveParamContainerLayout", () => {
  it("treats non-nested params without child rows as leaf rows", () => {
    expect(
      resolveParamContainerLayout({
        hasChildRows: false,
        isNestedParam: false,
      }),
    ).toBe("leaf");
  });

  it("uses the nested-root layout when top-level params have child rows", () => {
    expect(
      resolveParamContainerLayout({
        hasChildRows: true,
        isNestedParam: false,
      }),
    ).toBe("nested-root");
  });

  it("prefers the nested-child layout whenever the param is nested", () => {
    expect(
      resolveParamContainerLayout({
        hasChildRows: true,
        isNestedParam: true,
      }),
    ).toBe("nested-child");
  });
});
