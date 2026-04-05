import type { SectionElementSizes } from "state/hooks/sectionElementSizes";
import type { GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";
import {
  resolveSettingsGraphSubstrateCanarySectionGeometry,
  type SettingsGraphSubstrateCanarySectionPositionOverride,
} from "./settingsGraphSubstrateCanarySectionGeometry";
import type { GraphRect } from "./viewportTransform";

export type { SettingsGraphSubstrateCanarySectionPositionOverride };

export type SettingsGraphSubstrateCanarySceneSection =
  GraphSubstrateCanarySection & {
    renderedPosition: GraphSubstrateCanarySection["position"];
    resolvedSize: SectionElementSizes[string] | null;
  };

export type SettingsGraphSubstrateCanarySceneSnapshot = {
  boundsSizeBySectionId?: SectionElementSizes;
  sceneBounds: GraphRect | null;
  sections: Array<SettingsGraphSubstrateCanarySceneSection>;
  sectionsById: Map<string, SettingsGraphSubstrateCanarySceneSection>;
};

export function createEmptySettingsGraphSubstrateCanarySceneSnapshot(): SettingsGraphSubstrateCanarySceneSnapshot {
  return {
    boundsSizeBySectionId: {},
    sceneBounds: null,
    sections: [],
    sectionsById: new Map(),
  };
}

export function resolveSettingsGraphSubstrateCanarySceneSnapshot(
  sections: Array<GraphSubstrateCanarySection>,
  sectionElementSizes: SectionElementSizes,
  sectionPositionOverride: SettingsGraphSubstrateCanarySectionPositionOverride,
  draggingSectionId: string | null = null,
  sceneBoundsSizeFallbacks: SectionElementSizes = {},
): SettingsGraphSubstrateCanarySceneSnapshot {
  const boundsSizeBySectionId: SectionElementSizes = {};
  const sceneSections = sections.map((section) => {
    const geometry = resolveSettingsGraphSubstrateCanarySectionGeometry(
      section,
      sectionElementSizes,
      sectionPositionOverride,
    );
    const sceneSection: SettingsGraphSubstrateCanarySceneSection = {
      ...section,
      renderedPosition: geometry.renderedPosition,
      resolvedSize: geometry.resolvedSize,
      tempZIndex: getRenderedSectionTempZIndex(section, draggingSectionId),
    };
    const boundsSize =
      getPositiveSceneBoundsSize(sceneSection.resolvedSize) ??
      getPositiveSceneBoundsSize(sceneBoundsSizeFallbacks[section.sectionId]);
    if (boundsSize) {
      boundsSizeBySectionId[section.sectionId] = boundsSize;
    }
    return sceneSection;
  });

  return {
    boundsSizeBySectionId,
    sceneBounds: getSettingsGraphSubstrateCanarySceneBoundsForSections(
      sceneSections,
      boundsSizeBySectionId,
    ),
    sections: sceneSections,
    sectionsById: new Map(
      sceneSections.map((section) => [section.sectionId, section]),
    ),
  };
}

function getRenderedSectionTempZIndex(
  section: GraphSubstrateCanarySection,
  draggingSectionId: string | null,
) {
  if (draggingSectionId === section.sectionId) {
    return section.zIndex + 1000;
  }
  return section.tempZIndex;
}

export function getSettingsGraphSubstrateCanarySceneBoundsForSections(
  sections: Array<SettingsGraphSubstrateCanarySceneSection>,
  boundsSizeBySectionId: SectionElementSizes = {},
): GraphRect | null {
  if (sections.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const section of sections) {
    const boundsSize =
      getPositiveSceneBoundsSize(section.resolvedSize) ??
      getPositiveSceneBoundsSize(boundsSizeBySectionId[section.sectionId]);
    if (!boundsSize) {
      return null;
    }

    minX = Math.min(minX, section.renderedPosition.x);
    minY = Math.min(minY, section.renderedPosition.y);
    maxX = Math.max(maxX, section.renderedPosition.x + boundsSize.width);
    maxY = Math.max(maxY, section.renderedPosition.y + boundsSize.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function getPositiveSceneBoundsSize(
  size: SectionElementSizes[string] | null | undefined,
) {
  if (
    typeof size?.width === "number" &&
    size.width > 0 &&
    typeof size.height === "number" &&
    size.height > 0
  ) {
    return size;
  }

  return null;
}
