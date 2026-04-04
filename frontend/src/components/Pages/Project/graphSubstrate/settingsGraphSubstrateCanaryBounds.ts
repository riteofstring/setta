import type { Position } from "utils/generatedTypes";
import type { GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";
import type { GraphRect } from "./viewportTransform";

type ObservedElementSizes = Record<string, { width: number; height: number }>;

type SectionPositionOverride = {
  sectionId: string;
  position: Position;
} | null;

function getRenderedSectionPosition(
  section: GraphSubstrateCanarySection,
  sectionPositionOverride: SectionPositionOverride,
) {
  if (sectionPositionOverride?.sectionId === section.sectionId) {
    return sectionPositionOverride.position;
  }
  return section.position;
}

function getRenderedSectionSize(
  section: GraphSubstrateCanarySection,
  observedElementSizes: ObservedElementSizes,
) {
  const observedSize = observedElementSizes[section.sectionId];
  const width = Math.max(section.width ?? 0, observedSize?.width ?? 0);
  const height = Math.max(section.height ?? 0, observedSize?.height ?? 0);

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

export function getSettingsGraphSubstrateCanarySceneBounds(
  sections: Array<GraphSubstrateCanarySection>,
  observedElementSizes: ObservedElementSizes,
  sectionPositionOverride: SectionPositionOverride,
): GraphRect | null {
  if (sections.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const section of sections) {
    const size = getRenderedSectionSize(section, observedElementSizes);
    if (!size) {
      return null;
    }
    const position = getRenderedSectionPosition(
      section,
      sectionPositionOverride,
    );
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x + size.width);
    maxY = Math.max(maxY, position.y + size.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
