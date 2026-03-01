import { describe, expect, it } from "vitest";
import {
  parseViewportLayerSplitFlagOverride,
  resolveViewportLayerSplitEnabled,
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

  it("preserves explicit off overrides for kill-switch use", () => {
    expect(parseViewportLayerSplitFlagOverride("0")).toBe("disabled");
    expect(parseViewportLayerSplitFlagOverride("off")).toBe("disabled");
  });

  it("defaults to disabled unless explicitly enabled", () => {
    expect(resolveViewportLayerSplitEnabled("enabled")).toBe(true);
    expect(resolveViewportLayerSplitEnabled("disabled")).toBe(false);
    expect(resolveViewportLayerSplitEnabled("unset")).toBe(false);
  });
});
