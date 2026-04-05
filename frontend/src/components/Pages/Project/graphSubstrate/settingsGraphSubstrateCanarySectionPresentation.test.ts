import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import {
  areSettingsGraphSubstrateCanaryPresentedSceneSectionsEqual,
  resolveSettingsGraphSubstrateCanaryPresentedSceneSections,
} from "./settingsGraphSubstrateCanarySectionPresentation";

describe("settingsGraphSubstrateCanarySectionPresentation", () => {
  it("skips inactive offscreen sections from the presented subset", () => {
    const visibleSection = createSceneSection({
      sectionId: "visible-section",
    });
    const offscreenSection = createSceneSection({
      position: { x: 1480, y: 80 },
      renderedPosition: { x: 1480, y: 80 },
      sectionId: "offscreen-section",
    });

    const presentedSceneSections =
      resolveSettingsGraphSubstrateCanaryPresentedSceneSections({
        draggingSectionId: null,
        sceneSections: [visibleSection, offscreenSection],
        viewport: { x: 0, y: 0, zoom: 1 },
        visibleViewportRect: { x: 0, y: 0, width: 720, height: 480 },
      });

    expect(presentedSceneSections).toEqual([visibleSection]);
  });

  it("keeps active offscreen sections in the presented subset", () => {
    const visibleSection = createSceneSection({
      sectionId: "visible-section",
    });
    const activeOffscreenSection = createSceneSection({
      isActiveSection: true,
      position: { x: 1480, y: 80 },
      renderedPosition: { x: 1480, y: 80 },
      sectionId: "offscreen-active-section",
    });

    const presentedSceneSections =
      resolveSettingsGraphSubstrateCanaryPresentedSceneSections({
        draggingSectionId: null,
        sceneSections: [visibleSection, activeOffscreenSection],
        viewport: { x: 0, y: 0, zoom: 1 },
        visibleViewportRect: { x: 0, y: 0, width: 720, height: 480 },
      });

    expect(presentedSceneSections).toEqual([
      visibleSection,
      activeOffscreenSection,
    ]);
  });

  it("reuses the previous presented subset reference when section identities are unchanged", () => {
    const visibleSection = createSceneSection({
      sectionId: "visible-section",
    });
    const previousPresentedSceneSections = [visibleSection];
    const nextPresentedSceneSections = [visibleSection];

    expect(
      areSettingsGraphSubstrateCanaryPresentedSceneSectionsEqual(
        previousPresentedSceneSections,
        nextPresentedSceneSections,
      ),
    ).toBe(true);
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
    sceneBoundsSize: { height: 160, width: 240 },
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
