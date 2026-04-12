import { resolveSectionChromeAppearance } from "components/Section/Container/sectionChromeAppearance";
import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import type { SettingsGraphSubstrateCanarySectionSeedNodes } from "./settingsGraphSubstrateCanarySectionSeedNodes";
import { resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables } from "./settingsGraphSubstrateCanarySectionShellPixiModel";

describe("resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables", () => {
  it("projects themed active shell chrome into world-space Pixi strokes", () => {
    const previewStyleColor = "#336699";
    const appearance = resolveSectionChromeAppearance({
      darkMode: false,
      previewStyleColor,
      sectionTypeName: SectionTypeEnum.Code,
      styleColor: "#ff0000",
      textBlockMetaControlStyle: false,
    });

    const { drawables } =
      resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables({
        activeSectionIds: [],
        darkMode: false,
        draggingSectionId: null,
        hoveredSectionId: null,
        previewStyleColors: {
          "section-a": previewStyleColor,
        },
        sceneSections: [createSceneSection({ isActiveSection: true })],
        sectionSeedNodes: new Map(),
      });

    expect(drawables).toHaveLength(1);
    expect(drawables[0]).toMatchObject({
      border: {
        alignment: 1,
        color: appearance.sectionStyleVars?.["--setta-section-style-border"],
        width: 1,
      },
      cornerRadius: 8,
      fill: {
        color: appearance.backgroundColor,
      },
      outline: {
        alignment: 0,
        color: appearance.sectionStyleVars?.["--setta-section-style-outline"],
        width: 4,
      },
      surfaceFrame: {
        alignment: 1,
        color: appearance.surfaceFrameColor?.color,
        width: 1,
      },
      height: 160,
      width: 240,
      x: 120,
      y: 80,
      sectionId: "section-a",
      topDragHandle: null,
    });
  });

  it("skips sections whose remaining shell chrome is only the hidden hover handle", () => {
    const { drawables } =
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
        sectionSeedNodes: new Map(),
      });

    expect(drawables).toEqual([]);
  });

  it("projects the shell-owned top drag handle into Pixi when the section is hovered", () => {
    const { drawables } =
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
        sectionSeedNodes: new Map(),
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
          height: 4,
          width: 32,
          x: 224,
          y: 78,
        },
      }),
    ]);
  });

  it("uses dark-mode shell colors for unthemed active sections", () => {
    const { drawables } =
      resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables({
        activeSectionIds: ["section-a"],
        darkMode: true,
        draggingSectionId: null,
        hoveredSectionId: null,
        previewStyleColors: {},
        sceneSections: [createSceneSection({ isActiveSection: false })],
        sectionSeedNodes: new Map(),
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
    const { drawables } =
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
        sectionSeedNodes: new Map(),
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

  it("uses shared-node seed size for unresolved shell geometry", () => {
    const { drawables } =
      resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables({
        activeSectionIds: [],
        darkMode: false,
        draggingSectionId: null,
        hoveredSectionId: null,
        previewStyleColors: {},
        sceneSections: [
          createSceneSection({
            height: null,
            sceneBoundsSize: null,
            sizeAuthority: "sharedNode",
            width: null,
          }),
        ],
        sectionSeedNodes: createSectionSeedNodes([
          [
            "section-a",
            {
              width: 280,
              height: 190,
              sizeAuthority: "sharedNode",
            },
          ],
        ]),
      });

    expect(drawables).toHaveLength(1);
    expect(drawables[0]).toMatchObject({
      height: 190,
      width: 280,
    });
  });

  it("reuses cached drawable objects for semantically unchanged sections", () => {
    const firstResolution =
      resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables({
        activeSectionIds: [],
        darkMode: false,
        draggingSectionId: null,
        hoveredSectionId: null,
        previewStyleColors: {},
        sceneSections: [createSceneSection()],
        sectionSeedNodes: new Map(),
      });

    const secondResolution =
      resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables({
        activeSectionIds: [],
        darkMode: false,
        draggingSectionId: null,
        hoveredSectionId: null,
        previousCacheBySectionId: firstResolution.cacheBySectionId,
        previewStyleColors: {},
        sceneSections: [createSceneSection()],
        sectionSeedNodes: new Map(),
      });

    expect(secondResolution.drawables[0]).toBe(firstResolution.drawables[0]);
  });

  it("reuses the previous resolution identities when every presented drawable input is unchanged", () => {
    const firstResolution =
      resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables({
        activeSectionIds: [],
        darkMode: false,
        draggingSectionId: null,
        hoveredSectionId: null,
        previewStyleColors: {},
        sceneSections: [createSceneSection()],
        sectionSeedNodes: new Map(),
      });

    const secondResolution =
      resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables({
        activeSectionIds: [],
        darkMode: false,
        draggingSectionId: null,
        hoveredSectionId: null,
        previousCacheBySectionId: firstResolution.cacheBySectionId,
        previousDrawables: firstResolution.drawables,
        previewStyleColors: {},
        sceneSections: [createSceneSection()],
        sectionSeedNodes: new Map(),
      });

    expect(secondResolution.drawables).toBe(firstResolution.drawables);
    expect(secondResolution.cacheBySectionId).toBe(
      firstResolution.cacheBySectionId,
    );
  });

  it("invalidates the cached drawable for sections whose drawable inputs changed", () => {
    const firstResolution =
      resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables({
        activeSectionIds: [],
        darkMode: false,
        draggingSectionId: null,
        hoveredSectionId: null,
        previewStyleColors: {},
        sceneSections: [
          createSceneSection({ sectionId: "section-a" }),
          createSceneSection({
            positionAndSizeLocked: true,
            sectionId: "section-b",
          }),
        ],
        sectionSeedNodes: new Map(),
      });

    const secondResolution =
      resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables({
        activeSectionIds: [],
        darkMode: false,
        draggingSectionId: null,
        hoveredSectionId: null,
        previousCacheBySectionId: firstResolution.cacheBySectionId,
        previewStyleColors: {},
        sceneSections: [
          createSceneSection({ sectionId: "section-a" }),
          createSceneSection({
            positionAndSizeLocked: false,
            sectionId: "section-b",
          }),
        ],
        sectionSeedNodes: new Map(),
      });

    expect(secondResolution.drawables[0]).toBe(firstResolution.drawables[0]);
    expect(secondResolution.drawables[1]).not.toBe(
      firstResolution.drawables[1],
    );
  });

  it("reuses unchanged cache entries when only one section invalidates", () => {
    const firstResolution =
      resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables({
        activeSectionIds: [],
        darkMode: false,
        draggingSectionId: null,
        hoveredSectionId: null,
        previewStyleColors: {},
        sceneSections: [
          createSceneSection({ sectionId: "section-a" }),
          createSceneSection({ sectionId: "section-b" }),
        ],
        sectionSeedNodes: new Map(),
      });

    const secondResolution =
      resolveSettingsGraphSubstrateCanarySectionShellPixiDrawables({
        activeSectionIds: [],
        darkMode: false,
        draggingSectionId: null,
        hoveredSectionId: null,
        previousCacheBySectionId: firstResolution.cacheBySectionId,
        previousDrawables: firstResolution.drawables,
        previewStyleColors: {},
        sceneSections: [
          createSceneSection({ sectionId: "section-a" }),
          createSceneSection({ sectionId: "section-b", styleColor: "#22c55e" }),
        ],
        sectionSeedNodes: new Map(),
      });

    expect(secondResolution.cacheBySectionId.get("section-a")).toBe(
      firstResolution.cacheBySectionId.get("section-a"),
    );
    expect(secondResolution.cacheBySectionId.get("section-b")).not.toBe(
      firstResolution.cacheBySectionId.get("section-b"),
    );
  });
});

function createSceneSection(
  overrides: Partial<SettingsGraphSubstrateCanarySceneSection> = {},
): SettingsGraphSubstrateCanarySceneSection {
  const width = "width" in overrides ? overrides.width ?? null : 240;
  const height = "height" in overrides ? overrides.height ?? null : 160;
  const sizeAuthority =
    overrides.sizeAuthority ?? (width && height ? "layout" : undefined);

  return {
    height,
    isActiveSection: false,
    isInOtherProjectConfigs: false,
    position: { x: 120, y: 80 },
    positionAndSizeLocked: false,
    renderedPosition: { x: 120, y: 80 },
    sceneBoundsSize:
      overrides.sceneBoundsSize ?? (width && height ? { width, height } : null),
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

function createSectionSeedNodes(
  entries: Array<
    readonly [
      string,
      {
        height: number;
        sizeAuthority: "sharedNode";
        width: number;
      },
    ]
  >,
): SettingsGraphSubstrateCanarySectionSeedNodes {
  return new Map(entries);
}
