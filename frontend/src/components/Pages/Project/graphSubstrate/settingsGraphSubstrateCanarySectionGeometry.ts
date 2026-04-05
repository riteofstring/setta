import type { SectionElementSize } from "state/definitions";
import type { Position } from "utils/generatedTypes";
import type { GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";

export type SettingsGraphSubstrateCanarySectionPositionOverride = {
  sectionId: string;
  position: Position;
} | null;

export type SettingsGraphSubstrateCanaryResolvedSectionGeometry = {
  renderedPosition: Position;
  sceneBoundsSize: SectionElementSize | null;
};

export function resolveSettingsGraphSubstrateCanarySectionGeometry(
  section: GraphSubstrateCanarySection,
  sectionPositionOverride: SettingsGraphSubstrateCanarySectionPositionOverride,
): SettingsGraphSubstrateCanaryResolvedSectionGeometry {
  return {
    renderedPosition: getRenderedSectionPosition(
      section,
      sectionPositionOverride,
    ),
    sceneBoundsSize: getStoredSectionSize(section),
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

function getStoredSectionSize(
  section: Pick<GraphSubstrateCanarySection, "width" | "height">,
) {
  const width = section.width ?? 0;
  const height = section.height ?? 0;
  if (width > 0 && height > 0) {
    return { width, height };
  }

  return null;
}
