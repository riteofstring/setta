import { describe, expect, it } from "vitest";
import {
  parseViewportShellModeFlagOverride,
  resolveViewportShellModeEnabled,
} from "./viewportShellModeFlag";

describe("viewportShellModeFlag", () => {
  it("parses explicit enable overrides", () => {
    expect(parseViewportShellModeFlagOverride("1")).toBe("enabled");
    expect(parseViewportShellModeFlagOverride(" true ")).toBe("enabled");
    expect(parseViewportShellModeFlagOverride("ON")).toBe("enabled");
  });

  it("parses explicit disable overrides", () => {
    expect(parseViewportShellModeFlagOverride("0")).toBe("disabled");
    expect(parseViewportShellModeFlagOverride("false")).toBe("disabled");
    expect(parseViewportShellModeFlagOverride("OFF")).toBe("disabled");
  });

  it("parses missing and unknown values as unset", () => {
    expect(parseViewportShellModeFlagOverride(null)).toBe("unset");
    expect(parseViewportShellModeFlagOverride("")).toBe("unset");
    expect(parseViewportShellModeFlagOverride("disabled")).toBe("unset");
  });

  it("defaults to disabled unless explicitly enabled", () => {
    expect(resolveViewportShellModeEnabled("enabled")).toBe(true);
    expect(resolveViewportShellModeEnabled("disabled")).toBe(false);
    expect(resolveViewportShellModeEnabled("unset")).toBe(false);
  });
});
