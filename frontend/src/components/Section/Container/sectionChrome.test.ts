import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  getCanvasSectionChrome,
  getSectionContainerShellClassName,
  getSectionSurfaceClassName,
  getWindowSectionChrome,
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

  it("supports a window flow surface without the shared section grid", () => {
    const className = getSectionSurfaceClassName({
      bgColor: "bg-white",
      hasSectionStyleTheme: false,
      positionAndSizeLocked: false,
      surfaceLayout: "windowFlow",
      cornerClassName: "rounded-none",
    });

    expect(className).toContain("flex");
    expect(className).toContain("flex-col");
    expect(className).not.toContain("section-grid-cols");
    expect(className).not.toContain(" grid ");
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

  it("builds non-meta canvas chrome without the shared section grid", () => {
    const chrome = getCanvasSectionChrome({
      sectionTypeName: SectionTypeEnum.Code,
      textBlockMetaControlStyle: false,
      isUserView: false,
      hasSectionStyleTheme: false,
      positionAndSizeLocked: false,
    });

    expect(chrome.bgColor).toBe("bg-white dark:bg-setta-900");
    expect(chrome.useMetaControlStyle).toBe(false);
    expect(chrome.headerVariant).toBe("sectionHeader");
    expect(chrome.surfaceClassName).toContain("flex-col");
    expect(chrome.surfaceClassName).not.toContain("section-grid-cols");
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
    expect(chrome.surfaceClassName).toContain("flex-col");
    expect(chrome.surfaceClassName).not.toContain("section-grid-cols");
    expect(chrome.surfaceClassName).not.toContain("grid-cols-1");
  });

  it("builds standalone window chrome from the shared surface descriptor", () => {
    const chrome = getWindowSectionChrome({
      sectionTypeName: SectionTypeEnum.MetaControl,
      isActiveSection: false,
      isInOtherProjectConfigs: false,
      textBlockMetaControlStyle: false,
      hasSectionStyleTheme: false,
      positionAndSizeLocked: false,
      isStandalonePage: true,
      roundedClassName: "rounded-xl",
    });

    expect(chrome.bgColor).toBe("bg-transparent");
    expect(chrome.useMetaControlStyle).toBe(true);
    expect(chrome.outerShellClassName).toContain("border-0");
    expect(chrome.outerShellClassName).toContain("rounded-none");
    expect(chrome.innerShellClassName).toContain("before:border-0");
    expect(chrome.innerShellClassName).toContain("flex-col");
    expect(chrome.innerShellClassName).not.toContain("section-grid-cols");
    expect(chrome.innerShellClassName).toContain("rounded-none");
  });
});
