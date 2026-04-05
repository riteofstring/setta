import { resolveSectionChromeAppearance } from "components/Section/Container/sectionChromeAppearance";
import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import { resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables } from "./settingsGraphSubstrateCanarySectionShellPixiModel";

describe("resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables", () => {
  it("projects themed active shell chrome into screen-space Pixi strokes", () => {
    const previewStyleColor = "#336699";
    const appearance = resolveSectionChromeAppearance({
      darkMode: false,
      previewStyleColor,
      sectionTypeName: SectionTypeEnum.Code,
      styleColor: "#ff0000",
      textBlockMetaControlStyle: false,
    });

    const drawables =
      resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables({
        activeSectionIds: [],
        darkMode: false,
        previewStyleColors: {
          "section-a": previewStyleColor,
        },
        sceneSections: [createSceneSection({ isActiveSection: true })],
        viewport: { x: 50, y: -20, zoom: 0.5 },
      });

    expect(drawables).toHaveLength(1);
    expect(drawables[0]).toMatchObject({
      border: {
        alignment: 1,
        color: appearance.sectionStyleVars?.["--setta-section-style-border"],
        width: 0.5,
      },
      cornerRadius: 4,
      fill: {
        color: appearance.backgroundColor,
      },
      outline: {
        alignment: 0,
        color: appearance.sectionStyleVars?.["--setta-section-style-outline"],
        width: 2,
      },
      screenHeight: 80,
      screenWidth: 120,
      screenX: 110,
      screenY: 20,
      sectionId: "section-a",
    });
  });

  it("skips sections whose remaining shell chrome is only the DOM-owned top drag handle", () => {
    const drawables =
      resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables({
        activeSectionIds: [],
        darkMode: false,
        previewStyleColors: {},
        sceneSections: [
          createSceneSection({
            isInOtherProjectConfigs: true,
            sectionTypeName: SectionTypeEnum.MetaControl,
            styleColor: null,
            textBlockMetaControlStyle: false,
          }),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      });

    expect(drawables).toEqual([]);
  });

  it("uses dark-mode shell colors for unthemed active sections", () => {
    const drawables =
      resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables({
        activeSectionIds: ["section-a"],
        darkMode: true,
        previewStyleColors: {},
        sceneSections: [createSceneSection({ isActiveSection: false })],
        viewport: { x: 0, y: 0, zoom: 1 },
      });

    expect(drawables).toHaveLength(1);
    expect(drawables[0]?.fill).toMatchObject({
      color: "hsl(220, 27%, 6%)",
    });
    expect(drawables[0]?.border).toMatchObject({
      color: "hsl(219, 26%, 23%)",
      width: 1,
    });
    expect(drawables[0]?.outline).toMatchObject({
      color: "#1d4ed8",
      width: 4,
    });
  });
});

function createSceneSection(
  overrides: Partial<SettingsGraphSubstrateCanarySceneSection> = {},
): SettingsGraphSubstrateCanarySceneSection {
  return {
    height: 160,
    isActiveSection: false,
    isInOtherProjectConfigs: false,
    position: { x: 120, y: 80 },
    positionAndSizeLocked: false,
    renderedPosition: { x: 120, y: 80 },
    resolvedSize: { width: 240, height: 160 },
    sectionId: "section-a",
    sectionTypeName: SectionTypeEnum.Code,
    styleColor: null,
    tempZIndex: 2,
    textBlockMetaControlStyle: false,
    width: 240,
    zIndex: 2,
    ...overrides,
  };
}
