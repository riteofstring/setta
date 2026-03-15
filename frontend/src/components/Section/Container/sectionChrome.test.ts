import { describe, expect, it } from "vitest";
import {
  getSectionContainerShellClassName,
  getSectionSurfaceClassName,
} from "./sectionChrome";

describe("sectionChrome", () => {
  it("supports full-bleed section shells without borders or outlines", () => {
    const className = getSectionContainerShellClassName({
      isActiveSection: false,
      isGlobalVariables: false,
      isInOtherProjectConfigs: false,
      useMetaControlStyle: false,
      hasSectionStyleTheme: false,
      positionAndSizeLocked: false,
      forceHideOutline: true,
      hideBorder: true,
      sizeClassName: "h-full w-full",
      cornerClassName: "rounded-none",
    });

    expect(className).toContain("border-0");
    expect(className).toContain("outline-0");
    expect(className).toContain("rounded-none");
  });

  it("supports full-bleed section surfaces without frame borders", () => {
    const className = getSectionSurfaceClassName({
      bgColor: "bg-white",
      hasSectionStyleTheme: false,
      positionAndSizeLocked: false,
      hideFrameBorder: true,
      cornerClassName: "rounded-none",
    });

    expect(className).toContain("before:border-0");
    expect(className).toContain("rounded-none");
  });
});
