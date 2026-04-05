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
        draggingSectionId: null,
        hoveredSectionId: null,
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
      surfaceFrame: {
        alignment: 1,
        color: appearance.surfaceFrameColor?.color,
        width: 0.5,
      },
      screenHeight: 80,
      screenWidth: 120,
      screenX: 110,
      screenY: 20,
      sectionId: "section-a",
      topDragHandle: null,
    });
  });

  it("skips sections whose remaining shell chrome is only the hidden hover handle", () => {
    const drawables =
      resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables({
        activeSectionIds: [],
        darkMode: false,
        draggingSectionId: null,
        hoveredSectionId: null,
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

  it("projects the shell-owned top drag handle into Pixi when the section is hovered", () => {
    const drawables =
      resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables({
        activeSectionIds: [],
        darkMode: false,
        draggingSectionId: null,
        hoveredSectionId: "section-a",
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

    expect(drawables).toEqual([
      expect.objectContaining({
        border: null,
        fill: null,
        outline: null,
        sectionId: "section-a",
        topDragHandle: {
          cornerRadius: 2,
          fill: {
            alpha: 0.7,
            color: "hsl(220, 25%, 67%)",
          },
          screenHeight: 4,
          screenWidth: 32,
          screenX: 224,
          screenY: 78,
        },
      }),
    ]);
  });

  it("uses dark-mode shell colors for unthemed active sections", () => {
    const drawables =
      resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables({
        activeSectionIds: ["section-a"],
        darkMode: true,
        draggingSectionId: null,
        hoveredSectionId: null,
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
    expect(drawables[0]?.surfaceFrame).toMatchObject({
      color: "hsl(219, 26%, 23%)",
      width: 1,
    });
    expect(drawables[0]?.topDragHandle).toBeNull();
  });

  it("projects the meta-control hover frame into Pixi without needing the DOM surface frame", () => {
    const drawables =
      resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables({
        activeSectionIds: [],
        darkMode: false,
        draggingSectionId: null,
        hoveredSectionId: "section-a",
        previewStyleColors: {},
        sceneSections: [
          createSceneSection({
            positionAndSizeLocked: true,
            sectionTypeName: SectionTypeEnum.MetaControl,
            styleColor: null,
            textBlockMetaControlStyle: false,
          }),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      });

    expect(drawables).toEqual([
      expect.objectContaining({
        border: null,
        fill: null,
        outline: null,
        sectionId: "section-a",
        surfaceFrame: {
          alignment: 1,
          alpha: 0.6,
          color: "hsl(220, 26%, 57%)",
          width: 1,
        },
        topDragHandle: null,
      }),
    ]);
  });
});

function createSceneSection(
  overrides: Partial<SettingsGraphSubstrateCanarySceneSection> = {},
): SettingsGraphSubstrateCanarySceneSection {
  const renderSize =
    "renderSize" in overrides
      ? overrides.renderSize ?? null
      : { width: 240, height: 160 };
  const width =
    "width" in overrides ? overrides.width ?? null : renderSize?.width ?? null;
  const height =
    "height" in overrides
      ? overrides.height ?? null
      : renderSize?.height ?? null;
  const sizeAuthority =
    overrides.sizeAuthority ?? (width && height ? "layout" : undefined);

  return {
    height,
    isActiveSection: false,
    isInOtherProjectConfigs: false,
    position: { x: 120, y: 80 },
    positionAndSizeLocked: false,
    renderedPosition: { x: 120, y: 80 },
    renderSize,
    sceneBoundsSize:
      overrides.sceneBoundsSize ??
      (renderSize &&
      (sizeAuthority === "layout" || sizeAuthority === "sectionModel")
        ? renderSize
        : width && height
          ? { width, height }
          : null),
    sectionId: "section-a",
    sectionTypeName: SectionTypeEnum.Code,
    styleColor: null,
    tempZIndex: 2,
    textBlockMetaControlStyle: false,
    width,
    zIndex: 2,
    ...(sizeAuthority ? { sizeAuthority } : {}),
    ...overrides,
  };
}
