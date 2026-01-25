import { CodeObjTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { shouldEmitRealtimeValue } from "./paramValue";

describe("shouldEmitRealtimeValue", () => {
  it("returns false when the value is unchanged", () => {
    const shouldEmit = shouldEmitRealtimeValue({
      previousValue: "same",
      nextValue: "same",
      codeObjType: CodeObjTypeEnum.TextParam,
    });

    expect(shouldEmit).toBe(false);
  });

  it("returns false for password params even when changed", () => {
    const shouldEmit = shouldEmitRealtimeValue({
      previousValue: "old",
      nextValue: "new",
      codeObjType: CodeObjTypeEnum.PasswordParam,
    });

    expect(shouldEmit).toBe(false);
  });

  it("returns true for non-password params when changed", () => {
    const shouldEmit = shouldEmitRealtimeValue({
      previousValue: "old",
      nextValue: "new",
      codeObjType: CodeObjTypeEnum.TextAreaParam,
    });

    expect(shouldEmit).toBe(true);
  });
});
