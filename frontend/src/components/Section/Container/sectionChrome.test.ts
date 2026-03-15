import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  getCanvasSectionChrome,
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

  it("builds the canvas meta-control chrome descriptor from one helper", () => {
    const chrome = getCanvasSectionChrome({
      sectionTypeName: SectionTypeEnum.MetaControl,
      textBlockMetaControlStyle: false,
      isUserView: false,
      hasSectionStyleTheme: false,
      positionAndSizeLocked: false,
    });

    expect(chrome.bgColor).toBe("bg-transparent");
    expect(chrome.useMetaControlStyle).toBe(true);
    expect(chrome.showMetaControlDragHandle).toBe(true);
    expect(chrome.headerVariant).toBe("metaControlMenu");
    expect(chrome.surfaceClassName).toContain(
      "group-hover/card-section:z-[170]",
    );
    expect(chrome.surfaceClassName).toContain("grid-cols-1");
  });

  it("keeps text-block meta-control chrome distinct from real meta-control layout", () => {
    const chrome = getCanvasSectionChrome({
      sectionTypeName: SectionTypeEnum.TextBlock,
      textBlockMetaControlStyle: true,
      isUserView: false,
      hasSectionStyleTheme: false,
      positionAndSizeLocked: false,
      hideHeader: true,
    });

    expect(chrome.bgColor).toBe("bg-transparent");
    expect(chrome.useMetaControlStyle).toBe(true);
    expect(chrome.headerVariant).toBe("textBlockMetaControlMenu");
    expect(chrome.surfaceClassName).toContain(
      "group-hover/card-section:z-[170]",
    );
    expect(chrome.surfaceClassName).not.toContain("grid-cols-1");
  });
});
