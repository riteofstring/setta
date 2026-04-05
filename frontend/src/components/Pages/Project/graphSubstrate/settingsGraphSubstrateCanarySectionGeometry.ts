import type { SectionElementSize } from "state/definitions";
import type { SectionElementSizes } from "state/hooks/sectionElementSizes";
import type { Position } from "utils/generatedTypes";
import type { GraphSubstrateCanarySection } from "./settingsGraphSubstrateCanaryModel";

export type SettingsGraphSubstrateCanarySectionPositionOverride = {
  sectionId: string;
  position: Position;
} | null;

export type SettingsGraphSubstrateCanaryResolvedSectionGeometry = {
  renderedPosition: Position;
  resolvedSize: SectionElementSize | null;
};

export function resolveSettingsGraphSubstrateCanarySectionGeometry(
  section: GraphSubstrateCanarySection,
  sectionElementSizes: SectionElementSizes,
  sectionPositionOverride: SettingsGraphSubstrateCanarySectionPositionOverride,
): SettingsGraphSubstrateCanaryResolvedSectionGeometry {
  return {
    renderedPosition: getRenderedSectionPosition(
      section,
      sectionPositionOverride,
    ),
    resolvedSize: getResolvedSectionSize(section, sectionElementSizes),
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
  sectionElementSizes: SectionElementSizes,
) {
  const layoutSize = getLayoutSectionSize(section);
  if (section.positionAndSizeLocked && layoutSize) {
    return layoutSize;
  }

  const observedSize = sectionElementSizes[section.sectionId];
  if (
    typeof observedSize?.width === "number" &&
    observedSize.width > 0 &&
    typeof observedSize.height === "number" &&
    observedSize.height > 0
  ) {
    return observedSize;
  }

  return layoutSize;
}

function getLayoutSectionSize(
  section: Pick<GraphSubstrateCanarySection, "width" | "height">,
) {
  const width = section.width ?? 0;
  const height = section.height ?? 0;
  if (width > 0 && height > 0) {
    return { width, height };
  }

  return null;
}
