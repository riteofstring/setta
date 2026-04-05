import type { SectionElementSize } from "state/definitions";
import type { SectionElementSizes } from "state/hooks/sectionElementSizes";
import type { Position } from "utils/generatedTypes";
import {
  getSettingsGraphSubstrateCanarySectionSizeAuthority,
  type GraphSubstrateCanarySection,
} from "./settingsGraphSubstrateCanaryModel";

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

export function shouldObserveSettingsGraphSubstrateCanarySectionElementSize(
  section: Pick<
    GraphSubstrateCanarySection,
    "height" | "positionAndSizeLocked" | "sizeAuthority" | "width"
  >,
) {
  const sizeAuthority =
    getSettingsGraphSubstrateCanarySectionSizeAuthority(section);

  if (sizeAuthority === "layout") {
    return false;
  }

  if (sizeAuthority === "sectionModel") {
    return getStoredSectionSize(section) === null;
  }

  return true;
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
  const sectionSize = getStoredSectionSize(section);
  const sizeAuthority =
    getSettingsGraphSubstrateCanarySectionSizeAuthority(section);

  if (
    sizeAuthority === "layout" ||
    (sizeAuthority === "sectionModel" && sectionSize)
  ) {
    return sectionSize;
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

  return sectionSize;
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
