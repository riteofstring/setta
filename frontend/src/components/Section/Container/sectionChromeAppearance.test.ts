import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { resolveSectionChromeAppearance } from "./sectionChromeAppearance";

describe("sectionChromeAppearance", () => {
  it("builds themed chrome vars for non-meta sections", () => {
    const appearance = resolveSectionChromeAppearance({
      darkMode: false,
      previewStyleColor: undefined,
      sectionTypeName: SectionTypeEnum.Code,
      styleColor: "#336699",
      textBlockMetaControlStyle: false,
    });

    expect(appearance.bgColor).toBe("bg-white dark:bg-setta-900");
    expect(appearance.backgroundColor).toBe(
      appearance.sectionStyleVars?.["--setta-section-style-bg"],
    );
    expect(appearance.surfaceFrameColor).toEqual({
      alpha: 1,
      color: appearance.sectionStyleVars?.["--setta-section-style-border"],
    });
    expect(appearance.surfaceFrameHoverColor).toBeNull();
    expect(appearance.useMetaControlStyle).toBe(false);
    expect(appearance.hasSectionStyleTheme).toBe(true);
    expect(appearance.sectionStyleVars).toMatchObject({
      "--setta-section-style-bg": expect.any(String),
      "--setta-section-style-panel-bg": expect.any(String),
      "--setta-section-style-border": expect.any(String),
      "--setta-section-style-outline": expect.any(String),
      "--setta-section-style-text": expect.any(String),
      "--setta-section-style-muted-text": expect.any(String),
    });
  });

  it("prefers the preview style color over the saved style color", () => {
    const baseAppearance = resolveSectionChromeAppearance({
      darkMode: false,
      previewStyleColor: undefined,
      sectionTypeName: SectionTypeEnum.Dict,
      styleColor: "#336699",
      textBlockMetaControlStyle: false,
    });
    const previewAppearance = resolveSectionChromeAppearance({
      darkMode: false,
      previewStyleColor: "#cc5500",
      sectionTypeName: SectionTypeEnum.Dict,
      styleColor: "#336699",
      textBlockMetaControlStyle: false,
    });

    expect(previewAppearance.sectionStyleVars).not.toEqual(
      baseAppearance.sectionStyleVars,
    );
  });

  it("keeps meta-control chrome transparent even when a style color exists", () => {
    const appearance = resolveSectionChromeAppearance({
      darkMode: true,
      previewStyleColor: "#cc5500",
      sectionTypeName: SectionTypeEnum.MetaControl,
      styleColor: "#336699",
      textBlockMetaControlStyle: false,
    });

    expect(appearance.bgColor).toBe("bg-transparent");
    expect(appearance.backgroundColor).toBeNull();
    expect(appearance.surfaceFrameColor).toBeNull();
    expect(appearance.surfaceFrameHoverColor).toEqual({
      alpha: 0.6,
      color: "hsl(219, 26%, 23%)",
    });
    expect(appearance.useMetaControlStyle).toBe(true);
    expect(appearance.hasSectionStyleTheme).toBe(false);
    expect(appearance.sectionStyleVars).toBeUndefined();
  });

  it("resolves a renderer-facing default surface fill color for unthemed sections", () => {
    const appearance = resolveSectionChromeAppearance({
      darkMode: true,
      previewStyleColor: undefined,
      sectionTypeName: SectionTypeEnum.Dict,
      styleColor: null,
      textBlockMetaControlStyle: false,
    });

    expect(appearance.bgColor).toBe("bg-setta-50 dark:bg-setta-860");
    expect(appearance.backgroundColor).toBe("hsl(220, 25%, 8.5%)");
    expect(appearance.surfaceFrameColor).toEqual({
      alpha: 1,
      color: "hsl(219, 26%, 23%)",
    });
    expect(appearance.surfaceFrameHoverColor).toBeNull();
  });
});
