import type {
  ObservedSectionElementSize,
  ObservedSectionElementSizes,
} from "state/hooks/observedSectionElementSizes";
import type { Position } from "utils/generatedTypes";
import type { GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";
import type { GraphRect } from "./viewportTransform";

export type SettingsGraphSubstrateCanarySectionPositionOverride = {
  sectionId: string;
  position: Position;
} | null;

export type SettingsGraphSubstrateCanarySceneSection =
  GraphSubstrateCanarySection & {
    renderedPosition: Position;
    resolvedSize: ObservedSectionElementSize | null;
  };

export type SettingsGraphSubstrateCanarySceneSnapshot = {
  sceneBounds: GraphRect | null;
  sections: Array<SettingsGraphSubstrateCanarySceneSection>;
  sectionsById: Map<string, SettingsGraphSubstrateCanarySceneSection>;
};

export function resolveSettingsGraphSubstrateCanarySceneSnapshot(
  sections: Array<GraphSubstrateCanarySection>,
  observedElementSizes: ObservedSectionElementSizes,
  sectionPositionOverride: SettingsGraphSubstrateCanarySectionPositionOverride,
): SettingsGraphSubstrateCanarySceneSnapshot {
  const sceneSections = sections.map((section) => {
    const sceneSection: SettingsGraphSubstrateCanarySceneSection = {
      ...section,
      renderedPosition: getRenderedSectionPosition(
        section,
        sectionPositionOverride,
      ),
      resolvedSize: getResolvedSectionSize(section, observedElementSizes),
    };
    return sceneSection;
  });

  return {
    sceneBounds:
      getSettingsGraphSubstrateCanarySceneBoundsForSections(sceneSections),
    sections: sceneSections,
    sectionsById: new Map(
      sceneSections.map((section) => [section.sectionId, section]),
    ),
  };
}

export function getSettingsGraphSubstrateCanarySceneBoundsForSections(
  sections: Array<SettingsGraphSubstrateCanarySceneSection>,
): GraphRect | null {
  if (sections.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const section of sections) {
    if (!section.resolvedSize) {
      return null;
    }

    minX = Math.min(minX, section.renderedPosition.x);
    minY = Math.min(minY, section.renderedPosition.y);
    maxX = Math.max(
      maxX,
      section.renderedPosition.x + section.resolvedSize.width,
    );
    maxY = Math.max(
      maxY,
      section.renderedPosition.y + section.resolvedSize.height,
    );
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function getRenderedSectionPosition(
  section: GraphSubstrateCanarySection,
  sectionPositionOverride: SettingsGraphSubstrateCanarySectionPositionOverride,
) {
  if (sectionPositionOverride?.sectionId === section.sectionId) {
    return sectionPositionOverride.position;
  }
  return section.position;
}

function getResolvedSectionSize(
  section: GraphSubstrateCanarySection,
  observedElementSizes: ObservedSectionElementSizes,
) {
  const width = section.width ?? 0;
  const height = section.height ?? 0;
  if (width > 0 && height > 0) {
    return { width, height };
  }

  const observedSize = observedElementSizes[section.sectionId];
  if (
    typeof observedSize?.width === "number" &&
    observedSize.width > 0 &&
    typeof observedSize.height === "number" &&
    observedSize.height > 0
  ) {
    return observedSize;
  }

  return null;
}
