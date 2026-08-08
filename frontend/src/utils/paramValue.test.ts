import { CodeObjTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  shouldEmitRealtimeValue,
  shouldShowPasswordReveal,
} from "./paramValue";

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

describe("shouldShowPasswordReveal", () => {
  it("returns true when a secret exists and the value is empty", () => {
    const shouldShow = shouldShowPasswordReveal({
      value: "",
      hasSecret: true,
    });

    expect(shouldShow).toBe(true);
  });

  it("returns false when no secret exists", () => {
    const shouldShow = shouldShowPasswordReveal({
      value: "",
      hasSecret: false,
    });

    expect(shouldShow).toBe(false);
  });

  it("returns false when a value is already present", () => {
    const shouldShow = shouldShowPasswordReveal({
      value: "revealed",
      hasSecret: true,
    });

    expect(shouldShow).toBe(false);
  });
});
