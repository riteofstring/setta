import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import {
  areSettingsGraphSubstrateCanaryPresentedSceneSectionsEqual,
  areSettingsGraphSubstrateCanarySectionIdSetsEqual,
  resolveSettingsGraphSubstrateCanaryMountedSectionBodyIds,
  resolveSettingsGraphSubstrateCanaryPresentedSceneSections,
  shouldMountSettingsGraphSubstrateCanarySectionBody,
  shouldPresentSettingsGraphSubstrateCanarySectionShell,
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

  it("keeps the dragged offscreen section in the presented subset", () => {
    const visibleSection = createSceneSection({
      sectionId: "visible-section",
    });
    const draggedOffscreenSection = createSceneSection({
      position: { x: 1480, y: 80 },
      renderedPosition: { x: 1480, y: 80 },
      sectionId: "dragged-offscreen-section",
    });

    const presentedSceneSections =
      resolveSettingsGraphSubstrateCanaryPresentedSceneSections({
        draggingSectionId: "dragged-offscreen-section",
        sceneSections: [visibleSection, draggedOffscreenSection],
        viewport: { x: 0, y: 0, zoom: 1 },
        visibleViewportRect: { x: 0, y: 0, width: 720, height: 480 },
      });

    expect(presentedSceneSections).toEqual([
      visibleSection,
      draggedOffscreenSection,
    ]);
  });

  it("keeps sections without authoritative bounds in the presented subset", () => {
    const visibleSection = createSceneSection({
      sectionId: "visible-section",
    });
    const unmeasuredSection = createSceneSection({
      position: { x: 1480, y: 80 },
      renderedPosition: { x: 1480, y: 80 },
      sceneBoundsSize: null,
      sectionId: "unmeasured-section",
    });

    const presentedSceneSections =
      resolveSettingsGraphSubstrateCanaryPresentedSceneSections({
        draggingSectionId: null,
        sceneSections: [visibleSection, unmeasuredSection],
        viewport: { x: 0, y: 0, zoom: 1 },
        visibleViewportRect: { x: 0, y: 0, width: 720, height: 480 },
      });

    expect(presentedSceneSections).toEqual([visibleSection, unmeasuredSection]);
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

  it("skips body mounting when only a sub-threshold screen sliver is visible", () => {
    const partiallyVisibleSection = createSceneSection({
      position: { x: 301, y: 80 },
      renderedPosition: { x: 301, y: 80 },
      sectionId: "partially-visible-section",
    });

    expect(
      shouldMountSettingsGraphSubstrateCanarySectionBody({
        draggingSectionId: null,
        section: partiallyVisibleSection,
        viewport: { x: 0, y: 0, zoom: 2 },
        visibleViewportRect: { x: 0, y: 0, width: 720, height: 480 },
      }),
    ).toBe(false);
  });

  it("treats shells that only touch the viewport edge as offscreen", () => {
    expect(
      shouldPresentSettingsGraphSubstrateCanarySectionShell({
        draggingSectionId: null,
        section: createSceneSection({
          position: { x: 720, y: 80 },
          renderedPosition: { x: 720, y: 80 },
          sectionId: "edge-touching-section",
        }),
        viewport: { x: 0, y: 0, zoom: 1 },
        visibleViewportRect: { x: 0, y: 0, width: 720, height: 480 },
      }),
    ).toBe(false);
  });

  it("keeps body mounting when the visible world slice still meets the screen threshold", () => {
    const thresholdVisibleSection = createSceneSection({
      position: { x: 300, y: 80 },
      renderedPosition: { x: 300, y: 80 },
      sectionId: "threshold-visible-section",
    });

    expect(
      shouldMountSettingsGraphSubstrateCanarySectionBody({
        draggingSectionId: null,
        section: thresholdVisibleSection,
        viewport: { x: 0, y: 0, zoom: 2 },
        visibleViewportRect: { x: 0, y: 0, width: 720, height: 480 },
      }),
    ).toBe(true);
  });

  it("resolves a stable mounted-body id set from the presented subset", () => {
    const visibleSection = createSceneSection({
      sectionId: "visible-section",
    });
    const tinyVisibleSection = createSceneSection({
      position: { x: 301, y: 80 },
      renderedPosition: { x: 301, y: 80 },
      sectionId: "tiny-visible-section",
    });

    expect(
      resolveSettingsGraphSubstrateCanaryMountedSectionBodyIds({
        draggingSectionId: null,
        presentedSceneSections: [visibleSection, tinyVisibleSection],
        viewport: { x: 0, y: 0, zoom: 2 },
        visibleViewportRect: { x: 0, y: 0, width: 720, height: 480 },
      }),
    ).toEqual(new Set(["visible-section"]));
  });

  it("treats section id sets with the same members as equal", () => {
    expect(
      areSettingsGraphSubstrateCanarySectionIdSetsEqual(
        new Set(["section-a", "section-b"]),
        new Set(["section-b", "section-a"]),
      ),
    ).toBe(true);
    expect(
      areSettingsGraphSubstrateCanarySectionIdSetsEqual(
        new Set(["section-a"]),
        new Set(["section-b"]),
      ),
    ).toBe(false);
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
