import { describe, expect, it } from "vitest";
import {
  isViewportLayerSplitScopeDefaultEnabled,
  parseViewportLayerSplitFlagOverride,
} from "./viewportLayerSplitFlag";

describe("viewportLayerSplitFlag", () => {
  it("parses explicit enable overrides", () => {
    expect(parseViewportLayerSplitFlagOverride("1")).toBe("enabled");
    expect(parseViewportLayerSplitFlagOverride(" true ")).toBe("enabled");
    expect(parseViewportLayerSplitFlagOverride("ON")).toBe("enabled");
  });

  it("parses explicit disable overrides", () => {
    expect(parseViewportLayerSplitFlagOverride("0")).toBe("disabled");
    expect(parseViewportLayerSplitFlagOverride("false")).toBe("disabled");
    expect(parseViewportLayerSplitFlagOverride("OFF")).toBe("disabled");
  });

  it("parses missing and unknown values as unset", () => {
    expect(parseViewportLayerSplitFlagOverride(null)).toBe("unset");
    expect(parseViewportLayerSplitFlagOverride("")).toBe("unset");
    expect(parseViewportLayerSplitFlagOverride("disabled")).toBe("unset");
  });

  it("defaults on only for settings/all-settings scope", () => {
    expect(
      isViewportLayerSplitScopeDefaultEnabled({
        projectName: "settings",
        activeViewModeName: "All Settings",
      }),
    ).toBe(true);
    expect(
      isViewportLayerSplitScopeDefaultEnabled({
        projectName: "settings",
        activeViewModeName: "Core",
      }),
    ).toBe(false);
    expect(
      isViewportLayerSplitScopeDefaultEnabled({
        projectName: "other-project",
        activeViewModeName: "All Settings",
      }),
    ).toBe(false);
  });
});
