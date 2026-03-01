import { describe, expect, it } from "vitest";
import {
  parseViewportMotionShellFlagOverride,
  resolveViewportMotionShellEnabled,
} from "./viewportMotionShellFlag";

describe("viewportMotionShellFlag", () => {
  it("parses explicit enable overrides", () => {
    expect(parseViewportMotionShellFlagOverride("1")).toBe("enabled");
    expect(parseViewportMotionShellFlagOverride(" true ")).toBe("enabled");
    expect(parseViewportMotionShellFlagOverride("ON")).toBe("enabled");
  });

  it("parses explicit disable overrides", () => {
    expect(parseViewportMotionShellFlagOverride("0")).toBe("disabled");
    expect(parseViewportMotionShellFlagOverride("false")).toBe("disabled");
    expect(parseViewportMotionShellFlagOverride("OFF")).toBe("disabled");
  });

  it("parses missing and unknown values as unset", () => {
    expect(parseViewportMotionShellFlagOverride(null)).toBe("unset");
    expect(parseViewportMotionShellFlagOverride("")).toBe("unset");
    expect(parseViewportMotionShellFlagOverride("disabled")).toBe("unset");
  });

  it("defaults to disabled unless explicitly enabled", () => {
    expect(resolveViewportMotionShellEnabled("enabled")).toBe(true);
    expect(resolveViewportMotionShellEnabled("disabled")).toBe(false);
    expect(resolveViewportMotionShellEnabled("unset")).toBe(false);
  });
});
